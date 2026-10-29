'use client';

import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'admin_requisitions_last_seen';
const POLL_INTERVAL_MS = 15_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

/** หน้าใบเบิกฟังอีเวนต์นี้เพื่อโหลดรายการใหม่ (เมนูยิงเมื่อกดแท็บ "ใบเบิก" ขณะอยู่หน้านั้นอยู่แล้ว) */
export const REQUISITIONS_RELOAD_EVENT = 'admin-requisitions-reload';

/*
 * store กลาง — ทุกที่ที่เรียก useNewRequisitions() (เมนู + หน้าใบเบิก) ใช้ตัวเลข ช่องรับแจ้งเตือน
 * และ polling ชุดเดียวกัน เริ่มทำงานเมื่อมีผู้ใช้คนแรก และหยุดเมื่อไม่เหลือผู้ใช้
 *
 * ตัวแบ่ง (marker) = created_at ล่าสุดของใบเบิก "ตามเวลาเซิร์ฟเวอร์" ณ ตอนที่กดดู
 * ใบที่ created_at > marker คือใบใหม่ จึงไม่ขึ้นกับนาฬิกาของเครื่อง
 */
let count = 0;
let marker: string | null = null;
let version = 0;
let pendingMark: Promise<void> | null = null;
let subscribers = 0;
let stop: (() => void) | null = null;
const listeners = new Set<() => void>();

function setCount(next: number) {
  if (next === count) return;
  count = next;
  listeners.forEach((listener) => listener());
}

function readStored(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !Number.isNaN(Date.parse(saved))) return saved;
  } catch {
    // เบราว์เซอร์บล็อก storage → ใช้ตัวแบ่งในหน่วยความจำแทน
  }
  return null;
}

function writeStored(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ตัวแบ่งในหน่วยความจำยังใช้งานได้ภายในเซสชันนี้
  }
}

// undefined = อ่านจากเซิร์ฟเวอร์ไม่สำเร็จ, null = ตารางยังว่าง
async function latestCreatedAt(): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('requisitions')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return undefined;
  return data?.[0]?.created_at ?? null;
}

async function adoptServerMarker() {
  const latest = await latestCreatedAt();
  // ตารางว่าง → ใบแรกที่เข้ามาย่อมใหม่เสมอ; อ่านไม่ได้ → ถอยไปใช้เวลาเครื่อง (ดีกว่าไม่มีตัวแบ่ง)
  marker = latest === undefined ? new Date().toISOString() : latest ?? EPOCH;
  writeStored(marker);
}

async function refresh(): Promise<void> {
  if (pendingMark) await pendingMark; // รอให้ markSeen เขียนตัวแบ่งเสร็จก่อน ไม่งั้นนับซ้ำชั่วคราว
  const current = ++version;
  const since = readStored() ?? marker;
  if (since === null) {
    // เข้าครั้งแรกในเบราว์เซอร์นี้ → ยังไม่มีอะไรเป็น "ใหม่" เริ่มนับจากใบล่าสุดตอนนี้
    await adoptServerMarker();
    if (current === version) setCount(0);
    return;
  }
  marker = since;
  const { count: found, error } = await supabase
    .from('requisitions')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', since);
  if (current !== version) return;
  if (error) {
    console.error('[badge] refresh error:', error);
    return;
  }
  setCount(found ?? 0);
}

function markSeen(): Promise<void> {
  version += 1;
  setCount(0);
  const run: Promise<void> = adoptServerMarker().finally(() => {
    if (pendingMark === run) pendingMark = null;
  });
  pendingMark = run;
  return run;
}

function start(): () => void {
  const refreshVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) void refresh(); // แท็บอื่นกดดูแล้ว
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  void refresh();

  const channel = supabase
    .channel(`new-requisitions-badge-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requisitions' }, () => {
      void refresh();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void refresh();
    });

  // สำรองกรณี Realtime ใช้ไม่ได้
  const timer = setInterval(refreshVisible, POLL_INTERVAL_MS);

  return () => {
    version += 1;
    void supabase.removeChannel(channel);
    clearInterval(timer);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (subscribers++ === 0) stop = start();
  return () => {
    listeners.delete(listener);
    if (--subscribers === 0) {
      stop?.();
      stop = null;
    }
  };
}

/** นับใบเบิกที่เข้ามาใหม่ นับจากครั้งล่าสุดที่เบราว์เซอร์นี้เปิดดูหน้าใบเบิก */
export function useNewRequisitions() {
  const newCount = useSyncExternalStore(subscribe, () => count, () => 0);
  return { newCount, markSeen, refresh };
}