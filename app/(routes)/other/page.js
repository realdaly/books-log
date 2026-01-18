"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { getDb } from "../../lib/db";
import { normalizeArabic } from "../../lib/utils";
import { Card, Button, Input, Textarea } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { DateInput } from "../../components/ui/DateInput";
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption, Transition } from '@headlessui/react';
import { Loader2, Plus, Trash2, Edit2, Check, ChevronsUpDown, Filter, Settings, Tag, Search, X } from "lucide-react";
import { ask, message } from '@tauri-apps/plugin-dialog';
import { NotesCell } from "../../components/ui/NotesCell";

export default function OtherStoresPage() {
    const [transactions, setTransactions] = useState([]);
    const [books, setBooks] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        book_id: null,
        qty: 1,
        categoryIds: [], // Now an array
        tx_date: new Date().toISOString().split('T')[0],
        notes: ""
    });
    const [editId, setEditId] = useState(null);
    const [isMultiMode, setIsMultiMode] = useState(false);
    const [selectedMultiBooks, setSelectedMultiBooks] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);

    // Category Management
    const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
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

    // Filters
    const [filterCategoryIds, setFilterCategoryIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");

    // Combobox Query
    const [bookQuery, setBookQuery] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const db = await getDb();
            const rows = await db.select(`
                SELECT 
                    ot.id, ot.qty, ot.tx_date, ot.notes,
                    b.title as book_title, b.id as book_id,
                    GROUP_CONCAT(oc.name) as category_names,
                    GROUP_CONCAT(oc.id) as category_ids
                FROM other_transaction ot
                JOIN book b ON ot.book_id = b.id
                LEFT JOIN other_transaction_category_link otcl ON ot.id = otcl.transaction_id
                LEFT JOIN other_category oc ON otcl.category_id = oc.id
                GROUP BY ot.id
                ORDER BY ot.tx_date DESC, ot.id DESC
            `);
            const normalizedRows = rows.map(r => ({
                ...r,
                category_names: r.category_names ? r.category_names.split(',') : [],
                category_ids: r.category_ids ? r.category_ids.split(',').map(Number) : []
            }));
            setTransactions(normalizedRows);

            const booksData = await db.select("SELECT id, title FROM book ORDER BY id DESC");
            setBooks(booksData);

            const catRows = await db.select("SELECT * FROM other_category ORDER BY name ASC");
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

    const filteredBooks = bookQuery === ''
        ? books
        : books.filter((book) => normalizeArabic(book.title).includes(normalizeArabic(bookQuery)));

    const filteredTransactions = transactions.filter(t => {
        const searchOk = normalizeArabic(t.book_title).includes(normalizeArabic(searchTerm));
        if (filterCategoryIds.length === 0) return searchOk;
        // AND logic for filter categories
        return searchOk && filterCategoryIds.every(fid => t.category_ids.includes(fid));
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const db = await getDb();
            let tId = editId;

            if (editId) {
                const bookId = formData.book_id?.id || formData.book_id;
                await db.execute(`
                    UPDATE other_transaction 
                    SET book_id=$1, qty=$2, tx_date=$3, notes=$4
                    WHERE id=$5
                `, [bookId, formData.qty, formData.tx_date, formData.notes, editId]);
            } else if (isMultiMode) {
                for (const book of selectedMultiBooks) {
                    const res = await db.execute(`
                        INSERT INTO other_transaction (book_id, qty, tx_date, notes)
                        VALUES ($1, $2, $3, $4)
                    `, [book.id, formData.qty, formData.tx_date, formData.notes]);
                    // Linked categories
                    const lastId = res.lastInsertId;
                    for (const cid of formData.categoryIds) {
                        await db.execute("INSERT INTO other_transaction_category_link (transaction_id, category_id) VALUES ($1, $2)", [lastId, cid]);
                    }
                }
            } else {
                const bookId = formData.book_id?.id || formData.book_id;
                const res = await db.execute(`
                    INSERT INTO other_transaction (book_id, qty, tx_date, notes)
                    VALUES ($1, $2, $3, $4)
                `, [bookId, formData.qty, formData.tx_date, formData.notes]);
                tId = res.lastInsertId;
            }

            // Update categories for single add/edit
            if (!isMultiMode && tId) {
                await db.execute("DELETE FROM other_transaction_category_link WHERE transaction_id=$1", [tId]);
                for (const cid of formData.categoryIds) {
                    await db.execute("INSERT INTO other_transaction_category_link (transaction_id, category_id) VALUES ($1, $2)", [tId, cid]);
                }
            }

            setIsModalOpen(false);
            setEditId(null);
            resetForm();
            fetchData();
        } catch (err) {
            alert("Error saving: " + err.message);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await ask("هل انت متأكد من الحذف؟", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        const db = await getDb();
        await db.execute('DELETE FROM other_transaction WHERE id=$1', [id]);
        fetchData();
    };

    const handleBulkDelete = async () => {
        const confirmed = await ask(`هل انت متأكد من حذف ${selectedIds.length} عنصر؟`, { title: 'تأكيد الحذف المتعدد', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            for (const id of selectedIds) {
                await db.execute('DELETE FROM other_transaction WHERE id=$1', [id]);
            }
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredTransactions.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredTransactions.map(t => t.id));
        }
    };

    const openEdit = (row) => {
        const b = books.find(b => b.id === row.book_id);
        setFormData({
            book_id: b || null,
            qty: row.qty,
            categoryIds: row.category_ids || [],
            tx_date: row.tx_date,
            notes: row.notes || ""
        });
        setEditId(row.id);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            book_id: books[0] || null, // Default to latest book
            qty: 1,
            categoryIds: [],
            tx_date: new Date().toISOString().split('T')[0],
            notes: ""
        });
        setIsMultiMode(false);
        setSelectedMultiBooks([]);
        setBookQuery("");
    };

    const toggleMultiBook = (book) => {
        const exists = selectedMultiBooks.find(b => b.id === book.id);
        if (exists) {
            setSelectedMultiBooks(selectedMultiBooks.filter(b => b.id !== book.id));
        } else {
            setSelectedMultiBooks([...selectedMultiBooks, book]);
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

    // Category Logic
    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;
        try {
            const db = await getDb();
            await db.execute("INSERT INTO other_category (name) VALUES ($1)", [newCategoryName.trim()]);
            setNewCategoryName("");
            const catRows = await db.select("SELECT * FROM other_category ORDER BY name ASC");
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
            await db.execute("DELETE FROM other_category WHERE id=$1", [id]);
            const catRows = await db.select("SELECT * FROM other_category ORDER BY name ASC");
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
            await db.execute("UPDATE other_category SET name=$1 WHERE id=$2", [editingCategory.name.trim(), editingCategory.id]);
            setEditingCategory(null);
            const catRows = await db.select("SELECT * FROM other_category ORDER BY name ASC");
            setCategories(catRows);
        } catch (e) {
            alert("خطأ في التعديل");
        }
    };

    const selectAllBooks = () => {
        if (selectedMultiBooks.length === books.length) {
            setSelectedMultiBooks([]);
        } else {
            setSelectedMultiBooks([...books]);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" size={48} /></div>;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold text-primary">سجل المخازن الأخرى</h1>
                        {selectedIds.length > 0 && (
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                                <Trash2 className="ml-2" size={16} />
                                حذف المحدد ({selectedIds.length})
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <div className="relative w-full md:w-64 group">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                            <Input
                                placeholder="بحث عن حركة..."
                                className="pr-10 pl-10 w-full"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
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
                        <Button onClick={() => { resetForm(); setEditId(null); setIsModalOpen(true); }}>
                            <Plus className="ml-2" size={18} /> إضافة حركة
                        </Button>
                    </div>
                </div>

                {/* Categories Filter Bar */}
                <div className="flex items-center gap-2 pb-2 w-full">
                    <div className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg border">
                        <Filter size={16} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-500 whitespace-nowrap">تصفية:</span>
                    </div>
                    <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide">
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
                    <button onClick={() => setManageCategoriesOpen(true)} className="mr-auto p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-full transition-colors"><Settings size={16} /></button>
                </div>
            </div>

            <Card className="flex-1 p-0 overflow-hidden border-0 shadow-lg bg-white/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground font-bold sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 border-l border-primary-foreground/10 text-center w-10">
                                    <input type="checkbox" checked={filteredTransactions.length > 0 && selectedIds.length === filteredTransactions.length} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-white" />
                                </th>
                                <th className="p-4 border-l border-primary-foreground/10 w-full text-right">اسم الكتاب</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center whitespace-nowrap">العدد</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[250px] text-right whitespace-nowrap">التصنيفات</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center whitespace-nowrap">التاريخ</th>
                                <th className="p-4 border-l border-primary-foreground/10 w-[210px] text-right whitespace-nowrap">ملاحظات</th>
                                <th className="p-4 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredTransactions.map(t => (
                                <tr key={t.id} className={`odd:bg-muted/30 even:bg-white hover:bg-primary/5 transition-colors ${selectedIds.includes(t.id) ? 'bg-primary/10' : ''}`}>
                                    <td className="p-4 text-center"><input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)} className="w-4 h-4 rounded text-primary" /></td>
                                    <td className="p-4 font-bold text-foreground">
                                        <div>{t.book_title}</div>
                                    </td>
                                    <td className="p-4 text-center text-primary text-base">{t.qty}</td>
                                    <td className="p-4 w-[250px]">
                                        <div className="flex flex-wrap gap-1 overflow-hidden h-6">
                                            {t.category_names.map((name, idx) => (
                                                <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded border border-gray-200 whitespace-nowrap">{name}</span>
                                            ))}
                                            {t.category_names.length === 0 && <span className="text-gray-400 text-xs">-</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center text-muted-foreground">{t.tx_date?.split('-').reverse().join('/')}</td>
                                    <td className="p-4 text-muted-foreground w-[210px] whitespace-nowrap overflow-hidden text-ellipsis">
                                        <NotesCell text={t.notes} />
                                    </td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <button onClick={() => openEdit(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={18} /></button>
                                        <button onClick={() => handleDelete(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Add/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? "تعديل حركة" : (isMultiMode ? "إضافة حركات متعددة" : "إضافة حركة")} maxWidth={isMultiMode ? "max-w-4xl" : "max-w-lg"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!editId && (
                        <div className="flex items-center justify-between bg-primary/5 p-2 rounded-lg mb-4">
                            <span className="text-sm font-bold text-primary">إضافة عدة كتب؟</span>
                            <button
                                type="button"
                                onClick={() => setIsMultiMode(!isMultiMode)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-primary ring-offset-2 ${isMultiMode ? 'bg-primary' : 'bg-gray-300'}`}
                            >
                                <span className={`${isMultiMode ? '-translate-x-6' : '-translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                            </button>
                        </div>
                    )}

                    {
                        !isMultiMode ? (
                            <div>
                                <label className="block text-sm font-bold mb-1 text-primary">الكتاب</label>
                                <div className="relative w-full">
                                    <Combobox value={formData.book_id} onChange={(val) => setFormData({ ...formData, book_id: val })} onClose={() => setBookQuery('')}>
                                        <div className="relative mt-1">
                                            <ComboboxButton as="div" className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-right shadow-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm py-1">
                                                <ComboboxInput
                                                    className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 text-right"
                                                    displayValue={b => b?.title || ''}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={e => setBookQuery(e.target.value)}
                                                    placeholder="اختر كتاباً..."
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                                    <ChevronsUpDown
                                                        className="h-5 w-5 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                </div>
                                            </ComboboxButton>
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
                                    </Combobox>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-dashed border-gray-300">
                                    <span className="text-sm font-bold text-primary">اختر الكتب المراد اهداؤها:</span>
                                    <Button type="button" variant="outline" size="sm" onClick={selectAllBooks}>
                                        {selectedMultiBooks.length === books.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                                    </Button>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto border rounded-xl divide-y bg-white custom-scrollbar">
                                    {books.map(book => (
                                        <div key={book.id} className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onClick={() => toggleMultiBook(book)}>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary pointer-events-none"
                                                    checked={selectedMultiBooks.some(b => b.id === book.id)}
                                                    readOnly
                                                />
                                                <span className="font-bold text-sm">{book.title}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    }

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">العدد</label>
                            <Input type="number" min="1" required value={formData.qty} onChange={e => setFormData({ ...formData, qty: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">التاريخ</label>
                            <DateInput value={formData.tx_date} onChange={val => setFormData({ ...formData, tx_date: val })} />
                        </div>
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
                                    <div className="relative mt-1">
                                        <ComboboxButton as="div" className="py-1 relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm border">
                                            <ComboboxInput
                                                className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 text-right font-bold"
                                                displayValue={() => ""}
                                                onChange={(event) => setCategoryQuery(event.target.value)}
                                                placeholder="اختر التصنيفات..."
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronsUpDown
                                                    className="h-5 w-5 text-gray-400"
                                                    aria-hidden="true"
                                                />
                                            </div>
                                        </ComboboxButton>
                                        <Transition
                                            as="div"
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
                        <label className="block text-sm font-bold mb-1 text-muted-foreground">ملاحظات</label>
                        <Textarea rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                    </div>

                    <Button type="submit" className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">حفظ</Button>
                </form >
            </Modal >

            {/* Category Management Modal */}
            < Modal isOpen={manageCategoriesOpen} onClose={() => setManageCategoriesOpen(false)} title="إدارة التصنيفات" >
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
                        {categories.length === 0 && (
                            <p className="text-gray-400 text-center text-sm py-4">لا توجد تصنيفات</p>
                        )}
                    </div>
                </div>
            </Modal >
        </div >
    );
}
