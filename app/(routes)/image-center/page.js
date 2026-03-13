"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getDb } from "../../lib/db";
import { Card, Button, Input } from "../../components/ui/Base";
import { Modal } from "../../components/ui/Modal";
import { Search, Trash2, Eye, Upload, Image as ImageIcon, X } from "lucide-react";
import { ask, open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { ImageZoomModal } from "../../components/ui/ImageZoomModal";
import { PaginationControls } from "../../components/ui/PaginationControls";

export default function ImageCenterPage() {
    const [images, setImages] = useState([]);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    // View Modal
    const [viewImageModalOpen, setViewImageModalOpen] = useState(false);
    const [currentViewImage, setCurrentViewImage] = useState(null);

    // Checkbox selection
    const [selectedIds, setSelectedIds] = useState([]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
            setPage(1);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const db = await getDb();

            let whereClause = "";
            let params = [];

            if (debouncedSearchQuery) {
                whereClause = " WHERE name LIKE '%' || $1 || '%'";
                params.push(debouncedSearchQuery);
            }

            const countQuery = `SELECT COUNT(*) as count FROM image_center${whereClause}`;
            const countResult = await db.select(countQuery, params);
            const totalItems = countResult[0]?.count || 0;
            setTotalPages(Math.ceil(totalItems / itemsPerPage) || 1);

            const offset = (page - 1) * itemsPerPage;

            let query = `SELECT id, name, data, size, width, height, created_at FROM image_center${whereClause} ORDER BY id DESC LIMIT ${itemsPerPage} OFFSET ${offset}`;

            const rows = await db.select(query, params);
            setImages(rows);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch images:", err);
            setLoading(false);
        }
    }, [debouncedSearchQuery, page, itemsPerPage]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatSize = (bytes) => {
        if (!bytes) return "0 Bytes";
        const k = 1024;
        const dm = 2; // decimal points
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const handleUpload = async () => {
        try {
            const selectedItems = await open({
                multiple: true,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });

            if (selectedItems) {
                const items = Array.isArray(selectedItems) ? selectedItems : [selectedItems];
                const db = await getDb();

                for (const selected of items) {
                    const contents = await readFile(selected);
                    const base64 = typeof window !== 'undefined' ?
                        btoa(new Uint8Array(contents).reduce((data, byte) => data + String.fromCharCode(byte), '')) : '';

                    const mimeType = selected.toLowerCase().endsWith('.png') ? 'image/png' :
                        selected.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';

                    const dataString = `data:${mimeType};base64,${base64}`;
                    const sizeBytes = contents.length;

                    // Get name from path
                    const name = selected.split(/[\/\\]/).pop() || "صورة جديدة";

                    await new Promise((resolve) => {
                        const img = new window.Image();
                        img.onload = async () => {
                            await db.execute("INSERT INTO image_center (name, data, size, width, height) VALUES ($1, $2, $3, $4, $5)", [name, dataString, sizeBytes, img.width, img.height]);
                            resolve();
                        };
                        img.onerror = () => resolve();
                        img.src = dataString;
                    });
                }
                fetchData();
            }
        } catch (err) {
            console.error("Image upload failed", err);
            await message("فشل في رفع الصورة", { title: "خطأ", kind: "error" });
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await ask("هل أنت متأكد من حذف هذه الصورة؟ قد يؤدي هذا إلى إزالة الصورة من الفواتير المرتبطة بها.", { title: 'تأكيد الحذف', kind: 'warning' });
        if (!confirmed) return;
        const db = await getDb();
        await db.execute('DELETE FROM image_center WHERE id=$1', [id]);
        setSelectedIds(prev => prev.filter(i => i !== id));
        fetchData();
    };

    const handleBulkDelete = async () => {
        const confirmed = await ask(`هل أنت متأكد من حذف ${selectedIds.length} صورة؟ قد يؤدي هذا إلى إزالة الصور من الفواتير المرتبطة بها.`, { title: 'تأكيد الحذف المتعدد', kind: 'warning' });
        if (!confirmed) return;
        try {
            const db = await getDb();
            for (const id of selectedIds) {
                await db.execute('DELETE FROM image_center WHERE id=$1', [id]);
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
        if (selectedIds.length === images.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(images.map(i => i.id));
        }
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl md:text-3xl font-bold text-primary">مركز الصور</h1>
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
                            placeholder="بحث عن صورة..."
                            className="pr-10 pl-10 w-full"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(""); }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <Button onClick={handleUpload}>
                        <Upload className="ml-2" size={18} /> رفع صور
                    </Button>
                </div>
            </div>

            <Card className="flex-1 p-0 overflow-hidden border-0 shadow-lg bg-card/40">
                <div className="h-full overflow-auto">
                    <table className="w-full text-right text-sm border-collapse border-b border-border">
                        <thead className="bg-primary text-primary-foreground font-bold sticky top-0 z-10 shadow-md">
                            <tr>
                                <th className="p-4 border-l border-primary-foreground/10 text-center w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-primary-foreground/20 accent-white"
                                        checked={images.length > 0 && selectedIds.length === images.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center w-[80px]">الصورة</th>
                                <th className="p-4 border-l border-primary-foreground/10">الاسم</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center">الحجم</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center">الدقة</th>
                                <th className="p-4 border-l border-primary-foreground/10 text-center">التاريخ</th>
                                <th className="p-4 text-center cursor-default w-[120px]">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {images.map((row) => (
                                <tr key={row.id} className={`hover:bg-muted/50 transition-colors ${selectedIds.includes(row.id) ? 'bg-muted/80' : ''}`}>
                                    <td className="p-4 border-l border-border/50 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-input cursor-pointer"
                                            checked={selectedIds.includes(row.id)}
                                            onChange={() => toggleSelect(row.id)}
                                        />
                                    </td>
                                    <td className="p-4 border-l border-border/50 text-center">
                                        <div
                                            className="w-12 h-12 rounded-md overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary inline-flex border border-border/50"
                                            onClick={() => { setCurrentViewImage(row.data); setViewImageModalOpen(true); }}
                                        >
                                            <img src={row.data} alt={row.name} className="w-full h-full object-cover" />
                                        </div>
                                    </td>
                                    <td className="p-4 border-l border-border/50">
                                        <div className="font-medium truncate max-w-[200px] md:max-w-md" title={row.name}>{row.name}</div>
                                    </td>
                                    <td className="p-4 border-l border-border/50 text-center">
                                        <span className="text-muted-foreground">{formatSize(row.size)}</span>
                                    </td>
                                    <td className="p-4 border-l border-border/50 text-center">
                                        <span className="text-muted-foreground" dir="ltr">{row.width && row.height ? `${row.width}x${row.height}` : '-'}</span>
                                    </td>
                                    <td className="p-4 border-l border-border/50 text-center">
                                        <span className="text-muted-foreground">{row.created_at?.split(' ')[0]}</span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => { setCurrentViewImage(row.data); setViewImageModalOpen(true); }} title="عرض" className="text-blue-500 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30">
                                                <Eye size={16} />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} title="حذف" className="text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30">
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {images.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-muted-foreground">
                                        لا توجد صور لعرضها
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-muted-foreground">
                                        جاري التحميل...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <PaginationControls
                page={page}
                totalPages={totalPages}
                setPage={setPage}
                isLoading={loading}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
            />

            <ImageZoomModal
                isOpen={viewImageModalOpen}
                src={currentViewImage}
                onClose={() => setViewImageModalOpen(false)}
            />
        </div>
    );
}
