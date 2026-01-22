import { getDb } from "./lib/db";

export async function runMigration() {
    console.log("Running migration...");
    try {
        const db = await getDb();
        await db.execute("ALTER TABLE book ADD COLUMN display_order INTEGER DEFAULT 0");
        console.log("Migration successful: Added display_order column.");
    } catch (e) {
        if (e.message.includes("duplicate column")) {
            console.log("Column already exists.");
        } else {
            console.error("Migration failed:", e);
        }
    }
}
