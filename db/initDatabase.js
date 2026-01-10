// Note: We removed the static import to avoid bundling issues in Tauri prods
// and we now expect the db instance to be passed from the main db.js

export default async function initDatabase(db) {
  // Basic health check to ensure we have a db instance
  if (!db) throw new Error("Database instance required for initialization");

  // Enforce foreign keys
  await db.execute(`PRAGMA foreign_keys = ON;`);

  // =========================
  // Config Table (optional)
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "config" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "publisher_name" VARCHAR(1000) DEFAULT NULL,
      "inventory_title" VARCHAR(1000) DEFAULT NULL,
      "default_qom_base_stock" INTEGER DEFAULT 200,
      "created_at" TEXT DEFAULT (datetime('now'))
    );
  `);

  // =========================
  // Book Table
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "book" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "title" VARCHAR(1000) NOT NULL,
      "code" VARCHAR(255) DEFAULT NULL,
      "category" VARCHAR(255) DEFAULT NULL,
      "notes" TEXT DEFAULT NULL,

      -- Excel (E): العدد المرسل للمؤسسة من قم
      "sent_to_institution" INTEGER NOT NULL DEFAULT 0,

      -- Optional per-book base stock for Qom (instead of config.default_qom_base_stock)
      "qom_base_stock" INTEGER DEFAULT NULL,

      "created_at" TEXT DEFAULT (datetime('now')),
      "updated_at" TEXT DEFAULT (datetime('now')),

      UNIQUE("title")
    );
  `);

  // =========================
  // Party Table
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "party" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" VARCHAR(1000) NOT NULL,
      "type" VARCHAR(50) DEFAULT NULL, -- person | institution | other
      "phone" VARCHAR(255) DEFAULT NULL,
      "address" TEXT DEFAULT NULL,
      "notes" TEXT DEFAULT NULL,
      "created_at" TEXT DEFAULT (datetime('now')),
      UNIQUE("name")
    );
  `);

  // =========================
  // Party Categories
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "party_category" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" VARCHAR(255) NOT NULL,
      UNIQUE("name")
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "party_category_link" (
      "party_id" INTEGER NOT NULL,
      "category_id" INTEGER NOT NULL,
      PRIMARY KEY ("party_id", "category_id"),
      FOREIGN KEY ("party_id") REFERENCES "party" ("id") ON DELETE CASCADE,
      FOREIGN KEY ("category_id") REFERENCES "party_category" ("id") ON DELETE CASCADE
    );
  `);

  // =========================
  // Branch Table
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "branch" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" VARCHAR(50) NOT NULL, -- institution | qom
      "title" VARCHAR(255) NOT NULL,
      UNIQUE("key")
    );
  `);

  // Seed branches
  await db.execute(`
    INSERT OR IGNORE INTO "branch" ("key", "title")
    VALUES
      ('institution', 'المؤسسة'),
      ('qom', 'فرع قم');
  `);

  // =========================
  // Transaction Table
  // type:
  //  gift | loan | sale | loss | transfer_in | transfer_out | return_loan
  //
  // state:
  //  final    = confirmed (default)
  //  pending  = "طور البيع" (ONLY used for sale in Qom branch)
  //  canceled = canceled/voided (doesn't affect inventory & reports)
  // =========================
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "transaction" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,

      "book_id" INTEGER NOT NULL,
      "branch_id" INTEGER NOT NULL,

      "type" VARCHAR(50) NOT NULL,
      "state" VARCHAR(20) NOT NULL DEFAULT 'final', -- final | pending | canceled

      "qty" INTEGER NOT NULL CHECK("qty" > 0),

      -- For gift/loan/sale: who received/borrowed/bought
      "party_id" INTEGER DEFAULT NULL,

      -- For sale only
      "unit_price" REAL DEFAULT NULL,
      "total_price" REAL DEFAULT NULL,
      "receipt_no" VARCHAR(255) DEFAULT NULL,

      -- For loan tracking (optional)
      "loan_due_date" TEXT DEFAULT NULL,
      "loan_returned_at" TEXT DEFAULT NULL,

      "tx_date" TEXT NOT NULL DEFAULT (date('now')),
      "notes" TEXT DEFAULT NULL,

      "finalized_at" TEXT DEFAULT NULL,
      "canceled_at" TEXT DEFAULT NULL,

      "created_at" TEXT DEFAULT (datetime('now')),

      FOREIGN KEY ("book_id") REFERENCES "book" ("id") ON DELETE CASCADE,
      FOREIGN KEY ("branch_id") REFERENCES "branch" ("id") ON DELETE RESTRICT,
      FOREIGN KEY ("party_id") REFERENCES "party" ("id") ON DELETE SET NULL
    );
  `);

  // =========================
  // Indexes
  // =========================
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_book" ON "transaction" ("book_id");`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_party" ON "transaction" ("party_id");`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_type" ON "transaction" ("type");`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_state" ON "transaction" ("state");`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_date" ON "transaction" ("tx_date");`);
  await db.execute(`CREATE INDEX IF NOT EXISTS "idx_transaction_branch" ON "transaction" ("branch_id");`);

  // =====================================================================
  // Views
  // =====================================================================

  // Always rebuild these views (safe if schema evolves)
  await db.execute(`DROP VIEW IF EXISTS "vw_book_sales_qty";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_book_gifts_qty";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_book_loans_qty";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_book_loss_qty";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_book_sales_money";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_book_sale_pending_qty_qom";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_books_out_for_sale_qom";`);
  await db.execute(`DROP VIEW IF EXISTS "vw_inventory_central";`);

  // -------------------------
  // Final Sales quantities (state=final only)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_sales_qty" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS sold_qty
    FROM "transaction" t
    WHERE t.type = 'sale' AND t.state = 'final'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Gifts quantities (exclude canceled)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_gifts_qty" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS gifted_qty
    FROM "transaction" t
    WHERE t.type = 'gift' AND t.state != 'canceled'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Loans quantities (exclude canceled)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_loans_qty" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS loaned_qty
    FROM "transaction" t
    WHERE t.type = 'loan' AND t.state != 'canceled'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Loss quantities (exclude canceled)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_loss_qty" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS loss_qty
    FROM "transaction" t
    WHERE t.type = 'loss' AND t.state != 'canceled'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Sales revenue (final only)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_sales_money" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(COALESCE(t.total_price, t.qty * COALESCE(t.unit_price, 0))) AS revenue
    FROM "transaction" t
    WHERE t.type = 'sale' AND t.state = 'final'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Pending sale quantities (All branches)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_pending_sales_qty" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS pending_qty
    FROM "transaction" t
    WHERE t.type = 'sale' AND t.state = 'pending'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Pending sale quantities (Legacy Qom branch specific - kept for compat)
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_book_sale_pending_qty_qom" AS
    SELECT
      t.book_id,
      t.branch_id,
      SUM(t.qty) AS pending_sale_qty
    FROM "transaction" t
    JOIN "branch" b ON b.id = t.branch_id
    WHERE t.type = 'sale'
      AND t.state = 'pending'
      AND b.key = 'qom'
    GROUP BY t.book_id, t.branch_id;
  `);

  // -------------------------
  // Books currently out for sale (Qom, pending, not canceled)
  // Returns each pending transaction row with book + party
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_books_out_for_sale_qom" AS
    SELECT
      t.id AS transaction_id,
      t.tx_date,
      t.qty,
      t.notes,
      bk.id AS book_id,
      bk.title AS book_title,
      p.id AS party_id,
      p.name AS party_name
    FROM "transaction" t
    JOIN "branch" b ON b.id = t.branch_id
    JOIN "book" bk ON bk.id = t.book_id
    LEFT JOIN "party" p ON p.id = t.party_id
    WHERE t.type = 'sale'
      AND t.state = 'pending'
      AND b.key = 'qom'
    ORDER BY t.tx_date DESC, t.id DESC;
  `);

  // -------------------------
  // Central inventory view (like جرد اصدارات المؤسسة)
  // Important:
  // - Pending sale is subtracted ONLY from Qom remaining
  // - Institution does NOT use pending sale
  // - Canceled does not count anywhere
  // -------------------------
  await db.execute(`
    CREATE VIEW IF NOT EXISTS "vw_inventory_central" AS
    WITH cfg AS (
      SELECT COALESCE((SELECT default_qom_base_stock FROM config ORDER BY id DESC LIMIT 1), 200) AS default_qom
    ),
    b_institution AS (
      SELECT id AS branch_id FROM branch WHERE key='institution' LIMIT 1
    ),
    b_qom AS (
      SELECT id AS branch_id FROM branch WHERE key='qom' LIMIT 1
    )
    SELECT
      bk.id AS book_id,
      bk.title AS book_title,

      -- Sent to institution (Excel column E)
      bk.sent_to_institution AS sent_to_institution,

      -- Institution totals
      COALESCE((
        SELECT sold_qty FROM vw_book_sales_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)
      ), 0) AS sold_institution,

      COALESCE((
        SELECT gifted_qty FROM vw_book_gifts_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)
      ), 0) AS gifted_institution,

      COALESCE((
        SELECT loaned_qty FROM vw_book_loans_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)
      ), 0) AS loaned_institution,

      COALESCE((
        SELECT loss_qty FROM vw_book_loss_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)
      ), 0) AS loss_institution,

      -- Remaining in institution (same idea as Excel F = E - H - I - M - L)
      (
        bk.sent_to_institution
        - COALESCE((SELECT sold_qty   FROM vw_book_sales_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
        - COALESCE((SELECT gifted_qty FROM vw_book_gifts_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
        - COALESCE((SELECT loaned_qty FROM vw_book_loans_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
        - COALESCE((SELECT loss_qty   FROM vw_book_loss_qty  WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
      ) AS remaining_institution,

      -- Qom base stock
      COALESCE(bk.qom_base_stock, (SELECT default_qom FROM cfg)) AS qom_base_stock,

      -- Qom totals
      COALESCE((
        SELECT sold_qty FROM vw_book_sales_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)
      ), 0) AS sold_qom,

      COALESCE((
        SELECT gifted_qty FROM vw_book_gifts_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)
      ), 0) AS gifted_qom,

      COALESCE((
        SELECT loaned_qty FROM vw_book_loans_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)
      ), 0) AS loaned_qom,

      COALESCE((
        SELECT loss_qty FROM vw_book_loss_qty
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)
      ), 0) AS loss_qom,

      -- Pending sale (Qom only)
      COALESCE((
        SELECT pending_sale_qty FROM vw_book_sale_pending_qty_qom
        WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)
      ), 0) AS pending_sale_qom,

      -- Remaining in Qom (subtract pending sale ONLY here)
      (
        COALESCE(bk.qom_base_stock, (SELECT default_qom FROM cfg))
        - COALESCE((SELECT sold_qty   FROM vw_book_sales_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
        - COALESCE((SELECT gifted_qty FROM vw_book_gifts_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
        - COALESCE((SELECT loaned_qty FROM vw_book_loans_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
        - COALESCE((SELECT loss_qty   FROM vw_book_loss_qty  WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
        - COALESCE((SELECT pending_sale_qty FROM vw_book_sale_pending_qty_qom WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
      ) AS remaining_qom,

      -- Total remaining
      (
        (
          bk.sent_to_institution
          - COALESCE((SELECT sold_qty   FROM vw_book_sales_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
          - COALESCE((SELECT gifted_qty FROM vw_book_gifts_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
          - COALESCE((SELECT loaned_qty FROM vw_book_loans_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
          - COALESCE((SELECT loss_qty   FROM vw_book_loss_qty  WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_institution)), 0)
        )
        +
        (
          COALESCE(bk.qom_base_stock, (SELECT default_qom FROM cfg))
          - COALESCE((SELECT sold_qty   FROM vw_book_sales_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
          - COALESCE((SELECT gifted_qty FROM vw_book_gifts_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
          - COALESCE((SELECT loaned_qty FROM vw_book_loans_qty WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
          - COALESCE((SELECT loss_qty   FROM vw_book_loss_qty  WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
          - COALESCE((SELECT pending_sale_qty FROM vw_book_sale_pending_qty_qom WHERE book_id=bk.id AND branch_id=(SELECT branch_id FROM b_qom)), 0)
        )
      ) AS remaining_total

    FROM "book" bk;
  `);

  return null;
}