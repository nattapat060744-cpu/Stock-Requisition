import Link from "next/link";
import Image from "next/image";

const awning = {
  stripes: {
    backgroundImage:
      "repeating-linear-gradient(90deg, #1a3a6e 0 40px, #c8a230 40px 80px)",
  },
  scallops: {
    backgroundImage:
      "radial-gradient(circle at 20px 0, #1a3a6e 19px, transparent 20px), radial-gradient(circle at 60px 0, #c8a230 19px, transparent 20px)",
    backgroundSize: "80px 20px",
    backgroundRepeat: "repeat-x",
  },
} as const;

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

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6e]";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#eef1f7] font-sans text-slate-800">
      {/* ผ้าใบร้านค้า — เอกลักษณ์ตลาดสำเพ็ง */}
      <div aria-hidden="true" className="w-full">
        <div className="h-8" style={awning.stripes} />
        <div className="h-5" style={awning.scallops} />
      </div>

      <main className="mx-auto grid w-full max-w-5xl gap-10 px-6 pb-16 pt-12 md:grid-cols-[1fr_1.15fr] md:gap-16 md:pt-20">
        {/* ── ฝั่งซ้าย: ร้าน ── */}
        <section className="md:pt-4">
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-lg shadow-[#1a3a6e]/15">
            <Image
              src="/Logo.png"
              alt="สำเพ็ง บุรีรัมย์"
              width={96}
              height={96}
              className="h-full w-full object-cover"
              priority
            />
          </div>

          <h1 className="mt-6 text-4xl font-black leading-tight text-[#1a3a6e] md:text-5xl">
            สำเพ็ง บุรีรัมย์
          </h1>
          <p className="mt-1 text-lg font-bold text-[#a07820]">เจริญการค้า</p>

          <p className="mt-6 max-w-xs text-base leading-relaxed text-slate-600">
            ระบบเบิกสินค้าภายในร้าน ใช้รหัสแผนกเข้าใช้งาน แล้วเบิกของและดูประวัติได้จากที่เดียว
          </p>
        </section>

        {/* ── ฝั่งขวา: การใช้งาน ── */}
        <div className="space-y-10">
          {/* พนักงาน */}
          <section className="space-y-3">
            <Link
              href="/requisition"
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-center gap-4 rounded-2xl bg-[#1a3a6e] p-5 text-white shadow-lg shadow-[#1a3a6e]/25 transition-colors hover:bg-[#112654] ${focusRing}`}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15 text-3xl">
                📋
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-black">เบิกสินค้า</span>
                <span className="mt-0.5 block text-sm text-blue-100">
                  เลือกสินค้าและส่งใบเบิกของแผนก
                </span>
              </span>
              <span aria-hidden="true" className="text-3xl text-[#c8a230] transition-transform group-hover:translate-x-1">
                ›
              </span>
            </Link>

            <Link
              href="/requisition/my-requests"
              className={`group flex items-center gap-4 rounded-2xl border border-[#1a3a6e]/15 bg-white px-5 py-4 transition-colors hover:border-[#1a3a6e]/35 hover:bg-blue-50/60 ${focusRing}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1a3a6e]/8 text-xl">
                🧾
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[#1a3a6e]">ประวัติการเบิกของแผนก</span>
                <span className="block text-sm text-slate-500">
                  ดูใบเบิกที่ผ่านมา และแก้ไขใบที่ยังรออนุมัติ
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-slate-300 transition-transform group-hover:translate-x-0.5">
                ›
              </span>
            </Link>
          </section>

          {/* ผู้ดูแล */}
          <section aria-labelledby="admin-heading">
            <div className="mb-3 flex items-center gap-3">
              <h2 id="admin-heading" className="text-sm font-bold text-slate-500">
                สำหรับผู้ดูแลระบบ
              </h2>
              <div className="h-px flex-1 bg-[#1a3a6e]/15" />
            </div>

            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-[#1a3a6e]/10 bg-white">
              {adminLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#c8a230]/8 focus-visible:-outline-offset-2 ${focusRing}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#c8a230]/15 text-xl">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800">{item.title}</span>
                      <span className="block text-sm text-slate-500">{item.note}</span>
                    </span>
                    <span aria-hidden="true" className="text-xl text-slate-300 transition-transform group-hover:translate-x-0.5">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="pb-8 text-center text-xs font-semibold text-[#1a3a6e]/40">
        สำเพ็ง บุรีรัมย์ เจริญการค้า © {new Date().getFullYear()}
      </footer>
    </div>
  );
}