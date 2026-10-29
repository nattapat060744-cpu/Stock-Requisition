import {supabase} from '@/lib/supabase';
export type DepartmentSession={token:string;branch_id:string|null;branch_name:string;expires_at:string;role?:'department'|'stock'|'admin';remember?:boolean};
export const DEPARTMENT_SESSION_KEY='sampeng_department_session_v1';
function read(storage:Storage,remember:boolean):DepartmentSession|null {
 try {
  const value=JSON.parse(storage.getItem(DEPARTMENT_SESSION_KEY)||'null');
  if(!value)return null;
  if(typeof value.token!=='string'||!(typeof value.branch_id==='string'||(value.branch_id===null&&value.role==='admin'))||!((value.expires_at==='infinity'||Date.parse(value.expires_at)>Date.now()))){storage.removeItem(DEPARTMENT_SESSION_KEY);return null;}
  return {...value,remember};
 }catch{return null;}
}
export function savedDepartmentSession():DepartmentSession|null {
 return read(localStorage,true)||read(sessionStorage,false);
}
export function saveDepartmentSession(value:DepartmentSession|null){
 if(value?.remember){localStorage.setItem(DEPARTMENT_SESSION_KEY,JSON.stringify(value));sessionStorage.removeItem(DEPARTMENT_SESSION_KEY);}
 else if(value){sessionStorage.setItem(DEPARTMENT_SESSION_KEY,JSON.stringify(value));localStorage.removeItem(DEPARTMENT_SESSION_KEY);}
 else {sessionStorage.removeItem(DEPARTMENT_SESSION_KEY);localStorage.removeItem(DEPARTMENT_SESSION_KEY);}
}
export function clearTabDepartmentSession(){sessionStorage.removeItem(DEPARTMENT_SESSION_KEY);}
export async function validateDepartmentSession(token:string,remember=false){
 const {data,error}=await supabase.rpc('department_session_info',{p_token:token});if(error)throw error;
 return {...data,token,remember} as DepartmentSession;
}
