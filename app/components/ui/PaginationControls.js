import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

export function PaginationControls({ page, totalPages, setPage, isLoading, itemsPerPage, setItemsPerPage }) {

    return (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-auto py-2 px-4 border-t border-border/50 w-full bg-card/50 rounded-lg">

            {/* Items Per Page Selector */}
            {setItemsPerPage && (
                <div className="flex items-center gap-2 order-2 sm:order-1">
                    <span className="text-xs text-muted-foreground font-bold whitespace-nowrap">عناصر في الصفحة:</span>
                    <select
                        value={itemsPerPage}
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setPage(1);
                        }}
                        className="bg-background border border-border rounded px-2 py-1 text-xs font-bold ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        disabled={isLoading}
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                        <option value={10000}>الكل</option>
                    </select>
                </div>
            )}

            {/* Pagination Buttons */}
            {totalPages > 1 ? (
                <div className="flex items-center gap-2 order-1 sm:order-2 mx-auto">
                    <button
                        className="p-1 px-3 rounded-md flex items-center gap-1 text-xs font-bold bg-background border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        disabled={page === 1 || isLoading}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        <ChevronRight size={14} /> السابق
                    </button>

                    <span className="text-xs font-bold text-muted-foreground min-w-[80px] text-center flex justify-center items-center gap-2">
                        <span>{page} / {totalPages}</span>
                        {isLoading && <Loader2 size={10} className="animate-spin text-primary" />}
                    </span>

                    <button
                        className="p-1 px-3 rounded-md flex items-center gap-1 text-xs font-bold bg-background border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        disabled={page >= totalPages || isLoading}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        التالي <ChevronLeft size={14} />
                    </button>
                </div>
            ) : (
                <div className="flex-1 order-1 sm:order-2"></div> // Spacer to keep layout if no pages
            )}

            {/* Placeholder for layout balance if needed */}
            <div className="hidden sm:block w-20 order-3"></div>
        </div>
    );
}
