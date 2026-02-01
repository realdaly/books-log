import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

export function PaginationControls({ page, totalPages, setPage, isLoading }) {
    if (totalPages <= 1) return null;

    return (
        <div className="flex justify-center items-center gap-4 mt-auto">
            <button
                className="flex items-center gap-1 text-sm font-bold text-gray-600 disabled:opacity-50 hover:text-primary transition-colors disabled:cursor-not-allowed"
                disabled={page === 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
            >
                <ChevronRight size={16} /> السابق
            </button>

            <span className="text-sm font-bold text-gray-600 flex items-center gap-2">
                صفحة {page} من {totalPages}
                {isLoading && <Loader2 size={12} className="animate-spin text-primary" />}
            </span>

            <button
                className="flex items-center gap-1 text-sm font-bold text-gray-600 disabled:opacity-50 hover:text-primary transition-colors disabled:cursor-not-allowed"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
                التالي <ChevronLeft size={16} />
            </button>
        </div>
    );
}
