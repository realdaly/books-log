"use client";
import { useEffect, useState, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, Trash2, Edit2, Eye, Image as ImageIcon } from "lucide-react";
import html2canvas from "html2canvas";
import { save, message, ask } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

export default function PartiesPage() {
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);

    // CRUD State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: "", phone: "", address: "", notes: "" });
    const [editId, setEditId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    // Details State
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedParty, setSelectedParty] = useState(null);
    const [partyTransactions, setPartyTransactions] = useState([]);
    const [filterType, setFilterType] = useState("all");

    const fetchData = useCallback(async () => {
        try {
            const db = await getDb();
            const rows = await db.select("SELECT * FROM party ORDER BY id DESC");
            setParties(rows);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            if (editId) {
                await db.execute(
                    "UPDATE party SET name=$1, phone=$2, address=$3, notes=$4 WHERE id=$5",
                    [formData.name, formData.phone, formData.address, formData.notes, editId]
                );
            } else {
                await db.execute(
                    "INSERT INTO party (name, phone, address, notes) VALUES ($1, $2, $3, $4)",
                    [formData.name, formData.phone, formData.address, formData.notes]
                );
            }
            setIsModalOpen(false);
            setEditId(null);
            setFormData({ name: "", phone: "", address: "", notes: "" });
            fetchData();
        } catch (err) {
            alert("Error saving: " + err.message);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await ask("هل انت متأكد من الحذف؟ سيتم حذف جميع العلاقة.", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        const db = await getDb();
        try {
            await db.execute("DELETE FROM party WHERE id=$1", [id]);
            setSelectedIds(prev => prev.filter(i => i !== id));
            fetchData();
        } catch (e) {
            alert("لا يمكن حذف جهة مرتبطة بحركات");
        }
    };

    const handleBulkDelete = async () => {
        const confirmed = await ask(`هل انت متأكد من حذف ${selectedIds.length} عنصر؟`, { title: 'تأكيد الحذف المتعدد', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            let failedCount = 0;
            for (const id of selectedIds) {
                try {
                    await db.execute("DELETE FROM party WHERE id=$1", [id]);
                } catch (e) {
                    failedCount++;
                }
            }
            if (failedCount > 0) {
                alert(`تم حذف البعض، وفشل حذف ${failedCount} جهة بسبب وجود حركات مرتبطة بها`);
            }
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredParties.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredParties.map(p => p.id));
        }
    };

    const openEdit = (p) => {
        setFormData({
            name: p.name,
            phone: p.phone || "",
            address: p.address || "",
            notes: p.notes || ""
        });
        setEditId(p.id);
        setIsModalOpen(true);
    };

    const viewDetails = async (p) => {
        setSelectedParty(p);
        setDetailsOpen(true);
        setLoading(true);
        try {
            const db = await getDb();
            const txs = await db.select(`
            SELECT t.*, b.title as book_title
            FROM "transaction" t
            JOIN book b ON t.book_id = b.id
            WHERE t.party_id = $1
            ORDER BY t.tx_date DESC
        `, [p.id]);
            setPartyTransactions(txs);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const exportAsImage = async () => {
        const input = document.getElementById('pdf-export-content');
        if (!input) return;

        try {
            // Temporarily show PDF-only content
            const pdfElements = input.querySelectorAll('.pdf-only');
            pdfElements.forEach(el => el.style.display = 'flex');

            // Clone the element to capture full content without scrollbars
            const clone = input.cloneNode(true);
            document.body.appendChild(clone);

            // Style the clone to be visible to html2canvas but off-screen for the user
            Object.assign(clone.style, {
                position: 'fixed',
                left: '-9999px',
                top: '0',
                width: '1000px', // Wider capture for better table fit
                height: 'auto',
                backgroundColor: '#ffffff',
                display: 'block'
            });

            // Find the scrollable container in the clone and expand it
            const cloneScrollContainer = clone.querySelector('.max-h-\\[60vh\\]');
            if (cloneScrollContainer) {
                cloneScrollContainer.style.maxHeight = 'none';
                cloneScrollContainer.style.overflowY = 'visible';
            }

            // Small delay to ensure any layout shifts for the clone complete
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(clone, {
                scale: 3, // Higher resolution
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            // Cleanup clone and restore original view
            document.body.removeChild(clone);
            pdfElements.forEach(el => el.style.display = 'none');

            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const base64Data = imgData.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            const prefixMap = {
                all: 'سجل حركات',
                sale: 'سجل المباع الى',
                gift: 'سجل اهداءات',
                loan: 'سجل استعارات'
            };
            const prefix = prefixMap[filterType] || 'سجل';

            const path = await save({
                filters: [{ name: 'Image', extensions: ['jpg'] }],
                defaultPath: `${prefix} ${selectedParty?.name} ${new Date().toISOString().split('T')[0]}.jpg`
            });

            if (path) {
                await writeFile(path, byteArray);
                // No need for standard download trigger as writeFile handles it
            }

        } catch (error) {
            console.error('Export Error:', error);
            await message('حدث خطأ أثناء التصدير: ' + error.message, { title: 'خطأ', type: 'error' });
        }
    };

    const filteredTxs = partyTransactions.filter(t => filterType === "all" || t.type === filterType);

    const [searchTerm, setSearchTerm] = useState("");

    const filteredParties = parties.filter(p =>
        normalizeArabic(p.name).includes(normalizeArabic(searchTerm))
    );

    if (loading && !detailsOpen) return <Loader2 className="animate-spin" />;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold text-primary">الجهات</h1>
                    {selectedIds.length > 0 && (
                        <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="animate-in fade-in slide-in-from-left-2">
                            <Trash2 className="ml-2" size={16} />
                            حذف المحدد ({selectedIds.length})
                        </Button>
                    )}
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="بحث عن جهة..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full md:w-64"
                    />
                    <Button onClick={() => { setEditId(null); setFormData({ name: "", phone: "", address: "", notes: "" }); setIsModalOpen(true); }}>
                        <Plus className="ml-2" size={18} /> إضافة جهة
                    </Button>
                </div>
            </div>

            <Card className="flex-1 p-0 overflow-hidden border-0 shadow-lg bg-white/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground font-bold sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 border-l border-primary-foreground/10 text-center w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-primary-foreground/20 accent-white"
                                        checked={filteredParties.length > 0 && selectedIds.length === filteredParties.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="p-4 border-l border-primary-foreground/10">اسم الجهة</th>
                                <th className="p-4 border-l border-primary-foreground/10">الهاتف</th>
                                <th className="p-4 border-l border-primary-foreground/10">العنوان</th>
                                <th className="p-4 border-l border-primary-foreground/10">ملاحظات</th>
                                <th className="p-4 text-center">اجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-white">
                            {filteredParties.map(p => (
                                <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${selectedIds.includes(p.id) ? 'bg-primary/5' : ''}`}>
                                    <td className="p-4 text-center border-l border-border/50 w-10">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            checked={selectedIds.includes(p.id)}
                                            onChange={() => toggleSelect(p.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-bold text-foreground border-l border-border/50">{p.name}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50">{p.phone}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50">{p.address}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50">{p.notes}</td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <button onClick={() => viewDetails(p)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors" title="تفاصيل"><Eye size={18} /></button>
                                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={18} /></button>
                                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                            {filteredParties.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="p-8 text-center text-muted-foreground">
                                        لا توجد بيانات
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Add/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "تعديل جهة" : "إضافة جهة"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">اسم الجهة</label>
                        <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">الهاتف</label>
                        <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">العنوان</label>
                        <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">ملاحظات</label>
                        <Textarea rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                    </div>
                    <Button type="submit" className="w-full">حفظ</Button>
                </form>
            </Modal>

            {/* Details Modal */}
            <Modal
                isOpen={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={`سجل حركات: ${selectedParty?.name || ''}`}
                maxWidth="max-w-3xl"
            >
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-gray-50 p-2 rounded-xl border">
                        <div className="flex gap-2">
                            <button onClick={() => setFilterType("all")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'all' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-white text-muted-foreground hover:bg-gray-100 border'}`}>الكل</button>
                            <button onClick={() => setFilterType("sale")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'sale' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-white text-muted-foreground hover:bg-gray-100 border'}`}>بيع</button>
                            <button onClick={() => setFilterType("gift")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'gift' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-white text-muted-foreground hover:bg-gray-100 border'}`}>اهداء</button>
                            <button onClick={() => setFilterType("loan")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'loan' ? 'bg-primary text-primary-foreground shadow-md' : 'bg-white text-muted-foreground hover:bg-gray-100 border'}`}>استعارة</button>
                        </div>
                        <Button
                            onClick={exportAsImage}
                            disabled={filteredTxs.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm transition-all"
                        >
                            <ImageIcon size={18} />
                            حفظ كصورة
                        </Button>
                    </div>

                    <div id="pdf-export-content" className="p-1">
                        {/* Hidden title for PDF only */}
                        <div className="hidden pdf-only flex flex-col items-center mb-8 border-b-2 border-primary pb-6">
                            <h2 className="text-3xl font-black text-primary mb-2">سجل حركات الكتب</h2>
                            <div className="flex gap-8 text-lg font-bold text-gray-700 italic">
                                <span>الجهة: {selectedParty?.name}</span>
                                <span>النوع: {filterType === 'all' ? 'الكل' : (filterType === 'sale' ? 'بيع' : (filterType === 'gift' ? 'اهداء' : 'استعارة'))}</span>
                                <span>التاريخ: {new Date().toLocaleDateString('ar-EG')}</span>
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto border rounded-2xl shadow-lg bg-white custom-scrollbar transition-all duration-300">
                            <table className="w-full text-right text-sm border-collapse">
                                <thead className="bg-primary text-primary-foreground sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 border-l border-primary-foreground/10 text-center font-black">النوع</th>
                                        <th className="p-4 border-l border-primary-foreground/10 font-black">اسم الكتاب</th>
                                        <th className="p-4 border-l border-primary-foreground/10 text-center font-black">العدد</th>
                                        <th className="p-4 font-black">التاريخ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredTxs.map(t => (
                                        <tr key={t.id} className="hover:bg-primary/5 transition-colors group">
                                            <td className="p-4 border-l border-border/50 text-center">
                                                {t.type === 'sale' && <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">بيع</span>}
                                                {t.type === 'gift' && <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-black">اهداء</span>}
                                                {t.type === 'loan' && <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">استعارة</span>}
                                            </td>
                                            <td className="p-4 font-bold text-foreground border-l border-border/50 group-hover:text-primary transition-colors">{t.book_title}</td>
                                            <td className="p-4 font-black text-center border-l border-border/50 text-primary text-base">{t.qty}</td>
                                            <td className="p-4 text-muted-foreground font-medium tracking-tighter">
                                                {t.tx_date?.split('-').reverse().join('/')}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredTxs.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="p-20 text-center text-muted-foreground text-lg">
                                                لا توجد بيانات لهذا التصنيف
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
