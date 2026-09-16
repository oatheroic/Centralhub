import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SHEET_ID = "1DixshqsyOAjZapDuO7li8BHiVMm7UPT3cyBXwvjQyqg";
const SHEET_TAB = "T1";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function thaiDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  const yy = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mn}`;
}

function nameWithCode(p?: { full_name?: string; code?: string } | null): string {
  if (!p) return "";
  return `${p.full_name ?? ""}${p.code ? ` (${p.code})` : ""}`;
}

async function gwFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lk = process.env.LOVABLE_API_KEY;
  const ck = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY is not configured");
  if (!ck) throw new Error("GOOGLE_SHEETS_API_KEY is not configured");
  return fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lk}`,
      "X-Connection-Api-Key": ck,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export const syncJobToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: job, error: jErr } = await supabaseAdmin
      .from("repair_jobs")
      .select("*")
      .eq("id", data.job_id)
      .maybeSingle();
    if (jErr || !job) throw new Error(jErr?.message ?? "ไม่พบใบงาน");

    const ids = [job.reporter_id, job.assigned_to, job.assigned_by].filter(Boolean) as string[];
    const [{ data: profs }, { data: dept }, { data: mc }] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("profiles").select("id, full_name, code, department_id").in("id", ids)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; code: string; department_id: string | null }> }),
      job.department_id
        ? supabaseAdmin.from("departments").select("name").eq("id", job.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
      job.machine_id
        ? supabaseAdmin.from("machines").select("name, code").eq("id", job.machine_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
    const reporter = pmap.get(job.reporter_id);
    const assignee = job.assigned_to ? pmap.get(job.assigned_to) : null;
    const assignedBy = job.assigned_by ? pmap.get(job.assigned_by) : null;

    let reporterDeptName = "";
    if (reporter?.department_id) {
      const { data: rd } = await supabaseAdmin
        .from("departments")
        .select("name")
        .eq("id", reporter.department_id)
        .maybeSingle();
      reporterDeptName = (rd as { name?: string } | null)?.name ?? "";
    }

    const machineLabel = mc
      ? `${(mc as { name?: string }).name ?? ""}${(mc as { code?: string | null }).code ? ` (${(mc as { code?: string }).code})` : ""}`
      : "";

    const parts = (Array.isArray(job.parts_used) ? (job.parts_used as Array<{ code?: string; name?: string; qty?: string }>) : [])
      .map((p) => [p.code ?? "", p.name ?? "", p.qty ?? ""])
      .filter((p) => p.some((v) => String(v).trim().length > 0));

    const base = [
      job.job_code ?? "",
      thaiDate(job.created_at),
      thaiDate(job.reviewed_at),
      nameWithCode(reporter),
      reporterDeptName,
      nameWithCode(assignedBy),
      nameWithCode(assignee),
      machineLabel,
      job.description ?? "",
      job.work_summary ?? "",
    ];

    // One row per requisitioned part: A-J job info (first row only), K/L/M = code/name/qty
    const values: string[][] =
      parts.length === 0
        ? [[...base, "", "", ""]]
        : parts.map((p, i) => (i === 0 ? [...base, ...p] : ["", "", "", "", "", "", "", "", "", "", ...p]));

    const readColumnA = async (): Promise<string[]> => {
      const colRes = await gwFetch(
        `/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!A:A?majorDimension=COLUMNS`,
      );
      if (!colRes.ok) {
        const text = await colRes.text();
        throw new Error(`Sheets read failed [${colRes.status}]: ${text}`);
      }
      const colJson = (await colRes.json()) as { values?: string[][] };
      return colJson.values?.[0] ?? [];
    };

    const writeBlock = async (startRow: number, rows: string[][]) => {
      const range = `${SHEET_TAB}!A${startRow}:M${startRow + rows.length - 1}`;
      const res = await gwFetch(
        `/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
        { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values: rows }) },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sheets write failed [${res.status}]: ${text}`);
      }
    };

    const colA = await readColumnA();

    if (job.sheet_row_index) {
      const start = job.sheet_row_index;
      // Rows following the block must be free (blank in column A) to expand safely.
      let free = true;
      for (let i = 1; i < values.length; i++) {
        const cell = colA[start + i - 1];
        if (cell && String(cell).trim().length > 0) { free = false; break; }
      }
      if (free) {
        await writeBlock(start, values);
        return { ok: true, row: start };
      }
      // Not enough space: clear old row and relocate the block to the bottom.
      await writeBlock(start, [Array(13).fill("")]);
      const freshA = await readColumnA();
      const newStart = freshA.length + 1;
      await writeBlock(newStart, values);
      await supabaseAdmin.from("repair_jobs").update({ sheet_row_index: newStart }).eq("id", job.id);
      return { ok: true, row: newStart };
    }

    const rowIdx = colA.length + 1;
    await writeBlock(rowIdx, values);
    await supabaseAdmin
      .from("repair_jobs")
      .update({ sheet_row_index: rowIdx })
      .eq("id", job.id);
    return { ok: true, row: rowIdx };
  });

