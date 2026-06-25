// sources.js — backfill from public APIs. PRIMARY real-time path is manual
// entry from the live broadcast; this fills history / auto-syncs the government
// result. GLO is the official source; rayriffy (archived) is opt-in only.
// ---------------------------------------------------------------------------
import { thaiDateToISO } from './lib.js';

const GLO = (process.env.GLO_API_URL || 'https://www.glo.or.th/api/lottery').replace(/\/$/, '');
const RAYRIFFY = process.env.FALLBACK_API_URL || ''; // set to enable (archived)

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Parse the many date shapes GLO/aggregators use into ISO yyyy-mm-dd.
function parseAnyDate(v) {
  if (v == null) return null;
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const ms = String(v).length <= 10 ? Number(v) * 1000 : Number(v);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`; // ISO
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {                          // dd/mm/yyyy (BE or CE)
    let y = +m[3]; if (y > 2400) y -= 543;
    return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  return thaiDateToISO(s); // "16 พฤศจิกายน 2567"
}

// Recursively find the node that actually holds the prize arrays.
function findResultNode(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  if (Array.isArray(obj.prizes) || obj.first || obj.last2 || obj.runningNumbers) return obj;
  for (const k of Object.keys(obj)) {
    const found = findResultNode(obj[k], depth + 1);
    if (found) return found;
  }
  return null;
}

function flat(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => (x && x.value) || x).filter(Boolean).map(String);
  if (typeof v === 'object' && v.number) return flat(v.number);
  return [String(v)];
}

// Normalize a GLO/rayriffy-style payload into our canonical government draw.
export function normalizeGLO(payload) {
  const node = findResultNode(payload);
  if (!node) return { error: 'ไม่พบ prizes ในผลลัพธ์', keys: Object.keys(payload || {}) };

  const byId = {};
  for (const p of node.prizes || []) byId[p.id] = flat(p.number);
  for (const p of node.runningNumbers || []) byId[p.id] = flat(p.number);

  // accept both array-by-id shape and flat-field shape
  const first = byId.prizeFirst?.[0] || flat(node.first)[0] || '';
  const draw = {
    date: parseAnyDate(node.date ?? node.displayDate ?? node.date_announce ?? payload?.response?.date),
    first,
    near1: byId.prizeFirstNear || flat(node.near1),
    front3: byId.runningNumberFrontThree || flat(node.last3f || node.front3),
    back3: byId.runningNumberBackThree || flat(node.last3b || node.back3),
    back2: byId.runningNumberBackTwo?.[0] || flat(node.last2 || node.back2)[0] || '',
    second: byId.prizeSecond || flat(node.second),
    third: byId.prizeThrid || byId.prizeThird || flat(node.third),
    fourth: byId.prizeForth || byId.prizeFourth || flat(node.fourth),
    fifth: byId.prizeFifth || flat(node.fifth),
  };
  if (!draw.first) return { error: 'แกะเลขรางวัลที่ 1 ไม่ได้', keys: Object.keys(node) };
  if (!draw.date) return { error: 'แกะวันที่ไม่ได้', keys: Object.keys(node) };
  return { draw };
}

export async function fetchFromGLO() {
  const data = await getJSON(`${GLO}/getLatestLottery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const out = normalizeGLO(data);
  if (out.error) {
    const snippet = JSON.stringify(data).slice(0, 600);
    throw new Error(`${out.error} (keys: ${(out.keys || []).join(',')}) raw=${snippet}`);
  }
  return out.draw;
}

export async function fetchFromRayriffy() {
  if (!RAYRIFFY) throw new Error('ปิดใช้งาน (ตั้ง FALLBACK_API_URL เพื่อเปิด)');
  const data = await getJSON(`${RAYRIFFY}/latest`);
  const out = normalizeGLO(data);
  if (out.error) throw new Error(out.error);
  return out.draw;
}

// Try official GLO first, then optional fallback. Returns canonical draw or throws.
export async function syncLatest() {
  const errors = [];
  for (const [name, fn] of [['GLO', fetchFromGLO], ['rayriffy', fetchFromRayriffy]]) {
    try {
      const draw = await fn();
      if (draw && draw.first) return { draw, source: name };
      errors.push(`${name}: ไม่มีข้อมูล`);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error('ดึงผลไม่สำเร็จ — ' + errors.join(' | '));
}
