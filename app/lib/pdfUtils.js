import html2pdf from 'html2pdf.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

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

    try {
        const savePath = await save({
            title: 'حفظ ملف PDF',
            defaultPath: fileName,
            filters: [{
                name: 'PDF Files',
                extensions: ['pdf']
            }]
        });

        if (!savePath) return; // User canceled the save dialog

        // Get the PDF as a base64 Data URI string
        const pdfBase64DataUri = await html2pdf().set(finalOptions).from(element).outputPdf('datauristring');

        // Extract the base64 content
        const base64Content = pdfBase64DataUri.split(',')[1];
        if (!base64Content) {
            throw new Error("Could not extract pdf data");
        }

        // Convert base64 to Uint8Array for writing
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Write the file to the chosen path
        await writeFile(savePath, bytes);

    } catch (error) {
        console.error('PDF Export Error:', error);
        throw error;
    }
};
