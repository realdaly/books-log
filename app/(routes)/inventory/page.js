"use client";
import { useEffect, useState, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Input } from "../../components/ui/Base";
import { Loader2, Search, X } from "lucide-react";
import Link from "next/link";

export default function InventoryPage() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [publisherName, setPublisherName] = useState("");

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const db = await getDb();

            const config = await db.select("SELECT publisher_name FROM config ORDER BY id DESC LIMIT 1");
            if (config.length > 0) {
                setPublisherName(config[0].publisher_name);
            }

            // Fetch books with Institution transaction stats
            const rows = await db.select(`
        SELECT 
           v.*,
           b.total_printed,
           b.sent_to_institution,
           b.loss_manual
        FROM vw_inventory_central v
        JOIN book b ON b.id = v.book_id
        ORDER BY v.book_title ASC
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
        normalizeArabic(r.book_title).includes(normalizeArabic(searchTerm))
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
                    <div className="relative w-full md:w-80 group">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <Input
                            placeholder="بحث عن كتاب..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pr-10 pl-10 w-full"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm("")}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Card className="flex-1 overflow-hidden p-0 border-0 shadow-2xl bg-white/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 min-w-[150px] rounded-tr-lg">عنوان الكتاب</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">المطبوع</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">الواصل</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10 font-bold">المتبقي</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10 text-orange-300">طور البيع</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">المباع</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">المهداة</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">المستعار</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10 text-red-200">المفقود</th>
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10">مخازن أخرى</th>
                                <th className="p-4 text-center w-[75px] font-black text-white rounded-tl-lg bg-black/40 border-r border-primary-foreground/10">المتبقي الكلي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredData.map(row => {
                                return (
                                    <tr key={row.book_id} className="odd:bg-muted/30 even:bg-white hover:bg-primary/5 transition-colors group">
                                        <td className="p-3 font-bold text-foreground border-l border-border/50">{row.book_title}</td>

                                        {/* Editable: Total Printed */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.total_printed}
                                                onBlur={e => updateField(row.book_id, 'total_printed', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Editable: Sent to Inst */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                defaultValue={row.sent_to_institution}
                                                onBlur={e => updateField(row.book_id, 'sent_to_institution', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* Computed: Remaining Inst */}
                                        <td className="p-3 text-center font-bold text-primary border-l border-border/50">{row.remaining_institution}</td>

                                        {/* Pending Sale (طور البيع) - Transaction based */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.pending_institution || '-'}</td>

                                        {/* Inst Stats */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.sold_institution}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.gifted_institution}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.loaned_institution}</td>

                                        {/* Editable: Manual Loss (المفقود) */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <input
                                                type="number"
                                                className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium text-foreground"
                                                defaultValue={row.loss_manual}
                                                onBlur={e => updateField(row.book_id, 'loss_manual', e.target.value)}
                                                onFocus={e => e.target.select()}
                                            />
                                            {row.loss_institution > 0 && <div className="text-[10px] text-red-500 font-bold mt-0.5">+{row.loss_institution}</div>}
                                        </td>

                                        {/* Other Stores Total */}
                                        <td className="p-3 text-center font-bold text-foreground border-l border-border/50 border-r border-primary-foreground/10">
                                            <Link href={`/other?book_id=${row.book_id}`} className="hover:underline">{row.other_stores_total}</Link>
                                        </td>

                                        {/* Total Remaining - DARKER CELL */}
                                        <td className="p-3 text-center font-black text-lg text-primary bg-black/[0.1] group-hover:bg-primary/20 transition-colors border-l border-border/50">
                                            {row.remaining_total}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-primary/60">
                            <p className="text-xl font-bold">لا توجد بيانات</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
