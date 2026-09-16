// Open a print-friendly window with a job's details so the user can save as PDF.
import { STATUS_LABEL } from "@/lib/auth-utils";

type Part = { code?: string; name?: string; qty?: string };

export type PrintableJob = {
  job_code: string;
  title: string;
  description?: string | null;
  status: string;
  created_at: string;
  completed_at?: string | null;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  work_summary?: string | null;
  parts_used?: unknown;
  image_url?: string | null;
  completed_image_url?: string | null;
  reporter_name?: string;
  assignee_name?: string;
  department_name?: string;
  machine_type_name?: string;
  machine_name?: string;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function exportJobAsPdf(job: PrintableJob) {
  const parts: Part[] = Array.isArray(job.parts_used) ? (job.parts_used as Part[]) : [];
  const partsHtml = parts.length
    ? `<table><thead><tr><th>รหัส</th><th>รายการ</th><th>จำนวน</th></tr></thead><tbody>${
        parts.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.qty)}</td></tr>`).join("")
      }</tbody></table>`
    : "";

  const row = (l: string, v: string) =>
    `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`;

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${esc(job.job_code)} — ใบแจ้งซ่อม</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Sarabun','Noto Sans Thai',-apple-system,system-ui,sans-serif; color:#111; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .sub { color:#555; font-size:13px; margin-bottom:14px; }
  table { width:100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 13px; }
  th, td { border:1px solid #ccc; padding:6px 8px; text-align:left; vertical-align: top; }
  th { background:#f3f6f4; width:160px; }
  .section { margin-top: 14px; font-weight:600; }
  .box { border:1px solid #ccc; padding:8px; min-height:30px; white-space:pre-wrap; border-radius:4px; }
  img { max-width: 240px; max-height: 240px; object-fit: contain; border:1px solid #ddd; padding:4px; }
  .imgs { display:flex; gap:12px; flex-wrap:wrap; margin-top:6px; }
  .footer { margin-top: 30px; font-size:11px; color:#777; text-align:right; }
</style></head><body>
  <h1>ใบแจ้งซ่อม <span style="color:#0a6e3a">${esc(job.job_code)}</span></h1>
  <div class="sub">${esc(job.title)} · สถานะ: ${esc(STATUS_LABEL[job.status] ?? job.status)}</div>
  <table>
    ${row("ผู้แจ้ง", job.reporter_name ?? "-")}
    ${row("แผนก", job.department_name ?? "-")}
    ${row("ประเภทเครื่อง", job.machine_type_name ?? "-")}
    ${row("เครื่องจักร", job.machine_name ?? "-")}
    ${row("ผู้ซ่อม", job.assignee_name ?? "-")}
    ${row("วันที่แจ้ง", new Date(job.created_at).toLocaleString("th-TH"))}
    ${job.completed_at ? row("วันที่ซ่อมเสร็จ", new Date(job.completed_at).toLocaleString("th-TH")) : ""}
    ${job.reviewed_at ? row("วันที่ตรวจรับ", new Date(job.reviewed_at).toLocaleString("th-TH")) : ""}
  </table>
  <div class="section">รายละเอียดปัญหา</div>
  <div class="box">${esc(job.description ?? "-")}</div>
  ${job.work_summary ? `<div class="section">รายการแก้ไข</div><div class="box">${esc(job.work_summary)}</div>` : ""}
  ${partsHtml ? `<div class="section">อะไหล่ที่เปลี่ยน</div>${partsHtml}` : ""}
  ${job.reject_reason ? `<div class="section">เหตุผลที่ปฏิเสธ</div><div class="box" style="color:#b00020">${esc(job.reject_reason)}</div>` : ""}
  ${(job.image_url || job.completed_image_url) ? `<div class="section">รูปภาพ</div><div class="imgs">${
    job.image_url ? `<div><div style="font-size:11px;color:#666">ก่อนซ่อม</div><img src="${esc(job.image_url)}"/></div>` : ""
  }${
    job.completed_image_url ? `<div><div style="font-size:11px;color:#666">หลังซ่อม</div><img src="${esc(job.completed_image_url)}"/></div>` : ""
  }</div>` : ""}
  <div class="footer">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</div>
  <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),400)});</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
