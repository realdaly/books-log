import { useState } from 'react';
import { exportToPDF } from "../../lib/pdfUtils";
import { Download, Loader2 } from "lucide-react";

export function ColumnActions({ selectedCols, data, columns, title = "تصدير" }) {
    const [isExporting, setIsExporting] = useState(false);

    if (!selectedCols || selectedCols.size === 0) return null;

    const exportPdf = async (e) => {
        e.stopPropagation();
        if (isExporting) return;
        setIsExporting(true);

        const sortedCols = Array.from(selectedCols).sort((a, b) => a - b);

        const currentDate = new Date().toLocaleDateString('en-GB');
        let html = `<div style="padding: 20px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; direction: rtl; background-color: #ffffff; color: #02343F; width: 100%; box-sizing: border-box;">`;
        html += `<div style="text-align: center; margin-bottom: 24px;">`;
        html += `<h2 style="margin: 0 0 6px 0; font-size: 26px; font-weight: 800; color: #02343F;">${title}</h2>`;
        html += `<p style="margin: 0; font-size: 14px; font-weight: 600; color: #02343F; opacity: 0.8;">التاريخ: ${currentDate}</p>`;
        html += `</div>`;
        html += `<table style="width: 100%; border-collapse: collapse; text-align: right; font-size: 12px; border: 1px solid #c5d6d9;">`;

        // Handle headers
        html += `<thead><tr>`;
        sortedCols.forEach(idx => {
            const col = columns[idx];
            if (!col) return;
            html += `<th style="border: 1px solid #c5d6d9; background-color: #02343F; font-weight: bold; color: #F0EDCC; text-align: center; padding-bottom: 14px">${col.pdfLabel || col.label || col.id}</th>`;
        });
        html += `</tr></thead>`;

        // Handle body
        html += `<tbody>`;
        data.forEach((row, rowIdx) => {
            const bg = rowIdx % 2 === 0 ? '#ffffff' : '#f4f8f9';
            html += `<tr style="background-color: ${bg}; transition: background-color 0.2s;">`;
            sortedCols.forEach(idx => {
                const col = columns[idx];
                if (!col) return;
                const val = col.accessor ? col.accessor(row, rowIdx) : row[col.id];
                const displayVal = val === null || val === undefined ? '-' : val;
                html += `<td style="border: 1px solid #c5d6d9; color: #02343F; text-align: center; font-weight: 600; padding-bottom: 14px;">${displayVal}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        setTimeout(async () => {
            const orientation = sortedCols.length > 5 ? 'landscape' : 'portrait';
            try {
                await exportToPDF(html, `${title}.pdf`, {
                    jsPDF: { unit: 'mm', format: 'a4', orientation },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        letterRendering: true,
                        windowWidth: orientation === 'landscape' ? 1123 : 794
                    }
                });
            } catch (error) {
                console.error("Export PDF error", error);
                alert("حدث خطأ أثناء تصدير ملف PDF");
            } finally {
                setIsExporting(false);
            }
        }, 50);
    };

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
            <span className="font-bold text-sm" style={{ direction: 'rtl' }}>تم تحديد {selectedCols.size} عمود</span>
            <div className="h-5 w-px bg-primary-foreground/30"></div>
            <button
                onClick={exportPdf}
                disabled={isExporting}
                className="flex items-center gap-2 hover:bg-white/20 px-4 py-2 bg-white/10 rounded-full transition-all text-sm font-bold disabled:opacity-50"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                تصدير PDF
            </button>
        </div>
    );
}
