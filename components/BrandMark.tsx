/** สัญลักษณ์ระบบเบิกของ — กล่องพัสดุ + ลูกศรออก (วาดด้วย SVG ไม่พึ่งไฟล์รูป) */
export default function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={'group/brand relative inline-flex shrink-0 items-center justify-center rounded-[30%] bg-brand-600 text-white shadow-md shadow-brand-700/35 ring-1 ring-white/25 transition-transform duration-300 hover:-rotate-6 hover:scale-110 ' + className}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5Z" />
        <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
        <path d="M17.5 3.2 19.8 4.4" stroke="#fde047" strokeWidth="2.2" />
      </svg>
    </span>
  );
}
