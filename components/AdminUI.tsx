'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';

/* สไตล์กลาง ยกมาจากหน้า PO (แม่แบบ) */
export const ui = {
  page: 'min-h-screen bg-[#e8edf5] px-3 py-6 text-slate-800 sm:px-6',
  wrap: 'mx-auto max-w-[1600px] space-y-5',
  card: 'overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm',
  input: 'w-full rounded-xl border border-blue-100 bg-blue-50/30 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60',
  button: 'rounded-xl bg-[#1a3a6e] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-900 hover:bg-blue-50 disabled:opacity-50',
  danger: 'rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50',
  heroBtn: 'rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50',
  heroPrimary: 'rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#1a3a6e] shadow-sm hover:bg-blue-50 disabled:opacity-50',
  thead: 'border-b border-blue-100 bg-blue-50/70 text-xs font-bold text-blue-900',
  rowBtn: 'rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-900 hover:bg-blue-50 disabled:opacity-50',
  rowBtnPrimary: 'rounded-lg bg-[#1a3a6e] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50',
  rowBtnDanger: 'rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50',
};

export function PageHero({ icon, title, subtitle, actions, children }: { icon: ReactNode; title: string; subtitle: string; actions?: ReactNode; children?: ReactNode }) {
  return <section className="relative overflow-hidden rounded-2xl bg-linear-to-r from-[#1a3a6e] to-[#2d5aa8] p-5 text-white shadow-sm sm:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-white/5" />
    <div className="relative flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-2xl">{icon}</span>
          <div><h1 className="text-xl font-black leading-tight">{title}</h1><p className="text-xs font-medium text-blue-100">{subtitle}</p></div>
        </div>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </section>;
}

const noticeTone = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
};
export function Notice({ tone, children, onClose, action }: { tone: keyof typeof noticeTone; children: ReactNode; onClose?: () => void; action?: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={'flex items-center justify-between gap-3 rounded-xl border p-4 text-sm ' + noticeTone[tone]}>
    <span>{tone === 'success' && '✅ '}{children}</span>
    {action}
    {onClose && <button aria-label="ปิดข้อความ" className="h-7 w-7 rounded-full text-lg hover:bg-black/5" onClick={onClose}>×</button>}
  </div>;
}

const accents = {
  blue: 'border-l-[#1a3a6e]', amber: 'border-l-amber-400', sky: 'border-l-sky-400',
  emerald: 'border-l-emerald-400', red: 'border-l-red-400', slate: 'border-l-slate-400',
} as const;
export function StatCard({ label, value, unit, hint, icon, accent = 'blue', active, onClick, href }: {
  label: string; value: string | number; unit?: string; hint?: string; icon: string;
  accent?: keyof typeof accents; active?: boolean; onClick?: () => void; href?: string;
}) {
  const cls = 'block rounded-2xl border border-l-4 bg-white p-4 text-left shadow-sm sm:p-5 ' + accents[accent] + ' ' + (active ? 'border-blue-300 ring-2 ring-[#1a3a6e]/70' : 'border-blue-100')
    + (onClick || href ? ' transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-700' : '');
  const body = <>
    <span className="flex items-center justify-between text-sm font-bold text-slate-600">{label}<span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-base">{icon}</span></span>
    <span className="mt-2 block text-3xl font-black tabular-nums text-[#1a3a6e]">{value}{unit && <span className="ml-1.5 text-sm font-semibold text-slate-400">{unit}</span>}</span>
    {hint && <span className="mt-0.5 block text-xs font-medium text-slate-400">{hint}</span>}
  </>;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" aria-pressed={active} onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={'block space-y-1.5 ' + className}><span className="text-xs font-bold text-blue-800">{label}</span>{children}</label>;
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <div className="relative w-full sm:max-w-sm"><span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
    <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={ui.input + ' pl-10'} /></div>;
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return <div className="px-4 py-16 text-center"><span aria-hidden="true" className="text-4xl">{icon}</span><p className="mt-2 font-bold text-slate-500">{title}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return <div aria-busy="true" role="status" className="space-y-px p-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-blue-50/60" />)}<span className="sr-only">กำลังโหลด...</span></div>;
}

export function Pagination({ page, totalPages, total, unit = 'รายการ', onChange }: { page: number; totalPages: number; total: number; unit?: string; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="flex items-center justify-between border-t border-blue-50 bg-slate-50/50 px-4 py-3">
    <span className="text-xs font-semibold text-slate-500">หน้า {page} จาก {totalPages} ({total.toLocaleString('th-TH')} {unit})</span>
    <div className="flex gap-2">
      <button disabled={page === 1} onClick={() => onChange(page - 1)} className={ui.rowBtn}>ก่อนหน้า</button>
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)} className={ui.rowBtn}>ถัดไป</button>
    </div>
  </div>;
}

export function Modal({ title, onClose, busy, children, footer, maxWidth = 'max-w-4xl' }: { title: string; onClose: () => void; busy: boolean; children: ReactNode; footer: ReactNode; maxWidth?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-label={title}
    className={'m-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-blue-100 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 ' + maxWidth}>
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-blue-100 bg-linear-to-r from-[#1a3a6e] to-[#2d5aa8] p-5 text-white">
        <h2 className="text-lg font-black">{title}</h2>
        <button disabled={busy} onClick={onClose} aria-label="ปิดหน้าต่าง" className="h-8 w-8 rounded-full bg-white/15 text-xl disabled:opacity-50">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-blue-100 bg-blue-50/40 p-4">{footer}</div>
    </div>
  </dialog>;
}