"use client";
import { useEffect, useState } from "react";
import { getDb } from "../../lib/db";
import { Card, Button, Input } from "../../components/ui/Base";
import { Loader2, Save, Download, Upload, Database } from "lucide-react";
// import { save, open, ask } from "@tauri-apps/plugin-dialog";
// import { copyFile, BaseDirectory } from "@tauri-apps/plugin-fs";

export default function SettingsPage() {
    const [config, setConfig] = useState({ publisher_name: "شركة نشر" });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const db = await getDb();
                const rows = await db.select("SELECT * FROM config ORDER BY id DESC LIMIT 1");
                if (rows.length > 0) {
                    setConfig({ publisher_name: rows[0].publisher_name || "" });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Auto-focus the input once loading is done
    useEffect(() => {
        if (!loading) {
            const input = document.querySelector('input');
            if (input) input.focus();
        }
    }, [loading]);

    const handleSave = async () => {
        try {
            const db = await getDb();
            // Upsert logic basically, or just insert new row to keep history?
            // InitDatabase has ID Primary Key.
            // Let's just update the last one or insert if empty.
            const rows = await db.select("SELECT id FROM config ORDER BY id DESC LIMIT 1");
            if (rows.length > 0) {
                await db.execute("UPDATE config SET publisher_name=$1 WHERE id=$2", [config.publisher_name, rows[0].id]);
            } else {
                await db.execute("INSERT INTO config (publisher_name) VALUES ($1)", [config.publisher_name]);
            }
            alert("تم الحفظ بنجاح");
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    // Helper to get raw path and options for fs operations
    const getFsPathOptions = async (dbPathWithPrefix) => {
        const { BaseDirectory } = await import("@tauri-apps/plugin-fs");
        if (dbPathWithPrefix === 'sqlite:publishing.db') {
            return {
                path: 'publishing.db',
                options: { baseDir: BaseDirectory.AppData }
            };
        }
        // Absolute path
        const rawPath = dbPathWithPrefix.replace(/^sqlite:/, '');
        return {
            path: rawPath,
            options: {} // No baseDir for absolute paths
        };
    };

    const changeDatabaseLocation = async () => {
        try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const { copyFile, remove, exists, BaseDirectory, join } = await import("@tauri-apps/plugin-fs");
            const { getDatabasePath, setDatabasePath } = await import("../../lib/appConfig");

            // 1. Pick new folder
            const selectedDir = await open({
                directory: true,
                multiple: false,
                title: "اختر مجلد قاعدة البيانات الجديد"
            });

            if (!selectedDir) return;

            // 2. Determine current location
            const currentDbString = await getDatabasePath();
            const current = await getFsPathOptions(currentDbString);

            // 3. Close DB Connection
            try {
                const db = await getDb();
                await db.execute("PRAGMA journal_mode=DELETE;"); // try to clean up WAL
                if (typeof db.close === 'function') {
                    await db.close();
                }
            } catch (e) {
                console.warn("Failed to close DB:", e);
            }

            // 4. Move files
            // Target file name in new dir
            // We'll keep the name 'publishing.db' in the new directory.
            // Note: 'join' from tauri-fs might be path join. Or we use string concatenation if we assume Windows/Unix separator.
            // Tauri v2 `path` API is safer.
            const { join: pathJoin } = await import("@tauri-apps/api/path");
            const targetDbPath = await pathJoin(selectedDir, "publishing.db");

            // Check if target already exists?
            // "If the user changed the place while they already have a database in the previous position..."
            // We move current DB to new place.

            // Copy all existing files first
            const filesToMove = [
                { src: current.path, dest: targetDbPath },
                { src: current.path + "-wal", dest: targetDbPath + "-wal" },
                { src: current.path + "-shm", dest: targetDbPath + "-shm" }
            ];

            for (const file of filesToMove) {
                if (await exists(file.src, current.options)) {
                    await copyFile(file.src, file.dest, {
                        fromPathBaseDir: current.options.baseDir
                    });
                }
            }

            // 5. Update Config
            // Store as absolute path with sqlite: prefix
            await setDatabasePath(`sqlite:${targetDbPath}`);

            // 6. Delete old files (Move semantics)
            try {
                for (const file of filesToMove) {
                    if (await exists(file.src, current.options)) {
                        await remove(file.src, current.options);
                    }
                }
            } catch (cleanupErr) {
                console.warn("Could not delete old database files:", cleanupErr);
            }

            // 7. Reload to use new path
            window.location.href = "/";

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء تغيير المسار: " + error.message);
        }
    };

    const exportDatabase = async () => {
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { copyFile } = await import("@tauri-apps/plugin-fs");
            const { getDatabasePath } = await import("../../lib/appConfig");

            const destinationPath = await save({
                defaultPath: `قاعدة بيانات الجرد ${new Date().toISOString().split('T')[0]}.db`,
                filters: [{ name: "SQLite Database", extensions: ["db"] }],
            });

            if (!destinationPath) return;

            const dbPathStr = await getDatabasePath();
            const current = await getFsPathOptions(dbPathStr);

            await copyFile(current.path, destinationPath, {
                fromPathBaseDir: current.options.baseDir,
            });

            alert("تم حفظ نسخة احتياطية بنجاح");
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء التصدير: " + error.message);
        }
    };

    const importDatabase = async () => {
        try {
            const { open, confirm } = await import("@tauri-apps/plugin-dialog");
            const { copyFile, remove, exists } = await import("@tauri-apps/plugin-fs");
            const { getDatabasePath } = await import("../../lib/appConfig");

            const selectedFile = await open({
                filters: [{ name: "SQLite Database", extensions: ["db"] }],
            });

            if (!selectedFile) return;

            const confirmed = await confirm(
                "سيتم استبدال قاعدة البيانات الحالية بالملف المختار. هل أنت متأكد؟ (سيتم إعادة تحميل التطبيق)",
                { title: "تأكيد استيراد قاعدة البيانات", kind: "warning" }
            );

            if (confirmed) {
                // Determine where the current DB is
                const dbPathStr = await getDatabasePath();
                const current = await getFsPathOptions(dbPathStr);

                try {
                    // 1. Clean up connection
                    const db = await getDb();
                    await db.execute("PRAGMA journal_mode=DELETE;");
                    if (typeof db.close === 'function') {
                        await db.close();
                    }
                } catch (e) {
                    console.warn("Failed to close DB:", e);
                }

                // 2. Remove WAL/SHM if they stick around
                try {
                    // Construct WAL path based on current path
                    const walPath = current.path + "-wal";
                    const shmPath = current.path + "-shm";

                    if (await exists(walPath, current.options)) {
                        await remove(walPath, current.options);
                    }
                    if (await exists(shmPath, current.options)) {
                        await remove(shmPath, current.options);
                    }
                } catch (e) {
                    console.warn("Cleanup WAL/SHM error:", e);
                }

                // 3. Overwrite
                await copyFile(selectedFile, current.path, {
                    toPathBaseDir: current.options.baseDir
                });

                // 4. Reload
                window.location.href = "/";
            }
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الاستيراد: " + error.message);
        }
    };

    if (loading) return <Loader2 className="animate-spin" />;

    return (
        <div className="space-y-6 max-w-xl mx-auto">
            <h1 className="text-3xl font-bold text-primary text-center">الإعدادات</h1>
            <Card className="p-8 space-y-6 shadow-xl border-0">
                <div className="space-y-2">
                    <label className="block text-sm font-black text-primary/60 uppercase tracking-wider">اسم المؤسسة</label>
                    <Input
                        value={config.publisher_name}
                        onChange={e => setConfig({ ...config, publisher_name: e.target.value })}
                        className="text-xl py-6"
                        placeholder="أدخل اسم المؤسسة هنا..."
                    />
                </div>
                <Button onClick={handleSave} size="lg" className="w-full flex justify-center items-center gap-3">
                    <Save size={24} />
                    <span className="text-lg">حفظ الإعدادات</span>
                </Button>
            </Card>

            <Card className="p-8 space-y-6 shadow-xl border-0">
                <div className="flex items-center gap-2 border-b pb-4">
                    <Database className="text-primary" />
                    <h2 className="text-xl font-bold text-primary">إدارة قاعدة البيانات</h2>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <Button
                        onClick={changeDatabaseLocation}
                        variant="outline"
                        className="w-fit h-14 gap-2 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200"
                    >
                        <Database size={20} />
                        تغيير مكان قاعدة البيانات
                    </Button>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button
                            onClick={exportDatabase}
                            variant="outline"
                            className="flex-1 gap-2 h-14 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                        >
                            <Download size={20} />
                            تصدير قاعدة البيانات
                        </Button>

                        <Button
                            onClick={importDatabase}
                            variant="outline"
                            className="flex-1 gap-2 h-14 text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                        >
                            <Upload size={20} />
                            استيراد قاعدة بيانات
                        </Button>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground text-center bg-gray-50 p-3 rounded-lg border border-dashed">
                    ملاحظة: عند استيراد قاعدة بيانات، سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف المستورد.
                </p>
            </Card>
        </div>
    );
}
