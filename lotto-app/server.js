// server.js — ตรวจหวย + สถิติ + แจ้งเตือน
// ---------------------------------------------------------------------------
import express from 'express';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

import { checkTicket, computeStats, isoToThaiDate, PRIZE } from './lib.js';
import { syncLatest } from './sources.js';
import { startBot, notifyDraw } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Build the app around a given pool. Exported so tests can inject a pool.
export function createApp(pool) {
const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for correct IPs
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draws (
      date  DATE PRIMARY KEY,
      data  JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id      SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      kind    TEXT   NOT NULL,
      value   TEXT   NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (chat_id, kind, value)
    );
  `);
}

async function getDraw(date) {
  const { rows } = await pool.query('SELECT data FROM draws WHERE date=$1', [date]);
  return rows[0]?.data || null;
}
async function getLatest() {
  const { rows } = await pool.query('SELECT data FROM draws ORDER BY date DESC LIMIT 1');
  return rows[0]?.data || null;
}
async function listDates(limit = 60) {
  const { rows } = await pool.query('SELECT date FROM draws ORDER BY date DESC LIMIT $1', [limit]);
  return rows.map((r) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)));
}
async function upsertDraw(draw) {
  await pool.query(
    `INSERT INTO draws(date, data, updated_at) VALUES($1,$2,now())
     ON CONFLICT (date) DO UPDATE SET data=$2, updated_at=now()`,
    [draw.date, draw]
  );
}

// --- stats cache ----------------------------------------------------------
let statsCache = { at: 0, data: null };
async function getStats() {
  if (statsCache.data && Date.now() - statsCache.at < 60_000) return statsCache.data;
  const { rows } = await pool.query('SELECT data FROM draws ORDER BY date ASC');
  const draws = rows.map((r) => r.data);
  const data = computeStats(draws, 24);
  statsCache = { at: Date.now(), data };
  return data;
}

// --- SSE live feed --------------------------------------------------------
const clients = new Set();
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: hello\ndata: {}\n\n');
  clients.add(res);
  const ka = setInterval(() => res.write(': ka\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ka);
    clients.delete(res);
  });
});

// --- public API -----------------------------------------------------------
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

app.get('/api/latest', async (req, res) => {
  const draw = await getLatest();
  if (!draw) return res.status(404).json({ error: 'ยังไม่มีข้อมูลงวดล่าสุด' });
  res.json({ draw, thaiDate: isoToThaiDate(draw.date) });
});

app.get('/api/draw/:date', async (req, res) => {
  const draw = await getDraw(req.params.date);
  if (!draw) return res.status(404).json({ error: 'ไม่พบงวดนี้' });
  res.json({ draw, thaiDate: isoToThaiDate(draw.date) });
});

app.get('/api/draws', async (req, res) => {
  const dates = await listDates(120);
  res.json({ dates: dates.map((d) => ({ date: d, thaiDate: isoToThaiDate(d) })) });
});

const checkLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.get('/api/check', checkLimiter, async (req, res) => {
  const date = (req.query.date || 'latest').toString();
  const numbers = (req.query.numbers || '').toString().split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean).slice(0, 20);
  if (!numbers.length) return res.status(400).json({ error: 'กรุณากรอกหมายเลขสลาก' });
  const draw = date === 'latest' ? await getLatest() : await getDraw(date);
  if (!draw) return res.status(404).json({ error: 'ไม่พบงวดที่ระบุ' });
  const results = numbers.map((n) => {
    const wins = checkTicket(n, draw);
    return { number: n, wins, total: wins.reduce((s, w) => s + w.amount, 0) };
  });
  res.json({ date: draw.date, thaiDate: isoToThaiDate(draw.date), results });
});

app.get('/api/stats', async (req, res) => {
  res.json(await getStats());
});

// --- admin (live entry) ---------------------------------------------------
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'ไม่ได้รับอนุญาต' });
  next();
}

// Create/patch a draw during the live broadcast. Body: { date, patch, final }
// `patch` merges into the existing draw (so you can post each prize as it's
// announced). `final:true` publishes -> fires Telegram notifications.
app.post('/api/admin/draw', requireAdmin, async (req, res) => {
  const { date, patch, final } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date ต้องเป็น YYYY-MM-DD' });
  const existing = (await getDraw(date)) || {
    date, first: '', near1: [], front3: [], back3: [], back2: '', second: [], third: [], fourth: [], fifth: [],
  };
  const draw = { ...existing, ...(patch || {}), date };
  await upsertDraw(draw);
  statsCache = { at: 0, data: null };
  broadcast('draw', { draw, thaiDate: isoToThaiDate(draw.date), final: !!final });
  if (final) notifyDraw(pool, draw).catch((e) => console.error('[notify]', e.message));
  res.json({ ok: true, draw });
});

// Pull latest from public APIs into the DB (backfill / verification).
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  try {
    const { draw, source } = await syncLatest();
    await upsertDraw(draw);
    statsCache = { at: 0, data: null };
    broadcast('draw', { draw, thaiDate: isoToThaiDate(draw.date), final: true });
    res.json({ ok: true, source, draw });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/prize-table', (req, res) => res.json(PRIZE));

// --- pages ----------------------------------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));

  return { app, initDb };
}

// --- boot (only when run directly) ----------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const { app, initDb } = createApp(pool);
  initDb()
    .then(() => {
      startBot(pool);
      app.listen(PORT, () => console.log(`ตรวจหวย พร้อมทำงานที่พอร์ต ${PORT}`));
    })
    .catch((e) => {
      console.error('init ล้มเหลว:', e);
      process.exit(1);
    });
}
