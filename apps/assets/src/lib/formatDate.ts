// ฟังก์ชันจัดรูปแบบวันเดือนปี เป็น DD/MM/YYYY (พุทธศักราช)
// รองรับค่า ISO date ("2026-05-08"), ISO datetime, Date object และ string ว่าง

function toDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  // ISO date YYYY-MM-DD → parse แบบ local เพื่อเลี่ยง timezone shift
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** วันที่ DD/MM/YYYY (พ.ศ.) */
export function formatDate(v: any): string {
  const d = toDate(v);
  if (!d) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
}

/** วันที่ + เวลา DD/MM/YYYY HH:mm:ss (พ.ศ.) */
export function formatDateTime(v: any): string {
  const d = toDate(v);
  if (!d) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
