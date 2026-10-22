'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
const StocktakeHistory=dynamic(()=>import('@/components/StocktakeHistory'),{loading:()=> <p>กำลังโหลดประวัติตรวจนับ...</p>});
const RequisitionHistory=dynamic(()=>import('@/components/RequisitionHistory'),{loading:()=> <p>กำลังโหลดประวัติ...</p>});
import AdminNav from '@/components/AdminNav';
import RequisitionReports from '@/components/RequisitionReports';
import POReports from '@/components/POReports';
export default function ReportCenter({initialType=null}:{initialType?:'po'|'requisition'|'history'|'stocktake'|null}) {
 const [type,setType]=useState<'po'|'requisition'|'history'|'stocktake'|null>(initialType);
 return <main className="min-h-screen bg-[#e8edf5] px-3 py-6 text-slate-800 sm:px-6 print:bg-white print:p-0"><div className="mx-auto max-w-[1600px] space-y-5 print:max-w-full"><div className="print:hidden"><AdminNav activeHref="/admin/reports"/></div><section className="rounded-2xl border border-blue-100 bg-white p-5 print:hidden"><h1 className="text-xl font-black text-[#1a3a6e]">📈 รายงาน</h1><p className="mt-1 text-sm text-slate-500">เลือกรายงานการเบิก รายงาน PO ประวัติการเบิกรายคน หรือประวัติตรวจนับคลัง</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{([{value:'requisition',title:'📝 รายงานการเบิก',description:'สรุปยอดแผนก และรายการสินค้าที่เบิก'},{value:'history',title:'🕘 ประวัติการเบิกรายคน',description:'ค้นหาชื่อ แผนก วัน และส่งออกประวัติ'},{value:'stocktake',title:'📦 ประวัติตรวจนับคลัง',description:'ดูยอดก่อนปรับ ยอดนับจริง ส่วนต่าง และผู้ตรวจนับย้อนหลัง'},{value:'po',title:'📥 รายงาน PO',description:'นำเข้าสินค้า รับเข้าคลัง และยอดค้างรับ'}] as const).map(option=><button key={option.value} type="button" aria-pressed={type===option.value} onClick={()=>setType(option.value)} className={'rounded-xl border p-4 text-left transition-colors '+(type===option.value?'border-blue-700 bg-[#1a3a6e] text-white':'border-blue-100 bg-blue-50/40 text-blue-900 hover:bg-blue-100')}><span className="block font-black">{option.title}</span><span className="mt-1 block text-sm opacity-80">{option.description}</span></button>)}</div></section>{type==='requisition'&&<RequisitionReports/>}{type==='po'&&<POReports/>}{type==='history'&&<RequisitionHistory/>}{type==='stocktake'&&<StocktakeHistory/>}</div></main>;
}
