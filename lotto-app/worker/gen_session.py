#!/usr/bin/env python3
# gen_session.py — รันครั้งเดียวที่เครื่องคุณ เพื่อสร้าง "session string"
# ของบัญชี User เอาไปใส่เป็น Variable ชื่อ TG_SESSION บน Railway
#
#   pip install telethon
#   python gen_session.py
#
# จะถาม API_ID, API_HASH แล้วให้ล็อกอินด้วยเบอร์ + รหัส OTP
# ⚠️ session string = กุญแจเข้าบัญชีคุณ อย่าแชร์ อย่า commit ขึ้น GitHub

from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = int(input("API_ID (ตัวเลข): ").strip())
api_hash = input("API_HASH: ").strip()

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\n================ SESSION STRING ================")
    print(client.session.save())
    print("===============================================")
    print("ก๊อปบรรทัดยาว ๆ ด้านบนไปใส่ Variable ชื่อ TG_SESSION บน Railway")
