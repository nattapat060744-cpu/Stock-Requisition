'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { exportReportExcel } from '@/lib/reportExports';
import { ui, PageHero, StatCard, Field, SearchBox, EmptyState, Skeleton, Pagination, Modal } from '@/components/AdminUI';

interface InventoryItem {
  id: string;
  product_code: string;
  name: string;
  unit: string;
  price: number;
  stock_quantity: number | null;
  is_active: boolean;
  image_url: string;
}

// สินค้าที่คงเหลือ <= ค่านี้ (และมากกว่า 0) ถือว่า "ใกล้หมด" — ปรับได้ตามต้องการ
const LOW_STOCK_THRESHOLD = 5;

type StockState = 'in' | 'low' | 'out' | 'unset';
type StockFilter = 'all' | StockState;
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name-asc' | 'name-desc' | 'code-asc' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'ชื่อสินค้า ก → ฮ' },
  { value: 'name-desc', label: 'ชื่อสินค้า ฮ → ก' },
  { value: 'code-asc', label: 'รหัสสินค้า' },
  { value: 'stock-asc', label: 'คงเหลือ น้อย → มาก' },
  { value: 'stock-desc', label: 'คงเหลือ มาก → น้อย' },
  { value: 'price-asc', label: 'ราคา ต่ำ → สูง' },
  { value: 'price-desc', label: 'ราคา สูง → ต่ำ' },
];

const EMPTY_FORM = { product_code: '', name: '', unit: '', price: 0, stock_quantity: null as number | null, is_active: true, image_url: '' };

function getStockState(item: InventoryItem): StockState {
  if (item.stock_quantity == null) return 'unset';
  if (item.stock_quantity <= 0) return 'out';
  if (item.stock_quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

const stockBadge = {
  in: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', text: 'มีสินค้า' },
  low: { cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', text: 'ใกล้หมด' },
  out: { cls: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', text: 'หมดสต็อก' },
} as const;

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name-asc');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  async function fetchInventory() {
    setLoading(true);
    const all: InventoryItem[] = []; let error = null;
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('items').select('*').order('name').order('id').range(offset, offset + 499);
      if (result.error) { error = result.error; break; }
      all.push(...(result.data || []));
      if (!result.data || result.data.length < 500) break;
    }
    const data = error ? null : all;
    if (data) setItems(data);
    if (error) console.error(error);
    setLoading(false);
  }

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);

    if (uploadError) {
      alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } else {
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setFormData((prev) => ({ ...prev, image_url: data.publicUrl }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('กรุณากรอกชื่อสินค้า'); return; }
    if (!formData.unit.trim()) { alert('กรุณากรอกหน่วยนับ'); return; }
    if (formData.stock_quantity !== null && (!Number.isSafeInteger(formData.stock_quantity) || formData.stock_quantity < 0 || formData.stock_quantity > 2147483647)) {
      alert('กรุณากรอกจำนวนสินค้าเป็นจำนวนเต็มตั้งแต่ 0 ถึง 2,147,483,647');
      return;
    }
    const dataToSave = {
      product_code: formData.product_code.trim(),
      name: formData.name.trim(),
      unit: formData.unit.trim(),
      price: Number(formData.price) || 0,
      stock_quantity: formData.stock_quantity,
      is_active: formData.is_active,
      image_url: formData.image_url,
    };

    if (editingItem?.id) {
      const originalStock = editingItem.stock_quantity ?? null;
      const { stock_quantity, ...otherFields } = dataToSave;
      const stockChanged = stock_quantity !== originalStock;
      let query = supabase.from('items').update(stockChanged ? dataToSave : otherFields).eq('id', editingItem.id);
      // Do not overwrite goods received from a PO while this form was open.
      if (stockChanged) query = originalStock === null ? query.is('stock_quantity', null) : query.eq('stock_quantity', originalStock);
      const { data: updated, error } = await query.select('id').maybeSingle();
      if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return; }
      if (!updated) { alert('ยอดสินค้าเปลี่ยนระหว่างที่เปิดฟอร์ม กรุณาปิดแล้วเปิดสินค้าใหม่เพื่อดูยอดล่าสุดก่อนแก้ไข'); return; }
    } else {
      const { error } = await supabase.from('items').insert(dataToSave);
      if (error) { alert('เพิ่มสินค้าไม่สำเร็จ: ' + error.message); return; }
    }

    setEditingItem(null);
    setFormData(EMPTY_FORM);
    await fetchInventory();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบรายการนี้?')) return;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    fetchInventory();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportReportExcel(
        'รายการสินค้าในคลัง',
        ['รหัสสินค้า', 'ชื่อสินค้า', 'หน่วย', 'มูลค่าต่อหน่วย', 'คงเหลือ'],
        filteredItems.map((item) => [item.product_code || '', item.name, item.unit, item.price, item.stock_quantity ?? 'ยังไม่ระบุ']),
        'Requisition-inventory.xlsx',
        'คำค้น: ' + (searchTerm || 'ทั้งหมด')
          + (stockFilter !== 'all' ? ' · สต็อก: ' + ({ in: 'มีสินค้า', low: 'ใกล้หมด', out: 'หมดสต็อก', unset: 'ยังไม่ระบุ' }[stockFilter]) : '')
          + (statusFilter !== 'all' ? ' · สถานะ: ' + (statusFilter === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน') : '')
          + ' · ' + filteredItems.length + ' รายการ',
      );
    } catch (e) { alert(e instanceof Error ? e.message : 'Export ไม่สำเร็จ'); } finally { setExporting(false); }
  };

  // สถิติคิดจากสินค้าทั้งหมด (ไม่ขึ้นกับตัวกรอง)
  const stockCounts: Record<StockFilter, number> = { all: items.length, in: 0, low: 0, out: 0, unset: 0 };
  items.forEach((item) => { stockCounts[getStockState(item)]++; });

  const filteredItems = items
    .filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.product_code || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((item) => stockFilter === 'all' || getStockState(item) === stockFilter)
    .filter((item) => statusFilter === 'all' || (statusFilter === 'active') === item.is_active)
    .sort((a, b) => {
      switch (sortKey) {
        case 'name-desc':
          return b.name.localeCompare(a.name, 'th');
        case 'code-asc':
          return (a.product_code || '').localeCompare(b.product_code || '', 'th', { numeric: true });
        case 'stock-asc':
        case 'stock-desc': {
          // สินค้าที่ยังไม่ระบุจำนวนจะอยู่ท้ายสุดเสมอ
          if (a.stock_quantity == null && b.stock_quantity == null) return 0;
          if (a.stock_quantity == null) return 1;
          if (b.stock_quantity == null) return -1;
          return sortKey === 'stock-asc' ? a.stock_quantity - b.stock_quantity : b.stock_quantity - a.stock_quantity;
        }
        case 'price-asc':
          return (a.price ?? 0) - (b.price ?? 0);
        case 'price-desc':
          return (b.price ?? 0) - (a.price ?? 0);
        default:
          return a.name.localeCompare(b.name, 'th');
      }
    });

  const hasActiveFilter = searchTerm !== '' || stockFilter !== 'all' || statusFilter !== 'all';
  const resetFilters = () => { setSearchTerm(''); setStockFilter('all'); setStatusFilter('all'); setSortKey('name-asc'); };

  const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stockFilter, statusFilter, sortKey]);

  const cards = [
    { key: 'all', label: 'สินค้าทั้งหมด', icon: '📦', accent: 'blue', hint: 'ทุกรายการในคลัง' },
    { key: 'in', label: 'มีสินค้า', icon: '✅', accent: 'emerald', hint: 'พร้อมเบิก' },
    { key: 'low', label: 'ใกล้หมด', icon: '⚠️', accent: 'amber', hint: `เหลือไม่เกิน ${LOW_STOCK_THRESHOLD}` },
    { key: 'out', label: 'หมดสต็อก', icon: '🚫', accent: 'red', hint: 'ควรสั่งซื้อเพิ่ม' },
    { key: 'unset', label: 'ยังไม่ระบุจำนวน', icon: '❔', accent: 'slate', hint: 'ยังไม่มียอดเริ่มต้น' },
  ] as const;

  return (
    <div className={ui.page}>
      <div className={ui.wrap}>

        <PageHero icon="📦" title="คลังสินค้า" subtitle="จัดการรายการสินค้าและจำนวนคงเหลือ"
          actions={<>
            <a href="/admin/stocktake" className={ui.heroBtn}>📋 ตรวจนับคลัง / ประวัติ</a>
            <button disabled={loading || exporting} onClick={() => void handleExport()} className={ui.heroBtn}>{exporting ? 'กำลังส่งออก...' : '📊 Export Excel'}</button>
            <button className={ui.heroPrimary} onClick={() => { setEditingItem({ id: '', ...EMPTY_FORM }); setFormData(EMPTY_FORM); }}>+ เพิ่มสินค้า</button>
          </>} />

        <section aria-label="สรุปสต็อก" role="group" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => (
            <StatCard key={card.key} label={card.label} icon={card.icon} accent={card.accent} hint={card.hint}
              value={stockCounts[card.key].toLocaleString('th-TH')} unit="รายการ" active={stockFilter === card.key}
              onClick={() => setStockFilter(stockFilter === card.key ? 'all' : card.key)} />
          ))}
        </section>

        <section className={ui.card}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <SearchBox label="ค้นหาชื่อสินค้าหรือรหัส" placeholder="ค้นหาชื่อสินค้า / รหัส..." value={searchTerm} onChange={setSearchTerm} />
            <select aria-label="กรองตามสถานะ" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={ui.input + ' sm:max-w-44'}>
              <option value="all">ทุกสถานะ</option>
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
            <select aria-label="เรียงลำดับ" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={ui.input + ' sm:max-w-52'}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>เรียง: {o.label}</option>)}
            </select>
            <p className="ml-auto text-xs font-semibold text-slate-500">แสดง <b className="text-brand-700">{filteredItems.length.toLocaleString('th-TH')}</b> จาก {items.length.toLocaleString('th-TH')} รายการ
              {(hasActiveFilter || sortKey !== 'name-asc') && <button type="button" className="ml-3 font-black text-brand-700 hover:underline" onClick={resetFilters}>ล้างตัวกรอง</button>}</p>
          </div>

          {loading ? <Skeleton rows={6} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className={ui.thead}>
                  <tr>
                    <th className="w-16 px-4 py-3.5 text-center">ลำดับ</th>
                    <th className="px-4 py-3.5">รูปภาพ</th>
                    <th className="px-4 py-3.5">รหัสสินค้า</th>
                    <th className="px-4 py-3.5">ชื่อสินค้า</th>
                    <th className="px-4 py-3.5 text-center">จำนวนคงเหลือ</th>
                    <th className="px-4 py-3.5 text-center">หน่วยนับ</th>
                    <th className="px-4 py-3.5 text-right">ราคา / หน่วย</th>
                    <th className="px-4 py-3.5 text-center">สถานะ</th>
                    <th className="px-4 py-3.5 text-right"><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentItems.length === 0 ? (
                    <tr><td colSpan={9}>
                      <EmptyState icon="📦" title={searchTerm ? `ไม่พบรายการ “${searchTerm}”` : hasActiveFilter ? 'ไม่พบสินค้าตามตัวกรองที่เลือก' : 'ยังไม่มีสินค้าในระบบ'}
                        hint={hasActiveFilter ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : 'กด “+ เพิ่มสินค้า” เพื่อเพิ่มรายการแรก'} />
                    </td></tr>
                  ) : currentItems.map((item, idx) => {
                    const state = getStockState(item);
                    return (
                      <tr key={item.id} className={'transition-colors hover:bg-brand-50/40 ' + (state === 'out' ? 'bg-red-50/40' : '')}>
                        <td className="px-4 py-4 text-center text-xs font-semibold tabular-nums text-slate-400">{indexOfFirstItem + idx + 1}</td>
                        <td className="px-4 py-3">
                          {item.image_url ? (
                            <button type="button" aria-label={'ดูรูป ' + item.name} onClick={() => setSelectedImage(item.image_url)} className="block h-12 w-12 cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 hover:ring-2 hover:ring-brand-300">
                              <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                            </button>
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-brand-50 text-[10px] font-bold text-brand-400">ไม่มีรูป</div>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs font-semibold text-slate-500">{item.product_code || '—'}</td>
                        <td className="px-4 py-4 font-black text-brand-700">{item.name}</td>
                        <td className="px-4 py-4 text-center">
                          {state === 'unset' ? <span className="text-xs text-slate-400">ยังไม่ระบุ</span> : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-black tabular-nums text-brand-700">{item.stock_quantity!.toLocaleString('th-TH')}</span>
                              {state !== 'in' && <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ' + stockBadge[state].cls}><span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + stockBadge[state].dot} />{stockBadge[state].text}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center"><span className="rounded-lg bg-brand-50 px-3 py-1 text-xs font-bold text-brand-900">{item.unit}</span></td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{(item.price ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-semibold text-slate-400">฿</span></td>
                        <td className="px-4 py-4 text-center">
                          <span className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ' + (item.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                            <span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + (item.is_active ? 'bg-emerald-500' : 'bg-slate-400')} />{item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </td>
                        <td className="px-4 py-4"><div className="flex justify-end gap-2">
                          <button className={ui.rowBtn} onClick={() => { setEditingItem(item); setFormData({ ...item, stock_quantity: item.stock_quantity ?? null }); }}>แก้ไข</button>
                          <button className={ui.rowBtnDanger} onClick={() => void handleDelete(item.id)}>ลบ</button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={currentPage} totalPages={totalPages} total={filteredItems.length} onChange={setCurrentPage} />
        </section>

        {selectedImage && (
          <div role="presentation" className="fixed inset-0 z-60 flex cursor-zoom-out items-center justify-center bg-slate-900/60 p-4" onClick={() => setSelectedImage(null)}>
            <img src={selectedImage} alt="ตัวอย่างรูปสินค้า" className="max-h-[90vh] max-w-[90vw] rounded-2xl border-4 border-white shadow-2xl" />
          </div>
        )}

        {editingItem && (
          <Modal title={editingItem.id ? '✏️ แก้ไขข้อมูลสินค้า' : '✨ เพิ่มสินค้าใหม่'} busy={uploading} onClose={() => setEditingItem(null)}
            footer={<>
              <button disabled={uploading} className={ui.secondary} onClick={() => setEditingItem(null)}>ยกเลิก</button>
              <button disabled={uploading} className={ui.button} onClick={() => void handleSave()}>บันทึกข้อมูล</button>
            </>}>
            <div className="grid items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-brand-50/40 p-4">
                <p className="text-xs font-bold text-brand-800">รูปภาพสินค้า</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={ui.secondary}>{uploading ? '⏳ กำลังอัปโหลด...' : '📷 เลือกรูปภาพ'}</button>
                  {formData.image_url && <button type="button" onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))} className="text-xs font-bold text-red-600 hover:underline">ลบรูป</button>}
                </div>
                {formData.image_url && <img src={formData.image_url} alt="ตัวอย่างรูป" className="h-44 w-full rounded-xl border border-slate-200 bg-white object-contain p-3 md:h-56" />}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="รหัสสินค้า"><input className={ui.input} placeholder="เช่น PRD-001" value={formData.product_code || ''} onChange={(e) => setFormData({ ...formData, product_code: e.target.value })} /></Field>
                <Field label="ชื่อสินค้า *" className="sm:col-span-2"><input className={ui.input} placeholder="ชื่อสินค้า" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></Field>
                <Field label="หน่วยนับ *"><input className={ui.input} placeholder="เช่น ชิ้น, กล่อง, แผ่น" value={formData.unit || ''} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} /></Field>
                <Field label="ราคาต่อหน่วย (฿)"><input className={ui.input} type="number" min="0" step="0.01" placeholder="0.00" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} /></Field>
                <div className="space-y-1.5 sm:col-span-2">
                  <Field label={`จำนวนคงเหลือ (${formData.unit || 'หน่วยนับ'})`}>
                    <input className={ui.input} type="number" min="0" max="2147483647" step="1" placeholder="ยังไม่ระบุ" value={formData.stock_quantity ?? ''}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value === '' ? null : Number(e.target.value) })} />
                  </Field>
                  <p className="text-xs text-slate-500">จำนวนตามหน่วยสินค้า เช่น 10 ชิ้น หรือ 5 กล่อง</p>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-brand-50/40 p-3 hover:bg-brand-50 sm:col-span-2">
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="h-5 w-5 accent-brand-700" />
                  <span><span className="text-sm font-bold text-slate-700">เปิดใช้งานรายการนี้</span><span className="block text-xs text-slate-500">สินค้าจะแสดงในหน้าเบิกของแผนก</span></span>
                </label>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}