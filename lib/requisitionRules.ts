export type RequestLineInput = { item_id: string; quantity: number };
export function validRequestLines(lines: RequestLineInput[]) {
 return lines.length>0 && lines.length<=500 && new Set(lines.map(l=>l.item_id)).size===lines.length && lines.every(l=>Boolean(l.item_id)&&Number.isSafeInteger(l.quantity)&&l.quantity>0&&l.quantity<=2147483647);
}
export function requestError(error: unknown): string {
 const fallback = 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
 if (!error || typeof error !== 'object' || !('message' in error)) return fallback;
 const message = String(error.message || fallback);
 const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
 const schemaError = ['PGRST202', 'PGRST204', '42P01', '42703', '42883'].includes(code)
  || /schema cache|does not exist|Could not find.*function/i.test(message);
 if (!schemaError) return message;
 return 'ส่งข้อมูลไม่สำเร็จ เนื่องจากโครงสร้างฐานข้อมูลหรือฟังก์ชันไม่ตรงกัน กรุณาส่งรายละเอียดนี้ให้ผู้ดูแลตรวจสอบ\n'
  + (code ? '[' + code + '] ' : '') + message;
}
