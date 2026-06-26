#!/usr/bin/env python3
# telegram_listener.py — ฟังผลหวยจากกลุ่ม Telegram (บัญชี User) แล้วส่งเข้าเว็บ
# อ่านค่าทั้งหมดจาก environment variables — ไม่มีความลับในโค้ด
# รันเป็น worker service บน Railway ได้ 24 ชม.

import os
import requests
from telethon import TelegramClient, events
from telethon.sessions import StringSession

API_ID       = int(os.environ["API_ID"])
API_HASH     = os.environ["API_HASH"]
TG_SESSION   = os.environ["TG_SESSION"]            # จาก gen_session.py
GROUP_ID     = int(os.environ["GROUP_ID"])         # id กลุ่มผลหวย (มี - นำหน้า)
INGEST_URL   = os.environ["INGEST_URL"]            # https://โดเมน/api/ingest
INGEST_TOKEN = os.environ["INGEST_TOKEN"]          # ตรงกับที่ตั้งในเว็บ

client = TelegramClient(StringSession(TG_SESSION), API_ID, API_HASH)

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
            print(f"✓ {d.get('lottery')} 3บน={d.get('top3') or '-'} 2ล่าง={d.get('bottom2') or '-'}", flush=True)
        else:
            print(f"… แกะไม่ได้: {text[:50]}", flush=True)
    except Exception as e:
        print("error:", e, flush=True)

print("listener started — รอผลจากกลุ่ม", GROUP_ID, flush=True)
client.start()                 # ใช้ session string ที่ล็อกอินไว้แล้ว ไม่ถาม OTP ซ้ำ
client.run_until_disconnected()
