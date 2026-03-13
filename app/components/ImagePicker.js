"use client";
import React, { useState, useEffect } from "react";
import { getDb } from "../../app/lib/db";
import { Button, Input } from "./ui/Base";
import { Modal } from "./ui/Modal";
import { Search, Image as ImageIcon, Upload, Check, Trash2, X, Loader2 } from "lucide-react";
import { open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

export function ImagePicker({ value, onChange, label = "اختر صورة", className = "" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [images, setImages] = useState([]);
    const [search, setSearch] = useState("");
    const [previewTarget, setPreviewTarget] = useState(null);
    const [limit, setLimit] = useState(15);
    const [isLoading, setIsLoading] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(handler);
    }, [search]);

    // Initial load: view image
    useEffect(() => {
        if (value) {
            const strVal = String(value);
            if (strVal.startsWith('data:')) {
                setPreviewTarget(strVal);
            } else {
                getDb().then(db => {
                    db.select("SELECT data FROM image_center WHERE id = $1", [parseInt(strVal)]).then(res => {
                        if (res.length > 0) setPreviewTarget(res[0].data);
                    });
                });
            }
        } else {
            setPreviewTarget(null);
        }
    }, [value]);

    const loadImages = async (query = "") => {
        try {
            setIsLoading(true);
            const db = await getDb();
            let res;
            if (query) {
                res = await db.select("SELECT id, name, data, size FROM image_center WHERE name LIKE '%' || $1 || '%' ORDER BY id DESC", [query]);
            } else {
                res = await db.select("SELECT id, name, data, size FROM image_center ORDER BY id DESC");
            }
            setImages(res);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        setLimit(15);
        loadImages(debouncedSearch);
    };

    useEffect(() => {
        if (isOpen) {
            loadImages(debouncedSearch);
        }
    }, [debouncedSearch]);

    const handleUpload = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });

            if (selected) {
                const contents = await readFile(selected);
                const base64 = typeof window !== 'undefined' ?
                    btoa(new Uint8Array(contents).reduce((data, byte) => data + String.fromCharCode(byte), '')) : '';

                const mimeType = selected.toLowerCase().endsWith('.png') ? 'image/png' :
                    selected.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';

                const dataString = `data:${mimeType};base64,${base64}`;
                const sizeBytes = contents.length;

                // Extract filename
                const name = selected.split(/[\/\\]/).pop() || "صورة جديدة";

                // Get width and height
                const img = new window.Image();
                img.onload = async () => {
                    const db = await getDb();
                    await db.execute("INSERT INTO image_center (name, data, size, width, height) VALUES ($1, $2, $3, $4, $5)", [name, dataString, sizeBytes, img.width, img.height]);
                    const last = await db.select("SELECT id FROM image_center ORDER BY id DESC LIMIT 1");
                    if (last.length > 0) {
                        onChange(last[0].id.toString());
                        setIsOpen(false);
                    }
                };
                img.src = dataString;
            }
        } catch (err) {
            console.error("Image upload error", err);
            await message("فشل في رفع الصورة", { title: "خطأ", kind: "error" });
        }
    };

    const handleSelect = (id) => {
        onChange(id.toString());
        setIsOpen(false);
    };

    const clearSelection = (e) => {
        e.stopPropagation();
        onChange(null);
    };

    return (
        <div className={className}>
            <div
                onClick={handleOpen}
                className="w-full flex-1 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative overflow-hidden group min-h-[80px]"
            >
                {previewTarget ? (
                    <>
                        <img src={previewTarget} className="w-full h-full object-cover absolute inset-0" alt="Preview" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold">
                            تغيير
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                clearSelection(e);
                            }}
                            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 size={12} />
                        </button>
                    </>
                ) : (
                    <div className="text-center p-2 text-gray-400">
                        <ImageIcon size={24} className="mx-auto mb-1 opacity-50" />
                        <span className="text-[10px]">اضغط لاختيار صورة</span>
                    </div>
                )}
            </div>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="مكتبة الصور" className="max-w-4xl flex flex-col" maxWidth="max-w-4xl">
                <div className="flex flex-col space-y-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <Input
                                placeholder="بحث عن صورة..."
                                className="pr-10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <Button onClick={handleUpload} type="button">
                            <Upload size={18} className="ml-2" /> رفع صورة جديدة
                        </Button>
                    </div>

                    <div className="h-[500px] overflow-y-auto p-2 custom-scrollbar border-2 border-input rounded-xl bg-card/30">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {images.slice(0, limit).map(img => (
                                <div
                                    key={img.id}
                                    className={`relative cursor-pointer rounded-lg border-2 overflow-hidden aspect-square group transition-all duration-200 ${value === img.id.toString() ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50 bg-muted/50'}`}
                                    onClick={() => handleSelect(img.id)}
                                >
                                    <img src={img.data} alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs p-1.5 truncate text-center backdrop-blur-sm">
                                        {img.name}
                                    </div>
                                    {value === img.id.toString() && (
                                        <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-1 shadow-md">
                                            <Check size={14} />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="col-span-full h-40 flex flex-col items-center justify-center text-primary">
                                    <Loader2 size={32} className="animate-spin mb-2" />
                                    <p className="text-sm font-medium">جاري التحميل...</p>
                                </div>
                            )}
                            {!isLoading && images.length === 0 && search === "" && (
                                <div className="col-span-full h-40 flex flex-col items-center justify-center text-muted-foreground">
                                    <ImageIcon size={48} className="mb-4 opacity-50" />
                                    <p>لا توجد صور في المكتبة</p>
                                </div>
                            )}
                            {!isLoading && images.length === 0 && search !== "" && (
                                <div className="col-span-full h-40 flex items-center justify-center text-muted-foreground">
                                    لا توجد نتائج للبحث
                                </div>
                            )}
                        </div>

                        {!isLoading && images.length > limit && (
                            <div className="mt-4 flex justify-center">
                                <Button
                                    onClick={() => setLimit(prev => prev + 15)}
                                    variant="outline"
                                    className="w-1/2 md:w-1/3 border-primary/50 hover:bg-primary/10 font-bold"
                                    type="button"
                                >
                                    تحميل المزيد من الصور...
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
