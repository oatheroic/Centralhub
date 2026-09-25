import { useEffect, useState } from "react";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase, getCurrentUserSub } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Wildcard sentinel — Radix Select can't use an empty string as an item
// value, so "any value for this criterion" (the existing NULL-column
// meaning, see auth-gateway's resolveRoleCode()) is represented by this
// string on the wire and translated to null right before POST.
const ANY = "__any__";

type AttributeKind = "department" | "position" | "job_level";

// Manages this app's rules translating CentralHub's generic corporate
// attributes (department/position/job level, set in apps/admin's Users
// panel) into this app's own role_code vocabulary — used by App.tsx to
// auto-log a CentralHub user straight into the matching workflow role
// instead of showing the manual role-code picker below. Calls
// auth-gateway directly (not PostgREST/assets-db — this mapping lives in
// CentralHub's own Postgres, not this app's), same-origin via the gateway.
type Rule = {
  id: number;
  appId: string;
  roleCode: string;
  department: string | null;
  position: string | null;
  jobLevel: string | null;
};

type RoleOption = { role_code: string; display_name: string; is_admin: boolean };

const APP_ID = "assets";

// auth-gateway answers a refused write with { error: "..." } explaining why
// — "admin is override-only", "cannot delete your own role override", and
// so on. Surfacing a bare status code instead turns every one of those into
// an unexplained "400", which is exactly the case these guards exist to
// make understandable.
async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${res.status}`;
}

type Override = { id: number; appId: string; userSub: string; roleCode: string };
type KeycloakUser = { id: string; name: string; email: string };

// Mirrors apps/engineering's panel: bulk rules first, then the per-user
// exceptions that win over them. Both call the same generic auth-gateway
// endpoints — only this app's role vocabulary differs (role_assignments
// rows here, an enum there).
export default function RoleRulesPanel() {
  const me = useCurrentRoleInfo();
  if (!me?.is_admin) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <RulesSection />
      <OverridesSection />
    </div>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [roleCode, setRoleCode] = useState("");
  const [department, setDepartment] = useState(ANY);
  const [position, setPosition] = useState(ANY);
  const [jobLevel, setJobLevel] = useState(ANY);
  const [busy, setBusy] = useState(false);
  const [attributeValues, setAttributeValues] = useState<Record<AttributeKind, string[]>>({
    department: [],
    position: [],
    job_level: [],
  });
  // This app's own local role_code vocabulary (ADM01, PUR01, ...) — lives in
  // assets-db's role_assignments table, not CentralHub's Postgres, so it's
  // fetched via this app's own PostgREST client rather than an auth-gateway
  // route (same table PasswordManagerPanel already manages).
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);

  async function load() {
    const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules`, {
      credentials: "same-origin",
    });
    if (res.ok) setRules((await res.json()) as Rule[]);
  }
  useEffect(() => {
    load();
    (["department", "position", "job_level"] as const).forEach((kind) => {
      fetch(`/auth/admin/attribute-values/${kind}?app=${APP_ID}`, { credentials: "same-origin" })
        .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
        .then((values) => setAttributeValues((prev) => ({ ...prev, [kind]: values })));
    });
    // is_admin rows are filtered out below, not just hidden: admin is
    // grantable per user (a role override) but never by attribute match —
    // a rule is a bulk grant over whoever currently matches a
    // department/position/job-level combination, so "position = Manager ->
    // ADM01" would silently promote every future Manager. auth-gateway
    // rejects such a rule outright (400), so offering it here could only
    // produce a failed submit.
    supabase
      .from("role_assignments")
      .select("role_code,display_name,is_admin")
      .eq("is_active", true)
      .order("role_code")
      .then(({ data }) =>
        setRoleOptions(((data as RoleOption[]) ?? []).filter((r) => !r.is_admin)),
      );
  }, []);

  async function submit() {
    if (!roleCode) {
      toast.error("กรุณาเลือกรหัสผู้ใช้ (role_code)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleCode,
          department: department === ANY ? null : department,
          position: position === ANY ? null : position,
          jobLevel: jobLevel === ANY ? null : jobLevel,
        }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setRoleCode("");
      setDepartment(ANY);
      setPosition(ANY);
      setJobLevel(ANY);
      toast.success("เพิ่มกฎสำเร็จ");
      load();
    } catch (err) {
      toast.error(`เพิ่มกฎไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await errorText(res));
      toast.success("ลบกฎสำเร็จ");
      load();
    } catch (err) {
      toast.error(`ลบกฎไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🔗 กฎเชื่อมสิทธิ์ (Identity → Role code)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ผู้ใช้ CentralHub ที่มีแผนก/ตำแหน่ง/ระดับตรงกับกฎ จะเข้าสู่ระบบด้วยรหัสนี้โดยอัตโนมัติ
          โดยไม่ต้องกรอกรหัสผ่านของหน้านี้ — เว้นว่างช่องใดหมายถึง "ทุกค่า" ในช่องนั้น
        </p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Role code</th>
              <th className="p-2">แผนก</th>
              <th className="p-2">ตำแหน่ง</th>
              <th className="p-2">ระดับ</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">{r.roleCode}</td>
                <td className="p-2">
                  {r.department ?? <span className="text-muted-foreground">(ทุกแผนก)</span>}
                </td>
                <td className="p-2">
                  {r.position ?? <span className="text-muted-foreground">(ทุกตำแหน่ง)</span>}
                </td>
                <td className="p-2">
                  {r.jobLevel ?? <span className="text-muted-foreground">(ทุกระดับ)</span>}
                </td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => remove(r.id)}>
                    🗑️
                  </Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  ยังไม่มีกฎ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end border-t pt-4">
        <div>
          <Label>Role code *</Label>
          <Select value={roleCode} onValueChange={setRoleCode}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกรหัสผู้ใช้" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r.role_code} value={r.role_code}>
                  {r.role_code} — {r.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>แผนก (ว่าง = ทุกแผนก)</Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกแผนก)</SelectItem>
              {attributeValues.department.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ตำแหน่ง (ว่าง = ทุกตำแหน่ง)</Label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกตำแหน่ง)</SelectItem>
              {attributeValues.position.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ระดับ (ว่าง = ทุกระดับ)</Label>
          <Select value={jobLevel} onValueChange={setJobLevel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกระดับ)</SelectItem>
              {attributeValues.job_level.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={busy} className="col-span-2 sm:col-span-4 w-fit">
          {busy ? "กำลังบันทึก..." : "➕ เพิ่มกฎ"}
        </Button>
      </div>
    </Card>
  );
}

// Per-user role exceptions — the direct counterpart of apps/engineering's
// OverridesSection, against the same generic auth-gateway endpoints.
//
// This is the only way to make someone an admin of this app. An attribute
// rule above cannot grant ADM01 (or any other is_admin role_code):
// auth-gateway refuses that write outright, because a rule is a bulk grant
// over whoever currently matches a department/position/job-level
// combination, and "position = Manager -> ADM01" would silently promote
// every future Manager. Here the grant is named, single-subject and
// audited.
function OverridesSection() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [users, setUsers] = useState<KeycloakUser[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [mySub, setMySub] = useState<string | null>(null);
  const [userSub, setUserSub] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Excludes the caller's own account. Overriding yourself has no recovery
  // path through this panel — it needs the admin role_code the override
  // would take away — so auth-gateway refuses it server-side; hiding the
  // option keeps the mistake from being made in the first place, the same
  // treatment §8 gives self-revocation.
  const selectableUsers = users.filter((u) => u.id !== mySub);

  async function load() {
    const [oRes, uRes] = await Promise.all([
      fetch(`/auth/admin/apps/${APP_ID}/role-overrides`, { credentials: "same-origin" }),
      fetch(`/auth/admin/users?app=${APP_ID}`, { credentials: "same-origin" }),
    ]);
    if (oRes.ok) setOverrides((await oRes.json()) as Override[]);
    if (uRes.ok) setUsers((await uRes.json()) as KeycloakUser[]);
  }

  useEffect(() => {
    load();
    getCurrentUserSub().then(setMySub);
    // Unlike the rules picker above, is_admin roles are deliberately kept:
    // granting ADM01 per user is exactly what this section is for.
    supabase
      .from("role_assignments")
      .select("role_code,display_name,is_admin")
      .eq("is_active", true)
      .order("role_code")
      .then(({ data }) => setRoleOptions((data as RoleOption[]) ?? []));
  }, []);

  function userLabel(sub: string): string {
    const u = users.find((x) => x.id === sub);
    return u ? `${u.name} (${u.email})` : sub;
  }

  async function submit() {
    if (!userSub) {
      toast.error("กรุณาเลือกผู้ใช้งาน");
      return;
    }
    if (!roleCode) {
      toast.error("กรุณาเลือกรหัสผู้ใช้ (role_code)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-overrides`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userSub, roleCode }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setUserSub("");
      setRoleCode("");
      toast.success("บันทึกข้อยกเว้นสำเร็จ");
      load();
    } catch (err) {
      toast.error(`บันทึกไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-overrides/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await errorText(res));
      toast.success("ลบข้อยกเว้นสำเร็จ");
      load();
    } catch (err) {
      toast.error(`ลบไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">👤 กำหนดสิทธิ์รายบุคคล (ข้อยกเว้น)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          กำหนด role code ให้ผู้ใช้เฉพาะราย — มีผลเหนือกฎด้านบนเสมอ
          และเป็นวิธีเดียวที่ใช้มอบสิทธิ์ผู้ดูแลระบบ (ADM01) ให้ผู้ใช้รายบุคคลได้
        </p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">ผู้ใช้งาน</th>
              <th className="p-2">Role code</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => {
              const role = roleOptions.find((r) => r.role_code === o.roleCode);
              return (
                <tr key={o.id} className="border-t">
                  <td className="p-2">{userLabel(o.userSub)}</td>
                  <td className="p-2 font-mono">
                    {o.roleCode}
                    {role && (
                      <span className="font-sans text-muted-foreground">
                        {" "}
                        — {role.display_name}
                      </span>
                    )}
                    {role?.is_admin && <span className="ml-2 text-xs text-primary">🔑 Admin</span>}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="destructive" onClick={() => remove(o.id)}>
                      🗑️
                    </Button>
                  </td>
                </tr>
              );
            })}
            {overrides.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-muted-foreground">
                  ยังไม่มีข้อยกเว้น
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The hint below sits outside the grid on purpose: inside the user
          cell it made that column taller, and `items-end` then lifted its
          Select a line above the Role code one instead of keeping the two
          pickers on the same row. */}
      <div className="border-t pt-4 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label>ผู้ใช้งาน *</Label>
            <Select value={userSub} onValueChange={setUserSub}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกผู้ใช้งาน" />
              </SelectTrigger>
              <SelectContent>
                {selectableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role code *</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกรหัสผู้ใช้" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r.role_code} value={r.role_code}>
                    {r.role_code} — {r.display_name}
                    {r.is_admin ? " 🔑" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={busy} className="w-fit">
            {busy ? "กำลังบันทึก..." : "➕ กำหนดสิทธิ์"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ไม่รวมบัญชีของคุณเอง และแสดงเฉพาะผู้ใช้ที่มีสิทธิ์เข้าถึงแอปนี้แล้ว
        </p>
      </div>
    </Card>
  );
}
