import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ADMIN_BOOTSTRAP_CODE,
  codeToEmail,
  codeToPassword,
  type AppRole,
} from "@/lib/auth-utils";

async function requireAdmin(token: string): Promise<string> {
  if (!token) throw new Error("ต้องเข้าสู่ระบบ");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error("token ไม่ถูกต้อง");
  const uid = data.user.id;
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("ต้องเป็น admin");
  return uid;
}

// Bootstrap admin if it doesn't exist. Called when login with code 3472q fails.
export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const code = ADMIN_BOOTSTRAP_CODE;
  const email = codeToEmail(code);
  const password = codeToPassword(code);

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing) return { ok: true, created: false };

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "ไม่สามารถสร้าง admin ได้");
  }
  const uid = created.user.id;
  await supabaseAdmin
    .from("profiles")
    .insert({ id: uid, code, full_name: "ผู้ดูแลระบบ" });
  await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
  return { ok: true, created: true };
});

const createUserSchema = z.object({
  access_token: z.string().min(1),
  code: z.string().trim().min(1).max(40),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "leader", "repairer", "reporter", "department_head"]),
  department_id: z.string().uuid().nullable().optional(),
  allowed_repair_dept_ids: z.array(z.string().uuid()).max(20).optional(),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.access_token);

    if (data.code.toLowerCase() === ADMIN_BOOTSTRAP_CODE) {
      throw new Error("รหัสนี้สงวนสำหรับระบบ");
    }

    const { data: dup } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("code", data.code)
      .maybeSingle();
    if (dup) throw new Error("รหัสผู้ใช้งานนี้มีอยู่แล้ว");

    const email = codeToEmail(data.code);
    const password = codeToPassword(data.code);
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "สร้างผู้ใช้ไม่สำเร็จ");
    }
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").insert({
      id: uid,
      code: data.code,
      full_name: data.full_name,
      department_id: data.department_id ?? null,
      allowed_repair_dept_ids: data.allowed_repair_dept_ids ?? [],
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: data.role as AppRole });
    return { id: uid };
  });

const updateUserSchema = z.object({
  access_token: z.string().min(1),
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "leader", "repairer", "reporter", "department_head"]),
  department_id: z.string().uuid().nullable().optional(),
  allowed_repair_dept_ids: z.array(z.string().uuid()).max(20).optional(),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateUserSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.access_token);
    if (data.code.toLowerCase() === ADMIN_BOOTSTRAP_CODE) {
      throw new Error("รหัสนี้สงวนสำหรับระบบ");
    }
    // Check duplicate code on a different user
    const { data: dup } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("code", data.code)
      .neq("id", data.id)
      .maybeSingle();
    if (dup) throw new Error("รหัสผู้ใช้งานนี้มีอยู่แล้ว");

    // Update auth email/password to keep code-based login working
    const email = codeToEmail(data.code);
    const password = codeToPassword(data.code);
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.id,
      { email, password, email_confirm: true },
    );
    if (authErr) throw new Error(authErr.message);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        code: data.code,
        full_name: data.full_name,
        department_id: data.department_id ?? null,
        allowed_repair_dept_ids: data.allowed_repair_dept_ids ?? [],
      })
      .eq("id", data.id);
    if (profErr) throw new Error(profErr.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.id, role: data.role as AppRole });

    return { ok: true };
  });

const deleteUserSchema = z.object({
  access_token: z.string().min(1),
  id: z.string().uuid(),
});
export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteUserSchema.parse(d))
  .handler(async ({ data }) => {
    const callerId = await requireAdmin(data.access_token);
    if (data.id === callerId) throw new Error("ลบบัญชีตนเองไม่ได้");

    // Remove dependent rows first (no FK cascade configured)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
