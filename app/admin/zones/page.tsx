'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DepartmentCodeEditor from '@/components/DepartmentCodeEditor';
import DepartmentCodeList from '@/components/DepartmentCodeList';
import { requestError } from '@/lib/requisitionRules';

interface Branch {
  id: string;
  name: string;
}

interface Zone {
  id: string;
  name: string;
  branch_id: string;
  branch?: { name: string };
}

async function readManagementData() {
 const [zoneResult, branchResult] = await Promise.all([
  supabase.from('zones').select('id, name, branch_id').order('name'),
  supabase.from('branches').select('id, name').order('name'),
 ]);
 if (zoneResult.error) throw zoneResult.error;
 if (branchResult.error) throw branchResult.error;
 return { zones: zoneResult.data ?? [], branches: branchResult.data ?? [] };
}

export default function AdminZonesPage() {
  const [zones, setZones]           = useState<Zone[]>([]);
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [branchName, setBranchName] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);
  const branchBusy = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [codeBranch,setCodeBranch]=useState<Branch|null>(null);
  const [codeMessage,setCodeMessage]=useState('');
  const [showCodes,setShowCodes]=useState(false);
  const [branchCode, setBranchCode] = useState('');
  const [branchCodeConfirm, setBranchCodeConfirm] = useState('');
  const [branchAdminKey, setBranchAdminKey] = useState('');
  const [showBranchCode, setShowBranchCode] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const addBranchDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = addBranchDialog.current;
    if (!element) return;
    if (showAddBranch && !element.open) element.showModal();
    if (!showAddBranch && element.open) element.close();
  }, [showAddBranch]);

  function closeAddBranch() {
    if (branchBusy.current) return;
    setShowAddBranch(false);
    setBranchName(''); setBranchCode(''); setBranchCodeConfirm(''); setBranchAdminKey(''); setShowBranchCode(false);
  }

  // form state
  const [newName, setNewName]       = useState('');
  const [newBranchId, setNewBranchId] = useState('');

  // edit state
  const [editId, setEditId]         = useState<string | null>(null);
  const [editName, setEditName]     = useState('');

  // filter
  const [filterBranch, setFilterBranch] = useState('all');

  // pagination
  const ZONES_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const applyData = useCallback((data: Awaited<ReturnType<typeof readManagementData>>) => {
    setBranches(data.branches);
    setNewBranchId((previous) => data.branches.some((branch) => branch.id === previous) ? previous : data.branches.find((branch) => branch.name === 'จัดเรียง')?.id ?? '');
    setFilterBranch((previous) => previous === 'all' || data.branches.some((branch) => branch.id === previous) ? previous : 'all');
    setZones(data.zones.map((zone) => ({ ...zone, branch: { name: data.branches.find((branch) => branch.id === zone.branch_id)?.name || '—' } })));
    setLoadError('');
    setLoading(false);
  }, []);

  async function loadData() {
    setLoading(true);
    try { applyData(await readManagementData()); }
    catch { setLoadError('โหลดแผนกและโซนไม่สำเร็จ กรุณาลองอีกครั้ง'); setLoading(false); }
  }

  useEffect(() => {
    let alive = true;
    void readManagementData().then((data) => { if (alive) applyData(data); })
      .catch(() => { if (alive) { setLoadError('โหลดแผนกและโซนไม่สำเร็จ กรุณาลองอีกครั้ง'); setLoading(false); } });
    return () => { alive = false; };
  }, [applyData]);

  async function addBranch() {
    const name = branchName.trim();
    const code = branchCode.trim();
    const adminKey = branchAdminKey.trim();
    if (branchBusy.current) return;
    if (!name) { alert('กรุณากรอกชื่อแผนก'); return; }
    if (branches.some((branch) => branch.name.trim().toLowerCase() === name.toLowerCase())) { alert('มีแผนกชื่อนี้แล้ว'); return; }
    if (code.length < 12 || code.length > 100) { alert('รหัสแผนกต้องยาว 12 ถึง 100 ตัวอักษร'); return; }
    if (code !== branchCodeConfirm.trim()) { alert('รหัสแผนกและยืนยันรหัสไม่ตรงกัน'); return; }
    if (adminKey.length < 12) { alert('กรุณากรอกรหัสสต็อกหรือแอดมินกลางให้ครบ'); return; }
    branchBusy.current = true; setSavingBranch(true);
    try {
      const created = await supabase.from('branches').insert({ name }).select('id').single();
      if (created.error || !created.data) { alert('เพิ่มแผนกไม่สำเร็จ: ' + (created.error?.message ?? 'ไม่ทราบสาเหตุ')); return; }
      const branchId = created.data.id as string;

      const coded = await supabase.rpc('admin_set_department_code', { p_admin_key: adminKey, p_branch_id: branchId, p_code: code });
      if (coded.error) {
        // ตั้งรหัสไม่สำเร็จ → ลบแผนกที่เพิ่งสร้าง เพื่อไม่ให้มีแผนกที่ไม่มีรหัสค้างอยู่
        const rollback = await supabase.from('branches').delete().eq('id', branchId);
        const message = requestError(coded.error);
        const reason = /duplicate key|unique constraint/i.test(message) ? 'รหัสนี้ถูกใช้กับแผนกอื่นแล้ว กรุณาใช้รหัสใหม่' : message;
        if (rollback.error) {
          alert('สร้างแผนกแล้วแต่ตั้งรหัสไม่สำเร็จ: ' + reason + '\nกรุณาตั้งรหัสอีกครั้งในหน้าต่างที่เปิดขึ้น');
          setBranchName(''); setBranchCode(''); setBranchCodeConfirm(''); setBranchAdminKey(''); setShowBranchCode(false);
          setShowAddBranch(false);
          await loadData();
          setCodeMessage('');
          setCodeBranch({ id: branchId, name });
        } else {
          alert('ตั้งรหัสไม่สำเร็จ จึงยังไม่ได้สร้างแผนก: ' + reason);
        }
        return;
      }

      setBranchName(''); setBranchCode(''); setBranchCodeConfirm(''); setBranchAdminKey(''); setShowBranchCode(false);
      setShowAddBranch(false);
      setCodeMessage('สร้างแผนก ' + name + ' และตั้งรหัสเข้าใช้งานเรียบร้อยแล้ว');
      await loadData();
    } finally { branchBusy.current = false; setSavingBranch(false); }
  }

  async function removeBranch(branch: Branch) {
    if (branchBusy.current) return;
    if (!window.confirm('ยืนยันลบแผนก “' + branch.name + '”?')) return;
    branchBusy.current = true; setSavingBranch(true);
    try {
      const linked = await supabase.from('zones').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id);
      if (linked.error) { alert('ตรวจสอบโซนไม่สำเร็จ กรุณาลองใหม่'); return; }
      if ((linked.count ?? 0) > 0) { alert('แผนกนี้ยังมีโซน กรุณาจัดการโซนของแผนกก่อนลบ'); return; }
      const { error } = await supabase.from('branches').delete().eq('id', branch.id);
      if (error) { alert('ลบแผนกไม่สำเร็จ: ' + error.message); return; }
      await loadData();
    } finally { branchBusy.current = false; setSavingBranch(false); }
  }

  async function handleAdd() {
    if (!newName.trim()) { alert('กรุณากรอกชื่อโซน'); return; }
    if (!newBranchId)    { alert('กรุณาเลือกแผนก'); return; }
    setSaving(true);
    const { error } = await supabase.from('zones').insert([{ name: newName.trim(), branch_id: newBranchId }]);
    setSaving(false);
    if (error) { alert('เกิดข้อผิดพลาด: ' + error.message); return; }
    setNewName('');
    loadData();
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) { alert('กรุณากรอกชื่อโซน'); return; }
    setSaving(true);
    const { error } = await supabase.from('zones').update({ name: editName.trim() }).eq('id', id);
    setSaving(false);
    if (error) { alert('เกิดข้อผิดพลาด: ' + error.message); return; }
    setEditId(null);
    loadData();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบโซน "${name}" ใช่ไหม?`)) return;
    const { error } = await supabase.from('zones').delete().eq('id', id);
    if (error) { alert('เกิดข้อผิดพลาด: ' + error.message); return; }
    loadData();
  }

  // ── ฟังก์ชันลากวาง (Drag and Drop สลับตำแหน่งบนหน้าจอ) ──
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    // สลับตำแหน่งใน State ทันทีเพื่อให้แสดงผลลื่นไหล
    const updatedZones = [...zones];
    const filtered = filteredZones;
    const movedItem = filtered[draggedIndex];
    
    // หาตำแหน่งจริงใน zones ทั้งหมดแล้วสลับ
    const realIndexFrom = zones.findIndex(z => z.id === movedItem.id);
    const realIndexTo = zones.findIndex(z => z.id === filtered[targetIndex].id);

    if (realIndexFrom !== -1 && realIndexTo !== -1) {
      const [removed] = updatedZones.splice(realIndexFrom, 1);
      updatedZones.splice(realIndexTo, 0, removed);
      setZones(updatedZones);
    }
    setDraggedIndex(null);
  };

  const filteredZones = filterBranch === 'all'
    ? zones
    : zones.filter((z) => z.branch_id === filterBranch);

  const totalPages = Math.max(1, Math.ceil(filteredZones.length / ZONES_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pagedZones = filteredZones.slice(
    (visiblePage - 1) * ZONES_PER_PAGE,
    visiblePage * ZONES_PER_PAGE,
  );

  function handleFilterChange(val: string) {
    setFilterBranch(val);
    setCurrentPage(1);
  }

  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">


        <div className="relative bg-white border border-blue-100/80 rounded-2xl overflow-hidden shadow-sm p-6">
          <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-[#1a3a6e] via-[#c8a230] to-[#1a3a6e]" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">🗂️</span>
            <div>
              <h1 className="text-xl font-black text-slate-800">จัดการแผนกและโซน</h1>
              <p className="text-xs text-blue-700 font-bold mt-0.5">คลิกเมาส์ค้างที่แถบโซนแล้วลากเพื่อสลับลำดับได้ตามต้องการ</p>
            </div>
          </div>
        </div>

        {showCodes&&<DepartmentCodeList onClose={()=>setShowCodes(false)} onEdit={branch=>{setCodeMessage('');setCodeBranch(branch);}}/>}
        {codeBranch&&<DepartmentCodeEditor branch={codeBranch} onClose={()=>setCodeBranch(null)} onSaved={setCodeMessage}/>}
        {codeMessage&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{codeMessage}</p>}
        {loadError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{loadError}</span><button onClick={() => void loadData()} className="font-bold">ลองใหม่</button></div>}
        <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-black text-[#1a3a6e]">🏬 จัดการแผนก</h2>
            <p className="mt-1 text-xs text-slate-500">ทั้งหมด {branches.length} แผนก · เพิ่มแผนกและดูโซนที่เกี่ยวข้อง</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={loading} onClick={() => setShowAddBranch(true)} className="rounded-xl bg-[#1a3a6e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">+ เพิ่มแผนกใหม่</button>
              <button type="button" onClick={()=>setShowCodes(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-blue-100">ดูรหัสทุกแผนก</button>
            </div>
          </div>
          <dialog ref={addBranchDialog} onCancel={(event) => { event.preventDefault(); closeAddBranch(); }} onClose={() => setShowAddBranch(false)} aria-labelledby="add-branch-title" className="m-auto max-h-[90dvh] w-[min(95vw,640px)] rounded-2xl border border-blue-100 p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/40">
          <form className="flex max-h-[90dvh] flex-col" onSubmit={(event) => { event.preventDefault(); void addBranch(); }}>
            <header className="flex shrink-0 items-center justify-between gap-3 bg-[#1a3a6e] p-5 text-white">
              <div><h3 id="add-branch-title" className="font-black">➕ เพิ่มแผนกใหม่ พร้อมตั้งรหัสเข้าใช้งาน</h3><p className="mt-1 text-xs text-blue-100">ถ้าตั้งรหัสไม่สำเร็จ ระบบจะไม่สร้างแผนกนี้ให้</p></div>
              <button type="button" disabled={savingBranch} aria-label="ปิดหน้าเพิ่มแผนก" onClick={closeAddBranch} className="rounded-full bg-white/20 px-3 py-1 text-lg disabled:opacity-40">×</button>
            </header>
            <div className="space-y-3 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-blue-900">ชื่อแผนกใหม่
                <input required disabled={savingBranch || loading} value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="ชื่อแผนกใหม่..." className="mt-1 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50" />
              </label>
              <label className="block text-xs font-bold text-blue-900">รหัสสต็อก / รหัสแอดมินกลาง (ใช้ยืนยันการตั้งรหัส)
                <input required autoComplete="off" type="password" minLength={12} maxLength={100} disabled={savingBranch || loading} value={branchAdminKey} onChange={(event) => setBranchAdminKey(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50" />
              </label>
              <label className="block text-xs font-bold text-blue-900">รหัสเข้าใช้งานของแผนก (12–100 ตัวอักษร)
                <input required autoComplete="new-password" type={showBranchCode ? 'text' : 'password'} minLength={12} maxLength={100} disabled={savingBranch || loading} value={branchCode} onChange={(event) => setBranchCode(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50" />
              </label>
              <label className="block text-xs font-bold text-blue-900">ยืนยันรหัสของแผนก
                <input required autoComplete="new-password" type={showBranchCode ? 'text' : 'password'} minLength={12} maxLength={100} disabled={savingBranch || loading} value={branchCodeConfirm} onChange={(event) => setBranchCodeConfirm(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showBranchCode} onChange={(event) => setShowBranchCode(event.target.checked)} />
              แสดงรหัสแผนก
            </label>
            <p className="text-xs text-slate-500">ถ้าตั้งรหัสไม่สำเร็จ (เช่น รหัสซ้ำกับแผนกอื่น) ระบบจะไม่สร้างแผนกนี้ให้</p>
            </div>
            <footer className="flex shrink-0 justify-end gap-3 border-t border-blue-100 bg-white p-4">
              <button type="button" disabled={savingBranch} onClick={closeAddBranch} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-bold text-blue-900 disabled:opacity-40">ยกเลิก</button>
              <button disabled={savingBranch || loading} className="rounded-xl bg-[#1a3a6e] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{savingBranch ? 'กำลังบันทึก...' : '+ เพิ่มแผนกและตั้งรหัส'}</button>
            </footer>
          </form>
          </dialog>
          <div className="mt-5 grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => <div key={branch.id} className="flex flex-col items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3">
              <div className="min-w-0"><p className="break-words text-sm font-bold text-slate-800">{branch.name}</p><p className="mt-1 text-xs text-slate-500">{zones.filter((zone) => zone.branch_id === branch.id).length} โซน</p></div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2"><button onClick={() => { handleFilterChange(branch.id); document.getElementById('zone-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs font-bold text-blue-800">ดูโซน</button><button disabled={savingBranch || saving} onClick={() => void removeBranch(branch)} className="rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50">ลบ</button></div>
            </div>)}
            {!loading && branches.length === 0 && <p className="py-5 text-sm text-slate-400">ยังไม่มีแผนก เพิ่มแผนกก่อนสร้างโซน</p>}
          </div>
        </section>

        {/* ── Add Zone Form ── */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <h2 className="text-sm font-black text-blue-700 uppercase tracking-widest mb-4">➕ เพิ่มโซนใหม่</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-48 shrink-0">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">แผนก</label>
              <div className="relative">
                <select
                  value={newBranchId}
                  onChange={(e) => setNewBranchId(e.target.value)}
                  className="block w-full py-2.5 pl-3.5 pr-8 bg-white border border-slate-200 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 rounded-xl text-sm font-semibold text-slate-700 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">— เลือกแผนก —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-blue-400 text-[10px]">▼</span>
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">ชื่อโซน</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="เช่น ของเล่น, เสื้อผ้า, เครื่องใช้ไฟฟ้า"
                className="block w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 rounded-xl text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 bg-linear-to-r from-[#1a3a6e] to-[#2451a0] text-white rounded-xl font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow-md shadow-blue-700/20 disabled:opacity-50"
              >
                {saving ? '...' : '+ เพิ่ม'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Zone List ── */}
        <div id="zone-list" className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-blue-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-700">
              โซนทั้งหมด <span className="text-blue-500 ml-1">{filteredZones.length}</span>
              <span className="text-xs text-slate-400 font-normal ml-2">(💡 สามารถคลิกเมาส์ค้างแล้วลากแถวเพื่อสลับลำดับได้)</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">กรองแผนก:</span>
              <div className="relative">
                <select
                  value={filterBranch}
                  onChange={(e) => handleFilterChange(e.target.value)}
                  className="pl-3 pr-7 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-800 outline-none appearance-none cursor-pointer"
                >
                  <option value="all">ทุกแผนก</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-blue-400 text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm font-bold">กำลังโหลด...</div>
          ) : filteredZones.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-4xl block mb-2 opacity-20">🗂️</span>
              <p className="text-slate-400 text-sm font-bold">ยังไม่มีโซน</p>
              <p className="text-slate-300 text-xs mt-1">เพิ่มโซนด้านบนได้เลย</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {pagedZones.map((zone, pageIdx) => {
                const absoluteIdx = (visiblePage - 1) * ZONES_PER_PAGE + pageIdx;
                const itemIndex = absoluteIdx + 1;

                return (
                  <div
                    key={zone.id}
                    draggable={editId !== zone.id}
                    onDragStart={(e) => handleDragStart(e, absoluteIdx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, absoluteIdx)}
                    className={`p-4 flex items-center gap-4 transition-all ${
                      editId !== zone.id ? 'cursor-grab active:cursor-grabbing hover:bg-blue-50/60' : 'bg-blue-50/20'
                    }`}
                  >
                    <div className="text-slate-300 hover:text-slate-500 shrink-0 select-none" title="คลิกค้างเพื่อลากเปลี่ยนลำดับ">
                      ⠿
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-base">🗂️</span>
                    </div>

                    {editId === zone.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(zone.id); if (e.key === 'Escape') setEditId(null); }}
                        autoFocus
                        className="flex-1 py-1.5 px-3 border border-blue-400 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm">
                          {itemIndex}. {zone.name}
                        </p>
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">
                          แผนก: {zone.branch?.name || '—'}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      {editId === zone.id ? (
                        <>
                          <button onClick={() => handleEdit(zone.id)} disabled={saving}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black hover:bg-blue-700 active:scale-95 transition-all">
                            บันทึก
                          </button>
                          <button onClick={() => setEditId(null)}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-200 active:scale-95 transition-all">
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(zone.id); setEditName(zone.name); }}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-black hover:bg-blue-100 active:scale-95 transition-all"
                          >
                            ✏️ แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(zone.id, zone.name)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-black hover:bg-red-100 active:scale-95 transition-all"
                          >
                            🗑️ ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-4 bg-white border-t border-blue-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                หน้า {visiblePage} จาก {totalPages} ({filteredZones.length} โซน)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={visiblePage === 1}
                  onClick={() => setCurrentPage(visiblePage - 1)}
                  className="px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-100 transition-all"
                >
                  ก่อนหน้า
                </button>
                <button
                  disabled={visiblePage === totalPages}
                  onClick={() => setCurrentPage(visiblePage + 1)}
                  className="px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-100 transition-all"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}