'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { ui, PageHero, Notice, StatCard, EmptyState, CountUp } from '@/components/AdminUI';

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
        setData(rawData.filter((d: any) => d.requisitions && d.items && d.requisitions.status === 'approved'));
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredData = data.filter((d) =>
    bangkokDate(new Date(d.requisitions.created_at)).startsWith(selectedDate) && (!selectedItem || d.items.name === selectedItem)
  );

  const getDetails = (branch: string, itemName: string) => {
    const records = filteredData.filter((d) => d.requisitions.branch_name === branch && d.items.name === itemName);
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);
    return { qty, total };
  };

  const getBranchTotal = (branch: string) =>
    filteredData
      .filter((d) => d.requisitions.branch_name === branch)
      .reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);

  const getTotalByItem = (itemName: string) => {
    const records = filteredData.filter((d) => d.items.name === itemName);
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);
    return { qty, total };
  };

  const totalBudget = filteredData.reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);

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

  const ranking = allBranches.map((name) => ({ name, total: getBranchTotal(name) })).filter((b) => b.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const rankMax = Math.max(1, ...ranking.map((b) => b.total));
  const medals = ['🥇', '🥈', '🥉', '4', '5'];

  const displayedItems = selectedItem ? allItems.filter((i) => i.name === selectedItem) : allItems;

  if (loading)
    return (
      <div className={ui.page}><div className={ui.wrap} aria-busy="true" role="status">
        <div className="animate-pulse bg-brand-100 h-28 rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="animate-pulse bg-brand-100 h-32 rounded-2xl" />)}</div>
        <div className="animate-pulse bg-brand-100 h-80 rounded-2xl" />
        <span className="sr-only">กำลังประมวลผลข้อมูล...</span>
      </div></div>
    );

  const hasData = allBranches.length > 0 && displayedItems.length > 0;

  return (
    <div className={ui.page}>
      <div className={ui.wrap}>

        <PageHero icon="📊" title="แดชบอร์ดภาพรวม" subtitle="สรุปการเบิกสินค้าแต่ละแผนก"
          actions={<div className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-right">
            <p className="text-xs font-bold text-brand-100">งบรวมทั้งสิ้น</p>
            <p className="text-lg font-black tabular-nums"><CountUp value={money(totalBudget)} /> ฿</p>
          </div>} />

        {errorMessage && <Notice tone="warn">{errorMessage}</Notice>}

        <div className="stagger-grid grid gap-4 sm:grid-cols-3">
          <StatCard href="/admin/requisitions" accent="amber" icon="⏳" label="ใบเบิกรอดำเนินการ" value={pendingCount.toLocaleString('th-TH')} unit="ใบ" hint="เปิดหน้าตรวจสอบ →" />
          <StatCard href="/admin/inventory" accent="blue" icon="📦" label="จำนวนสินค้าในคลัง" value={itemCount.toLocaleString('th-TH')} unit="รายการ" hint="ดูรายการสินค้า →" />
          <StatCard accent="emerald" icon="🏬" label="แผนกที่มีการเบิก" value={activeBranches.toLocaleString('th-TH')} unit="แผนก" hint={`จากทั้งหมด ${allBranches.length} แผนก · ตามตัวกรองที่เลือก`} />
        </div>

        {/* ตัวกรอง */}
        <section className={ui.card + ' flex flex-wrap items-center gap-3 p-4'}>
          <label className="flex items-center gap-2 text-xs font-bold text-brand-800">เดือน
            <input type="month" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={ui.input + ' w-auto cursor-pointer'} />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-brand-800">สินค้า
            <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)} className={ui.input + ' w-52 cursor-pointer'}>
              <option value="">ทุกสินค้า</option>
              {allItems.map((item, i) => <option key={i} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          {(selectedItem || selectedDate !== bangkokDate(new Date()).slice(0, 7)) && (
            <button type="button" className="text-xs font-black text-brand-700 hover:underline" onClick={() => { setSelectedItem(''); setSelectedDate(bangkokDate(new Date()).slice(0, 7)); }}>ล้างตัวกรอง</button>
          )}
          <p className="ml-auto text-xs font-semibold text-slate-500">ใบเบิกที่อนุมัติแล้วเท่านั้น</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <section className={ui.card + ' p-5 sm:p-6'}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-black text-brand-700">แนวโน้มค่าใช้จ่าย 7 วันล่าสุด</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">ใบเบิกที่อนุมัติแล้ว · {selectedItem || 'ทุกสินค้า'}</p>
              </div>
              <p className="text-xs text-slate-400">อัปเดต {updatedAt?.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} น.</p>
            </div>
            <div className="mt-8 flex h-64 items-end gap-2 sm:gap-3" role="img" aria-label={`ค่าใช้จ่าย 7 วันล่าสุด: ${trend.map((day) => `${day.label} ${money(day.total)} บาท`).join(', ')}`}>
              {trend.map((day) => (
                <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="mb-2 text-[10px] font-semibold tabular-nums text-brand-900 sm:text-xs">{day.total > 0 ? money(day.total) : '0'}</span>
                  <div className="group/bar relative w-full origin-bottom animate-grow rounded-t-lg bg-brand-600 shadow-sm shadow-brand-600/20 transition-[filter] duration-200 hover:brightness-110" style={{ height: `${Math.max(2, day.total / maximum * 190)}px`, animationDelay: `${trend.indexOf(day) * 70 + 200}ms` }}>{day.key === today && <span aria-hidden="true" className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-accent-500 shadow" />}</div>
                  <span className="mt-3 whitespace-nowrap text-[10px] font-semibold text-slate-500 sm:text-xs">{day.label}</span>
                </div>
              ))}
            </div>
            {trend.every((day) => day.total === 0) && <p className="mt-5 text-center text-xs text-slate-400">ยังไม่มีค่าใช้จ่ายจากใบเบิกที่อนุมัติใน 7 วันล่าสุด</p>}
          </section>

          <section className={ui.card + ' p-5 sm:p-6'}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-brand-700">ใบเบิกรอล่าสุด</h2>
              <Link href="/admin/requisitions" className="text-xs font-bold text-brand-700 hover:underline">ดูทั้งหมด →</Link>
            </div>
            <div className="space-y-2">
              {pending.map((req) => (
                <Link key={req.id} href="/admin/requisitions" className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-all duration-200 hover:translate-x-1 hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-200 text-xs font-black text-brand-800 ring-2 ring-white transition-transform group-hover:scale-110">{(req.requester_name || '?').trim().slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-brand-700">{req.branch_name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{req.requester_name}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />รอตรวจสอบ</span>
                </Link>
              ))}
              {pending.length === 0 && <EmptyState icon="📭" title="ไม่มีใบเบิกรออนุมัติ" />}
            </div>
          </section>
        </div>

        {/* จัดอันดับแผนกที่เบิกมากสุด */}
        {ranking.length > 0 && (
          <section className={ui.card + ' p-5 sm:p-6'}>
            <h2 className="font-black text-brand-700">🏆 แผนกที่เบิกมูลค่าสูงสุด</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">5 อันดับแรก ตามตัวกรองที่เลือก</p>
            <ol className="mt-5 space-y-3.5">
              {ranking.map((b, i) => (
                <li key={b.name} className="group flex items-center gap-3">
                  <span aria-hidden="true" className="w-7 shrink-0 text-center text-lg font-black text-slate-400">{medals[i]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-bold text-slate-700">{b.name}</span>
                      <span className="shrink-0 font-black tabular-nums text-brand-800">{money(b.total)} ฿</span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-brand-50">
                      <div className={'h-full origin-left rounded-full transition-[filter] group-hover:brightness-110 ' + (i === 0 ? 'bg-accent-400' : 'bg-brand-500')} style={{ width: (b.total / rankMax * 100) + '%', animation: 'bar-in .9s cubic-bezier(.2,.7,.2,1) both', animationDelay: i * 90 + 'ms' }} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ตารางสรุป */}
        <section className={ui.card}>
          <div className="border-b border-slate-200 p-4"><h2 className="font-black text-brand-700">สรุปยอดเบิกแยกตามแผนก</h2><p className="mt-0.5 text-xs text-slate-500">จำนวนและมูลค่าของแต่ละสินค้า ตามเดือนที่เลือก</p></div>
          {!hasData ? <EmptyState icon="📭" title="ไม่มีข้อมูลในช่วงเวลาที่เลือก" hint="ลองเปลี่ยนเดือนหรือสินค้า" /> : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr className={ui.thead}>
                    <th className="sticky left-0 z-20 min-w-40 border-b border-r border-slate-200 bg-brand-50 px-4 py-3.5 text-left">🏬 แผนก</th>
                    {displayedItems.map((item, i) => (
                      <th key={i} className="min-w-35 border-b border-r border-slate-200 bg-brand-50/70 px-4 py-3.5 text-center">
                        <span className="block">{item.name}</span>
                        <span className="text-xs font-medium text-slate-400">({item.unit})</span>
                      </th>
                    ))}
                    <th className="min-w-35 border-b border-slate-200 bg-brand-50/70 px-4 py-3.5 text-right">รวมแผนก</th>
                  </tr>
                </thead>
                <tbody>
                  {allBranches.map((branch, branchIdx) => {
                    const branchTotal = getBranchTotal(branch);
                    return (
                      <tr key={branch} className="group transition-colors hover:bg-brand-50/40">
                        <td className={'sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-100 px-4 py-4 font-bold text-slate-700 group-hover:bg-brand-50 ' + (branchIdx % 2 === 0 ? 'bg-white' : 'bg-brand-50/40')}>
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-black text-brand-800">{branch.trim().slice(0, 1)}</span>
                            {branch}
                          </span>
                        </td>
                        {displayedItems.map((item, i) => {
                          const { qty, total } = getDetails(branch, item.name);
                          return (
                            <td key={i} className="min-w-35 border-b border-r border-slate-100 p-3 text-center">
                              {qty > 0 ? (
                                <div className="inline-flex flex-col items-center gap-1">
                                  <span className="font-black tabular-nums text-brand-900">{qty} <span className="text-xs font-semibold text-slate-500">{item.unit}</span></span>
                                  <span className="rounded-full border border-slate-200 bg-brand-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-800">{total.toLocaleString()} ฿</span>
                                </div>
                              ) : <span className="text-xl text-slate-200">·</span>}
                            </td>
                          );
                        })}
                        <td className="min-w-35 border-b border-slate-100 px-4 py-4 text-right font-black tabular-nums">
                          {branchTotal > 0 ? <span className="text-brand-900">{branchTotal.toLocaleString()} <span className="text-xs font-semibold text-slate-400">฿</span></span> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-brand-700 text-white">
                    <td className="sticky left-0 z-10 bg-brand-700 px-4 py-4 font-black">Σ รวมทั้งหมด</td>
                    {displayedItems.map((item, i) => {
                      const { qty, total } = getTotalByItem(item.name);
                      return (
                        <td key={i} className="min-w-35 border-r border-white/15 p-3 text-center">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="font-black tabular-nums">{qty} <span className="text-xs font-semibold text-brand-200">{item.unit}</span></span>
                            <span className="text-xs font-bold tabular-nums text-brand-100">{total.toLocaleString()} ฿</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="min-w-35 px-4 py-4 text-right font-black tabular-nums">{money(totalBudget)} ฿</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}