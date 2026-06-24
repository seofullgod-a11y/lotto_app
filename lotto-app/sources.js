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

// GLO official API. Shape varies; this adapter is best-effort and should be
// verified against the live response, then adjusted if the field names differ.
export async function fetchFromGLO() {
  const data = await getJSON(`${GLO}/getLatestLottery`);
  const d = data?.response?.data || data?.data || data;
  if (!d) return null;
  const pick = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const iso =
    thaiDateToISO(d.date) ||
    (d.date_announce ? String(d.date_announce).slice(0, 10) : null);
  if (!iso) return null;
  return {
    date: iso,
    first: d.first?.number?.[0]?.value || d.first || '',
    near1: pick(d.near1?.number || d.near1).map((x) => x.value || x),
    front3: pick(d.last3f?.number || d.front3).map((x) => x.value || x),
    back3: pick(d.last3b?.number || d.back3).map((x) => x.value || x),
    back2: d.last2?.number?.[0]?.value || d.back2 || '',
    second: pick(d.second?.number || d.second).map((x) => x.value || x),
    third: pick(d.third?.number || d.third).map((x) => x.value || x),
    fourth: pick(d.fourth?.number || d.fourth).map((x) => x.value || x),
    fifth: pick(d.fifth?.number || d.fifth).map((x) => x.value || x),
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
