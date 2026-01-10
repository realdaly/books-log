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

    const exportDatabase = async () => {
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { BaseDirectory, copyFile } = await import("@tauri-apps/plugin-fs");

            const destinationPath = await save({
                defaultPath: `قاعدة بيانات الجرد ${new Date().toISOString().split('T')[0]}.db`,
                filters: [{ name: "SQLite Database", extensions: ["db"] }],
            });

            if (!destinationPath) return;

            await copyFile("publishing.db", destinationPath, {
                fromPathBaseDir: BaseDirectory.AppData,
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
            const { BaseDirectory, copyFile, remove, exists } = await import("@tauri-apps/plugin-fs");

            const selectedFile = await open({
                filters: [{ name: "SQLite Database", extensions: ["db"] }],
            });

            if (!selectedFile) return;

            const confirmed = await confirm(
                "سيتم استبدال قاعدة البيانات الحالية بالملف المختار. هل أنت متأكد؟ (سيتم إعادة تحميل التطبيق)",
                { title: "تأكيد استيراد قاعدة البيانات", kind: "warning" }
            );

            if (confirmed) {
                try {
                    // 1. Attempt to switch journal mode to DELETE to clean up WAL/SHM files cleanly via SQLite
                    const db = await getDb();
                    await db.execute("PRAGMA journal_mode=DELETE;");

                    // 2. Attempt to close the connection if the plugin supports it
                    if (typeof db.close === 'function') {
                        await db.close();
                    }
                } catch (e) {
                    console.warn("Failed to close DB or switch journal mode:", e);
                }

                // 3. Just in case, try to remove WAL/SHM if they still exist (and aren't locked)
                try {
                    const walExists = await exists("publishing.db-wal", { baseDir: BaseDirectory.AppData });
                    if (walExists) {
                        await remove("publishing.db-wal", { baseDir: BaseDirectory.AppData });
                    }
                    const shmExists = await exists("publishing.db-shm", { baseDir: BaseDirectory.AppData });
                    if (shmExists) {
                        await remove("publishing.db-shm", { baseDir: BaseDirectory.AppData });
                    }
                } catch (e) {
                    // Ignore errors here (file might be locked), rely on the PRAGMA having done the job
                    console.warn("Cleanup WAL/SHM filesystem error:", e);
                }

                // 4. Overwrite the database file
                await copyFile(selectedFile, "publishing.db", {
                    toPathBaseDir: BaseDirectory.AppData
                });

                // 5. Reload the app
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
            <h1 className="text-3xl font-bold text-primary text-center">الاعدادات</h1>
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
                <p className="text-sm text-muted-foreground text-center bg-gray-50 p-3 rounded-lg border border-dashed">
                    ملاحظة: عند استيراد قاعدة بيانات، سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف المستورد.
                </p>
            </Card>
        </div>
    );
}
