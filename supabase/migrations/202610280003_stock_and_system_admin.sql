BEGIN;
CREATE TABLE IF NOT EXISTS public.system_admin_access(id boolean PRIMARY KEY DEFAULT true CHECK(id),code_hash text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS public.system_access_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),stock_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT);
ALTER TABLE public.system_admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_access_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_admin_access,public.system_access_settings FROM PUBLIC,anon,authenticated;
INSERT INTO public.system_access_settings(id,stock_branch_id) SELECT true,id FROM public.branches WHERE name='สต็อก' AND (SELECT count(*) FROM public.branches WHERE name='สต็อก')=1 ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.department_sessions ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE public.department_sessions ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='department_session_branch_required' AND conrelid='public.department_sessions'::regclass) THEN ALTER TABLE public.department_sessions ADD CONSTRAINT department_session_branch_required CHECK(is_admin OR branch_id IS NOT NULL);END IF;END $$;
CREATE OR REPLACE FUNCTION public.set_system_admin_code(p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h text:=encode(extensions.digest(trim(coalesce(p_code,'')),'sha256'),'hex');
BEGIN
 IF length(trim(coalesce(p_code,''))) NOT BETWEEN 16 AND 100 THEN RAISE EXCEPTION 'รหัสแอดมินกลางต้องยาว 16 ถึง 100 ตัวอักษร';END IF;
 IF EXISTS(SELECT 1 FROM public.department_codes WHERE code_hash=h) THEN RAISE EXCEPTION 'รหัสแอดมินกลางต้องไม่ซ้ำกับรหัสแผนก';END IF;
 INSERT INTO public.system_admin_access(id,code_hash) VALUES(true,h) ON CONFLICT(id) DO UPDATE SET code_hash=excluded.code_hash;
 DELETE FROM public.department_sessions WHERE is_admin;
END $$;
REVOKE ALL ON FUNCTION public.set_system_admin_code(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_department_code(p_branch_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h text:=encode(extensions.digest(trim(coalesce(p_code,'')),'sha256'),'hex');
BEGIN
 IF length(trim(coalesce(p_code,''))) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสต้องมี 12 ถึง 100 ตัวอักษร';END IF;
 IF EXISTS(SELECT 1 FROM public.system_admin_access WHERE code_hash=h) THEN RAISE EXCEPTION 'รหัสแผนกต้องไม่ซ้ำกับรหัสแอดมินกลาง';END IF;
 INSERT INTO public.department_codes(branch_id,code_hash) VALUES(p_branch_id,h) ON CONFLICT(branch_id) DO UPDATE SET code_hash=excluded.code_hash;
 DELETE FROM public.department_sessions WHERE branch_id=p_branch_id AND NOT is_admin;
END $$;
REVOKE ALL ON FUNCTION public.set_department_code(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.department_session_info(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.department_sessions%ROWTYPE;bn text;role_name text;
BEGIN
 SELECT * INTO s FROM public.department_sessions WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'รหัสหมดอายุ กรุณาเข้าใช้งานใหม่';END IF;
 SELECT name INTO bn FROM public.branches WHERE id=s.branch_id;
 role_name:=CASE WHEN s.is_admin THEN 'admin' WHEN EXISTS(SELECT 1 FROM public.system_access_settings WHERE stock_branch_id=s.branch_id) THEN 'stock' ELSE 'department' END;
 RETURN jsonb_build_object('branch_id',s.branch_id,'branch_name',coalesce(bn,'แอดมินกลาง'),'expires_at',s.expires_at,'role',role_name);
END $$;
CREATE OR REPLACE FUNCTION public.department_login(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b uuid;t text;e timestamptz:=now()+interval '12 hours';h text;master boolean:=false;
BEGIN
 IF length(coalesce(p_code,'')) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'รหัสเข้าใช้งานไม่ถูกต้อง';END IF;
 h:=encode(extensions.digest(trim(p_code),'sha256'),'hex');
 SELECT EXISTS(SELECT 1 FROM public.system_admin_access WHERE code_hash=h) INTO master;
 IF NOT master THEN SELECT branch_id INTO b FROM public.department_codes WHERE code_hash=h;IF NOT FOUND THEN RAISE EXCEPTION 'รหัสเข้าใช้งานไม่ถูกต้อง';END IF;END IF;
 t:=encode(extensions.gen_random_bytes(32),'hex');DELETE FROM public.department_sessions WHERE expires_at<=now();
 INSERT INTO public.department_sessions(token_hash,branch_id,expires_at,is_admin) VALUES(encode(extensions.digest(t,'sha256'),'hex'),b,e,master);
 RETURN public.department_session_info(t)||jsonb_build_object('token',t);
END $$;
CREATE OR REPLACE FUNCTION public.admin_select_department(p_token text,p_branch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.department_sessions%ROWTYPE;t text;
BEGIN
 SELECT * INTO s FROM public.department_sessions WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND expires_at>now() AND is_admin FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'เฉพาะแอดมินกลางเท่านั้นที่เลือกเข้าแผนกอื่นได้';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id) THEN RAISE EXCEPTION 'ไม่พบแผนกที่เลือก';END IF;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.department_sessions(token_hash,branch_id,expires_at,is_admin) VALUES(encode(extensions.digest(t,'sha256'),'hex'),p_branch_id,s.expires_at,true);
 DELETE FROM public.department_sessions WHERE token_hash=s.token_hash;
 RETURN public.department_session_info(t)||jsonb_build_object('token',t);
END $$;
REVOKE ALL ON FUNCTION public.admin_select_department(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_select_department(text,uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_set_department_code(p_admin_key text,p_branch_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h text:=encode(extensions.digest(trim(coalesce(p_admin_key,'')),'sha256'),'hex');
BEGIN
 IF length(coalesce(p_admin_key,'')) NOT BETWEEN 12 AND 100 OR NOT (
 EXISTS(SELECT 1 FROM public.system_admin_access WHERE code_hash=h) OR
 EXISTS(SELECT 1 FROM public.department_codes c JOIN public.system_access_settings s ON s.stock_branch_id=c.branch_id WHERE c.code_hash=h)
 ) THEN RAISE EXCEPTION 'ต้องใช้รหัสแผนกสต็อก หรือรหัสแอดมินกลางเท่านั้น';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id) THEN RAISE EXCEPTION 'ไม่พบแผนกนี้ กรุณาโหลดหน้าใหม่';END IF;
 PERFORM public.set_department_code(p_branch_id,p_code);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_department_code(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_department_code(text,uuid,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
