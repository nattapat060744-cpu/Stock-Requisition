export type RequestLineInput = { item_id: string; quantity: number };
export function validRequestLines(lines: RequestLineInput[]) {
 return lines.length>0 && lines.length<=500 && new Set(lines.map(l=>l.item_id)).size===lines.length && lines.every(l=>Boolean(l.item_id)&&Number.isSafeInteger(l.quantity)&&l.quantity>0&&l.quantity<=2147483647);
}
export function requestError(error:unknown):string {
 const message=error&&typeof error==='object'&&'message' in error?String(error.message):'บันทึกไม่สำเร็จ กรุณาลองใหม่';
 return /schema cache|does not exist|Could not find.*function/i.test(message)?'ยังไม่ได้ติดตั้งฐานข้อมูลใบเบิกเวอร์ชันใหม่ กรุณารัน SQL ตามคู่มือ REQUISITION_SETUP':message;
}
