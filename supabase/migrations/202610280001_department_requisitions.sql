BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS admin_note text NOT NULL DEFAULT '';
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS requested_items jsonb;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS submission_payload jsonb;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.requisitions r SET branch_id=b.id FROM public.branches b WHERE r.branch_id IS NULL AND r.branch_name=b.name AND (SELECT count(*) FROM public.branches x WHERE x.name=b.name)=1;
CREATE INDEX IF NOT EXISTS requisitions_branch_created_idx ON public.requisitions(branch_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.department_codes(branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,code_hash text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS public.department_sessions(token_hash text PRIMARY KEY,branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.requisition_changes(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,requisition_id uuid NOT NULL REFERENCES public.requisitions(id),created_at timestamptz NOT NULL DEFAULT now(),actor text NOT NULL,before_data jsonb,after_data jsonb NOT NULL);
ALTER TABLE public.department_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.department_codes,public.department_sessions,public.requisition_changes FROM anon,authenticated;
GRANT SELECT ON public.requisition_changes TO anon,authenticated;
DROP POLICY IF EXISTS requisition_changes_read ON public.requisition_changes;
CREATE POLICY requisition_changes_read ON public.requisition_changes FOR SELECT TO anon,authenticated USING(true);
-- Admin pages in this existing internal app remain accessible without login.
-- Department codes scope employee workflows, not the existing public admin area.
CREATE OR REPLACE FUNCTION public.set_department_code(p_branch_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF length(trim(coalesce(p_code,''))) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสต้องมี 12 ถึง 100 ตัวอักษร'; END IF;
 INSERT INTO public.department_codes(branch_id,code_hash) VALUES(p_branch_id,encode(extensions.digest(trim(p_code),'sha256'),'hex')) ON CONFLICT(branch_id) DO UPDATE SET code_hash=excluded.code_hash;
 DELETE FROM public.department_sessions WHERE branch_id=p_branch_id;
END $$;
REVOKE ALL ON FUNCTION public.set_department_code(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.department_login(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.branches%ROWTYPE;t text;e timestamptz:=now()+interval '12 hours';
BEGIN
 IF length(coalesce(p_code,'')) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสแผนกไม่ถูกต้อง'; END IF;
 SELECT x.* INTO b FROM public.branches x JOIN public.department_codes c ON c.branch_id=x.id WHERE c.code_hash=encode(extensions.digest(trim(p_code),'sha256'),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION 'รหัสแผนกไม่ถูกต้อง'; END IF;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 DELETE FROM public.department_sessions WHERE expires_at<=now();
 INSERT INTO public.department_sessions VALUES(encode(extensions.digest(t,'sha256'),'hex'),b.id,e);
 RETURN jsonb_build_object('token',t,'branch_id',b.id,'branch_name',b.name,'expires_at',e);
END $$;
CREATE OR REPLACE FUNCTION public.department_session_branch(p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid;
BEGIN
 SELECT branch_id INTO b FROM public.department_sessions WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND expires_at>now();
 IF b IS NULL THEN RAISE EXCEPTION 'รหัสแผนกหมดอายุ กรุณาเข้าใช้งานใหม่'; END IF;RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.department_session_branch(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.department_session_info(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid:=public.department_session_branch(p_token);
BEGIN RETURN (SELECT jsonb_build_object('branch_id',b,'branch_name',x.name,'expires_at',s.expires_at) FROM public.branches x JOIN public.department_sessions s ON s.branch_id=x.id WHERE x.id=b AND s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex'));END $$;
CREATE OR REPLACE FUNCTION public.department_logout(p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DELETE FROM public.department_sessions WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex'); $$;
CREATE OR REPLACE FUNCTION public.requisition_document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT to_jsonb(r)||jsonb_build_object('requisition_details',coalesce((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('items',jsonb_build_object('name',i.name,'unit',i.unit,'image_url',i.image_url)) ORDER BY d.id) FROM public.requisition_details d LEFT JOIN public.items i ON i.id=d.item_id WHERE d.requisition_id=r.id),'[]'::jsonb)) FROM public.requisitions r WHERE r.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.requisition_document(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.check_requisition_lines(p_lines jsonb,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l jsonb;
BEGIN
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'รายการสินค้าไม่ถูกต้อง';END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'กรุณาเลือกสินค้า 1 ถึง 500 รายการ';END IF;
 IF (SELECT count(DISTINCT x->>'item_id') FROM jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'มีสินค้าซ้ำ กรุณารวมจำนวน';END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(l->'quantity') IS DISTINCT FROM 'number' OR (l->>'quantity')!~'^[0-9]+$' OR (l->>'quantity')::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 2,147,483,647';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.items WHERE id=(l->>'item_id')::uuid AND (NOT p_active OR is_active)) THEN RAISE EXCEPTION 'สินค้าไม่มีอยู่หรือปิดให้เบิกแล้ว';END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.check_requisition_lines(jsonb,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_department_requisition(p_token text,p_id uuid,p_version integer,p_requester text,p_zone text,p_sender text,p_note text,p_lines jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid:=public.department_session_branch(p_token);bn text;r public.requisitions%ROWTYPE;before_doc jsonb;l jsonb;price numeric;
BEGIN
 SELECT name INTO bn FROM public.branches WHERE id=b;
 IF length(trim(coalesce(p_requester,''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_note,''))>2000 OR length(coalesce(p_sender,''))>200 THEN RAISE EXCEPTION 'กรุณากรอกชื่อผู้เบิกและหมายเหตุให้ถูกต้อง';END IF;
 IF EXISTS(SELECT 1 FROM public.zones WHERE branch_id=b) THEN
  IF NOT EXISTS(SELECT 1 FROM public.zones WHERE branch_id=b AND name=p_zone) THEN RAISE EXCEPTION 'กรุณาเลือกโซนของแผนก';END IF;
 ELSE p_zone:=NULL;END IF;
 IF (bn='จัดเรียง' OR EXISTS(SELECT 1 FROM public.zones WHERE branch_id=b)) AND length(trim(coalesce(p_sender,'')))=0 THEN RAISE EXCEPTION 'กรุณากรอกหัวหน้า / รองหัวหน้าผู้ส่งใบเบิก';END IF;
 PERFORM public.check_requisition_lines(p_lines,true);
 -- Serialize retries for new IDs as well as updates; repeated successful create is idempotent.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO r FROM public.requisitions WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF r.branch_id IS DISTINCT FROM b THEN RAISE EXCEPTION 'ไม่พบใบเบิกของแผนกนี้';END IF;
  IF p_version IS NULL THEN
   IF r.submission_payload=jsonb_build_object('requester',trim(p_requester),'zone',p_zone,'sender',nullif(trim(p_sender),''),'note',coalesce(p_note,''),'lines',p_lines) THEN RETURN p_id;END IF;
   RAISE EXCEPTION 'เลขอ้างอิงซ้ำ กรุณาโหลดใหม่';
  END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'ใบเบิกนี้ตรวจสอบแล้ว ไม่สามารถแก้ไขได้';END IF;
  IF r.version<>p_version THEN RAISE EXCEPTION 'ใบเบิกถูกแก้ไขระหว่างเปิด กรุณาโหลดใหม่';END IF;
  before_doc:=public.requisition_document(p_id);
  UPDATE public.requisitions SET requester_name=trim(p_requester),zone_name=p_zone,sender_name=nullif(trim(p_sender),''),note=coalesce(p_note,''),version=version+1,updated_at=now() WHERE id=p_id;
  DELETE FROM public.requisition_details WHERE requisition_id=p_id;
 ELSE
  IF p_version IS NOT NULL THEN RAISE EXCEPTION 'ไม่พบใบเบิก';END IF;
  INSERT INTO public.requisitions(id,branch_id,branch_name,requester_name,zone_name,sender_name,note,status,total_price,submission_payload) VALUES(p_id,b,bn,trim(p_requester),p_zone,nullif(trim(p_sender),''),coalesce(p_note,''),'pending',0,jsonb_build_object('requester',trim(p_requester),'zone',p_zone,'sender',nullif(trim(p_sender),''),'note',coalesce(p_note,''),'lines',p_lines));
 END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT coalesce((SELECT d.price_at_time FROM jsonb_to_recordset(before_doc->'requisition_details') AS d(item_id uuid,price_at_time numeric) WHERE d.item_id=(l->>'item_id')::uuid LIMIT 1),i.price,0) INTO price FROM public.items i WHERE i.id=(l->>'item_id')::uuid;
  INSERT INTO public.requisition_details(requisition_id,item_id,quantity,price_at_time) VALUES(p_id,(l->>'item_id')::uuid,(l->>'quantity')::integer,price);
 END LOOP;
 UPDATE public.requisitions SET total_price=(SELECT sum(quantity*price_at_time) FROM public.requisition_details WHERE requisition_id=p_id) WHERE id=p_id;
 INSERT INTO public.requisition_changes(requisition_id,actor,before_data,after_data) VALUES(p_id,CASE WHEN before_doc IS NULL THEN 'department:create' ELSE 'department:edit' END,before_doc,public.requisition_document(p_id));
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION public.review_requisition(p_id uuid,p_version integer,p_status text,p_admin_note text,p_lines jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.requisitions%ROWTYPE;before_doc jsonb;l jsonb;price numeric;
BEGIN
 SELECT * INTO r FROM public.requisitions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบใบเบิก';END IF;
 IF p_version IS NULL OR r.version<>p_version THEN RAISE EXCEPTION 'ใบเบิกถูกแก้ไขระหว่างเปิด กรุณาโหลดใหม่';END IF;
 IF p_status NOT IN ('approved','rejected','pending') OR p_status IS NULL OR length(coalesce(p_admin_note,''))>2000 THEN RAISE EXCEPTION 'ข้อมูลการตรวจสอบไม่ถูกต้อง';END IF;
 IF p_status='pending' THEN RAISE EXCEPTION 'ใบเบิกที่ตรวจสอบแล้วไม่สามารถเปิดแก้ไขใหม่ได้';END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'ใบเบิกนี้ตรวจสอบไปแล้ว';END IF;
 before_doc:=public.requisition_document(p_id);
 IF p_status='approved' THEN
  PERFORM public.check_requisition_lines(p_lines,false);
  DELETE FROM public.requisition_details WHERE requisition_id=p_id;
  FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   -- Keep the original price snapshot for unchanged products; replacement uses current catalog price.
   SELECT coalesce((SELECT d.price_at_time FROM jsonb_to_recordset(before_doc->'requisition_details') AS d(item_id uuid,price_at_time numeric) WHERE d.item_id=(l->>'item_id')::uuid LIMIT 1),i.price,0) INTO price FROM public.items i WHERE i.id=(l->>'item_id')::uuid;
   INSERT INTO public.requisition_details(requisition_id,item_id,quantity,price_at_time) VALUES(p_id,(l->>'item_id')::uuid,(l->>'quantity')::integer,price);
  END LOOP;
 END IF;
 UPDATE public.requisitions SET status=p_status,admin_note=coalesce(p_admin_note,''),requested_items=before_doc->'requisition_details',version=version+1,updated_at=now(),total_price=CASE WHEN p_status='rejected' THEN 0 ELSE (SELECT sum(quantity*price_at_time) FROM public.requisition_details WHERE requisition_id=p_id) END WHERE id=p_id;
 INSERT INTO public.requisition_changes(requisition_id,actor,before_data,after_data) VALUES(p_id,'admin:'||p_status,before_doc,public.requisition_document(p_id));
END $$;
CREATE OR REPLACE FUNCTION public.department_requisitions(p_token text,p_name text DEFAULT '',p_zone text DEFAULT '',p_status text DEFAULT '',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid:=public.department_session_branch(p_token);result jsonb;
BEGIN
 IF p_page IS NULL OR p_page<1 OR p_page>100000 THEN RAISE EXCEPTION 'เลขหน้าไม่ถูกต้อง';END IF;
 WITH filtered AS (SELECT r.id,r.status,r.created_at FROM public.requisitions r WHERE r.branch_id=b AND (coalesce(p_name,'')='' OR strpos(lower(r.requester_name),lower(p_name))>0) AND (coalesce(p_zone,'')='' OR r.zone_name=p_zone) AND (p_from IS NULL OR r.created_at>=p_from::timestamp AT TIME ZONE 'Asia/Bangkok') AND (p_to IS NULL OR r.created_at<(p_to+1)::timestamp AT TIME ZONE 'Asia/Bangkok')),
 paged AS (SELECT * FROM filtered WHERE coalesce(p_status,'')='' OR status=p_status ORDER BY created_at DESC,id LIMIT 20 OFFSET (p_page-1)*20)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(public.requisition_document(id) ORDER BY created_at DESC,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered WHERE coalesce(p_status,'')='' OR status=p_status),'counts',jsonb_build_object('all',(SELECT count(*) FROM filtered),'pending',(SELECT count(*) FROM filtered WHERE status='pending'),'approved',(SELECT count(*) FROM filtered WHERE status='approved'),'rejected',(SELECT count(*) FROM filtered WHERE status='rejected'))) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.department_requisition(p_token text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid:=public.department_session_branch(p_token);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.requisitions WHERE id=p_id AND branch_id=b) THEN RAISE EXCEPTION 'ไม่พบใบเบิกของแผนกนี้';END IF;
 RETURN public.requisition_document(p_id);
END $$;
-- Only transactional functions write requisitions. Existing anonymous admin read access is retained.
REVOKE INSERT,UPDATE,DELETE ON public.requisitions,public.requisition_details FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.department_login(text),public.department_session_info(text),public.department_logout(text),public.save_department_requisition(text,uuid,integer,text,text,text,text,jsonb),public.review_requisition(uuid,integer,text,text,jsonb),public.department_requisitions(text,text,text,text,date,date,integer),public.department_requisition(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.department_login(text),public.department_session_info(text),public.department_logout(text),public.save_department_requisition(text,uuid,integer,text,text,text,text,jsonb),public.review_requisition(uuid,integer,text,text,jsonb),public.department_requisitions(text,text,text,text,date,date,integer),public.department_requisition(text,uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
