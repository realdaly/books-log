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

            if (!dbInstance) {
                dbInstance = await Database.load("sqlite:publishing.db");
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
        if (!columnNames.includes("loss_manual")) {
            await db.execute("ALTER TABLE book ADD COLUMN loss_manual INTEGER DEFAULT 0");
        }
        if (!columnNames.includes("cover_image")) {
            await db.execute("ALTER TABLE book ADD COLUMN cover_image TEXT");
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

        // New Tables for Other Stores
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "other_category" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" VARCHAR(255) NOT NULL,
                UNIQUE("name")
            );
        `);

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

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "book_category_link" (
                "book_id" INTEGER NOT NULL,
                "category_id" INTEGER NOT NULL,
                PRIMARY KEY ("book_id", "category_id"),
                FOREIGN KEY ("book_id") REFERENCES "book" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("category_id") REFERENCES "book_category" ("id") ON DELETE CASCADE
            );
        `);

        // Store Categories (Transactions)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "store_category" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "name" VARCHAR(255) NOT NULL,
                UNIQUE("name")
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS "store_category_link" (
                "transaction_id" INTEGER NOT NULL,
                "category_id" INTEGER NOT NULL,
                PRIMARY KEY ("transaction_id", "category_id"),
                FOREIGN KEY ("transaction_id") REFERENCES "transaction" ("id") ON DELETE CASCADE,
                FOREIGN KEY ("category_id") REFERENCES "store_category" ("id") ON DELETE CASCADE
            );
        `);

    } catch (e) {
        console.error("Schema check/migration error:", e);
    }
}
