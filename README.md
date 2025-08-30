# Money Flow Visualizer

Interactive bu## 🧭 Workflow

1. Add sources & drains (kr or %).  
2. Switch Graph / Planned Table / Expenses views.  
3. Upload a receipt (image/PDF) with empty fields → auto import & parse.  
4. Expand line items; adjust categories.  
5. Inspect variance (planned vs actual).  
6. **Export/Import**: Backup complete data (JSON) or expenses only (CSV).
7. Enjoy (or fear) Evil Clippy's commentary.

## 💾 Import/Export

The app supports multiple import/export formats for different use cases:

### JSON Export/Import (Complete Backup)

- **Export All**: Complete app backup including nodes, edges, and expenses
- **Import All**: Restore complete app state from backup
- **Budget Only**: Export just sources & drains for template sharing
- **Use cases**: Data backup, device migration, sharing budget templates

### CSV Export/Import (Expenses Only)  

- **Export Expenses**: All expense data in spreadsheet-friendly format
- **Import Expenses**: Add expenses from CSV (appends to existing)
- **Format**: Date, Description, Amount, Category, Merchant, VAT, Currency, Notes
- **Use cases**: Spreadsheet analysis, integration with other financial tools

### Export Options Available

| Format | Content | Location | Use Case |
|--------|---------|----------|----------|
| **JSON (All)** | Complete app state | Main controls + Expenses tab | Full backup/restore |
| **JSON (Budget)** | Sources & drains only | Planned Table tab | Template sharing |
| **CSV (Expenses)** | Expense records | Expenses tab | Spreadsheet analysis |

### Import Features

- **Automatic validation** of file format and structure
- **Backup creation** before import (stored in localStorage)
- **Confirmation dialogs** showing what will be imported
- **Error handling** with clear feedback messages
- **Category matching** for CSV imports (matches existing drain node labels)& expense ingestion with graph + table views, OCR (images & PDF), Norwegian support, line‑item parsing, and AI‑assisted categorization.

## 🌟 Live Demo

**Try it now**: [https://sjoenh.github.io/money-flow/](https://sjoenh.github.io/money-flow/)

[![GitHub Release](https://img.shields.io/github/v/release/SjoenH/money-flow)](https://github.com/SjoenH/money-flow/releases)
[![GitHub Pages](https://img.shields.io/badge/demo-live-success)](https://sjoenh.github.io/money-flow/)

## ✨ Features

- React Flow graph of income sources & drains (fixed or %) with live totals & remaining
- Planned budget table with inline editing & yearly projections
- Weekly / Monthly expense tracking (ISO week)
- Auto receipt import (select file with empty fields = instant expense)
- Client-side OCR (tesseract.js) – Norwegian + English (`nor`, `eng`, `nor+eng`)
- PDF OCR (multi-page) via pdfjs-dist (progress aggregation)
- Structured receipt parsing: merchant, VAT/MVA amount, currency, total
- Line-item extraction (amount, qty × unit price inference) + per-item category mapping
- Heuristic + optional on-device AI categorization (auto-creates drain nodes)
- Variance report: planned vs actual per category
- **Import/Export functionality**: JSON (complete backup) & CSV (expenses only)
- Evil Clippy AI roast widget (throttled, fallback snark)
- LocalStorage persistence (nodes, edges, expenses)
- Robust edge ID generation & duplicate cleanup

## 🚀 Quick Start

```bash
pnpm install
pnpm dev
```

Open: <http://localhost:5173>

> Requires Node.js ≥ 20.19 for Vite 7.

## 🧭 Workflow

1. Add sources & drains (kr or %).  
2. Switch Graph / Planned Table / Expenses views.  
3. Upload a receipt (image/PDF) with empty fields → auto import & parse.  
4. Expand line items; adjust categories.  
5. Inspect variance (planned vs actual).  
6. Enjoy (or fear) Evil Clippy’s commentary.

## 🧾 OCR & Parsing

| Aspect | Details |
|--------|---------|
| Languages | `nor`, `eng`, `nor+eng` |
| PDF | Rasterize each page (scale 2) then OCR sequentially |
| Merchant | Header / Org.nr heuristic |
| VAT | Regex `(MVA\|VAT)` + amount |
| Total | Highest plausible monetary value near total keywords |
| Line Items | Trailing amount + qty×unit inference |
| Categorization | Keyword map → (optional AI) → drain node |

If worker fails, falls back to fake worker (slower). For better accuracy: high‑contrast images.

## 🧠 AI

| Use | Purpose |
|-----|---------|
| Roasts | Short witty budget summaries |
| Categorization | Fallback when heuristics miss |

All on-device / experimental APIs; safe fallback when unavailable.

## 🗂 Persistence

LocalStorage keys:

```text
moneyflow-nodes
moneyflow-edges
moneyflow-expenses
```

Clear storage to reset.

## 🛠 Scripts

```bash
pnpm dev       # Dev server
pnpm build     # Type-check + build
pnpm preview   # Preview build
pnpm lint      # ESLint
pnpm release   # Create semantic release (CI only)
```

## 🚀 Releases & Deployment

This project uses semantic-release for automated versioning and GitHub Pages for hosting:

- **Releases**: Automatic based on conventional commits (`feat:`, `fix:`, etc.)
- **Changelog**: Auto-generated from commit messages
- **Deployment**: Automatic to GitHub Pages on releases
- **Live Demo**: Always reflects the latest release

## ♻️ Conventional Commits & Hooks

Husky + commitlint enforce messages:

- `pre-commit`: runs `pnpm lint`
- `commit-msg`: conventional format validation

Examples:

```text
feat: add batch receipt import
fix(ocr): handle zero-byte pdf
chore(ci): add semantic release config
```

## 🔮 Roadmap

- Batch multi-file import
- OCR preprocessing (deskew, threshold)
- AI structured JSON normalization (merchant/date/items)
- ✅ **Export/Import (CSV/JSON)**: Complete backup/restore and spreadsheet integration
- Cloud sync option
- IndexedDB OCR cache / service worker
- Automated tests for parsing & categorization

## 🐞 Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Worker error | Worker URL not resolved | Update deps; still works (slower) |
| Slow OCR | Large multi-page PDF | Export images or reduce resolution |
| Missing category | Heuristic miss | Manually assign once; future detection improves |
| AI inactive | Model unavailable / disk | Ignore; heuristics remain |

## 🤝 Contributing

1. Branch from `main`  
2. Conventional commits  
3. Provide anonymized receipts for parser changes

## 📄 License

Add a LICENSE (e.g. MIT) if distributing. Currently private.

## 📬 Feedback

Open issues/PRs with difficult Norwegian receipts to enhance heuristics.

## 📊 Project Status

- ✅ **Core Features**: Complete with graph, table, and expense views
- ✅ **OCR Pipeline**: Norwegian + English with PDF support
- ✅ **AI Integration**: On-device categorization and roasts
- ✅ **Release Pipeline**: Semantic versioning and auto-deployment
- ✅ **Live Demo**: Hosted on GitHub Pages

---

Built with React, TypeScript, Vite, React Flow & Tesseract.js – plus a sarcastic paperclip.
