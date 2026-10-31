import Link from "next/link";
import BrandMark from "@/components/BrandMark";

const adminLinks = [
  {
    href: "/admin/requisitions",
    icon: "🛠️",
    title: "จัดการคำขอเบิก",
    note: "ตรวจ อนุมัติ และติดตามใบเบิกของทุกแผนก",
  },
  {
    href: "/admin/inventory",
    icon: "📦",
    title: "จัดการสินค้าคงคลัง",
    note: "ดูและปรับจำนวนสินค้าในสต็อก",
  },
  {
    href: "/admin/dashboard",
    icon: "📊",
    title: "รายงานสรุป",
    note: "ดูภาพรวมการเบิกและแผนกในระบบ",
  },
];

const steps = [
  { n: "1", t: "เข้าด้วยรหัสแผนก", d: "ใช้รหัสเดียว เริ่มได้ทันที" },
  { n: "2", t: "เลือกสินค้าใส่ตะกร้า", d: "ค้นหา กดเพิ่ม ปรับจำนวน" },
  { n: "3", t: "ส่งใบเบิกและติดตามสถานะ", d: "รู้ทันทีเมื่อมีการอนุมัติ" },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-canvas text-slate-800">
      {/* พื้นหลังออโรร่า: ลูกบอลแสงลอย + ลายจุด */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        
        
        
        
      </div>

      <main className="relative mx-auto grid w-full max-w-5xl gap-10 px-6 pb-16 pt-14 md:grid-cols-[1fr_1.1fr] md:gap-16 md:pt-24">
        {/* ── ฝั่งซ้าย: แนะนำระบบ ── */}
        <section className="md:pt-2">
          <div className="animate-pop">
            <BrandMark size={68} />
          </div>
          <p className="mt-6 inline-flex animate-rise items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-bold text-brand-700 shadow-sm backdrop-blur" style={{ animationDelay: "80ms" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            พร้อมใช้งาน
          </p>
          <h1 className="mt-4 animate-rise text-4xl font-extrabold leading-tight tracking-tight md:text-5xl" style={{ animationDelay: "140ms" }}>
            <span className="text-brand-700">ระบบเบิกของ</span>
          </h1>
          <p className="mt-3 max-w-sm animate-rise text-base leading-relaxed text-slate-600" style={{ animationDelay: "220ms" }}>
            สร้างใบเบิก ติดตามสถานะ และดูประวัติของแผนกได้จากที่เดียว ใช้เพียงรหัสแผนกก็เริ่มได้ทันที
          </p>

          <ol className="relative mt-9 space-y-5">
            {/* เส้นเชื่อมระหว่างขั้นตอน */}
            <span aria-hidden="true" className="absolute left-3.5 top-4 bottom-4 w-px bg-brand-300" />
            {steps.map((s, i) => (
              <li
                key={s.n}
                style={{ animationDelay: `${320 + i * 110}ms` }}
                className="group relative flex animate-rise items-start gap-4"
              >
                <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-400 text-xs font-extrabold text-accent-950 shadow-md shadow-accent-500/30 ring-4 ring-canvas transition-transform duration-300 group-hover:scale-125">
                  {s.n}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-800">{s.t}</span>
                  <span className="block text-xs text-slate-500">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── ฝั่งขวา: ทางเข้าใช้งาน ── */}
        <div className="space-y-9">
          {/* พนักงาน */}
          <section className="space-y-3">
            <Link
              href="/requisition"
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative flex animate-rise items-center gap-4 overflow-hidden rounded-3xl bg-brand-700 p-5 text-white shadow-xl shadow-brand-700/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-700/40 ${focusRing}`} style={{ animationDelay: "200ms" }}>
              
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-3xl ring-1 ring-white/25 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                📋
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-xl font-extrabold">เบิกสินค้า</span>
                <span className="mt-0.5 block text-sm text-brand-100">
                  เลือกสินค้าและส่งใบเบิกของแผนก
                </span>
              </span>
              <span aria-hidden="true" className="relative text-3xl text-accent-300 transition-transform duration-300 group-hover:translate-x-1.5">
                ›
              </span>
            </Link>

            <Link
              href="/requisition/my-requests"
              className={`group flex animate-rise items-center gap-4 rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-soft backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift ${focusRing}`} style={{ animationDelay: "300ms" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                🧾
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-brand-900">ประวัติการเบิกของแผนก</span>
                <span className="block text-sm text-slate-500">
                  ดูใบเบิกที่ผ่านมา และแก้ไขใบที่ยังรออนุมัติ
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-600">
                ›
              </span>
            </Link>
          </section>

          {/* ผู้ดูแล */}
          <section aria-labelledby="admin-heading" className="animate-rise" style={{ animationDelay: "400ms" }}>
            <div className="mb-3 flex items-center gap-3">
              <h2 id="admin-heading" className="text-xs font-bold tracking-wide text-slate-500">
                สำหรับผู้ดูแลระบบ
              </h2>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-soft backdrop-blur">
              {adminLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group flex items-center gap-4 px-5 py-4 transition-all duration-200 hover:bg-accent-50/80 hover:pl-6 focus-visible:-outline-offset-2 ${focusRing}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800">{item.title}</span>
                      <span className="block text-sm text-slate-500">{item.note}</span>
                    </span>
                    <span aria-hidden="true" className="text-xl text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent-600">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="relative pb-8 text-center text-xs font-semibold text-slate-400">
        ระบบเบิกของ © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
