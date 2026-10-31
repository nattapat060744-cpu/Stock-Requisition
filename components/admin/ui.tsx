import Link from 'next/link';
import type { ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** ฟอร์มคอนโทรลมาตรฐานของหลังบ้าน (input / select) */
export const inputCls =
  'h-10 rounded-xl border-0 bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 outline-none transition-all hover:ring-brand-300 focus:ring-2 focus:ring-brand-500/50';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70', className)}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex animate-rise flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-brand-700 inline-block text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

const tones = {
  navy: { dot: 'bg-brand-700', text: 'text-brand-700' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700' },
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  slate: { dot: 'bg-slate-400', text: 'text-slate-600' },
};

export function Stat({ label, value, hint, href, tone = 'slate' }: {
  label: string; value: string; hint?: string; href?: string; tone?: keyof typeof tones;
}) {
  const t = tones[tone];
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <span className={cx('h-2 w-2 rounded-full', t.dot)} />{label}
      </p>
      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className={cx('mt-1 text-xs font-semibold', t.text)}>{hint}</p>}
    </>
  );
  const cls = 'block p-5';
  return (
    <Card className={href ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-lift hover:ring-brand-200' : ''}>
      {href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse bg-brand-100 rounded-xl', className)} />;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-40 animate-fade flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-bold text-slate-600">{title}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
    </div>
  );
}
