/**
 * One-time import script: gifts_2.xlsb & sales_2.xlsb → publishing.db
 *
 * Sheet names are numbers ("1", "2", "3" …) and are converted to
 * "مجلة الإصلاح الحسيني 1", "مجلة الإصلاح الحسيني 2", etc.
 *
 * gifts_2 also has a "المسلم" column → transaction.deliverer
 *
 * Usage:  node scripts/import_excel_2.cjs
 */
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

// ─── Paths ──────────────────────────────────────────────────
const EXCEL_DIR = path.join(__dirname, '..', 'excel');
const DB_PATH = path.join(EXCEL_DIR, 'publishing.db');
const GIFTS_PATH = path.join(EXCEL_DIR, 'gifts_2.xlsb');
const SALES_PATH = path.join(EXCEL_DIR, 'sales_2.xlsb');

// ─── Helpers ────────────────────────────────────────────────

/** Convert sheet name (a number string) to book title */
function sheetNameToBookTitle(sheetName) {
    return 'مجلة الإصلاح الحسيني ' + sheetName.trim();
}

/**
 * Convert an Excel serial-number OR date-string to "YYYY-MM-DD".
 * Returns null when the value is empty / unparseable.
 */
function normalizeDate(raw) {
    if (raw == null || raw === '') return null;

    // Excel serial number (number)
    if (typeof raw === 'number') {
        const jsDate = XLSX.SSF.parse_date_code(raw);
        if (jsDate) {
            const y = jsDate.y;
            const m = String(jsDate.m).padStart(2, '0');
            const d = String(jsDate.d).padStart(2, '0');
            return y + '-' + m + '-' + d;
        }
        return null;
    }

    // String like "20/12/2017" (DD/MM/YYYY)
    if (typeof raw === 'string') {
        const parts = raw.trim().split('/');
        if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            return yyyy + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0');
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        return null;
    }

    return null;
}

/**
 * Read a sheet as raw rows (array of arrays), skipping the title row (row 0)
 * and the header row (row 1). Returns data rows starting from row 2.
 * Also returns the header row for column-index mapping.
 */
function parseSheet(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return { headers: [], rows: [] };
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 2) return { headers: [], rows: [] };
    const headers = raw[1]; // row index 1 = header row
    const rows = raw.slice(2); // row 2+ = data
    return { headers, rows };
}

function colIdx(headers, name) {
    return headers.findIndex(h => h != null && h.toString().trim() === name);
}

function cellVal(row, idx) {
    if (idx < 0 || idx >= row.length) return null;
    return row[idx];
}

function toInt(v) {
    if (v == null) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
}

function toFloat(v) {
    if (v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

function trimStr(v) {
    if (v == null) return null;
    return String(v).trim() || null;
}

// ─── Main ───────────────────────────────────────────────────
function main() {
    console.log('Opening database:', DB_PATH);
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Prepare statements
    const insertBook = db.prepare(
        'INSERT OR IGNORE INTO book (title, display_order) VALUES (?, ?)'
    );
    const getBookId = db.prepare('SELECT id FROM book WHERE title = ?');

    const insertParty = db.prepare(
        'INSERT OR IGNORE INTO party (name) VALUES (?)'
    );
    const getPartyId = db.prepare('SELECT id FROM party WHERE name = ?');

    // Note: this INSERT includes the deliverer column
    const insertGiftTransaction = db.prepare(`
    INSERT INTO [transaction]
      (book_id, party_id, type, qty, unit_price, total_price, state, receipt_no, tx_date, notes, reading_no, deliverer)
    VALUES
      (@book_id, @party_id, @type, @qty, @unit_price, @total_price, @state, @receipt_no, @tx_date, @notes, @reading_no, @deliverer)
  `);

    const insertSaleTransaction = db.prepare(`
    INSERT INTO [transaction]
      (book_id, party_id, type, qty, unit_price, total_price, state, receipt_no, tx_date, notes, reading_no)
    VALUES
      (@book_id, @party_id, @type, @qty, @unit_price, @total_price, @state, @receipt_no, @tx_date, @notes, @reading_no)
  `);

    // Counters
    let booksAdded = 0;
    let partiesAdded = 0;
    let giftTxAdded = 0;
    let saleTxAdded = 0;
    let skippedRows = 0;

    // Get current max display_order
    const maxOrderRow = db.prepare('SELECT COALESCE(MAX(display_order), 0) as m FROM book').get();
    let displayOrder = (maxOrderRow?.m || 0) + 1;

    // ── Wrap everything in a transaction for speed & atomicity ──
    const runImport = db.transaction(() => {
        // ═══════════════════════════════════════════════════════════
        //  PHASE 1:  GIFTS (gifts_2.xlsb)
        // ═══════════════════════════════════════════════════════════
        console.log('\n--- Phase 1: Importing gifts_2 ---');
        const giftsWb = XLSX.readFile(GIFTS_PATH);

        for (const sheetName of giftsWb.SheetNames) {
            const { headers, rows } = parseSheet(giftsWb, sheetName);
            if (headers.length === 0 || rows.length === 0) {
                console.log('  [skip] empty sheet: ' + sheetName);
                continue;
            }

            // ── Convert sheet name to book title ──
            const bookTitle = sheetNameToBookTitle(sheetName);

            // ── Insert book ──
            const info = insertBook.run(bookTitle, displayOrder);
            if (info.changes > 0) {
                booksAdded++;
                displayOrder++;
            }
            const bookRow = getBookId.get(bookTitle);
            if (!bookRow) {
                console.log('  [ERROR] could not find book: ' + bookTitle);
                continue;
            }
            const bookId = bookRow.id;

            // ── Column indices ──
            const iQty = colIdx(headers, 'عدد الاهداء');
            const iDate = colIdx(headers, 'التاريخ');
            const iParty = colIdx(headers, 'الجهة');
            const iNotes = colIdx(headers, 'الملاحظة');
            const iReading = colIdx(headers, 'رقم المطالعة');
            const iDeliverer = colIdx(headers, 'المسلم');

            console.log('  Book: "' + bookTitle + '" (id=' + bookId + '), data rows: ' + rows.length);

            for (const row of rows) {
                const qty = toInt(cellVal(row, iQty));
                if (!qty || qty <= 0) {
                    skippedRows++;
                    continue;
                }

                const partyName = trimStr(cellVal(row, iParty));
                let partyId = null;
                if (partyName) {
                    const pi = insertParty.run(partyName);
                    if (pi.changes > 0) partiesAdded++;
                    const pr = getPartyId.get(partyName);
                    if (pr) partyId = pr.id;
                }

                const txDate = normalizeDate(cellVal(row, iDate));
                const notes = trimStr(cellVal(row, iNotes));
                const readingNo = trimStr(cellVal(row, iReading));
                const deliverer = trimStr(cellVal(row, iDeliverer));

                insertGiftTransaction.run({
                    book_id: bookId,
                    party_id: partyId,
                    type: 'gift',
                    qty: qty,
                    unit_price: null,
                    total_price: null,
                    state: 'final',
                    receipt_no: null,
                    tx_date: txDate || '2000-01-01',
                    notes: notes,
                    reading_no: readingNo,
                    deliverer: deliverer,
                });
                giftTxAdded++;
            }
        }

        // ═══════════════════════════════════════════════════════════
        //  PHASE 2:  SALES (sales_2.xlsb)
        // ═══════════════════════════════════════════════════════════
        console.log('\n--- Phase 2: Importing sales_2 ---');
        const salesWb = XLSX.readFile(SALES_PATH);

        for (const sheetName of salesWb.SheetNames) {
            const { headers, rows } = parseSheet(salesWb, sheetName);
            if (headers.length === 0 || rows.length === 0) {
                console.log('  [skip] empty sheet: ' + sheetName);
                continue;
            }

            // ── Convert sheet name to book title & find matching book ──
            const bookTitle = sheetNameToBookTitle(sheetName);
            let bookRow = getBookId.get(bookTitle);

            if (!bookRow) {
                // Book doesn't exist yet - add it from sales
                const info = insertBook.run(bookTitle, displayOrder);
                if (info.changes > 0) {
                    booksAdded++;
                    displayOrder++;
                }
                bookRow = getBookId.get(bookTitle);
                if (!bookRow) {
                    console.log('  [ERROR] could not find/create book for sales sheet: ' + sheetName + ' → ' + bookTitle);
                    continue;
                }
                console.log('  [new book from sales] "' + bookTitle + '" (id=' + bookRow.id + ')');
            }

            const bookId = bookRow.id;

            // ── Column indices ──
            const iQty = colIdx(headers, 'العدد');
            const iDate = colIdx(headers, 'التاريخ');
            const iParty = colIdx(headers, 'الجهة');
            const iPrice = colIdx(headers, 'السعر');
            const iReceipt = colIdx(headers, 'رقم الوصل');

            console.log('  Book: "' + bookTitle + '" (id=' + bookId + '), data rows: ' + rows.length);

            for (const row of rows) {
                const qty = toInt(cellVal(row, iQty));
                if (!qty || qty <= 0) {
                    skippedRows++;
                    continue;
                }

                const partyName = trimStr(cellVal(row, iParty));
                let partyId = null;
                if (partyName) {
                    const pi = insertParty.run(partyName);
                    if (pi.changes > 0) partiesAdded++;
                    const pr = getPartyId.get(partyName);
                    if (pr) partyId = pr.id;
                }

                const txDate = normalizeDate(cellVal(row, iDate));
                const unitPrice = toFloat(cellVal(row, iPrice));
                const receiptNo = trimStr(cellVal(row, iReceipt));

                insertSaleTransaction.run({
                    book_id: bookId,
                    party_id: partyId,
                    type: 'sale',
                    qty: qty,
                    unit_price: unitPrice,
                    total_price: unitPrice != null && qty ? unitPrice * qty : null,
                    state: 'final',
                    receipt_no: receiptNo,
                    tx_date: txDate || '2000-01-01',
                    notes: null,
                    reading_no: null,
                });
                saleTxAdded++;
            }
        }
    });

    // Execute the import
    try {
        runImport();
        console.log('\n════════════════════════════════════════');
        console.log('  Import completed successfully!');
        console.log('════════════════════════════════════════');
        console.log('  Books added:         ' + booksAdded);
        console.log('  Parties added:       ' + partiesAdded);
        console.log('  Gift transactions:   ' + giftTxAdded);
        console.log('  Sale transactions:   ' + saleTxAdded);
        console.log('  Skipped rows:        ' + skippedRows);
        console.log('════════════════════════════════════════\n');
    } catch (err) {
        console.error('\n[IMPORT FAILED] Transaction rolled back.');
        console.error(err);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
