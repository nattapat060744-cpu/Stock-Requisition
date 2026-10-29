'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import AdminNav from '@/components/AdminNav';
import EmployeeNav from '@/components/EmployeeNav';
import workspaceStyles from '@/components/adminWorkspace.module.css';
import {supabase} from '@/lib/supabase';
import {savedDepartmentSession,saveDepartmentSession,validateDepartmentSession,clearTabDepartmentSession,DEPARTMENT_SESSION_KEY,type DepartmentSession} from '@/lib/departmentSession';
import {requestError} from '@/lib/requisitionRules';
const Context=createContext<DepartmentSession|null>(null);
export function useAccessSession(){const session=useContext(Context);if(!session)throw new Error('กรุณาเข้าใช้งานก่อน');return session;}
export function useDepartment(){
 const session=useAccessSession();
 if(!session?.branch_id)throw new Error('กรุณาเลือกแผนกก่อนเข้าใช้งาน');
 return session as DepartmentSession & {branch_id:string};
}
export default function DepartmentAccess({children,adminOnly=false}:{children:ReactNode;adminOnly?:boolean}){
 const [session,setSession]=useState<DepartmentSession|null>(null),[ready,setReady]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [remember,setRemember]=useState(true);
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
 if(!ready)return <p className="p-10 text-center text-blue-900">กำลังตรวจสอบสิทธิ์...</p>;
 if(!session)return <main className="flex min-h-screen items-center justify-center bg-[#e8edf5] p-4"><form onSubmit={login} className="w-full max-w-md space-y-5 rounded-2xl border border-blue-100 bg-white p-7 shadow-sm"><h1 className="text-xl font-black text-[#1a3a6e]">{adminOnly?'เข้าสู่หลังบ้าน':'เข้าใช้งานระบบเบิกสินค้า'}</h1><p className="text-sm text-slate-600">{adminOnly?'ใช้รหัสแผนกสต็อก หรือรหัสแอดมินกลาง เพื่อดูแลระบบ':'ใช้รหัสแผนกเพื่อเบิกและดูประวัติ หรือใช้รหัสแอดมินกลางเพื่อเลือกเข้าได้ทุกแผนก'}</p><label className="block font-bold text-blue-900">รหัสแผนก / รหัสแอดมิน<input autoComplete="current-password" type="password" required maxLength={100} value={code} onChange={e=>setCode(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-blue-200 px-3"/></label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="h-4 w-4 rounded border-blue-200 accent-[#1a3a6e]"/>จดจำการเข้าใช้งานบนเครื่องนี้</label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="h-12 w-full rounded-xl bg-[#1a3a6e] font-bold text-white disabled:opacity-50">{busy?'กำลังตรวจสอบ...':'เข้าใช้งาน'}</button><Link href="/xXMaINXx" className="block text-center text-sm text-blue-800">กลับหน้าหลัก</Link></form></main>;
 if(adminOnly&&role!=='admin'&&role!=='stock')return <main className="flex min-h-screen items-center justify-center bg-[#e8edf5] p-5"><section className="max-w-lg space-y-5 rounded-2xl bg-white p-7"><h1 className="text-xl font-bold text-blue-900">หน้านี้สำหรับแผนกสต็อกและแอดมินกลาง</h1><p>ขณะนี้เข้าใช้ด้วยแผนก {session.branch_name}</p><Link href="/requisition" className="block font-bold text-blue-800">กลับหน้าเบิกของแผนก</Link><button onClick={()=>void logout()} className="rounded-xl bg-[#1a3a6e] px-4 py-3 font-bold text-white">เข้าด้วยรหัสอื่น</button></section></main>;
 if(role==='admin'&&!adminOnly&&(!session.branch_id||choose))return <main className="min-h-screen bg-[#e8edf5] p-5"><section className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-blue-100 bg-white p-6"><h1 className="text-xl font-black text-[#1a3a6e]">แอดมินกลาง · เลือกแผนกที่ต้องการเข้าใช้งาน</h1><p className="text-sm text-slate-600">เลือกแผนกเพื่อเบิกสินค้า ดูประวัติ และแก้ไขใบเบิกที่รออนุมัติของแผนกนั้น</p><div className="flex flex-wrap gap-4"><Link href="/admin/dashboard" className="font-bold text-blue-800">ไปหลังบ้าน →</Link>{session.branch_id&&<button onClick={()=>setChoose(false)} className="font-bold text-blue-800">กลับแผนกเดิม</button>}<button onClick={()=>void logout()} className="font-bold text-slate-600">ออกจากระบบ</button></div>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{branches.map(branch=><button key={branch.id} disabled={busy} onClick={()=>void selectBranch(branch.id)} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-left font-bold text-blue-900 hover:bg-blue-100 disabled:opacity-40">{branch.name} →</button>)}</div>{!branches.length&&!error&&<p role="status">กำลังโหลดแผนก...</p>}</section></main>;
 if(adminOnly)return <Context.Provider value={session}><AdminNav accountLabel={role==='admin'?'แอดมินกลาง':'ผู้ดูแล · สต็อก'} onLogout={()=>void logout()}/><div className={workspaceStyles.workspace}>{children}</div></Context.Provider>;
 return <Context.Provider value={session}><EmployeeNav session={session} onChooseDepartment={role==='admin'?()=>setChoose(true):undefined} onLogout={()=>void logout()}/><div key={session.branch_id||'admin'}>{children}</div></Context.Provider>;
}
