'use client';
type Range={from:string;to:string};
const options=[['today','วันนี้'],['yesterday','เมื่อวาน'],['7days','7 วันล่าสุด'],['30days','30 วันล่าสุด'],['month','เดือนนี้'],['all','ทั้งหมด']] as const;
export function reportDateRange(key:string):Range{
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});if(key==='all')return {from:'',to:''};const start=new Date(today+'T12:00:00Z');const days=key==='yesterday'?1:key==='7days'?6:key==='30days'?29:0;start.setUTCDate(start.getUTCDate()-days);const from=key==='month'?today.slice(0,8)+'01':start.toISOString().slice(0,10);return {from,to:key==='yesterday'?from:today};
}
export default function ReportDatePresets({from,to,onChange}:{from:string;to:string;onChange:(range:Range)=>void}){return <div data-report-presets className="flex flex-wrap gap-2">{options.map(([key,label])=>{const range=reportDateRange(key),active=from===range.from&&to===range.to;return <button key={key} type="button" aria-pressed={active} onClick={()=>onChange(range)} className={'border px-3 py-2 font-bold transition-colors '+(active?'border-[#1a3a6e] bg-[#1a3a6e] text-white':'border-blue-100 bg-blue-50/40 text-slate-600 hover:bg-blue-100')}>{label}</button>;})}</div>;}
