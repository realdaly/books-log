"use client";
import { useEffect, useState, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, Trash2, Edit2, Eye, Image as ImageIcon, Tag, Filter, Settings, Search } from "lucide-react";
import html2canvas from "html2canvas";
import { NotesCell } from "../../components/ui/NotesCell";
import { save, message, ask } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

export default function PartiesPage() {
    const [parties, setParties] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // CRUD State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: "", phone: "", address: "", notes: "" });
    const [formCategoryIds, setFormCategoryIds] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState("");

    // Category Management
    const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);

    const [editId, setEditId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    // Filters
    const [filterCategoryIds, setFilterCategoryIds] = useState([]);

    // Details State
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedParty, setSelectedParty] = useState(null);
    const [partyTransactions, setPartyTransactions] = useState([]);
    const [filterType, setFilterType] = useState("all");

    const fetchData = useCallback(async () => {
        try {
            const db = await getDb();
            // Fetch Parties with their Category IDs
            const partiesRows = await db.select(`
                SELECT p.*, GROUP_CONCAT(pcl.category_id) as cat_ids 
                FROM party p 
                LEFT JOIN party_category_link pcl ON p.id = pcl.party_id 
                GROUP BY p.id 
                ORDER BY p.id DESC
            `);

            // Normalize cat_ids to array
            const partiesWithCats = partiesRows.map(p => ({
                ...p,
                categoryIds: p.cat_ids ? String(p.cat_ids).split(',').map(Number) : []
            }));

            setParties(partiesWithCats);

            // Fetch All Categories
            const catRows = await db.select("SELECT * FROM party_category ORDER BY name ASC");
            setCategories(catRows);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;
        try {
            const db = await getDb();
            await db.execute("INSERT INTO party_category (name) VALUES ($1)", [newCategoryName.trim()]);
            setNewCategoryName("");

            // Refresh categories only
            const catRows = await db.select("SELECT * FROM party_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ: ربما التصنيف موجود مسبقاً");
        }
    };

    const toggleFormCategory = (catId) => {
        setFormCategoryIds(prev =>
            prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
        );
    };

    const toggleFilterCategory = (catId) => {
        setFilterCategoryIds(prev =>
            prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            let pId = editId;

            if (editId) {
                await db.execute(
                    "UPDATE party SET name=$1, phone=$2, address=$3, notes=$4 WHERE id=$5",
                    [formData.name, formData.phone, formData.address, formData.notes, editId]
                );
                // Update Categories for single edit
                await db.execute("DELETE FROM party_category_link WHERE party_id=$1", [editId]);
                for (const cId of formCategoryIds) {
                    await db.execute("INSERT INTO party_category_link (party_id, category_id) VALUES ($1, $2)", [editId, cId]);
                }
            } else {
                const names = formData.name.split('\n').map(n => n.trim()).filter(n => n !== "");
                for (const name of names) {
                    try {
                        const res = await db.execute(
                            "INSERT OR IGNORE INTO party (name, phone, address, notes) VALUES ($1, $2, $3, $4)",
                            [name, formData.phone, formData.address, formData.notes]
                        );
                        // In many SQLite drivers, lastInsertId is only > 0 if a row was actually inserted
                        const pId = res.lastInsertId;
                        if (pId > 0 && formCategoryIds.length > 0) {
                            for (const cId of formCategoryIds) {
                                await db.execute("INSERT OR IGNORE INTO party_category_link (party_id, category_id) VALUES ($1, $2)", [pId, cId]);
                            }
                        }
                    } catch (itemErr) {
                        console.error("Failed to add party:", name, itemErr);
                    }
                }
            }

            setIsModalOpen(false);
            setEditId(null);
            setFormData({ name: "", phone: "", address: "", notes: "" });
            setFormCategoryIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Error saving: " + (err.message || String(err)));
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
        setFormCategoryIds(p.categoryIds || []);
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

    const filteredParties = parties.filter(p => {
        const searchOk = normalizeArabic(p.name).includes(normalizeArabic(searchTerm));
        if (filterCategoryIds.length === 0) return searchOk;

        // AND logic (must have ALL selected categories)
        // User requested: "I want the item to never show if I picked a category in the filter that it doesn't have."
        const catOk = p.categoryIds && filterCategoryIds.every(fid => p.categoryIds.includes(fid));

        return searchOk && catOk;
    });

    const handleUpdateCategory = async (e) => {
        e.preventDefault();
        if (!editingCategory || !editingCategory.name.trim()) return;
        try {
            const db = await getDb();
            await db.execute("UPDATE party_category SET name=$1 WHERE id=$2", [editingCategory.name.trim(), editingCategory.id]);
            setEditingCategory(null);

            // Refresh
            const catRows = await db.select("SELECT * FROM party_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ في التعديل: " + e.message);
        }
    };

    const handleDeleteCategory = async (id) => {
        const confirmed = await ask("هل أنت متأكد من حذف هذا التصنيف؟ سيتم إزالته من جميع الجهات المرتبطة به.", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            await db.execute("DELETE FROM party_category WHERE id=$1", [id]);
            // Refresh
            const catRows = await db.select("SELECT * FROM party_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ في الحذف: " + e.message);
        }
    };

    if (loading && !detailsOpen) return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" size={48} /></div>;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col gap-4">
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
                        <div className="relative w-full md:w-80 group">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                            <Input
                                placeholder="بحث عن جهة..."
                                className="pr-10 w-full"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => { setEditId(null); setFormData({ name: "", phone: "", address: "", notes: "" }); setFormCategoryIds([]); setIsModalOpen(true); }}>
                            <Plus className="ml-2" size={18} /> إضافة جهة
                        </Button>
                    </div>
                </div>

                {/* Categories Filter Bar */}
                {categories.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg border">
                            <Filter size={16} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">تصفية حسب التصنيف:</span>
                        </div>
                        <div className="flex gap-2">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => toggleFilterCategory(cat.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${filterCategoryIds.includes(cat.id)
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                                        }`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                            {filterCategoryIds.length > 0 && (
                                <button
                                    onClick={() => setFilterCategoryIds([])}
                                    className="px-2 py-1 text-xs text-red-500 hover:text-red-700 font-bold"
                                >
                                    مسح
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setManageCategoriesOpen(true)}
                            className="mr-auto p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-full transition-colors"
                            title="إدارة التصنيفات"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                )}
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
                                <th className="p-4 border-l border-primary-foreground/10 w-[45%] text-right">اسم الجهة</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-40 text-right whitespace-nowrap">الهاتف</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[35%] text-right">العنوان</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[210px] text-right whitespace-nowrap">ملاحظات</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredParties.map(p => (
                                <tr key={p.id} className={`odd:bg-muted/30 even:bg-white hover:bg-primary/5 transition-colors ${selectedIds.includes(p.id) ? 'bg-primary/10' : ''}`}>
                                    <td className="p-4 text-center border-l border-border/50 w-10">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            checked={selectedIds.includes(p.id)}
                                            onChange={() => toggleSelect(p.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-bold text-foreground border-l border-border/50">
                                        <div>{p.name}</div>
                                        {/* Show Categories Here */}
                                        {p.categoryIds && p.categoryIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {p.categoryIds.map(cId => {
                                                    const cat = categories.find(c => c.id === cId);
                                                    if (!cat) return null;
                                                    return (
                                                        <span key={cId} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-sm border border-gray-200">
                                                            {cat.name}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 w-40 whitespace-nowrap">{p.phone}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50">{p.address}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 w-[210px] whitespace-nowrap overflow-hidden text-ellipsis">
                                        <NotesCell text={p.notes} />
                                    </td>
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
                        <Textarea
                            required
                            placeholder={editId ? "اسم الجهة" : "أدخل اسم الجهة (أدخل كل اسم في سطر جديد للإضافة المتعددة)"}
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="min-h-[4rem]"
                        />
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

                    {/* Category Management */}
                    <div className="pt-2 border-t mt-4">
                        <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                            <Tag size={16} /> التصنيفات
                        </label>

                        {/* New Category Input */}
                        <div className="flex items-center gap-2 mb-3">
                            <Input
                                placeholder="إضافة تصنيف جديد..."
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                                className="h-8 py-4 text-sm"
                            />
                            <Button
                                type="button"
                                onClick={handleAddCategory}
                                className="h-8 px-3 text-xs"
                            >
                                <Plus size={14} className="ml-1" /> إضافة
                            </Button>
                        </div>

                        {/* Category List */}
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded border">
                            {categories.length === 0 && <span className="text-xs text-gray-400">لا توجد تصنيفات</span>}
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => toggleFormCategory(cat.id)}
                                    className={`px-2 py-1 rounded-md text-xs font-bold transition-all border ${formCategoryIds.includes(cat.id)
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                        }`}
                                >
                                    {cat.name}
                                    {formCategoryIds.includes(cat.id) && " ✓"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Button type="submit" className="w-full mt-4 font-bold">حفظ</Button>
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

            {/* Category Management Modal */}
            <Modal isOpen={manageCategoriesOpen} onClose={() => { setManageCategoriesOpen(false); setEditingCategory(null); }} title="إدارة التصنيفات">
                <div className="space-y-4">
                    {/* New Category Input */}
                    {/* New Category Input */}
                    <form onSubmit={handleAddCategory} className="flex items-center gap-2">
                        <Input
                            placeholder="إضافة تصنيف جديد..."
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            className="h-10 text-sm"
                        />
                        <Button
                            type="submit"
                            className="h-10 px-4 text-sm"
                        >
                            <Plus size={16} className="ml-1" /> إضافة
                        </Button>
                    </form>

                    <div className="bg-gray-50 p-4 rounded-xl border">
                        <h3 className="font-bold text-sm text-gray-700 mb-3">تعديل المسميات</h3>
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {categories.map(cat => (
                                <div key={cat.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                                    {editingCategory?.id === cat.id ? (
                                        <form onSubmit={handleUpdateCategory} className="flex-1 flex gap-2">
                                            <Input
                                                autoFocus
                                                value={editingCategory.name}
                                                onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                                className="h-8 text-sm"
                                            />
                                            <Button size="sm" type="submit" className="h-8 bg-emerald-600 hover:bg-emerald-700">حفظ</Button>
                                            <Button size="sm" type="button" variant="ghost" onClick={() => setEditingCategory(null)} className="h-8">إلغاء</Button>
                                        </form>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm font-bold text-gray-700">{cat.name}</span>
                                            <button onClick={() => setEditingCategory(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                        </>
                                    )}
                                </div>
                            ))}
                            {categories.length === 0 && <p className="text-gray-400 text-center text-sm py-4">لا توجد تصنيفات</p>}
                        </div>
                    </div>
                </div>
            </Modal >
        </div >
    );
}
