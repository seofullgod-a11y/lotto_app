// server.js — ตรวจหวย + สถิติ + แจ้งเตือน
// ---------------------------------------------------------------------------
import express from 'express';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

import { checkTicket, checkSimple, computeStats, computeSimpleStats, numberHistory, isoToThaiDate, PRIZE } from './lib.js';
import { LOTTERIES, getLottery, isValidLottery, lotteryKind, lotteriesByCategory, blankDraw } from './lotteries.js';
import { renderNumberPage, renderLotteryPage, renderSitemap } from './seo.js';
import { syncLatest } from './sources.js';
import { getProvider } from './providers.js';
import { buildKeywordMap, parseResultMessage } from './parse.js';
import { scoreGuess, winPoints, dreamFallback } from './games.js';
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
      lottery TEXT NOT NULL DEFAULT 'government',
      date  DATE NOT NULL,
      data  JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (lottery, date)
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id      SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      lottery TEXT NOT NULL DEFAULT 'government',
      kind    TEXT   NOT NULL,
      value   TEXT   NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (chat_id, lottery, kind, value)
    );
    CREATE TABLE IF NOT EXISTS metrics (
      key   TEXT PRIMARY KEY,
      count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS predictions (
      lottery   TEXT NOT NULL,
      device_id TEXT NOT NULL,
      nickname  TEXT NOT NULL DEFAULT 'ผู้เล่น',
      guess     TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (lottery, device_id)
    );
    CREATE TABLE IF NOT EXISTS players (
      device_id   TEXT PRIMARY KEY,
      nickname    TEXT NOT NULL DEFAULT 'ผู้เล่น',
      points      INT NOT NULL DEFAULT 0,
      wins        INT NOT NULL DEFAULT 0,
      plays       INT NOT NULL DEFAULT 0,
      streak      INT NOT NULL DEFAULT 0,
      best_streak INT NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Migrate older single-lottery deployments (PK was on date alone). Each step
  // is best-effort so it is harmless on already-migrated / fresh databases.
  for (const sql of [
    `ALTER TABLE draws ADD COLUMN IF NOT EXISTS lottery TEXT NOT NULL DEFAULT 'government'`,
    `ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_pkey`,
    `ALTER TABLE draws ADD PRIMARY KEY (lottery, date)`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS lottery TEXT NOT NULL DEFAULT 'government'`,
  ]) {
    try { await pool.query(sql); } catch { /* already applied */ }
  }
}

async function getDraw(lottery, date) {
  const { rows } = await pool.query('SELECT data FROM draws WHERE lottery=$1 AND date=$2', [lottery, date]);
  return rows[0]?.data || null;
}
async function getLatest(lottery) {
  const { rows } = await pool.query('SELECT data FROM draws WHERE lottery=$1 ORDER BY date DESC LIMIT 1', [lottery]);
  return rows[0]?.data || null;
}
async function listDates(lottery, limit = 120) {
  const { rows } = await pool.query('SELECT date FROM draws WHERE lottery=$1 ORDER BY date DESC LIMIT $2', [lottery, limit]);
  return rows.map((r) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)));
}
async function allDraws(lottery) {
  const { rows } = await pool.query('SELECT data FROM draws WHERE lottery=$1 ORDER BY date ASC', [lottery]);
  return rows.map((r) => r.data);
}
async function upsertDraw(lottery, draw) {
  await pool.query(
    `INSERT INTO draws(lottery, date, data, updated_at) VALUES($1,$2,$3,now())
     ON CONFLICT (lottery, date) DO UPDATE SET data=$3, updated_at=now()`,
    [lottery, draw.date, draw]
  );
}

// fire-and-forget analytics counter
function bump(key) {
  pool.query(
    `INSERT INTO metrics(key, count, updated_at) VALUES($1,1,now())
     ON CONFLICT (key) DO UPDATE SET count=metrics.count+1, updated_at=now()`,
    [key]
  ).catch(() => {});
}

const ADSENSE = process.env.ADSENSE_CLIENT || ''; // e.g. ca-pub-XXXXXXXX

// Score all pending guesses for a lottery against a freshly finalized draw.
async function scoreForDraw(lottery, draw) {
  const back2 = lotteryKind(lottery) === 'government' ? draw.back2 : draw.bottom2;
  if (!back2) return;
  const { rows } = await pool.query('SELECT device_id, nickname, guess FROM predictions WHERE lottery=$1', [lottery]);
  if (!rows.length) return;
  for (const r of rows) {
    const cur = await pool.query('SELECT points, wins, plays, streak, best_streak FROM players WHERE device_id=$1', [r.device_id]);
    const p = cur.rows[0] || { points: 0, wins: 0, plays: 0, streak: 0, best_streak: 0 };
    const win = scoreGuess(r.guess, back2);
    const streak = win ? p.streak + 1 : 0;
    const points = p.points + (win ? winPoints(streak) : 0);
    const wins = p.wins + (win ? 1 : 0);
    const plays = p.plays + 1;
    const best = Math.max(p.best_streak, streak);
    await pool.query(
      `INSERT INTO players(device_id, nickname, points, wins, plays, streak, best_streak, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (device_id) DO UPDATE SET nickname=$2, points=$3, wins=$4, plays=$5, streak=$6, best_streak=$7, updated_at=now()`,
      [r.device_id, r.nickname, points, wins, plays, streak, best]
    );
  }
  await pool.query('DELETE FROM predictions WHERE lottery=$1', [lottery]);
}

// resolve ?lottery= (default government), 400 if unknown
function lotteryOf(req) {
  const code = (req.query.lottery || req.body?.lottery || 'government').toString();
  return isValidLottery(code) ? code : null;
}

// --- stats cache (per lottery) -------------------------------------------
const statsCache = new Map(); // lottery -> { at, data }
function bustStats(lottery) { statsCache.delete(lottery); }
async function getStats(lottery) {
  const c = statsCache.get(lottery);
  if (c && Date.now() - c.at < 60_000) return c.data;
  const draws = await allDraws(lottery);
  const data = lotteryKind(lottery) === 'government' ? computeStats(draws, 24) : computeSimpleStats(draws, 30);
  statsCache.set(lottery, { at: Date.now(), data });
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

app.get('/api/lotteries', (req, res) => {
  res.json({ groups: lotteriesByCategory(), all: LOTTERIES });
});

app.get('/api/latest', async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const draw = await getLatest(lottery);
  if (!draw) return res.status(404).json({ error: 'ยังไม่มีข้อมูลงวดล่าสุด' });
  res.json({ lottery, kind: lotteryKind(lottery), draw, thaiDate: isoToThaiDate(draw.date) });
});

app.get('/api/draw/:date', async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const draw = await getDraw(lottery, req.params.date);
  if (!draw) return res.status(404).json({ error: 'ไม่พบงวดนี้' });
  res.json({ lottery, kind: lotteryKind(lottery), draw, thaiDate: isoToThaiDate(draw.date) });
});

app.get('/api/draws', async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const dates = await listDates(lottery);
  res.json({ dates: dates.map((d) => ({ date: d, thaiDate: isoToThaiDate(d) })) });
});

const checkLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.get('/api/check', checkLimiter, async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const date = (req.query.date || 'latest').toString();
  const numbers = (req.query.numbers || '').toString().split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean).slice(0, 20);
  if (!numbers.length) return res.status(400).json({ error: 'กรุณากรอกหมายเลข' });
  const draw = date === 'latest' ? await getLatest(lottery) : await getDraw(lottery, date);
  if (!draw) return res.status(404).json({ error: 'ไม่พบงวดที่ระบุ' });
  const gov = lotteryKind(lottery) === 'government';
  const results = numbers.map((n) => {
    if (n.length === 2 || n.length === 3 || n.length === 6) bump(`check:${lottery}:${n}`);
    const wins = gov ? checkTicket(n, draw) : checkSimple(n, draw);
    return { number: n, wins, total: gov ? wins.reduce((s, w) => s + w.amount, 0) : 0 };
  });
  res.json({ lottery, kind: lotteryKind(lottery), date: draw.date, thaiDate: isoToThaiDate(draw.date), results });
});

app.get('/api/stats', async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  res.json({ lottery, kind: lotteryKind(lottery), ...(await getStats(lottery)) });
});

// public: popular numbers — trending (most-checked) + frequent (stats)
app.get('/api/popular', async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const { rows } = await pool.query(
    'SELECT key, count FROM metrics WHERE key LIKE $1 ORDER BY count DESC LIMIT 60',
    [`check:${lottery}:%`]
  );
  const trending = rows
    .map((r) => ({ value: r.key.split(':')[2], count: Number(r.count) }))
    .filter((x) => x.value && (x.value.length === 2 || x.value.length === 3))
    .slice(0, 8);
  const stats = await getStats(lottery);
  const frequent = (lotteryKind(lottery) === 'government' ? stats.back2Top : stats.bottom2Top) || [];
  res.json({ lottery, trending, frequent: frequent.slice(0, 8) });
});

// ---- prediction game ----------------------------------------------------
const predictLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
app.post('/api/predict', predictLimiter, async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const deviceId = String(req.body?.deviceId || '').slice(0, 64);
  const guess = String(req.body?.guess || '').replace(/\D/g, '').slice(0, 2).padStart(2, '0');
  const nickname = String(req.body?.nickname || 'ผู้เล่น').trim().slice(0, 24) || 'ผู้เล่น';
  if (!deviceId || guess.length !== 2) return res.status(400).json({ error: 'ต้องมี deviceId และเลข 2 หลัก' });
  await pool.query(
    `INSERT INTO predictions(lottery, device_id, nickname, guess) VALUES($1,$2,$3,$4)
     ON CONFLICT (lottery, device_id) DO UPDATE SET guess=$4, nickname=$3, created_at=now()`,
    [lottery, deviceId, nickname, guess]
  );
  res.json({ ok: true, lottery, guess });
});

app.get('/api/leaderboard', async (req, res) => {
  const deviceId = String(req.query.deviceId || '');
  const { rows } = await pool.query(
    'SELECT nickname, points, wins, plays, streak, best_streak FROM players ORDER BY points DESC, wins DESC LIMIT 20'
  );
  let me = null;
  if (deviceId) {
    const r = await pool.query('SELECT nickname, points, wins, plays, streak, best_streak FROM players WHERE device_id=$1', [deviceId]);
    me = r.rows[0] || null;
    const p = await pool.query('SELECT lottery, guess FROM predictions WHERE device_id=$1', [deviceId]);
    if (me) me.pending = p.rows;
    else me = { pending: p.rows };
  }
  res.json({ top: rows, me });
});

// ---- dream -> numbers (AI with static fallback) -------------------------
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const dreamLimiter = rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false });
app.post('/api/dream', dreamLimiter, async (req, res) => {
  const text = String(req.body?.text || '').slice(0, 400).trim();
  if (!text) return res.status(400).json({ error: 'กรุณาเล่าความฝัน' });
  let result = null;
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `คุณคือหมอดูทำนายฝันไทยเพื่อความบันเทิง ผู้ใช้ฝันว่า: "${text}"\nตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น รูปแบบ: {"numbers":["เลข2หรือ3หลัก","..."],"interpretation":"คำทำนายสั้นๆ 1-2 ประโยค"} ให้เลข 2-3 ชุด ตามตำราฝันไทย`,
          }],
        }),
      });
      const data = await r.json();
      const txt = (data.content || []).map((c) => c.text || '').join('').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(txt);
      if (parsed && Array.isArray(parsed.numbers)) {
        result = {
          numbers: parsed.numbers.map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length === 2 || n.length === 3).slice(0, 4),
          interpretation: String(parsed.interpretation || '').slice(0, 300),
          source: 'AI ทำนายฝัน',
        };
      }
    } catch (e) { /* fall through to static */ }
  }
  if (!result || !result.numbers.length) result = dreamFallback(text);
  res.json({ ...result, note: 'เพื่อความบันเทิงเท่านั้น' });
});

// ---- live: next draw countdown + viewers --------------------------------
function nextGovernmentDraw() {
  // GLO draws on the 1st and 16th, announced ~17:00 (Asia/Bangkok, UTC+7)
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const y = bkk.getUTCFullYear(), m = bkk.getUTCMonth(), d = bkk.getUTCDate();
  const slots = [];
  for (const [mm, dd] of [[m, 1], [m, 16], [m + 1, 1]]) {
    slots.push(Date.UTC(y, mm, dd, 17 - 7, 0, 0)); // 17:00 BKK -> UTC
  }
  const next = slots.find((t) => t > now.getTime()) || slots[slots.length - 1];
  return new Date(next).toISOString();
}
app.get('/api/next-draw', (req, res) => {
  res.json({ government: nextGovernmentDraw(), viewers: clients.size });
});

// --- admin (live entry) ---------------------------------------------------
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'ไม่ได้รับอนุญาต' });
  next();
}

// Create/patch a draw during the live broadcast. Body: { lottery, date, patch, final }
app.post('/api/admin/draw', requireAdmin, async (req, res) => {
  const lottery = lotteryOf(req);
  if (!lottery) return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
  const { date, patch, final } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date ต้องเป็น YYYY-MM-DD' });
  const existing = (await getDraw(lottery, date)) || blankDraw(lotteryKind(lottery), date);
  const draw = { ...existing, ...(patch || {}), date };
  await upsertDraw(lottery, draw);
  bustStats(lottery);
  broadcast('draw', { lottery, kind: lotteryKind(lottery), draw, thaiDate: isoToThaiDate(draw.date), final: !!final });
  if (final) {
    notifyDraw(pool, lottery, draw).catch((e) => console.error('[notify]', e.message));
    scoreForDraw(lottery, draw).catch((e) => console.error('[score]', e.message));
  }
  res.json({ ok: true, lottery, draw });
});

// Pull latest GLO result (government only) from public APIs.
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  try {
    const { draw, source } = await syncLatest();
    await upsertDraw('government', draw);
    bustStats('government');
    broadcast('draw', { lottery: 'government', kind: 'government', draw, thaiDate: isoToThaiDate(draw.date), final: true });
    res.json({ ok: true, source, draw });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Ingest a result forwarded from a Telegram listener (Telethon user session).
// Accepts { text } (parsed server-side) or { lottery, top3, bottom2, date }.
const INGEST_TOKEN = process.env.INGEST_TOKEN || ADMIN_TOKEN;
const KEYWORD_MAP = (() => {
  try { return buildKeywordMap(JSON.parse(process.env.TELEGRAM_KEYWORD_MAP || '{}')); }
  catch { return buildKeywordMap(); }
})();

app.post('/api/ingest', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!INGEST_TOKEN || token !== INGEST_TOKEN) return res.status(401).json({ error: 'ไม่ได้รับอนุญาต' });
  const { text, lottery, top3, bottom2, date } = req.body || {};
  let parsed = null;
  if (text) parsed = parseResultMessage(text, KEYWORD_MAP);
  else if (lottery) parsed = { lottery, top3: top3 || '', bottom2: bottom2 || '' };
  if (!parsed || !parsed.lottery) return res.json({ ok: true, matched: false });
  const d = date || new Date().toISOString().slice(0, 10);
  try {
    await ingestResult({ ...parsed, date: d });
    res.json({ ok: true, matched: true, ...parsed, date: d });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pull all simple-lottery results from the configured provider.
app.post('/api/admin/sync-providers', requireAdmin, async (req, res) => {
  try {
    const r = await syncProviders();
    if (r.disabled) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า PROVIDER (เช่น mock หรือ http)' });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/prize-table', (req, res) => res.json(PRIZE));

// public runtime config (ad client id for the SPA)
app.get('/api/config', (req, res) => res.json({ adsense: ADSENSE }));

// admin analytics: top viewed pages + most-checked numbers
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT key, count FROM metrics ORDER BY count DESC');
  const views = [];
  const checks = {};
  let totalChecks = 0, totalViews = 0;
  for (const r of rows) {
    const c = Number(r.count);
    if (r.key.startsWith('view:')) { views.push({ path: r.key.slice(5), count: c }); totalViews += c; }
    else if (r.key.startsWith('check:')) {
      const [, lottery, number] = r.key.split(':');
      (checks[lottery] ||= []).push({ number, count: c });
      totalChecks += c;
    }
  }
  for (const k of Object.keys(checks)) checks[k] = checks[k].sort((a, b) => b.count - a.count).slice(0, 20);
  res.json({ totalViews, totalChecks, topViews: views.slice(0, 30), topNumbers: checks });
});

// --- SEO: per-number history pages + per-lottery landing pages -----------
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const baseFrom = (req) => BASE_URL || `${req.protocol}://${req.get('host')}`;

app.get('/huay/:n', async (req, res) => {
  const n = (req.params.n || '').replace(/\D/g, '');
  if (n.length !== 2 && n.length !== 3) return res.status(404).send('ไม่พบหน้านี้');
  bump(`view:/huay/${n}`);
  const draws = await allDraws('government');
  const hist = numberHistory(n, draws);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderNumberPage(hist, baseFrom(req), ADSENSE));
});

app.get('/lotto/:code', async (req, res) => {
  const code = req.params.code;
  if (!isValidLottery(code)) return res.status(404).send('ไม่พบหวยนี้');
  bump(`view:/lotto/${code}`);
  const lottery = getLottery(code);
  const all = await allDraws(code);
  const latest = all[all.length - 1] || null;
  const recent = all.slice(-10).reverse();
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLotteryPage(lottery, latest, recent, baseFrom(req), ADSENSE));
});

app.get('/sitemap.xml', async (req, res) => {
  const draws = await allDraws('government');
  const three = new Set();
  for (const d of draws) {
    for (const x of d.front3 || []) three.add(x);
    for (const x of d.back3 || []) three.add(x);
  }
  res.set('Content-Type', 'application/xml');
  res.send(renderSitemap(baseFrom(req), [...three].sort(), LOTTERIES.map((l) => l.code)));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${baseFrom(req)}/sitemap.xml\n`);
});

// --- pages ----------------------------------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));
app.get('/games', (req, res) => res.sendFile(path.join(__dirname, 'public', 'games.html')));
app.get('/dream', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dream.html')));

  // Pull the latest GLO result and store it (used by the scheduler).
  async function autoSync() {
    const { draw, source } = await syncLatest();
    const existing = await getDraw('government', draw.date);
    await upsertDraw('government', draw);
    bustStats('government');
    broadcast('draw', { lottery: 'government', kind: 'government', draw, thaiDate: isoToThaiDate(draw.date), final: true });
    if (!existing) notifyDraw(pool, 'government', draw).catch(() => {});
    scoreForDraw('government', draw).catch(() => {});
    return { source, date: draw.date };
  }

  // Pull simple-lottery results from the configured paid provider.
  async function syncProviders() {
    const provider = getProvider();
    if (!provider) return { updated: 0, disabled: true };
    const results = await provider();
    let updated = 0;
    for (const r of results) {
      if (!isValidLottery(r.lottery) || lotteryKind(r.lottery) === 'government') continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      const existing = await getDraw(r.lottery, r.date);
      const draw = { date: r.date, top3: r.top3 || '', bottom2: r.bottom2 || '' };
      await upsertDraw(r.lottery, draw);
      bustStats(r.lottery);
      broadcast('draw', { lottery: r.lottery, kind: 'simple', draw, thaiDate: isoToThaiDate(draw.date), final: true });
      if (!existing) notifyDraw(pool, r.lottery, draw).catch(() => {});
      scoreForDraw(r.lottery, draw).catch(() => {});
      updated++;
    }
    return { updated };
  }

  // Handle a result parsed from a Telegram group/channel message.
  async function ingestResult({ lottery, top3, bottom2, date }) {
    if (!isValidLottery(lottery) || lotteryKind(lottery) === 'government') return;
    const existing = (await getDraw(lottery, date)) || { date, top3: '', bottom2: '' };
    const draw = { date, top3: top3 || existing.top3 || '', bottom2: bottom2 || existing.bottom2 || '' };
    await upsertDraw(lottery, draw);
    bustStats(lottery);
    broadcast('draw', { lottery, kind: 'simple', draw, thaiDate: isoToThaiDate(draw.date), final: true });
    if (!existing.top3 && !existing.bottom2) notifyDraw(pool, lottery, draw).catch(() => {});
    scoreForDraw(lottery, draw).catch(() => {});
  }

  return { app, initDb, autoSync, syncProviders, ingestResult };
}

// --- boot (only when run directly) ----------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL || '';
  // Internal Railway + localhost don't use SSL; public proxies / Supabase do.
  const needsSsl = /proxy\.rlwy\.net|rlwy\.net|supabase|amazonaws|render|\bsslmode=require\b/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });
  const { app, initDb, autoSync, syncProviders, ingestResult } = createApp(pool);

  // Optional scheduled auto-sync for the government result (set AUTO_SYNC=1).
  // Polls every AUTO_SYNC_MINUTES (default 30); GLO updates itself on draw days.
  function startAutoSync() {
    if (process.env.AUTO_SYNC !== '1') return;
    const mins = Math.max(5, parseInt(process.env.AUTO_SYNC_MINUTES || '30', 10));
    const run = () => autoSync()
      .then((r) => console.log(`[auto-sync] อัปเดตงวด ${r.date} จาก ${r.source}`))
      .catch((e) => console.error('[auto-sync]', e.message));
    setTimeout(run, 10_000); // first run shortly after boot
    setInterval(run, mins * 60_000);
    console.log(`[auto-sync] เปิดใช้งาน ทุก ${mins} นาที (เฉพาะหวยรัฐบาล)`);
  }

  // Optional scheduled provider sync for simple lotteries (set PROVIDER=mock|http).
  function startProviderSync() {
    if (!process.env.PROVIDER) return;
    const mins = Math.max(2, parseInt(process.env.PROVIDER_MINUTES || '10', 10));
    const run = () => syncProviders()
      .then((r) => { if (!r.disabled) console.log(`[provider] อัปเดต ${r.updated} หวย`); })
      .catch((e) => console.error('[provider]', e.message));
    setTimeout(run, 12_000);
    setInterval(run, mins * 60_000);
    console.log(`[provider] เปิดใช้งาน (${process.env.PROVIDER}) ทุก ${mins} นาที`);
  }

  // Railway's private network ("*.railway.internal") takes a few seconds to
  // come up after the container starts. Retry with backoff before giving up.
  const boot = async () => {
    const max = 10;
    for (let i = 1; i <= max; i++) {
      try {
        await initDb();
        return;
      } catch (e) {
        const last = i === max;
        console.error(`เชื่อมฐานข้อมูลครั้งที่ ${i}/${max} ไม่สำเร็จ: ${e.code || e.message}${last ? '' : ' — ลองใหม่...'}`);
        if (last) throw e;
        await new Promise((r) => setTimeout(r, Math.min(1000 * i, 5000)));
      }
    }
  };

  boot()
    .then(() => {
      startBot(pool, ingestResult);
      startAutoSync();
      startProviderSync();
      app.listen(PORT, () => console.log(`ตรวจหวย พร้อมทำงานที่พอร์ต ${PORT}`));
    })
    .catch((e) => {
      console.error('init ล้มเหลว:', e);
      process.exit(1);
    });
}
