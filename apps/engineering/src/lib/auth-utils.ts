// Shared UI vocabulary. Identity/login is CentralHub's job (§6/§7 of the
// README) — this app no longer has its own code-based Supabase Auth login,
// so the synthetic-email/derived-password helpers that used to live here
// are gone.
export type AppRole = "admin" | "leader" | "repairer" | "reporter" | "department_head";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "ADMIN",
  leader: "หัวหน้าสังกัด",
  department_head: "หัวหน้าแผนก",
  repairer: "ผู้ซ่อม",
  reporter: "ผู้แจ้ง",
};

export const LEADER_DEPT_NAMES = ["ช่างผลิต", "ช่างบรรจุ", "ช่างทั่วไป"] as const;

export const STATUS_LABEL: Record<string, string> = {
  pending_assign: "รอจ่ายงาน",
  in_progress: "กำลังซ่อม",
  waiting_parts: "รออะไหล่",
  external: "ส่งซ่อมภายนอก",
  awaiting_review: "รอตรวจรับ",
  completed: "เสร็จสิ้น",
};
