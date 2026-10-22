'use client';
import {useEffect,useRef,useState} from 'react';
import AdminNav from '@/components/AdminNav';
import ReportPagination from '@/components/ReportPagination';
import {supabase} from '@/lib/supabase';
import {exportReportExcel} from '@/lib/reportExports';

type Item={id:string;product_code:string|null;name:string;unit:string;stock_quantity:number|null;image_url:string|null};
type CountLine={id:string;item_name:string;product_code:string;unit:string;before_quantity:number|null;counted_quantity:number};
type History={id:string;counted_by:string;note:string;created_at:string;stocktake_lines:CountLine[]};

async function readItems(){
 const result:Item[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from('items').select('id,product_code,name,unit,stock_quantity,image_url').order('name').order('id').range(offset,offset+499);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<500)return result;
 }
}

const msg=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String(e.message):'ไม่สามารถทำรายการได้';
const DRAFT_KEY = 'stocktake_draft_counts';

export default function StocktakePage(){
 const [items,setItems]=useState<Item[]>([]),[counts,setCounts]=useState<Record<string,string>>({}),[name,setName]=useState(''),[note,setNote]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[history,setHistory]=useState<History[]>([]),[historyPage,setHistoryPage]=useState(1),[historyTotal,setHistoryTotal]=useState(0),[historyError,setHistoryError]=useState(''),[revision,setRevision]=useState(0),[exporting,setExporting]=useState(false);

 const [selectedImage,setSelectedImage]=useState<{url:string;name:string}|null>(null);
 const imageDialogRef=useRef<HTMLDialogElement>(null);
 const request=useRef(''),lock=useRef(false);

 useEffect(()=>{
  try {
   const savedDraft = localStorage.getItem(DRAFT_KEY);
   if (savedDraft) setCounts(JSON.parse(savedDraft));
  } catch {}
 },[]);

 useEffect(()=>{
  if(selectedImage&&imageDialogRef.current&&!imageDialogRef.current.open){
   imageDialogRef.current.showModal();
  }
 },[selectedImage]);

 useEffect(()=>{let alive=true;void readItems().then(data=>{if(alive)setItems(data);}).catch(e=>{if(alive)setError(msg(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 useEffect(()=>{let alive=true;void supabase.from('stocktakes').select('id,counted_by,note,created_at,stocktake_lines(id,item_name,product_code,unit,before_quantity,counted_quantity)',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((historyPage-1)*10,historyPage*10-1).then(({data,error,count})=>{if(!alive)return;if(error)setHistoryError('กรุณารัน SQL ตั้งค่าตรวจนับคลังก่อนใช้งาน: '+error.message);else{setHistoryError('');setHistory((data||[]) as History[]);setHistoryTotal(count||0);}});return()=>{alive=false;};},[historyPage,revision]);

 const entered=items.filter(item=>(counts[item.id]??'').trim()!=='');
 const valid=entered.every(item=>/^\d+$/.test(counts[item.id])&&Number.isSafeInteger(Number(counts[item.id]))&&Number(counts[item.id])<=2147483647);
 const visible=items.filter(item=>(item.name+' '+(item.product_code||'')).toLowerCase().includes(search.toLowerCase()));
 const visiblePage=Math.min(page,Math.max(1,Math.ceil(visible.length/20)));

 const saveDraft = () => {
  try {
   localStorage.setItem(DRAFT_KEY, JSON.stringify(counts));
   setNotice('💾 บันทึกยอดนับร่างชั่วคราวเรียบร้อยแล้ว');
   setError('');
  } catch {
   setError('ไม่สามารถบันทึกร่างได้');
  }
 };

 const clearDraft = () => {
  if (!confirm('ยืนยันล้างรายการที่พิมพ์ค้างไว้ทั้งหมด?')) return;
  localStorage.removeItem(DRAFT_KEY);
  setCounts({});
  setNotice('ล้างยอดร่างเรียบร้อยแล้ว');
 };

 const refresh=async()=>{
  if(entered.length&&!confirm('โหลดข้อมูลใหม่และล้างยอดที่กรอกไว้ เพื่อเริ่มตรวจนับใหม่?'))return;
  setLoading(true);
  setError('');
  try{
   setItems(await readItems());
   setCounts({});
   localStorage.removeItem(DRAFT_KEY);
   request.current='';
  }catch(e){
   setError(msg(e));
  }finally{
   setLoading(false);
  }
 };

 const save=async()=>{
  if(lock.current)return;
  if(!name.trim()||!entered.length||!valid){setError('ระบุชื่อผู้ตรวจนับ และยอดนับจริงที่เป็นจำนวนเต็มอย่างน้อย 1 รายการ');return;}
  if(entered.length>500){setError('บันทึกได้ครั้งละไม่เกิน 500 รายการ');return;}
  if(!confirm('ยืนยันปรับยอดคลังตามยอดนับจริง '+entered.length+' รายการ และบันทึกประวัติ?'))return;
  lock.current=true;
  setBusy(true);
  setError('');
  setNotice('');
  if(!request.current)request.current=crypto.randomUUID();
  try{
   const {error}=await supabase.rpc('confirm_stocktake',{p_request_id:request.current,p_counted_by:name.trim(),p_note:note,p_lines:entered.map(item=>({item_id:item.id,expected:item.stock_quantity,expected_unit:item.unit,counted:Number(counts[item.id])}))});
   if(error)throw error;
   setItems(current=>current.map(item=>counts[item.id]!==undefined&&counts[item.id]!==''?{...item,stock_quantity:Number(counts[item.id])}:item));
   setCounts({});
   localStorage.removeItem(DRAFT_KEY);
   request.current='';
   setNotice('ปรับยอดคลังและบันทึกประวัติเรียบร้อยแล้ว');
   setNote('');
   setHistoryPage(1);
   setRevision(value=>value+1);
  }catch(e){
   setError(msg(e));
  }finally{
   lock.current=false;
   setBusy(false);
  }
 };

 const change=(id:string,value:string)=>{request.current='';setCounts(current=>({...current,[id]:value}));};

 return (
  <main className="min-h-screen bg-[#e8edf5] p-3 text-slate-800 sm:p-6">
   <div className="mx-auto max-w-[1500px] space-y-5">
    <AdminNav activeHref="/admin/inventory"/>
    <section className="rounded-2xl border border-blue-100 bg-white p-5">
     <div className="flex flex-wrap justify-between gap-3">
      <div>
       <h1 className="text-xl font-black text-blue-900">ตรวจนับคลัง / ปรับยอด</h1>
       <p className="mt-1 text-sm text-slate-500">กรอกเฉพาะสินค้าที่ตรวจนับ เว้นว่าง = ไม่ปรับยอด · 0 = สินค้าหมด · ส่วนต่างเทียบยอดก่อนเริ่มนับ</p>
      </div>
      <a href="/admin/inventory" className="text-sm font-bold text-blue-900">กลับหน้าคลัง →</a>
     </div>
     <fieldset disabled={busy||loading} className="mt-4 space-y-4">
      
      {/* บรรทัดที่ 1: ชื่อผู้ตรวจนับ + หมายเหตุ */}
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="text-sm font-bold">
        ชื่อผู้ตรวจนับ *
        <input maxLength={200} placeholder="ระบุชื่อผู้ตรวจนับ..." className="mt-1 w-full rounded-xl border border-blue-100 p-3 outline-none focus:ring-2 focus:ring-blue-300" value={name} onChange={e=>{request.current='';setName(e.target.value);}}/>
       </label>
       <label className="text-sm font-bold">
        หมายเหตุ
        <input maxLength={2000} placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)..." className="mt-1 w-full rounded-xl border border-blue-100 p-3 outline-none focus:ring-2 focus:ring-blue-300" value={note} onChange={e=>{request.current='';setNote(e.target.value);}}/>
       </label>
      </div>

      {/* บรรทัดที่ 2: ปุ่มจัดการฝั่งซ้าย + ค้นหาสินค้าฝั่งขวา */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 pt-2 border-t border-blue-50">
       <div className="flex flex-wrap items-center gap-2">
        <button onClick={()=>void refresh()} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-blue-50 transition-all">🔄 โหลดคลังใหม่</button>
        <button onClick={saveDraft} disabled={!entered.length} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition-all">💾 บันทึกร่าง</button>
        {entered.length > 0 && <button onClick={clearDraft} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-all">🗑️ ล้างร่าง</button>}
        <button disabled={exporting||!entered.length||!valid} onClick={async()=>{setExporting(true);try{await exportReportExcel('ผลตรวจนับคลัง',['รหัสสินค้า','สินค้า','หน่วย','ยอดระบบ','นับจริง','ส่วนต่าง'],entered.map(item=>[item.product_code||'',item.name,item.unit,item.stock_quantity,Number(counts[item.id]),item.stock_quantity===null?'ยังไม่ระบุ':Number(counts[item.id])-item.stock_quantity]),'Sampeng-stocktake.xlsx','ผู้ตรวจนับ: '+name);}catch(e){setError(msg(e));}finally{setExporting(false);}}} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-900 hover:bg-blue-50 disabled:opacity-40 transition-all">📊 Export ยอดตรวจนับ</button>
        <button disabled={!entered.length||!valid||Boolean(historyError)} onClick={()=>void save()} className="rounded-xl bg-linear-to-r from-[#1a3a6e] to-[#2451a0] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-900/20 disabled:opacity-40 transition-all">✅ ยืนยันปรับยอด {entered.length} รายการ</button>
       </div>

       {/* ช่องค้นหาสินค้า ย้ายมาไว้ฝั่งขวาบรรทัดนี้ */}
       <div className="w-full lg:w-72 shrink-0">
        <label className="text-sm font-bold block mb-1">🔍 ค้นหาสินค้า</label>
        <input placeholder="พิมพ์รหัสหรือชื่อสินค้า..." className="w-full rounded-xl border border-blue-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
       </div>
      </div>
     </fieldset>
    </section>

    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{notice}</p>}

    <section className="rounded-2xl border border-blue-100 bg-white p-5">
     {loading?<p>กำลังโหลด...</p>:<div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-blue-50 text-blue-900"><tr>{['รูป','สินค้า','หน่วย','ยอดระบบ','นับจริง','ส่วนต่าง'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{visible.slice((visiblePage-1)*20,visiblePage*20).map(item=><tr key={item.id} className="border-b border-blue-50">
      <td className="p-3">
       <button type="button" disabled={!item.image_url} onClick={()=>{if(item.image_url)setSelectedImage({url:item.image_url,name:item.name});}} className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-blue-50 enabled:cursor-zoom-in enabled:hover:ring-2 enabled:hover:ring-blue-400">
        <span className="text-xl" aria-hidden="true">📦</span>
        {item.image_url&&<img src={item.image_url} alt={item.name} loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(e)=>{e.currentTarget.style.display='none';}}/>}
       </button>
      </td>
      <td className="p-3 font-bold">{item.product_code} · {item.name}</td>
      <td className="p-3">{item.unit}</td>
      <td className="p-3">{item.stock_quantity??'ยังไม่ระบุ'}</td>
      <td className="p-3"><input aria-label={'ยอดนับ '+item.name} disabled={busy} className="w-28 rounded-lg border border-blue-200 p-2" type="number" min={0} max={2147483647} step={1} value={counts[item.id]??''} onChange={e=>change(item.id,e.target.value)}/></td>
      <td className="p-3 font-bold">{counts[item.id]!==undefined&&counts[item.id]!==''&&item.stock_quantity!==null?Number(counts[item.id])-item.stock_quantity:'—'}</td>
     </tr>)}</tbody></table>{!visible.length&&<p className="p-6 text-center">ไม่พบสินค้า</p>}</div>}
     <ReportPagination page={visiblePage} totalRows={visible.length} onChange={setPage}/>
    </section>

    <section className="rounded-2xl border border-blue-100 bg-white p-5">
     <h2 className="mb-4 text-lg font-black text-blue-900">ประวัติการตรวจนับ / ปรับยอด</h2>
     {historyError&&<p role="alert" className="text-sm text-red-700">{historyError}</p>}
     {history.map(record=><details key={record.id} className="mb-3 rounded-xl border border-blue-100 p-3"><summary className="cursor-pointer font-bold">{new Date(record.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {record.counted_by} · {record.stocktake_lines.length} รายการ</summary><p className="my-2 text-sm">{record.note}</p>{record.stocktake_lines.map(line=><p key={line.id} className="border-t border-blue-50 py-2 text-sm">{line.product_code} · {line.item_name}: {line.before_quantity??'ยังไม่ระบุ'} → {line.counted_quantity} {line.unit} · ส่วนต่าง {line.before_quantity===null?'—':line.counted_quantity-line.before_quantity}</p>)}</details>)}
     {!history.length&&!historyError&&<p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}
     <ReportPagination page={historyPage} totalRows={historyTotal} pageSize={10} onChange={setHistoryPage}/>
    </section>
   </div>

   {selectedImage&&(
    <dialog ref={imageDialogRef} aria-label={`รูปสินค้า ${selectedImage.name}`} onClose={()=>setSelectedImage(null)} onClick={(e)=>{if(e.target===e.currentTarget)imageDialogRef.current?.close();}} className="fixed inset-0 m-auto h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/80 open:flex open:items-center open:justify-center">
     <div className="relative max-w-5xl rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl sm:p-5">
      <button type="button" autoFocus aria-label="ปิดรูปขยาย" onClick={()=>imageDialogRef.current?.close()} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3a6e] text-xl font-bold text-white shadow-md hover:bg-blue-700">×</button>
      <img src={selectedImage.url} alt={selectedImage.name} className="max-h-[75dvh] max-w-full rounded-xl object-contain"/>
      <p className="mt-3 text-center text-sm font-bold text-[#1a3a6e]">{selectedImage.name}</p>
     </div>
    </dialog>
   )}
  </main>
 );
}