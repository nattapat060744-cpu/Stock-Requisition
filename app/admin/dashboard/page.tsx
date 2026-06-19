'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7));
  const [selectedItem, setSelectedItem] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<{ name: string; unit: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: branchesData } = await supabase.from('branches').select('name').order('name');
      const { data: itemsData } = await supabase.from('items').select('name, unit, price').order('name');

      const { data: rawData } = await supabase
        .from('requisition_details')
        .select(`
          quantity,
          price_at_time,
          requisitions (branch_name, created_at, status),
          items (name, unit)
        `);

      if (branchesData) setAllBranches(branchesData.map((b) => b.name));
      if (itemsData) {
        const uniqueItems = Array.from(
          new Map(itemsData.map((i) => [`${i.name}-${i.unit}`, { name: i.name, unit: i.unit }])).values()
        );
        setAllItems(uniqueItems);
      }
      // กรองเฉพาะ approved และ join ครบ
      if (rawData) {
        setData(
          rawData.filter(
            (d: any) =>
              d.requisitions &&
              d.items &&
              d.requisitions.status === 'approved'
          )
        );
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredData = data.filter((d) =>
    d.requisitions.created_at?.startsWith(selectedDate)
  );

  const getDetails = (branch: string, itemName: string) => {
    const records = filteredData.filter(
      (d) => d.requisitions.branch_name === branch && d.items.name === itemName
    );
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce(
      (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
      0
    );
    return { qty, total };
  };

  const getBranchTotal = (branch: string) =>
    filteredData
      .filter((d) => d.requisitions.branch_name === branch)
      .reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);

  const getTotalByItem = (itemName: string) => {
    const records = filteredData.filter((d) => d.items.name === itemName);
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce(
      (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
      0
    );
    return { qty, total };
  };

  const totalBudget = filteredData.reduce(
    (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
    0
  );

  const displayedItems = selectedItem
    ? allItems.filter((i) => i.name === selectedItem)
    : allItems;

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-[#c8a230] animate-spin" />
          <p className="text-blue-700 font-bold text-base tracking-wide">กำลังประมวลผลข้อมูล...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Navbar ── */}
        <nav className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-sm shadow-blue-100/50 flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-blue-200/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-4 left-16 w-20 h-20 bg-blue-100/20 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shadow-md shadow-blue-700/10 overflow-hidden border border-blue-200">
              <img src="/Logo.png" alt="logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-xl font-black tracking-tight text-slate-800 leading-tight">สำเพ็ง บุรีรัมย์</p>
              <p className="text-xs font-bold text-blue-700 mt-0.5 uppercase tracking-widest">ระบบจัดการเบิกของ สำเพ็ง บุรีรัมย์</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold bg-blue-50 p-1 rounded-xl border border-blue-100/80">
            <Link href="/admin/dashboard" className="bg-white text-blue-900 shadow-sm shadow-blue-100 px-4 py-2 rounded-lg transition-all">📊 แดชบอร์ด</Link>
            <Link href="/admin/requisitions" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📝 ใบเบิก</Link>
            <Link href="/admin/reports" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📈 รายงาน</Link>
            <Link href="/admin/inventory" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">📦 คลัง</Link>
            <Link href="/admin/zones" className="px-4 py-2 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-white/70 transition-all">🗂️ โซน</Link>
          </div>
        </nav>

        {/* ── Header + Filters ── */}
        <div className="bg-white p-5 rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">📊 แดชบอร์ดภาพรวม</h1>
            <p className="text-xs font-semibold text-blue-700 mt-1 uppercase tracking-widest">สรุปการเบิกสินค้าแต่ละสาขา</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* เลือกเดือน */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-blue-700 uppercase tracking-wider hidden sm:block">เดือน</label>
              <input
                type="month"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-10 px-3 border border-blue-100 rounded-xl bg-blue-50/50 text-sm font-semibold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
              />
            </div>

            {/* เลือกสินค้า */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-blue-700 uppercase tracking-wider hidden sm:block">สินค้า</label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="h-10 px-3 border border-blue-100 rounded-xl bg-blue-50/50 text-sm font-semibold text-slate-700 w-44 outline-none cursor-pointer focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
              >
                <option value="">— ทุกสินค้า —</option>
                {allItems.map((item, i) => (
                  <option key={i} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>

            {/* ยอดรวม */}
            <div className="flex items-center gap-2.5 bg-linear-to-r from-blue-700 to-blue-800 px-4 py-2.5 rounded-xl shadow-md shadow-blue-700/30 ml-auto sm:ml-0">
              <span className="text-blue-200 text-xs font-bold uppercase tracking-wider">งบรวมทั้งสิ้น</span>
              <span className="text-white font-black text-base">{totalBudget.toLocaleString()} ฿</span>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 overflow-hidden">
          {allBranches.length === 0 || displayedItems.length === 0 ? (
            <div className="py-20 text-center text-blue-400 font-bold text-base">
              ไม่มีข้อมูลในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="p-4 border-b-2 border-r border-blue-100 text-left font-black text-blue-700 uppercase tracking-wider sticky left-0 bg-blue-50/80 z-20 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.1)] min-w-40">
                      🏬 สาขา
                    </th>
                    {displayedItems.map((item, i) => (
                      <th key={i} className="p-4 border-b-2 border-r border-blue-100 min-w-35 text-center font-black text-blue-700 uppercase tracking-wide bg-blue-50/80">
                        <span className="block">{item.name}</span>
                        <span className="text-xs text-blue-400 font-semibold normal-case tracking-normal">({item.unit})</span>
                      </th>
                    ))}
                    <th className="p-4 border-b-2 border-blue-100 text-right font-black text-blue-700 uppercase tracking-wider min-w-35 bg-blue-50/80">
                      รวมสาขา
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allBranches.map((branch, branchIdx) => (
                    <tr key={branch} className={`group transition-colors hover:bg-blue-50/60 ${branchIdx % 2 === 0 ? 'bg-white' : 'bg-blue-50/20'}`}>
                      <td
                        className="p-4 font-bold text-slate-700 whitespace-nowrap sticky left-0 z-10 border-r border-blue-100/60 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.08)] transition-colors group-hover:bg-blue-50/60"
                        style={{ backgroundColor: branchIdx % 2 === 0 ? 'white' : 'rgb(253 242 248 / 0.2)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#c8a230] shrink-0" />
                          {branch}
                        </div>
                      </td>
                      {displayedItems.map((item, i) => {
                        const { qty, total } = getDetails(branch, item.name);
                        return (
                          <td key={i} className="p-3 text-center border-r border-blue-50 min-w-35">
                            {qty > 0 ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className="font-black text-blue-900 text-base leading-none">
                                  {qty} <span className="text-xs font-semibold text-blue-700">{item.unit}</span>
                                </span>
                                <span className="text-xs text-blue-700 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                                  {total.toLocaleString()} ฿
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-200 text-xl">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-4 font-black text-right text-slate-700 min-w-35">
                        {getBranchTotal(branch) > 0 ? (
                          <span className="text-blue-900 text-base">
                            {getBranchTotal(branch).toLocaleString()}{' '}
                            <span className="text-blue-700 font-semibold text-xs">฿</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Grand total row */}
                  <tr className="bg-linear-to-r from-[#1a3a6e] to-[#112654] text-white">
                    <td className="p-4 font-black text-base sticky left-0 bg-[#1a3a6e] z-10 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.15)]">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">Σ</span> รวมทั้งหมด
                      </div>
                    </td>
                    {displayedItems.map((item, i) => {
                      const { qty, total } = getTotalByItem(item.name);
                      return (
                        <td key={i} className="p-3 text-center border-r border-[#2451a0]/50 min-w-35">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="font-black text-white text-base leading-none">
                              {qty} <span className="text-xs font-semibold text-blue-200">{item.unit}</span>
                            </span>
                            <span className="text-xs text-blue-200 font-bold">{total.toLocaleString()} ฿</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-4 font-black text-right text-white text-base min-w-35">
                      {totalBudget.toLocaleString()} ฿
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}