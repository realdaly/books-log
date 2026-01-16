import html2pdf from 'html2pdf.js';

/**
 * Exports an HTML element as a PDF file.
 * @param {HTMLElement} element - The element to export.
 * @param {string} fileName - The name of the resulting PDF file.
 * @param {Object} options - Additional options for html2pdf.
 */
export const exportToPDF = async (element, fileName, options = {}) => {
    const defaultOptions = {
        margin: [3, 3, 3, 3], // top, left, bottom, right in mm
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    const finalOptions = { ...defaultOptions, ...options };

    // Temporarily apply a class to hide unwanted elements
    const table = element.querySelector('table');
    if (table) {
        // We'll use CSS to hide .no-print elements
    }

    try {
        await html2pdf().from(element).set(finalOptions).save();
    } catch (error) {
        console.error('PDF Export Error:', error);
        throw error;
    }
};
