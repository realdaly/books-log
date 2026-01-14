"use client";
import { useState } from "react";
import { Modal } from "./Modal";
import { Eye } from "lucide-react";

export function NotesCell({ text, className = "", iconOnly = false }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!text) return <span className="text-muted-foreground/50">-</span>;

    const truncated = text.length > 20 ? text.substring(0, 20) + "..." : text;
    const isLong = text.length > 20;

    const displayContent = iconOnly ? (
        <div className="flex justify-center">
            <button
                onClick={() => setIsOpen(true)}
                className="p-1.5 rounded-full text-emerald-600 hover:bg-primary/10 transition-colors"
                title="عرض الملاحظات"
            >
                <Eye size={18} />
            </button>
        </div>
    ) : (
        <span
            className={`${isLong ? "cursor-pointer hover:underline hover:text-primary transition-all" : ""} ${className}`}
            onClick={() => isLong && setIsOpen(true)}
            title={isLong ? "انقر لعرض النص كاملاً" : ""}
        >
            {truncated}
        </span>
    );

    return (
        <>
            {displayContent}
            {(isLong || iconOnly) && (
                <Modal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title="الملاحظات"
                    maxWidth="max-w-xl"
                >
                    <div className="text-right whitespace-pre-wrap text-lg font-medium text-foreground p-6 bg-primary/5 rounded-2xl border-2 border-primary/10 leading-relaxed shadow-inner">
                        {text}
                    </div>
                </Modal>
            )}
        </>
    );
}
