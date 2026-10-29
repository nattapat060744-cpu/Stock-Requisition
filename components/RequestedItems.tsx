type Line={item_id?:string;quantity:number;items:{name:string;unit:string}|null};
export default function RequestedItems({original,current,status}:{original?:Line[]|null;current:Line[];status:string}){
 if(!original?.length||status==='pending')return null;
 return <section className="rounded-xl border border-blue-100 p-4"><h3 className="mb-2 font-bold text-blue-900">รายการที่ขอ / ผลอนุมัติ</h3><div className="space-y-2">{original.map((line,index)=>{const approved=status==='rejected'?0:current.filter(x=>x.item_id===line.item_id).reduce((n,x)=>n+x.quantity,0);return <div key={index} className="flex flex-wrap justify-between gap-2 border-b border-blue-50 py-2 text-sm"><span>{line.items?.name||'สินค้าเดิม'} · ขอ {line.quantity} {line.items?.unit}</span><strong className={approved?'text-emerald-700':'text-red-700'}>{approved?'อนุมัติ '+approved+' '+(line.items?.unit||''):'ไม่อนุมัติรายการนี้'}</strong></div>;})}</div></section>;
}
