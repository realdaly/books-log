"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, Trash2, Edit2, Image as ImageIcon, BarChart3, BookOpenText, Search, X, Settings, Tag, Filter, Check, ChevronsUpDown } from "lucide-react";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ask, open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption, Transition } from '@headlessui/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableBookCard } from "../../components/SortableBookCard";

// Modern Color Palette for Charts
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280', '#8b5cf6']; // Emerald, Blue, Amber, Red, Gray, Purple




export default function BooksPage() {
    const [books, setBooks] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsBook, setDetailsBook] = useState(null);
    const [bookStats, setBookStats] = useState(null);
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [editId, setEditId] = useState(null);
    const [filterCategoryIds, setFilterCategoryIds] = useState([]);
    const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        title: "", notes: "", total_printed: "0", sent_to_institution: "0",
        loss_manual: "0", unit_price: "0",
        cover_image: null,
        categoryIds: []
    });

    // Category Management
    const [categories, setCategories] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryQuery, setCategoryQuery] = useState("");

    const filteredComboboxCategories = useMemo(() => {
        return categoryQuery === ""
            ? categories
            : categories.filter((cat) =>
                normalizeArabic(cat.name).toLowerCase().includes(normalizeArabic(categoryQuery).toLowerCase())
            );
    }, [categoryQuery, categories]);

    // Debounce Query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedQuery(query);
            setPage(1); // Reset page on new search
        }, 500);
        return () => clearTimeout(handler);
    }, [query]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [filterCategoryIds]);

    // Handle ESC key to close details or clear selection
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                if (detailsBook) {
                    setDetailsBook(null);
                } else if (selectedIds.length > 0) {
                    setSelectedIds([]);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [detailsBook, selectedIds]);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setBooks((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                // Update DB
                updateDisplayOrder(newOrder);

                return newOrder;
            });
        }
    };

    const updateDisplayOrder = async (items) => {
        try {
            const db = await getDb();
            // We can do this efficiently with a transaction or batch update
            // Strategy: Just update the display_order for all items in the current view based on their index
            // Note: This only reorders the current page. Global reordering with pagination is complex.
            // Assumption: User drags within the page. We assign order based on global offset?
            // Simplified: Just update the order of dragged items relative to each other?
            // Let's use a loop for now for simplicity.

            // To maintain global order across pages, we need to know the 'start' index of this page.
            const startOrder = (page - 1) * ITEMS_PER_PAGE;

            // NOTE: If we want true reordering, we should probably update the DB integers.
            // Let's iterate and update. 

            for (let i = 0; i < items.length; i++) {
                const book = items[i];
                // Update order to be consistent with visual order
                // You might want to use a large gap or just sequential
                // Using offset + i to keep it consistent with pagination
                await db.execute("UPDATE book SET display_order = $1 WHERE id = $2", [startOrder + i + 1, book.id]);
            }

        } catch (e) {
            console.error("Failed to update order", e);
        }
    };

    // Fetch Books

    // Fetch Books
    const fetchData = useCallback(async () => {
        try {
            setIsFetching(true);
            const db = await getDb();

            // Prepare Where Clause
            let whereClause = "";
            let params = [];

            if (debouncedQuery) {
                const paramIdx = params.length + 1;
                whereClause += ` AND REPLACE(REPLACE(REPLACE(b.title, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE '%' || $${paramIdx} || '%' `;
                params.push(debouncedQuery.replace(/[أإآ]/g, 'ا'));
            }

            // NOTE: Filtering by categories via GROUP_CONCAT in SQL directly is tricky with LIMIT/OFFSET without subqueries.
            // A simpler approach for category filtering with pagination is using HAVING or EXISTS.
            // However, since we are doing LEFT JOINs and grouping, we can filter in the HAVING clause for categories if needed,
            // or better, filter using a subquery/EXISTS for better performance.
            // AND EXISTS (SELECT 1 FROM book_category_link bcl2 WHERE bcl2.book_id = b.id AND bcl2.category_id IN (...))

            if (filterCategoryIds.length > 0) {
                // Using dynamic SQL for IN clause due to limitation in simple param binding for arrays in some drivers, 
                // but assuming we can pass parameters safely.
                // We will construct the EXISTS clauses.

                for (const catId of filterCategoryIds) {
                    whereClause += ` AND EXISTS (SELECT 1 FROM book_category_link bcl_check WHERE bcl_check.book_id = b.id AND bcl_check.category_id = ${catId}) `;
                }
            }

            // Remove first " AND " if exists (though we started with 1=1 trick usually, here we append to nothing so we need to fix prefix)
            // Actually we can start with WHERE 1=1
            const finalWhere = whereClause ? `WHERE 1=1 ${whereClause}` : "";

            // Count Query
            const countQuery = `SELECT COUNT(*) as count FROM book b ${finalWhere}`;
            // For count with search, we just count rows in book table matching the title/category criteria.
            // Does not need the large joins.

            const countResult = await db.select(countQuery, params);
            const totalItems = countResult[0]?.count || 0;
            setTotalPages(Math.ceil(totalItems / ITEMS_PER_PAGE));

            const offset = (page - 1) * ITEMS_PER_PAGE;

            // Fetch books
            const rows = await db.select(`
                SELECT 
                    b.id, b.title, b.cover_image, b.notes, b.total_printed, b.sent_to_institution, b.loss_manual, b.unit_price, b.created_at, b.updated_at, b.display_order,
                    COALESCE(ot.other_qty, 0) as other_stores_total,
                    
                    COALESCE(sales.sold_qty, 0) as sold_inst,
                    COALESCE(gifts.gifted_qty, 0) as gifted_inst,
                    COALESCE(loans.loaned_qty, 0) as loaned_inst,
                    COALESCE(loss.loss_qty, 0) as loss_inst,
                    COALESCE(pending.pending_qty, 0) as pending_inst,

                    GROUP_CONCAT(cat.name) as category_names,
                    GROUP_CONCAT(cat.id) as category_ids

                FROM book b
                LEFT JOIN vw_other_stores_total ot ON ot.book_id = b.id
                LEFT JOIN vw_book_sales_qty sales ON sales.book_id = b.id
                LEFT JOIN vw_book_gifts_qty gifts ON gifts.book_id = b.id
                LEFT JOIN vw_book_loans_qty loans ON loans.book_id = b.id
                LEFT JOIN vw_book_loss_qty loss ON loss.book_id = b.id
                LEFT JOIN vw_book_pending_sales_qty pending ON pending.book_id = b.id
                LEFT JOIN book_category_link bcl ON b.id = bcl.book_id
                LEFT JOIN book_category cat ON bcl.category_id = cat.id
                ${finalWhere}
                GROUP BY b.id
                ORDER BY b.display_order ASC, b.id DESC
                LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
            `, params);

            const normalizedRows = rows.map(r => ({
                ...r,
                category_names: r.category_names ? r.category_names.split(',') : [],
                category_ids: r.category_ids ? r.category_ids.split(',').map(Number) : []
            }));

            setBooks(normalizedRows);

            // Fetch categories only once if empty (usually)
            const catRows = await db.select("SELECT * FROM book_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [page, debouncedQuery, filterCategoryIds]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

                setFormData({ ...formData, cover_image: `data:${mimeType}; base64, ${base64} ` });
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
            // Fetch full book details (for image)
            const bookRes = await db.select("SELECT * FROM book WHERE id=$1", [book.id]);
            if (bookRes[0]) {
                setDetailsBook(prev => ({ ...prev, ...bookRes[0] }));
            }

            // Get Transaction Sums
            const sales = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='sale' AND state!='pending'", [book.id]);
            const gifts = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='gift'", [book.id]);
            const loans = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='loan'", [book.id]);
            const lossDetail = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='loss'", [book.id]);
            const pending = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='sale' AND state='pending'", [book.id]);
            const other = await db.select("SELECT COALESCE(SUM(qty), 0) as total FROM other_transaction WHERE book_id=$1", [book.id]);
            const stores = await db.select("SELECT SUM(qty) as total FROM `transaction` WHERE book_id=$1 AND type='store'", [book.id]);
            const revenueResult = await db.select("SELECT COALESCE(SUM(COALESCE(total_price, qty * COALESCE(unit_price, 0))), 0) as total FROM `transaction` WHERE book_id=$1 AND type='sale' AND state='final'", [book.id]);

            const realSold = sales[0]?.total || 0;
            const realGifted = gifts[0]?.total || 0;
            const realLoaned = loans[0]?.total || 0;
            const realLoss = lossDetail[0]?.total || 0;
            const realPending = pending[0]?.total || 0;
            const otherTotal = other[0]?.total || 0;
            const storeInstitution = stores[0]?.total || 0;
            const totalRevenue = revenueResult[0]?.total || 0;

            const manualLoss = book.loss_manual || 0;
            const sentInst = book.sent_to_institution || 0;
            const totalPrinted = book.total_printed || 0;

            // Calculations
            const totalOutflows =
                realSold + realGifted + realLoaned + realLoss + realPending +
                manualLoss + otherTotal + storeInstitution;

            const institutionOutflows =
                realSold + realGifted + realLoaned + realLoss + realPending +
                manualLoss + storeInstitution;

            const remainingInstitution = sentInst - institutionOutflows;

            const currentStock = totalPrinted - totalOutflows;

            setBookStats({
                totalPrinted,
                totalSold: realSold,
                totalGifted: realGifted,
                realLoaned,
                realPending,
                manualLoss,
                sentInst,
                otherTotal,
                storeInstitution,
                currentStock,
                currentStock,
                remainingInstitution,
                remainingBranches: Math.max(0, (totalPrinted - sentInst) - otherTotal), // Calculated exactly as in Inventory
                totalRevenue
            });

        } catch (e) {
            console.error(e);
        } finally {
            setDetailsLoading(false);
        }
    };

    // --- Category Handlers ---
    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;
        try {
            const db = await getDb();
            await db.execute("INSERT INTO book_category (name) VALUES ($1)", [newCategoryName.trim()]);
            setNewCategoryName("");
            const catRows = await db.select("SELECT * FROM book_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ: ربما التصنيف موجود مسبقاً");
        }
    };

    const handleUpdateCategory = async (e) => {
        e.preventDefault();
        if (!editingCategory || !editingCategory.name.trim()) return;
        try {
            const db = await getDb();
            await db.execute("UPDATE book_category SET name=$1 WHERE id=$2", [editingCategory.name.trim(), editingCategory.id]);
            setEditingCategory(null);
            const catRows = await db.select("SELECT * FROM book_category ORDER BY name ASC");
            setCategories(catRows);
            fetchData(); // Refresh books to update names
        } catch (e) {
            alert("خطأ في التحديث");
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!await ask("هل أنت متأكد من حذف هذا التصنيف؟")) return;
        try {
            const db = await getDb();
            await db.execute("DELETE FROM book_category WHERE id=$1", [id]);
            const catRows = await db.select("SELECT * FROM book_category ORDER BY name ASC");
            setCategories(catRows);
            fetchData();
        } catch (e) {
            alert("خطأ في الحذف");
        }
    };

    const toggleFormCategory = (catId) => {
        setFormData(prev => ({
            ...prev,
            categoryIds: prev.categoryIds.includes(catId)
                ? prev.categoryIds.filter(id => id !== catId)
                : [...prev.categoryIds, catId]
        }));
    };

    // --- CRUD ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            const { title, notes, total_printed, sent_to_institution, loss_manual, unit_price, cover_image } = formData;

            const nTotal = Number(total_printed) || 0;
            const nSent = Number(sent_to_institution) || 0;
            const nLoss = Number(loss_manual) || 0;
            const nPrice = Number(unit_price) || 0;

            if (editId) {
                // Update Single
                await db.execute(`
                    UPDATE book SET title = $1, notes = $2, total_printed = $3, sent_to_institution = $4,
                    loss_manual = $5, unit_price = $6, cover_image = $7 WHERE id = $8
                        `, [title, notes, nTotal, nSent, nLoss, nPrice, cover_image, editId]);

                // Update Categories
                await db.execute("DELETE FROM book_category_link WHERE book_id=$1", [editId]);
                for (const catId of formData.categoryIds) {
                    await db.execute("INSERT INTO book_category_link (book_id, category_id) VALUES ($1, $2)", [editId, catId]);
                }

            } else {
                // Bulk Add Support
                const titles = title.split('\n').map(t => t.trim()).filter(t => t !== "");
                const existingBooks = [];
                let addedCount = 0;

                for (const t of titles) {
                    // Check existence
                    const exists = await db.select("SELECT id FROM book WHERE title = $1", [t]);
                    if (exists.length > 0) {
                        existingBooks.push(t);
                        continue;
                    }

                    await db.execute(`
                        INSERT INTO book(title, notes, total_printed, sent_to_institution,
                            loss_manual, unit_price, cover_image) VALUES($1, $2, $3, $4, $5, $6, $7)
                    `, [t, notes, nTotal, nSent, nLoss, nPrice, cover_image]);

                    const idRes = await db.select("SELECT last_insert_rowid() as id");
                    const newId = idRes[0]?.id;

                    if (newId && formData.categoryIds.length > 0) {
                        for (const catId of formData.categoryIds) {
                            await db.execute("INSERT INTO book_category_link (book_id, category_id) VALUES ($1, $2)", [newId, catId]);
                        }
                    }
                    addedCount++;
                }

                if (existingBooks.length > 0) {
                    await message(`تم إضافة ${addedCount} كتاب بنجاح.\n\nلم يتم إضافة الكتب التالية لأنها موجودة مسبقاً:\n- ${existingBooks.join('\n- ')}`, { title: 'تنبيه - كتب مكررة', kind: 'warning' });
                }
            }
            setIsModalOpen(false);
            setTimeout(() => {
                setEditId(null);
                resetForm();
            }, 300);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === books.length && books.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(books.map(b => b.id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const confirmed = await ask(`هل انت متأكد من حذف ${selectedIds.length} كتاب؟\nسيتم حذف جميع الحركات المرتبطة بها!`, { title: 'تأكيد الحذف المتعدد', kind: 'warning' });
        if (!confirmed) return;

        try {
            const db = await getDb();
            for (const id of selectedIds) {
                await db.execute("DELETE FROM book WHERE id=$1", [id]);
            }
            setSelectedIds([]);
            fetchData();
            setDetailsBook(null);
        } catch (e) {
            console.error(e);
            await ask("حدث خطأ أثناء الحذف", { kind: "error" });
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

    const openEdit = async (b) => {
        try {
            const db = await getDb();
            const res = await db.select("SELECT * FROM book WHERE id=$1", [b.id]);
            const fullBook = res[0];
            if (!fullBook) return;

            setFormData({
                title: fullBook.title,
                notes: fullBook.notes || "",
                total_printed: String(fullBook.total_printed || 0),
                sent_to_institution: String(fullBook.sent_to_institution || 0),
                loss_manual: String(fullBook.loss_manual || 0),
                unit_price: String(fullBook.unit_price || 0),
                cover_image: fullBook.cover_image,
                categoryIds: b.category_ids || []
            });
            setEditId(b.id);
            setIsModalOpen(true);
        } catch (e) {
            console.error(e);
        }
    };

    const resetForm = () => {
        setFormData({
            title: "", notes: "", total_printed: "0", sent_to_institution: "0",
            loss_manual: "0", unit_price: "0", cover_image: null, categoryIds: []
        });
    };

    const chartData = useMemo(() => {
        if (!bookStats) return [];
        // Hardcoded colors to ensure stability regardless of filtering
        return [
            { name: 'اهداء', value: bookStats.totalGifted, color: '#f59e0b' },    // Amber
            { name: 'مباع', value: bookStats.totalSold, color: '#3b82f6' },      // Blue
            { name: 'مخازن أخرى', value: bookStats.storeInstitution, color: '#6366f1' }, // Indigo
            { name: 'تالف/مفقود', value: bookStats.manualLoss, color: '#ef4444' }, // Red (Requested)
        ].filter(d => d.value > 0);
    }, [bookStats]);

    /* if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" size={64} /></div>; */

    return (
        <div className="space-y-8 h-full flex flex-col pb-8">
            <div className="flex justify-between items-center px-2 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl md:text-4xl font-black text-primary drop-shadow-sm">مكتبة الكتب</h1>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in-50">
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs px-2">
                                <Trash2 size={14} className="ml-1" /> حذف ({selectedIds.length})
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground">
                                <X size={14} className="ml-1" /> الغاء التحديد
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4 flex-1 justify-end">
                    <div className="relative w-full max-w-xs group">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <Input
                            placeholder="بحث عن كتاب..."
                            className="pr-10 pl-10 bg-white shadow-sm border-gray-200 w-full"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                        {query && (
                            <button
                                onClick={() => setQuery("")}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <Button onClick={() => { setEditId(null); resetForm(); setIsModalOpen(true); }} className="shadow-lg hover:scale-105 transition-transform whitespace-nowrap">
                        <Plus className="ml-2" size={20} /> إضافة كتاب جديد
                    </Button>
                </div>
            </div>

            {/* Filter & Selection Bar */}
            <div className="flex items-center gap-2 px-2 pb-2 w-full">
                {/* Selection Controls */}
                <div className="flex items-center gap-2 pl-2 border-l">
                    <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-emerald-600"
                        checked={books.length > 0 && selectedIds.length === books.length}
                        onChange={toggleSelectAll}
                    />
                    <span className="text-xs font-bold text-gray-500 cursor-pointer select-none" onClick={toggleSelectAll}>الكل</span>
                </div>

                {/* Filter Label */}
                <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-full border">
                    <Filter size={16} className="text-gray-400" />
                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">تصفية:</span>
                </div>

                {/* Filter Chips */}
                <div className="flex-1 flex gap-0.5 overflow-x-auto scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setFilterCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id])}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap shrink-0 ${filterCategoryIds.includes(cat.id)
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                    {filterCategoryIds.length > 0 && (
                        <button onClick={() => setFilterCategoryIds([])} className="px-2 py-1 text-xs text-red-500 hover:text-red-700 font-bold">مسح</button>
                    )}
                </div>

                {/* Settings Button */}
                <button onClick={() => setManageCategoriesOpen(true)} className="mr-auto p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-full transition-colors">
                    <Settings size={16} />
                </button>
            </div>

            {/* Book Grid view */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={books}
                    strategy={rectSortingStrategy}
                >
                    <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 md:gap-8 pl-2 content-start">
                        {loading && (
                            <div className="col-span-full flex flex-col items-center justify-center h-64 text-muted-foreground">
                                <Loader2 className="animate-spin mb-4 text-primary" size={48} />
                                <p className="font-bold text-lg">جاري تحميل الكتب...</p>
                            </div>
                        )}
                        {!loading && books.map((book) => (
                            <SortableBookCard
                                key={book.id}
                                book={book}
                                onClick={() => toggleSelect(book.id)}
                                selectedIds={selectedIds}
                                toggleSelect={toggleSelect}
                                openDetails={openDetails}
                                openEdit={openEdit}
                                handleDelete={handleDelete}
                            />
                        ))}


                        {/* Add New Book Card */}
                        {!loading && <button
                            onClick={() => { setEditId(null); resetForm(); setIsModalOpen(true); }}
                            className="group relative w-full aspect-[2/3] rounded-xl border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-3 transition-all duration-300"
                        >
                            <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform text-gray-400 group-hover:text-primary">
                                <Plus size={32} />
                            </div>
                            <span className="font-bold text-gray-400 group-hover:text-primary text-sm">إضافة كتاب جديد</span>
                        </button>}
                    </div>
                </SortableContext>
            </DndContext>


            {/* Pagination Controls */}
            {/* Pagination Controls */}
            <PaginationControls
                page={page}
                totalPages={totalPages}
                setPage={setPage}
                isLoading={isFetching}
            />

            {/* --- Stats Detail Modal --- */}
            {
                detailsBook && (
                    <div onClick={() => setDetailsBook(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer !m-0">
                        <div onClick={(e) => e.stopPropagation()} className="cursor-default bg-white rounded-[2rem] shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200 relative">
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
                                            <BookOpenText size={48} />
                                        </div>
                                    )}
                                </div>
                                <h2 className="text-xl font-black text-gray-800 mb-2 leading-tight">{detailsBook.title}</h2>
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

                                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                                    {detailsBook.category_names && detailsBook.category_names.length > 0 ? (
                                        detailsBook.category_names.map((cat, idx) => (
                                            <span key={idx} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded-md border border-emerald-100 font-bold">
                                                {cat}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-gray-400">لا توجد تصنيفات</span>
                                    )}
                                </div>
                            </div>

                            {/* Right Side: Charts & Stats */}
                            <div className="w-full md:w-4/6 p-8 overflow-y-auto">
                                <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                    <BarChart3 className="text-primary" />
                                    إحصائيات الكتاب
                                </h3>

                                {detailsLoading ? (
                                    <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>
                                ) : bookStats && (
                                    <div className="space-y-8">
                                        {/* Summary Grid */}
                                        <div className="flex flex-col gap-6">
                                            {/* Top Row: 6 Stats */}
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                                <div className="text-center p-3 rounded-2xl bg-emerald-50 text-emerald-900 shadow-sm border border-emerald-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">المتبقي الفعلي</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.remainingInstitution}</div>
                                                </div>
                                                <div className="text-center p-3 rounded-2xl bg-blue-50 text-blue-900 shadow-sm border border-blue-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">إجمالي المباع</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.totalSold}</div>
                                                </div>
                                                <div className="text-center p-3 rounded-2xl bg-amber-50 text-amber-900 shadow-sm border border-amber-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">إجمالي المهداة</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.totalGifted}</div>
                                                </div>
                                                <div className="text-center p-3 rounded-2xl bg-gray-50 text-gray-900 shadow-sm border border-gray-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">إجمالي المستعار</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.realLoaned}</div>
                                                </div>
                                                <div className="text-center p-3 rounded-2xl bg-indigo-50 text-indigo-900 shadow-sm border border-indigo-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">مخازن أخرى</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.storeInstitution}</div>
                                                </div>
                                                <div className="text-center p-3 rounded-2xl bg-orange-50 text-orange-900 shadow-sm border border-orange-100/50">
                                                    <div className="text-xs font-bold opacity-70 whitespace-nowrap">فروع أخرى</div>
                                                    <div className="text-2xl font-black mt-1">{bookStats.otherTotal}</div>
                                                </div>
                                            </div>

                                            {/* Revenue Card (Full Width) */}
                                            <div className="p-4 rounded-2xl bg-teal-50 text-teal-900 flex justify-between items-center shadow-sm border border-teal-100/50">
                                                <div className="text-sm font-bold opacity-70">إجمالي الأرباح (المبيعات)</div>
                                                <div className="text-2xl font-black">{Number(bookStats.totalRevenue).toLocaleString()} دينار عراقي</div>
                                            </div>
                                        </div>

                                        {/* Chart Area */}
                                        <div className="bg-white rounded-2xl border p-6 shadow-sm">
                                            <h4 className="font-bold text-gray-600 mb-4 text-sm">توزيع نسخ الكتاب</h4>
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
                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <RechartsTooltip formatter={(value) => Number(value).toLocaleString()} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            {/* Custom Legend to ensure correct order */}
                                            <div className="flex flex-wrap justify-center gap-4 mt-4 px-4">
                                                {chartData.map((entry, index) => (
                                                    <div key={index} className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                                                        <span>{entry.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Extra Info */}
                                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                                            <div className="flex justify-between border-b py-2">
                                                <span>نسخ واصلة للمؤسسة</span>
                                                <span className="font-bold text-gray-800">{bookStats.sentInst}</span>
                                            </div>
                                            <div className="flex justify-between border-b py-2">
                                                <span>متبقي الفروع</span>
                                                <span className="font-bold text-gray-800">{bookStats.remainingBranches}</span>
                                            </div>
                                            <div className="flex justify-between border-b py-2">
                                                <span>قيد البيع (لم يكتمل)</span>
                                                <span className="font-bold text-gray-800">{bookStats.realPending}</span>
                                            </div>
                                            <div className="flex justify-between border-b py-2">
                                                <span>مفقود / تالف</span>
                                                <span className="font-bold text-gray-800">{bookStats.manualLoss}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div >
                )
            }

            {/* Add/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "تعديل بيانات الكتاب" : "إضافة كتاب جديد"} maxWidth="max-w-6xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Image Uploader */}
                        <div className="w-full md:w-1/3 flex flex-col gap-2">
                            <label className="text-sm font-bold text-gray-700">صورة الغلاف</label>
                            <div
                                onClick={handleImageUpload}
                                className="flex-1 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-primary transition-colors relative overflow-hidden group"
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

                        {/* Fields */}
                        <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">اسم الكتاب</label>
                                    <Textarea
                                        required
                                        placeholder={editId ? "اسم الكتاب" : "أدخل اسم الكتاب (أدخل كل اسم في سطر جديد للإضافة المتعددة)"}
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        className="text- min-h-[4rem]"
                                        rows={editId ? 1 : 5}
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">العدد الكلي المطبوع</label>
                                    <Input type="number" min={0} required value={formData.total_printed} onChange={e => setFormData({ ...formData, total_printed: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">الواصل للمؤسسة</label>
                                    <Input type="number" min={0} value={formData.sent_to_institution} onChange={e => setFormData({ ...formData, sent_to_institution: e.target.value })} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">سعر النسخة</label>
                                    <Input type="number" min={0} className="h-11" step="0.01" required value={formData.unit_price} onChange={e => setFormData({ ...formData, unit_price: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-1 border-primary pr-2">مفقود (يدوي)</label>
                                    <Input type="number" min={0} className="h-11" value={formData.loss_manual} onChange={e => setFormData({ ...formData, loss_manual: e.target.value })} />
                                </div>
                            </div>


                            {/* Categories Section */}
                            <div className="pt-2 border-t">
                                <label className="text-sm font-bold mb-2 flex items-center gap-2 text-primary">
                                    <Tag size={16} /> التصنيفات
                                </label>

                                {/* Combobox for Selection */}
                                <div className="w-full flex items-center gap-2">
                                    <div className="flex-1">
                                        <Combobox
                                            value={formData.categoryIds}
                                            onChange={(ids) => setFormData({ ...formData, categoryIds: ids })}
                                            multiple
                                        >
                                            <div className="relative mt-1">
                                                <div className="py-1 relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm border">
                                                    <ComboboxInput
                                                        className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 text-right font-bold"
                                                        displayValue={() => ""}
                                                        onChange={(event) => setCategoryQuery(event.target.value)}
                                                        placeholder="اختر التصنيفات..."
                                                    />
                                                    <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                        <ChevronsUpDown
                                                            className="h-5 w-5 text-gray-400"
                                                            aria-hidden="true"
                                                        />
                                                    </ComboboxButton>
                                                </div>
                                                <Transition
                                                    as="div" // Fragment causes issues sometimes, div is safer
                                                    leave="transition ease-in duration-100"
                                                    leaveFrom="opacity-100"
                                                    leaveTo="opacity-0"
                                                    afterLeave={() => setCategoryQuery('')}
                                                >
                                                    <ComboboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50 custom-scrollbar">
                                                        {filteredComboboxCategories.length === 0 && categoryQuery !== '' ? (
                                                            <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                                                لا توجد نتائج.
                                                            </div>
                                                        ) : (
                                                            filteredComboboxCategories.map((cat) => (
                                                                <ComboboxOption
                                                                    key={cat.id}
                                                                    className={({ active }) =>
                                                                        `relative cursor-default select-none py-2 pl-4 pr-10 ${active ? 'bg-primary text-white' : 'text-gray-900'
                                                                        }`
                                                                    }
                                                                    value={cat.id}
                                                                >
                                                                    {({ selected, active }) => (
                                                                        <>
                                                                            <span
                                                                                className={`block truncate ${selected ? 'font-bold' : 'font-normal'
                                                                                    }`}
                                                                            >
                                                                                {cat.name}
                                                                            </span>
                                                                            {selected ? (
                                                                                <span
                                                                                    className={`absolute inset-y-0 right-0 flex items-center pr-3 ${active ? 'text-white' : 'text-primary'
                                                                                        }`}
                                                                                >
                                                                                    <Check className="h-5 w-5" aria-hidden="true" />
                                                                                </span>
                                                                            ) : null}
                                                                        </>
                                                                    )}
                                                                </ComboboxOption>
                                                            ))
                                                        )}
                                                    </ComboboxOptions>
                                                </Transition>
                                            </div>
                                        </Combobox>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => setManageCategoriesOpen(true)}
                                        className="px-3 mt-1"
                                        title="إضافة تصنيف جديد"
                                    >
                                        <Plus size={18} />
                                    </Button>
                                </div>

                                {/* Selected Categories Chips */}
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {formData.categoryIds.length > 0 ? (
                                        categories
                                            .filter(cat => formData.categoryIds.includes(cat.id))
                                            .map(cat => (
                                                <span key={cat.id} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded-md border border-emerald-100 font-bold flex items-center gap-1">
                                                    {cat.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleFormCategory(cat.id)}
                                                        className="text-emerald-500 hover:text-emerald-800"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </span>
                                            ))
                                    ) : (
                                        <span className="text-xs text-gray-400">لم يتم اختيار تصنيفات</span>
                                    )}
                                </div>


                            </div>

                            <div>
                                <label className="block text-sm mb-1 font-bold border-primary pr-2">ملاحظات</label>
                                <Textarea placeholder="ملاحظات إضافية..." rows={editId ? 5 : 2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full text-lg h-12 shadow-lg">حفظ</Button>
                </form>
            </Modal>

            {/* Manage Categories Modal */}
            <Modal isOpen={manageCategoriesOpen} onClose={() => { setManageCategoriesOpen(false); setEditingCategory(null); setNewCategoryName(""); }} title="إدارة التصنيفات">
                <div className="space-y-4">
                    <form onSubmit={handleAddCategory} className="flex gap-2">
                        <Input className="h-10" placeholder="تصنيف جديد..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                        <Button type="submit" className="h-10 px-3">
                            <Plus className="ml-1" size={14} />
                            إضافة
                        </Button>
                    </form>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-xl p-2 bg-gray-50 custom-scrollbar">
                        {categories.map(cat => (
                            <div key={cat.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm group">
                                {editingCategory?.id === cat.id ? (
                                    <form onSubmit={handleUpdateCategory} className="flex-1 flex gap-2">
                                        <Input autoFocus value={editingCategory.name} onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })} className="h-8" />
                                        <Button size="sm" type="submit" className="h-8">حفظ</Button>
                                        <Button size="sm" type="button" variant="ghost" onClick={() => setEditingCategory(null)} className="h-8">إلغاء</Button>
                                    </form>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm font-bold text-gray-700">{cat.name}</span>
                                        <button onClick={() => setEditingCategory(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="تعديل"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="حذف"><Trash2 size={16} /></button>
                                    </>
                                )}
                            </div>
                        ))}
                        {categories.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">لا توجد تصنيفات بعد.</p>}
                    </div>
                </div>
            </Modal>
        </div >
    );
}
