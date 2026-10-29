'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const bangkokDate = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const money = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
interface PendingRequisition { id: string; branch_name: string; requester_name: string; created_at: string; }

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(bangkokDate(new Date()).slice(0, 7));
  const [selectedItem, setSelectedItem] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<{ name: string; unit: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingRequisition[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

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

      const [pendingResult, itemResult] = await Promise.all([
        supabase.from('requisitions').select('id, branch_name, requester_name, created_at', { count: 'exact' }).eq('status', 'pending').order('created_at', { ascending: false }).range(0, 4),
        supabase.from('items').select('id', { count: 'exact', head: true }),
      ]);
      if (pendingResult.error || itemResult.error || !branchesData || !itemsData || !rawData) {
        setErrorMessage('โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองรีเฟรชหน้าอีกครั้ง');
      }
      setPending(pendingResult.data ?? []);
      setPendingCount(pendingResult.count ?? 0);
      setItemCount(itemResult.count ?? 0);
      setUpdatedAt(new Date());

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
    bangkokDate(new Date(d.requisitions.created_at)).startsWith(selectedDate) && (!selectedItem || d.items.name === selectedItem)
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

  const activeBranches = new Set(filteredData.map((d) => d.requisitions.branch_name)).size;
  const today = bangkokDate(new Date());
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00+07:00`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = bangkokDate(date);
    const total = data.filter((d) => bangkokDate(new Date(d.requisitions.created_at)) === key && (!selectedItem || d.items.name === selectedItem))
      .reduce((sum, d) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);
    return { key, total, label: date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }) };
  });
  const maximum = Math.max(1, ...trend.map((day) => day.total));

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

        {/* ── Header + Filters ── */}
        <div className="bg-white p-5 rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">📊 แดชบอร์ดภาพรวม</h1>
            <p className="text-xs font-semibold text-blue-700 mt-1 uppercase tracking-widest">สรุปการเบิกสินค้าแต่ละแผนก</p>
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
              <span className="text-white font-black text-base">{money(totalBudget)} ฿</span>
            </div>
          </div>
        </div>

        {errorMessage && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{errorMessage}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/admin/requisitions" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 transition-shadow hover:shadow-md">
            <p className="text-sm font-bold text-amber-700">ใบเบิกรอดำเนินการ</p>
            <p className="mt-2 text-3xl font-black text-[#1a3a6e]">{pendingCount.toLocaleString('th-TH')}</p>
            <p className="mt-1 text-xs font-bold text-amber-700">เปิดหน้าตรวจสอบ →</p>
          </Link>
          <Link href="/admin/inventory" className="rounded-2xl border border-blue-200 bg-blue-50 p-5 transition-shadow hover:shadow-md">
            <p className="text-sm font-bold text-blue-700">จำนวนสินค้าในคลัง</p>
            <p className="mt-2 text-3xl font-black text-[#1a3a6e]">{itemCount.toLocaleString('th-TH')}</p>
            <p className="mt-1 text-xs font-bold text-blue-700">ดูรายการสินค้า →</p>
          </Link>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-700">แผนกที่มีการเบิก</p>
            <p className="mt-2 text-3xl font-black text-[#1a3a6e]">{activeBranches.toLocaleString('th-TH')}</p>
            <p className="mt-1 text-xs font-bold text-emerald-700">จากทั้งหมด {allBranches.length} แผนก · ตามตัวกรองที่เลือก</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm shadow-blue-100/50 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-black text-[#1a3a6e]">แนวโน้มค่าใช้จ่าย 7 วันล่าสุด</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">ใบเบิกที่อนุมัติแล้ว · {selectedItem || 'ทุกสินค้า'}</p>
              </div>
              <p className="text-xs text-slate-400">อัปเดต {updatedAt?.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} น.</p>
            </div>
            <div className="mt-8 flex h-64 items-end gap-2 sm:gap-3" role="img" aria-label={`ค่าใช้จ่าย 7 วันล่าสุด: ${trend.map((day) => `${day.label} ${money(day.total)} บาท`).join(', ')}`}>
              {trend.map((day) => (
                <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end items-center">
                  <span className="mb-2 text-[10px] font-semibold text-blue-900 sm:text-xs">{day.total > 0 ? money(day.total) : '0'}</span>
                  <div className="w-full rounded-t-lg bg-linear-to-t from-[#1a3a6e] to-blue-400 transition-all" style={{ height: `${Math.max(2, day.total / maximum * 190)}px` }} />
                  <span className="mt-3 whitespace-nowrap text-[10px] font-semibold text-slate-500 sm:text-xs">{day.label}</span>
                </div>
              ))}
            </div>
            {trend.every((day) => day.total === 0) && <p className="mt-5 text-center text-xs text-slate-400">ยังไม่มีค่าใช้จ่ายจากใบเบิกที่อนุมัติใน 7 วันล่าสุด</p>}
          </section>
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm shadow-blue-100/50 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-[#1a3a6e]">ใบเบิกรอล่าสุด</h2>
              <Link href="/admin/requisitions" className="text-xs font-bold text-blue-700 hover:underline">ดูทั้งหมด →</Link>
            </div>
            <div className="space-y-2">
              {pending.map((req) => (
                <Link key={req.id} href="/admin/requisitions" className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 transition-colors hover:bg-amber-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#1a3a6e]">{req.branch_name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{req.requester_name}</p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-amber-700">ตรวจสอบ →</span>
                </Link>
              ))}
              {pending.length === 0 && <div className="flex min-h-52 items-center justify-center rounded-xl bg-blue-50/50 text-sm font-semibold text-slate-500">ไม่มีใบเบิกรออนุมัติ</div>}
            </div>
          </section>
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
                      🏬 แผนก
                    </th>
                    {displayedItems.map((item, i) => (
                      <th key={i} className="p-4 border-b-2 border-r border-blue-100 min-w-35 text-center font-black text-blue-700 uppercase tracking-wide bg-blue-50/80">
                        <span className="block">{item.name}</span>
                        <span className="text-xs text-blue-400 font-semibold normal-case tracking-normal">({item.unit})</span>
                      </th>
                    ))}
                    <th className="p-4 border-b-2 border-blue-100 text-right font-black text-blue-700 uppercase tracking-wider min-w-35 bg-blue-50/80">
                      รวมแผนก
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
                      {money(totalBudget)} ฿
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