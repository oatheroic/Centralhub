// Helpers shared between client and server. Pure, no imports.
export const ADMIN_BOOTSTRAP_CODE = "3472q";

export function codeToEmail(code: string): string {
  return `${code.toLowerCase().trim()}@bigone.local`;
}

export function codeToPassword(code: string): string {
  // Stable derived password — paired with synthetic email above.
  return `bgone_${code.toLowerCase().trim()}_pw_42`;
}

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
