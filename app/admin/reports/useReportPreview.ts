'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ตัวเลขคร่าว ๆ ที่โชว์บนการ์ดเมนูรายงาน (คำนวณจากใบเบิกตั้งแต่ต้นเดือนก่อนหน้าถึงปัจจุบัน)
export type ReportPreview = {
  monthRequests: number; // ใบเบิกเดือนนี้ (ทุกสถานะ)
  pendingRequests: number; // รออนุมัติเดือนนี้
  todayRequests: number; // ใบเบิกวันนี้
  requesters: number; // จำนวนผู้เบิกที่ไม่ซ้ำกันเดือนนี้
  cost: number; // ยอดเบิกที่อนุมัติแล้ว เดือนนี้ (บาท)
  costLastPeriod: number; // ยอดช่วงเดียวกันของเดือนก่อน (วันที่ 1 ถึงวันที่เดียวกับวันนี้)
};

type Row = {
  status: string;
  created_at: string;
  requester_name: string | null;
  requisition_details: { quantity: number | null; price_at_time: number | null }[] | null;
};

const BANGKOK = 'Asia/Bangkok';
const CACHE_MS = 3 * 60 * 1000;
let cache: { at: number; data: ReportPreview } | null = null;

const bangkokDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: BANGKOK }); // YYYY-MM-DD

async function fetchPreview(): Promise<ReportPreview> {
  const today = bangkokDay(new Date().toISOString());
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const [year, month] = thisMonth.split('-').map(Number);
  const lastMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  const since = `${lastMonth}-01T00:00:00+07:00`;

  // Supabase คืนสูงสุด 1,000 แถวต่อครั้ง จึงดึงเป็นหน้า ๆ
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('requisitions')
      .select('status, created_at, requester_name, requisition_details(quantity, price_at_time)')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  const preview: ReportPreview = { monthRequests: 0, pendingRequests: 0, todayRequests: 0, requesters: 0, cost: 0, costLastPeriod: 0 };
  const people = new Set<string>();

  for (const row of rows) {
    const day = bangkokDay(row.created_at);
    const isThisMonth = day.startsWith(thisMonth);
    const cost = (row.requisition_details ?? []).reduce((sum, l) => sum + (l.quantity ?? 0) * (l.price_at_time ?? 0), 0);

    if (isThisMonth) {
      preview.monthRequests++;
      if (row.status === 'pending') preview.pendingRequests++;
      if (day === today) preview.todayRequests++;
      if (row.requester_name) people.add(row.requester_name);
      if (row.status === 'approved') preview.cost += cost;
    } else if (row.status === 'approved' && Number(day.slice(8, 10)) <= dayOfMonth) {
      preview.costLastPeriod += cost;
    }
  }
  preview.requesters = people.size;
  return preview;
}

export function useReportPreview() {
  const fresh = cache && Date.now() - cache.at < CACHE_MS ? cache.data : null;
  const [data, setData] = useState<ReportPreview | null>(fresh);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (fresh) return;
    let alive = true;
    fetchPreview()
      .then((result) => {
        cache = { at: Date.now(), data: result };
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setFailed(true); // โหลดตัวเลขไม่ได้ก็ยังเข้าเมนูรายงานได้ตามปกติ
      });
    return () => {
      alive = false;
    };
  }, [fresh]);

  return { data, failed };
}
