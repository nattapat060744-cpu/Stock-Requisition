'use client';

import { useEffect, useState } from 'react';

type Tone = 'success' | 'error' | 'info';
type ToastItem = { id: number; msg: string; tone: Tone };
const DURATION = 4500;

/** เรียกใช้จากที่ไหนก็ได้: toast('บันทึกแล้ว', 'success') */
export function toast(msg: string, tone: Tone = 'info') {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, tone } }));
}

/** ปล่อยกระดาษสีฉลองความสำเร็จ (น้ำเงิน เหลือง ขาว) */
export function celebrate() {
  if (typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#2563eb', '#fbbf24', '#ffffff', '#60a5fa', '#f59e0b'];
  const ox = window.innerWidth / 2, oy = Math.min(window.innerHeight * 0.35, 320);
  for (let i = 0; i < 48; i++) {
    const el = document.createElement('i');
    const size = 6 + Math.random() * 7;
    Object.assign(el.style, { position: 'fixed', left: ox + 'px', top: oy + 'px', width: size + 'px', height: size * (Math.random() > .5 ? 1 : .45) + 'px', background: colors[i % colors.length], border: '1px solid rgba(30,64,175,.25)', borderRadius: Math.random() > .7 ? '50%' : '2px', zIndex: '200', pointerEvents: 'none' });
    document.body.appendChild(el);
    const angle = Math.random() * Math.PI * 2, force = 120 + Math.random() * 260;
    const dx = Math.cos(angle) * force, dy = Math.sin(angle) * force - 120;
    el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx * 1.15}px,${dy + 380}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).onfinish = () => el.remove();
  }
}

const style: Record<Tone, { bar: string; chip: string; icon: string }> = {
  success: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', icon: '✓' },
  error: { bar: 'bg-red-500', chip: 'bg-red-100 text-red-700', icon: '!' },
  info: { bar: 'bg-accent-400', chip: 'bg-accent-100 text-accent-700', icon: 'i' },
};

/** แสดงข้อความแจ้งเตือนแบบ toast และเปลี่ยน window.alert ทั้งระบบให้เป็น toast + ปุ่มเลื่อนกลับขึ้นบน */
export default function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    let seq = 0;
    const add = (msg: string, tone: Tone) => {
      const id = ++seq + Date.now();
      setList((l) => [...l.slice(-3), { id, msg, tone }]);
      setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), DURATION);
    };
    const onToast = (e: Event) => { const d = (e as CustomEvent).detail; add(String(d.msg), d.tone || 'info'); };
    window.addEventListener('app-toast', onToast);
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => {
      const msg = String(message ?? '');
      const bad = /(ไม่|ผิดพลาด|ล้มเหลว|หมดอายุ)/.test(msg);
      add(msg, bad ? 'error' : /กรุณา/.test(msg) ? 'info' : /(สำเร็จ|เรียบร้อย|แล้ว|บันทึก)/.test(msg) ? 'success' : 'info');
    };
    const onScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('app-toast', onToast); window.removeEventListener('scroll', onScroll); window.alert = nativeAlert; };
  }, []);
  return <>
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end print:hidden">
      {list.map((t) => <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto relative w-full max-w-sm animate-pop overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 pr-10 shadow-lift">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ' + style[t.tone].chip}>{style[t.tone].icon}</span>
          <p className="whitespace-pre-wrap pt-0.5 text-sm font-semibold leading-snug text-slate-700">{t.msg}</p>
        </div>
        <button type="button" aria-label="ปิด" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} className="absolute right-2 top-2 h-6 w-6 rounded-full text-base text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        <span aria-hidden="true" style={{ animation: `shrink ${DURATION}ms linear forwards` }} className={'absolute inset-x-0 bottom-0 h-1 origin-left ' + style[t.tone].bar} />
      </div>)}
    </div>
    <button type="button" aria-label="เลื่อนขึ้นด้านบน" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={'fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-lg font-black text-white shadow-lift transition-all duration-300 hover:-translate-y-1 hover:bg-brand-700 lg:bottom-6 print:hidden ' + (showTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0')}>↑</button>
  </>;
}
