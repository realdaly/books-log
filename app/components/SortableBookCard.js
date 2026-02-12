"use client";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookOpenText, BarChart3, Edit2, Trash2, Check } from "lucide-react";
import { Button } from "./ui/Base";

export function SortableBookCard({ book, onClick, selectedIds = [], toggleSelect, openDetails, openEdit, handleDelete, readOnly = false }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: book.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
            <div className="group relative perspective-1000 h-full">
                <div
                    onClick={onClick}
                    className="relative w-full aspect-[2/3] transition-all duration-300 group-hover:shadow-2xl rounded-lg overflow-hidden bg-card shadow-md border border-border h-full cursor-grab"
                >
                    {/* Book Cover */}
                    <div className="absolute inset-0 bg-muted/50 flex items-center justify-center overflow-hidden">

                        {/* Selection Checkbox */}
                        {!readOnly && toggleSelect && (
                            <div className={`absolute top-3 left-3 z-20 ${selectedIds.includes(book.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(book.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleSelect(book.id)}
                                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary shadow-lg cursor-pointer accent-emerald-600"
                                />
                            </div>
                        )}

                        {book.cover_image ? (
                            <img
                                src={book.cover_image}
                                alt={book.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                                <BookOpenText size={48} className="mb-2" />
                                <span className="text-xs font-medium line-clamp-2">{book.title}</span>
                            </div>
                        )}

                        {/* Overlay Gradient & Actions */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <h3 className="text-white font-bold text-lg leading-tight mb-1 line-clamp-2 drop-shadow-md">{book.title}</h3>
                                <p className="text-gray-300 text-xs mb-3">مطبوع: {book.total_printed}</p>

                                <div className="flex gap-2 justify-between items-center">
                                    {openDetails && (
                                        <Button size="sm" variant="secondary" className="h-8 text-xs flex-1 bg-background/90 hover:bg-background text-foreground border-0" onClick={(e) => { e.stopPropagation(); openDetails(book); }}>
                                            <BarChart3 size={14} className="ml-1" /> التفاصيل
                                        </Button>
                                    )}
                                    {!readOnly && (
                                        <div className="flex gap-2">
                                            {openEdit && <button onClick={(e) => { e.stopPropagation(); openEdit(book); }} className="bg-white/20 hover:bg-white p-1.5 rounded-full text-white hover:text-blue-600 transition-colors backdrop-blur-sm"><Edit2 size={16} /></button>}
                                            {handleDelete && <button onClick={(e) => { e.stopPropagation(); handleDelete(book.id); }} className="bg-white/20 hover:bg-white p-1.5 rounded-full text-white hover:text-red-600 transition-colors backdrop-blur-sm"><Trash2 size={16} /></button>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Price Tag (Always Visible) */}
                    {Number(book.unit_price) > 0 && (
                        <div className="absolute top-3 right-3 bg-emerald-500/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm z-10">
                            {Number(book.unit_price).toLocaleString()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
