'use client';
import { useEffect, useRef, useState } from 'react';
import ReportPagination from '@/components/ReportPagination';
import { supabase } from '@/lib/supabase';
import { exportReportExcel } from '@/lib/reportExports';
import { ui, PageHero, Notice, StatCard, Field, SearchBox, EmptyState, Skeleton } from '@/components/AdminUI';

type Item = { id: string; product_code: string | null; name: string; unit: string; stock_quantity: number | null; image_url: string | null };
type CountLine = { id: string; item_name: string; product_code: string; unit: string; before_quantity: number | null; counted_quantity: number };
type History = { id: string; counted_by: string; note: string; created_at: string; stocktake_lines: CountLine[] };

async function readItems() {
  const result: Item[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('items').select('id,product_code,name,unit,stock_quantity,image_url').order('name').order('id').range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 500) return result;
  }
}

const msg = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'ไม่สามารถทำรายการได้';
const DRAFT_KEY = 'stocktake_draft_counts';
const diffText = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('th-TH');
const diffClass = (n: number) => n === 0 ? 'text-slate-500' : n > 0 ? 'text-emerald-700' : 'text-red-600';

export default function StocktakePage() {
  const [items, setItems] = useState<Item[]>([]), [counts, setCounts] = useState<Record<string, string>>({}), [name, setName] = useState(''), [note, setNote] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [history, setHistory] = useState<History[]>([]), [historyPage, setHistoryPage] = useState(1), [historyTotal, setHistoryTotal] = useState(0), [historyError, setHistoryError] = useState(''), [revision, setRevision] = useState(0), [exporting, setExporting] = useState(false);

  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);
  const request = useRef(''), lock = useRef(false);

  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) setCounts(JSON.parse(savedDraft));
    } catch {}
  }, []);

  useEffect(() => {
    if (selectedImage && imageDialogRef.current && !imageDialogRef.current.open) {
      imageDialogRef.current.showModal();
    }
  }, [selectedImage]);

  useEffect(() => { let alive = true; void readItems().then(data => { if (alive) setItems(data); }).catch(e => { if (alive) setError(msg(e)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, []);
  useEffect(() => { let alive = true; void supabase.from('stocktakes').select('id,counted_by,note,created_at,stocktake_lines(id,item_name,product_code,unit,before_quantity,counted_quantity)', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range((historyPage - 1) * 10, historyPage * 10 - 1).then(({ data, error, count }) => { if (!alive) return; if (error) setHistoryError('กรุณารัน SQL ตั้งค่าตรวจนับคลังก่อนใช้งาน: ' + error.message); else { setHistoryError(''); setHistory((data || []) as History[]); setHistoryTotal(count || 0); } }); return () => { alive = false; }; }, [historyPage, revision]);

  const entered = items.filter(item => (counts[item.id] ?? '').trim() !== '');
  const valid = entered.every(item => /^\d+$/.test(counts[item.id]) && Number.isSafeInteger(Number(counts[item.id])) && Number(counts[item.id]) <= 2147483647);
  const visible = items.filter(item => (item.name + ' ' + (item.product_code || '')).toLowerCase().includes(search.toLowerCase()));
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(visible.length / 20)));
  const diffCount = valid ? entered.filter(item => item.stock_quantity !== null && Number(counts[item.id]) !== item.stock_quantity).length : 0;

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(counts));
      setNotice('บันทึกยอดนับร่างชั่วคราวเรียบร้อยแล้ว');
      setError('');
    } catch {
      setError('ไม่สามารถบันทึกร่างได้');
    }
  };

  const clearDraft = () => {
    if (!confirm('ยืนยันล้างรายการที่พิมพ์ค้างไว้ทั้งหมด?')) return;
    localStorage.removeItem(DRAFT_KEY);
    setCounts({});
    setNotice('ล้างยอดร่างเรียบร้อยแล้ว');
  };

  const refresh = async () => {
    if (entered.length && !confirm('โหลดข้อมูลใหม่และล้างยอดที่กรอกไว้ เพื่อเริ่มตรวจนับใหม่?')) return;
    setLoading(true);
    setError('');
    try {
      setItems(await readItems());
      setCounts({});
      localStorage.removeItem(DRAFT_KEY);
      request.current = '';
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (lock.current) return;
    if (!name.trim() || !entered.length || !valid) { setError('ระบุชื่อผู้ตรวจนับ และยอดนับจริงที่เป็นจำนวนเต็มอย่างน้อย 1 รายการ'); return; }
    if (entered.length > 500) { setError('บันทึกได้ครั้งละไม่เกิน 500 รายการ'); return; }
    if (!confirm('ยืนยันปรับยอดคลังตามยอดนับจริง ' + entered.length + ' รายการ และบันทึกประวัติ?')) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    if (!request.current) request.current = crypto.randomUUID();
    try {
      const { error } = await supabase.rpc('confirm_stocktake', { p_request_id: request.current, p_counted_by: name.trim(), p_note: note, p_lines: entered.map(item => ({ item_id: item.id, expected: item.stock_quantity, expected_unit: item.unit, counted: Number(counts[item.id]) })) });
      if (error) throw error;
      setItems(current => current.map(item => counts[item.id] !== undefined && counts[item.id] !== '' ? { ...item, stock_quantity: Number(counts[item.id]) } : item));
      setCounts({});
      localStorage.removeItem(DRAFT_KEY);
      request.current = '';
      setNotice('ปรับยอดคลังและบันทึกประวัติเรียบร้อยแล้ว');
      setNote('');
      setHistoryPage(1);
      setRevision(value => value + 1);
    } catch (e) {
      setError(msg(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const exportCounts = async () => {
    setExporting(true);
    try {
      await exportReportExcel('ผลตรวจนับคลัง', ['รหัสสินค้า', 'สินค้า', 'หน่วย', 'ยอดระบบ', 'นับจริง', 'ส่วนต่าง'],
        entered.map(item => [item.product_code || '', item.name, item.unit, item.stock_quantity, Number(counts[item.id]), item.stock_quantity === null ? 'ยังไม่ระบุ' : Number(counts[item.id]) - item.stock_quantity]),
        'Sampeng-stocktake.xlsx', 'ผู้ตรวจนับ: ' + name);
    } catch (e) { setError(msg(e)); } finally { setExporting(false); }
  };

  const change = (id: string, value: string) => { request.current = ''; setCounts(current => ({ ...current, [id]: value })); };

  return (
    <main className={ui.page}>
      <div className={ui.wrap}>
        <PageHero icon="📋" title="ตรวจนับคลัง / ปรับยอด" subtitle="กรอกเฉพาะสินค้าที่ตรวจนับ · เว้นว่าง = ไม่ปรับยอด · 0 = สินค้าหมด · ส่วนต่างเทียบยอดก่อนเริ่มนับ"
          actions={<>
            <button disabled={busy || loading} onClick={() => void refresh()} className={ui.heroBtn}>🔄 โหลดคลังใหม่</button>
            <a href="/admin/inventory" className={ui.heroPrimary}>← กลับหน้าคลัง</a>
          </>} />

        {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
        {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard accent="blue" icon="📦" label="สินค้าทั้งหมด" value={items.length.toLocaleString('th-TH')} unit="รายการ" hint="ในคลังตอนนี้" />
          <StatCard accent="sky" icon="✍️" label="กรอกยอดนับแล้ว" value={entered.length.toLocaleString('th-TH')} unit="รายการ" hint="รอยืนยันปรับยอด" />
          <StatCard accent="amber" icon="⚠️" label="ยอดไม่ตรงระบบ" value={diffCount.toLocaleString('th-TH')} unit="รายการ" hint="จะถูกปรับเมื่อยืนยัน" />
        </div>

        <section className={ui.card}>
          <fieldset disabled={busy || loading} className="min-w-0 space-y-4 border-b border-blue-100 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ชื่อผู้ตรวจนับ *"><input maxLength={200} placeholder="ระบุชื่อผู้ตรวจนับ..." className={ui.input} value={name} onChange={e => { request.current = ''; setName(e.target.value); }} /></Field>
              <Field label="หมายเหตุ"><input maxLength={2000} placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)..." className={ui.input} value={note} onChange={e => { request.current = ''; setNote(e.target.value); }} /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <button onClick={saveDraft} disabled={!entered.length} className={ui.secondary}>💾 บันทึกร่าง</button>
              {entered.length > 0 && <button onClick={clearDraft} className={ui.danger}>🗑️ ล้างร่าง</button>}
              <button disabled={exporting || !entered.length || !valid} onClick={() => void exportCounts()} className={ui.secondary}>{exporting ? 'กำลังส่งออก...' : '📊 Export ยอดตรวจนับ'}</button>
              <button disabled={!entered.length || !valid || Boolean(historyError)} onClick={() => void save()} className={ui.button + ' ml-auto'}>{busy ? 'กำลังบันทึก...' : `ยืนยันปรับยอด ${entered.length} รายการ`}</button>
              {entered.length > 0 && !valid && <p className="w-full text-xs font-bold text-red-600">ยอดนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป</p>}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 p-4">
            <SearchBox label="ค้นหาสินค้า" placeholder="ค้นหารหัส / ชื่อสินค้า..." value={search} onChange={v => { setSearch(v); setPage(1); }} />
            <p className="ml-auto text-xs font-semibold text-slate-500">แสดง <b className="text-[#1a3a6e]">{visible.length.toLocaleString('th-TH')}</b> จาก {items.length.toLocaleString('th-TH')} รายการ{search && <button type="button" className="ml-3 font-black text-blue-700 hover:underline" onClick={() => setSearch('')}>ล้างตัวกรอง</button>}</p>
          </div>

          {loading ? <Skeleton rows={6} /> : <div className="overflow-x-auto">
            <table className="w-full min-w-187.5 text-left text-sm">
              <thead className={ui.thead}><tr>
                <th className="w-16 px-4 py-3.5 text-center">ลำดับ</th><th className="px-4 py-3.5">รูป</th><th className="px-4 py-3.5">สินค้า</th><th className="px-4 py-3.5">หน่วย</th>
                <th className="px-4 py-3.5 text-right">ยอดระบบ</th><th className="px-4 py-3.5">นับจริง</th><th className="px-4 py-3.5 text-right">ส่วนต่าง</th>
              </tr></thead>
              <tbody className="divide-y divide-blue-50">
                {visible.slice((visiblePage - 1) * 20, visiblePage * 20).map((item, index) => {
                  const raw = counts[item.id];
                  const hasCount = raw !== undefined && raw !== '';
                  const diff = hasCount && item.stock_quantity !== null ? Number(raw) - item.stock_quantity : null;
                  return <tr key={item.id} className={'transition-colors hover:bg-blue-50/40 ' + (hasCount ? 'bg-sky-50/40' : '')}>
                    <td className="px-4 py-3 text-center text-xs font-semibold tabular-nums text-slate-400">{(visiblePage - 1) * 20 + index + 1}</td>
                    <td className="px-4 py-3">
                      <button type="button" disabled={!item.image_url} aria-label={'ดูรูป ' + item.name} onClick={() => { if (item.image_url) setSelectedImage({ url: item.image_url, name: item.name }); }} className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-blue-50 enabled:cursor-zoom-in enabled:hover:ring-2 enabled:hover:ring-blue-300">
                        <span className="text-xl" aria-hidden="true">📦</span>
                        {item.image_url && <img src={item.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={e => { e.currentTarget.style.display = 'none'; }} />}
                      </button>
                    </td>
                    <td className="px-4 py-3"><p className="font-black text-[#1a3a6e]">{item.name}</p><p className="font-mono text-xs text-slate-500">{item.product_code || '—'}</p></td>
                    <td className="px-4 py-3"><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-900">{item.unit}</span></td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{item.stock_quantity?.toLocaleString('th-TH') ?? <span className="text-xs font-normal text-slate-400">ยังไม่ระบุ</span>}</td>
                    <td className="px-4 py-3"><input aria-label={'ยอดนับ ' + item.name} disabled={busy} className={ui.input + ' h-11 w-28'} type="number" min={0} max={2147483647} step={1} placeholder="0" value={raw ?? ''} onChange={e => change(item.id, e.target.value)} /></td>
                    <td className={'px-4 py-3 text-right font-black tabular-nums ' + (diff === null ? 'text-slate-300' : diffClass(diff))}>{diff === null ? '—' : diffText(diff)}</td>
                  </tr>;
                })}
                {!visible.length && <tr><td colSpan={7}><EmptyState icon="📭" title="ไม่พบสินค้า" hint="ลองเปลี่ยนคำค้นหา" /></td></tr>}
              </tbody>
            </table>
          </div>}
          <div className="border-t border-blue-50 bg-slate-50/50 px-4 py-3"><ReportPagination page={visiblePage} totalRows={visible.length} onChange={setPage} /></div>
        </section>

        <section className={ui.card}>
          <div className="border-b border-blue-100 p-4"><h2 className="font-black text-[#1a3a6e]">ประวัติการตรวจนับ / ปรับยอด</h2></div>
          <div className="space-y-3 p-4">
            {historyError && <Notice tone="error">{historyError}</Notice>}
            {history.map(record => <details key={record.id} className="group rounded-xl border border-blue-100 bg-white open:bg-blue-50/20">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 text-sm">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{(record.counted_by || '?').trim().slice(0, 1)}</span>
                <span className="font-bold text-[#1a3a6e]">{record.counted_by}</span>
                <span className="text-slate-500">{new Date(record.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
                <span className="ml-auto rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">{record.stocktake_lines.length} รายการ</span>
              </summary>
              <div className="border-t border-blue-100 px-4 pb-3">
                {record.note && <p className="py-2 text-sm text-slate-500">{record.note}</p>}
                {record.stocktake_lines.map(line => {
                  const d = line.before_quantity === null ? null : line.counted_quantity - line.before_quantity;
                  return <p key={line.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-50 py-2 text-sm first:border-t-0">
                    <span><span className="font-mono text-xs text-slate-500">{line.product_code}</span> · <b>{line.item_name}</b></span>
                    <span className="tabular-nums text-slate-600">{line.before_quantity ?? 'ยังไม่ระบุ'} → {line.counted_quantity} {line.unit} · <b className={d === null ? 'text-slate-400' : diffClass(d)}>{d === null ? '—' : diffText(d)}</b></span>
                  </p>;
                })}
              </div>
            </details>)}
            {!history.length && !historyError && <EmptyState icon="🗂️" title="ยังไม่มีประวัติ" hint="เมื่อยืนยันปรับยอดครั้งแรก ประวัติจะแสดงที่นี่" />}
          </div>
          <div className="border-t border-blue-50 bg-slate-50/50 px-4 py-3"><ReportPagination page={historyPage} totalRows={historyTotal} pageSize={10} onChange={setHistoryPage} /></div>
        </section>
      </div>

      {selectedImage && (
        <dialog ref={imageDialogRef} aria-label={`รูปสินค้า ${selectedImage.name}`} onClose={() => setSelectedImage(null)} onClick={e => { if (e.target === e.currentTarget) imageDialogRef.current?.close(); }} className="fixed inset-0 m-auto h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-4 outline-none backdrop:bg-slate-950/80 open:flex open:items-center open:justify-center">
          <div className="relative max-w-5xl rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl sm:p-5">
            <button type="button" autoFocus aria-label="ปิดรูปขยาย" onClick={() => imageDialogRef.current?.close()} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3a6e] text-xl font-bold text-white shadow-md hover:bg-blue-800">×</button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-h-[75dvh] max-w-full rounded-xl object-contain" />
            <p className="mt-3 text-center text-sm font-bold text-[#1a3a6e]">{selectedImage.name}</p>
          </div>
        </dialog>
      )}
    </main>
  );
}