// sources.js — backfill from public APIs. The PRIMARY real-time path is manual
// entry from the live broadcast (see /api/admin/draw). These are for filling
// history and as a verification cross-check.
// ---------------------------------------------------------------------------
import { normalizeRayriffy, thaiDateToISO } from './lib.js';

const RAYRIFFY = process.env.FALLBACK_API_URL || 'https://lotto.api.rayriffy.com';
const GLO = process.env.GLO_API_URL || 'https://www.glo.or.th/api/lottery';

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// GLO official API. Confirmed endpoint: POST /api/lottery/getLatestLottery.
// The JSON mirrors the prizes[] / runningNumbers[] shape, so we reuse the
// same normalizer; a flat-field fallback covers shape variations.
export async function fetchFromGLO() {
  const data = await getJSON(`${GLO}/getLatestLottery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  // primary: prizes[] / runningNumbers[] under .response
  const norm = normalizeRayriffy(data?.response ? data : { response: data?.data || data });
  if (norm && norm.first) return norm;

  // fallback: flat fields (#first #last2 #last3f #last3b #near1 #second...)
  const d = data?.response?.data || data?.data || data?.response || data;
  if (!d) return null;
  const pick = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (x && x.value) || x).filter(Boolean);
  const iso = thaiDateToISO(d.date) || (d.date_announce ? String(d.date_announce).slice(0, 10) : null);
  if (!iso) return null;
  return {
    date: iso,
    first: (pick(d.first)[0]) || '',
    near1: pick(d.near1),
    front3: pick(d.last3f || d.front3),
    back3: pick(d.last3b || d.back3),
    back2: (pick(d.last2 || d.back2)[0]) || '',
    second: pick(d.second),
    third: pick(d.third),
    fourth: pick(d.fourth),
    fifth: pick(d.fifth),
  };
}

export async function fetchFromRayriffy() {
  const data = await getJSON(`${RAYRIFFY}/latest`);
  return normalizeRayriffy(data);
}

// Try official first, then fallback. Returns a canonical draw or throws.
export async function syncLatest() {
  const errors = [];
  for (const [name, fn] of [
    ['GLO', fetchFromGLO],
    ['rayriffy', fetchFromRayriffy],
  ]) {
    try {
      const draw = await fn();
      if (draw && draw.first) return { draw, source: name };
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error('ดึงผลจากทุกแหล่งไม่สำเร็จ — ' + errors.join(' | '));
}
