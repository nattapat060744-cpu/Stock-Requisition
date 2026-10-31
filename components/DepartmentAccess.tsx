'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import AdminNav from '@/components/AdminNav';
import BrandMark from '@/components/BrandMark';
import EmployeeNav from '@/components/EmployeeNav';
import workspaceStyles from '@/components/adminWorkspace.module.css';
import {supabase} from '@/lib/supabase';
import {savedDepartmentSession,saveDepartmentSession,validateDepartmentSession,clearTabDepartmentSession,DEPARTMENT_SESSION_KEY,type DepartmentSession} from '@/lib/departmentSession';
import {requestError} from '@/lib/requisitionRules';
const Context=createContext<DepartmentSession|null>(null);
/** พื้นหลังออโรร่า: ลูกบอลแสงม่วง/คอรัลลอยเบา ๆ */
function Aurora(){return <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"></div>;}
export function useAccessSession(){const session=useContext(Context);if(!session)throw new Error('กรุณาเข้าใช้งานก่อน');return session;}
export function useDepartment(){
 const session=useAccessSession();
 if(!session?.branch_id)throw new Error('กรุณาเลือกแผนกก่อนเข้าใช้งาน');
 return session as DepartmentSession & {branch_id:string};
}
export default function DepartmentAccess({children,adminOnly=false}:{children:ReactNode;adminOnly?:boolean}){
 const [session,setSession]=useState<DepartmentSession|null>(null),[ready,setReady]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [remember,setRemember]=useState(true),[show,setShow]=useState(false);
 const [choose,setChoose]=useState(false),[branches,setBranches]=useState<{id:string;name:string}[]>([]);
 useEffect(()=>{
  let alive=true,sequence=0;
  const restore=async()=>{
   const request=++sequence;const saved=savedDepartmentSession();
   if(!saved){if(alive){setSession(null);setReady(true);}return;}
   try{const value=await validateDepartmentSession(saved.token,Boolean(saved.remember));if(alive&&request===sequence&&savedDepartmentSession()?.token===saved.token){setSession(value);saveDepartmentSession(value);setError('');}}
   catch(error){if(alive&&request===sequence&&savedDepartmentSession()?.token===saved.token){if(/หมดอายุ|ไม่ถูกต้อง/.test(requestError(error))){setSession(null);saveDepartmentSession(null);}else setError('ตรวจสอบการเข้าใช้งานไม่สำเร็จ กรุณาลองเปิดหน้าใหม่อีกครั้ง');}}
   finally{if(alive&&request===sequence)setReady(true);}
  };
  const changed=(event:StorageEvent)=>{if(event.key===DEPARTMENT_SESSION_KEY||event.key===null){clearTabDepartmentSession();void restore();}};
  const focused=()=>{if(document.visibilityState==='visible')void restore();};
  void restore();window.addEventListener('storage',changed);window.addEventListener('focus',focused);document.addEventListener('visibilitychange',focused);
  return()=>{alive=false;window.removeEventListener('storage',changed);window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',focused);};
 },[]);
 useEffect(()=>{
  if(!session||session.expires_at==='infinity')return;
  const expires=Date.parse(session.expires_at);
  let timer:ReturnType<typeof setTimeout>;
  const expire=()=>{const remaining=expires-Date.now();if(remaining<=0){saveDepartmentSession(null);setSession(null);}else timer=setTimeout(expire,Math.min(remaining,86400000));};
  timer=setTimeout(expire,Math.min(Math.max(0,expires-Date.now()),86400000));
  return()=>clearTimeout(timer);
 },[session]);
 const role=session?.role;
 useEffect(()=>{
  if(role!=='admin'||adminOnly)return;
  let alive=true;
  void supabase.from('branches').select('id,name').order('name').then(({data,error})=>{if(!alive)return;if(error)setError(requestError(error));else setBranches(data||[]);});
  return()=>{alive=false;};
 },[role,adminOnly]);
 async function login(event:React.FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const {data,error}=await supabase.rpc('department_login',remember?{p_code:code.trim(),p_remember:true}:{p_code:code.trim()});if(error)throw error;const value={...data,remember};saveDepartmentSession(value);setSession(value);setCode('');setChoose(false);}
  catch(error){setError(requestError(error));}finally{setBusy(false);}
 }
 async function logout(){const old=session;saveDepartmentSession(null);setSession(null);setChoose(false);setError('');if(old)await supabase.rpc('department_logout',{p_token:old.token});}
 async function selectBranch(id:string){
  if(!session||busy)return;setBusy(true);setError('');
  try{const {data,error}=await supabase.rpc('admin_select_department',{p_token:session.token,p_branch_id:id});if(error)throw error;const value={...data,remember:Boolean(session.remember)};saveDepartmentSession(value);setSession(value);setChoose(false);}
  catch(error){setError(requestError(error));}finally{setBusy(false);}
 }
 const card='relative w-full max-w-md animate-pop rounded-3xl border border-white/80 bg-white/85 p-7 shadow-2xl shadow-brand-900/15 backdrop-blur-xl sm:p-8';
 const shell='relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4';
 if(!ready)return <main className={shell}><Aurora/><p role="status" className="flex items-center gap-3 text-sm font-semibold text-brand-900"><span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700"/>กำลังตรวจสอบสิทธิ์...</p></main>;
 if(!session)return <main className={shell}><Aurora/><form onSubmit={login} className={card+' space-y-5'}><div className="flex flex-col items-center gap-3 text-center"><BrandMark size={56}/><div><p className="text-brand-700 text-sm font-extrabold">ระบบเบิกของ</p><h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900">{adminOnly?'เข้าสู่หลังบ้าน':'เข้าใช้งานระบบ'}</h1></div><p className="text-sm leading-relaxed text-slate-500">{adminOnly?'ใช้รหัสแผนกสต็อก หรือรหัสแอดมินกลาง เพื่อดูแลระบบ':'ใช้รหัสแผนกเพื่อเบิกและดูประวัติ หรือใช้รหัสแอดมินกลางเพื่อเลือกเข้าได้ทุกแผนก'}</p></div><label className="block text-sm font-bold text-slate-700">รหัสแผนก<span className="relative mt-2 block"><input autoComplete="current-password" type={show?'text':'password'} required maxLength={100} value={code} onChange={e=>setCode(e.target.value)} placeholder="กรอกรหัสของคุณ" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-12 text-base outline-none transition-all hover:border-brand-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'ซ่อนรหัส':'แสดงรหัส'} aria-pressed={show} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-700"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{show?<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>:<><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9"/></>}</svg></button></span></label><label className="flex items-center gap-2.5 text-sm text-slate-600"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-brand-700"/>จดจำการเข้าใช้งานบนเครื่องนี้</label>{error&&<p key={error} role="alert" className="animate-shake rounded-xl border border-red-200 border-l-4 border-l-red-500 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}<button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-bold text-white shadow-lg shadow-brand-600/30 hover:-translate-y-px hover:shadow-xl hover:shadow-brand-600/40 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0">{busy?<><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>กำลังตรวจสอบ...</>:'เข้าใช้งาน →'}</button><Link href="/xXMaINXx" className="block text-center text-sm font-semibold text-brand-700 hover:underline">← กลับหน้าหลัก</Link></form></main>;
 if(adminOnly&&role!=='admin'&&role!=='stock')return <main className={shell}><Aurora/><section className={card+' space-y-5 text-center'}><BrandMark size={52} className="mx-auto"/><h1 className="text-xl font-extrabold text-slate-900">หน้านี้สำหรับแผนกสต็อกและแอดมินกลาง</h1><p className="text-sm text-slate-500">ขณะนี้เข้าใช้ด้วยแผนก <b className="text-slate-700">{session.branch_name}</b></p><div className="flex flex-col gap-2"><Link href="/requisition" className="flex h-11 items-center justify-center rounded-xl border border-brand-200 font-bold text-brand-800 hover:bg-brand-50">กลับหน้าเบิกของแผนก</Link><button onClick={()=>void logout()} className="h-11 rounded-xl bg-brand-600 font-bold text-white shadow-md shadow-brand-600/25 hover:-translate-y-px">เข้าด้วยรหัสอื่น</button></div></section></main>;
 if(role==='admin'&&!adminOnly&&(!session.branch_id||choose))return <main className="relative isolate min-h-screen overflow-hidden bg-canvas p-4 sm:p-8"><Aurora/><section className="mx-auto max-w-4xl animate-pop space-y-6 rounded-3xl border border-white/80 bg-white/85 p-6 shadow-2xl shadow-brand-900/15 backdrop-blur-xl sm:p-8"><div className="flex items-center gap-3"><BrandMark size={44}/><div><p className="text-xs font-bold text-brand-700">แอดมินกลาง</p><h1 className="text-xl font-extrabold text-slate-900">เลือกแผนกที่ต้องการเข้าใช้งาน</h1></div></div><p className="text-sm text-slate-500">เลือกแผนกเพื่อเบิกสินค้า ดูประวัติ และแก้ไขใบเบิกที่รออนุมัติของแผนกนั้น</p><div className="flex flex-wrap gap-2"><Link href="/admin/dashboard" className="inline-flex h-10 items-center rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-md shadow-brand-600/25 hover:-translate-y-px">ไปหลังบ้าน →</Link>{session.branch_id&&<button onClick={()=>setChoose(false)} className="inline-flex h-10 items-center rounded-full border border-brand-200 px-4 text-sm font-bold text-brand-800 hover:bg-brand-50">กลับแผนกเดิม</button>}<button onClick={()=>void logout()} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-slate-500 hover:bg-slate-100">ออกจากระบบ</button></div>{error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<div className="stagger-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{branches.map(branch=><button key={branch.id} disabled={busy} onClick={()=>void selectBranch(branch.id)} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left font-bold text-slate-800 transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-lift disabled:opacity-40"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-base font-black text-brand-700 transition-all duration-300  group-hover:bg-brand-600 group-hover:text-white group-hover:rotate-6">{branch.name.trim().slice(0,1)}</span><span className="min-w-0 flex-1 truncate">{branch.name}</span><span aria-hidden="true" className="text-brand-600 transition-transform group-hover:translate-x-1">→</span></button>)}</div>{!branches.length&&!error&&<p role="status" className="text-sm text-slate-500">กำลังโหลดแผนก...</p>}</section></main>;
 if(adminOnly)return <Context.Provider value={session}><div className={workspaceStyles.shell}><AdminNav accountLabel={role==='admin'?'แอดมินกลาง':'ผู้ดูแล · สต็อก'} onLogout={()=>void logout()}/><div className={workspaceStyles.workspace}>{children}</div></div></Context.Provider>;
 return <Context.Provider value={session}><EmployeeNav session={session} onChooseDepartment={role==='admin'?()=>setChoose(true):undefined} onLogout={()=>void logout()}/><div key={session.branch_id||'admin'}>{children}</div></Context.Provider>;
}
