
import { load } from '@tauri-apps/plugin-sql';

async function setup() {
    const db = await load('sqlite:books.db');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS store_category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS store_category_link (
            transaction_id INTEGER,
            category_id INTEGER,
            PRIMARY KEY (transaction_id, category_id),
            FOREIGN KEY(transaction_id) REFERENCES "transaction"(id) ON DELETE CASCADE,
            FOREIGN KEY(category_id) REFERENCES store_category(id) ON DELETE CASCADE
        )
    `);

    console.log("Tables created successfully");
}

setup();
