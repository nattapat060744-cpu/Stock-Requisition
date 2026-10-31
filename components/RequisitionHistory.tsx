'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import RequestedItems from '@/components/RequestedItems';
import { exportReportExcel } from '@/lib/reportExports';
import ReportHeading, {REPORT_PANEL} from '@/components/ReportHeading';
import ReportPagination from '@/components/ReportPagination';

type Detail = {
  item_id?:string;
  id: string;
  quantity: number;
  price_at_time: number;
  items: { name: string; unit: string; image_url: string | null } | null;
};

type Entry = {
  note?:string;admin_note?:string;requested_items?:Detail[];
  id: string;
  requester_name: string;
  branch_name: string;
  zone_name?: string;
  sender_name?: string;
  created_at: string;
  status: string;
  requisition_details: Detail[];
};

type ZoneOption = {
  id: string;
  name: string;
  branch_id: string;
};

type Filters = { name: string; branch: string; zone: string; from: string; to: string; status: string };
const empty: Filters = { name: '', branch: '', zone: '', from: '', to: '', status: '' };

const statusOptions = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
  { value: 'rejected', label: 'ปฏิเสธ' },
];

const statuses: Record<string, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' };

function query(filters: Filters) {
  let q = supabase
    .from('requisitions')
    .select('*, requisition_details(id, item_id, quantity, price_at_time, items(name, unit, image_url))', { count: 'exact' });
  if (filters.name.trim()) q = q.ilike('requester_name', '%' + filters.name.trim().replace(/[\\%_]/g, '\\$&') + '%');
  if (filters.branch) q = q.eq('branch_name', filters.branch);
  if (filters.zone) q = q.eq('zone_name', filters.zone);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.from) q = q.gte('created_at', filters.from + 'T00:00:00+07:00');
  if (filters.to) {
    const end = new Date(filters.to + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt('created_at', end.toISOString().slice(0, 10) + 'T00:00:00+07:00');
  }
  return q.order('created_at', { ascending: false }).order('id');
}

const date = (value: string) =>
  new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const getPresetDates = (type: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all') => {
  const now = new Date();
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (type === 'today') {
    const todayStr = formatDateStr(now);
    return { from: todayStr, to: todayStr };
  } else if (type === 'yesterday') {
    const yDay = new Date(now);
    yDay.setDate(yDay.getDate() - 1);
    const yStr = formatDateStr(yDay);
    return { from: yStr, to: yStr };
  } else if (type === '7days') {
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    return { from: formatDateStr(past), to: formatDateStr(now) };
  } else if (type === '30days') {
    const past = new Date(now);
    past.setDate(past.getDate() - 29);
    return { from: formatDateStr(past), to: formatDateStr(now) };
  } else if (type === 'thisMonth') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: formatDateStr(firstDay), to: formatDateStr(lastDay) };
  } else if (type === 'all') {
    return { from: '', to: '' };
  }
  return { from: '', to: '' };
};

export default function RequisitionHistory() {
  const [draft, setDraft] = useState(empty);
  const [filters, setFilters] = useState(empty);
  const [activePreset, setActivePreset] = useState<string>('all');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [rows, setRows] = useState<Entry[]>([]);
  const [allRowsForStats, setAllRowsForStats] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // State สำหรับ Modal สรุปประจำเดือน
  const [showMonthlyExportModal, setShowMonthlyExportModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const monthlyDialogRef = useRef<HTMLDialogElement>(null);

  // State สำหรับ Pop-up รายละเอียดใบเบิก
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);

  // State สำหรับ Pop-up รูปขยาย
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (showMonthlyExportModal && monthlyDialogRef.current && !monthlyDialogRef.current.open) {
      monthlyDialogRef.current.showModal();
    }
  }, [showMonthlyExportModal]);

  useEffect(() => {
    if (activeEntry && detailDialogRef.current && !detailDialogRef.current.open) {
      detailDialogRef.current.showModal();
    }
  }, [activeEntry]);

  useEffect(() => {
    if (selectedImage && imageDialogRef.current && !imageDialogRef.current.open) {
      imageDialogRef.current.showModal();
    }
  }, [selectedImage]);

  // ดึงข้อมูลแผนกและโซนจากฐานข้อมูล
  useEffect(() => {
    let alive = true;
    async function fetchMetaData() {
      const [branchRes, zoneRes] = await Promise.all([
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('zones').select('id, name, branch_id').order('name'),
      ]);
      if (alive) {
        if (branchRes.data) setBranches(branchRes.data);
        if (zoneRes.data) setZones(zoneRes.data);
      }
    }
    void fetchMetaData();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void query(filters).then(async ({ data, error, count }) => {
      if (!alive) return;
      if (error) {
        setError(error.message);
        setRows([]);
        setAllRowsForStats([]);
        setTotal(0);
      } else {
        const fullData = (data || []) as unknown as Entry[];
        setAllRowsForStats(fullData);
        setTotal(count || 0);
        setRows(fullData.slice((page - 1) * 20, page * 20));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [filters, page]);

  const apply = (next: Filters) => {
    setLoading(true);
    setError('');
    setPage(1);
    setFilters({ ...next });
  };

  const handleApplyPreset = (type: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all') => {
    setActivePreset(type);
    const dates = getPresetDates(type);
    const next = { ...draft, ...dates };
    setDraft(next);
    apply(next);
  };

  const totalRequisitions = allRowsForStats.length;
  const approvedRequisitions = allRowsForStats.filter((r) => r.status === 'approved').length;
  const pendingRequisitions = allRowsForStats.filter((r) => r.status === 'pending').length;
  const totalAmount = allRowsForStats.reduce((sum, r) => {
    if (r.status === 'approved') {
      return sum + r.requisition_details.reduce((dSum, d) => dSum + (d.quantity || 0) * (d.price_at_time || 0), 0);
    }
    return sum;
  }, 0);

  const excel = async () => {
    setExporting(true);
    setError('');
    try {
      await exportReportExcel(
        'ประวัติการเบิกของแต่ละคน',
        ['เลขอ้างอิง', 'วันเวลา', 'ผู้เบิก', 'แผนก', 'โซน', 'หัวหน้า / รองหัวหน้าผู้ส่ง', 'สถานะ', 'สินค้า', 'จำนวน', 'หน่วย', 'มูลค่าต่อหน่วย', 'มูลค่ารายการ'],
        allRowsForStats.flatMap((entry) =>
          (entry.requisition_details.length ? entry.requisition_details : [null]).map((detail) => [
            entry.id,
            date(entry.created_at),
            entry.requester_name,
            entry.branch_name,
            entry.zone_name || '—',
            entry.sender_name || '—',
            statuses[entry.status] || entry.status,
            detail?.items?.name || '—',
            detail?.quantity ?? null,
            detail?.items?.unit || '',
            detail?.price_at_time ?? null,
            detail ? detail.quantity * detail.price_at_time : null,
          ])
        ),
        'requisition-history.xlsx',
        'ชื่อ: ' + (filters.name || 'ทุกคน') + ' · แผนก: ' + (filters.branch || 'ทั้งหมด') + ' · โซน: ' + (filters.zone || 'ทั้งหมด')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  const exportMonthlyReport = async () => {
    setExporting(true);
    setError('');
    try {
      const mStr = String(selectedMonth).padStart(2, '0');
      const from = `${selectedYear}-${mStr}-01T00:00:00+07:00`;
      const endDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const to = `${selectedYear}-${mStr}-${String(endDay).padStart(2, '0')}T23:59:59+07:00`;

      const { data, error: fetchErr } = await supabase
        .from('requisitions')
        .select('*, requisition_details(id, quantity, price_at_time, items(name, unit, image_url))')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const monthlyData = (data || []) as unknown as Entry[];

      await exportReportExcel(
        `รายงานสรุปประวัติการเบิกประจำเดือน ${mStr}/${selectedYear}`,
        ['เลขอ้างอิง', 'วันเวลา', 'ผู้เบิก', 'แผนก', 'โซน', 'หัวหน้า / รองหัวหน้าผู้ส่ง', 'สถานะ', 'สินค้า', 'จำนวน', 'หน่วย', 'มูลค่าต่อหน่วย', 'มูลค่ารายการรวม'],
        monthlyData.flatMap((entry) =>
          (entry.requisition_details.length ? entry.requisition_details : [null]).map((detail) => [
            entry.id,
            date(entry.created_at),
            entry.requester_name,
            entry.branch_name,
            entry.zone_name || '—',
            entry.sender_name || '—',
            statuses[entry.status] || entry.status,
            detail?.items?.name || '—',
            detail?.quantity ?? null,
            detail?.items?.unit || '',
            detail?.price_at_time ?? null,
            detail ? detail.quantity * detail.price_at_time : null,
          ])
        ),
        `รายงานเบิกประจำเดือน_${selectedYear}-${mStr}.xlsx`,
        `สรุปรายงานการเบิกสินค้าประจำเดือน ${mStr}/${selectedYear} · รวมทั้งสิ้น ${monthlyData.length} ใบเบิก`
      );

      monthlyDialogRef.current?.close();
      setShowMonthlyExportModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งออกรายงานประจำเดือนไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  const availableZones = draft.branch
    ? zones.filter((z) => {
        const b = branches.find((branch) => branch.name === draft.branch);
        return b ? z.branch_id === b.id : true;
      })
    : zones;

  return (
    <section className="space-y-4 text-slate-800">
      {/* ── CARD 1: HEADER & FILTER FORM ── */}
      <div className={REPORT_PANEL}>
        {/* Top Header & Export Action Bar */}
        <ReportHeading title="🕘 ประวัติการเบิกรายคน" description="ตรวจสอบประวัติตามผู้เบิก แผนก โซน และช่วงวันที่" actions={<>
            <button
              type="button"
              onClick={() => setShowMonthlyExportModal(true)}
              className="px-3.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
            >
              📅 สรุปประจำเดือน
            </button>
            <button
              type="button"
              disabled={loading || exporting || !total}
              onClick={() => void excel()}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-40 active:scale-95"
            >
              📊 Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 active:scale-95"
            >
              🖨️ พิมพ์
            </button>
        </>}/>

        {/* Quick Date Presets Chips */}
        <div data-report-presets className="flex flex-wrap items-center gap-1.5 pt-1">
          {[
            { id: 'today', label: 'วันนี้' },
            { id: 'yesterday', label: 'เมื่อวาน' },
            { id: '7days', label: '7 วันล่าสุด' },
            { id: '30days', label: '30 วันล่าสุด' },
            { id: 'thisMonth', label: 'เดือนนี้' },
            { id: 'all', label: 'ทั้งหมด' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset.id as Parameters<typeof handleApplyPreset>[0])}
              className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
                activePreset === preset.id
                  ? 'bg-brand-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Filter Inputs Grid */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
          className="space-y-3 pt-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">วันที่เอกสาร ตั้งแต่วันที่</label>
              <input
                type="date"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 transition-all"
                value={draft.from}
                onChange={(e) => {
                  setDraft({ ...draft, from: e.target.value });
                  setActivePreset('');
                }}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">ถึงวันที่</label>
              <input
                type="date"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 transition-all"
                value={draft.to}
                onChange={(e) => {
                  setDraft({ ...draft, to: e.target.value });
                  setActivePreset('');
                }}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">แผนก / โซน</label>
              <select
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 transition-all cursor-pointer"
                value={draft.branch}
                onChange={(e) => setDraft({ ...draft, branch: e.target.value, zone: '' })}
              >
                <option value="">ทุกแผนก</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">สถานะ</label>
              <select
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 transition-all cursor-pointer"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">ค้นหา</label>
              <div className="flex gap-1.5">
                <input
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 transition-all"
                  placeholder="เลข PO / แหล่งที่มา / รหัส / ชื่อสินค้า..."
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Bottom Bar: Total Items & Reset Link */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="font-semibold text-slate-500">
              พบ <span className="text-brand-900 font-black">{total}</span> รายการใบเบิก
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setActivePreset('all');
                apply(empty);
              }}
              className="text-brand-700 font-bold hover:underline transition-all"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        </form>
      </div>

      {/* ── CARD 2: SUMMARY STAT BANNER ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4 text-center">
        <div>
          <p className="text-[10px] font-black text-brand-800 tracking-widest uppercase">ระบบเบิกของ REPORT</p>
          <h2 className="text-lg font-black text-brand-950 mt-0.5">รายงานประวัติการเบิกสินค้าพนักงานรายคน</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            ตั้งแต่วันที่: {filters.from || 'ทั้งหมด'} ถึง {filters.to || 'ทั้งหมด'}
          </p>
        </div>

        {/* 4 Cards Stat Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-brand-50/30 p-4 text-center">
            <p className="text-[11px] font-bold text-slate-500">จำนวนใบเบิก</p>
            <p className="mt-1 text-2xl font-black text-brand-950">{totalRequisitions} ใบ</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-brand-50/30 p-4 text-center">
            <p className="text-[11px] font-bold text-slate-500">มูลค่าอนุมัติรวม</p>
            <p className="mt-1 text-2xl font-black text-emerald-600">{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-brand-50/30 p-4 text-center">
            <p className="text-[11px] font-bold text-slate-500">อนุมัติแล้ว</p>
            <p className="mt-1 text-2xl font-black text-brand-700">{approvedRequisitions} ใบ</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-brand-50/30 p-4 text-center">
            <p className="text-[11px] font-bold text-slate-500">รออนุมัติ</p>
            <p className="mt-1 text-2xl font-black text-amber-600">{pendingRequisitions} ใบ</p>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs font-bold text-red-700">{error}</p>}

      {/* ── CARD 3: DATA TABLE ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-brand-950">รายละเอียดประวัติการเบิก</h3>
          <p className="text-xs font-bold text-slate-500">
            แสดงผลหน้า <span className="text-brand-900 font-black">{page}</span> ({rows.length} รายการ)
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-50/60 text-brand-950 border-b border-slate-200 font-bold">
                  <th className="w-14 py-3 px-3.5 text-center">ลำดับ</th>
                  <th className="py-3 px-3.5">วันเวลา</th>
                  <th className="py-3 px-3.5">ผู้เบิก</th>
                  <th className="py-3 px-3.5">แผนก / โซน</th>
                  <th className="py-3 px-3.5">สถานะ</th>
                  <th className="py-3 px-3.5 text-right">จำนวนรายการ</th>
                  <th className="py-3 px-3.5 text-right">มูลค่ารวม (฿)</th>
                  <th className="py-3 px-3.5 text-center">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((entry, index) => {
                  const entryTotal = entry.requisition_details.reduce(
                    (sum, d) => sum + (d.quantity || 0) * (d.price_at_time || 0),
                    0
                  );
                  return (
                    <tr key={entry.id} className="hover:bg-brand-50/30 transition-colors">
                      <td className="py-3.5 px-3.5 text-center text-[11px] font-semibold tabular-nums text-slate-400">
                        {(page - 1) * 20 + index + 1}
                      </td>
                      <td className="py-3.5 px-3.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {date(entry.created_at)}
                      </td>
                      <td className="py-3.5 px-3.5 font-bold text-slate-800 text-xs">
                        {entry.requester_name}
                      </td>
                      <td className="py-3.5 px-3.5">
                        <span className="font-semibold text-slate-700">{entry.branch_name}</span>
                        {entry.zone_name && (
                          <span className="block text-[10px] text-brand-600 font-medium">โซน: {entry.zone_name}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3.5">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-bold text-slate-700">
                        {entry.requisition_details.length} รายการ
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-black text-brand-950 text-xs">
                        {entryTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                      </td>
                      <td className="py-3.5 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveEntry(entry)}
                          className="px-3 py-1.5 rounded-lg border border-brand-200 bg-brand-50/70 hover:bg-brand-100 text-brand-800 text-xs font-bold transition-all active:scale-95"
                        >
                          🔍 ดูสินค้า
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      ไม่พบประวัติการเบิกตามเงื่อนไข
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <ReportPagination
          page={page}
          totalRows={total}
          onChange={(next) => {
            setLoading(true);
            setPage(next);
          }}
        />
      </div>

      {/* ── MODAL POP-UP เลือก Export รายงานประจำเดือน ── */}
      {showMonthlyExportModal && (
        <dialog
          ref={monthlyDialogRef}
          aria-label="Export รายงานประจำเดือน"
          onClose={() => setShowMonthlyExportModal(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) monthlyDialogRef.current?.close();
          }}
          className="fixed inset-0 m-auto h-dvh w-screen border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/70 open:flex open:items-center open:justify-center z-65"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xl space-y-0">
            <div className="bg-brand-700 px-5 py-4 text-white flex items-center justify-between">
              <h3 className="text-sm font-black flex items-center gap-2">
                📅 ส่งออกรายงานประวัติการเบิกประจำเดือน
              </h3>
              <button
                type="button"
                onClick={() => monthlyDialogRef.current?.close()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                เลือกเดือนและปีที่ต้องการสรุปรายงาน ระบบจะรวบรวมใบเบิกและส่งออกเป็นไฟล์ Excel ให้อัตโนมัติ
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">เลือกเดือน</label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-brand-500"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  >
                    {[
                      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
                    ].map((m, idx) => (
                      <option key={m} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">เลือกปี (ค.ศ.)</label>
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-brand-500"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>{y + 543} ({y})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => monthlyDialogRef.current?.close()}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportMonthlyReport()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                >
                  {exporting ? 'กำลังสร้างไฟล์...' : '📥 ดาวน์โหลด Excel ประจำเดือน'}
                </button>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {/* ── MODAL POP-UP รายละเอียดใบเบิก ── */}
      {activeEntry && (
        <dialog
          ref={detailDialogRef}
          aria-label={`รายละเอียดใบเบิก ${activeEntry.requester_name}`}
          onClose={() => setActiveEntry(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) detailDialogRef.current?.close();
          }}
          className="fixed inset-0 m-auto h-dvh w-screen border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/70 open:flex open:items-center open:justify-center z-60"
        >
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xl space-y-0">
            <div className="bg-brand-700 px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  📄 รายละเอียดใบเบิก
                </h3>
                <p className="text-xs text-brand-200 font-medium mt-0.5">
                  {activeEntry.branch_name} {activeEntry.zone_name && `(${activeEntry.zone_name})`} · {activeEntry.requester_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => detailDialogRef.current?.close()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75dvh] overflow-y-auto">
              <div className="rounded-xl border border-slate-200 bg-brand-50/40 p-4 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-400 font-bold mb-0.5">ผู้เบิก</p>
                  <p className="text-slate-800 font-black text-sm">{activeEntry.requester_name}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold mb-0.5">แผนก / โซน</p>
                  <p className="text-slate-800 font-black text-sm">{activeEntry.branch_name}</p>
                  {activeEntry.zone_name && <p className="text-brand-600 font-bold">โซน: {activeEntry.zone_name}</p>}
                </div>
                <div>
                  <p className="text-slate-400 font-bold mb-0.5">วันที่</p>
                  <p className="text-slate-800 font-bold">{date(activeEntry.created_at)}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold mb-0.5">สถานะ</p>
                  <StatusBadge status={activeEntry.status} />
                </div>
                {activeEntry.sender_name && (
                  <div className="col-span-2 pt-2 border-t border-slate-200/60">
                    <p className="text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/60 font-medium text-[11px]">
                      หัวหน้า / รองหัวหน้าผู้ส่ง: {activeEntry.sender_name}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 text-sm"><p className="whitespace-pre-wrap wrap-break-word"><strong>หมายเหตุใบเบิก:</strong> {activeEntry.note||'—'}</p><p className="whitespace-pre-wrap wrap-break-word"><strong>หมายเหตุผู้ตรวจสอบ:</strong> {activeEntry.admin_note||'—'}</p><RequestedItems original={activeEntry.requested_items} current={activeEntry.requisition_details} status={activeEntry.status}/></div>
              <div className="space-y-3">
                <p className="text-xs font-black text-brand-900 uppercase tracking-wider">
                  รายการสินค้าที่เบิก ({activeEntry.requisition_details.length} รายการ)
                </p>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-brand-50/70 text-slate-600 font-bold border-b border-slate-200">
                        <th className="w-12 py-2.5 px-3 text-center">ลำดับ</th>
                        <th className="py-2.5 px-3">สินค้า</th>
                        <th className="py-2.5 px-3 text-right">จำนวน</th>
                        <th className="py-2.5 px-3">หน่วย</th>
                        <th className="py-2.5 px-3 text-right">ราคา/หน่วย</th>
                        <th className="py-2.5 px-3 text-right">มูลค่ารวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeEntry.requisition_details.map((detail, index) => (
                        <tr key={detail.id} className="hover:bg-brand-50/20">
                          <td className="py-3 px-3 text-center text-[11px] font-semibold tabular-nums text-slate-400">{index + 1}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              {detail.items?.image_url && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedImage({ url: detail.items!.image_url!, name: detail.items!.name })}
                                  className="relative h-8 w-8 shrink-0 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden cursor-zoom-in"
                                >
                                  <img src={detail.items.image_url} alt="" className="h-full w-full object-contain p-0.5" />
                                </button>
                              )}
                              <span>{detail.items?.name || '—'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-brand-900">
                            {detail.quantity}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {detail.items?.unit}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 font-medium">
                            {detail.price_at_time.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-brand-900">
                            {(detail.quantity * detail.price_at_time).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-2 px-2 text-sm font-black text-brand-900">
                  <span>รวมเป็นเงินทั้งสิ้น</span>
                  <span className="text-base text-brand-950">
                    {activeEntry.requisition_details
                      .reduce((sum, d) => sum + d.quantity * d.price_at_time, 0)
                      .toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}
                    ฿
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-100 p-4 text-center">
              <button
                type="button"
                onClick={() => detailDialogRef.current?.close()}
                className="w-full rounded-xl bg-brand-50 border border-brand-200 py-2.5 text-xs font-bold text-brand-800 hover:bg-brand-100 transition-all active:scale-98"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Pop-up ขยายรูปภาพ */}
      {selectedImage && (
        <dialog
          ref={imageDialogRef}
          aria-label={`รูปสินค้า ${selectedImage.name}`}
          onClose={() => setSelectedImage(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) imageDialogRef.current?.close();
          }}
          className="fixed inset-0 m-auto h-dvh w-screen border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/80 open:flex open:items-center open:justify-center z-70"
        >
          <div className="relative max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => imageDialogRef.current?.close()}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-sm hover:bg-slate-900"
            >
              ×
            </button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-h-[70dvh] max-w-full rounded-lg object-contain m-auto" />
            <p className="mt-2 text-center text-xs font-bold text-slate-700">{selectedImage.name}</p>
          </div>
        </dialog>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">อนุมัติแล้ว</span>;
    case 'rejected':
      return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">ปฏิเสธ</span>;
    default:
      return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200">รออนุมัติ</span>;
  }
}