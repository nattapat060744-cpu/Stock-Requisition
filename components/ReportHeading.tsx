import type {ReactNode} from 'react';
export const REPORT_PANEL='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 print:hidden';
export default function ReportHeading({title,description,actions}:{title:string;description:string;actions?:ReactNode}){
 return <header data-report-heading className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className="text-lg font-black text-brand-700">{title}</h1><p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p></div>{actions&&<div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}</header>;
}
