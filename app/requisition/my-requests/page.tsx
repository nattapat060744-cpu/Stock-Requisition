'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useDepartment } from '@/components/DepartmentAccess';
import RequestedItems from '@/components/RequestedItems';
import { REQUEST_STATUSES, type RequestStatus } from '@/lib/employeeRequests';
import { requestError } from '@/lib/requisitionRules';
import ReportPagination from '@/components/ReportPagination';
import { ui, PageHero, StatCard, Field, EmptyState, Skeleton, Notice, Modal } from '@/components/AdminUI';


/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Line = {
  id: string;
  item_id: string;
  quantity: number;
  items: { name: string; unit: string; image_url: string | null } | null;
};

type Entry = {
  id: string;
  created_at: string;
  updated_at: string;
  version: number;
  requester_name: string;
  branch_name: string;
  zone_name: string | null;
  sender_name: string | null;
  note: string;
  admin_note: string;
  status: RequestStatus;
  requisition_details: Line[];
  requested_items: Line[] | null;
};

type Filters = { name: string; zone: string; from: string; to: string };
type Zone = { id: string; name: string };
type StatusTab = 'all' | RequestStatus;
type StatusCounts = Record<StatusTab, number>;

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                       */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;

const EMPTY_FILTERS: Filters = { name: '', zone: '', from: '', to: '' };
const EMPTY_COUNTS: StatusCounts = { all: 0, pending: 0, approved: 0, rejected: 0 };
const STATUS_TABS: StatusTab[] = ['all', 'pending', 'approved', 'rejected'];
const TABLE_HEADERS = ['เวลา', 'ผู้เบิก / ผู้ส่ง', 'โซน', 'รายการ', 'สถานะ', 'ดำเนินการ'];

// ธีมเดียวกับหน้าแอดมิน: การ์ดสรุปสถานะ + ป้ายสถานะ
const TAB_CARD: Record<StatusTab, { icon: string; accent: 'blue' | 'amber' | 'emerald' | 'red'; hint: string }> = {
  all: { icon: '📋', accent: 'blue', hint: 'ใบเบิกทั้งหมด' },
  pending: { icon: '⏳', accent: 'amber', hint: 'รอตรวจสอบ' },
  approved: { icon: '✅', accent: 'emerald', hint: 'ปิดรายการแล้ว' },
  rejected: { icon: '🚫', accent: 'red', hint: 'ไม่อนุมัติ' },
};
const BADGE_STYLE: Record<string, { badge: string; dot: string }> = {
  pending: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500 animate-pulse' },
  approved: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  rejected: { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const BANGKOK = 'Asia/Bangkok';

// "2026-10-29" — used to tell which calendar day (Bangkok time) a request belongs to
function dayKey(value: string | number | Date) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: BANGKOK });
}

// "วันนี้ · วันพฤหัสบดีที่ 29 ตุลาคม 2569"
function dayLabel(value: string) {
  const full = new Date(value).toLocaleDateString('th-TH', { timeZone: BANGKOK, dateStyle: 'full' });
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return `วันนี้ · ${full}`;
  if (key === dayKey(Date.now() - 24 * 60 * 60 * 1000)) return `เมื่อวาน · ${full}`;
  return full;
}

type DayGroup = { key: string; label: string; rows: Entry[] };

// Keeps the server's order and starts a new group whenever the day changes
function groupByDay(rows: Entry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of rows) {
    const key = dayKey(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(entry);
    else groups.push({ key, label: dayLabel(entry.created_at), rows: [entry] });
  }
  return groups;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', timeStyle: 'short' });
}

// "ปากกา, กระดาษ A4 และอีก 3 รายการ"
function summarizeItems(lines: Line[]) {
  const names = lines.map((line) => line.items?.name || 'สินค้าเดิม');
  const shown = names.slice(0, 2).join(', ');
  const rest = names.length - 2;
  return rest > 0 ? `${shown} และอีก ${rest} รายการ` : shown || '—';
}

function lastPageFor(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/* -------------------------------------------------------------------------- */
/*  Small components                                                          */
/* -------------------------------------------------------------------------- */

function StatusBadge({ value }: { value: RequestStatus }) {
  const status = REQUEST_STATUSES[value];
  const style = BADGE_STYLE[value] || BADGE_STYLE.pending;
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ' + style.badge}>
      <span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + style.dot} />
      {status?.label || value}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-800">
      {(name || '?').trim().slice(0, 1)}
    </span>
  );
}

function ItemLine({ line }: { line: Line }) {
  const item = line.items;
  return (
    <div className="flex items-center gap-3 py-3">
      {item?.image_url ? (
        <Image unoptimized width={48} height={48} src={item.image_url} alt={item.name} className="h-12 w-12 rounded-lg border border-blue-100 object-contain" />
      ) : (
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">📦</span>
      )}
      <span className="min-w-0 flex-1 text-sm font-bold text-slate-700">{item?.name || 'สินค้าเดิม'}</span>
      <strong className="shrink-0 font-black tabular-nums text-[#1a3a6e]">
        {line.quantity} <span className="text-xs font-semibold text-slate-500">{item?.unit}</span>
      </strong>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Detail dialog                                                             */
/* -------------------------------------------------------------------------- */

function RequestDetailDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  return (
    <Modal
      title="📄 รายละเอียดใบเบิก"
      busy={false}
      onClose={onClose}
      footer={
        <>
          <button className={ui.secondary} onClick={onClose}>
            ปิดหน้าต่าง
          </button>
          {entry.status === 'pending' && (
            <Link href={'/requisition?edit=' + encodeURIComponent(entry.id)} className={ui.button}>
              แก้ไขใบเบิก
            </Link>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm sm:grid-cols-2">
          <p className="font-bold text-[#1a3a6e]">
            {entry.branch_name} <span className="font-semibold text-slate-500">· {formatDateTime(entry.created_at)}</span>
          </p>
          <p className="flex items-center gap-2">
            สถานะ: <StatusBadge value={entry.status} />
          </p>
          <p className="flex items-center gap-2">
            ผู้เบิก: <Avatar name={entry.requester_name} /> <strong>{entry.requester_name}</strong>
          </p>
          {entry.zone_name && <p>โซน: <strong className="text-blue-700">{entry.zone_name}</strong></p>}
          {entry.sender_name && <p className="sm:col-span-2">หัวหน้า / รองหัวหน้าผู้ส่ง: <strong>{entry.sender_name}</strong></p>}
        </div>

        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap wrap-break-word font-semibold text-slate-600">
            <span className="text-slate-400">หมายเหตุใบเบิก: </span>{entry.note || '—'}
          </p>
          <p className="whitespace-pre-wrap wrap-break-word font-semibold text-blue-800">
            <span className="text-blue-400">หมายเหตุผู้ตรวจสอบ: </span>{entry.admin_note || '—'}
          </p>
        </div>

        <h3 className="text-sm font-black text-[#1a3a6e]">
          {entry.status === 'approved' ? 'รายการที่อนุมัติ' : 'รายการสินค้า'}
        </h3>
        <div className="divide-y divide-blue-50 rounded-xl border border-blue-100 px-4">
          {entry.requisition_details.map((line) => (
            <ItemLine key={line.id} line={line} />
          ))}
        </div>

        <RequestedItems original={entry.requested_items} current={entry.requisition_details} status={entry.status} />

        {entry.status === 'approved' && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            อนุมัติใบเบิกแล้ว กรุณาติดต่อคลังเรื่องการรับสินค้า
          </p>
        )}

        <p className="text-xs text-slate-400">
          เลขอ้างอิง: {entry.id}
          <br />
          แก้ไขล่าสุด: {formatDateTime(entry.updated_at || entry.created_at)}
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status cards (summary counts)                                             */
/* -------------------------------------------------------------------------- */

function StatusTabs({ counts, active, onSelect }: { counts: StatusCounts; active: StatusTab; onSelect: (tab: StatusTab) => void }) {
  return (
    <div role="group" aria-label="กรองใบเบิกตามสถานะ" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STATUS_TABS.map((tab) => {
        const card = TAB_CARD[tab];
        return (
          <StatCard
            key={tab}
            label={tab === 'all' ? 'ทั้งหมด' : REQUEST_STATUSES[tab].label}
            icon={card.icon}
            accent={card.accent}
            hint={card.hint}
            value={counts[tab]}
            unit="ใบ"
            active={active === tab}
            onClick={() => onSelect(tab)}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filter form                                                               */
/* -------------------------------------------------------------------------- */

function FilterForm({
  draft, setDraft, zones, updatedAt, onSubmit, onClear, onRefresh,
}: {
  draft: Filters;
  setDraft: Dispatch<SetStateAction<Filters>>;
  zones: Zone[];
  updatedAt: string;
  onSubmit: () => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const update = (patch: Partial<Filters>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={ui.card + ' space-y-4 p-4 sm:p-5'}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ชื่อผู้เบิก">
          <input value={draft.name} maxLength={200} onChange={(e) => update({ name: e.target.value })} placeholder="ค้นหาชื่อผู้เบิก" className={ui.input} />
        </Field>
        <Field label="โซน">
          <select value={draft.zone} onChange={(e) => update({ zone: e.target.value })} className={ui.input + ' cursor-pointer'}>
            <option value="">ทุกโซน</option>
            {zones.map((zone) => (
              <option key={zone.id}>{zone.name}</option>
            ))}
          </select>
        </Field>
        <Field label="ตั้งแต่วันที่">
          <input type="date" value={draft.from} onChange={(e) => update({ from: e.target.value })} className={ui.input + ' cursor-pointer'} />
        </Field>
        <Field label="ถึงวันที่">
          <input type="date" value={draft.to} onChange={(e) => update({ to: e.target.value })} className={ui.input + ' cursor-pointer'} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className={ui.button}>ค้นหา</button>
        <button type="button" onClick={onClear} className={ui.secondary}>ล้างตัวกรอง</button>
        <button type="button" onClick={onRefresh} className={ui.secondary}>🔄 รีเฟรช</button>
        <span className="text-xs font-semibold text-slate-400">อัปเดต {updatedAt || '—'}</span>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Results table                                                             */
/* -------------------------------------------------------------------------- */

function RequestTable({ rows, onView }: { rows: Entry[]; onView: (entry: Entry) => void }) {
  const days = groupByDay(rows);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day.key} className={ui.card}>
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-3">
            <span aria-hidden="true">🗓️</span>
            <h2 className="text-sm font-black text-[#1a3a6e]">{day.label}</h2>
            <span className="ml-auto text-xs font-bold text-slate-500">{day.rows.length} รายการ</span>
          </div>

          {/* Desktop: ตาราง */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className={ui.thead}>
                <tr>
                  {TABLE_HEADERS.map((header) => (
                    <th key={header} scope="col" className="px-4 py-3.5">
                      {header === 'ดำเนินการ' ? <span className="sr-only">{header}</span> : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {day.rows.map((entry) => (
                  <tr key={entry.id} className="align-middle transition-colors hover:bg-blue-50/40">
                    <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold tabular-nums text-slate-500">{formatTime(entry.created_at)} น.</td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-2">
                        <Avatar name={entry.requester_name} />
                        <span className="font-bold text-[#1a3a6e]">{entry.requester_name}</span>
                      </span>
                      {entry.sender_name && <p className="mt-1 text-[11px] font-semibold text-blue-800">ผู้ส่ง: {entry.sender_name}</p>}
                    </td>
                    <td className="px-4 py-4">
                      {entry.zone_name ? <span className="text-xs font-bold text-blue-700">{entry.zone_name}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="max-w-xs px-4 py-4">
                      <p className="font-bold text-slate-700">{entry.requisition_details.length} รายการ</p>
                      <p className="truncate text-xs font-semibold text-slate-500">{summarizeItems(entry.requisition_details)}</p>
                    </td>
                    <td className="px-4 py-4"><StatusBadge value={entry.status} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button onClick={() => onView(entry)} className={entry.status === 'pending' ? ui.rowBtnPrimary : ui.rowBtn}>
                        {entry.status === 'pending' ? 'ดูรายละเอียด →' : 'ดูรายละเอียด'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: การ์ดต่อใบเบิก */}
          <ul className="divide-y divide-blue-50 md:hidden">
            {day.rows.map((entry) => (
              <li key={entry.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold tabular-nums text-slate-500">{formatTime(entry.created_at)} น.</p>
                  <StatusBadge value={entry.status} />
                </div>
                <div className="flex items-center gap-2">
                  <Avatar name={entry.requester_name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1a3a6e]">{entry.requester_name}</p>
                    <p className="truncate text-xs font-semibold text-blue-700">
                      {entry.zone_name && <>โซน: {entry.zone_name}</>}
                      {entry.zone_name && entry.sender_name && ' · '}
                      {entry.sender_name && <span className="text-blue-800">ผู้ส่ง: {entry.sender_name}</span>}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  <b className="text-slate-700">{entry.requisition_details.length} รายการ:</b> {summarizeItems(entry.requisition_details)}
                </p>
                <button onClick={() => onView(entry)} className={(entry.status === 'pending' ? ui.rowBtnPrimary : ui.rowBtn) + ' w-full'}>
                  ดูรายละเอียด
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function MyRequestsPage() {
  const department = useDepartment();

  // Filters: `draft` is what the person is typing, `filters` is what was submitted
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [page, setPage] = useState(1);

  // Data from the server
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [zones, setZones] = useState<Zone[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);

  // Load zone options for this branch
  useEffect(() => {
    let alive = true;

    void supabase
      .from('zones')
      .select('id,name')
      .eq('branch_id', department.branch_id)
      .order('name')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(requestError(error));
        else setZones(data || []);
      });

    return () => {
      alive = false;
    };
  }, [department.branch_id]);

  // Load requisitions, then refresh every 30s and when the tab regains focus
  useEffect(() => {
    let alive = true;
    let inFlight = false;

    const load = async (quiet = false) => {
      if (inFlight) return;
      inFlight = true;
      if (!quiet) setLoading(true);

      try {
        const { data, error } = await supabase.rpc('department_requisitions', {
          p_token: department.token,
          p_name: filters.name.trim(),
          p_zone: filters.zone,
          p_status: status,
          p_from: filters.from || null,
          p_to: filters.to || null,
          p_page: page,
        });
        if (error) throw error;
        if (!alive) return;

        setRows(data.rows);
        setTotal(data.total);
        setCounts(data.counts);
        setUpdatedAt(new Date().toLocaleTimeString('th-TH'));
        setError('');

        // If the current page no longer exists (e.g. rows were removed), step back
        const lastPage = lastPageFor(data.total);
        if (page > lastPage) setPage(lastPage);
      } catch (e) {
        if (alive) setError(requestError(e));
      } finally {
        inFlight = false;
        if (alive) setLoading(false);
      }
    };

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };

    void load();
    const timer = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [department.token, filters, status, page, refreshKey]);

  const selectStatus = (tab: StatusTab) => {
    setStatus(tab === 'all' ? '' : tab);
    setPage(1);
  };

  const submitFilters = () => {
    if (draft.from && draft.to && draft.from > draft.to) {
      setError('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
      return;
    }
    setFilters({ ...draft });
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setStatus('');
    setPage(1);
  };


  return (
    <div className={ui.page}>
      <div className={ui.wrap}>
        <PageHero
          icon="📋"
          title={'ประวัติการเบิก · ' + department.branch_name}
          subtitle="ใบเบิกทั้งหมดของแผนก · แก้ไขได้ขณะรออนุมัติ"
          actions={<Link href="/requisition" className={ui.heroPrimary}>+ เบิกสินค้า</Link>}
        />

        <StatusTabs counts={counts} active={status || 'all'} onSelect={selectStatus} />

        <FilterForm
          draft={draft}
          setDraft={setDraft}
          zones={zones}
          updatedAt={updatedAt}
          onSubmit={submitFilters}
          onClear={clearFilters}
          onRefresh={() => setRefreshKey((n) => n + 1)}
        />

        {error && <Notice tone="error">{error}</Notice>}

        <p className="px-1 text-xs font-semibold text-slate-500">
          พบ <b className="text-[#1a3a6e]">{total.toLocaleString('th-TH')}</b> ใบเบิก{status && ` · ${REQUEST_STATUSES[status].label}`}
        </p>

        {loading ? (
          <section className={ui.card} role="status" aria-busy="true">
            <Skeleton rows={6} />
          </section>
        ) : rows.length === 0 ? (
          <section className={ui.card}>
            <EmptyState icon="📭" title="ไม่พบใบเบิกตามตัวกรอง" hint="ลองเปลี่ยนตัวกรองหรือช่วงวันที่" />
          </section>
        ) : (
          <>
            <RequestTable rows={rows} onView={setSelected} />
            <div className={ui.card + ' px-5 py-4'}>
              <ReportPagination page={page} totalRows={total} onChange={setPage} />
            </div>
          </>
        )}

        {selected && (
          // ใช้ข้อมูลล่าสุดจากการโหลดครั้งล่าสุด เพื่อให้หน้าต่างรายละเอียดตรงกับรายการ
          <RequestDetailDialog
            entry={rows.find((row) => row.id === selected.id) || selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}