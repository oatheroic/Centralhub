## แผนการทำงาน 4 ข้อ

### ข้อ 1 — เสียงเตือน + Popup งานใหม่
- ใช้ Supabase Realtime subscribe ตาราง `repair_jobs` (event: INSERT/UPDATE) ใน 3 หน้า:
  - **หัวหน้าสังกัด** (`leader.tsx`) — แจ้งเมื่อมีงานใหม่ `status = pending_assign` ของแผนกตัวเอง
  - **ผู้ซ่อม** (`repairer.tsx`) — แจ้งเมื่อ `assigned_to = ตัวเอง`
  - **ผู้แจ้ง** (`reporter.tsx`) — แจ้งเมื่องานของตัวเองเปลี่ยนเป็น `awaiting_review`
- เสียง: ใช้ Web Audio API (beep สั้น ๆ) ไม่ต้องเพิ่มไฟล์เสียง
- Popup: ใช้ Dialog + sonner toast พร้อมปุ่ม "ดูรายละเอียด"

### ข้อ 2 — Single-session Login
- เพิ่มคอลัมน์ `active_session_id text` ใน `profiles`
- ตอน login สำเร็จ → เขียน `session.access_token` (หรือ uuid ใหม่) ลง `active_session_id` ของ user นั้น
- ทุกหน้าที่ใช้งาน เช็ค interval ทุก 15 วิ ผ่าน server fn ว่า `active_session_id` ตรงกับ token ของเครื่องตัวเองหรือไม่
- ถ้าไม่ตรง → บังคับ `signOut()` + แสดงข้อความ "บัญชีนี้ถูก login จากเครื่องอื่น"

### ข้อ 3 — บันทึก Google Sheet
- เชื่อม Connector **Google Sheets** (จะเรียก `standard_connectors--connect`)
- ผู้ใช้ต้องแชร์ sheet `1DixshqsyOAjZapDuO7li8BHiVMm7UPT3cyBXwvjQyqg` ให้บัญชี Google ที่ใช้เชื่อม connector (สิทธิ์ Editor)
- Logic เขียน sheet (จัดการใน server function):
  - **ผู้แจ้งสร้างงาน** → append แถวใหม่ใส่คอลัมน์ A–I (รหัสงาน, วันที่แจ้ง, ผู้แจ้ง, แผนก, หัวหน้าสังกัด, ผู้ซ่อม, เครื่องจักร, อาการ) — บันทึกครั้งเดียว
  - **ช่างซ่อมเสร็จ + ผู้แจ้งตรวจรับ** → ค้นหาแถว job_code นั้นแล้วอัพเดต C (วันที่ตรวจรับ), J (รายการแก้ไข), K–L (อะไหล่)
  - คอลัมน์ตามภาพ: A รหัสงาน · B วันที่แจ้ง · C วันที่ตรวจรับ · D ผู้แจ้ง · E แผนกผู้แจ้ง · F หัวหน้าสังกัด · G ผู้ซ่อม · H เครื่องจักร · I อาการ · J รายการแก้ไข · K รหัสอะไหล่ · L รายการอะไหล่
- เก็บ `sheet_row_index` ลง `repair_jobs` เพื่อ update แถวเดิมโดยไม่ซ้ำ

### ข้อ 4 — ฐานข้อมูลเชื่อมต่อกัน
- ระบบใช้ Supabase อยู่แล้ว — ข้อมูลถูก sync ทุกเครื่อง centralize
- เพิ่ม Realtime publication ให้ `repair_jobs` เพื่อให้ทุกหน้าเห็นการเปลี่ยนแปลงทันที (รองรับข้อ 1 ด้วย)
- ไม่ต้องมี local cache แยก

### สิ่งที่ต้องการจากผู้ใช้ก่อนเริ่ม
1. เชื่อม Google Sheets connector (จะเปิดหน้าต่างให้ login Google)
2. แชร์สิทธิ์ Editor ของ sheet เป้าหมายให้บัญชี Google ที่เชื่อม

ยืนยันให้ดำเนินการได้เลยไหมครับ?
