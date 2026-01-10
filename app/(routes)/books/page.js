"use client";
import { useEffect, useState, useMemo } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, Trash2, Edit2, Image as ImageIcon, BarChart3, BookOpenText, LayoutGrid, List } from "lucide-react";
import { ask, open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

// Modern Color Palette for Charts
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280']; // Emerald, Blue, Amber, Red, Gray

export default function BooksPage() {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsBook, setDetailsBook] = useState(null);
    const [bookStats, setBookStats] = useState(null);
    const [viewMode, setViewMode] = useState("list"); // "grid" | "list"

    const [query, setQuery] = useState("");

    // CRUD State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        title: "", notes: "", total_printed: "0", sent_to_institution: "0",
        qom_sold_manual: "0", qom_gifted_manual: "0", qom_pending_manual: "0", loss_manual: "0", unit_price: "0",
        cover_image: null
    });
    const [editId, setEditId] = useState(null);

    const filteredBooks = useMemo(() => {
        if (!query) return books;
        const normalizedQuery = normalizeArabic(query);
        return books.filter(b => normalizeArabic(b.title).includes(normalizedQuery));
    }, [books, query]);

    // Handle ESC key to close details
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setDetailsBook(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Fetch Books
    const fetchData = async () => {
        try {
            const db = await getDb();
            const rows = await db.select("SELECT * FROM book ORDER BY title ASC");
            setBooks(rows);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Image Handling ---
    const handleImageUpload = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });

            if (selected) {
                // Read file as binary
                const contents = await readFile(selected);
                // Convert to Base64
                const base64 = typeof window !== 'undefined' ?
                    btoa(new Uint8Array(contents).reduce((data, byte) => data + String.fromCharCode(byte), '')) : '';

                const mimeType = selected.toLowerCase().endsWith('.png') ? 'image/png' :
                    selected.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';

                setFormData({ ...formData, cover_image: `data:${mimeType};base64,${base64}` });
            }
        } catch (err) {
            console.error("Image upload failed", err);
            await ask("فشل تحميل الصورة. الرجاء المحاولة مرة أخرى.", { title: "خطأ", kind: "error" });
        }
    };

    // --- Stats & Details ---
    const openDetails = async (book) => {
        setDetailsBook(book);
        setDetailsLoading(true);
        try {
            const db = await getDb();

            // Get Transaction Sums
            // We use simple queries for now. 
            const sales = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='sale'", [book.id]);
            const gifts = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='gift'", [book.id]);
            const loans = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='loan'", [book.id]);
            const loss = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='loss'", [book.id]);
            const pending = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='pending'", [book.id]);

            const realSold = sales[0].total || 0;
            const realGifted = gifts[0].total || 0;
            const realLoaned = loans[0].total || 0;
            const realLoss = loss[0].total || 0;
            const realPending = pending[0].total || 0;

            const manualSold = book.qom_sold_manual || 0;
            const manualGifted = book.qom_gifted_manual || 0;
            const manualPending = book.qom_pending_manual || 0;
            const manualLoss = book.loss_manual || 0;
            const sentInst = book.sent_to_institution || 0;

            const totalPrinted = book.total_printed || 0;

            // aggregated
            const totalSold = realSold + manualSold;
            const totalGifted = realGifted + manualGifted;

            // "Total Remaining" Logic (Matches Inventory Page):
            // Total Printed - (All Real Outflows + All Manual Outflows)
            const totalOutflows =
                realSold + realGifted + realLoaned + realLoss + realPending +
                manualSold + manualGifted + manualPending + manualLoss;

            const currentStock = Math.max(0, totalPrinted - totalOutflows);

            setBookStats({
                totalPrinted,
                totalSold,
                totalGifted,
                realLoaned,
                manualPending,
                manualLoss,
                sentInst,
                currentStock
            });

        } catch (e) {
            console.error(e);
        } finally {
            setDetailsLoading(false);
        }
    };

    // --- CRUD ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            const { title, notes, total_printed, sent_to_institution, qom_sold_manual, qom_gifted_manual, qom_pending_manual, loss_manual, unit_price, cover_image } = formData;

            const nTotal = Number(total_printed) || 0;
            const nSent = Number(sent_to_institution) || 0;
            const nQomSold = Number(qom_sold_manual) || 0;
            const nQomGifted = Number(qom_gifted_manual) || 0;
            const nQomPending = Number(qom_pending_manual) || 0;
            const nLoss = Number(loss_manual) || 0;
            const nPrice = Number(unit_price) || 0;

            if (editId) {
                // Update Single
                await db.execute(`
                    UPDATE book SET title=$1, notes=$2, total_printed=$3, sent_to_institution=$4, qom_sold_manual=$5, 
                    qom_gifted_manual=$6, qom_pending_manual=$7, loss_manual=$8, unit_price=$9, cover_image=$10 WHERE id=$11
                `, [title, notes, nTotal, nSent, nQomSold, nQomGifted, nQomPending, nLoss, nPrice, cover_image, editId]);
            } else {
                // Bulk Add Support
                const titles = title.split('\n').map(t => t.trim()).filter(t => t !== "");
                for (const t of titles) {
                    await db.execute(`
                        INSERT INTO book (title, notes, total_printed, sent_to_institution, qom_sold_manual, qom_gifted_manual, 
                        qom_pending_manual, loss_manual, unit_price, cover_image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [t, notes, nTotal, nSent, nQomSold, nQomGifted, nQomPending, nLoss, nPrice, cover_image]);
                }
            }
            setIsModalOpen(false);
            setEditId(null);
            resetForm();
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await ask("هل انت متأكد من حذف الكتاب؟ سيتم حذف جميع الحركات المرتبطة به!", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        const db = await getDb();
        await db.execute("DELETE FROM book WHERE id=$1", [id]);
        fetchData();
        if (detailsBook?.id === id) setDetailsBook(null);
    };

    const openEdit = (b) => {
        setFormData({
            title: b.title,
            notes: b.notes || "",
            total_printed: String(b.total_printed || 0),
            sent_to_institution: String(b.sent_to_institution || 0),
            qom_sold_manual: String(b.qom_sold_manual || 0),
            qom_gifted_manual: String(b.qom_gifted_manual || 0),
            qom_pending_manual: String(b.qom_pending_manual || 0),
            loss_manual: String(b.loss_manual || 0),
            unit_price: String(b.unit_price || 0),
            cover_image: b.cover_image
        });
        setEditId(b.id);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            title: "", notes: "", total_printed: "0", sent_to_institution: "0",
            qom_sold_manual: "0", qom_gifted_manual: "0", qom_pending_manual: "0", loss_manual: "0", unit_price: "0", cover_image: null
        });
    };

    const chartData = useMemo(() => {
        if (!bookStats) return [];
        return [
            { name: 'مجموع المتبقي', value: bookStats.currentStock },
            { name: 'مباع', value: bookStats.totalSold },
            { name: 'اهداء', value: bookStats.totalGifted },
            { name: 'تالف/مفقود', value: bookStats.manualLoss },
            { name: 'في المؤسسة', value: bookStats.sentInst + bookStats.manualPending }, // Grouping smaller categories
        ].filter(d => d.value > 0);
    }, [bookStats]);

    if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" size={64} /></div>;

    return (
        <div className="space-y-8 h-full flex flex-col pb-8">
            <div className="flex justify-between items-center px-2 flex-wrap gap-4">
                <h1 className="text-4xl font-black text-primary drop-shadow-sm">مكتبة الكتب</h1>
                <div className="flex items-center gap-4 flex-1 justify-end">
                    {/* View Toggle */}
                    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode("list")}
                            className={`p-2 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow text-primary" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            <List className="rotate-180" size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-2 rounded-md transition-all ${viewMode === "grid" ? "bg-white shadow text-primary" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            <LayoutGrid size={20} />
                        </button>
                    </div>

                    <Input
                        placeholder="بحث عن كتاب..."
                        className="max-w-xs bg-white shadow-sm border-gray-200"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <Button onClick={() => { setEditId(null); resetForm(); setIsModalOpen(true); }} className="shadow-lg hover:scale-105 transition-transform whitespace-nowrap">
                        <Plus className="ml-2" size={20} /> إضافة كتاب جديد
                    </Button>
                </div>
            </div>

            {viewMode === "grid" ? (
                /* Book Grid - Optimized for Vertical Book Covers */
                <div className="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-8 pb-20 px-4 content-start">
                    {filteredBooks.map(book => (
                        <div key={book.id} className="group relative perspective-1000">
                            <div className="relative w-full aspect-[2/3] transition-all duration-300 transform group-hover:-translate-y-2 group-hover:shadow-2xl rounded-lg overflow-hidden bg-white shadow-lg border border-gray-200">

                                {/* Book Cover */}
                                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center overflow-hidden">
                                    {book.cover_image ? (
                                        <img
                                            src={book.cover_image}
                                            alt={book.title}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                                            <BookOpenText size={48} className="mb-2" />
                                            <span className="text-xs font-medium line-clamp-2">{book.title}</span>
                                        </div>
                                    )}

                                    {/* Overlay Gradient & Actions */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                        <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                            <h3 className="text-white font-bold text-lg leading-tight mb-1 line-clamp-2 drop-shadow-md">{book.title}</h3>
                                            <p className="text-gray-300 text-xs mb-3">مطبوع: {book.total_printed}</p>

                                            <div className="flex gap-2 justify-between items-center">
                                                <Button size="sm" variant="secondary" className="h-8 text-xs flex-1 bg-white/90 hover:bg-white text-black border-0" onClick={() => openDetails(book)}>
                                                    <BarChart3 size={14} className="ml-1" /> التفاصيل
                                                </Button>
                                                <div className="flex gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); openEdit(book); }} className="bg-white/20 hover:bg-white p-1.5 rounded-full text-white hover:text-blue-600 transition-colors backdrop-blur-sm"><Edit2 size={16} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(book.id); }} className="bg-white/20 hover:bg-white p-1.5 rounded-full text-white hover:text-red-600 transition-colors backdrop-blur-sm"><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                {/* Price Tag (Always Visible) */}
                                {Number(book.unit_price) > 0 && (
                                    <div className="absolute top-3 right-3 bg-emerald-500/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm z-10">
                                        {Number(book.unit_price).toLocaleString()}
                                    </div>
                                )}
                            </div>

                            {/* Shelf Shadow Effect */}
                            <div className="absolute -bottom-4 left-4 right-4 h-4 bg-black/20 blur-xl rounded-[100%] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        </div>
                    ))}

                    {/* Add New Book Card */}
                    <button
                        onClick={() => { setEditId(null); resetForm(); setIsModalOpen(true); }}
                        className="group relative w-full aspect-[2/3] rounded-xl border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-3 transition-all duration-300"
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform text-gray-400 group-hover:text-primary">
                            <Plus size={32} />
                        </div>
                        <span className="font-bold text-gray-400 group-hover:text-primary text-sm">إضافة كتاب جديد</span>
                    </button>
                </div>
            ) : (
                /* Book List View */
                <div className="flex-1 overflow-y-auto px-4 pb-7">
                    <Card className="overflow-hidden border-0 shadow-lg bg-white/50">
                        <table className="w-full text-right border-collapse">
                            <thead className="bg-primary text-primary-foreground sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 border-l border-primary-foreground/10 w-16 text-center">#</th>
                                    <th className="p-4 border-l border-primary-foreground/10">عنوان الكتاب</th>
                                    <th className="p-4 border-l border-primary-foreground/10 text-center">العدد المطبوع</th>
                                    <th className="p-4 border-l border-primary-foreground/10 text-center">سعر النسخة</th>
                                    <th className="p-4 border-l border-primary-foreground/10 text-center w-40">خيارات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredBooks.map((book) => (
                                    <tr key={book.id} className="group hover:bg-white hover:shadow-sm transition-all duration-200">
                                        <td className="p-3 text-center">
                                            <div className="w-10 h-14 bg-gray-100 rounded overflow-hidden relative mx-auto border border-gray-200">
                                                {book.cover_image ? (
                                                    <img src={book.cover_image} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                        <BookOpenText size={16} />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 font-bold text-gray-800">{book.title}</td>
                                        <td className="p-3 text-center text-gray-600">{book.total_printed}</td>
                                        <td className="p-3 text-center font-bold text-emerald-600">{Number(book.unit_price).toLocaleString()}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full" onClick={() => openEdit(book)}>
                                                    <Edit2 size={14} />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 bg-red-50 hover:bg-red-100 rounded-full" onClick={() => handleDelete(book.id)}>
                                                    <Trash2 size={14} />
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 text-xs border-primary/20 hover:bg-primary hover:text-white" onClick={() => openDetails(book)}>
                                                    <BarChart3 size={14} className="ml-1" /> التفاصيل
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredBooks.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-gray-400">
                                            لا توجد نتائج بحث
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* --- Stats Detail Modal --- */}
            {detailsBook && (
                <div onClick={() => setDetailsBook(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer">
                    <div onClick={(e) => e.stopPropagation()} className="cursor-default bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200 relative">
                        <button onClick={() => setDetailsBook(null)} className="absolute top-4 left-4 z-10 bg-white/80 p-2 rounded-full hover:bg-white shadow-sm transition-all md:text-gray-500 hover:text-black">
                            ✕
                        </button>

                        {/* Left Side: Image & Key Info */}
                        <div className="w-full md:w-1/3 bg-gray-50 p-6 flex flex-col items-center justify-center text-center border-l border-gray-100 overflow-y-auto">
                            <div className="w-56 min-h-80 rounded-xl shadow-lg run-in mb-6 bg-white relative group overflow-hidden">
                                {detailsBook.cover_image ? (
                                    <img src={detailsBook.cover_image} alt="Cover" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                                        <ImageIcon size={48} />
                                    </div>
                                )}
                            </div>
                            <h2 className="text-2xl font-black text-gray-800 mb-2 leading-tight">{detailsBook.title}</h2>
                            <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">{detailsBook.notes || "لا توجد ملاحظات إضافية"}</p>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                    <div className="text-xs text-gray-400 font-bold mb-1">العدد المطبوع</div>
                                    <div className="text-xl font-black text-primary">{detailsBook.total_printed}</div>
                                </div>
                                <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                    <div className="text-xs text-gray-400 font-bold mb-1">سعر النسخة</div>
                                    <div className="text-xl font-black text-emerald-600">{Number(detailsBook.unit_price).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Charts & Stats */}
                        <div className="w-full md:w-2/3 p-8 overflow-y-auto">
                            <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <BarChart3 className="text-primary" />
                                إحصائيات الكتاب
                            </h3>

                            {detailsLoading ? (
                                <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>
                            ) : bookStats && (
                                <div className="space-y-8">
                                    {/* Summary Grid */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-900">
                                            <div className="text-sm font-bold opacity-70">مجموع المتبقي</div>
                                            <div className="text-3xl font-black mt-1">{bookStats.currentStock}</div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-blue-50 text-blue-900">
                                            <div className="text-sm font-bold opacity-70">إجمالي المباع</div>
                                            <div className="text-3xl font-black mt-1">{bookStats.totalSold}</div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-amber-50 text-amber-900">
                                            <div className="text-sm font-bold opacity-70">إجمالي المهداة</div>
                                            <div className="text-3xl font-black mt-1">{bookStats.totalGifted}</div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-red-50 text-red-900">
                                            <div className="text-sm font-bold opacity-70">تالف / مفقود</div>
                                            <div className="text-3xl font-black mt-1">{bookStats.manualLoss}</div>
                                        </div>
                                    </div>

                                    {/* Chart Area */}
                                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                                        <h4 className="font-bold text-gray-600 mb-4 text-sm">توزيع النسخ المطبوعة</h4>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={100}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {chartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <RechartsTooltip />
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Extra Info */}
                                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                                        <div className="flex justify-between border-b py-2">
                                            <span>استعارات (كتب خارجية)</span>
                                            <span className="font-bold text-gray-800">{bookStats.realLoaned}</span>
                                        </div>
                                        <div className="flex justify-between border-b py-2">
                                            <span>نسخ مرسلة للمؤسسة</span>
                                            <span className="font-bold text-gray-800">{bookStats.sentInst}</span>
                                        </div>
                                        <div className="flex justify-between border-b py-2">
                                            <span>قيد البيع (لم يكتمل)</span>
                                            <span className="font-bold text-gray-800">{bookStats.manualPending}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal (Refined to match Inventory Page style) */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "تعديل بيانات الكتاب" : "إضافة كتاب جديد"} maxWidth="max-w-4xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Image Uploader - Kept as it is unique to Books Page */}
                        <div className="w-full md:w-1/3 flex flex-col gap-2">
                            <label className="text-sm font-bold text-gray-700">صورة الغلاف</label>
                            <div
                                onClick={handleImageUpload}
                                className="flex-1 min-h-[300px] border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-primary transition-colors relative overflow-hidden group aspect-[9/16]"
                            >
                                {formData.cover_image ? (
                                    <>
                                        <img src={formData.cover_image} className="w-full h-full object-cover absolute inset-0 text-transparent" alt="Preview" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white font-bold">
                                            تغيير الصورة
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center p-4 text-gray-400">
                                        <ImageIcon size={40} className="mx-auto mb-2 opacity-50" />
                                        <span className="text-xs">اضغط لرفع صورة</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Fields - Styled like Inventory Page */}
                        <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">اسم الكتاب</label>
                                    <Textarea
                                        required
                                        placeholder={editId ? "اسم الكتاب" : "أدخل اسم الكتاب (أدخل كل اسم في سطر جديد للإضافة المتعددة)"}
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        className="text- min-h-[4rem]"
                                        rows={editId ? 1 : 3}
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">العدد الكلي المطبوع</label>
                                    <Input type="number" required value={formData.total_printed} onChange={e => setFormData({ ...formData, total_printed: e.target.value })} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">سعر النسخة</label>
                                    <Input type="number" step="0.01" required value={formData.unit_price} onChange={e => setFormData({ ...formData, unit_price: e.target.value })} />
                                </div>
                            </div>

                            {/* Manual Fields Group (Styled like Inventory) */}
                            <div className="grid grid-cols-2 gap-3 mt-3 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                                <p className="col-span-2 text-xs font-black text-primary/40 uppercase tracking-widest mb-2">أرصدة افتتاحية (يدوي)</p>

                                <div>
                                    <label className="block text-xs font-bold mb-1 text-muted-foreground">مرسل للمؤسسة</label>
                                    <Input type="number" className="h-9" value={formData.sent_to_institution} onChange={e => setFormData({ ...formData, sent_to_institution: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 text-muted-foreground">طور البيع (قم)</label>
                                    <Input type="number" className="h-9" value={formData.qom_pending_manual} onChange={e => setFormData({ ...formData, qom_pending_manual: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 text-muted-foreground">مباع (قم)</label>
                                    <Input type="number" className="h-9" value={formData.qom_sold_manual} onChange={e => setFormData({ ...formData, qom_sold_manual: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 text-muted-foreground">مهدى (قم)</label>
                                    <Input type="number" className="h-9" value={formData.qom_gifted_manual} onChange={e => setFormData({ ...formData, qom_gifted_manual: e.target.value })} />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold mb-1 text-muted-foreground">مفقود (يدوي)</label>
                                    <Input type="number" className="h-9" value={formData.loss_manual} onChange={e => setFormData({ ...formData, loss_manual: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm mb-1 font-bold border-primary pr-2">ملاحظات</label>
                                <Textarea placeholder="ملاحظات إضافية..." rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full text-lg h-12 shadow-lg">حفظ التغييرات</Button>
                </form>
            </Modal>
        </div>
    );
}
