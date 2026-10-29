'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReportHeading, { REPORT_PANEL } from '@/components/ReportHeading';
import ReportDatePresets, { reportDateRange } from '@/components/ReportDatePresets';
import ReportPagination from '@/components/ReportPagination';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';

/* ───────────────────────── ชนิดข้อมูล ───────────────────────── */
type Rec = { date: string; dept: string; zone: string; cost: number; item: string; unit: string; qty: number };
type ItemRow = { key: string; dept: string; zone: string; item: string; unit: string; qty: number; cost: number };
type Row = { key: string; label: string; values: number[]; total: number };
type Tbl = { rowHeader: string; cols: string[]; rows: Row[]; colTotals: number[]; grand: number };
type View = 'overview' | 'dailyDept' | 'dailyItem' | 'monthDept' | 'monthItem' | 'deptItem' | 'zone' | 'items' | 'deptBlocks';
type ColMode = 'all' | 'used';
type Measure = 'cost' | 'qty';
const MEASURE_UNIT: Record<Measure, string> = { cost: 'บาท', qty: 'ชิ้น' };
type Ctx = { depts: string[]; dept: string; hideEmpty: boolean; colMode: ColMode; allItems: string[] };

const VIEWS: { value: View; label: string }[] = [
  { value: 'overview', label: 'ภาพรวม' },
  { value: 'deptBlocks', label: 'รายแผนก (รายวัน)' },
  { value: 'dailyDept', label: 'รายวัน × แผนก' },
  { value: 'dailyItem', label: 'รายวัน × สินค้า' },
  { value: 'monthDept', label: 'รายเดือน × แผนก' },
  { value: 'monthItem', label: 'รายเดือน × สินค้า' },
  { value: 'deptItem', label: 'แผนก × สินค้า' },
  { value: 'zone', label: 'รายโซน × สินค้า' },
  { value: 'items', label: 'รายการที่เบิก' },
];

const DAILY_PAGE_SIZE = 31;
const ITEMS_PAGE_SIZE = 20;
const SEP = '\u0001';
const NUM_W = 44; // ความกว้างคอลัมน์ "#" (ลำดับ)
const NUM_STYLE: CSSProperties = { width: NUM_W, minWidth: NUM_W, maxWidth: NUM_W };
const COL_W = 120; // ความกว้างคอลัมน์ชื่อสินค้า/แผนก (ชื่อยาวขึ้น 3 บรรทัด ที่เหลือชี้เมาส์ดูเต็ม)
const COL_STYLE: CSSProperties = { width: COL_W, minWidth: COL_W, maxWidth: COL_W };

/* ───────────────────────── ตัวช่วย ───────────────────────── */
const fmt = (n: number) =>
  Math.abs(n) < 0.005 ? '-' : n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const dayLabel = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (m: string) =>
  new Date(m + '-15T12:00:00Z').toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < 3660) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function sumMap(recs: Rec[], rk: (r: Rec) => string, ck: (r: Rec) => string) {
  const m = new Map<string, number>();
  for (const r of recs) {
    const k = rk(r) + SEP + ck(r);
    m.set(k, (m.get(k) ?? 0) + r.cost);
  }
  return m;
}

function totalsBy(recs: Rec[], key: (r: Rec) => string) {
  const m = new Map<string, number>();
  recs.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + r.cost));
  return m;
}

function buildTable(
  rowHeader: string,
  rowKeys: string[],
  label: (k: string) => string,
  cols: string[],
  m: Map<string, number>,
  hideRows: boolean,
  hideCols: boolean,
): Tbl {
  let rows: Row[] = rowKeys.map((key) => {
    const values = cols.map((c) => m.get(key + SEP + c) ?? 0);
    return { key, label: label(key), values, total: values.reduce((a, b) => a + b, 0) };
  });
  if (hideRows) rows = rows.filter((r) => r.total !== 0);
  let keep = cols.map((_, i) => i);
  if (hideCols) keep = keep.filter((i) => rows.some((r) => r.values[i] !== 0));
  const outCols = keep.map((i) => cols[i]);
  rows = rows.map((r) => ({ ...r, values: keep.map((i) => r.values[i]) }));
  return {
    rowHeader,
    cols: outCols,
    rows,
    colTotals: outCols.map((_, i) => rows.reduce((s, r) => s + r.values[i], 0)),
    grand: rows.reduce((s, r) => s + r.total, 0),
  };
}

// สินค้าทุกรายการ เรียงตามยอดเบิกมาก→น้อย ที่เหลือเรียงตามชื่อ (ลำดับเดียวกันทุกตาราง)
function rankItems(names: string[], totals: Map<string, number>) {
  return [...names].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b, 'th'));
}

// all = ทุกสินค้าในฐานข้อมูล, used = เฉพาะสินค้าที่มียอดเบิกในข้อมูลชุดนั้น
function pickCols(allItems: string[], src: Rec[], colMode: ColMode) {
  if (colMode === 'all') return allItems;
  const used = new Set(src.filter((r) => r.cost !== 0).map((r) => r.item));
  return allItems.filter((i) => used.has(i));
}

// คำนวณตารางทุกมุมมอง (ใช้ทั้งแสดงบนจอและส่งออก Excel)
function makeTables(scoped: Rec[], days: string[], c: Ctx) {
  const { depts, dept, hideEmpty, colMode, allItems } = c;
  const deptSrc = dept === 'all' ? scoped : scoped.filter((r) => r.dept === dept);
  const zoneSrc = deptSrc.filter((r) => r.zone);
  const zoneKeys = [...new Set(zoneSrc.map((r) => r.dept + SEP + r.zone))].sort((a, b) => a.localeCompare(b, 'th'));
  const zoneLabel = (k: string) => {
    const [d, z] = k.split(SEP);
    return dept === 'all' ? `${z} (${d})` : z;
  };
  const hideCols = colMode === 'used';
  const months = [...new Set(days.map(monthKey))];
  return {
    dailyDept: buildTable('วันที่', days, dayLabel, depts, sumMap(scoped, (r) => r.date, (r) => r.dept), hideEmpty, hideEmpty),
    dailyItem: buildTable('วันที่', days, dayLabel, pickCols(allItems, deptSrc, colMode), sumMap(deptSrc, (r) => r.date, (r) => r.item), hideEmpty, hideCols),
    monthDept: buildTable('เดือน', months, monthLabel, depts, sumMap(scoped, (r) => monthKey(r.date), (r) => r.dept), hideEmpty, hideEmpty),
    monthItem: buildTable('เดือน', months, monthLabel, pickCols(allItems, deptSrc, colMode), sumMap(deptSrc, (r) => monthKey(r.date), (r) => r.item), hideEmpty, hideCols),
    deptItem: buildTable('แผนก', depts, (k) => k, pickCols(allItems, scoped, colMode), sumMap(scoped, (r) => r.dept, (r) => r.item), hideEmpty, hideCols),
    zone: buildTable('โซน', zoneKeys, zoneLabel, pickCols(allItems, zoneSrc, colMode), sumMap(zoneSrc, (r) => r.dept + SEP + r.zone, (r) => r.item), hideEmpty, hideCols),
  };
}

// บล็อกรายวันของแต่ละแผนก — คอลัมน์คือชื่อสินค้าจากฐานข้อมูล
function makeBlocks(scoped: Rec[], days: string[], c: Ctx) {
  const { depts, dept, hideEmpty, colMode, allItems } = c;
  const dayHasData = new Set(scoped.filter((r) => r.cost !== 0).map((r) => r.date));
  const blockDays = hideEmpty ? days.filter((d) => dayHasData.has(d)) : days;
  return (dept === 'all' ? depts : [dept])
    .map((name) => {
      const src = scoped.filter((r) => r.dept === name);
      return { name, t: buildTable('วันที่', blockDays, dayLabel, pickCols(allItems, src, colMode), sumMap(src, (r) => r.date, (r) => r.item), false, false) };
    })
    .filter((b) => !hideEmpty || b.t.grand !== 0);
}

// รายการสินค้าที่แต่ละแผนกเบิก (รวมตามแผนก [+โซน] + สินค้า + หน่วย)
function makeItemRows(scoped: Rec[], dept: string, search: string, byZone: boolean): ItemRow[] {
  const q = search.trim().toLowerCase();
  const m = new Map<string, ItemRow>();
  for (const r of scoped) {
    if (dept !== 'all' && r.dept !== dept) continue;
    if (q && !r.item.toLowerCase().includes(q)) continue;
    const zone = byZone ? r.zone : '';
    const key = [r.dept, zone, r.item, r.unit].join(SEP);
    const cur = m.get(key) ?? { key, dept: r.dept, zone, item: r.item, unit: r.unit, qty: 0, cost: 0 };
    cur.qty += r.qty;
    cur.cost += r.cost;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.cost - a.cost || a.dept.localeCompare(b.dept, 'th'));
}

/* ───────────────────────── โหลดข้อมูล ───────────────────────── */
// Supabase คืนข้อมูลสูงสุด 1,000 แถวต่อครั้ง จึงดึงเป็นหน้า ๆ จนครบ
async function fetchAll(make: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: unknown }>) {
  const out: any[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await make(a, a + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Raw = { reqs: any[]; details: any[]; branches: string[]; items: string[]; pending: number | null };

const PENDING_STATUS = 'pending'; // ปรับให้ตรงกับค่า status ของใบเบิกที่รออนุมัติในตาราง requisitions
const CACHE_MS = 5 * 60 * 1000;
let rawCache: { raw: Raw; at: number } | null = null;

// ใช้ข้อมูลที่โหลดไว้ซ้ำภายใน 5 นาที (สลับรายงานแล้วกลับมาไม่ต้องดึงใหม่) — force = กดรีเฟรช
async function loadRaw(force = false): Promise<{ raw: Raw; at: number }> {
  if (!force && rawCache && Date.now() - rawCache.at < CACHE_MS) return rawCache;
  const raw = await fetchRaw();
  rawCache = { raw, at: Date.now() };
  return rawCache;
}

async function fetchRaw(): Promise<Raw> {
  const [reqs, itemRows, branchRes, pendingRes] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from('requisitions')
        .select('id, branch_name, zone_name, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(a, b),
    ),
    fetchAll((a, b) => supabase.from('items').select('name').order('name').range(a, b)),
    // แผนกที่ปิดใช้งานแล้วไม่ต้องขึ้นเป็นคอลัมน์ว่าง (ถ้ามียอดเบิกย้อนหลัง จะถูกเติมกลับจากข้อมูลใบเบิกเอง)
    supabase.from('branches').select('name').eq('is_active', true).order('name'),
    supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', PENDING_STATUS),
  ]);

  const ids: string[] = reqs.map((r) => r.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const details: any[] = [];
  for (let i = 0; i < chunks.length; i += 6) {
    const part = await Promise.all(
      chunks.slice(i, i + 6).map((chunk) =>
        fetchAll((a, b) =>
          supabase
            .from('requisition_details')
            .select('requisition_id, quantity, price_at_time, items (name, unit)')
            .in('requisition_id', chunk)
            .range(a, b),
        ),
      ),
    );
    part.forEach((p) => details.push(...p));
  }
  return { reqs, details, items: itemRows.map((i: { name: string }) => i.name).filter(Boolean), branches: (branchRes.data ?? []).map((b: { name: string }) => b.name), pending: pendingRes.error ? null : (pendingRes.count ?? 0) };
}

/* ───────────────────────── Tooltip ชื่อเต็ม ───────────────────────── */
// ข้อความที่ยาวเกินช่องจะถูกตัด (…) และเมื่อชี้เมาส์จะมี popup แสดงชื่อเต็ม
function TruncText({ text, lines = 1, className = '' }: { text: string; lines?: 1 | 2 | 3; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ x: number; top: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const over = lines === 1 ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1;
    if (!over) return;
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  const style: CSSProperties =
    lines === 1
      ? { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
      : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'break-word' };

  const above = tip ? tip.bottom > window.innerHeight - 90 : false;

  return (
    <span ref={ref} className={className} style={style} onMouseEnter={show} onMouseLeave={() => setTip(null)}>
      {text}
      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none max-w-75 whitespace-normal wrap-break-word rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-semibold leading-snug text-white shadow-xl print:hidden"
            style={{
              position: 'fixed',
              zIndex: 9999,
              left: Math.min(Math.max(tip.x, 160), Math.max(160, window.innerWidth - 160)),
              top: above ? tip.top - 6 : tip.bottom + 6,
              transform: above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

/* ───────────────────────── Guideline แถว/คอลัมน์ ───────────────────────── */
// ชี้ที่ช่องใด → ไฮไลต์แถวและคอลัมน์ของช่องนั้น (รวมหัวตาราง) ให้เห็นแนวตั้ง–แนวนอน
// ทำงานผ่าน data-r (แถว) และ data-c (คอลัมน์) บนแต่ละเซลล์
const GUIDE_CSS = `
.sg-r,.sg-c{background-color:#fef3c7 !important;}
th.sg-r,th.sg-c{background-color:#f59e0b !important;color:#1c1917 !important;}
.sg-hit{background-color:#fcd34d !important;box-shadow:inset 0 0 0 2px #b45309;color:#1c1917 !important;}
`;

function GridGuide({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const marked = useRef<Element[]>([]);
  const key = useRef('');

  const reset = () => {
    marked.current.forEach((el) => el.classList.remove('sg-r', 'sg-c', 'sg-hit'));
    marked.current = [];
    key.current = '';
  };

  const onOver = (e: React.MouseEvent) => {
    const host = root.current;
    const cell = (e.target as HTMLElement).closest<HTMLElement>('td,th');
    if (!host || !cell || !host.contains(cell)) return;
    const r = cell.dataset.r;
    const c = cell.dataset.c;
    const k = `${r ?? ''}|${c ?? ''}`;
    if (k === key.current) return;
    reset();
    key.current = k;
    if (r === undefined && c === undefined) return;
    const mark = (sel: string, cls: string) =>
      host.querySelectorAll(sel).forEach((el) => {
        el.classList.add(cls);
        marked.current.push(el);
      });
    if (r !== undefined) mark(`[data-r="${r}"]`, 'sg-r');
    if (c !== undefined) mark(`[data-c="${c}"]`, 'sg-c');
    cell.classList.add('sg-hit');
    marked.current.push(cell);
  };

  return (
    <div ref={root} onMouseOver={onOver} onMouseLeave={reset}>
      {children}
    </div>
  );
}

/* ───────────────────────── ส่วนแสดงผลย่อย ───────────────────────── */
function DataTable({ t, rows, offset = 0 }: { t: Tbl; rows: Row[]; offset?: number }) {
  const th = 'sticky top-0 z-10 whitespace-nowrap bg-[#1a3a6e] px-3 py-2.5 text-center text-xs font-bold text-white';
  return (
    <GridGuide>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-blue-100 print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th + ' left-0 z-20 px-1!'} style={NUM_STYLE}>#</th>
              <th className={th + ' z-20 text-left'} style={{ left: NUM_W }}>{t.rowHeader}</th>
              {t.cols.map((c, j) => (
                <th key={c} data-c={j} className={th + ' align-middle'} style={COL_STYLE}>
                  <TruncText text={c} lines={3} className="leading-snug" />
                </th>
              ))}
              <th data-c="s" className={th + ' bg-blue-900'}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-blue-50 odd:bg-white even:bg-blue-50/30">
                <td data-r={i} className="sticky left-0 bg-inherit px-1 py-2 text-center text-xs font-semibold tabular-nums text-slate-400" style={NUM_STYLE}>
                  {offset + i + 1}
                </td>
                <th scope="row" data-r={i} className="sticky whitespace-nowrap bg-inherit px-3 py-2 text-left text-xs font-bold text-slate-700" style={{ left: NUM_W }}>
                  <TruncText text={r.label} className="max-w-48" />
                </th>
                {r.values.map((v, j) => (
                  <td key={j} data-r={i} data-c={j} className={'px-3 py-2 text-right tabular-nums ' + (v === 0 ? 'text-slate-300' : 'text-slate-700')}>
                    {fmt(v)}
                  </td>
                ))}
                <td data-r={i} data-c="s" className="bg-blue-50 px-3 py-2 text-right font-bold tabular-nums text-blue-900">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-blue-200 bg-blue-100 font-black text-blue-950">
              <th data-r="t" className="sticky left-0 bg-blue-100" style={NUM_STYLE} />
              <th scope="row" data-r="t" className="sticky bg-blue-100 px-3 py-2.5 text-left text-xs" style={{ left: NUM_W }}>รวม</th>
              {t.colTotals.map((v, j) => (
                <td key={j} data-r="t" data-c={j} className="px-3 py-2.5 text-right tabular-nums">{fmt(v)}</td>
              ))}
              <td data-r="t" data-c="s" className="px-3 py-2.5 text-right tabular-nums">{fmt(t.grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </GridGuide>
  );
}

function ShareList({ title, items, total }: { title: string; items: { label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <section className="rounded-xl border border-blue-100 p-4">
      <h2 className="text-sm font-black text-[#1a3a6e]">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((i, idx) => (
            <li key={i.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{idx + 1}</span>
                  <span className="min-w-0 flex-1 font-semibold text-slate-700"><TruncText text={i.label} /></span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-600">
                  <b className="text-blue-900">{fmt(i.value)}</b>
                  <span className="ml-2 text-xs text-slate-400">{total ? ((i.value / total) * 100).toFixed(1) : '0.0'}%</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-blue-50" aria-hidden="true">
                <div className="h-2 rounded-full bg-[#1a3a6e]" style={{ width: `${(i.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemsTable({ rows, showZone, total, offset = 0 }: { rows: ItemRow[]; showZone: boolean; total: number; offset?: number }) {
  const th = 'sticky top-0 z-10 whitespace-nowrap bg-[#1a3a6e] px-3 py-2.5 text-xs font-bold text-white';
  return (
    <GridGuide>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-blue-100 print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th + ' left-0 z-20 text-center px-1!'} style={NUM_STYLE}>#</th>
              <th data-c="d" className={th + ' text-left'}>แผนก</th>
              {showZone && <th data-c="z" className={th + ' text-left'}>โซน</th>}
              <th data-c="i" className={th + ' text-left'}>สินค้า</th>
              <th data-c="q" className={th + ' text-right'}>จำนวน</th>
              <th data-c="u" className={th + ' text-left'}>หน่วย</th>
              <th data-c="m" className={th + ' text-right'}>ยอดเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-blue-50 odd:bg-white even:bg-blue-50/30">
                <td data-r={i} className="sticky left-0 bg-inherit px-1 py-2 text-center text-xs font-semibold tabular-nums text-slate-400" style={NUM_STYLE}>
                  {offset + i + 1}
                </td>
                <td data-r={i} data-c="d" className="whitespace-nowrap px-3 py-2 text-xs font-bold text-slate-700">
                  <TruncText text={r.dept} className="max-w-40" />
                </td>
                {showZone && (
                  <td data-r={i} data-c="z" className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                    <TruncText text={r.zone || '-'} className="max-w-40" />
                  </td>
                )}
                <td data-r={i} data-c="i" className="px-3 py-2 font-semibold text-slate-700">
                  <TruncText text={r.item} className="max-w-88" />
                </td>
                <td data-r={i} data-c="q" className="px-3 py-2 text-right tabular-nums">{fmt(r.qty)}</td>
                <td data-r={i} data-c="u" className="px-3 py-2 text-xs text-slate-500">{r.unit}</td>
                <td data-r={i} data-c="m" className="px-3 py-2 text-right font-bold tabular-nums text-blue-900">{fmt(r.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-blue-200 bg-blue-100 font-black text-blue-950">
              <th scope="row" data-r="t" colSpan={showZone ? 6 : 5} className="px-3 py-2.5 text-right text-xs">รวมทั้งหมด (ตามตัวกรอง)</th>
              <td data-r="t" data-c="m" className="px-3 py-2.5 text-right tabular-nums">{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </GridGuide>
  );
}

function DeptBlock({ name, t, hideEmpty, unit }: { name: string; t: Tbl; hideEmpty: boolean; unit: string }) {
  const rows = hideEmpty ? t.rows.filter((r) => r.total !== 0) : t.rows;
  const th = 'sticky top-0 z-10 bg-emerald-600 px-2 py-2 text-center text-xs font-bold leading-tight text-white';
  return (
    <details open className="overflow-hidden rounded-xl border border-emerald-200">
      <summary className="flex cursor-pointer items-center justify-between gap-3 bg-emerald-600 px-4 py-2.5 text-white">
        <span className="min-w-0 font-black"><TruncText text={name} className="max-w-md" /></span>
        <span className="shrink-0 text-sm font-bold tabular-nums">รวม {fmt(t.grand)} {unit}</span>
      </summary>
      <div className="p-2">
        <GridGuide>
          <div className="max-h-[60vh] overflow-auto print:max-h-none print:overflow-visible">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th + ' left-0 z-20 px-1!'} style={NUM_STYLE}>#</th>
                  <th className={th + ' z-20 whitespace-nowrap text-left'} style={{ left: NUM_W }}>วัน เดือน ปี</th>
                  <th data-c="x" className={th + ' whitespace-nowrap'}>ยอดเบิกทั้งหมด</th>
                  {t.cols.map((c, j) => (
                    <th key={c} data-c={j} className={th + ' align-middle'} style={COL_STYLE}>
                      <TruncText text={c} lines={3} className="leading-snug" />
                    </th>
                  ))}
                  <th data-c="s" className={th + ' bg-emerald-800'}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td data-r={i} className="sticky left-0 bg-white px-1 py-1.5 text-center text-xs font-semibold tabular-nums text-slate-400" style={NUM_STYLE}>{i + 1}</td>
                    <th scope="row" data-r={i} className="sticky whitespace-nowrap bg-sky-100 px-2 py-1.5 text-left text-xs font-bold text-slate-700" style={{ left: NUM_W }}>{r.label}</th>
                    <td data-r={i} data-c="x" className="bg-yellow-100 px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(r.total)}</td>
                    {r.values.map((v, j) => (
                      <td key={j} data-r={i} data-c={j} className={'px-2 py-1.5 text-right tabular-nums ' + (v === 0 ? 'text-slate-300' : 'text-slate-700')}>{fmt(v)}</td>
                    ))}
                    <td data-r={i} data-c="s" className="bg-sky-100 px-2 py-1.5 text-right font-bold tabular-nums text-blue-900">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-orange-300 bg-orange-200 font-black text-slate-900">
                  <th data-r="t" className="sticky left-0 bg-orange-200" style={NUM_STYLE} />
                  <th scope="row" data-r="t" className="sticky bg-orange-200 px-2 py-2 text-left text-xs" style={{ left: NUM_W }}>รวม</th>
                  <td data-r="t" data-c="x" className="px-2 py-2 text-right tabular-nums">{fmt(t.grand)}</td>
                  {t.colTotals.map((v, j) => <td key={j} data-r="t" data-c={j} className="px-2 py-2 text-right tabular-nums">{fmt(v)}</td>)}
                  <td data-r="t" data-c="s" className="px-2 py-2 text-right tabular-nums">{fmt(t.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </GridGuide>
      </div>
    </details>
  );
}

const SELECT = 'h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-700';

/* ───────────────────────── หน้ารายงาน ───────────────────────── */
export default function SupplyUseReports() {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  // ตัวกรองหลักเก็บใน URL (?view=&from=&to=&dept=&measure=&cols=&hide=) เพื่อรีเฟรชแล้วไม่หาย และส่งลิงก์ให้คนอื่นได้
  const urlParams = () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const dateParam = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const [view, setView] = useState<View>(() => {
    const v = urlParams().get('view');
    return VIEWS.some((x) => x.value === v) ? (v as View) : 'overview';
  });
  const [range, setRange] = useState(() => {
    const p = urlParams();
    return p.has('from') || p.has('to') ? { from: dateParam(p.get('from')), to: dateParam(p.get('to')) } : reportDateRange('month');
  });
  const [dept, setDept] = useState(() => urlParams().get('dept') || 'all');
  const [hideEmpty, setHideEmpty] = useState(() => urlParams().get('hide') === '1');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [byZone, setByZone] = useState(false);
  const [colMode, setColMode] = useState<ColMode>(() => (urlParams().get('cols') === 'used' ? 'used' : 'all'));
  const [measure, setMeasure] = useState<Measure>(() => (urlParams().get('measure') === 'qty' ? 'qty' : 'cost'));
  const unit = MEASURE_UNIT[measure];

  useEffect(() => {
    const url = new URL(window.location.href);
    const put = (k: string, v: string, def: string) => (v === def ? url.searchParams.delete(k) : url.searchParams.set(k, v));
    put('view', view, 'overview');
    put('dept', dept, 'all');
    put('measure', measure, 'cost');
    put('cols', colMode, 'all');
    put('hide', hideEmpty ? '1' : '', '');
    url.searchParams.set('from', range.from);
    url.searchParams.set('to', range.to);
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', next);
  }, [view, dept, measure, colMode, hideEmpty, range]);

  // ออกจากรายงานนี้ → ล้างตัวกรองออกจาก URL ไม่ให้ไปติดรายงานอื่น (คง ?report= ไว้)
  useEffect(() => () => {
    const url = new URL(window.location.href);
    ['view', 'dept', 'measure', 'cols', 'hide', 'from', 'to'].forEach((k) => url.searchParams.delete(k));
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

  // ใบเบิกที่อนุมัติ + รายการ → แถวข้อมูลแบน ๆ (วัน, แผนก, โซน, สินค้า, ยอดเงิน)
  const recs = useMemo<Rec[]>(() => {
    if (!raw) return [];
    const reqMap = new Map<string, { date: string; dept: string; zone: string }>();
    for (const r of raw.reqs) {
      if (!r.created_at) continue;
      reqMap.set(r.id, {
        date: new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }),
        dept: r.branch_name || 'ไม่ระบุแผนก',
        zone: r.zone_name || '',
      });
    }
    const out: Rec[] = [];
    for (const d of raw.details) {
      const q = reqMap.get(d.requisition_id);
      if (!q) continue;
      const item = Array.isArray(d.items) ? d.items[0] : d.items;
      const name: string = item?.name || 'ไม่ทราบชื่อสินค้า';
      out.push({
        ...q,
        item: name,
        unit: item?.unit || 'ชิ้น',
        qty: d.quantity || 0,
        cost: (d.quantity || 0) * (d.price_at_time || 0),
      });
    }
    return out;
  }, [raw]);

  const depts = useMemo(() => {
    const list = [...(raw?.branches ?? [])];
    for (const r of recs) if (!list.includes(r.dept)) list.push(r.dept);
    return list;
  }, [raw, recs]);

  useEffect(() => {
    if (raw && dept !== 'all' && !depts.includes(dept)) setDept('all');
  }, [raw, depts, dept]);

  const itemNames = useMemo(() => [...new Set([...(raw?.items ?? []), ...recs.map((r) => r.item)])], [raw, recs]);

  const scoped = useMemo(
    () => recs.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)),
    [recs, range],
  );

  const days = useMemo(() => {
    if (!scoped.length && !(range.from && range.to)) return [];
    const dates = scoped.map((r) => r.date).sort();
    const start = range.from || dates[0];
    const end = range.to || dates[dates.length - 1];
    return start && end ? eachDay(start, end) : [];
  }, [scoped, range]);

  // ข้อมูลที่ใช้คำนวณตารางทั้งหมด: โหมด "ยอดเงิน" ใช้ cost, โหมด "จำนวน" ใช้ qty (ใส่ลงฟิลด์ cost เพื่อใช้ฟังก์ชันเดิมร่วมกัน)
  const data = useMemo<Rec[]>(
    () => (measure === 'cost' ? scoped : scoped.map((r) => ({ ...r, cost: r.qty }))),
    [scoped, measure],
  );

  const byDept = useMemo(() => totalsBy(data, (r) => r.dept), [data]);
  const byItem = useMemo(() => totalsBy(data, (r) => r.item), [data]);
  const zoneTotals = useMemo(
    () => totalsBy(data.filter((r) => r.zone), (r) => `${r.zone} (${r.dept})`),
    [data],
  );
  const zoneTotal = [...zoneTotals.values()].reduce((s, v) => s + v, 0);

  // รายการที่เบิกจริงแต่ไม่มีราคาตอนเบิก (ราคา 0/ว่าง) → ยอดเงินจะเป็น 0 ทำให้ยอดรวมต่ำกว่าจริง
  const unpriced = useMemo(() => {
    const names = new Set<string>();
    let lines = 0;
    for (const r of scoped) if (r.qty > 0 && r.cost === 0) { names.add(r.item); lines++; }
    return { lines, names: [...names].sort((a, b) => a.localeCompare(b, 'th')) };
  }, [scoped]);

  const total = data.reduce((s, r) => s + r.cost, 0);
  const activeDays = new Set(data.filter((r) => r.cost !== 0).map((r) => r.date)).size;
  const topDept = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0];
  const topItem = [...byItem.entries()].sort((a, b) => b[1] - a[1])[0];

  const allItems = useMemo(() => rankItems(itemNames, byItem), [itemNames, byItem]);

  const tables = useMemo(
    () => makeTables(data, days, { depts, dept, hideEmpty, colMode, allItems }),
    [data, days, depts, dept, hideEmpty, colMode, allItems],
  );
  const table: Tbl | null = view === 'overview' || view === 'items' || view === 'deptBlocks' ? null : tables[view];

  const blocks = useMemo(
    () => makeBlocks(data, days, { depts, dept, hideEmpty, colMode, allItems }),
    [data, days, depts, dept, hideEmpty, colMode, allItems],
  );

  const itemRows = useMemo(() => makeItemRows(scoped, dept, search, byZone), [scoped, dept, search, byZone]);
  const itemsTotal = itemRows.reduce((s, r) => s + r.cost, 0);

  const isDaily = view === 'dailyDept' || view === 'dailyItem';
  const pageOffset = isDaily ? (page - 1) * DAILY_PAGE_SIZE : 0;
  const pageRows = table ? (isDaily ? table.rows.slice(pageOffset, page * DAILY_PAGE_SIZE) : table.rows) : [];

  const rangeLabel =
    range.from || range.to
      ? `${range.from ? dayLabel(range.from) : 'ตั้งต้น'} ถึง ${range.to ? dayLabel(range.to) : 'ปัจจุบัน'}`
      : 'ข้อมูลสะสมทั้งหมด';

  const changeRange = (r: { from: string; to: string }) => { setRange(r); setPage(1); };
  const changeView = (v: View) => { setView(v); setPage(1); };

  const ranked = (m: Map<string, number>) =>
    [...m.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  /* ───────── ส่งออก Excel (ตามช่วงวันที่/ตัวกรองบนหน้าจอ) ───────── */
  const exportExcel = async () => {
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
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6E' } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      row.height = 36;
    };
    const fill = (c: ExcelJS.Cell, argb: string) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };

    const addTableSheet = (name: string, title: string, t: Tbl) => {
      const ws = wb.addWorksheet(name);
      const lastCol = t.cols.length + 2;
      head(ws, title, lastCol);
      ws.addRow([]); // เว้นแถว 3 ให้หัวตารางอยู่แถว 4 และข้อมูลเริ่มแถว 5
      styleHeader(ws.addRow([t.rowHeader, ...t.cols, 'รวม']));
      const first = 5;
      t.rows.forEach((r, i) => {
        const n = first + i;
        const row = ws.addRow([r.label, ...r.values]);
        row.getCell(lastCol).value = t.cols.length ? { formula: `SUM(B${n}:${ws.getColumn(lastCol - 1).letter}${n})`, result: r.total } : 0;
        row.getCell(lastCol).font = { bold: true };
      });
      const last = first + t.rows.length - 1;
      const tot = ws.addRow(['รวม']);
      for (let c = 2; c <= lastCol; c++) {
        const L = ws.getColumn(c).letter;
        const result = c === lastCol ? t.grand : t.colTotals[c - 2];
        tot.getCell(c).value = t.rows.length ? { formula: `SUM(${L}${first}:${L}${last})`, result } : 0;
      }
      tot.font = { bold: true };
      tot.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; });
      for (let r = first; r <= tot.number; r++) for (let c = 2; c <= lastCol; c++) ws.getCell(r, c).numFmt = NUM;
      ws.getColumn(1).width = 26;
      for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 16;
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
    };

    // ภาพรวม
    const ov = wb.addWorksheet('ภาพรวม');
    head(ov, measure === 'cost' ? 'สรุป Supply Use (ยอดเงิน บาท)' : 'สรุป Supply Use (จำนวนที่เบิก)', 4);
    const addList = (title: string, items: { label: string; value: number }[], base: number) => {
      styleHeader(ov.addRow([title, measure === 'cost' ? 'ยอดเบิก (บาท)' : 'จำนวนที่เบิก (ชิ้น)', '%']));
      const start = ov.rowCount + 1;
      items.forEach((it) => {
        const row = ov.addRow([it.label, it.value, base ? it.value / base : 0]);
        row.getCell(2).numFmt = NUM;
        row.getCell(3).numFmt = '0.0%';
      });
      const sum = ov.addRow(['รวม', items.length ? { formula: `SUM(B${start}:B${ov.rowCount})`, result: base } : 0]);
      sum.font = { bold: true };
      sum.getCell(2).numFmt = NUM;
      ov.addRow([]);
    };
    ov.addRow([]);
    addList('สรุปการเบิกรายแผนก', ranked(byDept), total);
    addList('สรุปการเบิกรายโซน (เฉพาะใบเบิกที่ระบุโซน)', ranked(zoneTotals), zoneTotal);
    addList(measure === 'cost' ? 'สรุปยอดเบิกแยกตามสินค้า' : 'สรุปจำนวนที่เบิกแยกตามสินค้า', ranked(byItem), total);
    ov.getColumn(1).width = 40;
    ov.getColumn(2).width = 18;
    ov.getColumn(3).width = 10;

    // รายแผนก (รายวัน) — แยกชีตละแผนก (แท็บสีเขียว) แทนการต่อบล็อกไปทางขวา
    const usedNames = new Set(['ภาพรวม', 'รายวัน × แผนก', 'รายวัน × สินค้า', 'รายเดือน × แผนก', 'รายเดือน × สินค้า', 'แผนก × สินค้า', 'รายโซน × สินค้า', 'รายการที่เบิก']);
    const sheetName = (raw: string) => {
      const base = (raw.replace(/[:\\/?*[\]]/g, ' ').trim() || 'แผนก').slice(0, 31);
      let name = base;
      let n = 2;
      while (usedNames.has(name)) {
        const suf = ` (${n++})`;
        name = base.slice(0, 31 - suf.length) + suf;
      }
      usedNames.add(name);
      return name;
    };
    const addDeptSheet = (name: string, t: Tbl) => {
      const ws = wb.addWorksheet(sheetName(name), { properties: { tabColor: { argb: 'FF00B050' } } });
      const nItems = t.cols.length;
      const lastCol = nItems + 2; // วัน + ยอดเบิกทั้งหมด + สินค้า
      const first = 5;
      const last = first + t.rows.length - 1;
      const lastLetter = ws.getColumn(lastCol).letter;
      head(ws, `ยอดเบิกรายวัน · แผนก${name}`, lastCol);

      // แถว 3 = ยอดรวม (อยู่บนสุด เห็นทันทีโดยไม่ต้องเลื่อนลงไปท้ายตาราง)
      const tot = ws.getRow(3);
      tot.getCell(1).value = 'รวมทั้งหมด';
      tot.getCell(2).value = { formula: `SUM(B${first}:B${last})`, result: t.grand };
      t.colTotals.forEach((v, i) => {
        const L = ws.getColumn(3 + i).letter;
        tot.getCell(3 + i).value = { formula: `SUM(${L}${first}:${L}${last})`, result: v };
      });
      for (let c = 1; c <= lastCol; c++) {
        const cell = tot.getCell(c);
        cell.font = { bold: true };
        fill(cell, 'FFF8CBAD');
        if (c > 1) cell.numFmt = NUM;
      }

      // แถว 4 = หัวตาราง
      const hr = ws.getRow(4);
      ['วัน เดือน ปี', 'ยอดเบิกทั้งหมด', ...t.cols].forEach((txt, i) => { hr.getCell(i + 1).value = txt; });
      styleHeader(hr);
      hr.height = 80;

      // ข้อมูล: วันที่ไม่มีการเบิกเป็นสีจาง วันที่มีการเบิกเน้นสี
      t.rows.forEach((r, i) => {
        const n = first + i;
        const row = ws.getRow(n);
        const has = r.total !== 0;
        const dc = row.getCell(1);
        dc.value = r.label;
        dc.alignment = { horizontal: 'left' };
        dc.font = { bold: has, color: { argb: has ? 'FF000000' : 'FF9CA3AF' } };
        if (has) fill(dc, 'FFDBEAFE');
        const sc = row.getCell(2);
        sc.value = nItems ? { formula: `SUM(C${n}:${lastLetter}${n})`, result: r.total } : 0;
        sc.numFmt = NUM;
        sc.font = { bold: true, color: { argb: has ? 'FF000000' : 'FFBFBFBF' } };
        if (has) fill(sc, 'FFFFE699');
        r.values.forEach((v, j) => {
          const c = row.getCell(3 + j);
          c.value = v;
          c.numFmt = NUM;
          if (v === 0) c.font = { color: { argb: 'FFD1D5DB' } };
          else {
            c.font = { bold: true };
            fill(c, 'FFFFF2CC');
          }
        });
      });

      ws.getColumn(1).width = 18;
      ws.getColumn(2).width = 16;
      for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = 15;
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, last), column: lastCol } };
    };
    makeBlocks(data, days, { depts, dept, hideEmpty, colMode: 'all', allItems })
      .filter((b) => b.t.grand !== 0 && b.t.rows.length > 0)
      .forEach((b) => addDeptSheet(b.name, b.t));

    addTableSheet('รายวัน × แผนก', 'ยอดเบิกรายวัน แยกตามแผนก', tables.dailyDept);
    addTableSheet('รายวัน × สินค้า', 'ยอดเบิกรายวัน แยกตามสินค้า' + deptNote, tables.dailyItem);
    addTableSheet('รายเดือน × แผนก', 'ยอดเบิกรายเดือน แยกตามแผนก', tables.monthDept);
    addTableSheet('รายเดือน × สินค้า', 'ยอดเบิกรายเดือน แยกตามสินค้า' + deptNote, tables.monthItem);
    addTableSheet('แผนก × สินค้า', 'ตารางไขว้ แผนก × สินค้า', tables.deptItem);
    addTableSheet('รายโซน × สินค้า', 'สรุปค่าใช้จ่ายรายโซน แยกตามสินค้า' + deptNote, tables.zone);

    // รายการที่เบิก (ตามตัวกรองในหน้าจอ)
    const iw = wb.addWorksheet('รายการที่เบิก');
    const iCols = byZone ? 6 : 5;
    head(iw, 'รายการสินค้าที่แต่ละแผนกเบิก' + deptNote, iCols, false);
    iw.addRow([]);
    styleHeader(iw.addRow(['แผนก', ...(byZone ? ['โซน'] : []), 'สินค้า', 'จำนวน', 'หน่วย', 'ยอดเงิน (บาท)']));
    itemRows.forEach((r) => iw.addRow([r.dept, ...(byZone ? [r.zone] : []), r.item, r.qty, r.unit, r.cost]));
    const iLast = 4 + itemRows.length;
    const iTot = iw.addRow([]);
    iTot.getCell(iCols - 1).value = 'รวม';
    iTot.getCell(iCols).value = itemRows.length ? { formula: `SUM(${iw.getColumn(iCols).letter}5:${iw.getColumn(iCols).letter}${iLast})`, result: itemsTotal } : 0;
    iTot.font = { bold: true };
    for (let r = 5; r <= iTot.number; r++) iw.getCell(r, iCols).numFmt = NUM;
    iw.getColumn(1).width = 22;
    if (byZone) iw.getColumn(2).width = 20;
    iw.getColumn(iCols - 3).width = 38;
    iw.getColumn(iCols).width = 18;
    iw.views = [{ state: 'frozen', ySplit: 4 }];

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `SupplyUse_${range.from || 'start'}_to_${range.to || 'now'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <style>{GUIDE_CSS}</style>
      <div className={REPORT_PANEL}>
        <ReportHeading
          title="🧾 สรุป Supply Use"
          description="ยอดเบิกรายวัน รายเดือน แยกตามแผนก สินค้า และโซน (เฉพาะใบเบิกที่อนุมัติแล้ว)"
          actions={
            <>
            <button
              type="button"
              onClick={refresh}
              disabled={!raw || reloading}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>🔄</span><span>{reloading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!raw || scoped.length === 0}
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

        <div className="space-y-3">
          <div className="text-sm"><ReportDatePresets from={range.from} to={range.to} onChange={changeRange} /></div>
          <div className="flex flex-wrap items-end gap-3">
            {view !== 'items' && (
              <div role="group" aria-label="แสดงตัวเลขเป็น" className="text-xs font-bold text-slate-500">
                แสดงตัวเลขเป็น
                <div className="mt-1 flex overflow-hidden rounded-xl border border-blue-100">
                  {([['cost', 'ยอดเงิน (บาท)'], ['qty', 'จำนวนชิ้น']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={measure === value}
                      onClick={() => setMeasure(value)}
                      className={'h-10 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700 ' + (measure === value ? 'bg-[#1a3a6e] text-white' : 'bg-white text-slate-600 hover:bg-blue-50')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="text-xs font-bold text-slate-500">
              ตั้งแต่วันที่
              <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => changeRange({ ...range, from: e.target.value })} className={SELECT + ' mt-1 block'} />
            </label>
            <label className="text-xs font-bold text-slate-500">
              ถึงวันที่
              <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => changeRange({ ...range, to: e.target.value })} className={SELECT + ' mt-1 block'} />
            </label>
            {(view === 'dailyItem' || view === 'monthItem' || view === 'zone' || view === 'items' || view === 'deptBlocks') && (
              <label className="text-xs font-bold text-slate-500">
                แผนก
                <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className={SELECT + ' mt-1 block'}>
                  <option value="all">ทุกแผนก</option>
                  {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
            {view === 'items' && (
              <>
                <label className="text-xs font-bold text-slate-500">
                  ค้นหาสินค้า
                  <input type="search" value={search} placeholder="พิมพ์ชื่อสินค้า" onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={SELECT + ' mt-1 block w-52'} />
                </label>
                <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-600">
                  <input type="checkbox" checked={byZone} onChange={(e) => { setByZone(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#1a3a6e]" />
                  แยกตามโซน
                </label>
              </>
            )}
            {(view === 'deptBlocks' || view === 'dailyItem' || view === 'monthItem' || view === 'deptItem' || view === 'zone') && (
              <label className="text-xs font-bold text-slate-500">
                คอลัมน์แสดงเป็น
                <select value={colMode} onChange={(e) => setColMode(e.target.value as ColMode)} className={SELECT + ' mt-1 block'}>
                  <option value="all">รายชื่อสินค้าทั้งหมด</option>
                  <option value="used">เฉพาะที่เบิก</option>
                </select>
              </label>
            )}
            {view !== 'overview' && view !== 'items' && (
              <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-600">
                <input type="checkbox" checked={hideEmpty} onChange={(e) => { setHideEmpty(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#1a3a6e]" />
                ซ่อนแถวที่ไม่มียอด
              </label>
            )}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {!raw && !error && <p role="status" className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p>}

      {raw && (
        <>
          <p className="hidden text-sm font-semibold text-slate-600 print:block">สรุป Supply Use · {rangeLabel}</p>

          {raw.pending ? (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 print:hidden">
              📝 มีใบเบิกรออนุมัติ {raw.pending.toLocaleString('th-TH')} ใบ — ยังไม่นับรวมในรายงานนี้ (นับเฉพาะใบเบิกที่อนุมัติแล้ว)
            </p>
          ) : null}
          {loadedAt && (
            <p className="text-xs font-semibold text-slate-400 print:hidden">
              ข้อมูล ณ {new Date(loadedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น. · กด “รีเฟรช” เพื่อดึงข้อมูลล่าสุด
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [measure === 'cost' ? 'ยอดเบิกรวม (บาท)' : 'จำนวนที่เบิกรวม (ชิ้น)', fmt(total)],
              ['เฉลี่ยต่อวันที่มีการเบิก (' + unit + ')', activeDays ? fmt(total / activeDays) : '-'],
              ['แผนกที่เบิกสูงสุด', topDept ? topDept[0] : '-', topDept ? fmt(topDept[1]) + ' ' + unit : ''],
              ['สินค้าที่เบิกสูงสุด', topItem ? topItem[0] : '-', topItem ? fmt(topItem[1]) + ' ' + unit : ''],
            ].map(([label, value, sub]) => (
              <div key={label} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 wrap-break-word text-lg font-black leading-tight text-[#1a3a6e] tabular-nums">{value}</p>
                {sub && <p className="mt-0.5 text-xs font-semibold text-slate-400 tabular-nums">{sub}</p>}
              </div>
            ))}
          </div>

          <section className="space-y-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div role="group" aria-label="มุมมองรายงาน" className="flex flex-wrap gap-2 print:hidden">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={view === v.value}
                  onClick={() => changeView(v.value)}
                  className={'rounded-xl border px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 ' + (view === v.value ? 'border-[#1a3a6e] bg-[#1a3a6e] text-white' : 'border-blue-100 bg-blue-50/40 text-slate-600 hover:bg-blue-100')}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {view !== 'items' && (
              <p className="text-xs font-semibold text-slate-500">
                {measure === 'cost'
                  ? 'ตัวเลขในหน้านี้เป็นยอดเงิน (บาท) = จำนวน × ราคาตอนเบิก'
                  : 'ตัวเลขในหน้านี้เป็นจำนวนที่เบิก นับรวมทุกหน่วย (เช่น ชิ้น กล่อง แพ็ค) ไม่ใช่ยอดเงิน'}
              </p>
            )}

            {measure === 'cost' && unpriced.lines > 0 && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800">
                ⚠️ มี {unpriced.lines.toLocaleString('th-TH')} รายการ ({unpriced.names.length} สินค้า) ที่ไม่มีราคาตอนเบิก ยอดเงินของรายการเหล่านี้จึงนับเป็น 0 และยอดรวมอาจต่ำกว่าจริง เช่น {unpriced.names.slice(0, 5).join(', ')}{unpriced.names.length > 5 ? ' …' : ''}
              </p>
            )}

            {scoped.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">ไม่มีข้อมูลการเบิกในช่วงที่เลือก</p>
            ) : view === 'overview' ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ShareList title="สรุปการเบิกรายแผนก" items={ranked(byDept)} total={total} />
                <ShareList title="สรุปการเบิกรายโซน 15 อันดับ" items={ranked(zoneTotals).slice(0, 15)} total={zoneTotal} />
                <ShareList title="สินค้าที่เบิกสูงสุด 15 อันดับ" items={ranked(byItem).slice(0, 15)} total={total} />
              </div>
            ) : view === 'deptBlocks' ? (
              blocks.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">ไม่มีข้อมูลการเบิกในช่วงที่เลือก</p>
              ) : (
                <div className="space-y-4">
                  {blocks.map((b) => <DeptBlock key={b.name} name={b.name} t={b.t} hideEmpty={hideEmpty} unit={unit} />)}
                </div>
              )
            ) : view === 'items' ? (
              itemRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">ไม่พบรายการตามตัวกรองที่เลือก</p>
              ) : (
                <>
                  <ItemsTable rows={itemRows.slice((page - 1) * ITEMS_PAGE_SIZE, page * ITEMS_PAGE_SIZE)} showZone={byZone} total={itemsTotal} offset={(page - 1) * ITEMS_PAGE_SIZE} />
                  <ReportPagination page={page} totalRows={itemRows.length} pageSize={ITEMS_PAGE_SIZE} onChange={setPage} />
                </>
              )
            ) : table ? (
              <>
                {view === 'zone' && <p className="text-xs text-slate-400">แสดงเฉพาะใบเบิกที่ระบุโซน</p>}
                <DataTable t={table} rows={pageRows} offset={pageOffset} />
                {isDaily && <ReportPagination page={page} totalRows={table.rows.length} pageSize={DAILY_PAGE_SIZE} onChange={setPage} />}
              </>
            ) : null}

          </section>
        </>
      )}
    </div>
  );
}