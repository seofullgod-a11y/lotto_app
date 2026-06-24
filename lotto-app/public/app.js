// app.js — main page behavior
const $ = (id) => document.getElementById(id);
const TG_USERNAME = ''; // ตั้งชื่อบอท (เช่น 'huaycheck_bot') แล้วลิงก์จะขึ้นอัตโนมัติ

const REWARD = {
  near1: 'รางวัลละ 100,000', second: 'รางวัลละ 200,000', third: 'รางวัลละ 80,000',
  fourth: 'รางวัลละ 40,000', fifth: 'รางวัลละ 20,000',
};
const MORE_PRIZES = [
  ['second', 'รางวัลที่ 2'], ['third', 'รางวัลที่ 3'],
  ['fourth', 'รางวัลที่ 4'], ['fifth', 'รางวัลที่ 5'],
];

function renderDraw(draw, thaiDate, { live = false } = {}) {
  $('draw-date').classList.remove('skeleton');
  $('draw-date').textContent = `งวดวันที่ ${thaiDate}`;
  $('p-first').textContent = draw.first || '——————';
  $('p-front3').textContent = (draw.front3 || []).join('  ') || '—';
  $('p-back3').textContent = (draw.back3 || []).join('  ') || '—';
  $('p-back2').textContent = draw.back2 || '—';
  $('p-near1').textContent = (draw.near1 || []).join('  ') || '—';

  const list = $('more-list');
  list.innerHTML = MORE_PRIZES.map(([key, label]) => {
    const nums = draw[key] || [];
    if (!nums.length) return '';
    return `<div class="prize-block"><h4>${label} (${REWARD[key]} บาท)</h4>
      <div class="nums">${nums.map((n) => `<span>${n}</span>`).join('')}</div></div>`;
  }).join('') || '<p class="note">ยังไม่มีข้อมูลรางวัลย่อย</p>';

  $('live-badge').classList.toggle('on', !!live);
  $('draw-status').textContent = live ? 'กำลังรายงานผลสด — ตัวเลขจะอัปเดตทันที' : '';
}

async function loadLatest() {
  try {
    const r = await fetch('/api/latest');
    if (!r.ok) throw new Error();
    const { draw, thaiDate } = await r.json();
    renderDraw(draw, thaiDate);
  } catch {
    $('draw-date').classList.remove('skeleton');
    $('draw-date').textContent = 'ยังไม่มีข้อมูลงวดล่าสุด';
  }
}

async function loadDrawList() {
  try {
    const r = await fetch('/api/draws');
    const { dates } = await r.json();
    const sel = $('draw-select');
    for (const d of dates) {
      const o = document.createElement('option');
      o.value = d.date; o.textContent = d.thaiDate;
      sel.appendChild(o);
    }
  } catch {}
}

// live updates from the broadcast desk
function connectStream() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('draw', (e) => {
      const { draw, thaiDate, final } = JSON.parse(e.data);
      renderDraw(draw, thaiDate, { live: !final });
    });
    es.onerror = () => {}; // browser auto-reconnects
  } catch {}
}

const fmt = (n) => n.toLocaleString('th-TH');

async function check() {
  const raw = $('numbers').value.trim();
  if (!raw) return;
  const numbers = raw.split(/[\s,]+/).filter(Boolean).join(',');
  const date = $('draw-select').value;
  const box = $('results');
  box.innerHTML = '<p class="note">กำลังตรวจ…</p>';
  try {
    const r = await fetch(`/api/check?numbers=${encodeURIComponent(numbers)}&date=${date}`);
    const data = await r.json();
    if (!r.ok) { box.innerHTML = `<p class="note">${data.error || 'ตรวจไม่สำเร็จ'}</p>`; return; }
    box.innerHTML = data.results.map((res) => {
      if (res.wins.length) {
        const lines = res.wins.map((w) => `${w.label} (${fmt(w.amount)})`).join(' · ');
        return `<div class="res win">
          <div><div class="n">${res.number}</div><span class="win-stamp">ถูกรางวัล</span></div>
          <div class="detail"><div class="verdict">ยินดีด้วย!</div>
          <div class="breakdown">${lines}</div>
          <div class="total">รวม ${fmt(res.total)} บาท</div></div></div>`;
      }
      return `<div class="res lose"><div class="n">${res.number}</div>
        <div class="detail"><div class="verdict">ไม่ถูกรางวัล</div>
        <div class="breakdown">งวด ${data.thaiDate}</div></div></div>`;
    }).join('');
  } catch {
    box.innerHTML = '<p class="note">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p>';
  }
}

// wire up
$('more-toggle').addEventListener('click', () => {
  const list = $('more-list');
  const open = list.classList.toggle('show');
  $('more-toggle').setAttribute('aria-expanded', String(open));
  $('more-toggle').textContent = open ? 'ซ่อนรางวัลที่ 2–5' : 'ดูรางวัลที่ 2–5 ทั้งหมด';
});
$('check-btn').addEventListener('click', check);
$('clear-btn').addEventListener('click', () => { $('numbers').value = ''; $('results').innerHTML = ''; });
$('numbers').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) check(); });

if (TG_USERNAME) {
  $('tg-link-note').innerHTML = `เปิดบอท: <a href="https://t.me/${TG_USERNAME}">@${TG_USERNAME}</a>`;
} else {
  $('tg-link-note').textContent = 'ตั้งค่า TELEGRAM_BOT_TOKEN และใส่ชื่อบอทในไฟล์ app.js เพื่อให้ลิงก์เปิดบอทแสดงตรงนี้';
}

loadLatest();
loadDrawList();
connectStream();
