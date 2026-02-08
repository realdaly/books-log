
import { readTextFile, writeTextFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';

const CONFIG_FILE = 'db-config.json';
const DEFAULT_DB_NAME = 'publishing.db';

/**
 * Returns the full connection string for the database.
 * e.g. "sqlite:publishing.db" (relative to AppData) or "sqlite:C:/path/to/db.db"
 */
export async function getDatabasePath() {
    try {
        if (!(await exists(CONFIG_FILE, { baseDir: BaseDirectory.AppData }))) {
            return `sqlite:${DEFAULT_DB_NAME}`;
        }
        const configStr = await readTextFile(CONFIG_FILE, { baseDir: BaseDirectory.AppData });
        const config = JSON.parse(configStr);
        if (config.dbPath) {
            // If it's an absolute path, ensure prefix 'sqlite:'
            if (!config.dbPath.startsWith('sqlite:')) {
                return `sqlite:${config.dbPath}`;
            }
            return config.dbPath;
        }
    } catch (e) {
        console.error("Failed to read config", e);
    }
    return `sqlite:${DEFAULT_DB_NAME}`;
}

/**
 * Sets the database path preference.
 * Stores strictly the path.
 * @param {string} path - The absolute path key or relative path.
 */
export async function setDatabasePath(path) {
    // If the path is absolute, store it as is (or with sqlite: prefix if you prefer consistency)
    // Here we store exactly what we want to use, but stripped of sqlite: for the JSON maybe?
    // Let's store it with sqlite: prefix to be unambiguous, OR without and add it later.
    // The getDatabasePath adds sqlite: if missing, so let's store clean path.

    let cleanPath = path;
    if (cleanPath.startsWith('sqlite:')) {
        cleanPath = cleanPath.slice(7);
    }

    const config = { dbPath: cleanPath };
    await writeTextFile(CONFIG_FILE, JSON.stringify(config), { baseDir: BaseDirectory.AppData });
}
