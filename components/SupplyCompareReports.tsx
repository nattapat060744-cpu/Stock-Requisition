'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReportHeading, { REPORT_PANEL } from '@/components/ReportHeading';
import ReportPagination from '@/components/ReportPagination';
import ExcelJS from 'exceljs';
import {
  type Rec,
  type Raw,
  type Measure,
  MEASURE_UNIT,
  SEP,
  NUM_W,
  NUM_STYLE,
  SELECT,
  GUIDE_CSS,
  GridGuide,
  TruncText,
  fmt,
  monthKey,
  monthLabel,
  monthShort,
  loadRaw,
  buildRecs,
} from '@/components/supplyUseShared';

type CompareBy = 'dept' | 'item' | 'zone';
const COMPARE_MAX = 6; // เลือกเทียบได้สูงสุดกี่เดือน
const COMPARE_PAGE_SIZE = 30;


/* ───────────────────────── เปรียบเทียบรายเดือน ───────────────────────── */
type CompareRow = { key: string; label: string; values: number[]; total: number };
type Compare = { months: string[]; monthTotals: number[]; activeDays: number[]; rows: CompareRow[] };

// รวมยอดของแต่ละเดือนที่เลือก (ไม่ขึ้นกับช่วงวันที่ในมุมมองอื่น) แยกตามแผนก/สินค้า/โซน
function makeCompare(all: Rec[], months: string[], by: CompareBy, dept: string, zone: string, hideEmpty: boolean): Compare {
  const index = new Map(months.map((m, i) => [m, i] as const));
  // ตัวกรองแผนก/โซน ใช้ได้ทุกแบบการเทียบ
  const base = all.filter((r) => index.has(monthKey(r.date)) && (dept === 'all' || r.dept === dept) && (zone === 'all' || r.dept + SEP + r.zone === zone));

  const monthTotals = months.map(() => 0);
  const days = months.map(() => new Set<string>());
  for (const r of base) {
    const i = index.get(monthKey(r.date))!;
    monthTotals[i] += r.cost;
    if (r.cost !== 0) days[i].add(r.date);
  }

  const keyOf = (r: Rec) => (by === 'dept' ? r.dept : by === 'item' ? r.item : r.dept + SEP + r.zone);
  const labelOf = (k: string) => {
    if (by !== 'zone') return k;
    const [d, z] = k.split(SEP);
    return dept === 'all' ? `${z} (${d})` : z;
  };

  const sums = new Map<string, number[]>();
  for (const r of base) {
    if (by === 'zone' && !r.zone) continue;
    const k = keyOf(r);
    const values = sums.get(k) ?? months.map(() => 0);
    values[index.get(monthKey(r.date))!] += r.cost;
    sums.set(k, values);
  }

  let rows: CompareRow[] = [...sums.entries()].map(([key, values]) => ({
    key,
    label: labelOf(key),
    values,
    total: values.reduce((a, b) => a + b, 0),
  }));
  if (hideEmpty) rows = rows.filter((r) => r.total !== 0);
  rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'th'));

  return { months, monthTotals, activeDays: days.map((s) => s.size), rows };
}

// ▲ เบิกเพิ่มขึ้น (แดง) · ▼ เบิกลดลง (เขียว) เทียบกับค่าก่อนหน้า
function ChangeTag({ prev, cur }: { prev: number; cur: number }) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return <span className="text-xs font-bold text-slate-400">ใหม่</span>;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return <span className="text-xs font-bold text-slate-400">เท่าเดิม</span>;
  const up = pct > 0;
  return (
    <span className={'text-xs font-bold tabular-nums ' + (up ? 'text-red-600' : 'text-emerald-600')}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function CompareTable({ c, rows, offset, rowHeader }: { c: Compare; rows: CompareRow[]; offset: number; rowHeader: string }) {
  const th = 'sticky top-0 z-10 whitespace-nowrap bg-brand-700 px-3 py-2.5 text-center text-xs font-bold text-white';
  const n = c.months.length;
  const multi = n >= 2; // มีคอลัมน์ "เปลี่ยนแปลง" เมื่อเลือกตั้งแต่ 2 เดือน
  const trend = n > 2; // เลือกเกิน 2 เดือน แสดง % เทียบเดือนก่อนหน้าใต้ตัวเลขทุกช่อง
  const colTotals = c.months.map((_, j) => c.rows.reduce((s, r) => s + r.values[j], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const diff = (first: number, last: number) => {
    const d = last - first;
    return d > 0.005 ? '+' + fmt(d) : fmt(d);
  };
  const deltaHead = multi ? `${monthShort(c.months[0])} → ${monthShort(c.months[n - 1])}` : '';

  return (
    <GridGuide>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th + ' left-0 z-20 px-1!'} style={NUM_STYLE}>#</th>
              <th className={th + ' z-20 text-left'} style={{ left: NUM_W }}>{rowHeader}</th>
              {c.months.map((m, j) => (
                <th key={m} data-c={j} className={th} style={{ minWidth: 120 }}>{monthLabel(m)}</th>
              ))}
              <th data-c="s" className={th + ' bg-brand-900'}>รวม</th>
              {multi && <th data-c="d" className={th + ' bg-brand-900'}>เปลี่ยนแปลง<br />{deltaHead}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-slate-100 odd:bg-white even:bg-brand-50/30">
                <td data-r={i} className="sticky left-0 bg-inherit px-1 py-2 text-center text-xs font-semibold tabular-nums text-slate-400" style={NUM_STYLE}>
                  {offset + i + 1}
                </td>
                <th scope="row" data-r={i} className="sticky whitespace-nowrap bg-inherit px-3 py-2 text-left text-xs font-bold text-slate-700" style={{ left: NUM_W }}>
                  <TruncText text={r.label} className="max-w-48" />
                </th>
                {r.values.map((v, j) => (
                  <td key={j} data-r={i} data-c={j} className="px-3 py-2 text-right tabular-nums">
                    <span className={v === 0 ? 'text-slate-300' : 'text-slate-700'}>{fmt(v)}</span>
                    {trend && j > 0 && <div><ChangeTag prev={r.values[j - 1]} cur={v} /></div>}
                  </td>
                ))}
                <td data-r={i} data-c="s" className="bg-brand-50 px-3 py-2 text-right font-bold tabular-nums text-brand-900">{fmt(r.total)}</td>
                {multi && (
                  <td data-r={i} data-c="d" className="px-3 py-2 text-right tabular-nums">
                    <span className="font-bold text-slate-700">{diff(r.values[0], r.values[n - 1])}</span>
                    <div><ChangeTag prev={r.values[0]} cur={r.values[n - 1]} /></div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand-200 bg-brand-100 font-black text-brand-950">
              <th data-r="t" className="sticky left-0 bg-brand-100" style={NUM_STYLE} />
              <th scope="row" data-r="t" className="sticky bg-brand-100 px-3 py-2.5 text-left text-xs" style={{ left: NUM_W }}>รวม</th>
              {colTotals.map((v, j) => (
                <td key={j} data-r="t" data-c={j} className="px-3 py-2.5 text-right tabular-nums">
                  {fmt(v)}
                  {trend && j > 0 && <div><ChangeTag prev={colTotals[j - 1]} cur={v} /></div>}
                </td>
              ))}
              <td data-r="t" data-c="s" className="px-3 py-2.5 text-right tabular-nums">{fmt(grand)}</td>
              {multi && (
                <td data-r="t" data-c="d" className="px-3 py-2.5 text-right tabular-nums">
                  {diff(colTotals[0], colTotals[n - 1])}
                  <div><ChangeTag prev={colTotals[0]} cur={colTotals[n - 1]} /></div>
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </GridGuide>
  );
}

const COMPARE_BY_OPTIONS: { value: CompareBy; label: string }[] = [
  { value: 'dept', label: 'แผนก' },
  { value: 'item', label: 'สินค้า' },
  { value: 'zone', label: 'โซน' },
];

function CompareSection(props: {
  availableMonths: string[];
  selMonths: string[];
  compare: Compare | null;
  by: CompareBy;
  unit: string;
  page: number;
  onBy: (by: CompareBy) => void;
  onToggle: (month: string) => void;
  onQuick: (count: number) => void;
  onClear: () => void;
  onYoY: () => void;
  canYoY: boolean;
  onPage: (page: number) => void;
}) {
  const { availableMonths, selMonths, compare, by, unit, page, onBy, onToggle, onQuick, onClear, onYoY, canYoY, onPage } = props;
  const rowHeader = COMPARE_BY_OPTIONS.find((o) => o.value === by)!.label;
  const nowMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
  const full = selMonths.length >= COMPARE_MAX;
  const maxTotal = Math.max(1, ...(compare?.monthTotals ?? [0]));
  const rows = compare?.rows ?? [];
  const offset = (page - 1) * COMPARE_PAGE_SIZE;
  const quick = 'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-900 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-700';

  if (availableMonths.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูลการเบิกให้เปรียบเทียบ</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 print:hidden">
        <p className="text-xs font-bold text-slate-500">เลือกเดือนที่ต้องการเปรียบเทียบ (เลือกได้สูงสุด {COMPARE_MAX} เดือน)</p>
        <div className="flex flex-wrap gap-2">
          {availableMonths.map((m) => {
            const on = selMonths.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(m)}
                className={'rounded-full border px-4 py-1.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-40 ' + (on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-brand-50/40 text-slate-600 hover:bg-brand-100')}
              >
                {monthShort(m)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onQuick(2)} className={quick}>2 เดือนล่าสุด</button>
          <button type="button" onClick={() => onQuick(3)} className={quick}>3 เดือนล่าสุด</button>
          <button type="button" onClick={() => onQuick(6)} className={quick}>6 เดือนล่าสุด</button>
          <button type="button" onClick={onYoY} disabled={!canYoY} title="เทียบเดือนล่าสุดกับเดือนเดียวกันของปีก่อน" className={quick + ' disabled:cursor-not-allowed disabled:opacity-40'}>เทียบกับปีก่อน</button>
          <button type="button" onClick={onClear} className={quick}>ล้างที่เลือก</button>
        </div>
      </div>

      <div role="group" aria-label="เปรียบเทียบตาม" className="text-xs font-bold text-slate-500 print:hidden">
        เปรียบเทียบตาม
        <div className="mt-1 inline-flex overflow-hidden rounded-xl border border-slate-200 align-middle">
          {COMPARE_BY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={by === o.value}
              onClick={() => onBy(o.value)}
              className={'h-10 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 ' + (by === o.value ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-brand-50')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {!compare ? (
        <p className="py-10 text-center text-sm text-slate-400">เลือกอย่างน้อย 1 เดือนเพื่อดูตัวเลข</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {compare.months.map((m, j) => {
              const total = compare.monthTotals[j];
              const days = compare.activeDays[j];
              return (
                <div key={m} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-black text-brand-700">
                    {monthLabel(m)}
                    {m === nowMonth && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">ยังไม่ครบเดือน</span>}
                  </p>
                  <p className="mt-1 text-xl font-black tabular-nums text-brand-700">
                    {fmt(total)} <span className="text-xs font-semibold text-slate-400">{unit}</span>
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-brand-50" aria-hidden="true">
                    <div className="h-2 rounded-full bg-brand-700" style={{ width: `${(total / maxTotal) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    เบิก {days} วัน · เฉลี่ย {days ? fmt(total / days) : '-'} {unit}/วัน
                  </p>
                  {j > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      เทียบ{monthShort(compare.months[j - 1])} <ChangeTag prev={compare.monthTotals[j - 1]} cur={total} />
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs font-semibold text-slate-500">
            ▲ เบิกเพิ่มขึ้น · ▼ เบิกลดลง{selMonths.includes(nowMonth) && ' · เดือนปัจจุบันยังไม่ครบ ยอดรวมจึงต่ำกว่าเดือนอื่นโดยธรรมชาติ ให้ดู “เฉลี่ยต่อวัน” ประกอบ'}
            {selMonths.length === 1 && ' · เลือกอีกเดือนเพื่อดูการเปรียบเทียบ'}
            {by === 'zone' && ' · แสดงเฉพาะใบเบิกที่ระบุโซน'}
          </p>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">ไม่มียอดเบิกในเดือนที่เลือก</p>
          ) : (
            <>
              <CompareTable c={compare} rows={rows.slice(offset, offset + COMPARE_PAGE_SIZE)} offset={offset} rowHeader={rowHeader} />
              <ReportPagination page={page} totalRows={rows.length} pageSize={COMPARE_PAGE_SIZE} onChange={onPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}

const prevYear = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

/* ───────────────────────── หน้ารายงานเปรียบเทียบ ───────────────────────── */
export default function SupplyCompareReports() {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  // ตัวกรองเก็บใน URL (?by=&months=&dept=&measure=&hide=) เพื่อรีเฟรชแล้วไม่หาย และส่งลิงก์ให้คนอื่นได้
  const urlParams = () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const [dept, setDept] = useState(() => urlParams().get('dept') || 'all');
  const [zone, setZone] = useState(() => urlParams().get('zone') || 'all'); // รูปแบบ แผนก\u0001โซน
  const [hideEmpty, setHideEmpty] = useState(() => urlParams().get('hide') === '1');
  const [page, setPage] = useState(1);
  const [measure, setMeasure] = useState<Measure>(() => (urlParams().get('measure') === 'qty' ? 'qty' : 'cost'));
  const unit = MEASURE_UNIT[measure];
  const [compareBy, setCompareBy] = useState<CompareBy>(() => {
    const v = urlParams().get('by');
    return v === 'item' || v === 'zone' ? v : 'dept';
  });
  const [compareMonths, setCompareMonths] = useState<string[]>(() =>
    (urlParams().get('months') ?? '').split(',').filter((m) => /^\d{4}-\d{2}$/.test(m)).slice(0, COMPARE_MAX),
  );
  const monthsInit = useRef(compareMonths.length > 0); // true = เลือกเดือนแล้ว (จากลิงก์หรือผู้ใช้) ไม่ต้องตั้งค่าเริ่มต้นให้

  useEffect(() => {
    const url = new URL(window.location.href);
    const put = (k: string, v: string, def: string) => (v === def ? url.searchParams.delete(k) : url.searchParams.set(k, v));
    put('dept', dept, 'all');
    put('zone', zone, 'all');
    put('measure', measure, 'cost');
    put('hide', hideEmpty ? '1' : '', '');
    put('by', compareBy, 'dept');
    put('months', compareMonths.join(','), '');
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', next);
  }, [dept, zone, measure, hideEmpty, compareBy, compareMonths]);

  // ออกจากรายงานนี้ → ล้างตัวกรองออกจาก URL ไม่ให้ไปติดรายงานอื่น (คง ?report= ไว้)
  useEffect(() => () => {
    const url = new URL(window.location.href);
    ['dept', 'zone', 'measure', 'hide', 'by', 'months'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    let alive = true;
    loadRaw()
      .then((r) => { if (alive) { setRaw(r.raw); setLoadedAt(r.at); } })
      .catch(() => { if (alive) setError('โหลดข้อมูลไม่สำเร็จ กรุณาลองรีเฟรชหน้านี้อีกครั้ง'); });
    return () => { alive = false; };
  }, []);

  const refresh = async () => {
    setReloading(true);
    try {
      const r = await loadRaw(true);
      setRaw(r.raw);
      setLoadedAt(r.at);
      setError('');
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setReloading(false);
    }
  };

  const recs = useMemo<Rec[]>(() => (raw ? buildRecs(raw) : []), [raw]);

  const depts = useMemo(() => {
    const list = [...(raw?.branches ?? [])];
    for (const r of recs) if (!list.includes(r.dept)) list.push(r.dept);
    return list;
  }, [raw, recs]);

  // โซนที่เลือกได้ (ตามแผนกที่เลือก) — ใช้ แผนก+โซน เป็นคีย์ เพราะชื่อโซนซ้ำกันข้ามแผนกได้
  const zoneOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of recs) if (r.zone && (dept === 'all' || r.dept === dept)) set.add(r.dept + SEP + r.zone);
    return [...set]
      .sort((a, b) => a.localeCompare(b, 'th'))
      .map((key) => {
        const [d, z] = key.split(SEP);
        return { key, label: dept === 'all' ? `${z} (${d})` : z };
      });
  }, [recs, dept]);

  useEffect(() => {
    if (raw && zone !== 'all' && !zoneOptions.some((o) => o.key === zone)) setZone('all');
  }, [raw, zoneOptions, zone]);

  useEffect(() => {
    if (raw && dept !== 'all' && !depts.includes(dept)) setDept('all');
  }, [raw, depts, dept]);

  // ข้อมูลทั้งหมดตามหน่วยที่เลือก (ยอดเงิน/จำนวน) — ใส่ลงฟิลด์ cost เพื่อใช้ฟังก์ชันเดิมร่วมกัน
  const allData = useMemo<Rec[]>(() => (measure === 'cost' ? recs : recs.map((r) => ({ ...r, cost: r.qty }))), [recs, measure]);
  const availableMonths = useMemo(() => [...new Set(recs.map((r) => monthKey(r.date)))].sort().reverse(), [recs]);

  // ครั้งแรกที่ยังไม่เคยเลือกเดือน → เลือก 2 เดือนล่าสุดให้
  useEffect(() => {
    if (!raw || monthsInit.current || availableMonths.length === 0) return;
    monthsInit.current = true;
    setCompareMonths(availableMonths.slice(0, 2).reverse());
  }, [raw, availableMonths]);

  const selMonths = useMemo(() => compareMonths.filter((m) => availableMonths.includes(m)).sort(), [compareMonths, availableMonths]);
  const compare = useMemo(
    () => (selMonths.length ? makeCompare(allData, selMonths, compareBy, dept, zone, hideEmpty) : null),
    [allData, selMonths, compareBy, dept, zone, hideEmpty],
  );

  const toggleMonth = (m: string) => {
    monthsInit.current = true;
    setPage(1);
    setCompareMonths((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= COMPARE_MAX ? cur : [...cur, m]));
  };
  const quickMonths = (count: number) => {
    monthsInit.current = true;
    setPage(1);
    setCompareMonths(availableMonths.slice(0, count).reverse());
  };
  const clearMonths = () => {
    monthsInit.current = true;
    setPage(1);
    setCompareMonths([]);
  };

  // เทียบปีต่อปี: เดือนล่าสุดที่มีข้อมูล เทียบกับเดือนเดียวกันของปีก่อน (ถ้ามีข้อมูล)
  const latest = availableMonths[0];
  const canYoY = !!latest && availableMonths.includes(prevYear(latest));
  const yearOverYear = () => {
    if (!canYoY) return;
    monthsInit.current = true;
    setPage(1);
    setCompareMonths([prevYear(latest), latest]);
  };

  /* ───────── ส่งออก Excel ───────── */
  const exportExcel = async () => {
    const view: string = 'compare';
    const rangeLabel = '';
    const wb = new ExcelJS.Workbook();
    const NUM = '#,##0.00;-#,##0.00;"-"';
    const deptNote = dept === 'all' ? '' : ` · แผนก${dept}`;

    const head = (ws: ExcelJS.Worksheet, title: string, lastCol: number, showUnit = true) => {
      ws.mergeCells(1, 1, 1, lastCol);
      ws.getCell(1, 1).value = title;
      ws.getCell(1, 1).font = { bold: true, size: 14 };
      ws.mergeCells(2, 1, 2, lastCol);
      ws.getCell(2, 1).value = `ช่วงข้อมูล: ${rangeLabel}` + (showUnit ? ` · ตัวเลขเป็น${measure === 'cost' ? 'ยอดเงิน (บาท)' : 'จำนวนที่เบิก (รวมทุกหน่วย)'}` : '');
      ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
    };
    const styleHeader = (row: ExcelJS.Row) => {
      row.eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      row.height = 36;
    };
    const fill = (c: ExcelJS.Cell, argb: string) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };

    const save = async (filename: string) => {
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    // โหมดเปรียบเทียบเดือน → ส่งออกเฉพาะตารางเปรียบเทียบ
    if (view === 'compare') {
      if (!compare) return;
      const n = compare.months.length;
      const hasDelta = n >= 2;
      const byLabel = COMPARE_BY_OPTIONS.find((o) => o.value === compareBy)!.label;
      const lastCol = n + 2 + (hasDelta ? 2 : 0);
      const ws = wb.addWorksheet('เปรียบเทียบเดือน');
      head(ws, `เปรียบเทียบยอดเบิกรายเดือน ตาม${byLabel}${deptNote}`, lastCol, false);
      ws.getCell(2, 1).value = `เดือนที่เปรียบเทียบ: ${compare.months.map(monthLabel).join(', ')} · ตัวเลขเป็น${measure === 'cost' ? 'ยอดเงิน (บาท)' : 'จำนวนที่เบิก (รวมทุกหน่วย)'}`;
      ws.addRow([]);
      styleHeader(ws.addRow([byLabel, ...compare.months.map(monthLabel), 'รวม', ...(hasDelta ? ['ผลต่าง (เดือนแรก→เดือนล่าสุด)', '% เปลี่ยนแปลง'] : [])]));
      const letter = (c: number) => ws.getColumn(c).letter;
      const firstRow = 5;
      const addDelta = (row: ExcelJS.Row, rn: number, first: number, last: number) => {
        if (!hasDelta) return;
        row.getCell(n + 3).value = { formula: `${letter(n + 1)}${rn}-B${rn}`, result: last - first };
        row.getCell(n + 4).value = { formula: `IF(B${rn}=0,"",(${letter(n + 1)}${rn}-B${rn})/B${rn})`, result: first === 0 ? '' : (last - first) / first };
      };
      compare.rows.forEach((r, i) => {
        const rn = firstRow + i;
        const row = ws.addRow([r.label, ...r.values]);
        row.getCell(n + 2).value = { formula: `SUM(B${rn}:${letter(n + 1)}${rn})`, result: r.total };
        row.getCell(n + 2).font = { bold: true };
        addDelta(row, rn, r.values[0], r.values[n - 1]);
      });
      const lastRow = firstRow + compare.rows.length - 1;
      const colTotals = compare.months.map((_, j) => compare.rows.reduce((s, r) => s + r.values[j], 0));
      const totalRow = ws.addRow(['รวม']);
      colTotals.forEach((v, j) => {
        const L = letter(2 + j);
        totalRow.getCell(2 + j).value = { formula: `SUM(${L}${firstRow}:${L}${lastRow})`, result: v };
      });
      totalRow.getCell(n + 2).value = { formula: `SUM(${letter(n + 2)}${firstRow}:${letter(n + 2)}${lastRow})`, result: colTotals.reduce((a, b) => a + b, 0) };
      addDelta(totalRow, totalRow.number, colTotals[0], colTotals[n - 1]);
      totalRow.font = { bold: true };
      totalRow.eachCell((c) => fill(c, 'FFDBEAFE'));
      for (let r = firstRow; r <= totalRow.number; r++) {
        for (let c = 2; c <= n + 2 + (hasDelta ? 1 : 0); c++) ws.getCell(r, c).numFmt = NUM;
        if (hasDelta) ws.getCell(r, n + 4).numFmt = '0.0%';
      }
      ws.getColumn(1).width = 34;
      for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 18;
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
      await save(`SupplyUse_compare_${compare.months[0]}_to_${compare.months[n - 1]}.xlsx`);
      return;
    }

  };

  return (
    <div className="space-y-5">
      <style>{GUIDE_CSS}</style>
      <div className={REPORT_PANEL}>
        <ReportHeading
          title="📊 เปรียบเทียบยอดเบิก"
          description="เทียบยอดเบิกรายเดือนหรือรายปี (เลือกเดือนเดียวกันของปีก่อนได้) แยกตามแผนก สินค้า หรือโซน เฉพาะใบเบิกที่อนุมัติแล้ว"
          actions={
            <>
              <button
                type="button"
                onClick={refresh}
                disabled={!raw || reloading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>🔄</span><span>{reloading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={!raw || !compare}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-bold text-emerald-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>📗</span><span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-95"
              >
                <span>🖨️</span><span>พิมพ์</span>
              </button>
            </>
          }
        />

        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="แสดงตัวเลขเป็น" className="text-xs font-bold text-slate-500">
            แสดงตัวเลขเป็น
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-200">
              {([['cost', 'ยอดเงิน (บาท)'], ['qty', 'จำนวนชิ้น']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={measure === value}
                  onClick={() => setMeasure(value)}
                  className={'h-10 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 ' + (measure === value ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-brand-50')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs font-bold text-slate-500">
            แผนก
            <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className={SELECT + ' mt-1 block'}>
              <option value="all">ทุกแผนก</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            โซน
            <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }} className={SELECT + ' mt-1 block'}>
              <option value="all">ทุกโซน</option>
              {zoneOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => { setHideEmpty(e.target.checked); setPage(1); }} className="h-4 w-4 accent-brand-700" />
            ซ่อนแถวที่ไม่มียอด
          </label>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {!raw && !error && <p role="status" className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p>}

      {raw && (
        <>
          <p className="hidden text-sm font-semibold text-slate-600 print:block">เปรียบเทียบยอดเบิก · {selMonths.map(monthShort).join(', ')}</p>
          {loadedAt && (
            <p className="text-xs font-semibold text-slate-400 print:hidden">
              ข้อมูล ณ {new Date(loadedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น. · กด “รีเฟรช” เพื่อดึงข้อมูลล่าสุด
            </p>
          )}
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {measure === 'cost'
                ? 'ตัวเลขในหน้านี้เป็นยอดเงิน (บาท) = จำนวน × ราคาตอนเบิก'
                : 'ตัวเลขในหน้านี้เป็นจำนวนที่เบิก นับรวมทุกหน่วย (เช่น ชิ้น กล่อง แพ็ค) ไม่ใช่ยอดเงิน'}
            </p>
            <CompareSection
              availableMonths={availableMonths}
              selMonths={selMonths}
              compare={compare}
              by={compareBy}
              unit={unit}
              page={page}
              onBy={(b) => { setCompareBy(b); setPage(1); }}
              onToggle={toggleMonth}
              onQuick={quickMonths}
              onClear={clearMonths}
              onYoY={yearOverYear}
              canYoY={canYoY}
              onPage={setPage}
            />
          </section>
        </>
      )}
    </div>
  );
}