BEGIN;
-- Keep the original one-argument login compatible; the new overload has no default arguments.
CREATE OR REPLACE FUNCTION public.department_login(p_code text,p_remember boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;t text;
BEGIN
 result:=public.department_login(p_code);
 t:=result->>'token';
 IF coalesce(p_remember,false) THEN
  UPDATE public.department_sessions SET expires_at='infinity'::timestamptz WHERE token_hash=encode(extensions.digest(t,'sha256'),'hex');
  result:=public.department_session_info(t)||jsonb_build_object('token',t);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.department_login(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.department_login(text,boolean) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
