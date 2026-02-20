import { useState, useEffect, useCallback } from 'react';

export function useColumnSelection(columns, data) {
    const [selectedCols, setSelectedCols] = useState(new Set());

    const handleColumnClick = useCallback((colIndex, e) => {
        e.stopPropagation();

        // Skip selection if the column doesn't have a label or is marked to skip
        if (colIndex === 0 && (!columns[0] || !columns[0].label)) return;
        if (columns[colIndex] && typeof columns[colIndex].selectable !== 'undefined' && !columns[colIndex].selectable) return;

        const newSelected = new Set(e.ctrlKey || e.metaKey ? selectedCols : []);

        if (e.shiftKey && selectedCols.size > 0) {
            const lastSelected = Array.from(selectedCols).pop();
            const start = Math.min(lastSelected, colIndex);
            const end = Math.max(lastSelected, colIndex);
            for (let i = start; i <= end; i++) {
                if (columns[i] && (columns[i].selectable !== false && (i !== 0 || columns[0]?.label))) {
                    newSelected.add(i);
                }
            }
        } else {
            if (newSelected.has(colIndex)) {
                newSelected.delete(colIndex);
            } else {
                newSelected.add(colIndex);
            }
        }
        setSelectedCols(newSelected);
    }, [selectedCols, columns]);

    useEffect(() => {
        const handleCopy = (e) => {
            if (selectedCols.size === 0) return;

            // Allow default copy behavior if user has selected text explicitly
            const selection = window.getSelection();
            if (selection.toString().length > 0) return;

            e.preventDefault();

            const sortedCols = Array.from(selectedCols).sort((a, b) => a - b);

            const rowsText = data.map((row, idx) => {
                return sortedCols.map(colIdx => {
                    const col = columns[colIdx];
                    if (!col) return '';
                    const val = col.accessor ? col.accessor(row, idx) : row[col.id];
                    return val === null || val === undefined ? '' : val;
                }).join('\t');
            }).join('\n');

            e.clipboardData.setData('text/plain', rowsText);
        };

        document.addEventListener('copy', handleCopy);
        return () => document.removeEventListener('copy', handleCopy);
    }, [selectedCols, data, columns]);

    return { selectedCols, setSelectedCols, handleColumnClick };
}
