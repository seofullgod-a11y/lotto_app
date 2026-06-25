#!/usr/bin/env python3
# telegram_listener.py — ฟังผลหวยจากกลุ่ม Telegram (ด้วยบัญชี User/Telethon)
# แล้วส่งข้อความเข้าเว็บตรวจหวยให้แกะเลขเอง
#
# รันข้างเครื่องเดียวกับ OBS ได้เลย ครั้งแรกจะให้ล็อกอินด้วยเบอร์ + รหัส OTP
# (สร้างไฟล์ session ไว้ ครั้งต่อไปไม่ต้องล็อกอินซ้ำ)
#
#   pip install telethon requests
#   python telegram_listener.py
#
# ⚠️ อย่าใส่ค่าจริงแล้ว push ขึ้น GitHub — เก็บไฟล์นี้ไว้เครื่องตัวเอง

from telethon import TelegramClient, events
import requests

# ---- ตั้งค่า (ใส่ค่าของคุณ) ----
API_ID       = 0                 # API ID (ตัวเลข)
API_HASH     = "ใส่ API HASH"     # API Hash
GROUP_ID     = -1000000000000     # chat id ของกลุ่มแจ้งผลหวย
INGEST_URL   = "https://<โดเมนของคุณ>.up.railway.app/api/ingest"
INGEST_TOKEN = "ใส่ INGEST_TOKEN ให้ตรงกับที่ตั้งใน Railway"

client = TelegramClient("lotto_listener", API_ID, API_HASH)

@client.on(events.NewMessage(chats=GROUP_ID))
async def on_message(event):
    text = (event.raw_text or "").strip()
    if not text:
        return
    try:
        r = requests.post(
            INGEST_URL,
            json={"text": text},
            headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
            timeout=10,
        )
        d = r.json()
        if d.get("matched"):
            print(f"✓ ส่งผล: {d.get('lottery')} 3บน={d.get('top3') or '-'} 2ล่าง={d.get('bottom2') or '-'}")
        else:
            print(f"… แกะไม่ได้ (ข้าม): {text[:50]}")
    except Exception as e:
        print("ส่งไม่สำเร็จ:", e)

def main():
    print("เริ่มฟังผลหวยจากกลุ่ม… (กด Ctrl+C เพื่อหยุด)")
    client.start()  # ครั้งแรกจะถามเบอร์ + รหัส OTP เพื่อสร้าง session
    print("เชื่อมต่อแล้ว รอผลจากกลุ่ม", GROUP_ID)
    client.run_until_disconnected()

if __name__ == "__main__":
    main()
