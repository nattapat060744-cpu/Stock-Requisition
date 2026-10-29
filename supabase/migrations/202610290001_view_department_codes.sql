BEGIN;
CREATE TABLE IF NOT EXISTS public.department_code_secrets(id boolean PRIMARY KEY DEFAULT true CHECK(id),encryption_key text NOT NULL);
ALTER TABLE public.department_code_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.department_code_secrets FROM PUBLIC,anon,authenticated;
INSERT INTO public.department_code_secrets VALUES(true,encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.department_codes ADD COLUMN IF NOT EXISTS encrypted_code bytea;
CREATE OR REPLACE FUNCTION public.set_department_code(p_branch_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h text:=encode(extensions.digest(trim(coalesce(p_code,'')),'sha256'),'hex');k text;
BEGIN
 IF length(trim(coalesce(p_code,''))) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสต้องมี 12 ถึง 100 ตัวอักษร';END IF;
 IF EXISTS(SELECT 1 FROM public.system_admin_access WHERE code_hash=h) THEN RAISE EXCEPTION 'รหัสแผนกต้องไม่ซ้ำกับรหัสแอดมินกลาง';END IF;
 SELECT encryption_key INTO STRICT k FROM public.department_code_secrets WHERE id;
 INSERT INTO public.department_codes(branch_id,code_hash,encrypted_code) VALUES(p_branch_id,h,extensions.pgp_sym_encrypt(trim(p_code),k,'cipher-algo=aes256,compress-algo=0')) ON CONFLICT(branch_id) DO UPDATE SET code_hash=excluded.code_hash,encrypted_code=excluded.encrypted_code;
 DELETE FROM public.department_sessions WHERE branch_id=p_branch_id AND NOT is_admin;
END $$;
REVOKE ALL ON FUNCTION public.set_department_code(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_department_codes(p_token text) RETURNS TABLE(branch_id uuid,branch_name text,department_code text,has_code boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.department_sessions%ROWTYPE;k text;
BEGIN
 SELECT * INTO s FROM public.department_sessions WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'การเข้าใช้งานหมดอายุ กรุณาเข้าใช้งานใหม่';END IF;
 IF NOT s.is_admin AND NOT EXISTS(SELECT 1 FROM public.system_access_settings WHERE stock_branch_id=s.branch_id) THEN RAISE EXCEPTION 'เฉพาะแอดมินกลางหรือแผนกสต็อกเท่านั้นที่ดูรหัสแผนกได้';END IF;
 SELECT encryption_key INTO STRICT k FROM public.department_code_secrets WHERE id;
 RETURN QUERY SELECT b.id,b.name,CASE WHEN c.encrypted_code IS NOT NULL THEN extensions.pgp_sym_decrypt(c.encrypted_code,k) ELSE NULL END,c.branch_id IS NOT NULL FROM public.branches b LEFT JOIN public.department_codes c ON c.branch_id=b.id ORDER BY b.name;
END $$;
REVOKE ALL ON FUNCTION public.get_department_codes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_department_codes(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.department_login(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid;t text;e timestamptz:=now()+interval '12 hours';h text;master boolean:=false;k text;
BEGIN
 IF length(coalesce(p_code,'')) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสเข้าใช้งานไม่ถูกต้อง';END IF;
 h:=encode(extensions.digest(trim(p_code),'sha256'),'hex');
 SELECT EXISTS(SELECT 1 FROM public.system_admin_access WHERE code_hash=h) INTO master;
 IF NOT master THEN SELECT branch_id INTO b FROM public.department_codes WHERE code_hash=h;IF NOT FOUND THEN RAISE EXCEPTION 'รหัสเข้าใช้งานไม่ถูกต้อง';END IF;END IF;
 IF NOT master THEN
  SELECT encryption_key INTO STRICT k FROM public.department_code_secrets WHERE id;
  UPDATE public.department_codes SET encrypted_code=extensions.pgp_sym_encrypt(trim(p_code),k,'cipher-algo=aes256,compress-algo=0') WHERE branch_id=b AND code_hash=h AND encrypted_code IS NULL;
 END IF;
 t:=encode(extensions.gen_random_bytes(32),'hex');DELETE FROM public.department_sessions WHERE expires_at<=now();
 INSERT INTO public.department_sessions(token_hash,branch_id,expires_at,is_admin) VALUES(encode(extensions.digest(t,'sha256'),'hex'),b,e,master);
 RETURN public.department_session_info(t)||jsonb_build_object('token',t);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
