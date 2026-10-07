'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AdminNav from '@/components/AdminNav';

interface InventoryItem {
  id: string;
  product_code: string;
  name: string;
  unit: string;
  price: number;
  is_active: boolean;
  image_url: string;
}

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_code: '',
    name: '',
    unit: '',
    price: 0,
    is_active: true,
    image_url: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  
  // เพิ่ม State สำหรับจัดการแผนก
  const [allBranches, setAllBranches] = useState<{ id: string, name: string }[]>([]);

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (data) setItems(data);
    if (error) console.error(error);
    setLoading(false);
  }

  // ฟังก์ชันดึงแผนก
  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('*').order('name');
    if (data) setAllBranches(data);
  }

  useEffect(() => {
    fetchInventory();
    fetchBranches();
  }, []);

  // ฟังก์ชันลบแผนก
  const deleteBranch = async (id: string) => {
    if (!window.confirm('ยืนยันการลบแผนกนี้?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) { alert('ลบแผนกไม่สำเร็จ: ' + error.message); return; }
    fetchBranches();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file);

    if (uploadError) {
      alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } else {
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setFormData((prev) => ({ ...prev, image_url: data.publicUrl }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('กรุณากรอกชื่อสินค้า');
      return;
    }
    if (!formData.unit.trim()) {
      alert('กรุณากรอกหน่วยนับ');
      return;
    }

    const dataToSave = {
      product_code: formData.product_code.trim(),
      name: formData.name.trim(),
      unit: formData.unit.trim(),
      price: Number(formData.price) || 0,
      is_active: formData.is_active,
      image_url: formData.image_url,
    };

    if (editingItem?.id) {
      const { error } = await supabase.from('items').update(dataToSave).eq('id', editingItem.id);
      if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('items').insert(dataToSave);
      if (error) { alert('เพิ่มสินค้าไม่สำเร็จ: ' + error.message); return; }
    }

    setEditingItem(null);
    setFormData({ product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
    await fetchInventory();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบรายการนี้?')) return;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    fetchInventory();
  };

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) { alert('กรุณากรอกชื่อแผนก'); return; }
    const { error } = await supabase.from('branches').insert([{ name: newBranchName.trim() }]);
    if (error) { alert('เพิ่มแผนกไม่สำเร็จ: ' + error.message); return; }
    setNewBranchName('');
    fetchBranches();
    alert('เพิ่มแผนกเรียบร้อยแล้ว');
  };

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.product_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-blue-700 font-bold text-base">กำลังโหลดข้อมูลคลังสินค้า...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#e8edf5] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">

        <AdminNav activeHref="/admin/inventory" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-5 rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">📦 คลังสินค้า</h1>
            <p className="text-xs font-semibold text-blue-700 mt-1 uppercase tracking-widest">จัดการรายการสินค้าและแผนก</p>
          </div>
          <div className="flex gap-2 shrink-0">
          <p className="text-xs text-left font-semibold text-blue-700 mt-1 uppercase tracking-widest">ค้นหารายชื่อสินค้า <br />
            <input
              type="text"
              placeholder="🔍 ค้นหาชื่อสินค้าหรือรหัส..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-3 text-sm border border-blue-100 bg-blue-50 px-4 py-2.5 rounded-xl w-full sm:w-72 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all font-medium text-slate-700 placeholder:text-slate-400"
            /></p>
            <button
              onClick={() => setIsBranchModalOpen(true)}
              className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-800 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-50 shadow-sm transition-all active:scale-95"
            >
              🏬 จัดการแผนก
            </button>
            <button
              onClick={() => {
                setEditingItem({ id: '', product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
                setFormData({ product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
              }}
              className="inline-flex items-center gap-2 bg-linear-to-r from-blue-700 to-blue-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:from-blue-800 hover:to-blue-900 shadow-md shadow-blue-200/50 transition-all active:scale-95"
            >
              + เพิ่มสินค้า
            </button>
          </div>
        </div>

        {/* ── Branch Modal (อัปเดตใหม่) ── */}
        {isBranchModalOpen && (
          <div className="fixed inset-0 bg-[#1a3a6e]/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-blue-100 space-y-4 max-h-[80vh] overflow-y-auto">
              <h3 className="font-black text-base text-slate-800">🏬 จัดการแผนก</h3>
              <div className="flex gap-2">
                <input
                  placeholder="ชื่อแผนกใหม่..."
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="flex-1 border border-blue-100 bg-blue-50/30 px-4 py-2 rounded-xl text-sm outline-none"
                />
                <button onClick={handleAddBranch} className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold">เพิ่ม</button>
              </div>
              <div className="space-y-2 pt-2 border-t">
                {allBranches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl">
                    <span className="text-sm font-bold text-slate-700">{b.name}</span>
                    <button onClick={() => deleteBranch(b.id)} className="text-red-500 text-xs font-bold hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all">ลบ</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setIsBranchModalOpen(false)} className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold mt-2">ปิด</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm shadow-blue-100/50 border border-blue-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-blue-50/80 border-b border-blue-100">
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider">รูปภาพ</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider">รหัสสินค้า</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider">ชื่อสินค้า</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider text-center">หน่วยนับ</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider text-right">ราคา / หน่วย</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider text-center">สถานะ</th>
                  <th className="p-4 font-black text-blue-700 uppercase tracking-wider text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-24 text-center text-blue-400 font-bold text-sm tracking-wide">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl">📦</span>
                        {searchTerm ? `ไม่พบรายการ "${searchTerm}"` : 'ยังไม่มีสินค้าในระบบ'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item, idx) => (
                    <tr 
                      key={item.id} 
                      className={`group transition-all ${idx % 2 === 1 ? 'bg-blue-50/20' : 'bg-white'} hover:bg-blue-50/60`}
                    >
                      <td className="p-4">
                        {item.image_url ? (
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-blue-100 shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all">
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onClick={() => setSelectedImage(item.image_url)}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[10px] text-blue-400 font-bold border border-blue-100 border-dashed">
                            ไม่มีรูป
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs font-semibold text-slate-400">{item.product_code || '—'}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-block bg-blue-50 text-blue-900 px-3 py-1 rounded-lg text-xs font-bold">
                          {item.unit}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black text-slate-700">
                        {(item.price ?? 0).toLocaleString()} 
                        <span className="ml-1 text-[10px] text-blue-700 font-bold">฿</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${item.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                          {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setEditingItem(item); setFormData(item); }}
                            className="text-xs font-bold text-blue-800 hover:text-white hover:bg-blue-500 border border-blue-200 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-xs font-bold text-red-500 hover:text-white hover:bg-red-600 border border-red-200 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="px-5 py-4 bg-white border-t border-blue-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  หน้า {currentPage} จาก {totalPages} ({filteredItems.length} รายการ)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-100"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-100"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
              )}
            </div>
         </div>
        {selectedImage && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#1a3a6e]/40 backdrop-blur-sm cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <img src={selectedImage} alt="Preview" className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border-4 border-white" />
          </div>
        )}

        {editingItem && (
          <div className="fixed inset-0 bg-[#1a3a6e]/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl shadow-blue-200/50 border border-blue-100 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 pb-3 border-b border-blue-50">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-[#1a3a6e] to-[#2451a0] flex items-center justify-center text-white shadow-sm text-base">
                  {editingItem.id ? '✏️' : '✨'}
                </div>
                <h3 className="font-black text-base text-slate-800">{editingItem.id ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-blue-700 uppercase tracking-widest">รูปภาพสินค้า</label>
                  <div className="flex items-center gap-3">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-sm font-bold border border-blue-100 hover:bg-blue-100 transition-all disabled:opacity-60"
                    >
                      {uploading ? '⏳ กำลังอัปโหลด...' : '📷 เลือกรูปภาพ'}
                    </button>
                    {formData.image_url && (
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))} className="text-xs text-red-500 hover:text-red-600 font-bold">ลบรูป</button>
                    )}
                  </div>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="preview" className="w-20 h-20 object-cover rounded-xl border border-blue-100 shadow-sm" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-blue-700 uppercase tracking-widest">รหัสสินค้า</label>
                  <input
                    placeholder="เช่น PRD-001"
                    value={formData.product_code || ''}
                    onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                    className="w-full border border-blue-100 bg-blue-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-blue-700 uppercase tracking-widest">ชื่อสินค้า <span className="text-red-500">*</span></label>
                  <input
                    placeholder="ชื่อสินค้า"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-blue-100 bg-blue-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-blue-700 uppercase tracking-widest">หน่วยนับ <span className="text-red-500">*</span></label>
                  <input
                    placeholder="เช่น ชิ้น, กล่อง, แผ่น"
                    value={formData.unit || ''}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border border-blue-100 bg-blue-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-blue-700 uppercase tracking-widest">ราคาต่อหน่วย (฿)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-blue-100 bg-blue-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-blue-50/40 hover:bg-blue-50 border border-blue-100/60 rounded-xl transition-all">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-5 w-5 accent-blue-700 rounded"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-700">เปิดใช้งานรายการนี้</span>
                    <p className="text-xs text-slate-400 mt-0.5">สินค้าจะแสดงในหน้าเบิกของแผนก</p>
                  </div>
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditingItem(null); }} className="flex-1 py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl font-bold text-sm hover:bg-blue-100 transition-all">ยกเลิก</button>
                <button onClick={handleSave} disabled={uploading} className="flex-1 py-3 bg-linear-to-r from-blue-700 to-blue-800 text-white rounded-xl font-black text-sm hover:from-blue-800 hover:to-blue-900 shadow-md shadow-blue-200 transition-all disabled:opacity-60">บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}