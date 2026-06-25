// providers.js — auto-update source for the SIMPLE lotteries (lao/hanoi/stock).
// These have no free official API, so results come from a paid aggregator.
// Adding a provider = writing one normalizer that returns our canonical shape:
//   [{ lottery: '<our code>', date: 'YYYY-MM-DD', top3: '789', bottom2: '45' }]
// Select which provider runs with the PROVIDER env var.
// ---------------------------------------------------------------------------
import { isValidLottery } from './lotteries.js';

const num = (s) => String(s ?? '').replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);

// --- mock: PROVIDER=mock — sample data to prove the pipeline end-to-end ----
function mockProvider() {
  return async () => [
    { lottery: 'hanoi', date: today(), top3: '789', bottom2: '45' },
    { lottery: 'lao_dev', date: today(), top3: '123', bottom2: '67' },
    { lottery: 'stock_th_pm', date: today(), top3: '456', bottom2: '89' },
  ];
}

// --- generic HTTP: PROVIDER=http — for an apilotto-style JSON API ----------
// Configure: PROVIDER_URL, PROVIDER_KEY (optional bearer),
//            PROVIDER_CODE_MAP = JSON mapping provider id/name -> our code.
// Adjust the field picks below to match your provider's real response.
function httpProvider() {
  const url = process.env.PROVIDER_URL;
  const key = process.env.PROVIDER_KEY || '';
  let codeMap = {};
  try { codeMap = JSON.parse(process.env.PROVIDER_CODE_MAP || '{}'); } catch {}

  return async () => {
    if (!url) throw new Error('ไม่ได้ตั้งค่า PROVIDER_URL');
    const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    if (!res.ok) throw new Error(`provider ตอบ ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.data || data.results || data.lottery || [];
    const out = [];
    for (const it of list) {
      const raw = it.code ?? it.name ?? it.lottery ?? it.id;
      const code = codeMap[raw] || raw;
      if (!isValidLottery(code)) continue;
      const r = it.result || it;
      const top3 = num(r.top3 ?? r['3up'] ?? r.three_up ?? r.up3);
      const bottom2 = num(r.bottom2 ?? r['2down'] ?? r.two_down ?? r.down2);
      const date = String(it.date ?? it.draw_date ?? r.date ?? today()).slice(0, 10);
      if (top3 || bottom2) out.push({ lottery: code, date, top3, bottom2: bottom2 ? bottom2.padStart(2, '0') : '' });
    }
    return out;
  };
}

// Returns an async function that yields normalized results, or null if disabled.
export function getProvider(id = process.env.PROVIDER) {
  if (id === 'mock') return mockProvider();
  if (id === 'http') return httpProvider();
  return null;
}
