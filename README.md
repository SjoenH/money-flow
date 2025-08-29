# Money Flow Visualizer

Interactive budgeting & expense ingestion with graph + table views, OCR (images & PDF), Norwegian support, line‑item parsing, and AI‑assisted categorization.

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
```

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
- Export/Import (CSV/JSON), cloud sync option
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

---

Built with React, TypeScript, Vite, React Flow & Tesseract.js – plus a sarcastic paperclip.
This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.
