/* ทุกครั้งที่เปลี่ยนหน้า เนื้อหาจะค่อย ๆ ปรากฏ (ใช้ opacity อย่างเดียว ไม่กระทบ sticky/fixed) */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade">{children}</div>;
}
