import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import fs from 'fs';
import path from 'path';

const inputFile = 'excel/gifts.xlsb';
const outputFile = 'public/import_data.json';

if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
}

// Helper to convert Excel Serial Date to JS Date String (YYYY-MM-DD)
function excelDateToJSDate(serial) {
    if (!serial) return null;
    if (typeof serial === 'string') return serial; // Already text
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    // Format YYYY-MM-DD
    const year = date_info.getFullYear();
    const month = String(date_info.getMonth() + 1).padStart(2, '0');
    const day = String(date_info.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

try {
    console.log(`Reading ${inputFile}...`);
    const workbook = XLSX.readFile(inputFile);

    const transactions = [];
    const partiesSet = new Set();
    const booksSet = new Set(); // Just for info

    workbook.SheetNames.forEach(sheetName => {
        if (sheetName.includes('البحث') || sheetName.includes('Sheet')) {
            // Probably skip non-data sheets if any
            // Actually 'Search' is explicitly mentioned as to be skipped or first sheet
            if (sheetName === 'البحث') return;
        }

        const sheet = workbook.Sheets[sheetName];
        // Convert to JSON (Array of Arrays)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: null });

        // Find header row (usually contains 'التاريخ', 'عدد الاهداء', etc)
        // Based on inspection, it seems related to row 2 (index 1) or so.
        // We will look for data rows starting after header.
        // Gifts file structure: 
        // Col B (1): Qty
        // Col C (2): Date
        // Col D (3): Party Name
        // Col E (4): Book Name (Sometimes implied by sheet name, but user said Col E has Book Name)
        // Col F (5): Notes

        // Let's iterate rows.
        let isHeaderFound = false;

        rows.forEach((row, rowIndex) => {
            if (!row || row.length === 0) return;

            // Check if this is a data row
            // Heuristic: Col B is a number (Qty) OR Col D is a string (Party)
            const qty = row[1];
            const dateVal = row[2];
            const party = row[3];
            const bookName = row[4];
            const notes = row[5];

            // Valid data row must have a Party and Book Name (or at least Party)
            if (party && typeof party === 'string' && party !== 'الجهة المستلمة' && party !== 'اسم الكتاب') {

                // Book Name: User said "repeated in all rows in column E"
                // If column E is empty, maybe fallback to SheetName? User said "Take that name [from Col E]".
                // In inspection: Row 3: Col E = "المواعظ الحسنة (جزء1)" which matches sheet name.

                const finalBookName = bookName || sheetName;
                let finalDate = excelDateToJSDate(dateVal);
                if (!finalDate) {
                    finalDate = new Date().toISOString().split('T')[0];
                }

                // Clean up party name
                const cleanParty = party.trim();
                partiesSet.add(cleanParty);
                booksSet.add(finalBookName);

                const quantity = Number(qty) || 0;
                if (quantity > 0) {
                    transactions.push({
                        type: 'gift',
                        book_title: finalBookName && finalBookName.trim(),
                        party_name: cleanParty,
                        qty: quantity,
                        date: finalDate,
                        notes: notes || ""
                    });
                }
            }
        });
    });

    const outputData = {
        parties: Array.from(partiesSet).sort(),
        transactions: transactions
    };

    console.log(`Found ${outputData.parties.length} Unique Parties.`);
    console.log(`Found ${outputData.transactions.length} Transactions.`);
    console.log(`Found ${booksSet.size} Unique Books.`);

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`Wrote data to ${outputFile}`);

} catch (e) {
    console.error("Error processing Excel:", e);
    process.exit(1);
}
