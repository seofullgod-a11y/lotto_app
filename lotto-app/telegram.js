// telegram.js — long-polling bot for watch-number alerts. Optional: only
// starts if TELEGRAM_BOT_TOKEN is set. Reuses the same Postgres pool.
// ---------------------------------------------------------------------------
import { checkTicket, isoToThaiDate } from './lib.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

async function tg(method, body) {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    console.error('[tg]', method, e.message);
    return null;
  }
}

export async function sendMessage(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

const HELP = [
  'สวัสดีครับ 🎫 บอทตรวจหวยอัตโนมัติ',
  '',
  'พิมพ์เลขที่ลุ้นไว้ พอหวยออกผมเด้งบอกทันที',
  '',
  '<b>คำสั่ง</b>',
  '/watch 123456 — เฝ้าเลขสลาก 6 หลัก',
  '/watch2 45 — เฝ้าเลขท้าย 2 ตัว',
  '/list — ดูเลขที่เฝ้าอยู่',
  '/stop — ลบทั้งหมด',
].join('\n');

async function handleUpdate(pool, u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const [cmd, arg] = text.split(/\s+/);

  if (cmd === '/start' || cmd === '/help') {
    await sendMessage(chatId, HELP);
  } else if (cmd === '/watch') {
    const n = (arg || '').replace(/\D/g, '');
    if (n.length !== 6) return void sendMessage(chatId, 'พิมพ์เลข 6 หลัก เช่น /watch 123456');
    await pool.query(
      `INSERT INTO subscriptions(chat_id, kind, value) VALUES($1,'full',$2)
       ON CONFLICT (chat_id, kind, value) DO NOTHING`,
      [chatId, n]
    );
    await sendMessage(chatId, `เฝ้าเลข <b>${n}</b> ให้แล้ว ✅`);
  } else if (cmd === '/watch2') {
    const n = (arg || '').replace(/\D/g, '').padStart(2, '0');
    if (n.length !== 2) return void sendMessage(chatId, 'พิมพ์เลข 2 หลัก เช่น /watch2 45');
    await pool.query(
      `INSERT INTO subscriptions(chat_id, kind, value) VALUES($1,'back2',$2)
       ON CONFLICT (chat_id, kind, value) DO NOTHING`,
      [chatId, n]
    );
    await sendMessage(chatId, `เฝ้าเลขท้าย 2 ตัว <b>${n}</b> ให้แล้ว ✅`);
  } else if (cmd === '/list') {
    const { rows } = await pool.query('SELECT kind, value FROM subscriptions WHERE chat_id=$1 ORDER BY id', [chatId]);
    if (!rows.length) return void sendMessage(chatId, 'ยังไม่มีเลขที่เฝ้าไว้ พิมพ์ /watch 123456');
    const list = rows.map((r) => (r.kind === 'back2' ? `ท้าย 2 ตัว: ${r.value}` : `เลข: ${r.value}`)).join('\n');
    await sendMessage(chatId, `<b>เลขที่เฝ้าอยู่</b>\n${list}`);
  } else if (cmd === '/stop') {
    await pool.query('DELETE FROM subscriptions WHERE chat_id=$1', [chatId]);
    await sendMessage(chatId, 'ลบเลขที่เฝ้าทั้งหมดแล้ว');
  }
}

// Notify everyone whose watched number wins in this draw.
export async function notifyDraw(pool, draw) {
  if (!API) return;
  const { rows } = await pool.query('SELECT chat_id, kind, value FROM subscriptions');
  const thai = isoToThaiDate(draw.date);
  for (const r of rows) {
    let wins = [];
    if (r.kind === 'back2') {
      if (draw.back2 && r.value === draw.back2) wins = [{ label: 'เลขท้าย 2 ตัว', amount: 2000 }];
    } else {
      wins = checkTicket(r.value, draw);
    }
    if (wins.length) {
      const total = wins.reduce((s, w) => s + w.amount, 0);
      const lines = wins.map((w) => `• ${w.label} — ${w.amount.toLocaleString('th-TH')} บาท`);
      await sendMessage(
        r.chat_id,
        `🎉 <b>เลข ${r.value} ถูกรางวัล!</b>\nงวด ${thai}\n${lines.join('\n')}\nรวม <b>${total.toLocaleString('th-TH')}</b> บาท`
      );
    }
  }
}

export function startBot(pool) {
  if (!API) {
    console.log('[tg] TELEGRAM_BOT_TOKEN ไม่ได้ตั้งค่า — ข้ามการเปิดบอท');
    return;
  }
  let offset = 0;
  const poll = async () => {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      for (const u of data.result || []) {
        offset = u.update_id + 1;
        handleUpdate(pool, u).catch((e) => console.error('[tg] handle', e.message));
      }
    } catch (e) {
      // network blip — back off briefly
      await new Promise((r) => setTimeout(r, 3000));
    }
    setImmediate(poll);
  };
  poll();
  console.log('[tg] บอทเริ่มทำงานแล้ว');
}
