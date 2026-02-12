"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { DateInput } from "../../components/ui/DateInput";
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import {
    Loader2, Plus, Trash2, Edit2, Search, X, Check, ChevronsUpDown, Filter, Settings, Tag
} from "lucide-react";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ask } from '@tauri-apps/plugin-dialog';
import { NotesCell } from "../../components/ui/NotesCell";

export default function StoresPage() {
    const ITEMS_PER_PAGE = 50;

    const [transactions, setTransactions] = useState([]);
    const [bookComboRef, categoryComboRef] = [useRef(null), useRef(null)];
    const [mainSearchRef, multiBookRef] = [useRef(null), useRef(null)];
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [books, setBooks] = useState([]);

    const [categories, setCategories] = useState([]);
    const [filterCategoryIds, setFilterCategoryIds] = useState([]);

    // Category Management
    const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryQuery, setCategoryQuery] = useState("");

    const filteredComboboxCategories = String(categoryQuery) === ""
        ? categories
        : categories.filter((cat) =>
            normalizeArabic(cat.name).toLowerCase().includes(normalizeArabic(categoryQuery).toLowerCase())
        );

    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        book_id: null,
        qty: 1,
        categoryIds: [],
        tx_date: new Date().toISOString().split('T')[0],
        notes: ""
    });
    const [editId, setEditId] = useState(null);
    const [isMultiMode, setIsMultiMode] = useState(false);
    const [selectedMultiBooks, setSelectedMultiBooks] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);

    const [query, setQuery] = useState('');
    const [bookQuery, setBookQuery] = useState('');
    const [multiBookQuery, setMultiBookQuery] = useState('');

    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");



    // Debounce Query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
            setPage(1);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    useEffect(() => {
        if (isMultiMode) {
            setTimeout(() => {
                multiBookRef.current?.focus();
            }, 100);
        }
    }, [isMultiMode]);

    // Ensure Tables Exist (Temporary Fix for Runtime)
    useEffect(() => {
        const initTables = async () => {
            try {
                const db = await getDb();
                await db.execute(`CREATE TABLE IF NOT EXISTS "store_category" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "name" VARCHAR(255) NOT NULL, UNIQUE("name"));`);
                await db.execute(`CREATE TABLE IF NOT EXISTS "store_category_link" ("transaction_id" INTEGER NOT NULL, "category_id" INTEGER NOT NULL, PRIMARY KEY ("transaction_id", "category_id"), FOREIGN KEY ("transaction_id") REFERENCES "transaction" ("id") ON DELETE CASCADE, FOREIGN KEY ("category_id") REFERENCES "store_category" ("id") ON DELETE CASCADE);`);
            } catch (e) {
                console.error("Table init error", e);
            }
        };
        initTables();
    }, []);

    // Reset page on filter change

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [filterCategoryIds]);

    const fetchData = useCallback(async () => {
        try {
            setIsFetching(true);
            const db = await getDb();

            let whereClause = "WHERE t.type = 'store'";
            let params = [];

            if (debouncedSearchQuery) {
                const paramIdx = params.length + 1;
                whereClause += ` AND (
                    REPLACE(REPLACE(REPLACE(b.title, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE '%' || $${paramIdx} || '%' 
                )`;
                const normalizedQuery = debouncedSearchQuery.replace(/[أإآ]/g, 'ا');
                params.push(normalizedQuery);
            }
            if (filterCategoryIds.length > 0) {
                for (const catId of filterCategoryIds) {
                    whereClause += ` AND EXISTS (SELECT 1 FROM store_category_link scl WHERE scl.transaction_id = t.id AND scl.category_id = ${catId}) `;
                }
            }

            const countQuery = `
                SELECT COUNT(*) as count 
                FROM "transaction" t
                JOIN book b ON t.book_id = b.id
                ${whereClause}
            `;

            const countResult = await db.select(countQuery, params);
            const totalItems = countResult[0]?.count || 0;
            setTotalPages(Math.ceil(totalItems / ITEMS_PER_PAGE));

            const offset = (page - 1) * ITEMS_PER_PAGE;

            const rows = await db.select(`
                SELECT 
                  t.id, t.qty, t.tx_date, t.notes,
                  b.title as book_title, b.id as book_id,
                  GROUP_CONCAT(sc.name) as category_names,
                  GROUP_CONCAT(sc.id) as category_ids
                FROM "transaction" t
                JOIN book b ON t.book_id = b.id
                LEFT JOIN store_category_link scl ON t.id = scl.transaction_id
                LEFT JOIN store_category sc ON scl.category_id = sc.id
                ${whereClause}
                GROUP BY t.id
                ORDER BY t.tx_date DESC, t.id DESC
                LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
            `, params);

            const normalizedRows = rows.map(r => ({
                ...r,
                category_names: r.category_names ? r.category_names.split(',') : [],
                category_ids: r.category_ids ? r.category_ids.split(',').map(Number) : []
            }));

            setTransactions(normalizedRows);

            const booksData = await db.select("SELECT id, title FROM book ORDER BY display_order ASC, title ASC");
            setBooks(booksData);

            const catRows = await db.select("SELECT * FROM store_category ORDER BY name ASC");
            setCategories(catRows);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [page, debouncedSearchQuery, filterCategoryIds]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle ESC key to clear selection
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                if (selectedIds.length > 0) {
                    setSelectedIds([]);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedIds]);

    const filteredBooks = bookQuery === ''
        ? books
        : books.filter((book) => normalizeArabic(book.title).includes(normalizeArabic(bookQuery))).slice(0, 50);

    const filteredMultiBooks = multiBookQuery === ''
        ? books
        : books.filter((book) => normalizeArabic(book.title).includes(normalizeArabic(multiBookQuery))).slice(0, 50);

    const toggleFilterCategory = (catId) => {
        setFilterCategoryIds(prev =>
            prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
        );
    };

    const toggleFormCategory = (catId) => {
        setFormData(prev => ({
            ...prev,
            categoryIds: prev.categoryIds.includes(catId)
                ? prev.categoryIds.filter(id => id !== catId)
                : [...prev.categoryIds, catId]
        }));
    };

    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;
        try {
            const db = await getDb();
            await db.execute("INSERT INTO store_category (name) VALUES ($1)", [newCategoryName.trim()]);
            setNewCategoryName("");
            const catRows = await db.select("SELECT * FROM store_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ: ربما التصنيف موجود مسبقاً");
        }
    };

    const handleDeleteCategory = async (id) => {
        const confirmed = await ask("هل أنت متأكد من حذف هذا التصنيف؟", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            await db.execute("DELETE FROM store_category WHERE id=$1", [id]);
            const catRows = await db.select("SELECT * FROM store_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ في الحذف");
        }
    };

    const handleUpdateCategory = async (e) => {
        e.preventDefault();
        if (!editingCategory?.name.trim()) return;
        try {
            const db = await getDb();
            await db.execute("UPDATE store_category SET name=$1 WHERE id=$2", [editingCategory.name.trim(), editingCategory.id]);
            setEditingCategory(null);
            const catRows = await db.select("SELECT * FROM store_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ في التعديل");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            if (editId) {
                const bookId = formData.book_id?.id || formData.book_id;
                await db.execute(`
          UPDATE "transaction" 
          SET book_id=$1, party_id=NULL, qty=$2, tx_date=$3, notes=$4
          WHERE id=$5
        `, [bookId, formData.qty, formData.tx_date, formData.notes, editId]);

                // Update Categories
                await db.execute("DELETE FROM store_category_link WHERE transaction_id=$1", [editId]);
                for (const cid of formData.categoryIds) {
                    await db.execute("INSERT INTO store_category_link (transaction_id, category_id) VALUES ($1, $2)", [editId, cid]);
                }

            } else if (isMultiMode) {
                for (const book of selectedMultiBooks) {
                    const res = await db.execute(`
                        INSERT INTO "transaction" (type, state, book_id, party_id, qty, tx_date, notes)
                        VALUES ('store', 'final', $1, NULL, $2, $3, $4)
                    `, [book.id, formData.qty, formData.tx_date, formData.notes]);
                    // Linked categories
                    const lastId = res.lastInsertId;
                    for (const cid of formData.categoryIds) {
                        await db.execute("INSERT INTO store_category_link (transaction_id, category_id) VALUES ($1, $2)", [lastId, cid]);
                    }
                }
            } else {
                const bookId = formData.book_id?.id || formData.book_id;
                const res = await db.execute(`
          INSERT INTO "transaction" (type, state, book_id, party_id, qty, tx_date, notes)
          VALUES ('store', 'final', $1, NULL, $2, $3, $4)
        `, [bookId, formData.qty, formData.tx_date, formData.notes]);

                // Linked categories
                const lastId = res.lastInsertId;
                for (const cid of formData.categoryIds) {
                    await db.execute("INSERT INTO store_category_link (transaction_id, category_id) VALUES ($1, $2)", [lastId, cid]);
                }
            }

            setIsModalOpen(false);
            setTimeout(() => {
                setEditId(null);
                resetForm();
            }, 300);
            fetchData();
        } catch (err) {
            alert("Error saving: " + err.message);
        }
    };



    const handleDelete = async (id) => {
        const confirmed = await ask("هل انت متأكد من الحذف؟", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        const db = await getDb();
        await db.execute('DELETE FROM "transaction" WHERE id=$1', [id]);
        setSelectedIds(prev => prev.filter(i => i !== id));
        fetchData();
    };

    const handleBulkDelete = async () => {
        const confirmed = await ask(`هل انت متأكد من حذف ${selectedIds.length} عنصر؟`, { title: 'تأكيد الحذف المتعدد', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            for (const id of selectedIds) {
                await db.execute('DELETE FROM "transaction" WHERE id=$1', [id]);
            }
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        setSelectedIds(selectedIds.length === transactions.length ? [] : transactions.map(t => t.id));
    };

    const openEdit = (row) => {
        const b = books.find(b => b.id === row.book_id);
        setFormData({
            book_id: b || null, qty: row.qty, tx_date: row.tx_date, notes: row.notes || "",
            categoryIds: row.category_ids || []
        });
        setEditId(row.id);
        setIsMultiMode(false);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            book_id: books[0] || null, qty: 1, tx_date: new Date().toISOString().split('T')[0], notes: "",
            categoryIds: []
        });
        setIsMultiMode(false);
        setSelectedMultiBooks([]);
        setMultiBookQuery('');
    };

    const toggleMultiBook = (book) => {
        const exists = selectedMultiBooks.find(b => b.id === book.id);
        setSelectedMultiBooks(exists ? selectedMultiBooks.filter(b => b.id !== book.id) : [...selectedMultiBooks, book]);
    };

    const selectAllBooks = () => {
        setSelectedMultiBooks(selectedMultiBooks.length === books.length ? [] : [...books]);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl md:text-3xl font-bold text-primary">سجل المخازن الأخرى</h1>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs px-2">
                                <Trash2 className="ml-2" size={16} /> حذف المحدد ({selectedIds.length})
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground">
                                <X size={14} className="ml-1" /> الغاء التحديد
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-full md:w-64 group">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <Input
                            ref={mainSearchRef}
                            placeholder="بحث عن كتاب أو مخزن..."
                            className="pr-10 pl-10 w-full"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button onClick={() => { setSearchQuery(""); mainSearchRef.current?.focus(); }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <Button onClick={() => { resetForm(); setEditId(null); setIsModalOpen(true); }}>
                        <Plus className="ml-2" size={18} /> إضافة حركة
                    </Button>
                </div>
            </div>

            {/* Categories Filter Bar */}
            <div className="flex items-center gap-2 pb-2 w-full">
                <div className="flex items-center gap-2 py-1.5 px-3 bg-muted/20 rounded-full border">
                    <Filter size={16} className="text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">تصفية:</span>
                </div>
                <div className="flex-1 flex gap-0.5 overflow-x-auto scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => toggleFilterCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap shrink-0 ${filterCategoryIds.includes(cat.id)
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-card text-muted-foreground border-border hover:border-primary/50"
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                    {filterCategoryIds.length > 0 && (
                        <button onClick={() => setFilterCategoryIds([])} className="px-2 py-1 text-xs text-red-500 hover:text-red-700 font-bold">مسح</button>
                    )}
                </div>
                <button onClick={() => setManageCategoriesOpen(true)} className="mr-auto p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-full transition-colors"><Settings size={16} /></button>
            </div>

            <Card className="flex-1 p-0 overflow-hidden border-0 shadow-lg bg-card/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground font-bold sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 border-l border-primary-foreground/10 text-center w-10">
                                    <input type="checkbox" className="w-4 h-4 rounded border-primary-foreground/20 accent-white" checked={transactions.length > 0 && selectedIds.length === transactions.length} onChange={toggleSelectAll} />
                                </th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap w-max">ت</th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap text-center">التاريخ</th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap text-center">العدد</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-1/2 text-right">اسم الكتاب</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[200px] text-right whitespace-nowrap">التصنيفات</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[210px] text-right whitespace-nowrap">الملاحظات</th>
                                <th className="p-4 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && <tr><td colSpan="8" className="p-12 text-center text-muted-foreground"><Loader2 className="animate-spin text-primary mx-auto" size={32} /></td></tr>}
                            {!loading && transactions.map((t, idx) => (
                                <tr key={t.id} className={`odd:bg-muted/30 even:bg-card hover:bg-primary/5 transition-colors ${selectedIds.includes(t.id) ? 'bg-primary/10' : ''}`}>
                                    <td className="p-4 text-center border-l border-border/50 cursor-pointer" onClick={() => toggleSelect(t.id)}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(t.id)}
                                            className="w-4 h-4 rounded text-primary pointer-events-none"
                                            readOnly
                                        />
                                    </td>
                                    <td className="p-4 text-center text-muted-foreground border-l border-border/50">{idx + 1}</td>
                                    <td className="p-4 text-center text-muted-foreground border-l border-border/50 tracking-tighter">{t.tx_date?.split('-').reverse().join('/')}</td>
                                    <td className="p-4 text-center font-bold text-primary border-l border-border/50">{t.qty}</td>
                                    <td className="p-4 font-bold text-foreground border-l border-border/50">{t.book_title}</td>
                                    <td className="p-4 w-[200px] border-l border-border/50">
                                        <div className="flex flex-wrap gap-1 overflow-hidden h-6">
                                            {t.category_names.map((name, idx) => (
                                                <span key={idx} className="px-1.5 py-0.5 bg-muted/50 text-muted-foreground text-[10px] rounded border border-border whitespace-nowrap">{name}</span>
                                            ))}
                                            {t.category_names.length === 0 && <span className="text-gray-400 text-xs">-</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 w-[210px] whitespace-nowrap overflow-hidden text-ellipsis"><NotesCell text={t.notes} /></td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"><Edit2 size={18} /></button>
                                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                            {!loading && transactions.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>

            <PaginationControls page={page} totalPages={totalPages} setPage={setPage} isLoading={isFetching} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "تعديل حركة مخزنية" : "إضافة حركة مخزنية"} maxWidth={isMultiMode ? "max-w-4xl" : "max-w-lg"}>
                <form onSubmit={handleSubmit} className="space-y-3">
                    {!editId && (
                        <div className="flex items-center justify-between bg-secondary/20 p-2 rounded-lg mb-4">
                            <span className="text-sm font-bold text-primary">إضافة عدة كتب؟</span>
                            <button type="button" onClick={() => setIsMultiMode(!isMultiMode)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-primary ring-offset-2 ${isMultiMode ? 'bg-primary' : 'bg-muted'}`}>
                                <span className={`${isMultiMode ? '-translate-x-6' : '-translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                            </button>
                        </div>
                    )}

                    {!isMultiMode ? (
                        <div>
                            <label className="block text-sm font-medium mb-1 text-primary">الكتاب</label>
                            <Combobox value={formData.book_id} onChange={(val) => setFormData({ ...formData, book_id: val })} onClose={() => setBookQuery('')}>
                                {({ open }) => (
                                    <div className="relative mt-1">
                                        <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-popover text-right shadow-md border focus:outline-none sm:text-sm py-1">
                                            <ComboboxInput
                                                className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-foreground bg-popover focus:ring-0 text-right"
                                                displayValue={(book) => book?.title || ''}
                                                onChange={(event) => setBookQuery(event.target.value)}
                                                onFocus={(e) => e.target.select()}
                                                onClick={() => !open && bookComboRef.current?.click()}
                                                placeholder="ابحث عن كتاب..."
                                            />
                                            <ComboboxButton ref={bookComboRef} className="absolute inset-y-0 right-0 flex items-center pr-2"><ChevronsUpDown className="h-5 w-5 text-gray-400" aria-hidden="true" /></ComboboxButton>
                                        </div>
                                        <ComboboxOptions className="absolute mt-1 max-h-28 w-full overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50">
                                            {filteredBooks.map((book) => (
                                                <ComboboxOption key={book.id} className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-primary-foreground' : 'text-foreground'}`} value={book}>
                                                    {({ selected, active }) => (
                                                        <>
                                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{book.title}</span>
                                                            {selected ? <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'}`}><Check className="h-5 w-5" aria-hidden="true" /></span> : null}
                                                        </>
                                                    )}
                                                </ComboboxOption>
                                            ))}
                                        </ComboboxOptions>
                                    </div>
                                )}
                            </Combobox>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border border-dashed border-border">
                                <span className="text-sm font-bold text-primary">اختر الكتب ({selectedMultiBooks.length}):</span>
                                <Button type="button" variant="outline" size="sm" onClick={selectAllBooks}>{selectedMultiBooks.length === books.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</Button>
                            </div>
                            <div className="relative">
                                <Input
                                    ref={multiBookRef}
                                    placeholder="بحث في القائمة..."
                                    value={multiBookQuery}
                                    onChange={e => setMultiBookQuery(e.target.value)}
                                    className="pl-10"
                                />
                                {multiBookQuery && (
                                    <button
                                        type="button"
                                        onClick={() => { setMultiBookQuery(""); multiBookRef.current?.focus(); }}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[120px] overflow-y-auto border rounded-xl divide-y bg-popover custom-scrollbar">
                                {filteredMultiBooks.map(book => (
                                    <div key={book.id} className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer" onClick={() => toggleMultiBook(book)}>
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-primary pointer-events-none" checked={selectedMultiBooks.some(b => b.id === book.id)} readOnly />
                                            <span className="font-bold text-sm">{book.title}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium mb-1">العدد</label><Input type="number" min="1" required value={formData.qty} onChange={e => setFormData({ ...formData, qty: e.target.value })} /></div>
                        <div><label className="block text-sm font-medium mb-1">التاريخ</label><DateInput value={formData.tx_date} onChange={val => setFormData({ ...formData, tx_date: val })} /></div>
                    </div>

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
                                    {({ open }) => (
                                        <div className="relative mt-1">
                                            <div className="py-1 relative w-full cursor-default overflow-hidden rounded-lg bg-popover text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm border">
                                                <ComboboxInput
                                                    className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-foreground bg-popover focus:ring-0 text-right font-bold"
                                                    displayValue={() => ""}
                                                    onFocus={(e) => e.target.select()}
                                                    onClick={() => !open && categoryComboRef.current?.click()}
                                                    onChange={(event) => setCategoryQuery(event.target.value)}
                                                    placeholder="اختر التصنيفات..."
                                                />
                                                <ComboboxButton ref={categoryComboRef} className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronsUpDown
                                                        className="h-5 w-5 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                </ComboboxButton>
                                            </div>
                                            <ComboboxOptions className="absolute mt-1 max-h-32 w-full overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50 custom-scrollbar">
                                                {filteredComboboxCategories.length === 0 && categoryQuery !== '' ? (
                                                    <div className="relative cursor-default select-none py-2 px-4 text-muted-foreground">
                                                        لا توجد نتائج.
                                                    </div>
                                                ) : (
                                                    filteredComboboxCategories.map((cat) => (
                                                        <ComboboxOption
                                                            key={cat.id}
                                                            className={({ active }) =>
                                                                `relative cursor-default select-none py-2 pl-4 pr-10 ${active ? 'bg-primary text-white' : 'text-foreground'
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
                                        </div>
                                    )}
                                </Combobox>
                            </div>
                            <Button
                                type="button"
                                onClick={() => setManageCategoriesOpen(true)}
                                className="px-3 mt-1"
                                title="إدارة التصنيفات"
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
                                        <span key={cat.id} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-800 font-bold flex items-center gap-1">
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



                    <div><label className="block text-sm font-medium mb-1">ملاحظات</label><Textarea rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
                    <Button type="submit" className="w-full">حفظ</Button>
                </form>
            </Modal>



            {/* Category Management Modal */}
            <Modal isOpen={manageCategoriesOpen} onClose={() => setManageCategoriesOpen(false)} title="إدارة التصنيفات">
                <div className="space-y-4">
                    <form onSubmit={handleAddCategory} className="flex gap-2">
                        <Input className="h-10" placeholder="تصنيف جديد..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                        <Button type="submit" className="h-10 px-3">
                            <Plus className="ml-1" size={14} />
                            إضافة
                        </Button>
                    </form>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-xl p-2 bg-muted/20 custom-scrollbar">
                        {categories.map(cat => (
                            <div key={cat.id} className="flex items-center gap-2 bg-card p-2 rounded-lg border shadow-sm group">
                                {editingCategory?.id === cat.id ? (
                                    <form onSubmit={handleUpdateCategory} className="flex-1 flex gap-2">
                                        <Input autoFocus value={editingCategory.name} onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })} className="h-8" />
                                        <Button size="sm" type="submit" className="h-8">حفظ</Button>
                                        <Button size="sm" type="button" variant="ghost" onClick={() => setEditingCategory(null)} className="h-8">إلغاء</Button>
                                    </form>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm font-bold text-foreground">{cat.name}</span>
                                        <button onClick={() => setEditingCategory(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="تعديل"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="حذف"><Trash2 size={16} /></button>
                                    </>
                                )}
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <p className="text-muted-foreground text-center text-sm py-4">لا توجد تصنيفات</p>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
