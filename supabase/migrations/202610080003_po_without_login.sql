-- Run if the original login-required PO migration was already applied.
BEGIN;
-- The user explicitly approved internal use without login, including reading,
-- creating POs and receiving goods to increase stock by anyone accessing the site.
-- App roles can only read tables; writes go through validated RPC functions.
ALTER TABLE public.purchase_orders ALTER COLUMN created_user_id DROP NOT NULL;
ALTER TABLE public.purchase_receipts ALTER COLUMN received_user_id DROP NOT NULL;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['purchase_orders','purchase_order_lines','purchase_receipts','purchase_receipt_lines'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS po_admin_access ON public.%I',tbl);
  EXECUTE format('DROP POLICY IF EXISTS po_app_access ON public.%I',tbl);
  EXECUTE format('DROP POLICY IF EXISTS po_public_read ON public.%I',tbl);
  EXECUTE format('CREATE POLICY po_public_read ON public.%I FOR SELECT TO anon,authenticated USING (true)',tbl);
 END LOOP;
END $$;
REVOKE ALL ON public.purchase_orders,public.purchase_order_lines,public.purchase_receipts,public.purchase_receipt_lines FROM anon,authenticated;
GRANT SELECT ON public.purchase_orders,public.purchase_order_lines,public.purchase_receipts,public.purchase_receipt_lines TO anon,authenticated;
DROP POLICY IF EXISTS po_admin_item_read ON public.items;
DROP POLICY IF EXISTS po_admin_item_stock ON public.items;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
 p_request_id uuid, p_po_number text, p_supplier text, p_order_date date,
 p_created_by text, p_note text, p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing_id uuid; order_id uuid; row_data jsonb; item_row public.items%ROWTYPE;
 qty integer; factor integer; price numeric; unit_name text; seen uuid[] := '{}';
BEGIN
 -- Serialize retries of the same request even if their first response was lost.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT id INTO existing_id FROM purchase_orders WHERE request_id=p_request_id;
 IF existing_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id=existing_id
   AND po_number=trim(p_po_number) AND supplier=trim(p_supplier) AND order_date=p_order_date
   AND created_by=trim(p_created_by) AND note=coalesce(p_note,'')) OR
   (SELECT jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',ordered_quantity,'purchase_unit',purchase_unit,'units_per_pack',units_per_pack,'unit_price',unit_price) ORDER BY item_id)
     FROM purchase_order_lines WHERE purchase_order_id=existing_id) IS DISTINCT FROM
   (SELECT jsonb_agg(value ORDER BY value->>'item_id') FROM jsonb_array_elements(p_lines)) THEN
   RAISE EXCEPTION 'คำขอนี้บันทึกแล้วแต่ข้อมูลเปลี่ยน กรุณาปิดหน้าต่างและตรวจ PO ในรายการก่อน';
  END IF;
  RETURN existing_id;
 END IF;
 IF coalesce(trim(p_po_number),'')='' OR coalesce(trim(p_supplier),'')='' OR coalesce(trim(p_created_by),'')='' OR p_order_date IS NULL THEN
  RAISE EXCEPTION 'กรุณากรอกเลข PO ผู้ขาย วันที่ และผู้สั่งซื้อ';
 END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'รายการสินค้าไม่ถูกต้อง'; END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'PO ต้องมีสินค้า 1 ถึง 500 รายการ'; END IF;
 INSERT INTO purchase_orders(request_id,po_number,supplier,order_date,created_by,note)
 VALUES(p_request_id,trim(p_po_number),trim(p_supplier),p_order_date,trim(p_created_by),coalesce(p_note,'')) RETURNING id INTO order_id;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO item_row FROM items WHERE id=(row_data->>'item_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสินค้าในคลัง'; END IF;
  IF item_row.id=ANY(seen) THEN RAISE EXCEPTION 'สินค้าใน PO ซ้ำกัน'; END IF;
  seen := array_append(seen,item_row.id);
  IF (row_data->>'quantity') !~ '^[0-9]+$' OR (row_data->>'units_per_pack') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'จำนวนและตัวคูณต้องเป็นจำนวนเต็ม'; END IF;
  qty := (row_data->>'quantity')::integer;
  factor := (row_data->>'units_per_pack')::integer;
  price := (row_data->>'unit_price')::numeric;
  unit_name := trim(row_data->>'purchase_unit');
  IF qty IS NULL OR factor IS NULL OR price IS NULL OR price='NaN'::numeric OR price<0 OR price>999999999999.99 OR round(price,2)<>price OR coalesce(unit_name,'')='' THEN
   RAISE EXCEPTION 'จำนวน หน่วยซื้อ หรือราคาซื้อไม่ถูกต้อง';
  END IF;
  INSERT INTO purchase_order_lines(purchase_order_id,item_id,item_name,product_code,stock_unit,purchase_unit,ordered_quantity,units_per_pack,unit_price)
  VALUES(order_id,item_row.id,item_row.name,coalesce(item_row.product_code,''),item_row.unit,unit_name,qty,factor,price);
 END LOOP;
 RETURN order_id;
END $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
 p_request_id uuid, p_order_id uuid, p_received_by text, p_note text, p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE existing_receipt public.purchase_receipts%ROWTYPE; receipt_id uuid;
 row_data jsonb; po_line public.purchase_order_lines%ROWTYPE; qty integer; added bigint;
 stock integer; seen uuid[] := '{}'; order_status text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing_receipt FROM purchase_receipts WHERE request_id=p_request_id;
 IF FOUND THEN
  IF existing_receipt.purchase_order_id<>p_order_id THEN RAISE EXCEPTION 'เลขอ้างอิงการรับซ้ำกับ PO อื่น'; END IF;
  IF existing_receipt.received_by<>trim(p_received_by) OR existing_receipt.note<>coalesce(p_note,'') OR
   (SELECT jsonb_agg(jsonb_build_object('line_id',purchase_order_line_id,'quantity',quantity) ORDER BY purchase_order_line_id)
    FROM purchase_receipt_lines WHERE receipt_id=existing_receipt.id) IS DISTINCT FROM
   (SELECT jsonb_agg(value ORDER BY value->>'line_id') FROM jsonb_array_elements(p_lines)) THEN
    RAISE EXCEPTION 'คำขอรับนี้บันทึกแล้วแต่ข้อมูลเปลี่ยน กรุณาปิดและเปิด PO เพื่อตรวจประวัติก่อน';
  END IF;
  RETURN existing_receipt.id;
 END IF;
 SELECT status INTO order_status FROM purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบ PO'; END IF;
 IF order_status='received' THEN RAISE EXCEPTION 'PO นี้รับครบแล้ว'; END IF;
 IF coalesce(trim(p_received_by),'')='' THEN RAISE EXCEPTION 'กรุณากรอกชื่อผู้รับสินค้า'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'รายการรับไม่ถูกต้อง'; END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'กรุณาระบุจำนวนรับอย่างน้อยหนึ่งรายการ'; END IF;
 INSERT INTO purchase_receipts(request_id,purchase_order_id,received_by,note)
 VALUES(p_request_id,p_order_id,trim(p_received_by),coalesce(p_note,'')) RETURNING id INTO receipt_id;
 -- Lock products in deterministic order to avoid deadlocks across different POs.
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_lines) ORDER BY value->>'line_id' LOOP
  SELECT * INTO po_line FROM purchase_order_lines WHERE id=(row_data->>'line_id')::uuid AND purchase_order_id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'รายการไม่ได้อยู่ใน PO นี้'; END IF;
  IF po_line.id=ANY(seen) THEN RAISE EXCEPTION 'รายการรับซ้ำ'; END IF;
  seen := array_append(seen,po_line.id);
 END LOOP;
 PERFORM i.id FROM items i JOIN purchase_order_lines l ON l.item_id=i.id
 WHERE l.purchase_order_id=p_order_id ORDER BY i.id FOR UPDATE OF i;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT * INTO po_line FROM purchase_order_lines WHERE id=(row_data->>'line_id')::uuid AND purchase_order_id=p_order_id FOR UPDATE;
  IF (row_data->>'quantity') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'จำนวนรับต้องเป็นจำนวนเต็ม'; END IF;
  qty := (row_data->>'quantity')::integer;
  IF qty IS NULL OR qty<=0 OR qty>po_line.ordered_quantity-po_line.received_quantity THEN
   RAISE EXCEPTION 'จำนวนรับของ % เกินยอดค้างรับหรือไม่ถูกต้อง',po_line.item_name;
  END IF;
  SELECT stock_quantity INTO stock FROM items WHERE id=po_line.item_id AND unit=po_line.stock_unit;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสินค้า ไม่มีสิทธิ์ หรือหน่วยนับเปลี่ยน กรุณาตรวจข้อมูลสินค้าในคลัง'; END IF;
  IF stock IS NULL THEN RAISE EXCEPTION 'กรุณาระบุยอดคงเหลือเริ่มต้นของ % ในหน้าคลังก่อนรับของ',po_line.item_name; END IF;
  added := qty::bigint * po_line.units_per_pack;
  IF stock::bigint+added>2147483647 THEN RAISE EXCEPTION 'ยอดคงเหลือเกินขอบเขต'; END IF;
  UPDATE items SET stock_quantity=stock+added::integer WHERE id=po_line.item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไขยอดสินค้า'; END IF;
  UPDATE purchase_order_lines SET received_quantity=received_quantity+qty WHERE id=po_line.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไขยอดรับ'; END IF;
  INSERT INTO purchase_receipt_lines(receipt_id,purchase_order_line_id,quantity,stock_added)
  VALUES(receipt_id,po_line.id,qty,added::integer);
 END LOOP;
 UPDATE purchase_orders SET status=CASE WHEN NOT EXISTS(
  SELECT 1 FROM purchase_order_lines WHERE purchase_order_id=p_order_id AND received_quantity<ordered_quantity
 ) THEN 'received' ELSE 'partial' END WHERE id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไข PO'; END IF;
 RETURN receipt_id;
END $$;
REVOKE ALL ON FUNCTION public.create_purchase_order(uuid,text,text,date,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid,text,text,date,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,uuid,text,text,jsonb) TO anon,authenticated;
COMMIT;
