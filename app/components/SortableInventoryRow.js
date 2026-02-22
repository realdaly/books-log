"use client";
import React from 'react';
import Link from "next/link";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical } from "lucide-react";

export function SortableInventoryRow({ row, index, updateField, successMap, selectedCols, threshold }) {
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

            {/* Index */}
            <td className={`p-3 text-center border-l border-border/50 text-muted-foreground font-bold ${selectedCols.has(1) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{index}</td>

            <td className={`p-3 font-bold text-foreground border-l border-border/50 ${selectedCols.has(2) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.book_title}</td>

            {/* Total Printed */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(3) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                {row.total_printed}
            </td>

            {/* Sent to Inst */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(4) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                {row.sent_to_institution}
            </td>

            {/* Computed: Remaining Inst */}
            <td className={`p-3 text-center font-bold border-l border-border/50 ${(row.remaining_institution || 0) <= (threshold ?? 11)
                ? "bg-red-500/20 text-red-700 font-black"
                : "text-primary"
                } ${selectedCols.has(5) ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
                {row.remaining_institution}
            </td>

            {/* Pending Sale */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(6) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.pending_institution || '-'}</td>

            {/* Inst Stats */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(7) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.sold_institution}</td>
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(8) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.gifted_institution}</td>
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(9) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>{row.loaned_institution}</td>

            {/* Manual Loss */}
            <td className={`p-3 text-center text-foreground border-l border-border/50 ${selectedCols.has(10) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                {row.loss_manual}
                {row.loss_institution > 0 && <div className="text-[10px] text-red-500 font-bold mt-0.5">+{row.loss_institution}</div>}
            </td>

            {/* New Stores (Makhazen) */}
            <td className={`p-3 text-center text-foreground border-l border-l-border/50 border-r border-r-primary-foreground/10 ${selectedCols.has(11) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <Link href={`/stores?book_id=${row.book_id}`} className="hover:underline">{row.store_institution || 0}</Link>
            </td>

            {/* Other Stores Total (Renamed to Branches) - Calculated Value */}
            <td className={`p-3 text-center font-bold text-foreground border-l border-l-border/50 border-r border-r-primary-foreground/10 ${selectedCols.has(12) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <Link href={`/branches?book_id=${row.book_id}`} className="hover:underline" title={`متبقي من المطبوع (${expected}) - حركات الفروع الأخرى (${logged}) = ${branchDiff}`}>
                    {branchDiff}
                </Link>
            </td>

            {/* Total Remaining - DARKER CELL */}
            <td className={`p-3 text-center font-black text-lg text-primary transition-colors border-l border-border/50 ${selectedCols.has(13) ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-primary/5 group-hover:bg-primary/20'}`}>
                {row.remaining_total}
            </td>
        </tr>
    );
}
