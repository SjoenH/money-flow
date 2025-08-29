// Simple Express server for SQLite-backed API
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import multer from 'multer';
import { createWorker } from 'tesseract.js';
import fs from 'fs';

const app = express();
const db = new Database('moneyflow.db');
const upload = multer({ dest: 'uploads/' });

// Ensure uploads dir exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

app.use(cors());
app.use(express.json());

// Create tables if not exist
// sources: id, label, amount (number)
db.prepare(`CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  amount REAL NOT NULL
)`).run();
// drains: id, label, amount (number), type ('amount'|'percent')
db.prepare(`CREATE TABLE IF NOT EXISTS drains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL
)`).run();

// --- API Endpoints ---
// Sources
app.get('/api/sources', (req, res) => {
    const sources = db.prepare('SELECT * FROM sources').all();
    res.json(sources);
});
app.post('/api/sources', (req, res) => {
    const { label, amount } = req.body;
    const info = db.prepare('INSERT INTO sources (label, amount) VALUES (?, ?)').run(label, amount);
    res.json({ id: info.lastInsertRowid, label, amount });
});
app.delete('/api/sources/:id', (req, res) => {
    db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// Drains
app.get('/api/drains', (req, res) => {
    const drains = db.prepare('SELECT * FROM drains').all();
    res.json(drains);
});
app.post('/api/drains', (req, res) => {
    const { label, amount, type } = req.body;
    const info = db.prepare('INSERT INTO drains (label, amount, type) VALUES (?, ?, ?)').run(label, amount, type);
    res.json({ id: info.lastInsertRowid, label, amount, type });
});
app.delete('/api/drains/:id', (req, res) => {
    db.prepare('DELETE FROM drains WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// OCR endpoint
app.post('/api/ocr', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const lang = (req.query.lang as string) || 'eng';
    let worker;
    try {
        worker = await createWorker(lang, 1, { logger: () => { } });
        const { data } = await worker.recognize(filePath);
        res.json({ text: data.text });
    } catch (e) {
        console.error('OCR error', e);
        res.status(500).json({ error: 'OCR failed', detail: (e as Error).message });
    } finally {
        try { await worker?.terminate(); } catch { /* ignore terminate error */ }
        fs.unlink(filePath, () => { });
    }
});

const PORT = 5174;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
