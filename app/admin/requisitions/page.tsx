'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import RequestedItems from '@/components/RequestedItems';
import { requestError, validRequestLines } from '@/lib/requisitionRules';
import { useNewRequisitions, REQUISITIONS_RELOAD_EVENT } from '@/hooks/useNewRequisitions';
import { ui, PageHero, StatCard, SearchBox, EmptyState, Skeleton, Notice, Modal } from '@/components/AdminUI';

interface Requisition {
  id: string;
  version: number; note?: string; admin_note?: string; requested_items?: RequisitionDetail[];
  created_at: string;
  branch_name: string;
  requester_name: string;
  zone_name?: string;
  sender_name?: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RequisitionDetail {
  id: string;
  item_id?: string;
  quantity: number;
  price_at_time: number;
  items: {
    id?: string;
    name: string;
    unit: string;
    price?: number;
    image_url: string | null;
  } | null;
}

interface MasterItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  image_url: string | null;
}

const PAGE_SIZE = 20;
const OPENED_KEY = 'admin_requisitions_opened_ids';   // ใบที่เปิดดูแล้วบนเบราว์เซอร์นี้ (เก็บล่าสุด 300 ใบ)
const BASELINE_KEY = 'admin_requisitions_new_baseline'; // ใบที่เข้ามาหลังเวลานี้ และยังไม่เปิดดู = "ใหม่"

const statusStyle = {
  pending: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500 animate-pulse', text: 'รออนุมัติ' },
  approved: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', text: 'อนุมัติแล้ว' },
  rejected: { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', text: 'ปฏิเสธ' },
} as const;

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle[(status in statusStyle ? status : 'pending') as keyof typeof statusStyle];
  return <span className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ' + style.badge}><span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + style.dot} />{style.text}</span>;
}

export default function AdminRequisitionsPage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [details, setDetails] = useState<RequisitionDetail[]>([]);
  const [originalDetails, setOriginalDetails] = useState<RequisitionDetail[]>([]);
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const reviewBusy = useRef(false);
  const detailRequest = useRef(0);
  const listRequest = useRef(0);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [modalMode, setModalMode] = useState<'review' | 'view'>('review');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);

  // State สำหรับ Pop-up ค้นหาและเปลี่ยนสินค้า
  const [itemSelectorOpen, setItemSelectorOpen] = useState(false);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [allItems, setAllItems] = useState<MasterItem[]>([]);

  useEffect(() => {
    if (selectedImage && imageDialogRef.current && !imageDialogRef.current.open) {
      imageDialogRef.current.showModal();
    }
  }, [selectedImage]);

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // null = ยังโหลดไม่ได้ → โชว์ "—" ไม่โชว์ 0 หลอก
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [rejectedCount, setRejectedCount] = useState<number | null>(null);

  const [zoneBranches, setZoneBranches] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase.from('branches').select('id,name'),
      supabase.from('zones').select('branch_id')
    ]).then(([branches, zones]) => {
      if (!alive || branches.error || zones.error) return;
      const ids = new Set((zones.data || []).map(zone => zone.branch_id));
      setZoneBranches((branches.data || []).filter(branch => ids.has(branch.id)).map(branch => branch.name));
    });
    return () => { alive = false; };
  }, []);

  // ดึงรายการสินค้าทั้งหมดมาเตรียมไว้ค้นหา
  useEffect(() => {
    async function fetchAllItems() {
      const { data, error } = await supabase.from('items').select('id, name, unit, price, image_url').order('name');
      if (data) setAllItems(data as MasterItem[]);
      if (error) console.error('Error fetching all items:', error);
    }
    fetchAllItems();
  }, []);

  const needsSender = (req: Requisition) => req.branch_name === 'จัดเรียง' || Boolean(req.zone_name) || zoneBranches.includes(req.branch_name) || Boolean(req.sender_name);

  const { newCount, markSeen } = useNewRequisitions();
  const [newSince, setNewSince] = useState<string | null>(null);
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function fetchCounts() {
    const [p, a, r] = await Promise.all([
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('requisitions').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);
    if (p.error || a.error || r.error) return; // โหลดตัวเลขไม่สำเร็จ → คงค่าเดิมไว้ ไม่ให้โชว์ 0 หลอก
    setPendingCount(p.count ?? 0);
    setApprovedCount(a.count ?? 0);
    setRejectedCount(r.count ?? 0);
  }

  const fetchRequisitions = useCallback(async (page = currentPage, silent = false) => {
    const sequence = ++listRequest.current;
    if (!silent) setLoading(true); // silent = โหลดทับเงียบ ๆ ไม่เด้งหน้าหมุน
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('requisitions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);

    if (searchTerm.trim()) {
      query = query.or(
        `branch_name.ilike.%${searchTerm.trim()}%,requester_name.ilike.%${searchTerm.trim()}%`,
      );
    }

    const { data, count, error } = await query;
    if (sequence !== listRequest.current) return;
    if (error) console.error('Error fetching requisitions:', error);
    setRequisitions(data ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [currentPage, filterStatus, searchTerm]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) return fetchRequisitions(currentPage); });
    return () => { alive = false; listRequest.current++; };
  }, [currentPage, fetchRequisitions]);

  useEffect(() => { void Promise.resolve().then(() => fetchCounts()); }, []);

  useEffect(() => {
    let alive = true;
    try {
      const raw = localStorage.getItem(OPENED_KEY);
      const ids: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(ids)) setOpenedIds(new Set(ids.filter((id): id is string => typeof id === 'string')));
    } catch {
      // อ่านไม่ได้ → เริ่มใหม่
    }
    let saved: string | null = null;
    try {
      const value = localStorage.getItem(BASELINE_KEY);
      if (value && !Number.isNaN(Date.parse(value))) saved = value;
    } catch {
      // ใช้ค่าจากเซิร์ฟเวอร์ด้านล่างแทน
    }
    if (saved) {
      setNewSince(saved);
    } else {
      // ใช้เบราว์เซอร์นี้ครั้งแรก → เริ่มนับจากใบล่าสุดตามเวลาเซิร์ฟเวอร์ ไม่ถือว่าใบเก่าทั้งหมดเป็น "ใหม่"
      void supabase.from('requisitions').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(({ data, error }) => {
          if (!alive) return;
          const base = error ? new Date().toISOString() : (data?.[0]?.created_at ?? '1970-01-01T00:00:00.000Z');
          try { localStorage.setItem(BASELINE_KEY, base); } catch { /* ใช้ได้ภายในเซสชันนี้ */ }
          setNewSince(base);
        });
    }
    void markSeen();
    return () => { alive = false; };
  }, [markSeen]);

  useEffect(() => {
    if (newCount > 0) void Promise.resolve().then(() => fetchCounts());
  }, [newCount]);

  // โหลดใบใหม่เองเมื่ออยู่หน้าแรก ไม่ได้ค้นหา/กรองจนทำให้ใบใหม่ไม่ตรงเงื่อนไข และไม่ได้เปิดหน้าต่างใด ๆ ค้างอยู่
  // ถ้าเงื่อนไขไม่ครบ ปุ่มรีเฟรชด้านบนยังให้กดโหลดเองได้ และจะโหลดให้ทันทีเมื่อปิดหน้าต่างนั้น
  const canAutoLoad = currentPage === 1 && !searchTerm.trim() && (filterStatus === 'all' || filterStatus === 'pending')
    && !selectedReq && !itemSelectorOpen && !selectedImage;
  useEffect(() => {
    if (newCount > 0 && canAutoLoad) {
      void markSeen();
      void fetchRequisitions(1, true);
      void fetchCounts();
    }
  }, [newCount, canAutoLoad, fetchRequisitions, markSeen]);

  const handleSeeNew = () => {
    markSeen();
    if (currentPage === 1) {
      fetchRequisitions(1);
    } else {
      setCurrentPage(1);
    }
    fetchCounts();
  };

  // เมนูยิงอีเวนต์นี้เมื่อกดแท็บ "ใบเบิก" ขณะอยู่หน้านี้แล้ว → โหลดรายการใหม่ + เคลียร์จุดแดง
  useEffect(() => {
    const onReload = () => handleSeeNew();
    window.addEventListener(REQUISITIONS_RELOAD_EVENT, onReload);
    return () => window.removeEventListener(REQUISITIONS_RELOAD_EVENT, onReload);
  });

  const handleFilterChange = (s: typeof filterStatus) => {
    setFilterStatus(s);
    setCurrentPage(1);
  };
  const handleSearchChange = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const groupedRequisitions = requisitions.reduce((groups, req) => {
    const date = new Date(req.created_at).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(req);
    return groups;
  }, {} as Record<string, Requisition[]>);

  const rememberOpened = (id: string) => {
    if (openedIds.has(id)) return;
    const next = new Set(openedIds).add(id);
    setOpenedIds(next);
    try { localStorage.setItem(OPENED_KEY, JSON.stringify([...next].slice(-300))); } catch { /* จำได้เฉพาะเซสชันนี้ */ }
  };

  const handleViewDetails = async (req: Requisition, mode: 'review' | 'view') => {
    if (reviewBusy.current) return;
    const sequence = ++detailRequest.current;
    rememberOpened(req.id); setSelectedReq(req); setModalMode(mode === 'review' && req.status === 'pending' ? 'review' : 'view');
    setLoadingDetails(true); setDetailError(''); setDetails([]); setOriginalDetails([]); setAdminNote('');
    const { data, error } = await supabase.from('requisitions').select('*,requisition_details(id,item_id,quantity,price_at_time,items(id,name,unit,price,image_url))').eq('id', req.id).single();
    if (sequence !== detailRequest.current) return;
    if (error || !data) { setDetailError(requestError(error)); }
    else { setSelectedReq(data); setAdminNote(data.admin_note || ''); setModalMode(mode === 'review' && data.status === 'pending' ? 'review' : 'view'); const rows = data.requisition_details as unknown as RequisitionDetail[]; setDetails(rows); setOriginalDetails(rows); }
    setLoadingDetails(false);
  };

  // เลือกสินค้าทดแทนจาก Pop-up
  const handleSelectReplacementItem = (newItem: MasterItem) => {
    if (!activeDetailId || reviewBusy.current) return;
    setDetails(prev => prev.map(d => {
      if (d.id !== activeDetailId) return d;
      return {
        ...d,
        item_id: newItem.id,
        price_at_time: originalDetails.find(line => line.item_id === newItem.id)?.price_at_time ?? newItem.price ?? d.price_at_time,
        items: {
          id: newItem.id,
          name: newItem.name,
          unit: newItem.unit,
          price: newItem.price,
          image_url: newItem.image_url
        }
      };
    }));
    setItemSelectorOpen(false);
    setActiveDetailId(null);
    setItemSearchTerm('');
  };

  const handleDetailChange = (detailId: string, value: string) => {
    if (reviewBusy.current) return;
    setDetails(prev => prev.map(d => {
      if (d.id !== detailId) return d;
      return { ...d, quantity: Math.max(1, Number(value)) };
    }));
  };

  const handleDeleteDetail = (detailId: string) => {
    if (reviewBusy.current) return;
    if (!window.confirm('ตัดรายการนี้ออกจากการอนุมัติ? ยังเก็บรายการที่ขอไว้ในประวัติ')) return;
    setDetails(prev => prev.filter(d => d.id !== detailId));
  };

  const submitReview = async (status: 'approved' | 'rejected') => {
    if (reviewBusy.current || loadingDetails || detailError || !selectedReq) return;
    const lines = details.map(d => ({ item_id: d.item_id || d.items?.id || '', quantity: d.quantity }));
    if (status === 'approved' && !validRequestLines(lines)) { alert('ต้องมีสินค้าอย่างน้อย 1 รายการ จำนวนเต็มบวก และไม่มีรายการซ้ำ หากไม่ให้เบิกทั้งหมดให้กดปฏิเสธใบเบิก'); return; }
    if (!window.confirm(status === 'approved' ? 'ยืนยันอนุมัติรายการที่เหลือ พร้อมบันทึกผลตรวจสอบ?' : 'ยืนยันปฏิเสธใบเบิกนี้?')) return;
    reviewBusy.current = true; setSaving(true);
    try {
      const { error } = await supabase.rpc('review_requisition', { p_id: selectedReq.id, p_version: selectedReq.version, p_status: status, p_admin_note: adminNote, p_lines: lines });
      if (error) throw error;
      setSelectedReq(null); await Promise.all([fetchRequisitions(currentPage), fetchCounts()]);
    } catch (error) { alert(requestError(error)); } finally { setSaving(false); reviewBusy.current = false; }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const filteredMasterItems = allItems.filter(item =>
    item.name.toLowerCase().includes(itemSearchTerm.toLowerCase())
  );

  const hasFilter = searchTerm.trim() !== '' || filterStatus !== 'all';
  const closeReview = () => { detailRequest.current++; setSelectedReq(null); };
  const cards = [
    { key: 'pending', label: 'รออนุมัติ', icon: '⏳', accent: 'amber', value: pendingCount, hint: 'รอตรวจสอบ' },
    { key: 'approved', label: 'อนุมัติแล้ว', icon: '✅', accent: 'emerald', value: approvedCount, hint: 'ปิดรายการแล้ว' },
    { key: 'rejected', label: 'ปฏิเสธ', icon: '🚫', accent: 'red', value: rejectedCount, hint: 'ไม่อนุมัติ' },
  ] as const;

  return (
    <div className={ui.page}>
      <div className={ui.wrap}>

        <PageHero icon="📝" title="จัดการใบเบิกสินค้า" subtitle="ตรวจสอบและอนุมัติใบเบิกจากแต่ละแผนก"
          actions={<button onClick={handleSeeNew} className={newCount > 0 ? ui.heroPrimary : ui.heroBtn}>
            🔄 {newCount > 0 ? `มีใบเบิกใหม่ ${newCount} ใบ · กดเพื่อดู` : 'รีเฟรช'}
          </button>} />

        <div role="group" aria-label="กรองใบเบิกตามสถานะ" className="grid grid-cols-3 gap-3">
          {cards.map((card) => (
            <StatCard key={card.key} label={card.label} icon={card.icon} accent={card.accent} hint={card.hint}
              value={card.value ?? '—'} unit="ใบ" active={filterStatus === card.key}
              onClick={() => handleFilterChange(filterStatus === card.key ? 'all' : card.key)} />
          ))}
        </div>

        <section className={ui.card + ' flex flex-wrap items-center gap-3 p-4'}>
          <SearchBox label="ค้นหาแผนกหรือชื่อผู้เบิก" placeholder="ค้นหาแผนก / ชื่อผู้เบิก..." value={searchTerm} onChange={handleSearchChange} />
          <select aria-label="สถานะใบเบิก" value={filterStatus} onChange={(e) => handleFilterChange(e.target.value as typeof filterStatus)} className={ui.input + ' sm:max-w-48'}>
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รออนุมัติ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
          <p className="ml-auto text-xs font-semibold text-slate-500">พบ <b className="text-[#1a3a6e]">{totalCount.toLocaleString('th-TH')}</b> ใบ{hasFilter && <button type="button" className="ml-3 font-black text-blue-700 hover:underline" onClick={() => { setSearchTerm(''); handleFilterChange('all'); }}>ล้างตัวกรอง</button>}</p>
        </section>

        {loading ? (
          <section className={ui.card}><Skeleton rows={6} /></section>
        ) : Object.keys(groupedRequisitions).length === 0 ? (
          <section className={ui.card}><EmptyState icon="📭" title="ไม่พบใบเบิกในเงื่อนไขที่เลือก" hint={hasFilter ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'ยังไม่มีใบเบิกในระบบ'} /></section>
        ) : (
          <>
            {Object.entries(groupedRequisitions).map(([date, reqs]) => (
              <section key={date} className={ui.card}>
                <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-3">
                  <span aria-hidden="true">🗓️</span>
                  <h2 className="text-sm font-black text-[#1a3a6e]">{date}</h2>
                  <span className="ml-auto text-xs font-bold text-slate-500">{reqs.length} รายการ</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-215 table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-20" />
                      <col className="w-[20%]" />
                      <col className="w-[22%]" />
                      <col className="w-[24%]" />
                      <col className="w-36" />
                      <col className="w-36" />
                    </colgroup>
                    <thead className={ui.thead}>
                      <tr>
                        <th scope="col" className="px-4 py-3.5">เวลา</th>
                        <th scope="col" className="px-4 py-3.5">แผนก / โซน</th>
                        <th scope="col" className="px-4 py-3.5">ผู้เบิก / ผู้ส่ง</th>
                        <th scope="col" className="px-4 py-3.5">หมายเหตุ</th>
                        <th scope="col" className="px-4 py-3.5">สถานะ</th>
                        <th scope="col" className="px-4 py-3.5"><span className="sr-only">ดำเนินการ</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {reqs.map((req) => (
                        <tr key={req.id} className="align-middle transition-colors hover:bg-blue-50/40">
                          <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold tabular-nums text-slate-500">
                            {new Date(req.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-black text-[#1a3a6e]">{req.branch_name}</span>
                            {req.zone_name && <p className="mt-0.5 text-xs font-bold text-blue-700">โซน: {req.zone_name}</p>}
                          </td>
                          <td className="px-4 py-4">
                            <span className="flex items-center gap-2">
                              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{(req.requester_name || '?').trim().slice(0, 1)}</span>
                              <span className="text-slate-700">{req.requester_name}</span>
                            </span>
                            {needsSender(req) && (
                              <p className={'mt-1 text-[11px] font-semibold ' + (req.sender_name ? 'text-blue-800' : 'text-amber-700')}>
                                หัวหน้า / รองหัวหน้า: {req.sender_name?.trim() || 'ยังไม่ระบุ'}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-xs">
                            {req.note?.trim() && (
                              <p title={req.note} className="line-clamp-2 whitespace-pre-wrap wrap-break-word font-semibold text-slate-600">
                                <span className="text-slate-400">ผู้เบิก: </span>{req.note}
                              </p>
                            )}
                            {req.admin_note?.trim() && (
                              <p title={req.admin_note} className="mt-1 line-clamp-2 whitespace-pre-wrap wrap-break-word font-semibold text-blue-800">
                                <span className="text-blue-400">ผู้ตรวจสอบ: </span>{req.admin_note}
                              </p>
                            )}
                            {!req.note?.trim() && !req.admin_note?.trim() && <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={req.status} />
                              {req.status === 'pending' && newSince !== null && Date.parse(req.created_at) > Date.parse(newSince) && !openedIds.has(req.id) && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />ใหม่
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            {req.status === 'pending'
                              ? <button className={ui.rowBtnPrimary} onClick={() => handleViewDetails(req, 'review')}>ตรวจสอบ →</button>
                              : <button className={ui.rowBtn} onClick={() => handleViewDetails(req, 'view')}>ดูรายละเอียด</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <div className={ui.card + ' flex flex-col items-center justify-between gap-3 px-5 py-4 sm:flex-row'}>
              <p className="shrink-0 text-xs font-semibold text-slate-500">
                แสดง {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} จาก {totalCount.toLocaleString('th-TH')} รายการ
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className={ui.rowBtn}>← ก่อนหน้า</button>
                {pageNumbers().map((p, idx) =>
                  p === '…' ? (
                    <span key={`ellipsis-${idx}`} className="select-none px-2 text-sm text-slate-300">…</span>
                  ) : (
                    <button key={p} aria-current={currentPage === p ? 'page' : undefined} onClick={() => goToPage(p as number)}
                      className={'h-9 w-9 rounded-lg text-xs font-bold ' + (currentPage === p ? 'bg-[#1a3a6e] text-white shadow-sm' : 'border border-blue-200 bg-white text-blue-900 hover:bg-blue-50')}>
                      {p}
                    </button>
                  )
                )}
                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className={ui.rowBtn}>ถัดไป →</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ตรวจสอบ / ดูรายละเอียดใบเบิก */}
      {selectedReq && (
        <Modal title={modalMode === 'review' ? '📋 ตรวจสอบใบเบิก' : '📄 รายละเอียดใบเบิก'} busy={saving} onClose={closeReview}
          footer={modalMode === 'review' ? (
            <>
              <span className="mr-auto text-sm font-bold text-blue-900">รวม {details.reduce((sum, d) => sum + (d.price_at_time || 0) * (d.quantity || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
              <button disabled={saving || loadingDetails || Boolean(detailError)} onClick={() => void submitReview('rejected')} className={ui.danger}>ปฏิเสธใบเบิก</button>
              <button disabled={saving || loadingDetails || Boolean(detailError)} onClick={() => void submitReview('approved')} className={ui.button}>{saving ? 'กำลังบันทึก...' : 'อนุมัติรายการที่เลือก'}</button>
            </>
          ) : <button className={ui.secondary} onClick={closeReview}>ปิดหน้าต่าง</button>}>
          {detailError && <div className="mb-4"><Notice tone="error">{detailError}</Notice></div>}
          {loadingDetails ? <Skeleton rows={3} /> : (
            <fieldset disabled={saving} className="min-w-0 space-y-4">
              <div className="rounded-xl bg-blue-50 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-bold">{selectedReq.branch_name}{selectedReq.zone_name && <span className="text-blue-700">· โซน {selectedReq.zone_name}</span>}<StatusBadge status={selectedReq.status} /></p>
                <p className="mt-1 text-slate-500">ผู้เบิก {selectedReq.requester_name} · {new Date(selectedReq.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {needsSender(selectedReq) && (
                  <p className={'mt-2 rounded-lg border p-2 ' + (selectedReq.sender_name ? 'border-blue-100 bg-white text-blue-900' : 'border-amber-200 bg-amber-50 text-amber-800')}>
                    หัวหน้า / รองหัวหน้าผู้ส่ง: <strong>{selectedReq.sender_name?.trim() || 'ยังไม่ระบุ'}</strong>
                  </p>
                )}
              </div>

              <p className="whitespace-pre-wrap wrap-break-word rounded-xl border border-blue-100 p-3 text-sm"><strong>หมายเหตุใบเบิก:</strong> {selectedReq.note || '—'}</p>
              {modalMode === 'review'
                ? <label className="block space-y-1.5"><span className="text-xs font-bold text-blue-800">หมายเหตุผู้ตรวจสอบ</span><textarea maxLength={2000} rows={3} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="เช่น ตัดรายการที่ไม่ให้เบิก หรือเหตุผลไม่อนุมัติ" className={ui.input} /></label>
                : <p className="whitespace-pre-wrap wrap-break-word rounded-xl border border-blue-100 p-3 text-sm"><strong>หมายเหตุผู้ตรวจสอบ:</strong> {selectedReq.admin_note || '—'}</p>}
              <RequestedItems original={selectedReq.requested_items} current={details} status={selectedReq.status} />
              {modalMode === 'review' && originalDetails.some(d => !details.some(x => x.id === d.id)) && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                  <strong className="text-red-700">รายการที่ตัดออก (จะเก็บในประวัติ)</strong>
                  {originalDetails.filter(d => !details.some(x => x.id === d.id)).map(d => <div key={d.id} className="mt-2 flex justify-between gap-3"><span>{d.items?.name} · {d.quantity} {d.items?.unit}</span><button type="button" onClick={() => setDetails(prev => [...prev, d])} className="font-bold text-blue-800 hover:underline">คืนรายการ</button></div>)}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-blue-100">
                <table className="w-full min-w-160 text-left text-sm">
                  <thead className={ui.thead}>
                    <tr>
                      <th className="w-14 px-3 py-3 text-center">ลำดับ</th>
                      <th className="px-3 py-3">รายการสินค้า</th>
                      <th className="w-28 px-3 py-3 text-center">จำนวน</th>
                      <th className="w-20 px-3 py-3 text-center">หน่วย</th>
                      <th className="w-28 px-3 py-3 text-right">ราคา/หน่วย</th>
                      {modalMode === 'review' && <th className="w-16 px-3 py-3"><span className="sr-only">ลบ</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {details.map((d, index) => (
                      <tr key={d.id} className="transition-colors hover:bg-blue-50/40">
                        <td className="px-3 py-3 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <button type="button" disabled={!d.items?.image_url}
                              onClick={() => { if (d.items?.image_url) setSelectedImage({ url: d.items.image_url, name: d.items.name }); }}
                              aria-label={`ขยายรูป ${d.items?.name || 'สินค้า'}`} title={d.items?.image_url ? 'กดเพื่อขยายรูป' : 'ไม่มีรูปสินค้า'}
                              className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-blue-50 enabled:cursor-zoom-in enabled:hover:ring-2 enabled:hover:ring-blue-300 focus-visible:outline-2 focus-visible:outline-blue-700">
                              <span className="text-2xl" aria-hidden="true">📦</span>
                              {d.items?.image_url && <img src={d.items.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
                            </button>
                            <div className="flex flex-1 items-center justify-between gap-2">
                              <span className="wrap-break-word font-bold text-[#1a3a6e]">{d.items?.name || 'ไม่พบข้อมูลสินค้า'}</span>
                              {modalMode === 'review' && (
                                <button type="button" title="เปลี่ยนสินค้าทดแทน" className={ui.rowBtn + ' shrink-0'}
                                  onClick={() => { setActiveDetailId(d.id); setItemSearchTerm(''); setItemSelectorOpen(true); }}>✏️ เปลี่ยน</button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {modalMode === 'review'
                            ? <input type="number" min="1" max="2147483647" step="1" value={d.quantity} aria-label={'จำนวน ' + (d.items?.name || '')} onChange={(e) => handleDetailChange(d.id, e.target.value)} className={ui.input + ' h-11 text-center font-black'} />
                            : <span className="font-black text-[#1a3a6e]">{d.quantity}</span>}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500">{d.items?.unit}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums">{(d.price_at_time || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        {modalMode === 'review' && (
                          <td className="px-3 py-3 text-center"><button type="button" aria-label="ลบรายการนี้ออก" onClick={() => handleDeleteDetail(d.id)} className="px-2 text-sm font-bold text-red-600 hover:underline">ลบ</button></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-blue-100 bg-blue-50/40 font-black text-slate-800">
                      <td colSpan={4} className="px-3 py-3 text-right">รวมเป็นเงินทั้งสิ้น</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#1a3a6e]" colSpan={modalMode === 'review' ? 2 : 1}>
                        {details.reduce((sum, d) => sum + (d.price_at_time || 0) * (d.quantity || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </fieldset>
          )}
        </Modal>
      )}

      {/* เลือกสินค้าทดแทน (เปิดทับ modal ตรวจสอบ จึงต้องเป็น dialog เหมือนกัน) */}
      {itemSelectorOpen && (
        <Modal title="🔍 เลือกสินค้าทดแทน" busy={false} maxWidth="max-w-lg" onClose={() => setItemSelectorOpen(false)}
          footer={<button className={ui.secondary} onClick={() => setItemSelectorOpen(false)}>ยกเลิก</button>}>
          <div className="space-y-3">
            <SearchBox label="ค้นหาสินค้า" placeholder="พิมพ์ชื่อสินค้าเพื่อค้นหา..." value={itemSearchTerm} onChange={setItemSearchTerm} />
            <div className="space-y-2">
              {filteredMasterItems.length === 0 ? <EmptyState icon="📭" title="ไม่พบสินค้าที่ค้นหา" hint="ลองเปลี่ยนคำค้นหา" /> : filteredMasterItems.map((item) => (
                <button key={item.id} type="button" onClick={() => handleSelectReplacementItem(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-blue-100 p-3 text-left transition-colors hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-blue-700">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-blue-50">
                    <span className="text-xl" aria-hidden="true">📦</span>
                    {item.image_url && <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-[#1a3a6e]">{item.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">หน่วย {item.unit} · {(item.price ?? 0).toLocaleString('th-TH')} ฿</span>
                  </span>
                  <span className={ui.rowBtnPrimary + ' shrink-0'}>เลือก</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {selectedImage && (
        <dialog ref={imageDialogRef} aria-label={`รูปสินค้า ${selectedImage.name}`} onClose={() => setSelectedImage(null)}
          onClick={(event) => { if (event.target === event.currentTarget) imageDialogRef.current?.close(); }}
          className="fixed inset-0 m-auto h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/80 open:flex open:items-center open:justify-center">
          <div className="relative max-w-5xl rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl sm:p-5">
            <button type="button" autoFocus aria-label="ปิดรูปขยาย" onClick={() => imageDialogRef.current?.close()}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3a6e] text-xl font-bold text-white shadow-md hover:bg-blue-800">×</button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-h-[75dvh] max-w-full rounded-xl object-contain" />
            <p className="mt-3 text-center text-sm font-bold text-[#1a3a6e]">{selectedImage.name}</p>
          </div>
        </dialog>
      )}
    </div>
  );
}