'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

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

export default function AdminZonesPage() {
  const [zones, setZones]           = useState<Zone[]>([]);
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  // form state
  const [newName, setNewName]       = useState('');
  const [newBranchId, setNewBranchId] = useState('');

  // edit state
  const [editId, setEditId]         = useState<string | null>(null);
  const [editName, setEditName]     = useState('');

  // filter
  const [filterBranch, setFilterBranch] = useState('all');

  async function loadData() {
    setLoading(true);
    const [{ data: zonesData }, { data: branchesData }] = await Promise.all([
      supabase.from('zones').select('id, name, branch_id').order('name'),
      supabase.from('branches').select('id, name').order('name'),
    ]);
    if (branchesData) {
      setBranches(branchesData);
      const sorting = branchesData.find((b) => b.name === 'จัดเรียง');
      if (sorting) setNewBranchId(sorting.id);
    }
    if (zonesData && branchesData) {
      // ต่อชื่อแผนกเข้าไปเอง แทนที่จะใช้ join ที่อาจ error
      const zonesWithBranch = zonesData.map((z) => ({
        ...z,
        branch: { name: branchesData.find((b) => b.id === z.branch_id)?.name || '—' },
      }));
      setZones(zonesWithBranch as Zone[]);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

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

  const filteredZones = filterBranch === 'all'
    ? zones
    : zones.filter((z) => z.branch_id === filterBranch);

  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Nav ── */}
        <nav className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-sm shadow-blue-100/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden border border-blue-100">
              <img src="/Logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-black text-slate-800 text-sm tracking-tight">สำเพ็ง บุรีรัมย์</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <Link href="/admin/dashboard" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📊 แดชบอร์ด</Link>
            <Link href="/admin/requisitions" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📝 ใบเบิก</Link>
            <Link href="/admin/reports" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📈 รายงาน</Link>
            <Link href="/admin/inventory" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📦 คลัง</Link>
            <Link href="/admin/zones" className="bg-white text-blue-900 shadow-sm shadow-blue-100 px-4 py-2 rounded-lg transition-all">🗂️ โซน</Link>
          </div>
        </nav>

        {/* ── Header ── */}
        <div className="relative bg-white border border-blue-100/80 rounded-2xl overflow-hidden shadow-sm p-6">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#1a3a6e] via-[#c8a230] to-[#1a3a6e]" />
          <div className="flex items-center gap-3">
            <span className="text-3xl">🗂️</span>
            <div>
              <h1 className="text-xl font-black text-slate-800">จัดการโซน</h1>
              <p className="text-xs text-blue-700 font-bold mt-0.5">เพิ่ม / แก้ไข / ลบ โซนสำหรับแต่ละแผนก</p>
            </div>
          </div>
        </div>

        {/* ── Add Zone Form ── */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <h2 className="text-sm font-black text-blue-700 uppercase tracking-widest mb-4">➕ เพิ่มโซนใหม่</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* เลือกแผนก */}
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

            {/* ชื่อโซน */}
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
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#1a3a6e] to-[#2451a0] text-white rounded-xl font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow-md shadow-blue-700/20 disabled:opacity-50"
              >
                {saving ? '...' : '+ เพิ่ม'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Zone List ── */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          {/* filter bar */}
          <div className="p-4 border-b border-blue-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-700">
              โซนทั้งหมด <span className="text-blue-500 ml-1">{filteredZones.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">กรองแผนก:</span>
              <div className="relative">
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
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
              {filteredZones.map((zone) => (
                <div key={zone.id} className="p-4 flex items-center gap-4 hover:bg-blue-50/30 transition-colors group">
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
                      <p className="font-bold text-slate-800 text-sm">{zone.name}</p>
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">
                        แผนก: {(zone.branch as any)?.name || '—'}
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
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-black hover:bg-blue-100 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        >
                          ✏️ แก้ไข
                        </button>
                        <button
                          onClick={() => handleDelete(zone.id, zone.name)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-black hover:bg-red-100 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        >
                          🗑️ ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}