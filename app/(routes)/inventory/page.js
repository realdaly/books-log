"use client";
import { Component, useEffect, useState, useCallback, useRef } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Input } from "../../components/ui/Base";
import { Loader2, Search, X, Check, Filter } from "lucide-react";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableInventoryRow } from "../../components/SortableInventoryRow";
import { useColumnSelection } from "../../lib/useColumnSelection";
import { ColumnActions } from "../../components/ui/ColumnActions";

export default function InventoryPage() {
    const [data, setData] = useState([]);
    const searchInputRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [publisherName, setPublisherName] = useState(null);
    const [successMap, setSuccessMap] = useState({});
    const [remainingFilter, setRemainingFilter] = useState("all"); // all, low, high
    const [threshold, setThreshold] = useState("");
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const filteredData = data;

    // Column Selection
    const COLUMNS = [
        { id: 'handle', label: '', selectable: false },
        { id: 'title', label: 'عنوان الكتاب', accessor: r => r.book_title },
        { id: 'total_printed', label: 'المطبوع', accessor: r => r.total_printed || 0 },
        { id: 'sent_to_institution', label: 'الواصل', accessor: r => r.sent_to_institution || 0 },
        { id: 'remaining_institution', label: 'المتبقي', accessor: r => r.remaining_institution },
        { id: 'pending_institution', label: 'طور البيع', accessor: r => r.pending_institution || '-' },
        { id: 'sold_institution', label: 'المباع', accessor: r => r.sold_institution },
        { id: 'gifted_institution', label: 'المهداة', accessor: r => r.gifted_institution },
        { id: 'loaned_institution', label: 'المستعار', accessor: r => r.loaned_institution },
        { id: 'loss_manual', label: 'المفقود', accessor: r => (r.loss_manual || 0) + (r.loss_institution || 0) },
        { id: 'store_institution', label: 'مخازن أخرى', accessor: r => r.store_institution || 0 },
        {
            id: 'branch_diff', label: 'متبقي الفروع', accessor: r => {
                const printed = r.total_printed || 0;
                const received = r.sent_to_institution || 0;
                const expected = Math.max(0, printed - received);
                const logged = r.other_stores_total || 0;
                return Math.max(0, expected - logged);
            }
        },
        { id: 'remaining_total', label: 'المتبقي الكلي', accessor: r => r.remaining_total }
    ];

    const { selectedCols, setSelectedCols, handleColumnClick } = useColumnSelection(COLUMNS, filteredData);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setData((items) => {
                const oldIndex = items.findIndex((i) => i.book_id === active.id);
                const newIndex = items.findIndex((i) => i.book_id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                updateDisplayOrder(newOrder);
                return newOrder;
            });
        }
    };

    const updateDisplayOrder = async (items) => {
        try {
            const db = await getDb();
            const startOrder = (page - 1) * itemsPerPage;

            for (let i = 0; i < items.length; i++) {
                const row = items[i]; // row has book_id
                await db.execute("UPDATE book SET display_order = $1 WHERE id = $2", [startOrder + i + 1, row.book_id]);
            }

        } catch (e) {
            console.error("Failed to update order", e);
        }
    };

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);


    const fetchData = useCallback(async () => {

        try {
            setIsFetching(true);
            const db = await getDb();



            // Build Query Conditions
            let whereClauses = [];
            let params = [];

            if (searchTerm) {
                // Determine parameter index
                const paramIdx = params.length + 1;
                whereClauses.push(`REPLACE(REPLACE(REPLACE(v.book_title, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE '%' || $${paramIdx} || '%'`);
                const normalizedQuery = searchTerm.replace(/[أإآ]/g, 'ا');
                params.push(normalizedQuery);
            }

            if (remainingFilter === 'low') {
                const limit = threshold !== "" ? parseInt(threshold) : 11;
                whereClauses.push(`(v.remaining_institution IS NOT NULL AND v.remaining_institution <= ${limit})`);
            } else if (remainingFilter === 'high') {
                const limit = threshold !== "" ? parseInt(threshold) : 11;
                whereClauses.push(`(v.remaining_institution IS NULL OR v.remaining_institution > ${limit})`);
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
            setTotalPages(Math.ceil(totalItems / itemsPerPage));
            const offset = (page - 1) * itemsPerPage;

            // Fetch Data
            const dataQuery = `
                SELECT 
                   v.*,
                   b.total_printed,
                   b.sent_to_institution,
                   b.loss_manual,
                   b.display_order
                FROM vw_inventory_central v
                JOIN book b ON b.id = v.book_id
                ${whereSQL}
                ORDER BY b.display_order ASC, v.book_title ASC
                LIMIT ${itemsPerPage} OFFSET ${offset}
            `;

            const rows = await db.select(dataQuery, params);
            setData(rows);
        } catch (err) {
            console.error("Failed to load inventory:", err);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [page, searchTerm, remainingFilter, threshold, itemsPerPage]);


    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchData]);

    // Fetch config immediately
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const db = await getDb();
                const config = await db.select("SELECT publisher_name FROM config ORDER BY id DESC LIMIT 1");
                if (config.length > 0) {
                    setPublisherName(config[0].publisher_name);
                } else {
                    setPublisherName("");
                }
            } catch (e) {
                console.error("Failed to load config", e);
                setPublisherName("");
            }
        };
        fetchConfig();
    }, []);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [searchTerm, remainingFilter, threshold]);

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



    return (
        <div
            className="space-y-6 h-full flex flex-col"
            onClick={() => setSelectedCols(new Set())}
        >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-3xl font-black text-primary mb-1">
                        {publisherName === null ? <span className="opacity-0">...</span> : (publisherName || "نظام إدارة الكتب")}
                    </h1>
                    <p className="text-primary/70 text-sm">نظرة عامة على المخزون وحالة التوزيع</p>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-80 group">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <Input
                            ref={searchInputRef}
                            placeholder="بحث عن كتاب..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pr-10 pl-10 w-full"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Card className="flex-1 overflow-hidden p-0 border-0 shadow-2xl bg-card/40">
                <div className="h-full overflow-auto">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <table className="w-full text-right text-sm border-collapse border-b border-border">
                            <thead className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
                                <tr>
                                    <th className={`p-4 w-[40px] rounded-tr-lg cursor-default ${selectedCols.has(0) ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}></th>
                                    <th onClick={(e) => handleColumnClick(1, e)} className={`p-4 min-w-[150px] cursor-pointer transition-colors ${selectedCols.has(1) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>عنوان الكتاب</th>
                                    <th onClick={(e) => handleColumnClick(2, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(2) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>المطبوع</th>
                                    <th onClick={(e) => handleColumnClick(3, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(3) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>الواصل</th>
                                    <th onClick={(e) => handleColumnClick(4, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 font-bold relative group/header cursor-pointer transition-colors ${selectedCols.has(4) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>
                                        <div className="flex items-center justify-center gap-1">
                                            المتبقي
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
                                                className={`p-0.5 rounded hover:bg-white/20 transition-colors ${remainingFilter !== 'all' ? 'text-blue-200' : 'text-primary-foreground/50 hover:text-white'}`}
                                            >
                                                <Filter size={14} fill={remainingFilter !== 'all' ? "currentColor" : "none"} />
                                            </button>
                                        </div>
                                        {isFilterOpen && (
                                            <>
                                                <div className="fixed inset-0 z-20 cursor-default" onClick={(e) => { e.stopPropagation(); setIsFilterOpen(false); }} />
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-popover rounded-md shadow-xl border z-30 overflow-hidden text-right p-1 space-y-1">
                                                    <div className="px-2 py-1">
                                                        <label className="text-[10px] text-muted-foreground block mb-1 font-bold">الحد الأدنى</label>
                                                        <input
                                                            type="number"
                                                            className="w-full h-7 px-2 text-xs border rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none text-left font-bold text-foreground bg-background"
                                                            placeholder="11"
                                                            value={threshold}
                                                            onChange={(e) => {
                                                                setThreshold(e.target.value);
                                                                if (e.target.value === "" && remainingFilter !== 'all') {
                                                                    setRemainingFilter("all");
                                                                }
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </div>
                                                    <div className="h-px bg-muted my-1 confirm-separator"></div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setRemainingFilter('all'); setIsFilterOpen(false); }}
                                                        className={`w-full px-4 py-1.5 text-xs rounded transition-colors ${remainingFilter === 'all' ? 'font-bold text-primary bg-primary/5' : 'text-foreground hover:bg-muted'}`}
                                                    >
                                                        الكل
                                                    </button>
                                                    <button
                                                        disabled={!threshold}
                                                        onClick={(e) => { e.stopPropagation(); setRemainingFilter('low'); setIsFilterOpen(false); }}
                                                        className={`w-full px-4 py-1.5 text-xs rounded transition-colors ${remainingFilter === 'low' ? 'font-bold text-primary bg-primary/5' : 'text-foreground hover:bg-muted'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                    >
                                                        نافد
                                                    </button>
                                                    <button
                                                        disabled={!threshold}
                                                        onClick={(e) => { e.stopPropagation(); setRemainingFilter('high'); setIsFilterOpen(false); }}
                                                        className={`w-full px-4 py-1.5 text-xs rounded transition-colors ${remainingFilter === 'high' ? 'font-bold text-primary bg-primary/5' : 'text-foreground hover:bg-muted'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                    >
                                                        متوفر
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </th>
                                    <th onClick={(e) => handleColumnClick(5, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 text-orange-300 dark:text-primary-foreground cursor-pointer transition-colors ${selectedCols.has(5) ? '!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100' : ''}`}>طور البيع</th>
                                    <th onClick={(e) => handleColumnClick(6, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(6) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>المباع</th>
                                    <th onClick={(e) => handleColumnClick(7, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(7) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>المهداة</th>
                                    <th onClick={(e) => handleColumnClick(8, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(8) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : ''}`}>المستعار</th>
                                    <th onClick={(e) => handleColumnClick(9, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 text-red-200 dark:text-primary-foreground cursor-pointer transition-colors ${selectedCols.has(9) ? '!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100' : ''}`}>المفقود</th>
                                    <th onClick={(e) => handleColumnClick(10, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 text-amber-200 dark:text-primary-foreground cursor-pointer transition-colors ${selectedCols.has(10) ? '!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100' : ''}`}>مخازن أخرى</th>
                                    <th onClick={(e) => handleColumnClick(11, e)} className={`p-4 text-center w-[75px] border-r border-primary-foreground/10 text-orange-200 dark:text-primary-foreground cursor-pointer transition-colors ${selectedCols.has(11) ? '!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100' : ''}`}>متبقي الفروع</th>
                                    <th onClick={(e) => handleColumnClick(12, e)} className={`p-4 text-center w-[75px] font-black text-white dark:text-primary-foreground rounded-tl-lg bg-black/40 dark:bg-black/20 border-r border-primary-foreground/10 cursor-pointer transition-colors ${selectedCols.has(12) ? '!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100' : ''}`}>المتبقي الكلي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading && (
                                    <tr>
                                        <td colSpan="11" className="p-12 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Loader2 className="animate-spin text-primary" size={32} />
                                                <span className="text-sm font-medium">جاري تحديث البيانات...</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!loading && (
                                    <SortableContext
                                        items={data.map(d => d.book_id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {filteredData.map((row) => (
                                            <SortableInventoryRow
                                                key={row.book_id}
                                                row={row}
                                                updateField={updateField}
                                                successMap={successMap}
                                                selectedCols={selectedCols}
                                                threshold={threshold !== "" ? parseInt(threshold) : undefined}
                                            />
                                        ))}
                                    </SortableContext>
                                )}
                            </tbody>
                        </table>
                    </DndContext>
                    {!loading && filteredData.length === 0 && (
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
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
                isLoading={isFetching}
            />

            <ColumnActions
                selectedCols={selectedCols}
                columns={COLUMNS}
                data={filteredData}
                title="جرد الكتب"
            />
        </div >
    );
}

