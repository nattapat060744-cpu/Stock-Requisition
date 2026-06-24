import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#e8edf5] font-sans">
      {/* Header stripe */}
      <div className="fixed top-0 inset-x-0 h-1.5 bg-linear-to-r from-[#1a3a6e] via-[#c8a230] to-[#1a3a6e] z-50" />

      <main className="flex flex-col items-center justify-center gap-8 px-6 py-16 text-center w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-[#1a3a6e]/20 shadow-xl shadow-[#1a3a6e]/10">
            <Image
              src="/Logo.png"
              alt="สำเพ็ง บุรีรัมย์"
              width={112}
              height={112}
              className="object-cover w-full h-full"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#1a3a6e] leading-tight tracking-tight">
              สำเพ็ง บุรีรัมย์
            </h1>
            <p className="text-xs font-bold text-[#c8a230] uppercase tracking-[0.2em] mt-0.5">
              เจริญการค้า
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-[#1a3a6e]/15" />
          <span className="text-[10px] font-black text-[#1a3a6e]/40 uppercase tracking-widest">ระบบเบิกสินค้า</span>
          <div className="flex-1 h-px bg-[#1a3a6e]/15" />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/requisition"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 h-14 w-full rounded-2xl bg-linear-to-br from-[#1a3a6e] to-[#112654] text-white font-black text-base shadow-lg shadow-[#1a3a6e]/30 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <span className="text-xl">📋</span>
            <span>เบิกสินค้า</span>
          </Link>

          <Link
            href="/admin/requisitions"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 h-12 w-full rounded-2xl bg-white border-2 border-[#1a3a6e]/15 text-[#1a3a6e] font-bold text-sm shadow-sm hover:border-[#1a3a6e]/30 hover:bg-blue-50 active:scale-[0.98] transition-all"
          >
            <span className="text-lg">🛠️</span>
            <span>จัดการคำขอเบิก (Admin)</span>
          </Link>

          <Link
            href="/admin/inventory"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 h-12 w-full rounded-2xl bg-white border-2 border-[#1a3a6e]/15 text-[#1a3a6e] font-bold text-sm shadow-sm hover:border-[#1a3a6e]/30 hover:bg-blue-50 active:scale-[0.98] transition-all"
          >
            <span className="text-lg">📦</span>
            <span>จัดการสินค้าคงคลัง (Admin)</span>
          </Link>

          <Link
            href="/admin/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 h-12 w-full rounded-2xl bg-white border-2 border-[#c8a230]/30 text-[#a07820] font-bold text-sm shadow-sm hover:border-[#c8a230]/50 hover:bg-yellow-50 active:scale-[0.98] transition-all"
          >
            <span className="text-lg">📊</span>
            <span>รายงานสรุป (Admin)</span>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-[#1a3a6e]/30 font-semibold mt-2">
          สำเพ็ง บุรีรัมย์ เจริญการค้า © {new Date().getFullYear()}
        </p>
      </main>
    </div>
  );
}
