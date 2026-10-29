import {supabase} from '@/lib/supabase';
export const EMPLOYEE_FILTER_KEY='sampeng_employee_request_filter';
export const REQUEST_STATUSES={pending:{label:'รออนุมัติ',description:'รอผู้ดูแลตรวจสอบใบเบิก',color:'border-amber-200 bg-amber-50 text-amber-800'},approved:{label:'อนุมัติแล้ว',description:'ผู้ดูแลอนุมัติใบเบิกแล้ว',color:'border-emerald-200 bg-emerald-50 text-emerald-800'},rejected:{label:'ไม่อนุมัติ',description:'ใบเบิกนี้ไม่ผ่านการอนุมัติ',color:'border-rose-200 bg-rose-50 text-rose-800'}} as const;
export type RequestStatus=keyof typeof REQUEST_STATUSES;
export type EmployeeFilters={name:string;branch:string;zone:string;from:string;to:string};
export const EMPTY_EMPLOYEE_FILTERS:EmployeeFilters={name:'',branch:'',zone:'',from:'',to:''};
export type RequestDetail={id:string;quantity:number;items:{name:string;unit:string;image_url:string|null}|null};
export type EmployeeRequest={id:string;created_at:string;requester_name:string;branch_name:string;zone_name:string|null;sender_name:string|null;status:string;requisition_details:RequestDetail[]};
export function normalizeEmployeeFilters(value:unknown):EmployeeFilters{
 const data=value&&typeof value==='object'?value as Record<string,unknown>:{};const text=(key:string)=>typeof data[key]==='string'?String(data[key]).trim():'';
 return {name:text('name').slice(0,200),branch:text('branch'),zone:text('zone'),from:/^\d{4}-\d{2}-\d{2}$/.test(text('from'))?text('from'):'',to:/^\d{4}-\d{2}-\d{2}$/.test(text('to'))?text('to'):''};
}
export function nextThaiDateBoundary(date:string){const end=new Date(date+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);return end.toISOString().slice(0,10)+'T00:00:00+07:00';}
function filteredQuery(filters:EmployeeFilters,columns:string,head=false){
 let query=supabase.from('requisitions').select(columns,{count:'exact',head});
 if(filters.name)query=query.ilike('requester_name','%'+filters.name.replace(/[\\%_]/g,'\\$&')+'%');
 if(filters.branch)query=query.eq('branch_name',filters.branch);if(filters.zone)query=query.eq('zone_name',filters.zone);
 if(filters.from)query=query.gte('created_at',filters.from+'T00:00:00+07:00');if(filters.to)query=query.lt('created_at',nextThaiDateBoundary(filters.to));return query;
}
export async function readEmployeeRequests(filters:EmployeeFilters,status:RequestStatus|'all',page:number){
 let query=filteredQuery(filters,'id,created_at,requester_name,branch_name,zone_name,sender_name,status,requisition_details(id,quantity,items(name,unit,image_url))');if(status!=='all')query=query.eq('status',status);
 const [entries,...stats]=await Promise.all([query.order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1),...(['all','pending','approved','rejected'] as const).map(value=>{const q=filteredQuery(filters,'id',true);return value==='all'?q:q.eq('status',value);})]);
 if(entries.error)throw entries.error;for(const stat of stats)if(stat.error)throw stat.error;
 return {rows:(entries.data||[]) as unknown as EmployeeRequest[],total:entries.count||0,counts:{all:stats[0].count||0,pending:stats[1].count||0,approved:stats[2].count||0,rejected:stats[3].count||0}};
}
