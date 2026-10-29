'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import styles from '@/components/reportWorkspace.module.css';
import { useReportPreview, type ReportPreview } from '@/components/useReportPreview';
import { ui, PageHero, StatCard, Notice } from '@/components/AdminUI';

const loadingReport = () => <p role="status" className="p-6 text-center">กำลังโหลดรายงาน...</p>;
const loadingHistory = () => <p role="status" className="p-6 text-center">กำลังโหลดประวัติ...</p>;

const RequisitionReports = dynamic(() => import('@/components/RequisitionReports'), { loading: loadingReport });
const POReports = dynamic(() => import('@/components/POReports'), { loading: loadingReport });
const SupplyUseReports = dynamic(() => import('@/components/SupplyUseReports'), { loading: loadingReport });
const SupplyCompareReports = dynamic(() => import('@/components/SupplyCompareReports'), { loading: loadingReport });
const StocktakeHistory = dynamic(() => import('@/components/StocktakeHistory'), { loading: loadingHistory });
const RequisitionHistory = dynamic(() => import('@/components/RequisitionHistory'), { loading: loadingHistory });

// hasPreview = มีตัวเลขคร่าว ๆ โชว์บนการ์ด (PO และตรวจนับคลังยังไม่มี เพราะต้องรู้ชื่อตารางข้อมูลก่อน)
const reports = [
  { value: 'requisition', title: 'รายงานการเบิก', icon: '📝', description: 'สรุปยอดตามแผนก โซน และรายการสินค้าที่เบิก', hasPreview: true },
  { value: 'po', title: 'รายงาน PO', icon: '📥', description: 'ตรวจยอดนำเข้า รับเข้าคลัง และรายการค้างรับ', hasPreview: false },
  { value: 'supply', title: 'สรุป Supply Use', icon: '🧾', description: 'ยอดเบิกรายวัน/รายเดือน แยกตามแผนก สินค้า และโซน', hasPreview: true },
  { value: 'compare', title: 'เปรียบเทียบยอดเบิก', icon: '📊', description: 'เทียบรายเดือนหรือเทียบปีต่อปี แยกตามแผนก สินค้า และโซน', hasPreview: true },
  { value: 'history', title: 'ประวัติการเบิกรายคน', icon: '🕘', description: 'ค้นหาตามผู้เบิก แผนก โซน และช่วงวันที่', hasPreview: true },
  { value: 'stocktake', title: 'ประวัติตรวจนับคลัง', icon: '📦', description: 'ดูยอดก่อนปรับ ยอดนับจริง ส่วนต่าง และผู้ตรวจนับ', hasPreview: false },
] as const;

type ReportType = (typeof reports)[number]['value'];

const isReportType = (value: string | null): value is ReportType => reports.some((report) => report.value === value);

/* -------------------------------------------------------------------------- */
/*  ตัวเลขคร่าว ๆ บนการ์ด                                                      */
/* -------------------------------------------------------------------------- */

type Chip = { text: string; tone: 'neutral' | 'warn' | 'up' | 'down' };

const CHIP_STYLE: Record<Chip['tone'], string> = {
  neutral: 'border-blue-100 bg-white text-slate-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  up: 'border-red-200 bg-red-50 text-red-700',
  down: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const num = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

function chipsFor(type: ReportType, p: ReportPreview): Chip[] {
  switch (type) {
    case 'requisition': {
      const chips: Chip[] = [{ text: `เดือนนี้ ${num(p.monthRequests)} ใบ`, tone: 'neutral' }];
      if (p.pendingRequests > 0) chips.push({ text: `รออนุมัติ ${num(p.pendingRequests)} ใบ`, tone: 'warn' });
      return chips;
    }
    case 'supply': {
      const chips: Chip[] = [{ text: `ยอดเบิกเดือนนี้ ${num(p.cost)} บาท`, tone: 'neutral' }];
      if (p.costLastPeriod > 0) {
        const pct = ((p.cost - p.costLastPeriod) / p.costLastPeriod) * 100;
        chips.push({
          text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% จากช่วงเดียวกันเดือนก่อน`,
          tone: pct >= 0 ? 'up' : 'down',
        });
      }
      return chips;
    }
    case 'compare': {
      if (p.costLastPeriod <= 0) return [];
      const pct = ((p.cost - p.costLastPeriod) / p.costLastPeriod) * 100;
      return [{ text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% เทียบเดือนก่อน`, tone: pct >= 0 ? 'up' : 'down' }];
    }
    case 'history':
      return [
        { text: `วันนี้ ${num(p.todayRequests)} ใบ`, tone: 'neutral' },
        { text: `ผู้เบิกเดือนนี้ ${num(p.requesters)} คน`, tone: 'neutral' },
      ];
    default:
      return [];
  }
}

function PreviewChips({ type, hasPreview, preview, failed }: { type: ReportType; hasPreview: boolean; preview: ReportPreview | null; failed: boolean }) {
  if (!hasPreview || failed) return null;

  if (!preview) {
    return (
      <span aria-hidden="true" className="mt-3 flex gap-2">
        <span className="h-6 w-28 animate-pulse rounded-full bg-blue-100/70" />
        <span className="h-6 w-20 animate-pulse rounded-full bg-blue-100/70" />
      </span>
    );
  }

  return (
    <span className="mt-3 flex flex-wrap gap-2">
      {chipsFor(type, preview).map((chip) => (
        <span key={chip.text} className={'rounded-full border px-3 py-1 text-xs font-bold tabular-nums ' + CHIP_STYLE[chip.tone]}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  แดชบอร์ดภาพรวม (แสดงก่อนเลือกรายงาน)                                         */
/* -------------------------------------------------------------------------- */

type Kpi = { label: string; value: string; unit?: string; sub?: string; tone: Chip['tone']; icon: string; target?: ReportType };
const TONE_ACCENT = { neutral: 'blue', warn: 'amber', up: 'red', down: 'emerald' } as const;

function kpisFrom(p: ReportPreview): Kpi[] {
  const pct = p.costLastPeriod > 0 ? ((p.cost - p.costLastPeriod) / p.costLastPeriod) * 100 : null;
  return [
    {
      label: 'ยอดเบิกเดือนนี้',
      value: num(p.cost),
      unit: 'บาท',
      sub: pct === null ? 'ยังไม่มีข้อมูลเดือนก่อนให้เทียบ' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% จากช่วงเดียวกันเดือนก่อน`,
      tone: pct === null ? 'neutral' : pct >= 0 ? 'up' : 'down',
      icon: '🧾',
      target: 'supply',
    },
    { label: 'ใบเบิกเดือนนี้', value: num(p.monthRequests), unit: 'ใบ', sub: 'ทุกสถานะ', tone: 'neutral', icon: '📝', target: 'requisition' },
    {
      label: 'รออนุมัติ',
      value: num(p.pendingRequests),
      unit: 'ใบ',
      sub: p.pendingRequests > 0 ? 'ยังไม่นับรวมในรายงานยอดเบิก' : 'ไม่มีใบเบิกค้าง',
      tone: p.pendingRequests > 0 ? 'warn' : 'down',
      icon: '⏳',
      target: 'requisition',
    },
    { label: 'ใบเบิกวันนี้', value: num(p.todayRequests), unit: 'ใบ', sub: 'ตามเวลาไทย', tone: 'neutral', icon: '📅', target: 'history' },
    { label: 'ผู้เบิกเดือนนี้', value: num(p.requesters), unit: 'คน', sub: 'นับไม่ซ้ำ', tone: 'neutral', icon: '👥', target: 'history' },
  ];
}

function DashboardKpis({ preview, failed, onOpen }: { preview: ReportPreview | null; failed: boolean; onOpen: (t: ReportType) => void }) {
  if (failed) {
    return <Notice tone="warn">โหลดสรุปภาพรวมไม่สำเร็จ ยังเลือกเปิดรายงานด้านล่างได้ตามปกติ</Notice>;
  }

  if (!preview) {
    return (
      <div aria-busy="true" role="status" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />)}
        <span className="sr-only">กำลังโหลด...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {kpisFrom(preview).map((k) => (
        <StatCard key={k.label} label={k.label} value={k.value} unit={k.unit} hint={k.sub} icon={k.icon}
          accent={TONE_ACCENT[k.tone]} onClick={k.target ? () => onOpen(k.target!) : undefined} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  หน้าเมนูรายงาน                                                              */
/* -------------------------------------------------------------------------- */

export default function ReportCenter({ initialType = null }: { initialType?: ReportType | null }) {
  const [type, setType] = useState<ReportType | null>(initialType);
  const backButton = useRef<HTMLButtonElement>(null);
  const { data: preview, failed } = useReportPreview();

  // อ่านรายงานที่เลือกจาก ?report= และตามปุ่มย้อนกลับของเบราว์เซอร์
  useEffect(() => {
    let alive = true;
    const readFromUrl = () => {
      const value = new URLSearchParams(window.location.search).get('report');
      setType(isReportType(value) ? value : null);
    };

    const initial = new URLSearchParams(window.location.search).get('report');
    if (isReportType(initial)) {
      queueMicrotask(() => {
        if (alive) setType(initial);
      });
    }

    window.addEventListener('popstate', readFromUrl);
    return () => {
      alive = false;
      window.removeEventListener('popstate', readFromUrl);
    };
  }, []);

  useEffect(() => {
    if (type) backButton.current?.focus({ preventScroll: true });
  }, [type]);

  const choose = (value: ReportType) => {
    const url = new URL(window.location.href);
    url.searchParams.set('report', value);
    window.history.pushState({ ...window.history.state, spbReport: true }, '', url);
    setType(value);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const returnToMenu = () => {
    if (window.history.state?.spbReport) {
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('report');
    window.history.replaceState({ ...window.history.state, spbReport: false }, '', url);
    setType(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const selected = reports.find((report) => report.value === type);

  return (
    <main className={ui.page + ' print:bg-white print:p-0'}>
      <div className={ui.wrap + ' print:max-w-full'}>
        {!type ? (
          <>
            <PageHero icon="📈" title="แดชบอร์ดรายงาน" subtitle="สรุปภาพรวมของเดือนนี้ แล้วเลือกรายงานที่ต้องการดูรายละเอียด" />

            <DashboardKpis preview={preview} failed={failed} onOpen={choose} />

            <section className={ui.card}>
              <div className="border-b border-blue-100 p-4"><h2 className="font-black text-[#1a3a6e]">เลือกรายงาน</h2><p className="mt-0.5 text-xs text-slate-500">กดการ์ดเพื่อเปิดรายงานแบบเต็ม</p></div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <button
                    key={report.value}
                    onClick={() => choose(report.value)}
                    className="group flex items-start gap-4 rounded-xl border border-blue-100 border-l-4 border-l-[#1a3a6e] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:bg-blue-50/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl">{report.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-black text-[#1a3a6e]">{report.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-slate-500">{report.description}</span>
                      <PreviewChips type={report.value} hasPreview={report.hasPreview} preview={preview} failed={failed} />
                    </span>
                    <span aria-hidden="true" className="self-center font-bold text-blue-500">→</span>
                  </button>
                ))}
              </div>
              {preview && !failed && (
                <p className="border-t border-blue-50 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">ตัวเลขด้านบนเป็นการสรุปคร่าว ๆ ของเดือนนี้ (เวลาไทย) ดูรายละเอียดครบได้ในแต่ละรายงาน</p>
              )}
            </section>
          </>
        ) : (
          <>
            <nav aria-label="เส้นทางรายงาน" className="flex flex-wrap items-center gap-3 print:hidden">
              <button ref={backButton} onClick={returnToMenu} className={ui.secondary}>← เลือกรายงานอื่น</button>
              <span className="text-sm font-semibold text-slate-500">รายงาน / <span className="font-black text-[#1a3a6e]">{selected?.title}</span></span>
            </nav>

            <div className={styles.workspace}>
              {type === 'requisition' && <RequisitionReports />}
              {type === 'po' && <POReports />}
              {type === 'history' && <RequisitionHistory />}
              {type === 'supply' && <SupplyUseReports />}
              {type === 'compare' && <SupplyCompareReports />}
              {type === 'stocktake' && <StocktakeHistory />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}