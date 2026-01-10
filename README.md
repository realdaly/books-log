# Books Log (Tauri + Next.js)

Arabic-only Book Inventory & Transaction Management System.

## Features
- **Central Inventory**: Dashboard calculating Institution vs Qom stock.
- **Transactions**: Gifts, Loans, Sales (Sales includes revenue tracking).
- **Parties**: Manage contacts/parties and view their history.
- **RTL Design**: Native Arabic support with clean, premium UI.
- **Offline**: Uses local SQLite database.

## Prerequisites
- Node.js (v18+)
- Rust (latest stable) for Tauri

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize the database (happens automatically on first run).
   The database file `publishing.db` is stored in your OS AppData directory:
   - Windows: `C:\Users\{User}\AppData\Roaming\com.books-log.app\publishing.db`
   - macOS: `~/Library/Application Support/com.books-log.app/publishing.db`

## Development

Run the frontend (Next.js) and backend (Tauri) simultaneously:

```bash
npm run tauri dev
```

## Build

To build the production application:

```bash
npm run tauri build
```

The output installer will be in `src-tauri/target/release/bundle/`.

## Architecture

- **Frontend**: Next.js (SSR/Static Export), TailwindCSS.
- **Backend**: Tauri (Rust), SQLite.
- **Tables**:
  - `book`: Inventory items + Manual counters for Qom.
  - `transaction`: Ledger for Institution operations.
  - `party`: Entities involved in txs.
  - `config`: Settings.
- **Qom Logic**: Uses manual inline-editable fields (`qom_sold_manual`, `qom_gifted_manual`, `qom_pending_manual`) instead of transaction calculations, per specific business rule.

## Colors
- Primary: `#F0EDCC` (Cream/Beige)
- Secondary: `#02343F` (Deep Teal/Navy)