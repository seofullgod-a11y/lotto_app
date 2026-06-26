# Worker: ฟังผลหวยจากกลุ่ม Telegram (บัญชี User) → ส่งเข้าเว็บ

รันเป็น service แยกบน Railway 24 ชม. ไม่ต้องเปิดเครื่องตัวเอง

## ขั้นที่ 1 — สร้าง session string (ทำครั้งเดียวที่เครื่องคุณ)
```
pip install telethon
python gen_session.py
```
ใส่ API_ID + API_HASH แล้วล็อกอินด้วยเบอร์ + OTP → จะได้ "session string" ยาว ๆ ก๊อปเก็บไว้

## ขั้นที่ 2 — สร้าง service ใหม่บน Railway
1. ในโปรเจกต์เดิม กด **+ New** → **GitHub Repo** → เลือก repo `lotto_app` (อันเดิม)
2. เข้า service ใหม่ → **Settings** → **Root Directory** = `lotto-app/worker`
3. (ถ้าไม่ start เอง) Settings → Custom Start Command = `python telegram_listener.py`

## ขั้นที่ 3 — ใส่ Variables ของ service worker
| ตัวแปร | ค่า |
|---|---|
| `API_ID` | API ID (ตัวเลข) |
| `API_HASH` | API Hash |
| `TG_SESSION` | session string จากขั้นที่ 1 |
| `GROUP_ID` | id กลุ่มผลหวย (มี - นำหน้า) |
| `INGEST_URL` | `https://โดเมนเว็บ/api/ingest` |
| `INGEST_TOKEN` | ให้ตรงกับที่ตั้งในเว็บ |

Deploy แล้วดู Logs ต้องขึ้น `listener started` พอกลุ่มโพสต์ผลจะขึ้น `✓ hanoi 3บน=... 2ล่าง=...`

## หา GROUP_ID ไม่เจอ?
ดูได้ตอนรัน `gen_session.py` เพิ่มท้ายไฟล์ชั่วคราว:
```python
for d in client.iter_dialogs():
    print(d.id, "|", d.name)
```
หาแถวที่เป็นกลุ่มผลหวย เอา id (รวมเครื่องหมายลบ) ไปใส่ GROUP_ID

⚠️ TG_SESSION = กุญแจเข้าบัญชี เก็บเป็นความลับ อย่า commit ขึ้น GitHub (ใส่ผ่าน Railway Variables เท่านั้น)
