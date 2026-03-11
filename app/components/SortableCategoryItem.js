"use client";
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit2, Trash2 } from "lucide-react";
import { Input, Button } from "./ui/Base";

export function SortableCategoryItem({ cat, editingCategory, setEditingCategory, handleUpdateCategory, handleDeleteCategory }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : 'auto',
        position: isDragging ? 'relative' : 'static',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 bg-card p-2 rounded-lg border border-secondary shadow-sm group transition-colors ${isDragging ? 'shadow-lg bg-card/90 ring-1 ring-primary/50' : ''}`}
        >
            {editingCategory?.id === cat.id ? (
                <form onSubmit={handleUpdateCategory} className="flex-1 flex gap-2">
                    <Input autoFocus value={editingCategory.name} onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })} className="h-8" />
                    <Button size="sm" type="submit" className="h-8">حفظ</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setEditingCategory(null)} className="h-8">إلغاء</Button>
                </form>
            ) : (
                <>
                    <div
                        className="p-1.5 text-muted-foreground hover:text-primary cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100 transition-opacity"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical size={16} />
                    </div>

                    <span className="flex-1 text-sm font-medium text-foreground">{cat.name}</span>
                    <button onClick={() => setEditingCategory(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="تعديل"><Edit2 size={16} /></button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="حذف"><Trash2 size={16} /></button>
                </>
            )}
        </div>
    );
}
