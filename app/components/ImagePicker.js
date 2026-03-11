"use client";
import React, { useState, useEffect } from "react";
import { getDb } from "../../app/lib/db";
import { Button, Input } from "./ui/Base";
import { Modal } from "./ui/Modal";
import { Search, Image as ImageIcon, Upload, Check, Trash2, X } from "lucide-react";
import { open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

export function ImagePicker({ value, onChange, label = "اختر صورة", className = "" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [images, setImages] = useState([]);
    const [search, setSearch] = useState("");
    const [previewTarget, setPreviewTarget] = useState(null);

    // Initial load: view image
    useEffect(() => {
        if (value) {
            getDb().then(db => {
                db.select("SELECT data FROM image_center WHERE id = $1", [parseInt(value)]).then(res => {
                    if (res.length > 0) setPreviewTarget(res[0].data);
                });
            });
        } else {
            setPreviewTarget(null);
        }
    }, [value]);

    const loadImages = async () => {
        try {
            const db = await getDb();
            const res = await db.select("SELECT id, name, data, size FROM image_center ORDER BY id DESC");
            setImages(res);
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        loadImages();
    };

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

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="مكتبة الصور" className="max-w-4xl h-[80vh] flex flex-col" maxWidth="max-w-4xl">
                <div className="flex flex-col h-full space-y-4">
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

                    <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-1 custom-scrollbar">
                        {images.filter(img => img.name.includes(search)).map(img => (
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
                        {images.length === 0 && (
                            <div className="col-span-full h-40 flex flex-col items-center justify-center text-muted-foreground">
                                <ImageIcon size={48} className="mb-4 opacity-50" />
                                <p>لا توجد صور في المكتبة</p>
                            </div>
                        )}
                        {images.length > 0 && images.filter(img => img.name.includes(search)).length === 0 && (
                            <div className="col-span-full h-40 flex items-center justify-center text-muted-foreground">
                                لا توجد نتائج للبحث
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
