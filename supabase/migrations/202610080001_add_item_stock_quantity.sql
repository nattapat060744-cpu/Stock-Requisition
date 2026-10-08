-- Existing products stay NULL until their actual stock is entered.
BEGIN;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS stock_quantity integer;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_stock_quantity_nonnegative' AND conrelid = 'public.items'::regclass) THEN
  ALTER TABLE public.items ADD CONSTRAINT items_stock_quantity_nonnegative CHECK (stock_quantity >= 0);
 END IF;
END $$;
COMMENT ON COLUMN public.items.stock_quantity IS 'Manual stock in the product unit; NULL means not yet counted.';
COMMIT;
