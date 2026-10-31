'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

/* ───────────────────────── ชนิดข้อมูล/ค่าคงที่ที่ใช้ร่วมกันของรายงาน Supply Use ───────────────────────── */
export type Rec = { date: string; dept: string; zone: string; cost: number; item: string; unit: string; qty: number };
export type Measure = 'cost' | 'qty';
export const MEASURE_UNIT: Record<Measure, string> = { cost: 'บาท', qty: 'ชิ้น' };
export const SEP = '\u0001';
export const NUM_W = 44; // ความกว้างคอลัมน์ "#" (ลำดับ)
export const NUM_STYLE: CSSProperties = { width: NUM_W, minWidth: NUM_W, maxWidth: NUM_W };
export const COL_W = 120; // ความกว้างคอลัมน์ชื่อสินค้า/แผนก (ชื่อยาวขึ้น 3 บรรทัด ที่เหลือชี้เมาส์ดูเต็ม)
export const COL_STYLE: CSSProperties = { width: COL_W, minWidth: COL_W, maxWidth: COL_W };
export const SELECT = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-700';

/* ───────────────────────── ตัวช่วย ───────────────────────── */
export const fmt = (n: number) =>
  Math.abs(n) < 0.005 ? '-' : n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const dayLabel = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

export const monthKey = (d: string) => d.slice(0, 7);
export const monthLabel = (m: string) =>
  new Date(m + '-15T12:00:00Z').toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const monthShort = (m: string) =>
  new Date(m + '-15T12:00:00Z').toLocaleDateString('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' });


/* ───────────────────────── โหลดข้อมูล ───────────────────────── */
// Supabase คืนข้อมูลสูงสุด 1,000 แถวต่อครั้ง จึงดึงเป็นหน้า ๆ จนครบ
export async function fetchAll(make: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: unknown }>) {
  const out: any[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await make(a, a + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type Raw = { reqs: any[]; details: any[]; branches: string[]; items: string[]; pending: number | null };

const PENDING_STATUS = 'pending'; // ปรับให้ตรงกับค่า status ของใบเบิกที่รออนุมัติในตาราง requisitions
const CACHE_MS = 5 * 60 * 1000;
let rawCache: { raw: Raw; at: number } | null = null;

// ใช้ข้อมูลที่โหลดไว้ซ้ำภายใน 5 นาที (สลับรายงานแล้วกลับมาไม่ต้องดึงใหม่) — force = กดรีเฟรช
export async function loadRaw(force = false): Promise<{ raw: Raw; at: number }> {
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


/* ───────────────────────── ใบเบิกที่อนุมัติ + รายการ → แถวข้อมูลแบน ๆ ───────────────────────── */
export function buildRecs(raw: Raw): Rec[] {
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
}

/* ───────────────────────── Tooltip ชื่อเต็ม ───────────────────────── */
// ข้อความที่ยาวเกินช่องจะถูกตัด (…) และเมื่อชี้เมาส์จะมี popup แสดงชื่อเต็ม
export function TruncText({ text, lines = 1, className = '' }: { text: string; lines?: 1 | 2 | 3; className?: string }) {
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
export const GUIDE_CSS = `
.sg-r,.sg-c{background-color:#fef3c7 !important;}
th.sg-r,th.sg-c{background-color:#f59e0b !important;color:#1c1917 !important;}
.sg-hit{background-color:#fcd34d !important;box-shadow:inset 0 0 0 2px #b45309;color:#1c1917 !important;}
`;

export function GridGuide({ children }: { children: ReactNode }) {
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

