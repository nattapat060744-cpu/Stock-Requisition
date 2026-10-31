'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';

/* สไตล์กลางสำหรับหน้าจัดการหลังบ้าน */
export const ui = {
  page: 'min-h-screen px-3 py-6 text-slate-800 sm:px-6',
  wrap: 'stagger mx-auto max-w-[1600px] space-y-5',
  card: 'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft',
  input: 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-brand-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:opacity-60',
  button: 'rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-600/25 hover:-translate-y-px hover:shadow-lg hover:shadow-brand-600/35 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0',
  secondary: 'rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-800 hover:-translate-y-px hover:border-brand-300 hover:bg-brand-50 hover:shadow-sm active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0',
  danger: 'rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:-translate-y-px hover:bg-red-100 hover:shadow-sm active:translate-y-0 disabled:opacity-50',
  heroBtn: 'rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:translate-y-0 disabled:opacity-50',
  heroPrimary: 'rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm shadow-brand-600/20 hover:-translate-y-px hover:bg-brand-700 hover:shadow-md active:translate-y-0 disabled:opacity-50',
  thead: 'border-b border-slate-200 bg-brand-50/70 text-xs font-bold text-brand-900',
  rowBtn: 'rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-800 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50',
  rowBtnPrimary: 'rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-brand-600/25 hover:shadow-md hover:shadow-brand-600/35 disabled:opacity-50',
  rowBtnDanger: 'rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50',
};

export function PageHero({ icon, title, subtitle, actions, children }: { icon: ReactNode; title: string; subtitle: string; actions?: ReactNode; children?: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700 ring-1 ring-brand-100">{icon}</span>
          <div><h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-xl">{title}</h1><p className="mt-1 text-xs text-slate-500 sm:text-sm">{subtitle}</p></div>
        </div>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </section>;
}

const noticeTone = {
  error: 'border-red-200 border-l-red-500 bg-red-50 text-red-700',
  success: 'border-emerald-200 border-l-emerald-500 bg-emerald-50 font-semibold text-emerald-800',
  warn: 'border-amber-200 border-l-amber-500 bg-amber-50 text-amber-800',
};
export function Notice({ tone, children, onClose, action }: { tone: keyof typeof noticeTone; children: ReactNode; onClose?: () => void; action?: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={'flex items-center justify-between gap-3 rounded-xl border border-l-4 p-4 text-sm shadow-sm ' + (tone === 'error' ? 'animate-shake ' : 'animate-pop ') + noticeTone[tone]}>
    <span>{tone === 'success' && '✅ '}{children}</span>
    {action}
    {onClose && <button aria-label="ปิดข้อความ" className="h-7 w-7 rounded-full text-lg hover:bg-black/5" onClick={onClose}>×</button>}
  </div>;
}

/** ตัวเลขนับขึ้นจาก 0 ตอนปรากฏ — ถ้าไม่ใช่ตัวเลขล้วนจะแสดงตามเดิม */
export function CountUp({ value, duration = 900 }: { value: string | number; duration?: number }) {
  const text = String(value);
  const numeric = /^-?[\d,]+(\.\d+)?$/.test(text.trim());
  const target = numeric ? Number(text.replace(/,/g, '')) : 0;
  const decimals = numeric && text.includes('.') ? text.split('.')[1].length : 0;
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!numeric) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setShown(target); return; }
    const start = performance.now(), begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = begin + (target - begin) * eased;
      from.current = current; setShown(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numeric, target, duration]);
  if (!numeric) return <>{text}</>;
  return <>{shown.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

const accents = {
  blue: { bar: 'bg-brand-600', tile: 'bg-brand-100 text-brand-700', glow: 'bg-brand-400/25', num: 'text-brand-800' },
  amber: { bar: 'bg-amber-300', tile: 'bg-amber-100 text-amber-700', glow: 'bg-amber-400/25', num: 'text-amber-700' },
  sky: { bar: 'bg-sky-300', tile: 'bg-sky-100 text-sky-700', glow: 'bg-sky-400/25', num: 'text-sky-700' },
  emerald: { bar: 'bg-emerald-300', tile: 'bg-emerald-100 text-emerald-700', glow: 'bg-emerald-400/25', num: 'text-emerald-700' },
  red: { bar: 'bg-red-300', tile: 'bg-red-100 text-red-700', glow: 'bg-red-400/25', num: 'text-red-700' },
  slate: { bar: 'bg-slate-300', tile: 'bg-slate-100 text-slate-600', glow: 'bg-slate-400/20', num: 'text-slate-700' },
} as const;
export function StatCard({ label, value, unit, hint, icon, accent = 'blue', active, onClick, href }: {
  label: string; value: string | number; unit?: string; hint?: string; icon: string;
  accent?: keyof typeof accents; active?: boolean; onClick?: () => void; href?: string;
}) {
  const a = accents[accent];
  const cls = 'group relative block overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-soft sm:p-5 ' + (active ? 'border-brand-300 ring-2 ring-brand-500/70' : 'border-slate-200/80')
    + (onClick || href ? ' transition-all duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-brand-600' : '');
  const body = <>
    <span aria-hidden="true" className={'absolute inset-x-0 top-0 h-1  ' + a.bar} />
    
    <span className="relative flex items-center justify-between text-sm font-bold text-slate-600">{label}<span aria-hidden="true" className={'flex h-9 w-9 items-center justify-center rounded-xl text-base transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ' + a.tile}>{icon}</span></span>
    <span className={'relative mt-2 block text-3xl font-black tabular-nums tracking-tight ' + a.num}><CountUp value={value} />{unit && <span className="ml-1.5 text-sm font-semibold text-slate-400">{unit}</span>}</span>
    {hint && <span className="relative mt-0.5 block text-xs font-medium text-slate-400 transition-colors group-hover:text-brand-600">{hint}</span>}
  </>;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" aria-pressed={active} onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={'block space-y-1.5 ' + className}><span className="text-xs font-bold text-brand-800">{label}</span>{children}</label>;
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <div className="group relative w-full sm:max-w-sm">
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-600"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={ui.input + ' pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden'} />
    {value && <button type="button" aria-label="ล้างคำค้นหา" onClick={() => onChange('')} className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 animate-pop items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-700 hover:bg-brand-200">✕</button>}
  </div>;
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return <div className="px-4 py-14 text-center"><span aria-hidden="true" className="mx-auto flex h-20 w-20 animate-float items-center justify-center rounded-full bg-brand-50 text-4xl shadow-inner ring-1 ring-brand-100">{icon}</span><p className="mt-4 font-bold text-slate-600">{title}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return <div aria-busy="true" role="status" className="space-y-2 p-4">{Array.from({ length: rows }, (_, i) => <div key={i} style={{ animationDelay: i * 90 + 'ms' }} className="animate-pulse bg-brand-100 h-14 rounded-xl" />)}<span className="sr-only">กำลังโหลด...</span></div>;
}

export function Pagination({ page, totalPages, total, unit = 'รายการ', onChange }: { page: number; totalPages: number; total: number; unit?: string; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="flex items-center justify-between border-t border-slate-100 bg-brand-50/30 px-4 py-3">
    <span className="text-xs font-semibold text-slate-500">หน้า {page} จาก {totalPages} ({total.toLocaleString('th-TH')} {unit})</span>
    <div className="flex gap-2">
      <button disabled={page === 1} onClick={() => onChange(page - 1)} className={ui.rowBtn}>← ก่อนหน้า</button>
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)} className={ui.rowBtn}>ถัดไป →</button>
    </div>
  </div>;
}

export function Modal({ title, onClose, busy, children, footer, maxWidth = 'max-w-4xl' }: { title: string; onClose: () => void; busy: boolean; children: ReactNode; footer: ReactNode; maxWidth?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === ref.current && !busy) onClose(); }} aria-label={title}
    className={'m-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border border-white/60 bg-white p-0 text-slate-800 shadow-2xl shadow-brand-950/30 ' + maxWidth}>
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="relative flex shrink-0 items-center justify-between gap-3 overflow-hidden bg-brand-700 p-5 text-white">
        
        <h2 className="relative text-lg font-black">{title}</h2>
        <button disabled={busy} onClick={onClose} aria-label="ปิดหน้าต่าง" className="relative h-8 w-8 rounded-full bg-white/15 text-xl transition-transform hover:rotate-90 hover:bg-white/25 disabled:opacity-50">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-brand-50/40 p-4">{footer}</div>
    </div>
  </dialog>;
}
