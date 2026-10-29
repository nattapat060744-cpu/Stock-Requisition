'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useDepartment} from '@/components/DepartmentAccess';
import {requestError,validRequestLines} from '@/lib/requisitionRules';
import { supabase } from '@/lib/supabase';

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
  isEditing:boolean;
  note:string; setNote:(value:string)=>void;
  branchName: string;
  zoneName: string;
  setZoneName: (val: string) => void;
  zones: Zone[];
  senderName:string; setSenderName:(val:string)=>void;
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
  isEditing,note,setNote,
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
  <form onSubmit={handlePreSubmitCheck} className="h-full w-full min-w-0 flex flex-col gap-4">
    <fieldset disabled={loading} className="m-0 w-full min-w-0 flex-1 space-y-3 border-0 p-0 pr-1 overflow-y-auto">
      {/* แผนกอ้างอิงจากผู้ใช้ที่เข้าใช้งาน ไม่ใช่ช่องเลือก */}
      <div>
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">แผนกที่ขอเบิก</p>
        <p className="w-full rounded-xl border border-blue-100 bg-blue-50/50 px-3.5 py-2.5 text-sm font-bold text-blue-900">{branchName}</p>
      </div>

      {/* โซน — โชว์เฉพาะแผนกจัดเรียง */}
      {zones.length > 0 && (
        <div>
          <label className="block text-[10px] font-black text-blue-700 uppercase tracking-[0.15em] mb-1.5">
            🗂️ โซน
          </label>
          <div className="relative">
            <select
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              className="block w-full py-2.5 pl-3.5 pr-9 bg-white border border-blue-200 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 rounded-xl text-sm font-semibold text-slate-700 outline-none transition-all appearance-none cursor-pointer shadow-sm"
            >
              <option value="">— เลือกโซน —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.name}>{z.name}</option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-blue-400 text-[10px]">▼</span>
          </div>
        </div>
      )}

      {(zones.length>0||branchName==='จัดเรียง')&&<label className="block text-xs font-bold text-blue-800">หัวหน้า / รองหัวหน้าผู้ส่งใบเบิก *<input required maxLength={200} value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="ชื่อ - นามสกุลผู้ส่งใบเบิก" className="mt-2 w-full rounded-xl border border-blue-200 p-3 text-sm"/></label>}
      {/* ชื่อผู้เบิก */}
      <div>
        <label className="block text-[10px] font-black text-blue-700 uppercase tracking-[0.15em] mb-1.5">
          ชื่อผู้เบิกสินค้า
        </label>
        <input
          type="text"
          value={requesterName}
          onChange={(e) => setRequesterName(e.target.value)}
          placeholder="ชื่อ - นามสกุล"
          className="block w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 rounded-xl text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all shadow-sm"
        />
      </div>

      <label className="block text-xs font-bold text-blue-800">หมายเหตุใบเบิก<textarea maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น ใช้สำหรับงานใด หรือรายละเอียดเพิ่มเติม" className="mt-2 w-full rounded-xl border border-blue-200 p-3 text-sm"/></label>
      {/* Divider */}
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">รายการที่เลือก</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Cart badge */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-500">{cart.length} รายการ</span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-black border transition-all duration-300 ${
          cartBounce
            ? 'scale-110 bg-red-600 border-red-400 text-white shadow-md shadow-blue-200'
            : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          {totalCartItems} ชิ้น
        </span>
      </div>

      {/* รายการ */}
      <div className="w-full min-w-0 space-y-2 max-h-64 overflow-y-auto pr-0.5">
        {cart.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
            <span className="text-3xl opacity-20">🛒</span>
            <p className="text-slate-400 text-xs font-semibold">ยังไม่มีสินค้าในตะกร้า</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="flex w-full min-w-0 items-center gap-2 bg-white p-2 border border-slate-100 rounded-xl hover:border-blue-100 transition-all group">
              <div className="w-9 h-9 bg-blue-50 rounded-lg shrink-0 flex items-center justify-center overflow-hidden border border-blue-50">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  : <span className="text-sm">📦</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate text-xs leading-tight">{item.name}</p>
                <p className="text-[10px] text-blue-700 font-semibold mt-0.5">{item.unit}</p>
              </div>
              <div className="flex items-center bg-slate-50 border border-slate-200/80 rounded-lg shrink-0">
                <button type="button" onClick={() => updateQuantity(item.id, -1)}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-md text-sm font-black transition-all active:scale-90">−</button>
                <span className="min-w-7 px-1 text-center font-black text-xs tabular-nums text-slate-700">{item.quantity}</span>
                <button type="button" onClick={() => updateQuantity(item.id, 1)}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-md text-sm font-black transition-all active:scale-90">+</button>
              </div>
              <button type="button" onClick={() => removeFromCart(item.id)}
                className="text-slate-300 hover:text-red-500 p-1 text-xs font-bold hover:bg-red-50 rounded-lg transition-colors shrink-0">✕</button>
            </div>
          ))
        )}
      </div>
    </fieldset>

    {/* Submit */}
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-linear-to-r from-blue-700 via-blue-800 to-blue-900 text-white py-3.5 rounded-xl font-black hover:opacity-90 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shadow-lg shadow-blue-700/25 active:scale-[0.99] transition-all text-sm flex items-center justify-center gap-2"
    >
      {loading ? (
        <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /><span>กำลังประมวลผล...</span></>
      ) : (
        <><span>📝</span><span>{isEditing?'บันทึกการแก้ไข':'ส่งใบเบิก'} ({cart.length} รายการ)</span></>
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

function RequisitionForm({editId}:{editId:string|null}) {
  const department=useDepartment();
  const [note,setNote]=useState('');
  const [editVersion,setEditVersion]=useState<number|null>(null);
  const [editReady,setEditReady]=useState(!editId);
  const [editError,setEditError]=useState('');
  const requestId=useRef<string|null>(null);
  const submitBusy=useRef(false);
  const [items, setItems]               = useState<Item[]>([]);
  const [branches, setBranches]         = useState<{ id: string; name: string }[]>([]);
  const [allZones,setAllZones]=useState<(Zone&{branch_id:string})[]>([]);
  const [zonesReady,setZonesReady]=useState(false);
  const [senderName,setSenderName]=useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [requesterName, setRequesterName] = useState('');
  const branchName = department.branch_name;
  const [zoneName, setZoneName]         = useState('');
  const zones=allZones.filter(zone=>zone.branch_id===branches.find(branch=>branch.name===branchName)?.id);
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCartOpen, setIsCartOpen]     = useState(false);
  const [cartBounce, setCartBounce]     = useState(false);
  const [clickedItemId, setClickedItemId] = useState<string | null>(null);
  const [currentPage, setCurrentPage]   = useState(1);

  useEffect(() => {
    async function fetchData() {
      const [{ data: itemsData, error: itemsError }, { data: branchesData }, {data:zonesData,error:zonesError}] = await Promise.all([
        supabase.from('items').select('id, name, unit, image_url, stock_quantity').eq('is_active', true).order('name'),
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('zones').select('id,name,branch_id').order('name'),
      ]);
      if (itemsError) alert('โหลดจำนวนสินค้าไม่สำเร็จ กรุณาตรวจสอบว่าเพิ่มคอลัมน์จำนวนคงเหลือในฐานข้อมูลแล้ว');
      if (itemsData)    setItems(itemsData);
      if (branchesData) setBranches(branchesData);
      if(zonesError)alert('โหลดโซนไม่สำเร็จ กรุณารีเฟรชก่อนส่งใบเบิก');else {setAllZones(zonesData||[]);setZonesReady(true);}
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
    if(quantity>2147483647)return;
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, quantity } : item));
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePreSubmitCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim())   { alert('กรุณาเลือกแผนก'); return; }
    if(!zonesReady){alert('กรุณารอโหลดข้อมูลโซนหรือรีเฟรชหน้า');return;}
    if((zones.length>0||branchName==='จัดเรียง')&&!senderName.trim()){alert('กรุณากรอกชื่อหัวหน้า / รองหัวหน้าผู้ส่งใบเบิก');return;}
    if (zones.length>0 && !zones.some(zone=>zone.name===zoneName)) { alert('กรุณาเลือกโซน'); return; }
    if (!requesterName.trim()) { alert('กรุณากรอกชื่อผู้เบิก'); return; }
    if (cart.length === 0)    { alert('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'); return; }
    if(!editReady||editError){alert(editError||'กรุณารอโหลดใบเบิก');return;}
    if(!validRequestLines(cart.map(item=>({item_id:item.id,quantity:item.quantity})))){alert('จำนวนสินค้าต้องเป็นจำนวนเต็มบวก และไม่มีรายการซ้ำ');return;}
    setIsCartOpen(false);
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if(submitBusy.current||!editReady||editError)return;
    submitBusy.current=true;setShowConfirmModal(false);setLoading(true);
    try {
      if(!requestId.current)requestId.current=editId||crypto.randomUUID();
      const {error}=await supabase.rpc('save_department_requisition',{
        p_token:department.token,p_id:requestId.current,p_version:editId?editVersion:null,
        p_requester:requesterName.trim(),p_zone:zones.length?zoneName:null,p_sender:senderName.trim(),p_note:note,
        p_lines:cart.map(item=>({item_id:item.id,quantity:item.quantity}))
      });
      if(error)throw error;
      alert(editId?'บันทึกการแก้ไขใบเบิกแล้ว':'ส่งใบเบิกเรียบร้อยแล้ว');
      setCart([]);setNote('');setSearchTerm('');setCurrentPage(1);requestId.current=null;
      if(editId)window.location.assign('/requisition/my-requests');
    } catch(error){alert(requestError(error));} finally {setLoading(false);submitBusy.current=false;}
  };

  useEffect(()=>{
    let alive=true;const id=editId;
    if(!id)return;
    void supabase.rpc('department_requisition',{p_token:department.token,p_id:id}).then(({data,error})=>{
      if(!alive)return;
      if(error||!data){setEditError(requestError(error));return;}
      if(data.status!=='pending'){setEditError('ใบเบิกนี้ตรวจสอบแล้ว ไม่สามารถแก้ไขได้');return;}
      setEditVersion(data.version);setRequesterName(data.requester_name);setSenderName(data.sender_name||'');setZoneName(data.zone_name||'');setNote(data.note||'');
      setCart(data.requisition_details.map((d:{item_id:string;quantity:number;items:{name:string;unit:string;image_url:string|null}|null})=>({id:d.item_id,name:d.items?.name||'สินค้าเดิม',unit:d.items?.unit||'',image_url:d.items?.image_url||null,stock_quantity:null,quantity:d.quantity})));
      requestId.current=id;setEditReady(true);
    });return()=>{alive=false;};
  },[department.token,editId]);

  const cartFormProps = {
    isEditing:Boolean(editId),note,setNote,
    branchName,
    senderName,setSenderName,
    zoneName, setZoneName,
    zones,
    requesterName, setRequesterName,
    handlePreSubmitCheck,
    totalCartItems,
    cart, updateQuantity, removeFromCart,
    loading:loading||!editReady||Boolean(editError), cartBounce,
  };

  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800 relative pb-24 lg:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="relative bg-white border border-blue-100/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-[#1a3a6e] via-[#c8a230] to-[#1a3a6e]" />
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #1a3a6e 0%, transparent 60%)' }} />

          <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden border border-blue-100 shadow-inner">
                <img src="/Logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-800 leading-tight">
                  ใบเบิกของ สำเพ็ง บุรีรัมย์
                </h1>
                <p className="text-[10px] font-bold text-blue-700 mt-0.5 uppercase tracking-[0.15em]">
                  ระบบจัดการคำขอเบิกวัสดุอุปกรณ์
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {totalCartItems > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2">
                  <span className="text-xs font-black text-blue-800">🛒</span>
                  <span className="text-sm font-black text-blue-900">{totalCartItems} ชิ้น</span>
                  <span className="text-xs text-blue-400">|</span>
                  <span className="text-xs font-semibold text-blue-700">{cart.length} รายการ</span>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-center">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">ประเภท</span>
                <span className="text-xs font-black text-slate-600">Requisition Form</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white p-4"><p className="font-bold text-blue-900">{editId?'แก้ไขใบเบิกที่รออนุมัติ':'สร้างใบเบิกใหม่'} · {department.branch_name}</p></div>
        {editError&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{editError} <Link href="/requisition/my-requests" className="underline">กลับประวัติ</Link></p>}
        {!editReady&&!editError&&<p role="status">กำลังโหลดใบเบิก...</p>}
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* ── Left: items ── */}
          <div className="flex-1 w-full min-w-0">

            {/* Search bar */}
            <div className="relative mb-4 group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-300 group-focus-within:text-blue-700 transition-colors text-sm">🔍</span>
              <input
                type="text"
                placeholder="ค้นหาสินค้า เช่น กระดาษ A4, ปากกา..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 hover:border-blue-200 focus:border-blue-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-600/15 transition-all text-sm font-semibold text-slate-700 placeholder:text-slate-300 shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-300 hover:text-slate-500 transition-colors text-lg font-light"
                >×</button>
              )}
            </div>

            {filteredItems.length > 0 && (
              <p className="text-xs font-semibold text-slate-400 mb-3 px-0.5">
                {searchTerm
                  ? `พบ ${filteredItems.length} รายการสำหรับ "${searchTerm}"`
                  : `สินค้าทั้งหมด ${filteredItems.length} รายการ`}
              </p>
            )}

            {/* Items grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <span className="text-4xl block mb-2 opacity-30">📂</span>
                  <p className="text-slate-400 text-sm font-bold">
                    {searchTerm ? `ไม่พบสินค้า "${searchTerm}"` : 'ยังไม่มีสินค้าในระบบ'}
                  </p>
                </div>
              ) : (
                pagedItems.map((item) => {

                  const isClicked = clickedItemId === item.id;
                  const inCart    = cart.find((c) => c.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-all duration-200 group ${
                        isClicked
                          ? 'border-blue-400 ring-2 ring-blue-500/10 shadow-md shadow-blue-100'
                          : inCart
                          ? 'border-blue-200 shadow-sm shadow-blue-100/50'
                          : 'border-slate-100 hover:border-blue-200 hover:shadow-md hover:shadow-blue-50 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="relative aspect-square bg-slate-50 overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl opacity-20">📦</span>
                          </div>
                        )}
                        {inCart && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-md">
                            {inCart.quantity}
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2">
                          <span className="text-[10px] font-black text-blue-800 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-blue-100 shadow-sm">
                            {item.unit || 'ชิ้น'}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 flex flex-col gap-2 flex-1">
                        <h4 className="font-bold text-slate-800 text-xs leading-snug line-clamp-2 group-hover:text-blue-900 transition-colors flex-1">
                          {item.name}
                        </h4>
                        {item.stock_quantity != null && <p className="text-[10px] font-semibold text-slate-500">คงเหลือ {item.stock_quantity.toLocaleString('th-TH')} {item.unit}</p>}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => addToCart(item)}
                          className={`w-full py-2 rounded-xl font-black text-xs active:scale-95 transition-all border disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed ${
                            isClicked
                              ? 'bg-red-600 border-blue-800 text-white shadow-md shadow-blue-200'
                              : inCart
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'bg-blue-50 border-blue-100 text-blue-900 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-md hover:shadow-blue-200/50'
                          }`}
                        >
                          {isClicked ? '✓ เพิ่มแล้ว' : inCart ? `+ เพิ่ม (${inCart.quantity})` : '+ เพิ่มในตะกร้า'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t border-blue-100">
                <p className="text-xs font-semibold text-slate-400">
                  แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} จาก {filteredItems.length} รายการ
                </p>
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-blue-100 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm">
                    ← ก่อนหน้า
                  </button>
                  {buildPageNumbers(currentPage, totalPages).map((p, idx) =>
                    p === '…' ? (
                      <span key={`e${idx}`} className="px-1 text-slate-300 text-sm select-none">…</span>
                    ) : (
                      <button key={p} onClick={() => setCurrentPage(p as number)}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                          currentPage === p
                            ? 'bg-linear-to-br from-[#1a3a6e] to-[#2451a0] text-white shadow-md shadow-blue-700/40'
                            : 'border border-blue-100 bg-white text-blue-700 hover:bg-blue-50 shadow-sm'
                        }`}>{p}</button>
                    )
                  )}
                  <button onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-blue-100 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm">
                    ถัดไป →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Desktop cart ── */}
          <div className="hidden w-full min-w-0 max-w-full lg:block lg:w-80 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:sticky lg:top-6">
              <div className="bg-linear-to-r from-[#1a3a6e] to-[#2451a0] px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white text-base">📋</span>
                  <span className="font-black text-white text-sm">สรุปใบเบิกสินค้า</span>
                </div>
                {cart.length > 0 && (
                  <span className="bg-white/20 text-white text-xs font-black px-2.5 py-1 rounded-full border border-white/20">
                    {cart.length} รายการ
                  </span>
                )}
              </div>
              <div className="p-4">
                <CartFormContent {...cartFormProps} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile floating bar ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-blue-100 px-4 py-3 z-40 flex items-center justify-between shadow-[0_-8px_24px_rgba(244,63,94,0.08)]">
        <div className="flex items-center gap-3">
          <div className={`relative transition-transform duration-300 ${cartBounce ? 'scale-125' : 'scale-100'}`}>
            <span className="text-2xl">🛒</span>
            {totalCartItems > 0 && (
              <span className={`absolute -top-1.5 -right-2 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm transition-all ${
                cartBounce ? 'bg-red-600 scale-110' : 'bg-blue-500'
              }`}>
                {totalCartItems}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-black text-slate-700 leading-tight">
              {totalCartItems > 0 ? `${totalCartItems} ชิ้น` : 'ตะกร้าว่างอยู่'}
            </p>
            {cart.length > 0 && (
              <p className="text-[10px] text-blue-700 font-semibold">{cart.length} รายการ</p>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setIsCartOpen(true)}
          className="bg-linear-to-r from-[#1a3a6e] to-[#2451a0] text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-blue-700/25 active:scale-95 transition-all">
          ดูใบเบิก →
        </button>
      </div>

      {/* ── Mobile drawer backdrop ── */}
      <div
        className={`lg:hidden fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isCartOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsCartOpen(false)}
      />

      {/* ── Mobile drawer ── */}
      <div className={`lg:hidden fixed inset-y-0 right-0 w-full sm:w-96 bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
        isCartOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="bg-linear-to-r from-[#1a3a6e] to-[#2451a0] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white">📋</span>
            <h3 className="font-black text-white text-sm">สรุปใบเบิกสินค้า</h3>
          </div>
          <button type="button" onClick={() => setIsCartOpen(false)}
            className="text-white/70 hover:text-white text-2xl font-light w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">×</button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <CartFormContent {...cartFormProps} />
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-linear-to-r from-[#1a3a6e] to-[#112654] text-white p-5 flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <h3 className="font-black text-base">ตรวจสอบรายละเอียดใบเบิก</h3>
                <p className="text-xs text-blue-100 mt-0.5 font-medium">กรุณาตรวจสอบความถูกต้องก่อนส่ง</p>
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-100">
                  <span className="block text-[10px] font-black text-blue-700 uppercase tracking-wider">แผนก</span>
                  <span className="font-black text-slate-800 text-sm mt-1 block">{branchName}</span>
                </div>
                {zoneName && (
                  <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-100">
                    <span className="block text-[10px] font-black text-blue-700 uppercase tracking-wider">โซน</span>
                    <span className="font-black text-slate-800 text-sm mt-1 block">{zoneName}</span>
                  </div>
                )}
                <div className={`bg-blue-50 p-3.5 rounded-xl border border-blue-100 ${!zoneName ? 'col-span-1' : ''}`}>
                  <span className="block text-[10px] font-black text-blue-700 uppercase tracking-wider">ผู้เบิก</span>
                  <span className="font-black text-slate-800 text-sm mt-1 block">{requesterName}</span>{(zones.length>0||branchName==='จัดเรียง')&&<p className="mt-1 text-xs text-blue-900">ผู้ส่งใบเบิก: {senderName}</p>}
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                  รายการสินค้า ({totalCartItems} ชิ้น / {cart.length} รายการ)
                </span>
                {note&&<p className="mb-3 whitespace-pre-wrap text-sm text-blue-900">หมายเหตุ: {note}</p>}
                <div className="rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100 max-h-60 overflow-y-auto shadow-sm">
                  {cart.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 shrink-0 flex items-center justify-center">
                          {item.image_url
                            ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            : <span className="text-xs">📦</span>}
                        </div>
                        <span className="font-bold text-slate-700 truncate text-xs">{item.name}</span>
                      </div>
                      <span className="font-black text-blue-900 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg text-xs ml-3 shrink-0">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setShowConfirmModal(false); setIsCartOpen(true); }}
                className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-xl font-bold hover:bg-slate-100 active:scale-[0.98] transition-all text-sm">
                ← แก้ไข
              </button>
              <button type="button" onClick={handleConfirmSubmit}
                className="w-full bg-linear-to-r from-[#1a3a6e] to-[#112654] text-white py-3 rounded-xl font-black hover:opacity-90 shadow-lg shadow-blue-200 active:scale-[0.98] transition-all text-sm">
                {editId?'ยืนยันบันทึกการแก้ไข ✓':'ยืนยันส่งใบเบิก ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RequisitionRoute(){const id=useSearchParams().get('edit');return <RequisitionForm key={id||'new'} editId={id}/>;}
export default function RequisitionPage(){return <Suspense fallback={<p className="p-10 text-center">กำลังโหลดใบเบิก...</p>}><RequisitionRoute/></Suspense>;}
