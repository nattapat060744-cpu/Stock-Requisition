'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDepartment } from '@/components/DepartmentAccess';
import { requestError, validRequestLines } from '@/lib/requisitionRules';
import { supabase } from '@/lib/supabase';
import { ui, PageHero, Notice, Field, SearchBox, EmptyState, Modal } from '@/components/AdminUI';

interface Item {
  id: string;
  name: string;
  unit: string;
  image_url: string | null;
  stock_quantity: number | null;
}

interface CartItem extends Item {
  quantity: number;
}

interface Zone {
  id: string;
  name: string;
}

interface CartFormContentProps {
  isEditing: boolean;
  note: string; setNote: (value: string) => void;
  branchName: string;
  zoneName: string;
  setZoneName: (val: string) => void;
  zones: Zone[];
  senderName: string; setSenderName: (val: string) => void;
  requesterName: string;
  setRequesterName: (val: string) => void;
  handlePreSubmitCheck: (e: React.FormEvent) => void;
  totalCartItems: number;
  cart: CartItem[];
  updateQuantity: (id: string, amount: number) => void;
  removeFromCart: (id: string) => void;
  loading: boolean;
  cartBounce: boolean;
}

const CartFormContent = ({
  isEditing, note, setNote,
  branchName,
  zoneName,
  setZoneName,
  zones,
  requesterName,
  setRequesterName, senderName, setSenderName,
  handlePreSubmitCheck,
  totalCartItems,
  cart,
  updateQuantity,
  removeFromCart,
  loading,
  cartBounce,
}: CartFormContentProps) => (
  <form onSubmit={handlePreSubmitCheck} className="flex h-full w-full min-w-0 flex-col gap-4">
    <fieldset disabled={loading} className="m-0 w-full min-w-0 flex-1 space-y-3 overflow-y-auto border-0 p-0 pr-1">
      {/* แผนกอ้างอิงจากผู้ใช้ที่เข้าใช้งาน ไม่ใช่ช่องเลือก */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-blue-800">แผนกที่ขอเบิก</p>
        <p className="w-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm font-black text-[#1a3a6e]">{branchName}</p>
      </div>

      {/* โซน — โชว์เฉพาะแผนกที่มีโซน */}
      {zones.length > 0 && (
        <Field label="🗂️ โซน *">
          <select value={zoneName} onChange={(e) => setZoneName(e.target.value)} className={ui.input + ' cursor-pointer'}>
            <option value="">— เลือกโซน —</option>
            {zones.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
        </Field>
      )}

      {(zones.length > 0 || branchName === 'จัดเรียง') && (
        <Field label="หัวหน้า / รองหัวหน้าผู้ส่งใบเบิก *">
          <input required maxLength={200} value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="ชื่อ - นามสกุลผู้ส่งใบเบิก" className={ui.input} />
        </Field>
      )}

      <Field label="ชื่อผู้เบิกสินค้า *">
        <input type="text" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="ชื่อ - นามสกุล" className={ui.input} />
      </Field>

      <Field label="หมายเหตุใบเบิก">
        <textarea maxLength={2000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ใช้สำหรับงานใด หรือรายละเอียดเพิ่มเติม" className={ui.input} />
      </Field>

      <div className="flex items-center justify-between border-t border-blue-100 px-1 pt-3">
        <span className="text-sm font-black text-[#1a3a6e]">รายการที่เลือก <span className="font-semibold text-slate-500">({cart.length} รายการ)</span></span>
        <span className={'rounded-full border px-3 py-1 text-xs font-black tabular-nums transition-all duration-300 ' + (cartBounce ? 'scale-110 border-red-400 bg-red-600 text-white shadow-md' : 'border-blue-200 bg-blue-50 text-blue-900')}>
          {totalCartItems} ชิ้น
        </span>
      </div>

      <div className="max-h-64 w-full min-w-0 space-y-2 overflow-y-auto pr-0.5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/30 py-8 text-center">
            <span aria-hidden="true" className="text-3xl">🛒</span>
            <p className="text-xs font-bold text-slate-500">ยังไม่มีสินค้าในตะกร้า</p>
            <p className="text-xs text-slate-400">กด “+ เพิ่มในตะกร้า” ที่สินค้าที่ต้องการ</p>
          </div>
        ) : (
          cart.map((item, index) => (
            <div key={item.id} className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-blue-100 bg-white p-2 transition-colors hover:bg-blue-50/40">
              <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-slate-400">{index + 1}</span>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                  : <span className="text-sm" aria-hidden="true">📦</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold leading-tight text-[#1a3a6e]">{item.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{item.unit}</p>
              </div>
              <div className="flex shrink-0 items-center rounded-lg border border-blue-200 bg-white">
                <button type="button" aria-label={'ลดจำนวน ' + item.name} onClick={() => updateQuantity(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-black text-blue-900 hover:bg-blue-50 active:scale-90">−</button>
                <span className="min-w-7 px-1 text-center text-xs font-black tabular-nums text-slate-700">{item.quantity}</span>
                <button type="button" aria-label={'เพิ่มจำนวน ' + item.name} onClick={() => updateQuantity(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-black text-blue-900 hover:bg-blue-50 active:scale-90">+</button>
              </div>
              <button type="button" aria-label={'ลบ ' + item.name} onClick={() => removeFromCart(item.id)} className="shrink-0 rounded-lg p-1.5 text-xs font-bold text-red-500 hover:bg-red-50">✕</button>
            </div>
          ))
        )}
      </div>
    </fieldset>

    <button type="submit" disabled={loading} className={ui.button + ' flex w-full items-center justify-center gap-2 py-3.5 font-black'}>
      {loading ? (
        <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /><span>กำลังประมวลผล...</span></>
      ) : (
        <><span aria-hidden="true">📝</span><span>{isEditing ? 'บันทึกการแก้ไข' : 'ส่งใบเบิก'} ({cart.length} รายการ)</span></>
      )}
    </button>
  </form>
);

// ── Pagination ────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 15;

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────

function RequisitionForm({ editId }: { editId: string | null }) {
  const department = useDepartment();
  const [note, setNote] = useState('');
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [editReady, setEditReady] = useState(!editId);
  const [editError, setEditError] = useState('');
  const requestId = useRef<string | null>(null);
  const submitBusy = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [allZones, setAllZones] = useState<(Zone & { branch_id: string })[]>([]);
  const [zonesReady, setZonesReady] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const branchName = department.branch_name;
  const [zoneName, setZoneName] = useState('');
  const zones = allZones.filter(zone => zone.branch_id === branches.find(branch => branch.name === branchName)?.id);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [clickedItemId, setClickedItemId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchData() {
      const [{ data: itemsData, error: itemsError }, { data: branchesData }, { data: zonesData, error: zonesError }] = await Promise.all([
        supabase.from('items').select('id, name, unit, image_url, stock_quantity').eq('is_active', true).order('name'),
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('zones').select('id,name,branch_id').order('name'),
      ]);
      if (itemsError) alert('โหลดจำนวนสินค้าไม่สำเร็จ กรุณาตรวจสอบว่าเพิ่มคอลัมน์จำนวนคงเหลือในฐานข้อมูลแล้ว');
      if (itemsData) setItems(itemsData);
      if (branchesData) setBranches(branchesData);
      if (zonesError) alert('โหลดโซนไม่สำเร็จ กรุณารีเฟรชก่อนส่งใบเบิก'); else { setAllZones(zonesData || []); setZonesReady(true); }
    }
    fetchData();
    const refreshStock = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('items').select('id, name, unit, image_url, stock_quantity').eq('is_active', true).order('name');
      if (data) setItems(data);
    };
    const timer = setInterval(refreshStock, 15_000);
    window.addEventListener('focus', refreshStock);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshStock); };
  }, []);

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const pagedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const addToCart = (item: Item) => {
    if (loading) return;
    setClickedItemId(item.id);
    setCartBounce(true);
    setTimeout(() => setClickedItemId(null), 800);
    setTimeout(() => setCartBounce(false), 300);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, amount: number) => {
    if (loading) return;
    const current = cart.find((item) => item.id === id);
    if (!current) return;
    const quantity = Math.max(1, current.quantity + amount);
    if (quantity > 2147483647) return;
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, quantity } : item));
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePreSubmitCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) { alert('กรุณาเลือกแผนก'); return; }
    if (!zonesReady) { alert('กรุณารอโหลดข้อมูลโซนหรือรีเฟรชหน้า'); return; }
    if ((zones.length > 0 || branchName === 'จัดเรียง') && !senderName.trim()) { alert('กรุณากรอกชื่อหัวหน้า / รองหัวหน้าผู้ส่งใบเบิก'); return; }
    if (zones.length > 0 && !zones.some(zone => zone.name === zoneName)) { alert('กรุณาเลือกโซน'); return; }
    if (!requesterName.trim()) { alert('กรุณากรอกชื่อผู้เบิก'); return; }
    if (cart.length === 0) { alert('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'); return; }
    if (!editReady || editError) { alert(editError || 'กรุณารอโหลดใบเบิก'); return; }
    if (!validRequestLines(cart.map(item => ({ item_id: item.id, quantity: item.quantity })))) { alert('จำนวนสินค้าต้องเป็นจำนวนเต็มบวก และไม่มีรายการซ้ำ'); return; }
    setIsCartOpen(false);
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitBusy.current || !editReady || editError) return;
    submitBusy.current = true; setShowConfirmModal(false); setLoading(true);
    try {
      if (!requestId.current) requestId.current = editId || crypto.randomUUID();
      const { error } = await supabase.rpc('save_department_requisition', {
        p_token: department.token, p_id: requestId.current, p_version: editId ? editVersion : null,
        p_requester: requesterName.trim(), p_zone: zones.length ? zoneName : null, p_sender: senderName.trim(), p_note: note,
        p_lines: cart.map(item => ({ item_id: item.id, quantity: item.quantity }))
      });
      if (error) throw error;
      alert(editId ? 'บันทึกการแก้ไขใบเบิกแล้ว' : 'ส่งใบเบิกเรียบร้อยแล้ว');
      setCart([]); setNote(''); setSearchTerm(''); setCurrentPage(1); requestId.current = null;
      if (editId) window.location.assign('/requisition/my-requests');
    } catch (error) { alert(requestError(error)); } finally { setLoading(false); submitBusy.current = false; }
  };

  useEffect(() => {
    let alive = true; const id = editId;
    if (!id) return;
    void supabase.rpc('department_requisition', { p_token: department.token, p_id: id }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setEditError(requestError(error)); return; }
      if (data.status !== 'pending') { setEditError('ใบเบิกนี้ตรวจสอบแล้ว ไม่สามารถแก้ไขได้'); return; }
      setEditVersion(data.version); setRequesterName(data.requester_name); setSenderName(data.sender_name || ''); setZoneName(data.zone_name || ''); setNote(data.note || '');
      setCart(data.requisition_details.map((d: { item_id: string; quantity: number; items: { name: string; unit: string; image_url: string | null } | null }) => ({ id: d.item_id, name: d.items?.name || 'สินค้าเดิม', unit: d.items?.unit || '', image_url: d.items?.image_url || null, stock_quantity: null, quantity: d.quantity })));
      requestId.current = id; setEditReady(true);
    }); return () => { alive = false; };
  }, [department.token, editId]);

  const cartFormProps = {
    isEditing: Boolean(editId), note, setNote,
    branchName,
    senderName, setSenderName,
    zoneName, setZoneName,
    zones,
    requesterName, setRequesterName,
    handlePreSubmitCheck,
    totalCartItems,
    cart, updateQuantity, removeFromCart,
    loading: loading || !editReady || Boolean(editError), cartBounce,
  };

  return (
    <div className={ui.page + ' relative pb-24 lg:pb-10'}>
      <div className={ui.wrap}>

        <PageHero
          icon={<img src="/Logo.png" alt="โลโก้" className="h-full w-full object-cover" />}
          title="ใบเบิกของ สำเพ็ง บุรีรัมย์"
          subtitle={(editId ? 'แก้ไขใบเบิกที่รออนุมัติ' : 'สร้างใบเบิกใหม่') + ' · ' + department.branch_name}
          actions={<>
            {totalCartItems > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold">
                <span aria-hidden="true">🛒</span>
                <span className="tabular-nums">{totalCartItems} ชิ้น</span>
                <span aria-hidden="true" className="text-blue-200">|</span>
                <span className="tabular-nums text-blue-100">{cart.length} รายการ</span>
              </div>
            )}
          </>} />

        {editError && <Notice tone="error">{editError} <Link href="/requisition/my-requests" className="font-bold underline">กลับประวัติ</Link></Notice>}
        {!editReady && !editError && <p role="status" className="rounded-xl border border-blue-100 bg-white p-4 text-sm font-semibold text-blue-800">กำลังโหลดใบเบิก...</p>}

        <div className="flex flex-col items-start gap-5 lg:flex-row">

          {/* ── Left: items ── */}
          <div className="w-full min-w-0 flex-1 space-y-4">

            <div className={ui.card + ' flex flex-wrap items-center gap-3 p-4'}>
              <SearchBox label="ค้นหาสินค้า" placeholder="ค้นหาสินค้า เช่น กระดาษ A4, ปากกา..." value={searchTerm} onChange={(v) => { setSearchTerm(v); setCurrentPage(1); }} />
              <p className="ml-auto text-xs font-semibold text-slate-500">
                {searchTerm
                  ? <>พบ <b className="text-[#1a3a6e]">{filteredItems.length}</b> รายการสำหรับ “{searchTerm}”<button type="button" className="ml-3 font-black text-blue-700 hover:underline" onClick={() => { setSearchTerm(''); setCurrentPage(1); }}>ล้างตัวกรอง</button></>
                  : <>สินค้าทั้งหมด <b className="text-[#1a3a6e]">{filteredItems.length}</b> รายการ</>}
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <div className={ui.card}><EmptyState icon="📂" title={searchTerm ? `ไม่พบสินค้า “${searchTerm}”` : 'ยังไม่มีสินค้าในระบบ'} hint={searchTerm ? 'ลองเปลี่ยนคำค้นหา' : undefined} /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {pagedItems.map((item) => {
                  const isClicked = clickedItemId === item.id;
                  const inCart = cart.find((c) => c.id === item.id);
                  return (
                    <div key={item.id}
                      className={'group flex flex-col overflow-hidden rounded-2xl border border-l-4 bg-white shadow-sm transition-all duration-200 ' + (isClicked
                        ? 'border-blue-300 border-l-[#1a3a6e] ring-2 ring-[#1a3a6e]/70'
                        : inCart ? 'border-blue-200 border-l-sky-400'
                        : 'border-blue-100 border-l-blue-100 hover:-translate-y-0.5 hover:shadow-md')}>
                      <div className="relative aspect-square overflow-hidden bg-slate-50">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><span aria-hidden="true" className="text-4xl opacity-20">📦</span></div>
                        )}
                        {inCart && (
                          <div className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#1a3a6e] px-1 text-[10px] font-black text-white shadow-md">{inCart.quantity}</div>
                        )}
                        <div className="absolute bottom-2 left-2">
                          <span className="rounded-full border border-blue-100 bg-white/90 px-2 py-0.5 text-[10px] font-black text-blue-800 shadow-sm backdrop-blur-sm">{item.unit || 'ชิ้น'}</span>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col gap-2 p-3">
                        <h4 className="line-clamp-2 flex-1 text-xs font-black leading-snug text-[#1a3a6e]">{item.name}</h4>
                        {item.stock_quantity != null && <p className="text-[11px] font-semibold text-slate-500">คงเหลือ <span className="tabular-nums">{item.stock_quantity.toLocaleString('th-TH')}</span> {item.unit}</p>}
                        <button type="button" disabled={loading} onClick={() => addToCart(item)}
                          className={'w-full rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ' + (isClicked
                            ? 'bg-emerald-600 text-white'
                            : inCart ? 'bg-[#1a3a6e] text-white shadow-sm hover:bg-blue-800'
                            : 'border border-blue-200 bg-white text-blue-900 hover:bg-blue-50')}>
                          {isClicked ? '✓ เพิ่มแล้ว' : inCart ? `+ เพิ่ม (${inCart.quantity})` : '+ เพิ่มในตะกร้า'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className={ui.card + ' flex flex-col items-center justify-between gap-3 px-5 py-4 sm:flex-row'}>
                <p className="text-xs font-semibold text-slate-500">
                  แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} จาก {filteredItems.length} รายการ
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1} className={ui.rowBtn}>← ก่อนหน้า</button>
                  {buildPageNumbers(currentPage, totalPages).map((p, idx) =>
                    p === '…' ? (
                      <span key={`e${idx}`} className="select-none px-1 text-sm text-slate-300">…</span>
                    ) : (
                      <button key={p} aria-current={currentPage === p ? 'page' : undefined} onClick={() => setCurrentPage(p as number)}
                        className={'h-9 w-9 rounded-lg text-xs font-bold ' + (currentPage === p ? 'bg-[#1a3a6e] text-white shadow-sm' : 'border border-blue-200 bg-white text-blue-900 hover:bg-blue-50')}>{p}</button>
                    )
                  )}
                  <button onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages} className={ui.rowBtn}>ถัดไป →</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Desktop cart ── */}
          <div className="hidden w-full min-w-0 max-w-full shrink-0 lg:block lg:w-96">
            <div className={ui.card + ' lg:sticky lg:top-6'}>
              <div className="flex items-center justify-between bg-linear-to-r from-[#1a3a6e] to-[#2d5aa8] px-5 py-4 text-white">
                <div className="flex items-center gap-2"><span aria-hidden="true">📋</span><h2 className="text-sm font-black">สรุปใบเบิกสินค้า</h2></div>
                {cart.length > 0 && <span className="rounded-full border border-white/20 bg-white/20 px-2.5 py-1 text-xs font-black">{cart.length} รายการ</span>}
              </div>
              <div className="p-4"><CartFormContent {...cartFormProps} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile floating bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-blue-100 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(26,58,110,0.10)] backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className={'relative transition-transform duration-300 ' + (cartBounce ? 'scale-125' : 'scale-100')}>
            <span aria-hidden="true" className="text-2xl">🛒</span>
            {totalCartItems > 0 && (
              <span className={'absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-black text-white shadow-sm transition-all ' + (cartBounce ? 'scale-110 bg-red-600' : 'bg-[#1a3a6e]')}>{totalCartItems}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-black leading-tight text-[#1a3a6e]">{totalCartItems > 0 ? `${totalCartItems} ชิ้น` : 'ตะกร้าว่างอยู่'}</p>
            {cart.length > 0 && <p className="text-[11px] font-semibold text-slate-500">{cart.length} รายการ</p>}
          </div>
        </div>
        <button type="button" onClick={() => setIsCartOpen(true)} className={ui.button}>ดูใบเบิก →</button>
      </div>

      {/* ── Mobile drawer backdrop ── */}
      <div
        className={'fixed inset-0 z-50 bg-slate-900/50 transition-opacity duration-300 lg:hidden ' + (isCartOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')}
        onClick={() => setIsCartOpen(false)}
      />

      {/* ── Mobile drawer ── */}
      <div className={'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-96 lg:hidden ' + (isCartOpen ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between bg-linear-to-r from-[#1a3a6e] to-[#2d5aa8] p-4 text-white">
          <div className="flex items-center gap-2"><span aria-hidden="true">📋</span><h3 className="text-sm font-black">สรุปใบเบิกสินค้า</h3></div>
          <button type="button" aria-label="ปิดตะกร้า" onClick={() => setIsCartOpen(false)} className="h-8 w-8 rounded-full bg-white/15 text-xl hover:bg-white/25">×</button>
        </div>
        <div className="flex-1 overflow-hidden p-4"><CartFormContent {...cartFormProps} /></div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <Modal title="📋 ตรวจสอบรายละเอียดใบเบิก" busy={false} maxWidth="max-w-lg" onClose={() => setShowConfirmModal(false)}
          footer={<>
            <button type="button" className={ui.secondary} onClick={() => { setShowConfirmModal(false); setIsCartOpen(true); }}>← แก้ไข</button>
            <button type="button" className={ui.button} onClick={handleConfirmSubmit}>{editId ? 'ยืนยันบันทึกการแก้ไข ✓' : 'ยืนยันส่งใบเบิก ✓'}</button>
          </>}>
          <div className="space-y-4">
            <p className="text-xs font-medium text-slate-500">กรุณาตรวจสอบความถูกต้องก่อนส่ง</p>
            <div className="rounded-xl bg-blue-50 p-4 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-bold">{branchName}{zoneName && <span className="text-blue-700">· โซน {zoneName}</span>}</p>
              <p className="mt-1 text-slate-600">ผู้เบิก {requesterName}</p>
              {(zones.length > 0 || branchName === 'จัดเรียง') && <p className="mt-1 text-blue-900">ผู้ส่งใบเบิก: {senderName}</p>}
            </div>
            {note && <p className="whitespace-pre-wrap rounded-xl border border-blue-100 p-3 text-sm text-blue-900"><strong>หมายเหตุ:</strong> {note}</p>}
            <div>
              <p className="mb-2 text-xs font-bold text-blue-800">รายการสินค้า ({totalCartItems} ชิ้น / {cart.length} รายการ)</p>
              <div className="max-h-60 divide-y divide-blue-50 overflow-y-auto rounded-xl border border-blue-100">
                {cart.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 bg-white p-3 transition-colors hover:bg-blue-50/40">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-slate-400">{index + 1}</span>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <span aria-hidden="true" className="text-xs">📦</span>}
                      </div>
                      <span className="truncate text-xs font-bold text-slate-700">{item.name}</span>
                    </div>
                    <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-black tabular-nums text-blue-900">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RequisitionRoute() { const id = useSearchParams().get('edit'); return <RequisitionForm key={id || 'new'} editId={id} />; }
export default function RequisitionPage() {
  return <Suspense fallback={<div className={ui.page}><div className={ui.wrap} aria-busy="true" role="status"><div className="h-28 animate-pulse rounded-2xl bg-[#1a3a6e]/20" /><span className="sr-only">กำลังโหลดใบเบิก...</span></div></div>}><RequisitionRoute /></Suspense>;
}