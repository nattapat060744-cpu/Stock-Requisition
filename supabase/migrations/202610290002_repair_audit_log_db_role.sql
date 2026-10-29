-- Fix confirmed error: [42703] column "db_role" of relation "audit_log" does not exist.
-- Keep existing audit records and triggers; allow the existing audit writer to record its role.
BEGIN;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS db_role text;
NOTIFY pgrst, 'reload schema';
COMMIT;
