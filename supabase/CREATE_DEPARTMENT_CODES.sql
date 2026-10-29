-- Run AFTER 202610280001_department_requisitions.sql in the correct Supabase SQL Editor.
-- Generates one unique shared code for each department without a code yet.
-- Save the result securely and distribute only to that department. Codes are shown only here.
WITH generated AS MATERIALIZED (
 SELECT b.id,b.name,'SPB-'||upper(encode(extensions.gen_random_bytes(10),'hex')) AS code
 FROM public.branches b WHERE NOT EXISTS(SELECT 1 FROM public.department_codes c WHERE c.branch_id=b.id)
),inserted AS (
 INSERT INTO public.department_codes(branch_id,code_hash)
 SELECT id,encode(extensions.digest(code,'sha256'),'hex') FROM generated
 ON CONFLICT(branch_id) DO NOTHING RETURNING branch_id
)
SELECT g.name AS department,g.code AS department_code FROM generated g JOIN inserted i ON i.branch_id=g.id ORDER BY g.name;
