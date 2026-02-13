"use client";
import React from 'react';
import Link from "next/link";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical } from "lucide-react";

export function SortableInventoryRow({ row, updateField, successMap, selectedCols, threshold }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.book_id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        position: isDragging ? 'relative' : 'static',
    };

    const handleKeyDown = (e, originalValue) => {
        if (e.key === 'Enter') {
            e.target.blur();
        } else if (e.key === 'Escape') {
            e.target.value = originalValue ?? "";
            e.target.blur();
        }
    };

    const printed = row.total_printed || 0;
    const received = row.sent_to_institution || 0;
    const expected = Math.max(0, printed - received);
    const logged = row.other_stores_total || 0;
    const branchDiff = Math.max(0, expected - logged);

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={`odd:bg-muted/30 even:bg-card hover:bg-primary/5 transition-colors group ${isDragging ? 'shadow-lg bg-card/90' : ''}`}
        >
            {/* Drag Handle */}
            <td className="p-3 text-center w-[40px] border-l border-border/50 text-gray-400 cursor-grab active:cursor-grabbing hover:text-primary" {...attributes} {...listeners}>
                <GripVertical size={16} />
            </td>

            <td className={`p-3 font-bold text-foreground border-l border-border/50 ${selectedCols.has(1) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.book_title}</td>

            {/* Editable: Total Printed */}
            <td className={`p-2 text-center border-l border-border/50 ${selectedCols.has(2) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="relative flex justify-center">
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => (e.target.value = e.target.value.replace(/[^0-9]/g, ""))}
                        className="cursor-pointer w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                        defaultValue={row.total_printed}
                        onBlur={e => updateField(row.book_id, 'total_printed', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, row.total_printed)}
                    />
                    {successMap && successMap[`${row.book_id}_total_printed`] && (
                        <div className="absolute -top-4 bg-popover/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                            <Check size={10} className="text-emerald-600" />
                            <span className="text-[10px] font-bold text-emerald-600">تم</span>
                        </div>
                    )}
                </div>
            </td>

            {/* Editable: Sent to Inst */}
            <td className={`p-2 text-center border-l border-border/50 ${selectedCols.has(3) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="relative flex justify-center">
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => (e.target.value = e.target.value.replace(/[^0-9]/g, ""))}
                        className="cursor-pointer w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-foreground"
                        defaultValue={row.sent_to_institution}
                        onBlur={e => updateField(row.book_id, 'sent_to_institution', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, row.sent_to_institution)}
                    />
                    {successMap && successMap[`${row.book_id}_sent_to_institution`] && (
                        <div className="absolute -top-4 bg-popover/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                            <Check size={10} className="text-emerald-600" />
                            <span className="text-[10px] font-bold text-emerald-600">تم</span>
                        </div>
                    )}
                </div>
            </td>

            {/* Computed: Remaining Inst */}
            <td className={`p-3 text-center font-bold border-l border-border/50 ${(row.remaining_institution || 0) <= (threshold ?? 11)
                ? "bg-red-500/20 text-red-700 font-black"
                : "text-primary"
                } ${selectedCols.has(4) ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
                {row.remaining_institution}
            </td>

            {/* Pending Sale */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(5) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.pending_institution || '-'}</td>

            {/* Inst Stats */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(6) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.sold_institution}</td>
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(7) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.gifted_institution}</td>
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(8) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.loaned_institution}</td>

            {/* Editable: Manual Loss */}
            <td className={`p-2 text-center border-l border-border/50 ${selectedCols.has(9) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="relative flex justify-center">
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => (e.target.value = e.target.value.replace(/[^0-9]/g, ""))}
                        className="cursor-pointer w-14 p-1 text-center bg-transparent border border-transparent hover:border-input rounded-lg focus:bg-background focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-medium text-foreground"
                        defaultValue={row.loss_manual}
                        onBlur={e => updateField(row.book_id, 'loss_manual', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, row.loss_manual)}
                    />
                    {successMap && successMap[`${row.book_id}_loss_manual`] && (
                        <div className="absolute -top-4 bg-popover/90 backdrop-blur border border-emerald-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-in fade-in zoom-in slide-in-from-bottom-2">
                            <Check size={10} className="text-emerald-600" />
                            <span className="text-[10px] font-bold text-emerald-600">تم</span>
                        </div>
                    )}
                </div>
                {row.loss_institution > 0 && <div className="text-[10px] text-red-500 font-bold mt-0.5">+{row.loss_institution}</div>}
            </td>

            {/* New Stores (Makhazen) */}
            <td className={`p-3 text-center text-foreground border-l border-l-border/50 border-r border-r-primary-foreground/10 ${selectedCols.has(10) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <Link href={`/stores?book_id=${row.book_id}`} className="hover:underline">{row.store_institution || 0}</Link>
            </td>

            {/* Other Stores Total (Renamed to Branches) - Calculated Value */}
            <td className={`p-3 text-center font-bold text-foreground border-l border-l-border/50 border-r border-r-primary-foreground/10 ${selectedCols.has(11) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <Link href={`/branches?book_id=${row.book_id}`} className="hover:underline" title={`متبقي من المطبوع (${expected}) - حركات الفروع الأخرى (${logged}) = ${branchDiff}`}>
                    {branchDiff}
                </Link>
            </td>

            {/* Total Remaining - DARKER CELL */}
            <td className={`p-3 text-center font-black text-lg text-primary transition-colors border-l border-border/50 ${selectedCols.has(12) ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-primary/5 group-hover:bg-primary/20'}`}>
                {row.remaining_total}
            </td>
        </tr>
    );
}
