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
        // Always check for manual columns (migrations)
        const columns = await db.select("SELECT name FROM pragma_table_info('book')");
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes("qom_sold_manual")) {
            await db.execute("ALTER TABLE book ADD COLUMN qom_sold_manual INTEGER DEFAULT 0");
        }
        if (!columnNames.includes("qom_gifted_manual")) {
            await db.execute("ALTER TABLE book ADD COLUMN qom_gifted_manual INTEGER DEFAULT 0");
        }
        if (!columnNames.includes("qom_pending_manual")) {
            await db.execute("ALTER TABLE book ADD COLUMN qom_pending_manual INTEGER DEFAULT 0");
        }
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

    } catch (e) {
        console.error("Schema check/migration error:", e);
    }
}
