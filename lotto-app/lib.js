// lib.js — pure helpers (no I/O), shared by server + seed
// ---------------------------------------------------------------------------

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// "30 ธันวาคม 2561" -> "2018-12-30"
export function thaiDateToISO(thai) {
  if (!thai) return null;
  const parts = String(thai).trim().split(/\s+/);
  if (parts.length < 3) return null;
  const day = parseInt(parts[0], 10);
  const monthIdx = THAI_MONTHS.findIndex((m) => parts[1].startsWith(m.slice(0, 4)));
  let year = parseInt(parts[2], 10);
  if (Number.isNaN(day) || monthIdx < 0 || Number.isNaN(year)) return null;
  if (year > 2400) year -= 543; // Buddhist Era -> CE
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "2018-12-30" -> "30 ธันวาคม 2561"
export function isoToThaiDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return '';
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

// Normalize the rayriffy-style API payload into our canonical draw shape.
export function normalizeRayriffy(payload) {
  const r = payload?.response;
  if (!r) return null;
  const byId = {};
  for (const p of r.prizes || []) byId[p.id] = p.number || [];
  for (const p of r.runningNumbers || []) byId[p.id] = p.number || [];
  const iso = thaiDateToISO(r.date);
  if (!iso) return null;
  return {
    date: iso,
    first: (byId.prizeFirst || [])[0] || '',
    near1: byId.prizeFirstNear || [],
    front3: byId.runningNumberFrontThree || [],
    back3: byId.runningNumberBackThree || [],
    back2: (byId.runningNumberBackTwo || [])[0] || '',
    second: byId.prizeSecond || [],
    third: byId.prizeThrid || byId.prizeThird || [],
    fourth: byId.prizeForth || byId.prizeFourth || [],
    fifth: byId.prizeFifth || [],
  };
}

// Prize amounts (THB) per current GLO schedule.
export const PRIZE = {
  first: 6000000,
  near1: 100000,
  second: 200000,
  third: 80000,
  fourth: 40000,
  fifth: 20000,
  front3: 4000,
  back3: 4000,
  back2: 2000,
};

const PRIZE_LABEL = {
  first: 'รางวัลที่ 1',
  near1: 'รางวัลข้างเคียงรางวัลที่ 1',
  second: 'รางวัลที่ 2',
  third: 'รางวัลที่ 3',
  fourth: 'รางวัลที่ 4',
  fifth: 'รางวัลที่ 5',
  front3: 'รางวัลเลขหน้า 3 ตัว',
  back3: 'รางวัลเลขท้าย 3 ตัว',
  back2: 'รางวัลเลขท้าย 2 ตัว',
};

// Check a single 6-digit ticket against a draw. Returns array of wins.
export function checkTicket(ticket, draw) {
  const n = String(ticket).replace(/\D/g, '');
  const wins = [];
  if (!draw) return wins;
  const add = (key) => wins.push({ key, label: PRIZE_LABEL[key], amount: PRIZE[key] });

  if (n.length === 6) {
    if (n === draw.first) add('first');
    if ((draw.near1 || []).includes(n)) add('near1');
    if ((draw.second || []).includes(n)) add('second');
    if ((draw.third || []).includes(n)) add('third');
    if ((draw.fourth || []).includes(n)) add('fourth');
    if ((draw.fifth || []).includes(n)) add('fifth');
    if ((draw.front3 || []).includes(n.slice(0, 3))) add('front3');
    if ((draw.back3 || []).includes(n.slice(-3))) add('back3');
  }
  if (n.length >= 2 && draw.back2 && n.slice(-2) === draw.back2) add('back2');
  return wins;
}

// Check a ticket against a SIMPLE draw (3 ตัวบน + 2 ตัวล่าง). No baht amounts
// since payout rates vary by operator — we report which prizes hit.
export function checkSimple(ticket, draw) {
  const n = String(ticket).replace(/\D/g, '');
  const wins = [];
  if (!draw) return wins;
  if (draw.top3 && n.length >= 3 && n.slice(-3) === draw.top3) wins.push({ key: 'top3', label: '3 ตัวบน' });
  if (draw.top3 && n.length >= 2 && n.slice(-2) === draw.top3.slice(-2)) wins.push({ key: 'top2', label: '2 ตัวบน' });
  if (draw.bottom2 && n.length >= 2 && n.slice(-2) === draw.bottom2) wins.push({ key: 'bottom2', label: '2 ตัวล่าง' });
  return wins;
}

// Frequency stats for simple-lottery draws.
export function computeSimpleStats(draws, recentWindow = 30) {
  const top2 = {};
  const bottom2 = {};
  const top3 = {};
  for (const d of draws) {
    if (d.top3) {
      top3[d.top3] = (top3[d.top3] || 0) + 1;
      const t2 = d.top3.slice(-2);
      top2[t2] = (top2[t2] || 0) + 1;
    }
    if (d.bottom2) bottom2[d.bottom2] = (bottom2[d.bottom2] || 0) + 1;
  }
  const top = (obj, k = 12) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k).map(([value, count]) => ({ value, count }));
  return {
    totalDraws: draws.length,
    range: draws.length ? { from: draws[0].date, to: draws[draws.length - 1].date } : null,
    top2Top: top(top2),
    bottom2Top: top(bottom2),
    top3Top: top(top3, 10),
  };
}

// Per-number history across government draws — powers SEO number pages.
// Returns occurrences for a 2- or 3-digit number across the relevant prize roles.
export function numberHistory(n, draws) {
  const num = String(n).replace(/\D/g, '');
  const len = num.length;
  const hits = []; // {date, role}
  for (const d of draws) {
    if (len === 2) {
      if (d.back2 === num) hits.push({ date: d.date, role: 'เลขท้าย 2 ตัว' });
      if (d.first && d.first.slice(-2) === num) hits.push({ date: d.date, role: '2 ตัวท้ายรางวัลที่ 1' });
    } else if (len === 3) {
      if ((d.front3 || []).includes(num)) hits.push({ date: d.date, role: 'เลขหน้า 3 ตัว' });
      if ((d.back3 || []).includes(num)) hits.push({ date: d.date, role: 'เลขท้าย 3 ตัว' });
      if (d.first && d.first.slice(-3) === num) hits.push({ date: d.date, role: '3 ตัวท้ายรางวัลที่ 1' });
    }
  }
  hits.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const byRole = {};
  for (const h of hits) byRole[h.role] = (byRole[h.role] || 0) + 1;
  return {
    number: num,
    length: len,
    total: hits.length,
    byRole,
    lastDate: hits[0]?.date || null,
    hits: hits.slice(0, 30),
  };
}

// Build frequency stats from an array of canonical draws.
// `recentWindow` limits hot/cold to the most recent N draws (draws must be sorted ascending).
export function computeStats(draws, recentWindow = 24) {
  const back2 = {};
  const front3 = {};
  const back3 = {};
  const firstLastDigit = {};
  for (const d of draws) {
    if (d.back2) back2[d.back2] = (back2[d.back2] || 0) + 1;
    for (const f of d.front3 || []) front3[f] = (front3[f] || 0) + 1;
    for (const b of d.back3 || []) back3[b] = (back3[b] || 0) + 1;
    if (d.first) {
      const ld = d.first.slice(-1);
      firstLastDigit[ld] = (firstLastDigit[ld] || 0) + 1;
    }
  }
  const recent = draws.slice(-recentWindow);
  const recentBack2 = {};
  for (const d of recent) if (d.back2) recentBack2[d.back2] = (recentBack2[d.back2] || 0) + 1;

  const top = (obj, k = 10) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k).map(([value, count]) => ({ value, count }));

  // cold = valid two-digit values that have NEVER appeared
  const seen = new Set(Object.keys(back2));
  const neverHit = [];
  for (let i = 0; i < 100; i++) {
    const v = String(i).padStart(2, '0');
    if (!seen.has(v)) neverHit.push(v);
  }

  return {
    totalDraws: draws.length,
    range: draws.length ? { from: draws[0].date, to: draws[draws.length - 1].date } : null,
    back2Top: top(back2, 12),
    back2Recent: top(recentBack2, 8),
    front3Top: top(front3, 8),
    back3Top: top(back3, 8),
    firstLastDigit: Object.entries(firstLastDigit)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count })),
    neverHitBack2: neverHit,
  };
}
