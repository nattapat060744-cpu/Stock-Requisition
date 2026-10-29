'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DepartmentCodeEditor from '@/components/DepartmentCodeEditor';
import DepartmentCodeList from '@/components/DepartmentCodeList';
import { requestError } from '@/lib/requisitionRules';
import { ui, PageHero, Notice, StatCard, Field, EmptyState, Skeleton, Pagination, Modal } from '@/components/AdminUI';

interface Branch {
  id: string;
  name: string;
}

interface Zone {
  id: string;
  name: string;
  branch_id: string;
  sort_order: number | null;
  branch?: { name: string };
}

async function readManagementData() {
  const [zoneResult, branchResult] = await Promise.all([
    supabase.from('zones').select('id, name, branch_id, sort_order').order('sort_order', { ascending: true, nullsFirst: false }).order('name'),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
  ]);
  if (zoneResult.error) throw zoneResult.error;
  if (branchResult.error) throw branchResult.error;
  const branches = branchResult.data ?? [];
  const activeIds = new Set(branches.map((branch) => branch.id));
  return { zones: (zoneResult.data ?? []).filter((zone) => activeIds.has(zone.branch_id)), branches };
}

export default function AdminZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);
  const branchBusy = useRef(false);
  const orderBusy = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [codeBranch, setCodeBranch] = useState<Branch | null>(null);
  const [codeMessage, setCodeMessage] = useState('');
  const [showCodes, setShowCodes] = useState(false);
  const [branchCode, setBranchCode] = useState('');
  const [branchCodeConfirm, setBranchCodeConfirm] = useState('');
  const [branchAdminKey, setBranchAdminKey] = useState('');
  const [showBranchCode, setShowBranchCode] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);

  function closeAddBranch() {
    if (branchBusy.current) return;
    setShowAddBranch(false);
    setBranchName(''); setBranchCode(''); setBranchCodeConfirm(''); setBranchAdminKey(''); setShowBranchCode(false);
  }

  // form state
  const [newName, setNewName] = useState('');
  const [newBranchId, setNewBranchId] = useState('');

  // edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
      const created = await supabase.rpc('admin_create_department', { p_admin_key: adminKey, p_name: name, p_code: code });
      if (created.error) {
        const message = requestError(created.error);
        const reason = /duplicate key|unique constraint/i.test(message) ? 'ชื่อแผนกหรือรหัสนี้ถูกใช้แล้ว กรุณาตรวจสอบอีกครั้ง' : message;
        alert('เพิ่มแผนกไม่สำเร็จ (ยังไม่ได้สร้างแผนก): ' + reason);
        return;
      }

      setBranchName(''); setBranchCode(''); setBranchCodeConfirm(''); setBranchAdminKey(''); setShowBranchCode(false);
      setShowAddBranch(false);
      setCodeMessage('สร้างแผนก ' + name + ' และตั้งรหัสเข้าใช้งานเรียบร้อยแล้ว');
      await loadData();
    } finally { branchBusy.current = false; setSavingBranch(false); }
  }

  async function deactivateBranch(branch: Branch) {
    if (branchBusy.current) return;
    if (!window.confirm('ปิดใช้งานแผนก “' + branch.name + '”?\nแผนกจะหายจากรายการนี้ แต่ประวัติและรายงานย้อนหลังยังอยู่')) return;
    branchBusy.current = true; setSavingBranch(true);
    try {
      const { error } = await supabase.from('branches').update({ is_active: false, deactivated_at: new Date().toISOString() }).eq('id', branch.id);
      if (error) { alert('ปิดใช้งานแผนกไม่สำเร็จ: ' + error.message); return; }
      await loadData();
    } finally { branchBusy.current = false; setSavingBranch(false); }
  }

  async function handleAdd() {
    if (!newName.trim()) { alert('กรุณากรอกชื่อโซน'); return; }
    if (!newBranchId) { alert('กรุณาเลือกแผนก'); return; }
    setSaving(true);
    const nextOrder = Math.max(0, ...zones.map((zone) => zone.sort_order ?? 0)) + 1;
    const { error } = await supabase.from('zones').insert([{ name: newName.trim(), branch_id: newBranchId, sort_order: nextOrder }]);
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

  // ── ลากวางเพื่อเรียงลำดับ (บันทึกลงฐานข้อมูลผ่าน reorder_zones) ──
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const from = draggedIndex;
    setDraggedIndex(null);
    if (from === null || from === targetIndex || orderBusy.current) return;

    // จัดลำดับใหม่เฉพาะรายการที่กรองอยู่ แล้วใส่กลับตามช่องเดิมในรายการเต็ม
    const reordered = [...filteredZones];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    let cursor = 0;
    const next = zones
      .map((zone) => (filterBranch === 'all' || zone.branch_id === filterBranch ? reordered[cursor++] : zone))
      .map((zone, index) => ({ ...zone, sort_order: index + 1 }));

    const previous = zones;
    setZones(next); // แสดงผลทันที
    orderBusy.current = true;
    try {
      const { error } = await supabase.rpc('reorder_zones', { p_ids: next.map((zone) => zone.id) });
      if (error) {
        setZones(previous);
        alert('บันทึกลำดับโซนไม่สำเร็จ: ' + error.message);
      }
    } finally { orderBusy.current = false; }
  };

  const filteredZones = filterBranch === 'all' ? zones : zones.filter((z) => z.branch_id === filterBranch);

  const totalPages = Math.max(1, Math.ceil(filteredZones.length / ZONES_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pagedZones = filteredZones.slice((visiblePage - 1) * ZONES_PER_PAGE, visiblePage * ZONES_PER_PAGE);

  function handleFilterChange(val: string) {
    setFilterBranch(val);
    setCurrentPage(1);
  }

  return (
    <div className={ui.page}>
      <div className={ui.wrap}>

        <PageHero icon="🗂️" title="จัดการแผนกและโซน" subtitle="ลากแถวโซนเพื่อสลับลำดับ · ลำดับจะถูกบันทึกอัตโนมัติ"
          actions={<>
            <button type="button" onClick={() => setShowCodes(true)} className={ui.heroBtn}>🔑 ดูรหัสทุกแผนก</button>
            <button type="button" disabled={loading} onClick={() => setShowAddBranch(true)} className={ui.heroPrimary}>+ เพิ่มแผนกใหม่</button>
          </>} />

        {showCodes && <DepartmentCodeList onClose={() => setShowCodes(false)} onEdit={branch => { setCodeMessage(''); setCodeBranch(branch); }} />}
        {codeBranch && <DepartmentCodeEditor branch={codeBranch} onClose={() => setCodeBranch(null)} onSaved={setCodeMessage} />}
        {codeMessage && <Notice tone="success" onClose={() => setCodeMessage('')}>{codeMessage}</Notice>}
        {loadError && <Notice tone="error" action={<button onClick={() => void loadData()} className="font-bold underline">ลองใหม่</button>}>{loadError}</Notice>}

        <div className="grid grid-cols-2 gap-3">
          <StatCard accent="blue" icon="🏬" label="แผนกที่เปิดใช้งาน" value={branches.length} unit="แผนก" hint="ทั้งหมดในระบบ" />
          <StatCard accent="emerald" icon="🗂️" label="โซนทั้งหมด" value={zones.length} unit="โซน" hint="รวมทุกแผนก" />
        </div>

        <section className={ui.card}>
          <div className="border-b border-blue-100 p-4">
            <h2 className="font-black text-[#1a3a6e]">แผนกทั้งหมด</h2>
            <p className="mt-0.5 text-xs text-slate-500">ดูโซนของแต่ละแผนก หรือปิดใช้งานแผนกที่ไม่ใช้แล้ว (ประวัติและรายงานย้อนหลังยังอยู่)</p>
          </div>
          {loading ? <Skeleton rows={3} /> : branches.length === 0 ? <EmptyState icon="🏬" title="ยังไม่มีแผนก" hint="กด “+ เพิ่มแผนกใหม่” ก่อนสร้างโซน" /> : (
            <div className="grid max-h-80 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((branch) => (
                <div key={branch.id} className={'flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 transition-colors hover:bg-blue-50/40 ' + (filterBranch === branch.id ? 'border-blue-300 ring-2 ring-[#1a3a6e]/40' : 'border-blue-100')}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-800">{branch.name.trim().slice(0, 1)}</span>
                    <div className="min-w-0"><p className="wrap-break-word text-sm font-black text-[#1a3a6e]">{branch.name}</p><p className="text-xs text-slate-500">{zones.filter((zone) => zone.branch_id === branch.id).length} โซน</p></div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button className={ui.rowBtn} onClick={() => { handleFilterChange(branch.id); document.getElementById('zone-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>ดูโซน</button>
                    <button className={ui.rowBtnDanger} disabled={savingBranch || saving} onClick={() => void deactivateBranch(branch)}>ปิดใช้งาน</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {showAddBranch && (
          <Modal title="➕ เพิ่มแผนกใหม่ พร้อมตั้งรหัสเข้าใช้งาน" busy={savingBranch} onClose={closeAddBranch} maxWidth="max-w-2xl"
            footer={<>
              <span className="mr-auto text-xs text-slate-500">ถ้าตั้งรหัสไม่สำเร็จ ระบบจะไม่สร้างแผนกนี้ให้</span>
              <button type="button" disabled={savingBranch} onClick={closeAddBranch} className={ui.secondary}>ยกเลิก</button>
              <button type="button" disabled={savingBranch || loading} onClick={() => void addBranch()} className={ui.button}>{savingBranch ? 'กำลังบันทึก...' : '+ เพิ่มแผนกและตั้งรหัส'}</button>
            </>}>
            <form onSubmit={(event) => { event.preventDefault(); void addBranch(); }}>
              <fieldset disabled={savingBranch || loading} className="min-w-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="ชื่อแผนกใหม่ *"><input required value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="ชื่อแผนกใหม่..." className={ui.input} /></Field>
                  <Field label="รหัสสต็อก / รหัสแอดมินกลาง *"><input required autoComplete="off" type="password" minLength={12} maxLength={100} value={branchAdminKey} onChange={(event) => setBranchAdminKey(event.target.value)} className={ui.input} /></Field>
                  <Field label="รหัสเข้าใช้งานของแผนก (12–100 ตัวอักษร) *"><input required autoComplete="new-password" type={showBranchCode ? 'text' : 'password'} minLength={12} maxLength={100} value={branchCode} onChange={(event) => setBranchCode(event.target.value)} className={ui.input} /></Field>
                  <Field label="ยืนยันรหัสของแผนก *"><input required autoComplete="new-password" type={showBranchCode ? 'text' : 'password'} minLength={12} maxLength={100} value={branchCodeConfirm} onChange={(event) => setBranchCodeConfirm(event.target.value)} className={ui.input} /></Field>
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showBranchCode} onChange={(event) => setShowBranchCode(event.target.checked)} className="h-4 w-4 accent-blue-700" />แสดงรหัสแผนก</label>
                <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">รหัสสต็อก/แอดมินกลางใช้ยืนยันการตั้งรหัส · ถ้ารหัสซ้ำกับแผนกอื่น ระบบจะไม่สร้างแผนกให้</div>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
              </fieldset>
            </form>
          </Modal>
        )}

        {/* ── เพิ่มโซน ── */}
        <section className={ui.card + ' p-4 sm:p-5'}>
          <h2 className="mb-4 font-black text-[#1a3a6e]">➕ เพิ่มโซนใหม่</h2>
          <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <Field label="แผนก *">
              <select value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)} className={ui.input + ' cursor-pointer'}>
                <option value="">— เลือกแผนก —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="ชื่อโซน *">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} placeholder="เช่น ของเล่น, เสื้อผ้า, เครื่องใช้ไฟฟ้า" className={ui.input} />
            </Field>
            <button onClick={handleAdd} className={ui.button}>{saving ? 'กำลังบันทึก...' : '+ เพิ่มโซน'}</button>
          </fieldset>
        </section>

        {/* ── รายการโซน ── */}
        <section id="zone-list" className={ui.card}>
          <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 p-4">
            <select aria-label="กรองตามแผนก" value={filterBranch} onChange={(e) => handleFilterChange(e.target.value)} className={ui.input + ' cursor-pointer sm:max-w-56'}>
              <option value="all">ทุกแผนก</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <p className="ml-auto text-xs font-semibold text-slate-500">แสดง <b className="text-[#1a3a6e]">{filteredZones.length}</b> จาก {zones.length} โซน{filterBranch !== 'all' && <button type="button" className="ml-3 font-black text-blue-700 hover:underline" onClick={() => handleFilterChange('all')}>ล้างตัวกรอง</button>}</p>
          </div>

          {loading ? <Skeleton rows={5} /> : filteredZones.length === 0 ? (
            <EmptyState icon="🗂️" title="ยังไม่มีโซน" hint="เพิ่มโซนจากฟอร์มด้านบนได้เลย" />
          ) : (
            <ul className="divide-y divide-blue-50">
              {pagedZones.map((zone, pageIdx) => {
                const absoluteIdx = (visiblePage - 1) * ZONES_PER_PAGE + pageIdx;
                const editing = editId === zone.id;
                return (
                  <li
                    key={zone.id}
                    draggable={!editing}
                    onDragStart={(e) => handleDragStart(e, absoluteIdx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, absoluteIdx)}
                    className={'flex items-center gap-4 px-4 py-3.5 transition-colors ' + (editing ? 'bg-blue-50/40' : 'cursor-grab hover:bg-blue-50/40 active:cursor-grabbing')}
                  >
                    <span aria-hidden="true" title="ลากเพื่อเปลี่ยนลำดับ" className="shrink-0 select-none text-slate-300">⠿</span>
                    <span className="w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{absoluteIdx + 1}</span>

                    {editing ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="ชื่อโซน"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(zone.id); if (e.key === 'Escape') setEditId(null); }}
                        autoFocus className={ui.input + ' flex-1'} />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-[#1a3a6e]">{zone.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">แผนก {zone.branch?.name || '—'}</p>
                      </div>
                    )}

                    <div className="flex shrink-0 items-center gap-2">
                      {editing ? (
                        <>
                          <button onClick={() => handleEdit(zone.id)} disabled={saving} className={ui.rowBtnPrimary}>บันทึก</button>
                          <button onClick={() => setEditId(null)} className={ui.rowBtn}>ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(zone.id); setEditName(zone.name); }} className={ui.rowBtn}>แก้ไข</button>
                          <button onClick={() => handleDelete(zone.id, zone.name)} className={ui.rowBtnDanger}>ลบ</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination page={visiblePage} totalPages={totalPages} total={filteredZones.length} unit="โซน" onChange={setCurrentPage} />
        </section>

      </div>
    </div>
  );
}