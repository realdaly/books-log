import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import fs from 'fs';

const files = ['excel/gifts.xlsb', 'excel/loans.xlsb'];

files.forEach(file => {
    if (!fs.existsSync(file)) {
        console.log(`File not found: ${file}`);
        return;
    }
    console.log(`\n\n=== Inspecting ${file} ===`);
    try {
        const workbook = XLSX.readFile(file);
        const sheetNames = workbook.SheetNames;

        // Inspect SECOND sheet (Index 1) usually data
        const targetSheetName = sheetNames[1] || sheetNames[0];
        const sheet = workbook.Sheets[targetSheetName];

        console.log(`--- Sheet: "${targetSheetName}" ---`);

        // Header: 1 to get array of arrays
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: null });

        console.log(`Total Rows: ${rows.length}`);
        console.log(`Columns of first row with data:`);

        // Find first row with data
        const dataRow = rows.find(r => r && r.length > 0);
        if (dataRow) console.log(JSON.stringify(dataRow));

        // Output first 5 non-empty rows
        const nonEmpty = rows.filter(r => r && r.some(c => c !== null));
        nonEmpty.slice(0, 5).forEach((row, i) => {
            console.log(`Row ${i + 1}:`, JSON.stringify(row));
        });

    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});
