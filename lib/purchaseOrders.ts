export interface POItem {
  id: string; product_code: string | null; name: string; unit: string; stock_quantity: number | null;
}
export interface POLineDraft {
  key: string; item_id: string; imported_code: string; quantity: string;
  purchase_unit: string; units_per_pack: string; unit_price: string;
}
export interface ValidPOLine {
  item_id: string; quantity: number; purchase_unit: string; units_per_pack: number; unit_price: number;
}
const MAX = 2147483647;
export const numberValue = (value: unknown) => {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return NaN;
  return Number(text.replaceAll(',', ''));
};
export function validatePOLines(lines: POLineDraft[], items: POItem[]) {
  const errors: string[] = [];
  const result: ValidPOLine[] = [];
  const seen = new Set<string>();
  if (!lines.length || lines.length > 500) errors.push('ต้องมีสินค้า 1 ถึง 500 รายการ');
  lines.forEach((line, index) => {
    const label = 'แถว ' + (index + 1) + ': ';
    const item = items.find((row) => row.id === line.item_id);
    const quantity = numberValue(line.quantity), factor = numberValue(line.units_per_pack), price = numberValue(line.unit_price);
    if (!item) errors.push(label + 'กรุณาจับคู่สินค้าในคลัง (' + line.imported_code + ')');
    if (seen.has(line.item_id) && line.item_id) errors.push(label + 'สินค้าซ้ำ กรุณารวมจำนวนไว้ในรายการเดียว');
    seen.add(line.item_id);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX) errors.push(label + 'จำนวนตามเอกสารต้องเป็นจำนวนเต็มมากกว่า 0');
    if (!Number.isSafeInteger(factor) || factor <= 0 || factor > MAX || quantity * factor > MAX) errors.push(label + 'ตัวคูณหน่วยหรือจำนวนรวมไม่ถูกต้อง');
    if (!Number.isFinite(price) || price < 0 || price > 999999999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.001) errors.push(label + 'ราคาต้องไม่ติดลบและมีทศนิยมไม่เกิน 2 ตำแหน่ง');
    if (!line.purchase_unit.trim()) errors.push(label + 'กรุณาระบุหน่วยรับ');
    result.push({ item_id: line.item_id, quantity, units_per_pack: factor, unit_price: price, purchase_unit: line.purchase_unit.trim() });
  });
  return { errors, lines: result };
}
const aliases: Record<string, string[]> = {
  code: ['รหัสสินค้า','product_code','code'],
  quantity: ['จำนวน','จำนวนตามเอกสาร','จำนวนสั่ง','quantity','qty'],
  price: ['มูลค่า / หน่วย','มูลค่าต่อหน่วย','มูลค่าต่อหน่วยรับ','ราคาซื้อ','ราคาต่อหน่วย','unit_price','price'],
  unit: ['หน่วย','หน่วยรับ','หน่วยซื้อ','purchase_unit','unit'],
  factor: ['จำนวนใน 1 หน่วย','ตัวคูณหน่วย','จำนวนต่อหน่วยรับ','จำนวนต่อหน่วยซื้อ','units_per_pack','factor'],
};
const normalize = (text: unknown) => String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
const numericText = (value: unknown) => Number.isFinite(numberValue(value)) ? String(numberValue(value)) : String(value ?? '');
export function importPORows(rows: unknown[][], items: POItem[]) {
  if (rows.length < 2) throw new Error('ไฟล์ต้องมีหัวตารางและรายการสินค้า');
  if (rows.length > 501) throw new Error('นำเข้าได้ไม่เกิน 500 แถวต่อ PO');
  const headers = rows[0].map(normalize);
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.findIndex((header) => values.map(normalize).includes(header))]));
  for (const key of ['code','quantity','price']) if (columns[key] < 0) throw new Error('ต้องมีคอลัมน์ รหัสสินค้า จำนวน และมูลค่าต่อหน่วย');
  return rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== '')).map((row, index): POLineDraft => {
    const code = String(row[columns.code] ?? '').trim();
    const matches = items.filter((item) => item.product_code && normalize(item.product_code) === normalize(code));
    const item = matches.length === 1 ? matches[0] : undefined;
    return { key: 'import-' + index, item_id: item?.id ?? '', imported_code: code,
      quantity: numericText(row[columns.quantity]), unit_price: numericText(row[columns.price]),
      purchase_unit: String(columns.unit >= 0 ? row[columns.unit] ?? item?.unit ?? '' : item?.unit ?? ''),
      units_per_pack: numericText(columns.factor >= 0 ? row[columns.factor] ?? '' : 1) };
  });
}

export function searchPOItems(items: POItem[], query: string) {
 const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(item => words.every(word => ((item.product_code || '') + ' ' + item.name).toLowerCase().includes(word)))
 .sort((a,b) => Number((b.product_code || '').toLowerCase().startsWith(query.trim().toLowerCase())) - Number((a.product_code || '').toLowerCase().startsWith(query.trim().toLowerCase())));
}
