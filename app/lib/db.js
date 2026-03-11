"use client";

let dbInstance = null;
let initPromise = null;
let isSchemaInitialized = false;

export async function getDb() {
    if (typeof window === "undefined") return null;
    if (dbInstance && isSchemaInitialized) return dbInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const { default: Database } = await import("@tauri-apps/plugin-sql");
            const { default: initDatabase } = await import("../../db/initDatabase");
            const { getDatabasePath } = await import("./appConfig");

            if (!dbInstance) {
                const dbPath = await getDatabasePath();
                dbInstance = await Database.load(dbPath);
            }

            if (!isSchemaInitialized) {
                await initDatabase(dbInstance);
                await ensureSchema(dbInstance);
                isSchemaInitialized = true;
            }

            return dbInstance;
        } catch (err) {
            console.error("Critical DB Init Error:", err);
            initPromise = null;
            throw err;
        }
    })();

    return initPromise;
}

async function ensureSchema(db) {
    try {
        const columns = await db.select("SELECT name FROM pragma_table_info('book')");
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes("total_printed")) {
            await db.execute("ALTER TABLE book ADD COLUMN total_printed INTEGER DEFAULT 0");
        }
        if (!columnNames.includes("unit_price")) {
            await db.execute("ALTER TABLE book ADD COLUMN unit_price REAL DEFAULT 0");
        }
        // New dual pricing
        if (!columnNames.includes("wholesale_price")) {
            await db.execute("ALTER TABLE book ADD COLUMN wholesale_price REAL DEFAULT 0");
            // Optional: migrate existing unit_price to wholesale_price if meaningful? 
            // Usually unit_price was 'selling price', so maybe retail_price.
        }
        if (!columnNames.includes("retail_price")) {
            await db.execute("ALTER TABLE book ADD COLUMN retail_price REAL DEFAULT 0");
            // Migrate old unit_price to retail_price
            await db.execute("UPDATE book SET retail_price = unit_price WHERE retail_price = 0");
        }
        if (!columnNames.includes("loss_manual")) {
            await db.execute("ALTER TABLE book ADD COLUMN loss_manual INTEGER DEFAULT 0");
        }
        if (!columnNames.includes("cover_image")) {
            await db.execute("ALTER TABLE book ADD COLUMN cover_image TEXT");
        }
        if (!columnNames.includes("print_year")) {
            await db.execute("ALTER TABLE book ADD COLUMN print_year INTEGER DEFAULT NULL");
        }
        if (!columnNames.includes("display_order")) {
            await db.execute("ALTER TABLE book ADD COLUMN display_order INTEGER DEFAULT 0");
            // Basic initialization for existing rows
            await db.execute("UPDATE book SET display_order = id WHERE display_order = 0");
        }

        // Transaction table migrations
        const txColumns = await db.select("SELECT name FROM pragma_table_info('transaction')");
        const txColumnNames = txColumns.map(c => c.name);
        if (!txColumnNames.includes("receipt_no")) {
            await db.execute("ALTER TABLE `transaction` ADD COLUMN receipt_no TEXT DEFAULT NULL");
        }
        if (!txColumnNames.includes("receipt_image")) {
            await db.execute("ALTER TABLE `transaction` ADD COLUMN receipt_image TEXT DEFAULT NULL");
        }

        // New Tables for Other Stores
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "other_category" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" VARCHAR(255) NOT NULL,
                UNIQUE("name")
            );
        `);

        // Migration for order
        const otherCatCols = await db.select("SELECT name FROM pragma_table_info('other_category')");
        if (!otherCatCols.map(c => c.name).includes("display_order")) {
            await db.execute("ALTER TABLE other_category ADD COLUMN display_order INTEGER DEFAULT 0");
            await db.execute("UPDATE other_category SET display_order = id WHERE display_order = 0");
        }

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "other_transaction" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "book_id" INTEGER NOT NULL,
                "qty" INTEGER NOT NULL CHECK("qty" > 0),
                "tx_date" TEXT NOT NULL DEFAULT (date('now')),
                "notes" TEXT DEFAULT NULL,
                "created_at" TEXT DEFAULT (datetime('now')),
                FOREIGN KEY ("book_id") REFERENCES "book" ("id") ON DELETE CASCADE
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "other_transaction_category_link" (
                "transaction_id" INTEGER NOT NULL,
                "category_id" INTEGER NOT NULL,
                PRIMARY KEY ("transaction_id", "category_id"),
                FOREIGN KEY ("transaction_id") REFERENCES "other_transaction" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("category_id") REFERENCES "other_category" ("id") ON DELETE CASCADE
            );
        `);

        // Book Categories
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "book_category" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" VARCHAR(255) NOT NULL,
                UNIQUE("name")
            );
        `);

        // Migration for order
        const bookCatCols = await db.select("SELECT name FROM pragma_table_info('book_category')");
        if (!bookCatCols.map(c => c.name).includes("display_order")) {
            await db.execute("ALTER TABLE book_category ADD COLUMN display_order INTEGER DEFAULT 0");
            await db.execute("UPDATE book_category SET display_order = id WHERE display_order = 0");
        }

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "book_category_link" (
                "book_id" INTEGER NOT NULL,
                "category_id" INTEGER NOT NULL,
                PRIMARY KEY ("book_id", "category_id"),
                FOREIGN KEY ("book_id") REFERENCES "book" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("category_id") REFERENCES "book_category" ("id") ON DELETE CASCADE
            );
        `);

        // Migration for link order
        const bookCatLinkCols = await db.select("SELECT name FROM pragma_table_info('book_category_link')");
        if (!bookCatLinkCols.map(c => c.name).includes("display_order")) {
            await db.execute("ALTER TABLE book_category_link ADD COLUMN display_order INTEGER DEFAULT 0");
            await db.execute("UPDATE book_category_link SET display_order = book_id WHERE display_order = 0");
        }

        // Store Categories (Transactions)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "store_category" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" VARCHAR(255) NOT NULL,
                UNIQUE("name")
            );
        `);

        // Migration for order
        const storeCatCols = await db.select("SELECT name FROM pragma_table_info('store_category')");
        if (!storeCatCols.map(c => c.name).includes("display_order")) {
            await db.execute("ALTER TABLE store_category ADD COLUMN display_order INTEGER DEFAULT 0");
            await db.execute("UPDATE store_category SET display_order = id WHERE display_order = 0");
        }

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "store_category_link" (
                "transaction_id" INTEGER NOT NULL,
                "category_id" INTEGER NOT NULL,
                PRIMARY KEY ("transaction_id", "category_id"),
                FOREIGN KEY ("transaction_id") REFERENCES "transaction" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("category_id") REFERENCES "store_category" ("id") ON DELETE CASCADE
            );
        `);

        // Migration for party_category if it exists
        const partyCatCheck = await db.select("SELECT name FROM sqlite_master WHERE type='table' AND name='party_category'");
        if (partyCatCheck.length > 0) {
            const partyCatCols = await db.select("SELECT name FROM pragma_table_info('party_category')");
            if (!partyCatCols.map(c => c.name).includes("display_order")) {
                await db.execute("ALTER TABLE party_category ADD COLUMN display_order INTEGER DEFAULT 0");
                await db.execute("UPDATE party_category SET display_order = id WHERE display_order = 0");
            }
        }

        // Image Center Setup and Migration
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "image_center" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" TEXT NOT NULL,
                "data" TEXT NOT NULL,
                "size" INTEGER NOT NULL,
                "width" INTEGER DEFAULT NULL,
                "height" INTEGER DEFAULT NULL,
                "created_at" TEXT DEFAULT (datetime('now'))
            );
        `);

        // Migrate existing base64 strings from transaction to image_center
        try {
            const oldImages = await db.select("SELECT id, receipt_image FROM \`transaction\` WHERE receipt_image LIKE 'data:image%'");
            for (const tx of oldImages) {
                if (tx.receipt_image && tx.receipt_image.startsWith('data:image')) {
                    const sizeBytes = Math.round(tx.receipt_image.length * 0.75);
                    await db.execute("INSERT INTO image_center (name, data, size) VALUES ($1, $2, $3)",
                        ['صورة مؤرشفة (' + tx.id + ')', tx.receipt_image, sizeBytes]);
                    const lastInsert = await db.select("SELECT id FROM image_center ORDER BY id DESC LIMIT 1");
                    if (lastInsert.length > 0) {
                        await db.execute("UPDATE \`transaction\` SET receipt_image = $1 WHERE id = $2",
                            [lastInsert[0].id.toString(), tx.id]);
                    }
                }
            }
        } catch (e) {
            console.error("Image migration error:", e);
        }

    } catch (e) {
        console.error("Schema check/migration error:", e);
    }
}
