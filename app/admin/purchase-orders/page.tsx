'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import POProductPicker from '@/components/POProductPicker';
import { supabase } from '@/lib/supabase';
import { importPORows, numberValue, validatePOLines, type POItem, type POLineDraft } from '@/lib/purchaseOrders';

interface Order {
 id: string; po_number: string; supplier: string; order_date: string; created_by: string; note: string;
 status: 'open' | 'partial' | 'received'; created_at: string;
}
interface OrderLine {
 id: string; item_id: string; item_name: string; product_code: string; stock_unit: string; purchase_unit: string;
 ordered_quantity: number; received_quantity: number; units_per_pack: number; unit_price: number;
}
interface Receipt {
 id: string; received_by: string; note: string; created_at: string;
 purchase_receipt_lines: { purchase_order_line_id: string; quantity: number; stock_added: number }[];
}
const input = 'w-full rounded-xl border border-slate-200 bg-brand-50/30 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60';
const button = 'rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed';
const secondary = 'rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-900 hover:bg-brand-50 disabled:opacity-50';
const statusStyle = {
 open: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', accent: 'border-l-amber-400', icon: '⏳', hint: 'ยังไม่ได้รับของ' },
 partial: { badge: 'border-sky-200 bg-sky-50 text-sky-800', dot: 'bg-sky-500', accent: 'border-l-sky-400', icon: '📦', hint: 'รับแล้วบางส่วน' },
 received: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', accent: 'border-l-emerald-400', icon: '✅', hint: 'ปิดรายการแล้ว' },
} as const;
const money = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusText = { open: 'รอรับสินค้า', partial: 'รับบางส่วน', received: 'รับครบแล้ว' };
const dateText = (value: string) => new Date(value).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
function StatusBadge({ status }: { status: Order['status'] }) {
 const style = statusStyle[status];
 return <span className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ' + style.badge}><span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + style.dot} />{statusText[status]}</span>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
 return <label className="block space-y-1.5"><span className="text-xs font-bold text-brand-800">{label}</span>{children}</label>;
}
function Modal({ title, onClose, busy, children, footer, pinned, fillBody=false }: { title: string; onClose: () => void; busy: boolean; children: ReactNode; footer: ReactNode; pinned?:ReactNode; fillBody?:boolean }) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
 return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-label={title}
  className="m-auto w-[calc(100%-2rem)] max-w-[1600px] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50">
  <div className={"flex max-h-[calc(100dvh-2rem)] flex-col "+(fillBody?"h-[calc(100dvh-2rem-2px)]":"")}>
   <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-brand-700 p-5 text-white">
    <h2 className="text-lg font-black">{title}</h2><button disabled={busy} onClick={onClose} aria-label="ปิดหน้าต่าง" className="h-8 w-8 rounded-full bg-white/15 text-xl disabled:opacity-50">×</button>
   </div>
   {pinned&&<div data-po-pinned className="max-h-[50dvh] shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-5 py-4 sm:px-6">{pinned}</div>}
   <div data-po-body className={fillBody?"flex min-h-0 flex-1 flex-col overflow-hidden p-5 sm:p-6":"min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"}>{children}</div>
   <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-brand-50/40 p-4">{footer}</div>
  </div>
 </dialog>;
}
async function readPurchaseData() {
 const [products, purchases] = await Promise.all([
  supabase.from('items').select('id, product_code, name, unit, stock_quantity').order('name'),
  supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(500),
 ]);
 if (products.error) throw products.error;
 if (purchases.error) throw purchases.error;
 return { items: products.data ?? [], orders: purchases.data ?? [] };
}
export default function PurchaseOrdersPage() {
 const [items, setItems] = useState<POItem[]>([]);
 const [orders, setOrders] = useState<Order[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const busyRef = useRef(false);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [search, setSearch] = useState('');
 const [filter, setFilter] = useState('all');
 const [editing, setEditing] = useState(false);
 const [number, setNumber] = useState('');
 const [supplier, setSupplier] = useState('');
 const [orderDate, setOrderDate] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }));
 const [creator, setCreator] = useState('');
 const [note, setNote] = useState('');
 const [drafts, setDrafts] = useState<POLineDraft[]>([]);
 const [formErrors, setFormErrors] = useState<string[]>([]);
 const [importName, setImportName] = useState('');
 const requestRef = useRef('');
 const fileRef = useRef<HTMLInputElement>(null);
 const [selected, setSelected] = useState<Order | null>(null);
 const [lines, setLines] = useState<OrderLine[]>([]);
 const [receipts, setReceipts] = useState<Receipt[]>([]);
 const [quantities, setQuantities] = useState<Record<string, string>>({});
 const [receiver, setReceiver] = useState('');
 const [receiptNote, setReceiptNote] = useState('');
 const [detailLoading, setDetailLoading] = useState(false);
 const receiptRequest = useRef('');

 const load = useCallback(async () => {
  try { const data = await readPurchaseData(); setItems(data.items); setOrders(data.orders); }
  catch (err) { setError(message(err)); } finally { setLoading(false); }
 }, []);
 useEffect(() => {
  let alive = true;
  void readPurchaseData().then((data) => {
   if (alive) { setItems(data.items); setOrders(data.orders); }
  }).catch((err) => { if (alive) setError(message(err)); })
   .finally(() => { if (alive) setLoading(false); });
  return () => { alive = false; };
 }, []);

 const begin = () => {
  setNumber(''); setSupplier(''); setCreator(''); setNote(''); setDrafts([]); setImportName(''); setFormErrors([]);
  setOrderDate(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }));
  requestRef.current = crypto.randomUUID(); setEditing(true);
 };
 const patch = (key: string, update: Partial<POLineDraft>) => setDrafts((prev) => prev.map((line) => line.key === key ? { ...line, ...update } : line));
 const addLine = () => setDrafts((prev) => [...prev, { key: crypto.randomUUID(), item_id: '', imported_code: '', quantity: '1', purchase_unit: '', units_per_pack: '1', unit_price: '0' }]);
 const draftTotal = drafts.reduce((sum, line) => {
  const quantity = numberValue(line.quantity), price = numberValue(line.unit_price);
  return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
 }, 0);

 const importFile = async (file?: File) => {
  if (!file) return;
  setFormErrors([]);
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setFormErrors(['รองรับเฉพาะ Excel .xlsx .xls และ CSV']); return; }
  if (file.size > 5 * 1024 * 1024) { setFormErrors(['ไฟล์ต้องไม่เกิน 5 MB']); return; }
  if (drafts.length && !window.confirm('นำเข้าไฟล์แทนรายการที่กรอกอยู่ทั้งหมด?')) return;
  busyRef.current = true; setBusy(true);
  try {
   const XLSX = await import('xlsx');
   const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
   const worksheet = workbook.Sheets[workbook.SheetNames[0]];
   if (!worksheet || XLSX.utils.decode_range(worksheet['!ref'] || 'A1').e.r > 500) throw new Error('ไฟล์ต้องมีไม่เกิน 500 รายการในชีตแรก');
   const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
   const imported = importPORows(rows, items);
   if (!imported.length) throw new Error('ไม่พบรายการสินค้าในไฟล์');
   setDrafts(imported); setImportName(file.name);
   setFormErrors(validatePOLines(imported, items).errors);
  } catch (err) { setFormErrors([message(err)]); } finally { busyRef.current = false; setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
 };
 const downloadTemplate = async () => {
  try {
   const XLSX = await import('xlsx');
   const item = items.find((row) => row.product_code);
   const workbook = XLSX.utils.book_new();
   const sheet = XLSX.utils.aoa_to_sheet([
    ['รหัสสินค้า','จำนวน','มูลค่า / หน่วย','หน่วย','จำนวนใน 1 หน่วย'],
    [item?.product_code || 'SPB001', 10, 0, item?.unit || 'ชิ้น', 1],
   ]);
   sheet['!cols'] = [{ wch: 22 },{ wch: 15 },{ wch: 18 },{ wch: 18 },{ wch: 20 }];
   XLSX.utils.book_append_sheet(workbook, sheet, 'รายการ PO');
   XLSX.writeFile(workbook, 'Requisition-PO-template.xlsx');
  } catch (err) { setFormErrors([message(err)]); }
 };
 const saveOrder = async () => {
  if (busyRef.current) return;
  const validation = validatePOLines(drafts, items);
  if (!number.trim() || !supplier.trim() || !creator.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) validation.errors.unshift('กรุณากรอกเลข PO แหล่งที่มา วันที่ และชื่อผู้บันทึก');
  setFormErrors(validation.errors);
  if (validation.errors.length) return;
  busyRef.current = true; setBusy(true);
  try {
   const { error: saveError } = await supabase.rpc('create_purchase_order', {
    p_request_id: requestRef.current, p_po_number: number.trim(), p_supplier: supplier.trim(),
    p_order_date: orderDate, p_created_by: creator.trim(), p_note: note.trim(), p_lines: validation.lines,
   });
   if (saveError) throw saveError;
   setEditing(false); setNotice('บันทึก PO แล้ว จำนวนในคลังจะเพิ่มเมื่อรับของจริง'); setError('');
   await load();
  } catch (err) { setFormErrors([message(err)]); } finally { busyRef.current = false; setBusy(false); }
 };
 const fetchDetail = async (orderId: string) => {
  const [detail, history, latest] = await Promise.all([
   supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', orderId).order('item_name'),
   supabase.from('purchase_receipts').select('*, purchase_receipt_lines(purchase_order_line_id, quantity, stock_added)').eq('purchase_order_id', orderId).order('created_at', { ascending: false }),
   supabase.from('purchase_orders').select('*').eq('id', orderId).single(),
  ]);
  if (detail.error) throw detail.error; if (history.error) throw history.error; if (latest.error) throw latest.error;
  setLines(detail.data ?? []); setReceipts(history.data ?? []); setSelected(latest.data);
 };
 const openOrder = async (order: Order) => {
  if (busyRef.current) return;
  setSelected(order); setLines([]); setReceipts([]); setQuantities({}); setReceiver(''); setReceiptNote('');
  setFormErrors([]); setDetailLoading(true); receiptRequest.current = crypto.randomUUID();
  try { await fetchDetail(order.id); } catch (err) { setFormErrors([message(err)]); } finally { setDetailLoading(false); }
 };
 const receive = async () => {
  if (!selected || busyRef.current) return;
  const errors: string[] = [];
  const rows = lines.flatMap((line) => {
   const raw = quantities[line.id] ?? ''; if (!raw.trim() || numberValue(raw) === 0) return [];
   const quantity = numberValue(raw);
   if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > line.ordered_quantity - line.received_quantity) errors.push(line.item_name + ': จำนวนรับต้องเป็นจำนวนเต็มไม่เกินยอดค้างรับ');
   return [{ line_id: line.id, quantity }];
  });
  if (!receiver.trim()) errors.push('กรุณากรอกชื่อผู้รับสินค้า');
  if (!rows.length) errors.push('กรุณากรอกจำนวนรับอย่างน้อยหนึ่งรายการ');
  setFormErrors(errors); if (errors.length) return;
  busyRef.current = true; setBusy(true);
  try {
   const { error: receiveError } = await supabase.rpc('receive_purchase_order', {
    p_request_id: receiptRequest.current, p_order_id: selected.id, p_received_by: receiver.trim(), p_note: receiptNote.trim(), p_lines: rows,
   });
   if (receiveError) throw receiveError;
   receiptRequest.current = crypto.randomUUID(); setQuantities({}); setReceiptNote('');
   setNotice('รับสินค้าและเพิ่มจำนวนในคลังเรียบร้อยแล้ว'); setFormErrors([]); setError('');
   await fetchDetail(selected.id); await load();
  } catch (err) { setFormErrors([message(err)]); } finally { busyRef.current = false; setBusy(false); }
 };
 const visible = orders.filter((order) => (filter === 'all' || order.status === filter) && (order.po_number + ' ' + order.supplier).toLowerCase().includes(search.toLowerCase()));
 const errorsView = formErrors.length > 0 && <div role="alert" className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><ul className="list-disc pl-5">{formErrors.map((text, index) => <li key={index}>{text}</li>)}</ul></div>;

 const counts = { all: orders.length, open: orders.filter((o) => o.status === 'open').length, partial: orders.filter((o) => o.status === 'partial').length, received: orders.filter((o) => o.status === 'received').length };
 const steps = ['บันทึกเอกสาร', 'ตรวจรายการ', 'รับสินค้า', 'เพิ่มจำนวนในคลัง'];
 const hasFilter = search.trim() !== '' || filter !== 'all';

 return <div className="min-h-screen bg-canvas px-3 py-6 text-slate-800 sm:px-6">
  <div className="mx-auto max-w-[1600px] space-y-5">
   <section className="relative overflow-hidden rounded-2xl bg-brand-700 p-5 text-white shadow-sm sm:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
    <div className="relative flex flex-wrap items-start justify-between gap-5">
     <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-3">
       <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-2xl">📋</span>
       <div><h1 className="text-xl font-black leading-tight">นำเข้าสินค้า / รับเข้าคลัง</h1><p className="text-xs font-medium text-brand-100">จัดการใบนำเข้า (PO) และรับสินค้าเข้าคลังทีละขั้นตอน</p></div>
      </div>
      <ol aria-label="ขั้นตอนการทำงาน" className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
       {steps.map((step, index) => <li key={step} className="flex items-center gap-1.5"><span className="flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1 pr-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-brand-700">{index + 1}</span>{step}</span>{index < steps.length - 1 && <span aria-hidden="true" className="text-brand-200">→</span>}</li>)}
      </ol>
     </div>
     <div className="flex flex-wrap gap-2">
      <a href="/admin/reports/purchase-orders" className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">📊 รายงาน PO</a>
      <button className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50" disabled={loading} onClick={() => { setError(''); setLoading(true); void load(); }}>🔄 รีเฟรช</button>
      <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-brand-700 shadow-sm hover:bg-brand-50" onClick={begin}>+ บันทึกนำเข้าสินค้า</button>
     </div>
    </div>
   </section>
   {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
   {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><span>✅ {notice}</span><button aria-label="ปิดข้อความ" className="h-7 w-7 rounded-full text-lg hover:bg-emerald-100" onClick={() => setNotice('')}>×</button></div>}
   <div role="group" aria-label="กรอง PO ตามสถานะ" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {([{ key: 'all', label: 'PO ทั้งหมด', icon: '🧾', hint: 'ล่าสุด 500 ใบ', accent: 'border-l-brand-700' }, ...(['open', 'partial', 'received'] as const).map((key) => ({ key, label: statusText[key], icon: statusStyle[key].icon, hint: statusStyle[key].hint, accent: statusStyle[key].accent }))]).map((card) => {
     const active = filter === card.key;
     return <button key={card.key} type="button" aria-pressed={active} onClick={() => setFilter(card.key)} className={'rounded-2xl border border-l-4 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-700 sm:p-5 ' + card.accent + ' ' + (active ? 'border-brand-300 ring-2 ring-brand-700/70' : 'border-slate-200')}>
      <span className="flex items-center justify-between text-sm font-bold text-slate-600">{card.label}<span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-base">{card.icon}</span></span>
      <span className="mt-2 block text-3xl font-black tabular-nums text-brand-700">{counts[card.key as keyof typeof counts]}<span className="ml-1.5 text-sm font-semibold text-slate-400">ใบ</span></span>
      <span className="mt-0.5 block text-xs font-medium text-slate-400">{card.hint}</span>
     </button>;
    })}
   </div>
   <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
     <div className="relative w-full sm:max-w-sm"><span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span><input aria-label="ค้นหา PO หรือแหล่งที่มา" placeholder="ค้นหาเลข PO / แหล่งที่มา..." value={search} onChange={(event) => setSearch(event.target.value)} className={input + ' pl-10'} /></div>
     <select aria-label="สถานะ PO" className={input + ' sm:max-w-48'} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
     <p className="ml-auto text-xs font-semibold text-slate-500">แสดง <b className="text-brand-700">{visible.length}</b> จาก {orders.length} ใบ{hasFilter && <button type="button" className="ml-3 font-black text-brand-700 hover:underline" onClick={() => { setSearch(''); setFilter('all'); }}>ล้างตัวกรอง</button>}</p>
    </div>
    {loading ? <div aria-busy="true" role="status" className="space-y-px p-4">{[0, 1, 2, 3, 4].map((row) => <div key={row} className="h-14 animate-pulse rounded-lg bg-brand-50/60" />)}<span className="sr-only">กำลังโหลด...</span></div> : <div className="overflow-x-auto"><table className="w-full min-w-190 text-left text-sm"><thead className="border-b border-slate-200 bg-brand-50/70 text-xs font-bold text-brand-900"><tr>{['ลำดับ', 'เลข PO', 'แหล่งที่มา', 'วันที่เอกสาร', 'ผู้บันทึก', 'สถานะ', ''].map((text, i) => <th key={i} className={i === 0 ? 'w-16 px-4 py-3.5 text-center' : 'px-4 py-3.5'}>{text}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map((order, index) => <tr key={order.id} className="transition-colors hover:bg-brand-50/40">
     <td className="px-4 py-4 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</td>
     <td className="px-4 py-4 font-black text-brand-700">{order.po_number}</td>
     <td className="px-4 py-4 font-medium text-slate-700">{order.supplier}</td>
     <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-600">{dateText(order.order_date + 'T12:00:00+07:00')}</td>
     <td className="px-4 py-4"><span className="flex items-center gap-2"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-800">{(order.created_by || '?').trim().slice(0, 1)}</span><span className="text-slate-700">{order.created_by}</span></span></td>
     <td className="px-4 py-4"><StatusBadge status={order.status} /></td>
     <td className="px-4 py-4 text-right">{order.status === 'received'
      ? <button className="rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-900 hover:bg-brand-50" onClick={() => void openOrder(order)}>ดูประวัติ</button>
      : <button className="rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-800" onClick={() => void openOrder(order)}>รับสินค้า →</button>}</td>
    </tr>)}{!visible.length && <tr><td colSpan={7} className="px-4 py-16 text-center"><span aria-hidden="true" className="text-4xl">📭</span><p className="mt-2 font-bold text-slate-500">{hasFilter ? 'ไม่พบ PO ตามเงื่อนไขที่เลือก' : 'ยังไม่มี PO'}</p><p className="mt-1 text-xs text-slate-400">{hasFilter ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'กด “+ บันทึกนำเข้าสินค้า” เพื่อสร้าง PO ใบแรก'}</p></td></tr>}</tbody></table></div>}
    <p className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">แสดง PO ล่าสุดไม่เกิน 500 ใบ</p>
   </section>
  </div>
  {editing && <Modal title="บันทึกนำเข้าสินค้า (PO)" busy={busy} onClose={() => setEditing(false)} footer={<><span className="mr-auto text-sm font-bold text-brand-900">รวม {money(draftTotal)} ฿</span><button disabled={busy} className={secondary} onClick={() => setEditing(false)}>ยกเลิก</button><button disabled={busy} className={button} onClick={() => void saveOrder()}>{busy ? 'กำลังบันทึก...' : 'บันทึก PO'}</button></>} fillBody pinned={<>
   <fieldset disabled={busy} className="min-w-0 space-y-4">
    {errorsView}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
     <Field label="เลข PO *"><input maxLength={100} value={number} onChange={(event) => setNumber(event.target.value)} className={input} placeholder="PO-2026-001" /></Field>
     <Field label="แหล่งที่มา *"><input placeholder="เช่น คลังกลาง หรือชื่อผู้ส่งสินค้า" maxLength={200} value={supplier} onChange={(event) => setSupplier(event.target.value)} className={input} /></Field>
     <Field label="วันที่เอกสาร *"><input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} className={input} /></Field>
     <Field label="ชื่อผู้บันทึก *"><input value={creator} onChange={(event) => setCreator(event.target.value)} className={input} /></Field>
    </div>
    <Field label="หมายเหตุ"><input value={note} onChange={(event) => setNote(event.target.value)} className={input} /></Field>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-brand-50/40 p-4">
     <button className={secondary} onClick={addLine}>+ เพิ่มรายการเอง</button><button className={button} onClick={() => fileRef.current?.click()}>นำเข้าจาก Excel</button><button className="text-sm font-bold text-brand-700 underline" onClick={() => void downloadTemplate()}>ดาวน์โหลดไฟล์ตัวอย่าง</button>
     <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(event) => void importFile(event.target.files?.[0])} />
     <p className="w-full text-xs text-slate-500">1 ไฟล์ต่อ 1 PO · อ่านชีตแรก · คอลัมน์: รหัสสินค้า · จำนวน · มูลค่า / หน่วย · หน่วย · จำนวนใน 1 หน่วย · สูงสุด 500 รายการ</p>
     {importName && <p className="text-xs font-bold text-brand-800">นำเข้า: {importName} — ตรวจและแก้ไขรายการด้านล่างก่อนบันทึก</p>}
    </div>
    <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">จำนวน = จำนวนที่ระบุในเอกสาร · หน่วย = เช่น กล่อง / รีม / ชิ้น · จำนวนใน 1 หน่วย = ของในแต่ละกล่องหรือแพ็ก (รับเป็นชิ้นให้ใส่ 1)</div>
   </fieldset>
  </>}>
   <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <div data-po-lines role="region" aria-label="รายการสินค้าใน PO" tabIndex={0} className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-275 text-left text-sm"><thead className="sticky top-0 z-10 bg-brand-50 text-brand-800"><tr>{['ลำดับ','สินค้าในคลัง','จำนวน','หน่วย','จำนวนใน 1 หน่วย','มูลค่า / หน่วย','รวม',''].map((label, i) => <th key={i} className={i === 0 ? 'w-14 p-2 text-center' : 'p-2'}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{drafts.map((line, index) => {
     const item = items.find((row) => row.id === line.item_id);
     return <tr key={line.key} className="[&>td]:align-top [&_input]:h-11 [&_select]:h-11">
      <td className="w-14 p-2 text-center"><span className="flex h-11 items-center justify-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span></td>
      <td className="w-[34%] min-w-80 p-2"><POProductPicker items={items} value={line.item_id} disabled={busy} onChange={(item) => patch(line.key, { item_id: item.id, purchase_unit: line.purchase_unit || item.unit, units_per_pack: line.units_per_pack || '1' })} />{line.imported_code && <p className="mt-1 text-xs text-slate-500">รหัสจากไฟล์: {line.imported_code}</p>}{!item && <p className="text-xs text-red-600">กรุณาเลือกสินค้าให้ตรงกับรายการ</p>}</td>
      <td className="w-28 p-2"><input aria-label="จำนวน" type="number" min="1" step="1" className={input} value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} /></td>
      <td className="w-28 p-2"><input aria-label="หน่วย" className={input} value={line.purchase_unit} onChange={(event) => patch(line.key, { purchase_unit: event.target.value })} /></td>
      <td className="w-36 p-2"><input aria-label="จำนวนใน 1 หน่วย" type="number" min="1" step="1" className={input} value={line.units_per_pack} onChange={(event) => patch(line.key, { units_per_pack: event.target.value })} /><p className="mt-1 text-xs text-slate-500">1 {line.purchase_unit || 'หน่วย'} = {line.units_per_pack || '0'} {item?.unit || 'หน่วยคลัง'}</p></td>
      <td className="w-36 p-2"><input aria-label="มูลค่า / หน่วย" type="number" min="0" step="0.01" className={input} value={line.unit_price} onChange={(event) => patch(line.key, { unit_price: event.target.value })} /></td>
      <td className="whitespace-nowrap p-2 font-bold"><span className="flex h-11 items-center">{Number.isFinite(numberValue(line.quantity) * numberValue(line.unit_price)) ? money(numberValue(line.quantity) * numberValue(line.unit_price)) : '—'}</span></td>
      <td className="p-2"><button className="flex h-11 items-center px-2 text-red-600" aria-label="ลบรายการ" onClick={() => setDrafts((prev) => prev.filter((row) => row.key !== line.key))}>ลบ</button></td>
     </tr>;
    })}{!drafts.length && <tr><td colSpan={8} className="p-10 text-center text-slate-400">เพิ่มรายการเองหรือนำเข้า Excel</td></tr>}</tbody></table></div>
    <p className="shrink-0 text-xs text-slate-500">ตัวอย่าง: นำเข้า 2 กล่อง กล่องละ 12 ชิ้น → รับครบจะเพิ่มคลัง 24 ชิ้น มูลค่าตามเอกสารนำเข้า แยกจากมูลค่าสินค้าที่ใช้ในใบเบิก</p>
   </fieldset>
  </Modal>}
  {selected && <Modal title={'รับสินค้า / ' + selected.po_number} busy={busy} onClose={() => { setSelected(null); setFormErrors([]); }} footer={<><button disabled={busy} className={secondary} onClick={() => { setSelected(null); setFormErrors([]); }}>ปิด</button>{selected.status !== 'received' && <button disabled={busy || detailLoading || !lines.length} className={button} onClick={() => void receive()}>{busy ? 'กำลังรับสินค้า...' : 'ยืนยันรับและเพิ่มคลัง'}</button>}</>}>
   {errorsView}
   {detailLoading ? <p className="p-10 text-center">กำลังโหลดรายการ...</p> : <fieldset disabled={busy} className="space-y-5">
    <div className="rounded-xl bg-brand-50 p-4 text-sm"><p className="flex flex-wrap items-center gap-2 font-bold">{selected.supplier}<StatusBadge status={selected.status} /></p><p className="mt-1 text-slate-500">วันที่เอกสาร {dateText(selected.order_date + 'T12:00:00+07:00')} · ผู้บันทึก {selected.created_by}</p>{selected.note && <p className="mt-1">{selected.note}</p>}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-175 text-left text-sm"><thead className="bg-brand-50 text-brand-800"><tr>{['ลำดับ','สินค้า','ตามเอกสาร','รับแล้ว','ค้างรับ','รับครั้งนี้','เพิ่มคลัง'].map((label, i) => <th key={label} className={i === 0 ? 'w-14 p-3 text-center' : 'p-3'}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line, index) => <tr key={line.id}><td className="p-3 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</td><td className="p-3"><p className="font-bold">{line.item_name}</p><p className="text-xs text-slate-500">{line.product_code} · 1 {line.purchase_unit} = {line.units_per_pack} {line.stock_unit}</p></td><td className="p-3">{line.ordered_quantity} {line.purchase_unit}</td><td className="p-3">{line.received_quantity}</td><td className="p-3 font-bold text-brand-800">{line.ordered_quantity - line.received_quantity}</td><td className="w-32 p-3"><input aria-label={'รับ ' + line.item_name} type="number" min="0" step="1" max={line.ordered_quantity-line.received_quantity} disabled={busy || line.ordered_quantity === line.received_quantity} className={input} value={quantities[line.id] ?? ''} placeholder="0" onChange={(event) => setQuantities((prev) => ({ ...prev, [line.id]: event.target.value }))} /></td><td className="p-3 text-xs">{Number.isFinite(numberValue(quantities[line.id] || '0')) ? numberValue(quantities[line.id] || '0') * line.units_per_pack : '—'} {line.stock_unit}</td></tr>)}</tbody></table></div>
    {selected.status !== 'received' && <div className="grid gap-4 sm:grid-cols-2"><Field label="ชื่อผู้รับสินค้า *"><input className={input} value={receiver} onChange={(event) => setReceiver(event.target.value)} /></Field><Field label="หมายเหตุการรับ"><input className={input} value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} /></Field><p className="text-xs text-slate-500 sm:col-span-2">กรอกเฉพาะของที่ได้รับจริง รับบางส่วนได้ หากสินค้ายังไม่ระบุยอดคลัง ให้กรอกยอดเริ่มต้นในหน้าคลังก่อน</p></div>}
    <section className="space-y-3 border-t border-slate-200 pt-4"><h3 className="font-black text-brand-700">ประวัติการรับสินค้า</h3>{receipts.map((receipt) => <div key={receipt.id} className="rounded-xl border border-slate-200 p-4 text-sm"><p className="font-bold">{dateText(receipt.created_at)} {new Date(receipt.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} · {receipt.received_by}</p>{receipt.note && <p className="text-slate-500">{receipt.note}</p>}<ul className="mt-2 space-y-1 text-xs text-slate-600">{receipt.purchase_receipt_lines.map((row) => { const line = lines.find((line) => line.id === row.purchase_order_line_id); return <li key={row.purchase_order_line_id}>{line?.item_name}: รับ {row.quantity} {line?.purchase_unit} → เพิ่มคลัง {row.stock_added} {line?.stock_unit}</li>; })}</ul></div>)}{!receipts.length && <p className="text-sm text-slate-400">ยังไม่มีประวัติรับสินค้า</p>}</section>
   </fieldset>}
  </Modal>}
 </div>;
}