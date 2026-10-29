BEGIN;
-- Department-code management requires its own admin key; never expose the owner-only setter.
CREATE TABLE IF NOT EXISTS public.department_code_admin (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), key_hash text NOT NULL
);
ALTER TABLE public.department_code_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.department_code_admin FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_department_code_admin_key(p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF length(trim(coalesce(p_key,''))) NOT BETWEEN 16 AND 200 THEN RAISE EXCEPTION 'รหัสผู้ดูแลต้องยาว 16 ถึง 200 ตัวอักษร';END IF;
 INSERT INTO public.department_code_admin(id,key_hash) VALUES(true,encode(extensions.digest(trim(p_key),'sha256'),'hex')) ON CONFLICT(id) DO UPDATE SET key_hash=excluded.key_hash;
END $$;
REVOKE ALL ON FUNCTION public.set_department_code_admin_key(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_set_department_code(p_admin_key text,p_branch_id uuid,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF length(coalesce(p_admin_key,'')) NOT BETWEEN 16 AND 200 OR NOT EXISTS(SELECT 1 FROM public.department_code_admin WHERE id AND key_hash=encode(extensions.digest(trim(coalesce(p_admin_key,'')),'sha256'),'hex')) THEN RAISE EXCEPTION 'รหัสผู้ดูแลไม่ถูกต้อง หรือยังไม่ได้ตั้งค่ารหัสผู้ดูแล';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id) THEN RAISE EXCEPTION 'ไม่พบแผนกนี้ กรุณาโหลดหน้าใหม่';END IF;
 PERFORM public.set_department_code(p_branch_id,p_code);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_department_code(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_department_code(text,uuid,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
