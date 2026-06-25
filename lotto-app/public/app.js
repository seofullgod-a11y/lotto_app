// app.js — multi-lottery main page
const $ = (id) => document.getElementById(id);
const TG_USERNAME = ''; // ใส่ชื่อบอท เช่น 'huaycheck_bot' แล้วลิงก์จะขึ้นอัตโนมัติ

let LOTTERIES = [];
let current = { code: 'government', kind: 'government', name: '', sched: '' };

const REWARD = { near1:'รางวัลละ 100,000', second:'รางวัลละ 200,000', third:'รางวัลละ 80,000', fourth:'รางวัลละ 40,000', fifth:'รางวัลละ 20,000' };
const MORE = [['second','รางวัลที่ 2'],['third','รางวัลที่ 3'],['fourth','รางวัลที่ 4'],['fifth','รางวัลที่ 5']];
const fmt = (n) => n.toLocaleString('th-TH');
const esc = (s) => String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

async function loadLotteries() {
  const { groups, all } = await (await fetch('/api/lotteries')).json();
  LOTTERIES = all;
  const sel = $('lottery-select');
  sel.innerHTML = groups.map(g =>
    `<optgroup label="${esc(g.category)}">${g.items.map(it=>`<option value="${it.code}">${esc(it.name)}</option>`).join('')}</optgroup>`
  ).join('');
  sel.value = 'government';
  setCurrent('government');
}

function setCurrent(code) {
  const l = LOTTERIES.find(x => x.code === code) || LOTTERIES[0];
  current = { code: l.code, kind: l.kind, name: l.name, sched: l.schedule };
  $('lottery-sched').textContent = l.schedule || '';
}

function heroGovernment(d) {
  return `
    <div class="first-prize">
      <div class="label">รางวัลที่ 1</div>
      <div class="big num">${d.first || '——————'}</div>
      <span class="reward">รางวัลละ 6,000,000 บาท</span>
    </div>
    <div class="mini-grid">
      <div class="mini"><div class="k">เลขหน้า 3 ตัว</div><div class="v num">${(d.front3||[]).join('  ')||'—'}</div></div>
      <div class="mini"><div class="k">เลขท้าย 3 ตัว</div><div class="v num">${(d.back3||[]).join('  ')||'—'}</div></div>
      <div class="mini"><div class="k">เลขท้าย 2 ตัว</div><div class="v num">${d.back2||'—'}</div></div>
      <div class="mini"><div class="k">ข้างเคียงรางวัลที่ 1</div><div class="v num">${(d.near1||[]).join('  ')||'—'}</div></div>
    </div>
    <button class="more-toggle" id="more-toggle" aria-expanded="false">ดูรางวัลที่ 2–5 ทั้งหมด</button>
    <div class="more-list" id="more-list"></div>`;
}
function heroSimple(d) {
  const top2 = d.top3 ? d.top3.slice(-2) : '—';
  return `
    <div class="first-prize">
      <div class="label">3 ตัวบน</div>
      <div class="big num">${d.top3 || '———'}</div>
      <span class="reward">${esc(current.sched || current.name)}</span>
    </div>
    <div class="mini-grid">
      <div class="mini"><div class="k">2 ตัวบน</div><div class="v num">${top2}</div></div>
      <div class="mini"><div class="k">2 ตัวล่าง</div><div class="v num">${d.bottom2 || '—'}</div></div>
    </div>`;
}

function renderDraw(d, thaiDate, { live=false } = {}) {
  $('draw-date').classList.remove('skeleton');
  $('draw-date').textContent = `งวดวันที่ ${thaiDate}`;
  $('hero-body').innerHTML = current.kind === 'government' ? heroGovernment(d) : heroSimple(d);

  if (current.kind === 'government') {
    const list = $('more-list');
    list.innerHTML = MORE.map(([key,label]) => {
      const nums = d[key] || []; if (!nums.length) return '';
      return `<div class="prize-block"><h4>${label} (${REWARD[key]} บาท)</h4><div class="nums">${nums.map(n=>`<span>${n}</span>`).join('')}</div></div>`;
    }).join('') || '<p style="opacity:.8;margin:0">ยังไม่มีข้อมูลรางวัลย่อย</p>';
    $('more-toggle').addEventListener('click', () => {
      const open = list.classList.toggle('show');
      $('more-toggle').setAttribute('aria-expanded', String(open));
      $('more-toggle').textContent = open ? 'ซ่อนรางวัลที่ 2–5' : 'ดูรางวัลที่ 2–5 ทั้งหมด';
    });
  }
  $('live-badge').classList.toggle('on', !!live);
  $('draw-status').textContent = live ? 'กำลังรายงานผลสด — ตัวเลขอัปเดตทันที' : '';
}

async function loadLatest() {
  $('hero-body').innerHTML = '';
  $('draw-date').classList.add('skeleton');
  $('draw-date').textContent = 'งวดวันที่ —————';
  try {
    const r = await fetch(`/api/latest?lottery=${current.code}`);
    if (!r.ok) throw new Error();
    const { draw, thaiDate } = await r.json();
    renderDraw(draw, thaiDate);
  } catch {
    $('draw-date').classList.remove('skeleton');
    $('draw-date').textContent = 'ยังไม่มีข้อมูลงวดนี้';
    $('hero-body').innerHTML = '<p style="opacity:.85;margin:8px 0 0">หวยประเภทนี้ยังไม่มีผลในระบบ — กรอกผลได้ที่หน้าแอดมิน</p>';
  }
}

async function loadDrawList() {
  const sel = $('draw-select');
  sel.innerHTML = '<option value="latest">งวดล่าสุด</option>';
  try {
    const { dates } = await (await fetch(`/api/draws?lottery=${current.code}`)).json();
    for (const d of dates) { const o=document.createElement('option'); o.value=d.date; o.textContent=d.thaiDate; sel.appendChild(o); }
  } catch {}
}

function connectStream() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('draw', (e) => {
      const { lottery, draw, thaiDate, final } = JSON.parse(e.data);
      if (lottery === current.code) renderDraw(draw, thaiDate, { live: !final });
    });
  } catch {}
}

async function check() {
  const raw = $('numbers').value.trim(); if (!raw) return;
  const numbers = raw.split(/[\s,]+/).filter(Boolean).join(',');
  const date = $('draw-select').value;
  const box = $('results'); box.innerHTML = '<p class="note">กำลังตรวจ…</p>';
  try {
    const r = await fetch(`/api/check?lottery=${current.code}&numbers=${encodeURIComponent(numbers)}&date=${date}`);
    const data = await r.json();
    if (!r.ok) { box.innerHTML = `<p class="note">${esc(data.error||'ตรวจไม่สำเร็จ')}</p>`; return; }
    box.innerHTML = data.results.map((res) => {
      if (res.wins.length) {
        const labels = res.wins.map(w => w.amount ? `${w.label} (${fmt(w.amount)})` : w.label).join(' · ');
        const totalLine = res.total ? `<div class="total">รวม ${fmt(res.total)} บาท</div>` : '';
        return `<div class="res win"><div><div class="n">${esc(res.number)}</div><span class="win-stamp">ถูกรางวัล</span></div>
          <div class="detail"><div class="verdict">ยินดีด้วย!</div><div class="breakdown">${labels}</div>${totalLine}</div></div>`;
      }
      return `<div class="res lose"><div class="n">${esc(res.number)}</div>
        <div class="detail"><div class="verdict">ไม่ถูกรางวัล</div><div class="breakdown">งวด ${esc(data.thaiDate)}</div></div></div>`;
    }).join('');
  } catch { box.innerHTML = '<p class="note">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p>'; }
}

async function loadPopular() {
  try {
    const r = await fetch(`/api/popular?lottery=${current.code}`);
    const { trending, frequent } = await r.json();
    const chip = (it, hot) => `<a class="hot-chip${hot ? ' hot' : ''}" href="/huay/${it.value}"><b class="num">${it.value}</b><small>${hot ? 'ตรวจ ' : 'ออก '}${it.count} ครั้ง</small></a>`;
    const tEl = $('hot-trending'), fEl = $('hot-frequent');
    tEl.innerHTML = trending.length ? trending.map((x) => chip(x, true)).join('') : '<p class="note" style="margin:0">ยังไม่มีข้อมูล — พอมีคนตรวจเลขจะขึ้นที่นี่</p>';
    fEl.innerHTML = frequent.length ? frequent.map((x) => chip(x, false)).join('') : '<p class="note" style="margin:0">ยังไม่มีสถิติย้อนหลัง</p>';
    $('popular-wrap').style.display = (trending.length || frequent.length) ? '' : 'none';
  } catch { $('popular-wrap').style.display = 'none'; }
}

async function switchLottery() {
  setCurrent($('lottery-select').value);
  $('results').innerHTML = '';
  await Promise.all([loadLatest(), loadDrawList(), loadPopular()]);
}

$('lottery-select').addEventListener('change', switchLottery);
$('check-btn').addEventListener('click', check);
$('clear-btn').addEventListener('click', () => { $('numbers').value=''; $('results').innerHTML=''; });

if (TG_USERNAME) $('tg-link-note').innerHTML = `เปิดบอท: <a href="https://t.me/${TG_USERNAME}">@${TG_USERNAME}</a>`;
else $('tg-link-note').textContent = 'ตั้งค่า TELEGRAM_BOT_TOKEN และใส่ชื่อบอทใน app.js เพื่อแสดงลิงก์เปิดบอท';

async function loadConfig() {
  try {
    const { adsense } = await (await fetch('/api/config')).json();
    if (!adsense) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
    for (const id of ['ad-top', 'ad-bottom']) {
      const slot = $(id); if (!slot) continue;
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', adsense);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    }
  } catch {}
}

(async () => {
  await loadLotteries();
  const q = new URLSearchParams(location.search).get('lottery');
  if (q && LOTTERIES.find((x) => x.code === q)) { $('lottery-select').value = q; setCurrent(q); }
  await Promise.all([loadLatest(), loadDrawList(), loadPopular()]);
  connectStream();
  loadConfig();
})();
