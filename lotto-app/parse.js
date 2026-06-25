// parse.js — extract { lottery, top3, bottom2 } from a free-text result message
// posted in a Telegram group/channel. Heuristic + keyword map; tune to taste.
// ---------------------------------------------------------------------------
import { LOTTERIES } from './lotteries.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Build keyword -> code map from the registry (names + short names), longest
// keyword first so "ฮานอย VIP" wins over "ฮานอย". Extra aliases can be merged.
export function buildKeywordMap(extra = {}) {
  const map = [];
  for (const l of LOTTERIES) {
    for (const kw of [l.name, l.short, l.name.replace(/^หวย/, '')]) {
      if (kw) map.push([norm(kw), l.code]);
    }
  }
  for (const [kw, code] of Object.entries(extra)) map.push([norm(kw), code]);
  // dedupe + sort by keyword length desc
  const seen = new Set();
  return map
    .filter(([kw]) => kw && !seen.has(kw) && seen.add(kw))
    .sort((a, b) => b[0].length - a[0].length);
}

function matchLottery(text, map) {
  for (const [kw, code] of map) if (text.includes(kw)) return code;
  return null;
}

// pull a number that appears after a label (within a short window)
function near(text, labels, digits) {
  for (const lab of labels) {
    const re = new RegExp(lab + '[^0-9]{0,8}(\\d{' + digits + '})(?!\\d)');
    const m = text.match(re);
    if (m) return m[1];
  }
  return '';
}

export function parseResultMessage(rawText, map) {
  const text = norm(rawText);
  if (!text) return null;
  const lottery = matchLottery(text, map);
  if (!lottery) return null;

  const top3 = near(text, ['3 ?ตัว ?บน', 'สามตัวบน', '3up', '3 ?digit', 'บน'], 3);
  let bottom2 = near(text, ['2 ?ตัว ?ล่าง', 'สองตัวล่าง', '2down', 'ล่าง'], 2);
  // fallback: a lone 3-digit and 2-digit anywhere (last resort)
  if (!top3 && !bottom2) {
    const three = text.match(/(?<!\d)(\d{3})(?!\d)/);
    const two = text.match(/(?<!\d)(\d{2})(?!\d)/);
    if (!three && !two) return null;
    return { lottery, top3: three ? three[1] : '', bottom2: two ? two[1] : '' };
  }
  return { lottery, top3, bottom2 };
}
