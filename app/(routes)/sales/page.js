"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { DateInput } from "../../components/ui/DateInput";
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import {
    Loader2, Plus, GripVertical, Trash2, Edit2, Search, X, Check, ChevronsUpDown, Filter, Printer, Download, Share2
} from "lucide-react";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ask } from '@tauri-apps/plugin-dialog';
import { NotesCell } from "../../components/ui/NotesCell";

export default function SalesPage() {
    const [transactions, setTransactions] = useState([]);
    const [bookComboRef, partyComboRef] = [useRef(null), useRef(null)];
    const [mainSearchRef, multiBookRef] = [useRef(null), useRef(null)];
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const [books, setBooks] = useState([]);
    const [parties, setParties] = useState([]);

    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        book_id: null,
        qty: 1,
        unit_price: 0,
        total_price: 0,
        receipt_no: "",
        party_id: null,
        tx_date: new Date().toISOString().split('T')[0],
        notes: "",
        is_pending: false
    });
    const [editId, setEditId] = useState(null);
    const [isMultiMode, setIsMultiMode] = useState(false);
    const [selectedMultiBooks, setSelectedMultiBooks] = useState([]); // Array of { book, qty, unit_price }
    const [selectedIds, setSelectedIds] = useState([]);

    // Combobox State
    const [query, setQuery] = useState('');
    const [partyLimit, setPartyLimit] = useState(30);

    // Reset limit on search
    useEffect(() => {
        setPartyLimit(30);
    }, [query]);

    useEffect(() => {
        if (isMultiMode) {
            setTimeout(() => {
                multiBookRef.current?.focus();
            }, 100);
        }
    }, [isMultiMode]);

    const [bookQuery, setBookQuery] = useState('');
    const [multiBookQuery, setMultiBookQuery] = useState('');

    // Search
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

    // Debounce Query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
            setPage(1); // Reset page on new search
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Quick Add Party State
    const [isAddPartyOpen, setIsAddPartyOpen] = useState(false);
    const [newPartyForm, setNewPartyForm] = useState({ name: "", phone: "", address: "", notes: "" });

    // Status Filter
    const [filterStatus, setFilterStatus] = useState([]);

    const fetchData = useCallback(async () => {
        try {
            setIsFetching(true);
            const db = await getDb();

            // Build Where Clause
            let whereClause = "WHERE t.type = 'sale'";
            let params = [];

            if (debouncedSearchQuery) {
                // Determine parameter index
                const paramIdx = params.length + 1;
                // Arabic normalization: Replace Alef variants with bare Alef
                whereClause += ` AND (
                    REPLACE(REPLACE(REPLACE(b.title, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE '%' || $${paramIdx} || '%' 
                    OR 
                    REPLACE(REPLACE(REPLACE(p.name, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE '%' || $${paramIdx} || '%'
                    OR 
                    t.receipt_no LIKE '%' || $${paramIdx} || '%'
                )`;
                // Normalize input: turn all alefs to 'ا'
                const normalizedQuery = debouncedSearchQuery.replace(/[أإآ]/g, 'ا');
                params.push(normalizedQuery);
            }

            if (filterStatus.length > 0) {
                if (filterStatus.includes('pending')) {
                    whereClause += " AND t.state = 'pending'";
                } else {
                    // Logic for other filters if any... 
                }
            }

            // Count total
            const countQuery = `
                SELECT COUNT(*) as count 
                FROM "transaction" t
                JOIN book b ON t.book_id = b.id
                LEFT JOIN party p ON t.party_id = p.id
                ${whereClause}
            `;
            const countResult = await db.select(countQuery, params);
            const totalItems = countResult[0]?.count || 0;
            setTotalPages(Math.ceil(totalItems / ITEMS_PER_PAGE));

            const offset = (page - 1) * ITEMS_PER_PAGE;

            const rows = await db.select(`
                SELECT 
                  t.id, t.qty, t.unit_price, t.total_price, t.receipt_no, t.tx_date, t.notes, t.state,
                  b.title as book_title, b.id as book_id,
                  p.name as party_name, p.id as party_id
                FROM "transaction" t
                JOIN book b ON t.book_id = b.id
                LEFT JOIN party p ON t.party_id = p.id
                ${whereClause}
                ORDER BY t.tx_date DESC, t.id DESC
                LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
            `, params);

            setTransactions(rows);

            const booksData = await db.select("SELECT id, title, unit_price FROM book ORDER BY display_order ASC, title ASC");
            setBooks(booksData);

            const partiesData = await db.select("SELECT id, name FROM party ORDER BY id DESC");
            setParties(partiesData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [page, debouncedSearchQuery, filterStatus]);

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

    // Derived state for Combobox
    const filteredParties =
        query === ''
            ? parties
            : parties.filter((party) => {
                return normalizeArabic(party.name).includes(normalizeArabic(query))
            }); // removed slice for manual pagination

    const filteredBooks =
        bookQuery === ''
            ? books
            : books.filter((book) => {
                return normalizeArabic(book.title).includes(normalizeArabic(bookQuery))
            }).slice(0, 50);

    const filteredMultiBooks =
        multiBookQuery === ''
            ? books
            : books.filter((book) => normalizeArabic(book.title).includes(normalizeArabic(multiBookQuery))).slice(0, 50);

    const handleQtyPriceChange = (field, val) => {
        const newForm = { ...formData, [field]: val };
        const qty = parseFloat(newForm.qty) || 0;
        const price = parseFloat(newForm.unit_price) || 0;
        newForm.total_price = qty * price;
        setFormData(newForm);
    };

    const handleBookChange = (book) => {
        const newForm = { ...formData, book_id: book };

        if (book && !editId) {
            // Only auto-populate price for NEW sales, not when editing
            newForm.unit_price = book.unit_price || 0;
            newForm.total_price = (parseFloat(newForm.qty) || 0) * (book.unit_price || 0);
        }

        setFormData(newForm);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            const state = formData.is_pending ? 'pending' : 'final';
            if (editId) {
                const partyId = formData.party_id?.id || formData.party_id || null;
                const bookId = formData.book_id?.id || formData.book_id;
                await db.execute(`
          UPDATE "transaction" 
          SET book_id=$1, party_id=$2, qty=$3, unit_price=$4, total_price=$5, receipt_no=$6, tx_date=$7, notes=$8, state=$9
          WHERE id=$10
        `, [
                    bookId, partyId, formData.qty, formData.unit_price, formData.total_price,
                    formData.receipt_no, formData.tx_date, formData.notes, state, editId
                ]);
            } else if (isMultiMode) {
                for (const item of selectedMultiBooks) {
                    const partyId = formData.party_id?.id || formData.party_id || null;
                    const totalPrice = (parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0);
                    await db.execute(`
                        INSERT INTO "transaction" (type, state, book_id, party_id, qty, unit_price, total_price, receipt_no, tx_date, notes)
                        VALUES ('sale', $1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        state, item.book.id, partyId, item.qty, item.unit_price, totalPrice,
                        formData.receipt_no, formData.tx_date, formData.notes
                    ]);
                }
            } else {
                const partyId = formData.party_id?.id || formData.party_id || null;
                const bookId = formData.book_id?.id || formData.book_id;
                await db.execute(`
          INSERT INTO "transaction" (type, state, book_id, party_id, qty, unit_price, total_price, receipt_no, tx_date, notes)
          VALUES ('sale', $1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
                    state, bookId, partyId, formData.qty, formData.unit_price, formData.total_price,
                    formData.receipt_no, formData.tx_date, formData.notes
                ]);
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

    const handleQuickAddParty = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            const result = await db.execute(
                "INSERT INTO party (name, phone, address, notes) VALUES ($1, $2, $3, $4)",
                [newPartyForm.name, newPartyForm.phone, newPartyForm.address, newPartyForm.notes]
            );

            // Re-fetch parties
            const partiesData = await db.select("SELECT id, name FROM party ORDER BY name");
            setParties(partiesData);

            // Find the new party and select it
            const newParty = partiesData.find(p => p.name === newPartyForm.name);
            if (newParty) {
                setFormData(prev => ({ ...prev, party_id: newParty }));
            }

            setIsAddPartyOpen(false);
            setNewPartyForm({ name: "", phone: "", address: "", notes: "" });
        } catch (err) {
            alert("Error adding party: " + err.message);
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
            // Tauri SQL plugin doesn't support array parameters easily in IN clause, 
            // so we build the query string or run multiple queries.
            // For safety and simplicity with SQLite, multiple deletes or a JOIN-like string.
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
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === transactions.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(transactions.map(t => t.id));
        }
    };

    const openEdit = (row) => {
        const p = parties.find(p => p.id === row.party_id);
        const b = books.find(b => b.id === row.book_id);
        setFormData({
            book_id: b || null,
            qty: row.qty,
            unit_price: row.unit_price || 0,
            total_price: row.total_price || 0,
            receipt_no: row.receipt_no || "",
            party_id: p || null,
            tx_date: row.tx_date,
            notes: row.notes || "",
            is_pending: row.state === 'pending'
        });
        setEditId(row.id);
        setIsMultiMode(false);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            book_id: books[0] || null,
            qty: 1,
            unit_price: books[0]?.unit_price || 0,
            total_price: books[0]?.unit_price || 0,
            receipt_no: "",
            party_id: parties[0] || null,
            tx_date: new Date().toISOString().split('T')[0],
            notes: "",
            is_pending: false
        });
        setIsMultiMode(false);
        setSelectedMultiBooks([]);
        setMultiBookQuery('');
    };

    const toggleMultiBook = (book) => {
        const exists = selectedMultiBooks.find(b => b.book.id === book.id);
        if (exists) {
            setSelectedMultiBooks(selectedMultiBooks.filter(b => b.book.id !== book.id));
        } else {
            setSelectedMultiBooks([...selectedMultiBooks, { book, qty: 1, unit_price: book.unit_price || 0 }]);
        }
    };

    const updateMultiBook = (bookId, field, value) => {
        setSelectedMultiBooks(selectedMultiBooks.map(item =>
            item.book.id === bookId ? { ...item, [field]: value } : item
        ));
    };

    const selectAllBooks = () => {
        if (selectedMultiBooks.length === books.length) {
            setSelectedMultiBooks([]);
        } else {
            setSelectedMultiBooks(books.map(b => ({ book: b, qty: 1, unit_price: b.unit_price || 0 })));
        }
    };


    /* if (loading) return <Loader2 className="animate-spin" />; */


    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl md:text-3xl font-bold text-primary">سجل البيع</h1>
                        {selectedIds.length > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs px-2">
                                    <Trash2 className="ml-2" size={16} />
                                    حذف المحدد ({selectedIds.length})
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
                                placeholder="بحث في المبيعات..."
                                className="pr-10 pl-10 w-full"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => { setSearchQuery(""); mainSearchRef.current?.focus(); }}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <Button onClick={() => { resetForm(); setEditId(null); setIsModalOpen(true); }}>
                            <Plus className="ml-2" size={18} /> إضافة بيع
                        </Button>
                    </div>
                </div>

                {/* Status Filter Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg border">
                        <Filter size={16} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-500 whitespace-nowrap">تصفية:</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilterStatus(prev => prev.includes('final') ? [] : ['final'])}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${filterStatus.includes('final')
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                                }`}
                        >
                            مكتمل
                        </button>
                        <button
                            onClick={() => setFilterStatus(prev => prev.includes('pending') ? [] : ['pending'])}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${filterStatus.includes('pending')
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                                }`}
                        >
                            طور البيع
                        </button>
                        {filterStatus.length > 0 && (
                            <button onClick={() => setFilterStatus([])} className="px-2 py-1 text-xs text-red-500 hover:text-red-700 font-bold">مسح</button>
                        )}
                    </div>
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
                                        className="w-4 h-4 rounded border-primary-foreground/10 accent-white"
                                        checked={transactions.length > 0 && selectedIds.length === transactions.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap text-center min-w-[100px]">الحالة</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center whitespace-nowrap">العدد</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-1/2 text-right">اسم الكتاب</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-1/2 text-right">الجهة (المشتري)</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center whitespace-nowrap">السعر</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center whitespace-nowrap">المبلغ الكلي</th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap text-right">رقم الوصل</th>
                                <th className="p-4 border-l border-primary-foreground/10 whitespace-nowrap text-center">التاريخ</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-20 text-center whitespace-nowrap">ملاحظات</th>
                                <th className="p-4 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading && (
                                <tr>
                                    <td colSpan="12" className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="animate-spin text-primary" size={32} />
                                            <span className="text-sm font-medium">جاري تحديث البيانات...</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && transactions.map((t, idx) => (
                                <tr key={t.id} className={`odd:bg-muted/30 even:bg-white hover:bg-primary/5 transition-colors ${selectedIds.includes(t.id) ? 'bg-primary/10' : ''}`}>
                                    <td className="p-4 text-center border-l border-border/50 w-10 cursor-pointer" onClick={() => toggleSelect(t.id)}>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary pointer-events-none"
                                            checked={selectedIds.includes(t.id)}
                                            readOnly
                                        />
                                    </td>
                                    <td className="p-4 border-l border-border/50 text-center whitespace-nowrap">
                                        {t.state === 'pending'
                                            ? <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-bold whitespace-nowrap">طور البيع</span>
                                            : <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-bold whitespace-nowrap">مكتمل</span>
                                        }
                                    </td>
                                    <td className="p-4 font-bold text-primary border-l border-border/50 text-center">{t.qty}</td>
                                    <td className="p-4 font-bold text-foreground border-l border-border/50">{t.book_title}</td>
                                    <td className="p-4 text-foreground border-l border-border/50 font-medium">{t.party_name || "-"}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 text-center">{t.unit_price?.toLocaleString()}</td>
                                    <td className="p-4 font-bold text-primary border-l border-border/50 text-center">{t.total_price?.toLocaleString()}</td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 text-center">{t.receipt_no}</td>
                                    <td className="p-4 text-center text-muted-foreground border-l border-border/50 tracking-tighter">
                                        {t.tx_date?.split('-').reverse().join('/')}
                                    </td>
                                    <td className="p-4 text-muted-foreground border-l border-border/50 w-20 text-center">
                                        <NotesCell text={t.notes} iconOnly={true} />
                                    </td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={18} /></button>
                                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                            {!loading && transactions.length === 0 && (
                                <tr>
                                    <td colSpan="12" className="p-8 text-center text-muted-foreground">
                                        لا توجد بيانات
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Pagination Controls */}
            <PaginationControls
                page={page}
                totalPages={totalPages}
                setPage={setPage}
                isLoading={isFetching}
            />

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editId ? "تعديل عملية بيع" : (isMultiMode ? "إضافة بيع بخيارات متعددة" : "إضافة عملية بيع")}
                maxWidth={isMultiMode ? "max-w-4xl" : "max-w-lg"}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!editId && (
                        <div className="flex items-center justify-between bg-secondary/20 p-2 rounded-lg mb-4">
                            <span className="text-sm font-bold text-primary">إضافة عدة كتب في آن واحد؟</span>
                            <button
                                type="button"
                                onClick={() => setIsMultiMode(!isMultiMode)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-primary ring-offset-2 ${isMultiMode ? 'bg-primary' : 'bg-gray-300'}`}
                            >
                                <span className={`${isMultiMode ? '-translate-x-6' : '-translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                            </button>
                        </div>
                    )}

                    {!isMultiMode ? (
                        <div>
                            <label className="block text-sm font-medium mb-1 text-primary">الكتاب</label>
                            <div className="relative w-full">
                                <Combobox value={formData.book_id} onChange={handleBookChange} onClose={() => setBookQuery('')}>
                                    {({ open }) => (
                                        <div className="relative mt-1">
                                            <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-right shadow-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm py-1">
                                                <ComboboxInput
                                                    className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 text-right"
                                                    displayValue={(book) => book?.title || ''}
                                                    onFocus={(e) => e.target.select()}
                                                    onClick={() => !open && bookComboRef.current?.click()}
                                                    onChange={(event) => setBookQuery(event.target.value)}
                                                    placeholder="ابحث عن كتاب..."
                                                />
                                                <ComboboxButton ref={bookComboRef} className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronsUpDown
                                                        className="h-5 w-5 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                </ComboboxButton>
                                            </div>
                                            <ComboboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50">
                                                {filteredBooks.length === 0 && bookQuery !== '' ? (
                                                    <div className="relative cursor-default select-none px-4 py-2 text-gray-700 font-bold">
                                                        لا توجد بيانات.
                                                    </div>
                                                ) : (
                                                    filteredBooks.map((book) => (
                                                        <ComboboxOption
                                                            key={book.id}
                                                            className={({ active }) =>
                                                                `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-primary-foreground' : 'text-gray-900'
                                                                }`
                                                            }
                                                            value={book}
                                                        >
                                                            {({ selected, active }) => (
                                                                <>
                                                                    <span
                                                                        className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                                                            }`}
                                                                    >
                                                                        {book.title}
                                                                    </span>
                                                                    {selected ? (
                                                                        <span
                                                                            className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'
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
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-gray-50 p-1 px-3 rounded-lg">
                                <span className="text-sm font-bold">اختر الكتب المراد بيعها ({selectedMultiBooks.length}):</span>
                                <Button className="h-5 px-1 md:h-7 md:px-2" type="button" variant="outline" size="sm" onClick={selectAllBooks}>
                                    {selectedMultiBooks.length === books.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                                </Button>
                            </div>

                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                <Input
                                    ref={multiBookRef}
                                    placeholder="بحث في القائمة..."
                                    value={multiBookQuery}
                                    onChange={e => setMultiBookQuery(e.target.value)}
                                    className="pr-9 pl-9"
                                />
                                {multiBookQuery && (
                                    <button
                                        type="button"
                                        onClick={() => { setMultiBookQuery(''); multiBookRef.current?.focus(); }}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="max-h-[110px] overflow-y-auto border rounded-xl divide-y bg-white">
                                {filteredMultiBooks.map(book => (
                                    <div
                                        key={book.id}
                                        onClick={() => toggleMultiBook(book)} className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary pointer-events-none"
                                                checked={selectedMultiBooks.some(b => b.book.id === book.id)}
                                                readOnly
                                            />
                                            <span className="font-bold text-sm">{book.title}</span>
                                        </div>
                                        {selectedMultiBooks.find(b => b.book.id === book.id) && (
                                            <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-col">
                                                    <label className="text-[10px] text-muted-foreground">العدد</label>
                                                    <Input
                                                        type="number"
                                                        className="w-16 h-8 p-1 text-xs text-center"
                                                        value={selectedMultiBooks.find(b => b.book.id === book.id).qty}
                                                        onChange={(e) => updateMultiBook(book.id, 'qty', e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex flex-col">
                                                    <label className="text-[10px] text-muted-foreground">السعر</label>
                                                    <Input
                                                        type="number"
                                                        className="w-24 h-8 p-1 text-xs text-center"
                                                        value={selectedMultiBooks.find(b => b.book.id === book.id).unit_price}
                                                        onChange={(e) => updateMultiBook(book.id, 'unit_price', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-amber-50 p-3 rounded-lg border border-amber-100">
                        <input
                            id="is_pending"
                            type="checkbox"
                            className="h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            checked={formData.is_pending}
                            onChange={e => setFormData({ ...formData, is_pending: e.target.checked })}
                        />
                        <label htmlFor="is_pending" className="text-sm font-bold text-amber-900 cursor-pointer">
                            في طور البيع (لم يتم استلام المبلغ بعد)
                        </label>
                    </div>

                    {!isMultiMode && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">العدد</label>
                                    <Input
                                        type="number" min="1" required
                                        value={formData.qty}
                                        onChange={e => handleQtyPriceChange('qty', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">سعر النسخة</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        value={formData.unit_price}
                                        onChange={e => handleQtyPriceChange('unit_price', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">المبلغ الكلي</label>
                                    <p className="text-sm font-bold">{formData.total_price} دينار عراقي</p>
                                </div>
                                <div />
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">رقم الوصل</label>
                            <Input
                                type="text"
                                value={formData.receipt_no}
                                onChange={e => setFormData({ ...formData, receipt_no: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">تاريخ البيع</label>
                            <DateInput
                                value={formData.tx_date}
                                onChange={val => setFormData({ ...formData, tx_date: val })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-primary">الجهة (المشتري)</label>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full">
                                <Combobox value={formData.party_id} onChange={(val) => setFormData({ ...formData, party_id: val })} onClose={() => setQuery('')}>
                                    {({ open }) => (
                                        <div className="relative">
                                            <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-right shadow-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
                                                <ComboboxInput
                                                    className="w-full border-none py-3 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 text-right"
                                                    displayValue={(party) => party?.name || ''}
                                                    onFocus={(e) => e.target.select()}
                                                    onClick={() => !open && partyComboRef.current?.click()}
                                                    onChange={(event) => setQuery(event.target.value)}
                                                    placeholder="ابحث عن جهة..."
                                                />
                                                <ComboboxButton ref={partyComboRef} className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronsUpDown
                                                        className="h-5 w-5 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                </ComboboxButton>
                                            </div>
                                            <ComboboxOptions className="absolute mt-1 max-h-44 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50">
                                                {filteredParties.length === 0 && query !== '' ? (
                                                    <div className="relative cursor-default select-none px-4 py-2 text-gray-700 font-bold">
                                                        لا توجد بيانات.
                                                    </div>
                                                ) : (
                                                    <>
                                                        {filteredParties.slice(0, partyLimit).map((party) => (
                                                            <ComboboxOption
                                                                key={party.id}
                                                                className={({ active }) =>
                                                                    `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-primary text-primary-foreground' : 'text-gray-900'
                                                                    }`
                                                                }
                                                                value={party}
                                                            >
                                                                {({ selected, active }) => (
                                                                    <>
                                                                        <span
                                                                            className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                                                                }`}
                                                                        >
                                                                            {party.name}
                                                                        </span>
                                                                        {selected ? (
                                                                            <span
                                                                                className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-primary'
                                                                                    }`}
                                                                            >
                                                                                <Check className="h-5 w-5" aria-hidden="true" />
                                                                            </span>
                                                                        ) : null}
                                                                    </>
                                                                )}
                                                            </ComboboxOption>
                                                        ))}
                                                        {filteredParties.length > partyLimit && (
                                                            <div className="p-1">
                                                                <button
                                                                    type="button"
                                                                    className="w-full text-center py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md font-bold"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setPartyLimit(prev => prev + 30);
                                                                    }}
                                                                >
                                                                    عرض المزيد...
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </ComboboxOptions>
                                        </div>
                                    )}
                                </Combobox>
                            </div>
                            <Button type="button" onClick={() => setIsAddPartyOpen(true)} className="px-3">
                                <Plus size={18} />
                            </Button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">ملاحظات</label>
                        <Textarea
                            rows={3}
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>

                    <Button type="submit" className="w-full">حفظ</Button>
                </form>
            </Modal>

            {/* Quick Add Party Modal */}
            <Modal isOpen={isAddPartyOpen} onClose={() => setIsAddPartyOpen(false)} title="إضافة جهة جديدة">
                <form onSubmit={handleQuickAddParty} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">اسم الجهة</label>
                        <Input required value={newPartyForm.name} onChange={e => setNewPartyForm({ ...newPartyForm, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">الهاتف</label>
                        <Input value={newPartyForm.phone} onChange={e => setNewPartyForm({ ...newPartyForm, phone: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">العنوان</label>
                        <Input value={newPartyForm.address} onChange={e => setNewPartyForm({ ...newPartyForm, address: e.target.value })} />
                    </div>
                    <Button type="submit" className="w-full">إضافة</Button>
                </form>
            </Modal>
        </div >
    );
}

