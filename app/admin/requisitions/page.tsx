'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useNewRequisitions } from '@/hooks/useNewRequisitions';
import { AdminNavView } from '@/components/AdminNav';

interface Requisition {
  id: string;
  created_at: string;
  branch_name: string;
  requester_name: string;
  zone_name?:string;sender_name?:string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RequisitionDetail {
  id: string;
  quantity: number;
  price_at_time: number;
  items: {
    name: string;
    unit: string;
    image_url: string | null;
  } | null;
}

const PAGE_SIZE = 20;

export default function AdminRequisitionsPage() {
  const [requisitions, setRequisitions]     = useState<Requisition[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedReq, setSelectedReq]       = useState<Requisition | null>(null);
  const [details, setDetails]               = useState<RequisitionDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [modalMode, setModalMode]           = useState<'review' | 'view'>('review');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selectedImage && imageDialogRef.current && !imageDialogRef.current.open) {
      imageDialogRef.current.showModal();
    }
  }, [selectedImage]);
  const [filterStatus, setFilterStatus]     = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm]         = useState('');

  // Pagination state
  const [currentPage, setCurrentPage]   = useState(1);
  const [totalCount, setTotalCount]     = useState(0);

  // Summary counts (independent of current page / filter)
  const [pendingCount, setPendingCount]   = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const [zoneBranches,setZoneBranches]=useState<string[]>([]);
  useEffect(()=>{let alive=true;void Promise.all([supabase.from('branches').select('id,name'),supabase.from('zones').select('branch_id')]).then(([branches,zones])=>{if(!alive||branches.error||zones.error)return;const ids=new Set((zones.data||[]).map(zone=>zone.branch_id));setZoneBranches((branches.data||[]).filter(branch=>ids.has(branch.id)).map(branch=>branch.name));});return()=>{alive=false;};},[]);
  const needsSender=(req:Requisition)=>req.branch_name==='จัดเรียง'||Boolean(req.zone_name)||zoneBranches.includes(req.branch_name)||Boolean(req.sender_name);

  // จุดแดงแจ้งเตือนใบเบิกใหม่
  const { newCount, markSeen } = useNewRequisitions();
  const [newSince, setNewSince] = useState<string | null>(null);
  const newSinceRef = useRef<string | null>(null);
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ── Fetch summary counts (always full table) ────────────────────────────
  async function fetchCounts() {
    const [p, a, r] = await Promise.all([
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);
    setPendingCount(p.count ?? 0);
    setApprovedCount(a.count ?? 0);
    setRejectedCount(r.count ?? 0);
  }

  // ── Fetch one page of requisitions ─────────────────────────────────────
  const fetchRequisitions = useCallback(async (page = currentPage) => {
    setLoading(true);

    const from = (page - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let query = supabase
      .from('requisitions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    if (searchTerm.trim()) {
      // Supabase ilike filter: match either column
      query = query.or(
        `branch_name.ilike.%${searchTerm.trim()}%,requester_name.ilike.%${searchTerm.trim()}%`,
      );
    }

    const { data, count, error } = await query;
    if (error) console.error('Error fetching requisitions:', error);
    setRequisitions(data ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [currentPage, filterStatus, searchTerm]);

  // Re-fetch whenever page / filter / search changes
  useEffect(() => {
    fetchRequisitions(currentPage);
  }, [currentPage, filterStatus, searchTerm]);

  // Fetch counts once on mount (and after status update)
  useEffect(() => { fetchCounts(); }, []);

  // เปิดหน้านี้ = เห็นแล้ว → ล้างจุดแดง
  useEffect(() => {
    // Keep the previous visit's marker so new rows remain identifiable
    // after opening this page clears the navigation notification.
    if (newSinceRef.current === null) {
      let previousSeen = '1970-01-01T00:00:00.000Z';
      try {
        const saved = localStorage.getItem('admin_requisitions_last_seen');
        if (saved && !Number.isNaN(Date.parse(saved))) previousSeen = saved;
      } catch {
        // Show unread rows when browser storage is unavailable.
      }
      newSinceRef.current = previousSeen;
      setNewSince(previousSeen);
    }
    markSeen();
  }, [markSeen]);

  // มีใบเบิกใหม่เข้ามาขณะเปิดหน้าอยู่ → อัปเดตตัวเลขสรุปทันที
  useEffect(() => {
    if (newCount > 0) fetchCounts();
  }, [newCount]);

  // กดแท็บ "ใบเบิก" / รีเฟรช → ล้างจุดแดง แล้วโหลดหน้า 1 ใหม่
  const handleSeeNew = () => {
    markSeen();
    if (currentPage === 1) {
      fetchRequisitions(1);
    } else {
      setCurrentPage(1);
    }
    fetchCounts();
  };

  // ── When filter or search changes, jump back to page 1 ─────────────────
  const handleFilterChange = (s: typeof filterStatus) => {
    setFilterStatus(s);
    setCurrentPage(1);
  };
  const handleSearchChange = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  // ── Group current page's rows by date ───────────────────────────────────
  const groupedRequisitions = requisitions.reduce((groups, req) => {
    const date = new Date(req.created_at).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(req);
    return groups;
  }, {} as Record<string, Requisition[]>);

  // ── Modal helpers ───────────────────────────────────────────────────────
  const handleViewDetails = async (req: Requisition, mode: 'review' | 'view') => {
    setOpenedIds((ids) => new Set(ids).add(req.id));
    setSelectedReq(req);
    setModalMode(mode);
    setLoadingDetails(true);
    const { data, error } = await supabase
      .from('requisition_details')
      .select('id, quantity, price_at_time, items (name, unit, image_url)')
      .eq('requisition_id', req.id);
    if (data) setDetails(data as unknown as RequisitionDetail[]);
    if (error) console.error(error);
    setLoadingDetails(false);
  };

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'approved' | 'rejected') => {
    const label =
      newStatus === 'approved' ? 'อนุมัติ' :
      newStatus === 'rejected' ? 'ปฏิเสธ' : 'ยกเลิกการอนุมัติ';
    if (!window.confirm(`ยืนยันการ "${label}" ใบเบิกนี้?`)) return;
    const { error } = await supabase.from('requisitions').update({ status: newStatus }).eq('id', id);
    if (error) {
      alert(`เกิดข้อผิดพลาด: ${error.message}`);
    } else {
      setSelectedReq(null);
      await Promise.all([fetchRequisitions(currentPage), fetchCounts()]);
    }
  };

  // ── Pagination helpers ──────────────────────────────────────────────────
  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Build the visible page number buttons (at most 7 slots) */
  function pageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '…')[] = [1];
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }

  // ── Status badge ────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />อนุมัติแล้ว
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-100">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />ปฏิเสธ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-500 px-3 py-1 rounded-full text-xs font-bold border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />รออนุมัติ
          </span>
        );
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Navbar */}
        <AdminNavView activeHref="/admin/requisitions" newCount={newCount} onRequisitionsClick={handleSeeNew} />

        {/* Page Header */}
        <div className="bg-white p-5 rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">📝 จัดการใบเบิกสินค้า</h1>
              <p className="text-xs font-semibold text-blue-700 mt-1 uppercase tracking-widest">ตรวจสอบและอนุมัติ</p>
            </div>
            <button
              onClick={handleSeeNew}
              className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-100 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            >
              🔄 รีเฟรช
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
              <p className="text-xs font-bold text-amber-400 mt-0.5">รออนุมัติ</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-black text-emerald-600">{approvedCount}</p>
              <p className="text-xs font-bold text-emerald-400 mt-0.5">อนุมัติแล้ว</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-black text-red-500">{rejectedCount}</p>
              <p className="text-xs font-bold text-red-300 mt-0.5">ปฏิเสธ</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="🔍 ค้นหาแผนกหรือชื่อผู้เบิก..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="flex-1 h-10 px-4 border border-blue-100 rounded-xl bg-blue-50/50 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all placeholder:text-slate-400"
            />
            <div className="flex items-center gap-1 bg-blue-50 p-1 rounded-xl border border-blue-100 shrink-0">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleFilterChange(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterStatus === s
                      ? 'bg-white text-blue-900 shadow-sm shadow-blue-100'
                      : 'text-slate-500 hover:text-blue-800'
                  }`}
                >
                  {s === 'all' ? 'ทั้งหมด' : s === 'pending' ? 'รออนุมัติ' : s === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Requisition Tables */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 bg-white rounded-2xl border border-blue-100">
            <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-blue-700 font-bold text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        ) : Object.keys(groupedRequisitions).length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-blue-100">
            <p className="text-blue-400 font-bold text-base">ไม่พบใบเบิกในเงื่อนไขที่เลือก</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedRequisitions).map(([date, reqs]) => (
              <div key={date} className="bg-white rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 overflow-hidden">
                <div className="px-5 py-3 bg-linear-to-r from-blue-50 to-blue-50/50 border-b border-blue-100 flex items-center gap-2">
                  <span className="text-blue-400">🗓️</span>
                  <span className="text-blue-800 font-black text-sm uppercase tracking-wider">{date}</span>
                  <span className="ml-auto text-xs font-bold text-blue-400">{reqs.length} รายการ</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] table-fixed text-left text-sm">
                    <colgroup><col className="w-20"/><col className="w-[28%]"/><col/><col className="w-44"/><col className="w-40"/></colgroup>
                    <thead className="border-b border-blue-50 bg-slate-50/60 text-xs font-bold text-slate-400"><tr><th scope="col" className="px-4 py-2">เวลา</th><th scope="col" className="px-4 py-2">แผนก / โซน</th><th scope="col" className="px-4 py-2">ผู้เบิก / ผู้ส่ง</th><th scope="col" className="px-4 py-2">สถานะ</th><th scope="col" className="px-4 py-2 text-right">ดำเนินการ</th></tr></thead>
                    <tbody className="divide-y divide-blue-50/80">
                      {reqs.map((req) => (
                        <tr key={req.id} className="align-middle hover:bg-blue-50/40 transition-colors group">
                          <td className="p-4 text-sm font-semibold text-slate-400 whitespace-nowrap">
                            {new Date(req.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="p-4">
                            <span className="font-black text-slate-800">{req.branch_name}</span>{req.zone_name&&<p className="mt-1 text-xs font-bold text-blue-700">โซน: {req.zone_name}</p>}
                          </td>
                          <td className="p-4">
                            <span className="text-sm font-semibold text-slate-500">{req.requester_name}</span>{needsSender(req)&&<p className={'mt-1 text-xs font-semibold '+(req.sender_name?'text-blue-800':'text-amber-700')}>หัวหน้า/รองหัวหน้าผู้ส่ง: {req.sender_name?.trim()||'ยังไม่ระบุ'}</p>}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getStatusBadge(req.status)}
                              {newSince !== null && Date.parse(req.created_at) > Date.parse(newSince) && !openedIds.has(req.id) && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                                  ใหม่
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            {req.status === 'pending' ? (
                              <button
                                onClick={() => handleViewDetails(req, 'review')}
                                className="bg-linear-to-r from-blue-700 to-blue-800 text-white hover:from-blue-800 hover:to-blue-900 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm shadow-blue-700/30 active:scale-95"
                              >
                                ตรวจสอบ →
                              </button>
                            ) : (
                              <button
                                onClick={() => handleViewDetails(req, 'view')}
                                className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                              >
                                {req.status === 'approved' ? '✅ รายละเอียด' : '❌ ดูข้อมูล'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* ── Pagination Bar ── */}
            <div className="bg-white border border-blue-100 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm shadow-blue-100/50">
              {/* Info text */}
              <p className="text-xs font-semibold text-slate-400 shrink-0">
                แสดง {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} จาก {totalCount.toLocaleString('th-TH')} รายการ
              </p>

              {/* Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {/* Prev */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  ← ก่อนหน้า
                </button>

                {/* Page numbers */}
                {pageNumbers().map((p, idx) =>
                  p === '…' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-300 text-sm select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      className={`w-9 h-9 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        currentPage === p
                          ? 'bg-linear-to-r from-blue-700 to-blue-800 text-white shadow-sm shadow-blue-700/30'
                          : 'border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                {/* Next */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedImage && (
        <dialog
          ref={imageDialogRef}
          aria-label={`รูปสินค้า ${selectedImage.name}`}
          onClose={() => setSelectedImage(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) imageDialogRef.current?.close();
          }}
          className="fixed inset-0 m-auto h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/80 open:flex open:items-center open:justify-center"
        >
          <div className="relative max-w-5xl rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl sm:p-5">
            <button
              type="button"
              autoFocus
              aria-label="ปิดรูปขยาย"
              onClick={() => imageDialogRef.current?.close()}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3a6e] text-xl font-bold text-white shadow-md hover:bg-blue-700"
            >×</button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-h-[75dvh] max-w-full rounded-xl object-contain" />
            <p className="mt-3 text-center text-sm font-bold text-[#1a3a6e]">{selectedImage.name}</p>
          </div>
        </dialog>
      )}
      {/* ── Detail Modal ── */}
      {selectedReq && (
        <div className="fixed inset-0 bg-[#1a3a6e]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl shadow-blue-200/50 overflow-hidden border border-blue-100">
            <div className="bg-linear-to-r from-[#1a3a6e] to-[#112654] text-white p-5 flex items-start justify-between">
              <div>
                <h3 className="font-black text-base tracking-tight">
                  {modalMode === 'review' ? '📋 ตรวจสอบใบเบิก' : '📄 รายละเอียดใบเบิก'}
                </h3>
                <p className="text-sm text-blue-200 mt-1 font-semibold">
                  {selectedReq.branch_name} · {selectedReq.requester_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-lg transition-all"
              >
                ×
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {loadingDetails ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm">
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">ผู้เบิก</p>
                      <p className="font-bold text-slate-700 mt-1">{selectedReq.requester_name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">แผนก</p>
                      <p className="font-bold text-slate-700 mt-1">{selectedReq.branch_name}</p>{selectedReq.zone_name&&<p className="mt-1">โซน: {selectedReq.zone_name}</p>}{needsSender(selectedReq)&&<p className={'mt-2 rounded-lg border p-2 text-sm '+(selectedReq.sender_name?'border-blue-100 text-blue-900':'border-amber-200 bg-amber-50 text-amber-800')}>หัวหน้า / รองหัวหน้าผู้ส่ง: <strong>{selectedReq.sender_name?.trim()||'ยังไม่ระบุ'}</strong></p>}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">วันที่</p>
                      <p className="font-bold text-slate-700 mt-1">
                        {new Date(selectedReq.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">สถานะ</p>
                      <div className="mt-1">{getStatusBadge(selectedReq.status)}</div>
                    </div>
                  </div>

                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-blue-100 text-blue-700">
                        <th className="py-2.5 px-2 font-black">รายการ</th>
                        <th className="py-2.5 px-2 text-center font-black w-20">จำนวน</th>
                        <th className="py-2.5 px-2 text-center font-black w-20">หน่วย</th>
                        <th className="py-2.5 px-2 text-right font-black w-28">ราคา/หน่วย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {details.map((d) => (
                        <tr key={d.id} className="text-slate-700 hover:bg-blue-50/50">
                                                    <td className="py-3 px-2 font-semibold">
                            <div className="flex items-center gap-3">
                                                            <button
                                type="button"
                                disabled={!d.items?.image_url}
                                onClick={() => {
                                  if (d.items?.image_url) setSelectedImage({ url: d.items.image_url, name: d.items.name });
                                }}
                                aria-label={`ขยายรูป ${d.items?.name || 'สินค้า'}`}
                                title={d.items?.image_url ? 'กดเพื่อขยายรูป' : 'ไม่มีรูปสินค้า'}
                                className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100 bg-blue-50 enabled:cursor-zoom-in enabled:hover:ring-2 enabled:hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-700"
                              >
                                <span className="text-2xl" aria-hidden="true">📦</span>
                                {d.items?.image_url && (
                                  <img
                                    src={d.items.image_url}
                                    alt={d.items.name}
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full bg-white object-contain p-1"
                                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                              </button>
                              <span className="wrap-break-word">{d.items?.name || 'ไม่พบข้อมูลสินค้า'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-black text-blue-900">{d.quantity}</td>
                          <td className="py-3 px-2 text-center text-slate-500">{d.items?.unit}</td>
                          <td className="py-3 px-2 text-right font-bold text-slate-700">
                            {(d.price_at_time || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-blue-200 font-black text-slate-800">
                        <td colSpan={3} className="py-3 px-2 text-right text-sm">รวมเป็นเงินทั้งสิ้น</td>
                        <td className="py-3 px-2 text-right text-blue-900 text-base">
                          {details
                            .reduce((sum, d) => sum + (d.price_at_time || 0) * (d.quantity || 0), 0)
                            .toLocaleString('th-TH', { minimumFractionDigits: 2 })}{' '}
                          ฿
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50/40 border-t border-blue-100 flex gap-2">
              {modalMode === 'review' ? (
                <>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq.id, 'rejected')}
                    className="flex-1 border border-blue-200 text-blue-800 py-3 rounded-xl text-sm font-bold hover:bg-blue-50 transition-all active:scale-95"
                  >
                    ❌ ปฏิเสธ
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedReq.id, 'approved')}
                    className="flex-1 bg-linear-to-r from-blue-700 to-blue-800 text-white py-3 rounded-xl text-sm font-bold hover:from-blue-800 hover:to-blue-900 transition-all shadow-md shadow-blue-200 active:scale-95"
                  >
                    ✅ อนุมัติ
                  </button>
                </>
              ) : selectedReq.status === 'approved' ? (
                <button
                  onClick={() => handleUpdateStatus(selectedReq.id, 'pending')}
                  className="w-full bg-amber-400 text-white py-3 rounded-xl text-sm font-bold hover:bg-amber-500 transition-all active:scale-95"
                >
                  ↩️ ยกเลิกการอนุมัติ
                </button>
              ) : (
                <button
                  onClick={() => setSelectedReq(null)}
                  className="w-full bg-blue-50 text-blue-700 border border-blue-100 py-3 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all"
                >
                  ปิดหน้าต่าง
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}