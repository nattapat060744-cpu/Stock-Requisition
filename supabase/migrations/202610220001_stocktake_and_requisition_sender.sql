BEGIN;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS sender_name text;
CREATE TABLE IF NOT EXISTS public.stocktakes (
 id uuid PRIMARY KEY, counted_by text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.stocktake_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stocktake_id uuid NOT NULL REFERENCES public.stocktakes(id),item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
 product_code text,item_name text NOT NULL,unit text NOT NULL,before_quantity integer,counted_quantity integer NOT NULL CHECK(counted_quantity>=0)
);
ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stocktake_read ON public.stocktakes;
CREATE POLICY stocktake_read ON public.stocktakes FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS stocktake_lines_read ON public.stocktake_lines;
CREATE POLICY stocktake_lines_read ON public.stocktake_lines FOR SELECT TO anon,authenticated USING(true);
REVOKE ALL ON public.stocktakes,public.stocktake_lines FROM anon,authenticated;
GRANT SELECT ON public.stocktakes,public.stocktake_lines TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.confirm_stocktake(p_request_id uuid,p_counted_by text,p_note text,p_lines jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE line jsonb; product public.items%ROWTYPE; existing public.stocktakes%ROWTYPE; counted integer; expected integer;
BEGIN
 IF p_request_id IS NULL OR p_counted_by IS NULL OR length(trim(p_counted_by)) NOT BETWEEN 1 AND 200 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'กรุณาระบุชื่อผู้ตรวจนับและหมายเหตุให้ถูกต้อง'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'รายการตรวจนับไม่ถูกต้อง'; END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'ตรวจนับได้ครั้งละ 1 ถึง 500 รายการ'; END IF;
 IF (SELECT count(DISTINCT entry->>'item_id') FROM jsonb_array_elements(p_lines) entry)<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'สินค้าซ้ำหรือไม่มีรหัสอ้างอิง'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.stocktakes WHERE id=p_request_id;
 IF FOUND THEN
  IF existing.payload IS DISTINCT FROM p_lines OR existing.counted_by IS DISTINCT FROM trim(p_counted_by) OR existing.note IS DISTINCT FROM coalesce(p_note,'') THEN RAISE EXCEPTION 'รหัสบันทึกซ้ำกับข้อมูลอื่น'; END IF;
  RETURN existing.id;
 END IF;
 INSERT INTO public.stocktakes(id,counted_by,note,payload) VALUES(p_request_id,trim(p_counted_by),coalesce(p_note,''),p_lines);
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) ORDER BY value->>'item_id' LOOP
  IF jsonb_typeof(line->'counted') IS DISTINCT FROM 'number' OR (line->>'counted')!~'^[0-9]+$' OR (line->>'counted')::numeric>2147483647 THEN RAISE EXCEPTION 'ยอดนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647'; END IF;
  counted:=(line->>'counted')::integer;
  IF NOT(line ? 'expected') OR jsonb_typeof(line->'expected') NOT IN ('null','number') THEN RAISE EXCEPTION 'ไม่พบยอดตั้งต้นสำหรับตรวจสอบ'; END IF;
  IF jsonb_typeof(line->'expected')='number' AND ((line->>'expected')!~'^[0-9]+$' OR (line->>'expected')::numeric>2147483647) THEN RAISE EXCEPTION 'ยอดตั้งต้นไม่ถูกต้อง'; END IF;
  expected:=(line->>'expected')::integer;
  SELECT * INTO product FROM public.items WHERE id=(line->>'item_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'สินค้าไม่มีในคลังแล้ว'; END IF;
  IF product.unit IS DISTINCT FROM (line->>'expected_unit') THEN RAISE EXCEPTION 'หน่วยนับของ % เปลี่ยน กรุณาตรวจนับใหม่',product.name; END IF;
  IF product.stock_quantity IS DISTINCT FROM expected THEN RAISE EXCEPTION 'ยอดคลังของ % เปลี่ยนระหว่างตรวจนับ กรุณาโหลดและตรวจนับใหม่',product.name; END IF;
  INSERT INTO public.stocktake_lines(stocktake_id,item_id,product_code,item_name,unit,before_quantity,counted_quantity) VALUES(p_request_id,product.id,product.product_code,product.name,product.unit,product.stock_quantity,counted);
  UPDATE public.items SET stock_quantity=counted WHERE id=product.id;
 END LOOP;
 RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.confirm_stocktake(uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stocktake(uuid,text,text,jsonb) TO anon,authenticated;
COMMIT;
