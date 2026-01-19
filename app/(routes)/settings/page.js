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
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState("");

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

    const handleRunImport = async () => {
        if (!confirm("هل أنت متأكد من بدء استيراد البيانات؟ سيتم إضافة جهات وعمليات جديدة.")) return;
        setImporting(true);
        setImportProgress("جاري تحميل الملف...");
        try {
            const res = await fetch('/import_data.json');
            if (!res.ok) throw new Error("لم يتم العثور على ملف import_data.json");
            const data = await res.json();

            setImportProgress("جاري معالجة الجهات...");
            const db = await getDb();

            // 1. Existing Parties Map
            const existingParties = await db.select("SELECT * FROM party");
            const partyMap = new Map(); // Name -> ID
            existingParties.forEach(p => partyMap.set(p.name, p.id));

            // 2. Insert new parties
            let newPartiesCount = 0;
            for (const pName of data.parties) {
                if (!partyMap.has(pName)) {
                    // Clean name
                    const cleanName = pName.trim();
                    if (!cleanName) continue;

                    // Double check in map after trim
                    if (partyMap.has(cleanName)) continue;

                    const result = await db.execute("INSERT INTO party (name, notes) VALUES ($1, '')", [cleanName]);
                    partyMap.set(cleanName, result.lastInsertId);
                    newPartiesCount++;
                }
            }

            // 3. Books Map
            setImportProgress("جاري مطابقة الكتب...");
            const bookRows = await db.select("SELECT id, title FROM book");
            const bookMap = new Map();
            bookRows.forEach(b => {
                if (b.title) bookMap.set(b.title.trim(), b.id);
            });

            // 4. Insert Transactions
            let txCount = 0;
            let skippedCount = 0;
            let newBooksCount = 0;
            const total = data.transactions.length;

            for (let i = 0; i < total; i++) {
                const tx = data.transactions[i];
                if (i % 50 === 0) setImportProgress(`استيراد العمليات ${i}/${total}`);

                const partyId = partyMap.get(tx.party_name ? tx.party_name.trim() : "");
                let bookId = bookMap.get(tx.book_title ? tx.book_title.trim() : "");

                if (!partyId) {
                    console.warn("Party not found:", tx.party_name);
                    continue;
                }

                if (!bookId) {
                    console.log("Book not found, creating:", tx.book_title);
                    const cleanBookTitle = tx.book_title ? tx.book_title.trim() : "Unknown Book";

                    // Insert new book
                    // Defaults: total_printed=0, sent_to_institution=0, unit_price=0
                    try {
                        const resBook = await db.execute(
                            "INSERT INTO book (title, total_printed, sent_to_institution, unit_price) VALUES ($1, 0, 0, 0)",
                            [cleanBookTitle]
                        );
                        bookId = resBook.lastInsertId;
                        bookMap.set(cleanBookTitle, bookId);
                        newBooksCount++;
                    } catch (err) {
                        console.error("Failed to create book:", cleanBookTitle, err);
                        skippedCount++;
                        continue;
                    }
                }

                // Check if transaction already exists? (Maybe too slow/complex)
                // User said "Insert these values".
                // I will just insert.

                await db.execute(
                    "INSERT INTO \"transaction\" (book_id, party_id, qty, tx_date, notes, state, type) VALUES ($1, $2, $3, $4, $5, 'final', 'gift')",
                    [bookId, partyId, tx.qty, tx.date, tx.notes || ""]
                );
                txCount++;
            }

            alert(`تم الاستيراد بنجاح!\n\n- جهات جديدة: ${newPartiesCount}\n- كتب جديدة: ${newBooksCount}\n- عمليات مضافة: ${txCount}\n- عمليات تم تخطيها (أخطاء): ${skippedCount}`);

        } catch (e) {
            console.error(e);
            alert("حدث خطأ: " + e.message);
        } finally {
            setImporting(false);
            setImportProgress("");
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

            {/* Excel Import Card (Temporary) */}
            <Card className="p-8 space-y-6 shadow-xl border-0">
                <div className="flex items-center gap-2 border-b pb-4">
                    <Database className="text-blue-600" />
                    <h2 className="text-xl font-bold text-blue-600">استيراد بيانات من Excel (مؤقت)</h2>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        سيقوم هذا الإجراء بقراءة ملف <code>public/import_data.json</code> الذي تم إنشاؤه مسبقاً، واستيراد الجهات والعمليات (الإهداءات) إلى قاعدة البيانات.
                    </p>
                    <Button
                        onClick={handleRunImport}
                        className="w-full gap-2 h-12 bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={importing}
                    >
                        {importing ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>جاري الاستيراد... ({importProgress})</span>
                            </>
                        ) : (
                            <>
                                <Upload size={20} />
                                <span>بدء استيراد البيانات (Gifts)</span>
                            </>
                        )}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
