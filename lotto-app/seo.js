// seo.js — server-rendered, indexable pages: per-number history + per-lottery
// landing pages. Real data is baked into the HTML for search engines.
// ---------------------------------------------------------------------------
import { isoToThaiDate } from './lib.js';
import { LOTTERIES } from './lotteries.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function adScript(adsense) {
  return adsense
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(adsense)}" crossorigin="anonymous"></script>`
    : '';
}
function adSlot(adsense) {
  if (!adsense) return '';
  return `<div class="ad-slot"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(adsense)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

// footer with internal links to every lottery (SEO link graph)
function footerLinks() {
  const links = LOTTERIES.map((l) => `<a href="/lotto/${l.code}">ตรวจ${esc(l.short)}</a>`).join('');
  return `<div class="seo-links">${links}</div>`;
}

function shell({ title, desc, canonical, body, adsense }) {
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0c8a63"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<link rel="stylesheet" href="/styles.css">${adScript(adsense)}
<style>.seo-hits{width:100%;border-collapse:collapse;margin-top:8px}.seo-hits td{padding:9px 12px;border-bottom:1px solid var(--line);font-size:.92rem}.seo-hits td:last-child{text-align:right;color:var(--muted)}.big-stat{font-family:var(--tnum);font-weight:700;font-size:2.6rem;color:var(--jade-deep);line-height:1}.role-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line)}.role-row:last-child{border:none}.related{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.related a,.seo-links a{font-family:var(--tnum);font-weight:600;background:var(--surface-2);padding:8px 13px;border-radius:10px;text-decoration:none;color:var(--ink)}.related a:hover,.seo-links a:hover{background:#eaefec}.seo-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.seo-links a{font-family:var(--display);font-weight:500;font-size:.86rem}.ad-slot{margin:24px 0;min-height:90px;text-align:center}</style>
</head><body>
<header class="site-head"><div class="wrap">
<a class="brand" href="/"><span class="logo">฿</span><b>ตรวจหวย<small>ทุกประเภท</small></b></a>
<nav class="nav"><a href="/">ตรวจหวย</a><a href="/stats">สถิติ</a><a href="/#subscribe">แจ้งเตือน</a></nav>
</div></header>
<main class="wrap">${body}
<section class="section-gap"><p class="eyebrow">ตรวจหวยประเภทอื่น</p>${footerLinks()}</section></main>
<footer class="site-foot"><div class="wrap"><span class="note">ตรวจหวย • ผลและสถิติย้อนหลังเพื่อการศึกษา ไม่สามารถใช้ทำนายผลได้</span></div></footer>
</body></html>`;
}

// ---- per-number history page -------------------------------------------
export function renderNumberPage(hist, base, adsense = '') {
  const { number, length, total, byRole, lastDate, hits } = hist;
  const kind = length === 2 ? 'เลขท้าย 2 ตัว' : 'เลข 3 ตัว';
  const title = `เลข ${number} ออกกี่ครั้ง — สถิติ${kind}ย้อนหลัง | ตรวจหวย`;
  const desc = total
    ? `เลข ${number} ออกรางวัลสลากกินแบ่งรัฐบาลมาแล้ว ${total} ครั้ง ออกล่าสุดงวด ${isoToThaiDate(lastDate)} ดูสถิติย้อนหลังทั้งหมด`
    : `สถิติเลข ${number} จากผลสลากกินแบ่งรัฐบาลย้อนหลัง`;
  const roleRows = Object.entries(byRole).map(([role, c]) => `<div class="role-row"><span>${esc(role)}</span><b class="num">${c} ครั้ง</b></div>`).join('')
    || '<p class="note">ยังไม่เคยออกในข้อมูลย้อนหลังที่มี</p>';
  const hitRows = hits.length ? hits.map((h) => `<tr><td>${isoToThaiDate(h.date)}</td><td>${esc(h.role)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="note">— ไม่มีประวัติ —</td></tr>';
  const mod = length === 2 ? 100 : 1000;
  const pad = (x) => String(((x % mod) + mod) % mod).padStart(length, '0');
  const self = parseInt(number, 10);
  const related = [pad(self - 2), pad(self - 1), pad(self + 1), pad(self + 2)].map((r) => `<a href="/huay/${r}">${r}</a>`).join('');

  const body = `
  <p class="eyebrow">สถิติเลขย้อนหลัง</p>
  <h1 class="h-section" style="font-size:1.6rem">เลข ${number} ออกหวยกี่ครั้ง?</h1>
  <section class="card" style="margin-bottom:20px">
    <div style="display:flex;align-items:baseline;gap:12px"><span class="big-stat">${total}</span>
      <span class="note">ครั้งที่เลข ${number} เคยออกในผลสลากกินแบ่งรัฐบาล${lastDate ? ` • ล่าสุด ${esc(isoToThaiDate(lastDate))}` : ''}</span></div>
    <div style="margin-top:16px">${roleRows}</div>
  </section>
  ${adSlot(adsense)}
  <p class="eyebrow">ประวัติการออก (ล่าสุด ${hits.length} ครั้ง)</p>
  <section class="card" style="margin-bottom:20px"><table class="seo-hits"><tbody>${hitRows}</tbody></table></section>
  <p class="eyebrow">เลขใกล้เคียง</p><div class="related">${related}</div>`;
  return shell({ title, desc, canonical: `${base}/huay/${number}`, body, adsense });
}

// ---- per-lottery landing page ------------------------------------------
function resultBlock(lottery, d) {
  if (!d) return '<p class="note">ยังไม่มีผลในระบบสำหรับหวยนี้</p>';
  if (lottery.kind === 'government') {
    return `
    <div class="role-row"><span>รางวัลที่ 1</span><b class="num" style="font-size:1.3rem">${esc(d.first || '—')}</b></div>
    <div class="role-row"><span>เลขท้าย 2 ตัว</span><b class="num" style="font-size:1.3rem">${esc(d.back2 || '—')}</b></div>
    <div class="role-row"><span>เลขหน้า 3 ตัว</span><b class="num">${esc((d.front3 || []).join('  ') || '—')}</b></div>
    <div class="role-row"><span>เลขท้าย 3 ตัว</span><b class="num">${esc((d.back3 || []).join('  ') || '—')}</b></div>`;
  }
  const top2 = d.top3 ? d.top3.slice(-2) : '—';
  return `
    <div class="role-row"><span>3 ตัวบน</span><b class="num" style="font-size:1.3rem">${esc(d.top3 || '—')}</b></div>
    <div class="role-row"><span>2 ตัวบน</span><b class="num" style="font-size:1.3rem">${esc(top2)}</b></div>
    <div class="role-row"><span>2 ตัวล่าง</span><b class="num" style="font-size:1.3rem">${esc(d.bottom2 || '—')}</b></div>`;
}

export function renderLotteryPage(lottery, latest, recent, base, adsense = '') {
  const today = latest ? isoToThaiDate(latest.date) : '';
  const title = `ตรวจ${lottery.name}วันนี้ ${today ? 'งวด ' + today : ''} ผลล่าสุด | ตรวจหวย`.replace(/\s+/g, ' ').trim();
  const desc = `ตรวจ${lottery.name}วันนี้ ผลออกล่าสุด${today ? ' งวด ' + today : ''} พร้อมผลย้อนหลังและสถิติ ${esc(lottery.schedule)}`;
  const rows = recent.length
    ? recent.map((d) => {
        const main = lottery.kind === 'government' ? d.first : d.top3;
        const sub = lottery.kind === 'government' ? d.back2 : d.bottom2;
        return `<tr><td>${isoToThaiDate(d.date)}</td><td class="num">${esc(main || '—')}${sub ? ' · ' + esc(sub) : ''}</td></tr>`;
      }).join('')
    : '<tr><td colspan="2" class="note">— ยังไม่มีผลย้อนหลัง —</td></tr>';

  const body = `
  <p class="eyebrow">${esc(lottery.category)} • ${esc(lottery.schedule)}</p>
  <h1 class="h-section" style="font-size:1.6rem">ตรวจ${esc(lottery.name)}วันนี้</h1>
  <section class="card" style="margin-bottom:20px">
    <div class="note" style="margin-bottom:6px">${today ? 'ผลงวดล่าสุด ' + esc(today) : 'ยังไม่มีผลล่าสุด'}</div>
    ${resultBlock(lottery, latest)}
    <p style="margin-top:16px"><a href="/?lottery=${lottery.code}" class="btn btn-primary" style="text-decoration:none;display:inline-block">ตรวจเลขของคุณ</a></p>
  </section>
  ${adSlot(adsense)}
  <p class="eyebrow">ผลย้อนหลัง</p>
  <section class="card"><table class="seo-hits"><tbody>${rows}</tbody></table></section>`;
  return shell({ title, desc, canonical: `${base}/lotto/${lottery.code}`, body, adsense });
}

// ---- sitemap ------------------------------------------------------------
export function renderSitemap(base, threeDigitNumbers = [], lotteryCodes = []) {
  const urls = ['/', '/stats'];
  for (const c of lotteryCodes) urls.push(`/lotto/${c}`);
  for (let i = 0; i < 100; i++) urls.push(`/huay/${String(i).padStart(2, '0')}`);
  for (const n of threeDigitNumbers) urls.push(`/huay/${n}`);
  const body = urls.map((u) => `<url><loc>${base}${u}</loc><changefreq>daily</changefreq></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
