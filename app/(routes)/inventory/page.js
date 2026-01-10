"use client";
import { useEffect, useState, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";

export default function InventoryPage() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [publisherName, setPublisherName] = useState("");

    // Add Book Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        notes: "",
        total_printed: "0",
        sent_to_institution: "0",
        qom_sold_manual: "0",
        qom_gifted_manual: "0",
        qom_pending_manual: "0",
        loss_manual: "0",
        unit_price: "0"
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const db = await getDb();

            const config = await db.select("SELECT publisher_name FROM config ORDER BY id DESC LIMIT 1");
            if (config.length > 0) {
                setPublisherName(config[0].publisher_name);
            }

            // Fetch books with Institution transaction stats + Manual Qom fields
            const rows = await db.select(`
        SELECT 
          b.id, 
          b.title,
          COALESCE(b.total_printed, 0) as total_printed,
          COALESCE(b.sent_to_institution, 0) as sent_to_institution,
          COALESCE(b.qom_sold_manual, 0) as qom_sold_manual,
          COALESCE(b.qom_gifted_manual, 0) as qom_gifted_manual,
          COALESCE(b.qom_pending_manual, 0) as qom_pending_manual,
          COALESCE(b.loss_manual, 0) as loss_manual,

          -- Institution Aggregates (Transactions)
          COALESCE(sales.sold_qty, 0) as sold_inst,
          COALESCE(gifts.gifted_qty, 0) as gifted_inst,
          COALESCE(loans.loaned_qty, 0) as loaned_inst,
          COALESCE(loss.loss_qty, 0) as loss_inst,
          COALESCE(pending.pending_qty, 0) as pending_inst

        FROM book b
        LEFT JOIN vw_book_sales_qty sales ON sales.book_id = b.id AND sales.branch_id = (SELECT id FROM branch WHERE key='institution')
        LEFT JOIN vw_book_gifts_qty gifts ON gifts.book_id = b.id AND gifts.branch_id = (SELECT id FROM branch WHERE key='institution')
        LEFT JOIN vw_book_loans_qty loans ON loans.book_id = b.id AND loans.branch_id = (SELECT id FROM branch WHERE key='institution')
        LEFT JOIN vw_book_loss_qty loss ON loss.book_id = b.id AND loss.branch_id = (SELECT id FROM branch WHERE key='institution')
        LEFT JOIN vw_book_pending_sales_qty pending ON pending.book_id = b.id AND pending.branch_id = (SELECT id FROM branch WHERE key='institution')
        ORDER BY b.title ASC
      `);

            setData(rows);
        } catch (err) {
            console.error("Failed to load inventory:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddBook = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            const { title, notes, total_printed, sent_to_institution, qom_sold_manual, qom_gifted_manual, qom_pending_manual, loss_manual, unit_price } = formData;

            const nTotal = Number(total_printed) || 0;
            const nSent = Number(sent_to_institution) || 0;
            const nQomSold = Number(qom_sold_manual) || 0;
            const nQomGifted = Number(qom_gifted_manual) || 0;
            const nQomPending = Number(qom_pending_manual) || 0;
            const nLoss = Number(loss_manual) || 0;
            const nPrice = Number(unit_price) || 0;

            const titles = title.split('\n').map(t => t.trim()).filter(t => t !== "");

            for (const t of titles) {
                await db.execute(`
                    INSERT INTO book (title, notes, total_printed, sent_to_institution, qom_sold_manual, qom_gifted_manual, qom_pending_manual, loss_manual, unit_price) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    t, notes,
                    nTotal, nSent, nQomSold, nQomGifted, nQomPending, nLoss, nPrice
                ]);
            }

            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Error saving: " + (err.message || String(err)));
        }
    };

    const resetForm = () => {
        setFormData({
            title: "", notes: "",
            total_printed: "0",
            sent_to_institution: "0", qom_sold_manual: "0", qom_gifted_manual: "0", qom_pending_manual: "0",
            loss_manual: "0",
            unit_price: "0"
        });
    };

    const updateField = async (id, field, value) => {
        const numVal = parseInt(value) || 0;
        // Optimistic update
        setData(prev => prev.map(row => row.id === id ? { ...row, [field]: numVal } : row));

        try {
            const db = await getDb();
            await db.execute(`UPDATE book SET ${field} = $1 WHERE id = $2`, [numVal, id]);
        } catch (err) {
            console.error("Update failed", err);
            fetchData(); // Revert on error
        }
    };

    const filteredData = data.filter(r =>
        normalizeArabic(r.title).includes(normalizeArabic(searchTerm))
    );

    if (loading && data.length === 0) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-secondary" size={48} /></div>;
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-primary mb-1">جرد اصدارات {publisherName || "المؤسسة"}</h1>
                    <p className="text-primary/70 text-sm">نظرة عامة على المخزون وحالة التوزيع</p>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="بحث عن كتاب..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full md:w-80"
                    />
                    <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
                        <Plus size={20} />
                        <span>إضافة كتاب</span>
                    </Button>
                </div>
            </div>

            <Card className="flex-1 overflow-hidden p-0 border-0 shadow-2xl bg-white/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 min-w-[220px] rounded-tr-lg">اسم الكتاب</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">العدد الكلي المطبوع</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">العدد المرسل للمؤسسة من قم</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">المتبقي داخل المؤسسة</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">طور البيع</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">عدد المباع من الكتاب</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">عدد المهدى من الكتاب</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">عدد المستعار من الكتاب</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10">عدد المفقود</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10 bg-black/20">المتبقي في فرع قم</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10 bg-black/20">مباع من فرع قم</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10 bg-black/20">مهدى من فرع قم</th>
                                <th className="p-4 text-center w-28 border-r border-primary-foreground/10 bg-black/20 text-xs">طور البيع (فرع قم)</th>
                                <th className="p-4 text-center w-28 font-black text-white rounded-tl-lg bg-black/40 border-r border-primary-foreground/10">مجموع المتبقي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredData.map(row => {
                                // Computations
                                // Remaining Inst: Sent - Transactions(Sold, Gifted, Loaned, BioLoss) - ManualLoss
                                const remaining_inst = row.sent_to_institution - row.sold_inst - row.gifted_inst - row.loaned_inst - row.loss_inst - row.pending_inst - row.loss_manual;
                                // New Qom Logic: Total - Sent to Inst - QomSold - QomGifted - QomPendingManual
                                const remaining_qom = (row.total_printed || 0) - row.sent_to_institution - row.qom_sold_manual - row.qom_gifted_manual - row.qom_pending_manual;
                                const total_remaining = remaining_inst + remaining_qom;

                                return (
                                    <tr key={row.id} className="odd:bg-muted/30 even:bg-white hover:bg-primary/5 transition-colors group">
                                        <td className="p-3 font-bold text-foreground border-l border-border/50">{row.title}</td>

                                        {/* Editable: Total Printed */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.total_printed}
                                                onBlur={e => updateField(row.id, 'total_printed', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Editable: Sent to Inst */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.sent_to_institution}
                                                onBlur={e => updateField(row.id, 'sent_to_institution', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Computed: Remaining Inst */}
                                        <td className="p-3 text-center font-bold text-primary border-l border-border/50">{remaining_inst}</td>

                                        {/* Pending Sale (طور البيع) - Transaction based */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.pending_inst || '-'}</td>

                                        {/* Inst Stats */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.sold_inst}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.gifted_inst}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.loaned_inst}</td>

                                        {/* Editable: Manual Loss (المفقود) */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium text-foreground"
                                                defaultValue={row.loss_manual}
                                                onBlur={e => updateField(row.id, 'loss_manual', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                            {row.loss_inst > 0 && <div className="text-[10px] text-red-500 font-bold mt-0.5">+{row.loss_inst} (ترانزكشن)</div>}
                                        </td>

                                        {/* Computed: Qom Remaining */}
                                        <td className="p-3 text-center font-bold text-foreground border-l border-border/50">{remaining_qom}</td>

                                        {/* Editable: Qom Sold */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.qom_sold_manual}
                                                onBlur={e => updateField(row.id, 'qom_sold_manual', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Editable: Qom Gifted */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.qom_gifted_manual}
                                                onBlur={e => updateField(row.id, 'qom_gifted_manual', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Editable: Qom Pending */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-20 p-1.5 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.qom_pending_manual}
                                                onBlur={e => updateField(row.id, 'qom_pending_manual', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Total Remaining - DARKER CELL */}
                                        <td className="p-3 text-center font-black text-lg text-primary bg-black/[0.05] group-hover:bg-primary/20 transition-colors border-l border-border/50">
                                            {total_remaining}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-primary/60">
                            <p className="text-xl font-bold">لا توجد بيانات</p>
                            <Button variant="secondary" className="mt-8 text-primary" onClick={() => { resetForm(); setIsModalOpen(true); }}>أضف كتاباً جديداً</Button>
                        </div>
                    )}
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة كتاب جديد">
                <form onSubmit={handleAddBook} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold mb-1 border-primary pr-2">اسم الكتاب</label>
                            <Textarea
                                required
                                placeholder="أدخل اسم الكتاب (أدخل كل اسم في سطر جديد للإضافة المتعددة)"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
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

                    <div className="grid grid-cols-2 gap-4 border-t pt-4 border-gray-100 bg-gray-50/50 p-4 rounded-xl">
                        <p className="col-span-2 text-xs font-black text-primary/40 uppercase tracking-widest mb-2">أرصدة افتتاحية (يدوي)</p>
                        <div>
                            <label className="block text-xs font-bold mb-1 text-muted-foreground">مرسل للمؤسسة</label>
                            <Input type="number" value={formData.sent_to_institution} onChange={e => setFormData({ ...formData, sent_to_institution: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold mb-1 text-muted-foreground">طور البيع (قم)</label>
                            <Input type="number" value={formData.qom_pending_manual} onChange={e => setFormData({ ...formData, qom_pending_manual: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold mb-1 text-muted-foreground">مباع (قم)</label>
                            <Input type="number" value={formData.qom_sold_manual} onChange={e => setFormData({ ...formData, qom_sold_manual: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold mb-1 text-muted-foreground">مهدى (قم)</label>
                            <Input type="number" value={formData.qom_gifted_manual} onChange={e => setFormData({ ...formData, qom_gifted_manual: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold mb-1 text-muted-foreground">مفقود (يدوي)</label>
                            <Input type="number" value={formData.loss_manual} onChange={e => setFormData({ ...formData, loss_manual: e.target.value })} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm mb-1 font-bold border-primary pr-2">ملاحظات</label>
                        <Textarea placeholder="ملاحظات إضافية..." rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                    </div>
                    <Button type="submit" className="w-full h-12 text-lg shadow-lg">حفظ الكتاب</Button>
                </form>
            </Modal>
        </div>
    );
}
