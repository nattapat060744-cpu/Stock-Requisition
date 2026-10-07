'use client';


import Link from 'next/link';

import { useNewRequisitions } from '@/hooks/useNewRequisitions';

const TABS = [
  { href: '/admin/dashboard',    label: '📊 แดชบอร์ด' },
  { href: '/admin/requisitions', label: '📝 ใบเบิก', badge: true },
  { href: '/admin/reports',      label: '📈 รายงาน' },
  { href: '/admin/inventory',    label: '📦 คลัง' },
  { href: '/admin/zones',        label: '🗂️ โซน' },
];

export default function AdminNav({ activeHref }: { activeHref: string }) {
  const { newCount } = useNewRequisitions();
  return <AdminNavView newCount={newCount} activeHref={activeHref} />;
}

export function AdminNavView({ newCount, onRequisitionsClick, activeHref }: {
  newCount: number;
  activeHref: string;
  onRequisitionsClick?: () => void;
}) {

  return (
    <nav className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-sm shadow-blue-100/50 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shadow-md shadow-blue-700/10 overflow-hidden border border-blue-200">
          <img src="/Logo.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-xl font-black tracking-tight text-slate-800 leading-tight">สำเพ็ง บุรีรัมย์</p>
          <p className="text-xs font-bold text-blue-700 mt-0.5 uppercase tracking-widest">ระบบจัดการเบิกของ สำเพ็ง บุรีรัมย์</p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs font-bold bg-blue-50 p-1 rounded-xl border border-blue-100/80">
        {TABS.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={active ? { backgroundColor: '#ffffff', color: '#1a3a6e' } : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={tab.badge ? onRequisitionsClick : undefined}
              className={`relative px-4 py-2 rounded-lg transition-all ${
                active
                  ? 'bg-white text-blue-900 shadow-sm shadow-blue-100 ring-1 ring-blue-100'
                  : 'text-slate-500 hover:text-blue-800 hover:bg-white/70'
              }`}
            >
              {tab.label}
              {tab.badge && newCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-3 w-3"
                  aria-label={`มีใบเบิกใหม่ ${newCount} รายการ`}
                >
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
