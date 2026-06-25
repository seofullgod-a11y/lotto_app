// seo.js — server-rendered, indexable pages for per-number history.
// These bake real data into the HTML so search engines see content.
// ---------------------------------------------------------------------------
import { isoToThaiDate } from './lib.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shell({ title, desc, canonical, body }) {
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0c8a63">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="stylesheet" href="/styles.css">
<style>.seo-hits{width:100%;border-collapse:collapse;margin-top:8px}.seo-hits td{padding:9px 12px;border-bottom:1px solid var(--line);font-size:.92rem}.seo-hits td:last-child{text-align:right;color:var(--muted)}.big-stat{font-family:var(--tnum);font-weight:700;font-size:2.6rem;color:var(--jade-deep);line-height:1}.role-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line)}.role-row:last-child{border:none}.related{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.related a{font-family:var(--tnum);font-weight:600;background:var(--surface-2);padding:8px 13px;border-radius:10px;text-decoration:none;color:var(--ink)}.related a:hover{background:#eaefec}</style>
</head><body>
<header class="site-head"><div class="wrap">
<a class="brand" href="/"><span class="logo">฿</span><b>ตรวจหวย<small>สลากกินแบ่งรัฐบาล</small></b></a>
<nav class="nav"><a href="/">ตรวจหวย</a><a href="/stats">สถิติ</a><a href="/#subscribe">แจ้งเตือน</a></nav>
</div></header>
<main class="wrap">${body}</main>
<footer class="site-foot"><div class="wrap"><span class="note">ตรวจหวย • สถิติเลขย้อนหลังจากผลสลากกินแบ่งรัฐบาล</span></div></footer>
</body></html>`;
}

export function renderNumberPage(hist, base) {
  const { number, length, total, byRole, lastDate, hits } = hist;
  const kind = length === 2 ? 'เลขท้าย 2 ตัว' : 'เลข 3 ตัว';
  const title = `เลข ${number} ออกกี่ครั้ง — สถิติ${kind} ย้อนหลัง | ตรวจหวย`;
  const desc = total
    ? `เลข ${number} ออกรางวัลสลากกินแบ่งรัฐบาลมาแล้ว ${total} ครั้ง ออกล่าสุดงวด ${isoToThaiDate(lastDate)} ดูสถิติย้อนหลังทั้งหมด`
    : `สถิติเลข ${number} จากผลสลากกินแบ่งรัฐบาลย้อนหลัง`;

  const roleRows = Object.entries(byRole)
    .map(([role, c]) => `<div class="role-row"><span>${esc(role)}</span><b class="num">${c} ครั้ง</b></div>`)
    .join('') || '<p class="note">ยังไม่เคยออกในข้อมูลย้อนหลังที่มี</p>';

  const hitRows = hits.length
    ? hits.map((h) => `<tr><td>${isoToThaiDate(h.date)}</td><td>${esc(h.role)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="note">— ไม่มีประวัติ —</td></tr>';

  // related numbers (neighbors)
  const pad = (x) => String((x + (length === 2 ? 100 : 1000)) % (length === 2 ? 100 : 1000)).padStart(length, '0');
  const self = parseInt(number, 10);
  const related = [pad(self - 2), pad(self - 1), pad(self + 1), pad(self + 2)]
    .map((r) => `<a href="/huay/${r}">${r}</a>`).join('');

  const body = `
  <p class="eyebrow">สถิติเลขย้อนหลัง</p>
  <h1 class="h-section" style="font-size:1.6rem">เลข ${number} ออกหวยกี่ครั้ง?</h1>
  <section class="card" style="margin-bottom:20px">
    <div style="display:flex;align-items:baseline;gap:12px">
      <span class="big-stat">${total}</span>
      <span class="note">ครั้งที่เลข ${number} เคยออกในผลสลากกินแบ่งรัฐบาล${lastDate ? ` • ล่าสุด ${esc(isoToThaiDate(lastDate))}` : ''}</span>
    </div>
    <div style="margin-top:16px">${roleRows}</div>
  </section>

  <p class="eyebrow">ประวัติการออก (ล่าสุด ${hits.length} ครั้ง)</p>
  <section class="card" style="margin-bottom:20px">
    <table class="seo-hits"><tbody>${hitRows}</tbody></table>
  </section>

  <p class="eyebrow">เลขใกล้เคียง</p>
  <div class="related">${related}</div>

  <p class="note section-gap">ข้อมูลเป็นสถิติย้อนหลังเพื่อการศึกษา การออกรางวัลแต่ละงวดเป็นอิสระต่อกัน ไม่สามารถใช้ทำนายผลได้ • <a href="/" style="color:var(--jade-deep)">ตรวจหวยงวดล่าสุด</a></p>`;

  return shell({ title, desc, canonical: `${base}/huay/${number}`, body });
}

// Sitemap: home, stats, all 2-digit pages, and any 3-digit numbers that appeared.
export function renderSitemap(base, threeDigitNumbers = []) {
  const urls = ['/', '/stats'];
  for (let i = 0; i < 100; i++) urls.push(`/huay/${String(i).padStart(2, '0')}`);
  for (const n of threeDigitNumbers) urls.push(`/huay/${n}`);
  const body = urls
    .map((u) => `<url><loc>${base}${u}</loc><changefreq>weekly</changefreq></url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
