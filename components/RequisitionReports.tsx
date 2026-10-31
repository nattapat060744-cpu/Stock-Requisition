'use client';

import { useEffect, useState } from 'react';
import ReportHeading, {REPORT_PANEL} from '@/components/ReportHeading';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import {
  PDFDownloadLink,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

interface ReportItemSummary {
  name: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  branch_name: string;
  zone_name?:string;
}

interface BranchSummary {
  branchName: string;
  totalOrders: number;
  totalBudget: number;
  itemDetails: ReportItemSummary[];
}

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'THSarabunNew' },
  logo: { width: 80, height: 80, alignSelf: 'center', marginBottom: 10 },
  companyName: { fontSize: 20, textAlign: 'center', marginBottom: 5, fontWeight: 'bold' },
  address: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  subHeader: { fontSize: 18, textAlign: 'center', marginBottom: 5, fontWeight: 'bold' },
  subHeader2: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  dateTextLeft: { fontSize: 16, textAlign: 'left', marginBottom: 15, paddingLeft: 5 },
  table: { display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px solid #000', borderLeft: '1px solid #000', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1d4ed8', fontWeight: 'bold' },
  row: { flexDirection: 'row' },
  cell: { padding: 5, fontSize: 14, borderRight: '1px solid #000', borderBottom: '1px solid #000', color: '#000000', fontWeight: 'bold',},
  footerRow: { flexDirection: 'row', backgroundColor: '#1e3a8a' },
  signatureContainer: { marginTop: 30 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  sigBox: { width: '45%', textAlign: 'center', fontSize: 12 },
});

const ReportPDF = ({
  data,
  title,
  type,
  dateFrom,
  dateTo,
}: {
  data: any;
  title: string;
  type: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const formatDateTH = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const dateLabel =
    dateFrom && dateTo
      ? `ช่วงวันที่: ${formatDateTH(dateFrom)} ถึง ${formatDateTH(dateTo)}`
      : dateFrom
      ? `ตั้งแต่วันที่: ${formatDateTH(dateFrom)}`
      : dateTo
      ? `ถึงวันที่: ${formatDateTH(dateTo)}`
      : `วันที่รายงาน: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} (ข้อมูลสะสมทั้งหมด)`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.subHeader}>ใบเบิกวัสดุอุปกรณ์และสินค้า (Supply Use) ประจำวัน</Text>
        <Text style={styles.subHeader2}>สรุปรายละเอียดการใช้วัสดุสิ้นเปลืองและการเบิกจ่ายสินค้า (ระบบเบิกของ) รวมทั้งหมด</Text>
        <Text style={styles.dateTextLeft}>{dateLabel}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            {type === 'items' ? (
              <>
                <Text style={[styles.cell, { width: '10%', textAlign: 'center', color: '#FFFFFF' }]}>ลำดับ</Text>
                <Text style={[styles.cell, { width: '15%', textAlign: 'center', color: '#FFFFFF' }]}>ชื่อแผนก</Text>
                <Text style={[styles.cell, { width: '35%', textAlign: 'center', color: '#FFFFFF' }]}>รายการ</Text>
                <Text style={[styles.cell, { width: '10%', textAlign: 'center', color: '#FFFFFF' }]}>จำนวน</Text>
                <Text style={[styles.cell, { width: '15%', textAlign: 'center', color: '#FFFFFF' }]}>หน่วย</Text>
                <Text style={[styles.cell, { width: '15%', textAlign: 'center', color: '#FFFFFF' }]}>ราคา(บาท)</Text>
              </>
            ) : (
              <>
                <Text style={[styles.cell, { width: '10%', textAlign: 'center', color: '#FFFFFF' }]}>ลำดับ</Text>
                <Text style={[styles.cell, { width: '50%', textAlign: 'center', color: '#FFFFFF' }]}>ชื่อแผนก</Text>
                <Text style={[styles.cell, { width: '20%', textAlign: 'center', color: '#FFFFFF' }]}>จำนวนใบเบิก</Text>
                <Text style={[styles.cell, { width: '20%', textAlign: 'center', color: '#FFFFFF' }]}>งบประมาณรวม (บาท)</Text>
              </>
            )}
          </View>

          {/* PDF always uses full data — not sliced */}
          {type === 'items'
            ? data.itemsList.map((item: any, index: number) => (
                <View key={index} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, { width: '10%', textAlign: 'center' }]}>{index + 1}</Text>
                  <Text style={[styles.cell, { width: '15%' }]}>{item.branch_name}{item.zone_name?' / '+item.zone_name:''}</Text>
                  <Text style={[styles.cell, { width: '35%' }]}>{item.name}</Text>
                  <Text style={[styles.cell, { width: '10%', textAlign: 'center' }]}>{item.totalQuantity}</Text>
                  <Text style={[styles.cell, { width: '15%', textAlign: 'center' }]}>{item.unit}</Text>
                  <Text style={[styles.cell, { width: '15%', textAlign: 'right' }]}>
                    {item.totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))
            : data.branchSummaries.map((b: any, index: number) => (
                <View key={index} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, { width: '10%', textAlign: 'center' }]}>{index + 1}</Text>
                  <Text style={[styles.cell, { width: '50%' }]}>{b.branchName}</Text>
                  <Text style={[styles.cell, { width: '20%', textAlign: 'center' }]}>{b.totalOrders}</Text>
                  <Text style={[styles.cell, { width: '20%', textAlign: 'right' }]}>
                    {b.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}

          <View style={styles.footerRow} wrap={false}>
            <Text style={[styles.cell, { width: type === 'items' ? '85%' : '80%', textAlign: 'right', paddingRight: 10, fontWeight: 'bold', color: '#FFFFFF' }]}>
              รวมยอดสุทธิทั้งสิ้น
            </Text>
            <Text style={[styles.cell, { width: type === 'items' ? '15%' : '20%', fontWeight: 'bold', textAlign: 'right', color: '#FFFFFF' }]}>
              {data.totalBudget.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        <View style={styles.signatureContainer}>
          <View style={styles.sigRow}>
            <View style={styles.sigBox}>
              <Text>ผู้ขอเบิก...................................</Text>
              <Text style={{ marginTop: 5 }}>(...........................................)</Text>
              <Text style={{ marginTop: 5 }}>วันที่........./........./..........</Text>
            </View>
            <View style={styles.sigBox}>
              <Text>ผู้จัดทำ....................................</Text>
              <Text style={{ marginTop: 5 }}>(...........................................)</Text>
              <Text style={{ marginTop: 5 }}>วันที่........./........./..........</Text>
            </View>
          </View>
          <View style={styles.sigRow}>
            <View style={styles.sigBox}>
              <Text>ผู้ตรวจสอบ................................</Text>
              <Text style={{ marginTop: 5 }}>(...........................................)</Text>
              <Text style={{ marginTop: 5 }}>วันที่........./........./..........</Text>
            </View>
            <View style={styles.sigBox}>
              <Text>ผู้อนุมัติ....................................</Text>
              <Text style={{ marginTop: 5 }}>(...........................................)</Text>
              <Text style={{ marginTop: 5 }}>วันที่........./........./..........</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Pagination constants ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

/** Returns page number buttons with ellipsis (max 7 slots) */
function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

/** Shared pagination bar component */
function PaginationBar({
  current,
  total,
  totalRows,
  onGo,
}: {
  current: number;
  total: number;
  totalRows: number;
  onGo: (p: number) => void;
}) {
  if (total <= 1) return null;
  const from = (current - 1) * PAGE_SIZE + 1;
  const to   = Math.min(current * PAGE_SIZE, totalRows);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
      <p className="text-xs font-semibold text-slate-400">
        แสดง {from}–{to} จาก {totalRows.toLocaleString('th-TH')} รายการ
      </p>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button
          onClick={() => onGo(current - 1)}
          disabled={current === 1}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          ← ก่อนหน้า
        </button>
        {buildPageNumbers(current, total).map((p, idx) =>
          p === '…' ? (
            <span key={`e${idx}`} className="px-1 text-slate-300 text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onGo(p as number)}
              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                current === p
                  ? 'bg-brand-700 text-white shadow-sm shadow-brand-700/30'
                  : 'border border-slate-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onGo(current + 1)}
          disabled={current === total}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          ถัดไป →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminReportsPage() {
  const [loading, setLoading]                   = useState(true);
  const [selectedReportType, setSelectedReportType] = useState('compare');
  const [selectedBranch, setSelectedBranch]     = useState('all');
  const [selectedZone, setSelectedZone]         = useState('all');
  const [allBranches, setAllBranches]           = useState<string[]>([]);
  const [allZones, setAllZones]                 = useState<{ id: string; name: string; branch_id: string }[]>([]);
  const [branchIdMap, setBranchIdMap]           = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom]                 = useState<string>('');
  const [dateTo, setDateTo]                     = useState<string>('');
  const [rawRequisitions, setRawRequisitions]   = useState<any[]>([]);
  const [rawDetails, setRawDetails]             = useState<any[]>([]);
  

  // ── Display-only pagination state ─────────────────────────────────────────
  // These are reset whenever the data filter changes (type / branch / date).
  const [branchPage, setBranchPage] = useState(1);
  const [itemsPage,  setItemsPage]  = useState(1);

  const resetPages = () => { setBranchPage(1); setItemsPage(1); };

  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all') => {
    const today = getTodayStr();
    const shift = (days: number) => {
      const d = new Date(); d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const firstOfMonth = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    };
    resetPages();
    switch (preset) {
      case 'today':     setDateFrom(today);         setDateTo(today);     break;
      case 'yesterday': setDateFrom(shift(-1));      setDateTo(shift(-1)); break;
      case '7days':     setDateFrom(shift(-6));      setDateTo(today);     break;
      case '30days':    setDateFrom(shift(-29));     setDateTo(today);     break;
      case 'thisMonth': setDateFrom(firstOfMonth()); setDateTo(today);     break;
      case 'all':       setDateFrom('');             setDateTo('');        break;
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [{ data: reqs }, { data: branchesData }, { data: zonesData }] = await Promise.all([
        supabase
          .from('requisitions')
          .select('id, branch_name, zone_name, status, created_at, requester_name')
          .eq('status', 'approved'),
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('zones').select('id, name, branch_id').order('name'),
      ]);

      if (!reqs) { setLoading(false); return; }
      setRawRequisitions(reqs);

      // แผนกจาก branches table โดยตรง (ไม่ขึ้นกับว่ามีใบเบิกหรือเปล่า)
      if (branchesData) {
        setAllBranches(branchesData.map((b) => b.name));
        const idMap: Record<string, string> = {};
        branchesData.forEach((b) => { idMap[b.name] = b.id; });
        setBranchIdMap(idMap);
      }
      if (zonesData) setAllZones(zonesData);

      const reqIds = reqs.map((r) => r.id);
      if (reqIds.length === 0) { setLoading(false); return; }

      const { data: details } = await supabase
        .from('requisition_details')
        .select('requisition_id, quantity, price_at_time, items (name, unit)')
        .in('requisition_id', reqIds);

      if (details) setRawDetails(details);
      setLoading(false);
    }
    loadData();
  }, []);

  // Reset pages when filter axes change
  const handleReportTypeChange = (v: string) => {
    setSelectedReportType(v);
    if (v !== 'items') setSelectedBranch('all');
    resetPages();
  };
  const handleBranchChange = (v: string) => { setSelectedBranch(v); setSelectedZone('all'); resetPages(); };
  const handleDateFromChange = (v: string) => { setDateFrom(v); resetPages(); };
  const handleDateToChange   = (v: string) => { setDateTo(v);   resetPages(); };

  // ── Compute full (unsliced) data — used by PDF + Excel ───────────────────
  const getFilteredData = () => {
    const filteredReqs = rawRequisitions.filter((r) => {
      if (!r.created_at) return false;
      const rDate = new Date(r.created_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
      if (dateFrom && rDate < dateFrom) return false;
      if (dateTo   && rDate > dateTo)   return false;
      if (selectedBranch !== 'all' && r.branch_name !== selectedBranch) return false;
      if (selectedZone !== 'all' && r.zone_name !== selectedZone) return false;
      return true;
    });

    const filteredReqIds = new Set(filteredReqs.map((r) => r.id));
    let totalBudgetCounter = 0;
    const globalItemsMap: Record<string, ReportItemSummary> = {};
    const branchMap: Record<string, { totalOrders: number; totalBudget: number; items: Record<string, ReportItemSummary> }> = {};

    allBranches.forEach((b) => { branchMap[b] = { totalOrders: 0, totalBudget: 0, items: {} }; });
    filteredReqs.forEach((r) => { const label=r.branch_name+(r.zone_name?' · โซน '+r.zone_name:'');if(!branchMap[label])branchMap[label]={totalOrders:0,totalBudget:0,items:{}};branchMap[label].totalOrders++; });

    rawDetails.forEach((det: any) => {
      if (!filteredReqIds.has(det.requisition_id)) return;
      const parentReq  = filteredReqs.find((r) => r.id === det.requisition_id);
      if (!parentReq)  return;

      const branchName = parentReq.branch_name  || 'ไม่ระบุแผนก';
      const itemName   = det.items?.name         || 'ไม่ทราบชื่อสินค้า';
      const itemUnit   = det.items?.unit         || 'ชิ้น';
      const qty        = det.quantity             || 0;
      const cost       = qty * (det.price_at_time || 0);

      const matchesBranch = selectedReportType !== 'items' || selectedBranch === 'all' || branchName === selectedBranch;
      if (matchesBranch) {

          totalBudgetCounter += cost;

        const zoneName=parentReq.zone_name||'';
        const key = JSON.stringify([branchName,zoneName,itemName,itemUnit]);
        if (!globalItemsMap[key]) {
          globalItemsMap[key] = { name: itemName, unit: itemUnit, totalQuantity: 0, totalCost: 0, branch_name: branchName, zone_name:parentReq.zone_name||'' };
        }
        globalItemsMap[key].totalQuantity += qty;
        globalItemsMap[key].totalCost     += cost;
      }

      const summaryKey=branchName+(parentReq.zone_name?' · โซน '+parentReq.zone_name:'');
      if (branchMap[summaryKey]) {
        branchMap[summaryKey].totalBudget += cost;
        if (!branchMap[summaryKey].items[itemName]) {
          branchMap[summaryKey].items[itemName] = { name: itemName, unit: itemUnit, totalQuantity: 0, totalCost: 0, branch_name: branchName };
        }
        branchMap[summaryKey].items[itemName].totalQuantity += qty;
        branchMap[summaryKey].items[itemName].totalCost     += cost;
      }
    });

    return {
      totalOrders:    filteredReqs.length,
      totalBudget:    totalBudgetCounter,
      itemsList:      Object.values(globalItemsMap),
      branchSummaries: Object.keys(branchMap).map((b) => ({
        branchName:  b,
        totalOrders: branchMap[b].totalOrders,
        totalBudget: branchMap[b].totalBudget,
        itemDetails: Object.values(branchMap[b].items),
      })),
    };
  };

  // Full data (for export + totals)
  const currentData    = getFilteredData();
  const itemsTotalQty  = currentData.itemsList.reduce((s, i) => s + i.totalQuantity, 0);
  const itemsTotalCost = currentData.itemsList.reduce((s, i) => s + i.totalCost,     0);

  // ── Paginated slices — display only ──────────────────────────────────────
  const branchTotalPages = Math.max(1, Math.ceil(currentData.branchSummaries.length / PAGE_SIZE));
  const itemsTotalPages  = Math.max(1, Math.ceil(currentData.itemsList.length / PAGE_SIZE));

  const pagedBranches = currentData.branchSummaries.slice(
    (branchPage - 1) * PAGE_SIZE,
    branchPage * PAGE_SIZE,
  );
  const pagedItems = currentData.itemsList.slice(
    (itemsPage - 1) * PAGE_SIZE,
    itemsPage * PAGE_SIZE,
  );

  // ─────────────────────────────────────────────────────────────────────────

  const formatDateTH = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

  const dateRangeLabel =
    dateFrom || dateTo
      ? `${dateFrom ? formatDateTH(dateFrom) : 'ตั้งต้น'} — ${dateTo ? formatDateTH(dateTo) : 'ปัจจุบัน'}`
      : 'ข้อมูลสะสมทั้งหมด';

  const getReportHeaderTitle = () => {
    if (selectedReportType === 'compare') return 'สรุปรายงานเปรียบเทียบงบประมาณรายแผนก';
    return selectedBranch === 'all'
      ? 'สรุปรายละเอียดของในการเบิกสะสมรวมทั้งหมด'
      : `สรุปรายละเอียดการเบิก: ${selectedBranch}`;
  };

    const handleExportToExcel = async () => {
    const workbook  = new ExcelJS.Workbook();
    const sheetName = (selectedBranch === 'all' ? 'Report' : selectedBranch).substring(0, 31);
    const worksheet = workbook.addWorksheet(sheetName);

    // ── Title block ──────────────────────────────────────────────────────────
    const totalCols = selectedReportType === 'items' ? 8 : 3;
    const lastCol   = String.fromCharCode(64 + totalCols); // e.g. 'G' or 'C'

    worksheet.mergeCells(`A1:${lastCol}1`);
    const titleCell     = worksheet.getCell('A1');
    titleCell.value     = getReportHeaderTitle();
    titleCell.font      = { bold: true, size: 18  };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells(`A2:${lastCol}2`);
    const dateCell     = worksheet.getCell('A2');
    dateCell.value     = `ช่วงข้อมูล: ${dateRangeLabel}`;
    dateCell.font      = { italic: true, size: 11, color: { argb: 'FF888888' } };
    dateCell.alignment = { horizontal: 'center' };

    worksheet.addRow([]); // row 3 = spacer

    // ── Items: de-normalized per requisition row ──────────────────────────
    if (selectedReportType === 'items') {
      const headerRow = worksheet.addRow([
        'วันที่', 'แผนก', 'โซน', 'ผู้เบิก', 'รายการ', 'จำนวน', 'หน่วย', 'ราคา (บาท)',
      ]);
      styleHeader(headerRow);

      // Build reqId → req map
      const reqMap: Record<string, any> = {};
      rawRequisitions.forEach((r) => { reqMap[r.id] = r; });

      // Filter requisitions by date range
      const filteredReqIds = new Set(
        rawRequisitions
          .filter((r) => {
            if (!r.created_at) return false;
            const rDate = new Date(r.created_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
            if (dateFrom && rDate < dateFrom) return false;
            if (dateTo   && rDate > dateTo)   return false;
            return true;
          })
          .map((r) => r.id)
      );

      let grandTotal = 0;

      rawDetails.forEach((det: any) => {
        if (!filteredReqIds.has(det.requisition_id)) return;
        const req = reqMap[det.requisition_id];
        if (!req) return;

        const branchName = req.branch_name     || 'ไม่ระบุแผนก';
        if (selectedBranch !== 'all' && branchName !== selectedBranch) return;
        const zoneName   = req.zone_name        || '';
        if (selectedZone !== 'all' && zoneName !== selectedZone) return;

        const dateStr  = req.created_at
          ? new Date(req.created_at).toLocaleDateString('th-TH', {
              year: 'numeric', month: 'short', day: 'numeric',
            })
          : '-';
        const requester = req.requester_name   || '-';
        const itemName  = det.items?.name      || 'ไม่ทราบชื่อสินค้า';
        const itemUnit  = det.items?.unit      || 'ชิ้น';
        const qty       = det.quantity          || 0;
        const cost      = qty * (det.price_at_time || 0);
        grandTotal     += cost;

        const row = worksheet.addRow([dateStr, branchName, zoneName, requester, itemName, qty, itemUnit, cost]);
        styleDataRow(row, [6, 8]); // right-align qty and cost cols
        // Format cost cell as number
        row.getCell(8).numFmt = '#,##0.00';
      });

      // ── Summary row ──────────────────────────────────────────────────────
      worksheet.addRow([]);
      const sumRow = worksheet.addRow(['', '', '', '', '', '', 'รวมสุทธิ', grandTotal]);
      sumRow.font = { bold: true, size: 12 };
      sumRow.getCell(7).alignment = { horizontal: 'right' };
      sumRow.getCell(8).numFmt    = '#,##0.00';
      sumRow.getCell(8).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF275fb9' } };

      // ── Column widths ─────────────────────────────────────────────────────
      worksheet.columns = [
        { width: 18 }, // วันที่
        { width: 22 }, // แผนก
        { width: 18 }, // โซน
        { width: 20 }, // ผู้เบิก
        { width: 38 }, // รายการ
        { width: 10 }, // จำนวน
        { width: 14 }, // หน่วย
        { width: 18 }, // ราคา
      ];

    // ── Branch summary (ไม่เปลี่ยน logic เดิม) ───────────────────────────
    } else {
      const headerRow = worksheet.addRow(['ชื่อแผนก', 'จำนวนใบเบิก', 'งบประมาณรวม (บาท)']);
      styleHeader(headerRow);
      currentData.branchSummaries.forEach((b) => {
        const row = worksheet.addRow([b.branchName, b.totalOrders, b.totalBudget]);
        styleDataRow(row, [3]);
        row.getCell(3).numFmt = '#,##0.00';
      });
      worksheet.addRow([]);
      const sumRow = worksheet.addRow(['', 'รวมสุทธิ', currentData.totalBudget]);
      sumRow.font = { bold: true, size: 12 };
      sumRow.getCell(3).numFmt = '#,##0.00';
      worksheet.columns = [{ width: 40 }, { width: 20 }, { width: 25 }];
    }

    // ── Download ──────────────────────────────────────────────────────────
    const rangeSuffix = dateFrom || dateTo ? `_${dateFrom || 'start'}_to_${dateTo || 'now'}` : '_all';
    const fileName    = `Report_${selectedReportType}_${selectedBranch}${rangeSuffix}.xlsx`;
    const buffer      = await workbook.xlsx.writeBuffer();
    const blob        = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a           = document.createElement('a');
    a.href            = URL.createObjectURL(blob);
    a.download        = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const styleHeader = (row: ExcelJS.Row) => {
    row.eachCell((cell) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a6e' } };
      cell.font      = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      cell.border    = { top: { style: 'thin', color: { argb: 'FF4F46E5' } }, left: { style: 'thin', color: { argb: 'FF4F46E5' } }, bottom: { style: 'thin', color: { argb: 'FF4F46E5' } }, right: { style: 'thin', color: { argb: 'FF4F46E5' } } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  };

  const styleDataRow = (row: ExcelJS.Row, rightAlignCols: number[] = []) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    rightAlignCols.forEach((col) => { row.getCell(col).alignment = { horizontal: 'right' }; });
  };

  const PRESETS: { label: string; key: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'all' }[] = [
    { label: 'วันนี้',        key: 'today'     },
    { label: 'เมื่อวาน',     key: 'yesterday' },
    { label: '7 วันล่าสุด',  key: '7days'     },
    { label: '30 วันล่าสุด', key: '30days'    },
    { label: 'เดือนนี้',     key: 'thisMonth' },
    { label: 'ทั้งหมด',      key: 'all'       },
  ];

  const isActivePreset = (key: typeof PRESETS[number]['key']) => {
    const today = getTodayStr();
    const shift = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const fom = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
    switch (key) {
      case 'today':     return dateFrom === today      && dateTo === today;
      case 'yesterday': return dateFrom === shift(-1)  && dateTo === shift(-1);
      case '7days':     return dateFrom === shift(-6)  && dateTo === today;
      case '30days':    return dateFrom === shift(-29) && dateTo === today;
      case 'thisMonth': return dateFrom === fom()      && dateTo === today;
      case 'all':       return !dateFrom && !dateTo;
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-brand-700 font-bold text-base">กำลังคำนวณข้อมูลสรุปยอด...</p>
        </div>
      </div>
    );

  return (
    <div className="text-slate-800 print:bg-white print:py-0 print:px-0">
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 20mm; }
          body  { margin: 0 !important; padding: 0 !important; background-color: #fff !important; }
        }
      `}</style>

      <div className="max-w-[1600px] mx-auto space-y-5 print:max-w-full">

        {/* ── Navbar ── */}
        

        {/* ── Filter Panel ── */}
        <div className={REPORT_PANEL}>
          <ReportHeading title="📝 รายงานการเบิก" description="สรุปยอดตามแผนก โซน และช่วงวันที่" actions={<>
              <PDFDownloadLink
                document={<ReportPDF data={currentData} title={getReportHeaderTitle()} type={selectedReportType} dateFrom={dateFrom} dateTo={dateTo} />}
                fileName={`Report_${selectedReportType}_${selectedBranch}${dateFrom ? `_${dateFrom}` : ''}_to_${dateTo || 'now'}.pdf`}
              >
                {({ loading: pdfLoading }) => (
                  <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer border ${
                    pdfLoading
                      ? 'bg-brand-50 text-brand-700 border-slate-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-brand-400 hover:bg-brand-50/50 shadow-sm active:scale-95'
                  }`}>
                    {pdfLoading ? (
                      <><div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /><span>กำลังเตรียม...</span></>
                    ) : (
                      <><span>📄</span><span>PDF</span></>
                    )}
                  </div>
                )}
              </PDFDownloadLink>
              <button
                type="button"
                onClick={handleExportToExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-emerald-600 border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/50 shadow-sm active:scale-95 transition-all"
              >
                <span>📗</span><span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm active:scale-95 transition-all"
              >
                <span>🖨️</span><span>พิมพ์</span>
              </button>
          </>} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-brand-700 uppercase tracking-widest">📋 รูปแบบรายงาน</label>
              <select
                value={selectedReportType}
                onChange={(e) => handleReportTypeChange(e.target.value)}
                className="w-full h-11 px-4 bg-brand-50/50 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
              >
                <option value="compare">💵 สรุปยอดเงินรายแผนก</option>
                <option value="items">📦 รายการของที่เบิก</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-brand-700 uppercase tracking-widest">🏬 แผนก</label>
              <select
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="w-full h-11 px-4 bg-brand-50/50 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
              >
                <option value="all">ทุกแผนก</option>
                {allBranches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 sm:col-span-2"><p className="text-xs font-bold text-slate-600">พบ {currentData.totalOrders.toLocaleString('th-TH')} ใบเบิก · {currentData.itemsList.length.toLocaleString('th-TH')} รายการสินค้า · {currentData.branchSummaries.length.toLocaleString('th-TH')} แผนก</p><button type="button" onClick={()=>{setSelectedBranch('all');setSelectedZone('all');setDateFrom('');setDateTo('');resetPages();}} className="text-xs font-black text-brand-700 hover:underline">ล้างตัวกรองทั้งหมด</button></div>
            {/* โซน — โชว์เฉพาะเมื่อเลือกแผนกจัดเรียง */}
            {allZones.some(zone=>selectedBranch==='all'||zone.branch_id===branchIdMap[selectedBranch]) && (
              <div className="space-y-2">
                <label className="text-xs font-black text-brand-700 uppercase tracking-widest">🗂️ โซน</label>
                <select
                  value={selectedZone}
                  onChange={(e) => { setSelectedZone(e.target.value); resetPages(); }}
                  className="w-full h-11 px-4 bg-brand-50/50 border border-brand-200 rounded-xl font-semibold text-sm text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
                >
                  <option value="all">ทุกโซน</option>
                  {allZones
                    .filter((z) => selectedBranch==='all'||z.branch_id === branchIdMap[selectedBranch])
                    .map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-brand-700 uppercase tracking-widest">📅 ช่วงวันที่</label>
              {(dateFrom || dateTo) && (
                <button onClick={() => applyPreset('all')} className="text-xs text-red-500 font-bold hover:underline">✕ ล้างช่วงวันที่</button>
              )}
            </div>
            <div data-report-presets className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all ${
                    isActivePreset(p.key)
                      ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                      : 'bg-brand-50/60 text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">ตั้งแต่วันที่</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className="w-full h-11 px-4 bg-brand-50/50 border border-slate-200 rounded-xl font-semibold text-slate-700 text-sm outline-none cursor-pointer focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">ถึงวันที่</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="w-full h-11 px-4 bg-brand-50/50 border border-slate-200 rounded-xl font-semibold text-slate-700 text-sm outline-none cursor-pointer focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
                />
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <div className="flex items-center gap-2 px-4 py-3 bg-brand-50 rounded-xl border border-slate-200">
                <span>📌</span>
                <span className="text-sm font-bold text-brand-900">
                  กำลังดูข้อมูล: <span className="text-slate-700">{dateRangeLabel}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Report Document ── */}
        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm shadow-brand-100/50 border border-slate-200 print:shadow-none print:border-none print:p-0">

          <div className="text-center border-b-2 border-brand-200 pb-5 space-y-1 print:border-slate-900">
            <p className="inline-flex items-center gap-2 text-xs font-black text-brand-700 uppercase tracking-widest mb-2 print:hidden">
              <span className="w-8 h-px bg-brand-200" />ระบบเบิกของ · Report<span className="w-8 h-px bg-brand-200" />
            </p>
            <h2 className="text-xl font-black text-slate-800">{getReportHeaderTitle()}</h2>
            <p className="text-sm font-semibold text-slate-400">{dateRangeLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="bg-brand-50/60 p-5 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-black text-brand-700 uppercase tracking-widest">ใบเบิกที่อนุมัติ</span>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-black text-slate-800">{currentData.totalOrders}</span>
                <span className="text-sm font-bold text-slate-400">ฉบับ</span>
              </div>
            </div>
            <div className="bg-brand-50 p-5 rounded-xl border border-slate-200 text-center">
              <span className="block text-xs font-black text-brand-700 uppercase tracking-widest">รวมงบที่ใช้เบิก</span>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-black text-brand-900">{currentData.totalBudget.toLocaleString('th-TH')}</span>
                <span className="text-sm font-bold text-slate-400">บาท</span>
              </div>
            </div>
          </div>

          {/* ── Branch Table (paginated display) ── */}
          {(selectedReportType === 'all' || selectedReportType === 'compare') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-600" />
                  ตารางสรุปงบประมาณรายแผนก
                </h3>
                {currentData.branchSummaries.length > 0 && (
                  <span className="text-xs font-semibold text-slate-400">
                    {currentData.branchSummaries.length} แผนก
                  </span>
                )}
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-50 text-brand-800 font-black uppercase tracking-wide">
                    <th className="p-3 border border-slate-200">ชื่อแผนก</th>
                    <th className="p-3 border border-slate-200 text-center w-36">จำนวนใบเบิก</th>
                    <th className="p-3 border border-slate-200 text-right w-52">งบประมาณที่ใช้ไป</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-700">
                  {pagedBranches.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-brand-400 font-bold">ไม่มีข้อมูลในช่วงเวลาที่เลือก</td>
                    </tr>
                  ) : (
                    <>
                      {pagedBranches.map((b, idx) => (
                        <tr key={b.branchName} className={`hover:bg-brand-50/40 transition-colors ${idx % 2 === 1 ? 'bg-brand-50/20' : ''}`}>
                          <td className="p-3 border border-slate-200/60 font-bold">
                            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />{b.branchName}</div>
                          </td>
                          <td className="p-3 border border-slate-200/60 text-center">{b.totalOrders}</td>
                          <td className="p-3 border border-slate-200/60 text-right font-bold">{b.totalBudget.toLocaleString('th-TH')} ฿</td>
                        </tr>
                      ))}
                      {/* Grand total always shows full sum */}
                      <tr className="bg-brand-700 text-white font-black">
                        <td className="p-3 border border-brand-500">รวมงบสุทธิ (Grand Total)</td>
                        <td className="p-3 border border-brand-500 text-center">{currentData.totalOrders}</td>
                        <td className="p-3 border border-brand-500 text-right">{currentData.totalBudget.toLocaleString('th-TH')} ฿</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <PaginationBar
                current={branchPage}
                total={branchTotalPages}
                totalRows={currentData.branchSummaries.length}
                onGo={setBranchPage}
              />
            </div>
          )}

          {/* ── Items Table (paginated display) ── */}
          {selectedReportType === 'items' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-600" />
                  รายการสิ่งของวัสดุในการเบิกสะสมรวม
                </h3>
                {currentData.itemsList.length > 0 && (
                  <span className="text-xs font-semibold text-slate-400">
                    {currentData.itemsList.length} รายการ
                  </span>
                )}
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-50 text-brand-800 font-black uppercase tracking-wide">
                    <th className="p-3 border border-slate-200 w-12 text-center">ลำดับ</th>
                    <th className="p-3 border border-slate-200">รายการสิ่งของ</th>
                    <th className="p-3 border border-slate-200 text-center w-24">จำนวนรวม</th>
                    <th className="p-3 border border-slate-200 text-center w-24">หน่วย</th>
                    <th className="p-3 border border-slate-200 text-right w-48">งบประมาณรวม</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-700">
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-brand-400 font-bold">ไม่มีรายการที่อนุมัติในเงื่อนไขนี้</td>
                    </tr>
                  ) : (
                    <>
                      {pagedItems.map((item, idx) => {
                        // Keep global index for display (not reset per page)
                        const globalIdx = (itemsPage - 1) * PAGE_SIZE + idx;
                        return (
                          <tr key={JSON.stringify([item.branch_name,item.zone_name,item.name,item.unit])} className={`hover:bg-brand-50/40 transition-colors ${idx % 2 === 1 ? 'bg-brand-50/20' : ''}`}>
                            <td className="p-3 border border-slate-200/60 text-center text-brand-400 font-bold">{globalIdx + 1}</td>
                            <td className="p-3 border border-slate-200/60 font-bold">
                              <div>{item.name}</div>
                              <div className="text-xs text-brand-700 font-semibold mt-0.5">{item.branch_name}{item.zone_name?' · โซน '+item.zone_name:''}</div>
                            </td>
                            <td className="p-3 border border-slate-200/60 text-center font-bold">
                              <span className="bg-brand-50 text-brand-900 px-2.5 py-1 rounded-lg border border-slate-200">
                                {item.totalQuantity}
                              </span>
                            </td>
                            <td className="p-3 border border-slate-200/60 text-center text-slate-500 font-semibold">
                              {item.unit}
                            </td>
                            <td className="p-3 border border-slate-200/60 text-right">{item.totalCost.toLocaleString('th-TH')} ฿</td>
                          </tr>
                        );
                      })}
                      {/* Total row always uses full sum */}
                      <tr className="bg-brand-700 text-white font-black">
                        <td colSpan={2} className="p-3 border border-brand-500">รวมยอดสุทธิ (Total)</td>
                        <td className="p-3 border border-brand-500 text-center">{itemsTotalQty.toLocaleString('th-TH')}</td>
                        <td className="p-3 border border-brand-500 text-center">รายการ</td>
                        <td className="p-3 border border-brand-500 text-right">{itemsTotalCost.toLocaleString('th-TH')} ฿</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <PaginationBar
                current={itemsPage}
                total={itemsTotalPages}
                totalRows={currentData.itemsList.length}
                onGo={setItemsPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}