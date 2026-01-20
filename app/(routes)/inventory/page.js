"use client";
import { Component, useEffect, useState, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Input } from "../../components/ui/Base";
import { Loader2, Search, X, Check, Filter } from "lucide-react";
import { PaginationControls } from "../../components/ui/PaginationControls";
import Link from "next/link";

export default function InventoryPage() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [publisherName, setPublisherName] = useState("");
    const [successMap, setSuccessMap] = useState({});
    const [remainingFilter, setRemainingFilter] = useState("all"); // all, low, high
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 50;


    const fetchData = useCallback(async () => {

        try {
            setIsFetching(true);
            const db = await getDb();

            const config = await db.select("SELECT publisher_name FROM config ORDER BY id DESC LIMIT 1");
            if (config.length > 0) {
                setPublisherName(config[0].publisher_name);
            }

            // Build Query Conditions
            let whereClauses = [];
            let params = [];

            if (searchTerm) {
                whereClauses.push("v.book_title LIKE '%' || $1 || '%'");
                params.push(searchTerm);
            }

            if (remainingFilter === 'low') {
                whereClauses.push("(v.remaining_institution IS NOT NULL AND v.remaining_institution <= 11)");
            } else if (remainingFilter === 'high') {
                whereClauses.push("(v.remaining_institution IS NULL OR v.remaining_institution > 11)");
            }

            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : "";

            // Count Total
            // Note: We need to handle parameters correctly.
            // Since explicit param binding with dynamic substitution can be tricky in the provided db wrapper if it doesn't support named params easily or mixed arrays.
            // We will inject values for simplicity or stick to the array if the wrapper supports it.
            // Assuming db.select supports ($1) style.

            // Re-map params for Count query if needed (usually just same params).
            const countQuery = `
                SELECT COUNT(*) as count 
                FROM vw_inventory_central v
                JOIN book b ON b.id = v.book_id
                ${whereSQL}
            `;
            const countResult = await db.select(countQuery, params);
            const totalItems = countResult[0]?.count || 0;
            setTotalPages(Math.ceil(totalItems / ITEMS_PER_PAGE));

            const offset = (page - 1) * ITEMS_PER_PAGE;

            // Fetch Data
            const dataQuery = `
                SELECT 
                   v.*,
                   b.total_printed,
                   b.sent_to_institution,
                   b.loss_manual
                FROM vw_inventory_central v
                JOIN book b ON b.id = v.book_id
                ${whereSQL}
                ORDER BY v.book_title ASC
                LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
            `;

            const rows = await db.select(dataQuery, params);
            setData(rows);
        } catch (err) {
            console.error("Failed to load inventory:", err);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [page, searchTerm, remainingFilter]);


    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchData]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [searchTerm, remainingFilter]);

    const updateField = async (id, field, value) => {
        const numVal = Math.max(0, parseInt(value) || 0);

        // Optimistic update with recalculation
        setData(prev => prev.map(row => {
            if (row.book_id === id) {
                const oldVal = row[field];
                const diff = numVal - oldVal;

                // Create new row with updated field
                let newRow = { ...row, [field]: numVal };

                // Recalculate dependent values locally
                if (field === 'total_printed') {
                    newRow.remaining_total = (newRow.remaining_total || 0) + diff;
                } else if (field === 'sent_to_institution') {
                    newRow.remaining_institution = (newRow.remaining_institution || 0) + diff;
                } else if (field === 'loss_manual') {
                    newRow.remaining_institution = (newRow.remaining_institution || 0) - diff;
                    newRow.remaining_total = (newRow.remaining_total || 0) - diff;
                }
                return newRow;
            }
            return row;
        }));

        try {
            const db = await getDb();
            // Use 'id' (which is book_id) for update
            await db.execute(`UPDATE book SET ${field} = $1 WHERE id = $2`, [numVal, id]);

            // Show Success Indicator
            const key = `${id}_${field}`;
            setSuccessMap(prev => ({ ...prev, [key]: true }));

            // Hide after 2 seconds
            setTimeout(() => {
                setSuccessMap(prev => {
                    const newState = { ...prev };
                    delete newState[key];
                    return newState;
                });
            }, 2000);

        } catch (err) {
            console.error("Update failed", err);
            fetchData(); // Revert on error
        }
    };

    const filteredData = data;

    if (loading && data.length === 0) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-secondary" size={48} /></div>;
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-3xl font-black text-primary mb-1"> {publisherName || "نظام إدارة الكتب"}</h1>
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
                                <th className="p-4 text-center w-[75px] border-r border-primary-foreground/10 font-bold relative group/header">
                                    <div className="flex items-center justify-center gap-1">
                                        المتبقي
                                        <button
                                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                                            className={`p-0.5 rounded hover:bg-white/20 transition-colors ${remainingFilter !== 'all' ? 'text-blue-200' : 'text-primary-foreground/50 hover:text-white'}`}
                                        >
                                            <Filter size={14} fill={remainingFilter !== 'all' ? "currentColor" : "none"} />
                                        </button>
                                    </div>
                                    {isFilterOpen && (
                                        <>
                                            <div className="fixed inset-0 z-20" onClick={() => setIsFilterOpen(false)} />
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-32 bg-white rounded-md shadow-xl border z-30 overflow-hidden text-right">
                                                <button
                                                    onClick={() => { setRemainingFilter('all'); setIsFilterOpen(false); }}
                                                    className={`w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${remainingFilter === 'all' ? 'font-bold text-primary bg-primary/5' : 'text-gray-700'}`}
                                                >
                                                    الكل
                                                </button>
                                                <button
                                                    onClick={() => { setRemainingFilter('low'); setIsFilterOpen(false); }}
                                                    className={`w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${remainingFilter === 'low' ? 'font-bold text-primary bg-primary/5' : 'text-gray-700'}`}
                                                >
                                                    نافد
                                                </button>
                                                <button
                                                    onClick={() => { setRemainingFilter('high'); setIsFilterOpen(false); }}
                                                    className={`w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${remainingFilter === 'high' ? 'font-bold text-primary bg-primary/5' : 'text-gray-700'}`}
                                                >
                                                    متوفر
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </th>
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
                                            <div className="relative flex justify-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                    defaultValue={row.total_printed}
                                                    onBlur={e => updateField(row.book_id, 'total_printed', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                                />
                                                {successMap[`${row.book_id}_total_printed`] && (
                                                    <div className="absolute -top-4 bg-white/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                                                        <Check size={10} className="text-emerald-600" />
                                                        <span className="text-[10px] font-bold text-emerald-600">تم</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Editable: Sent to Inst */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <div className="relative flex justify-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                                                    defaultValue={row.sent_to_institution}
                                                    onBlur={e => updateField(row.book_id, 'sent_to_institution', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                                />
                                                {successMap[`${row.book_id}_sent_to_institution`] && (
                                                    <div className="absolute -top-4 bg-white/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                                                        <Check size={10} className="text-emerald-600" />
                                                        <span className="text-[10px] font-bold text-emerald-600">تم</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Computed: Remaining Inst */}
                                        {/* Computed: Remaining Inst */}
                                        <td className={`p-3 text-center font-bold border-l border-border/50 ${(row.remaining_institution || 0) <= 11
                                            ? "bg-red-500/20 text-red-700 font-black"
                                            : "text-primary"
                                            }`}>
                                            {row.remaining_institution}
                                        </td>

                                        {/* Pending Sale (طور البيع) - Transaction based */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.pending_institution || '-'}</td>

                                        {/* Inst Stats */}
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.sold_institution}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.gifted_institution}</td>
                                        <td className="p-3 text-center text-foreground border-l border-border/50">{row.loaned_institution}</td>

                                        {/* Editable: Manual Loss (المفقود) */}
                                        <td className="p-2 text-center border-l border-border/50">
                                            <div className="relative flex justify-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium text-foreground"
                                                    defaultValue={row.loss_manual}
                                                    onBlur={e => updateField(row.book_id, 'loss_manual', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                                />
                                                {successMap[`${row.book_id}_loss_manual`] && (
                                                    <div className="absolute -top-4 bg-white/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                                                        <Check size={10} className="text-emerald-600" />
                                                        <span className="text-[10px] font-bold text-emerald-600">تم</span>
                                                    </div>
                                                )}
                                            </div>
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

            {/* Pagination Controls */}
            <PaginationControls
                page={page}
                totalPages={totalPages}
                setPage={setPage}
                isLoading={isFetching}
            />
        </div >
    );
}

