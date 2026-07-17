import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL, type AppRole } from "@/lib/auth-utils";

// Only reachable from AdminPage, itself only shown to a resolved role_code
// of "admin" (see App.tsx) — no separate admin check needed here.
//
// Role resolution and department resolution are two separate chains, each
// mirroring the same "bulk rule + per-user exception" shape:
//  1. Role rules (attributes -> role_code) — auth-gateway, generic, same
//     table/endpoints apps/assets already uses.
//  2. Role overrides (named user -> role_code exception) — auth-gateway,
//     generic, checked before rules by resolveRoleCode().
//  3. Department overrides (named user -> this app's own departments.id
//     exception) — lives entirely in engineering-db, checked before the
//     alias lookup by current_dept(). The direct per-user analog to #4,
//     for users whose CentralHub department attribute has no real
//     equivalent in this app's own vocabulary (or is unset/mistyped).
//  4. Department aliases (CentralHub department string -> this app's own
//     departments.id, bulk) — lives entirely in engineering-db, managed
//     straight through this app's own PostgREST, no auth-gateway route.
// Department resolution (#3/#4) is deliberately independent of role
// resolution (#1/#2) — profiles.department_id is relied on by every role
// (reporter's visible machine types, repairer's parts-requisition default,
// leader's job inbox, department_head's parts_requisitions RLS), not just
// leader, so it can't be folded into a role-specific override.
// A diagnostics section at the bottom surfaces the resolved role_code +
// department for a given user, so a mismatch between these chains is
// visible directly instead of only manifesting as a blank page in the app.
const APP_ID = "engineering";

// Wildcard sentinel — Radix Select can't use an empty string as an item
// value, so "any value for this criterion" (the existing NULL-column
// meaning, see auth-gateway's resolveRoleCode()) is represented by this
// string on the wire and translated to null right before POST.
const ANY = "__any__";

type AttributeKind = "department" | "position" | "job_level";

function useAttributeValues() {
  const [values, setValues] = useState<Record<AttributeKind, string[]>>({
    department: [],
    position: [],
    job_level: [],
  });
  useEffect(() => {
    (["department", "position", "job_level"] as const).forEach((kind) => {
      fetch(`/auth/admin/attribute-values/${kind}`, { credentials: "same-origin" })
        .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
        .then((vals) => setValues((prev) => ({ ...prev, [kind]: vals })));
    });
  }, []);
  return values;
}

type Rule = {
  id: number;
  appId: string;
  roleCode: string;
  department: string | null;
  position: string | null;
  jobLevel: string | null;
};

type Override = { id: number; appId: string; userSub: string; roleCode: string };
type KeycloakUser = { id: string; name: string; email: string };
type Dept = { id: string; name: string };
type Alias = { id: number; centralhub_department: string; department_id: string };
type DeptOverride = { id: number; user_sub: string; department_id: string };

const ROLE_OPTIONS: AppRole[] = ["admin", "leader", "department_head", "repairer", "reporter"];

export default function RoleRulesPanel() {
  return (
    <div className="space-y-4">
      <RulesSection />
      <OverridesSection />
      <DeptOverridesSection />
      <DeptAliasSection />
      <DiagnosticsSection />
    </div>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [roleCode, setRoleCode] = useState<AppRole>("reporter");
  const [department, setDepartment] = useState(ANY);
  const [position, setPosition] = useState(ANY);
  const [jobLevel, setJobLevel] = useState(ANY);
  const [busy, setBusy] = useState(false);
  const attributeValues = useAttributeValues();

  async function load() {
    const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules`, { credentials: "same-origin" });
    if (res.ok) setRules((await res.json()) as Rule[]);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
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
      if (!res.ok) throw new Error(`${res.status}`);
      setDepartment(ANY); setPosition(ANY); setJobLevel(ANY);
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
      if (!res.ok) throw new Error(`${res.status}`);
      toast.success("ลบกฎสำเร็จ");
      load();
    } catch (err) {
      toast.error(`ลบกฎไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🔗 กฎเชื่อมสิทธิ์ (แผนก/ตำแหน่ง/ระดับ → บทบาท)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ผู้ใช้ CentralHub ที่มีแผนก/ตำแหน่ง/ระดับตรงกับกฎ จะได้รับบทบาทนี้ในระบบแจ้งซ่อมโดยอัตโนมัติ
          — เว้นว่างช่องใดหมายถึง "ทุกค่า" ในช่องนั้น กฎที่เจาะจงกว่าจะชนะเมื่อมีหลายกฎตรงกัน
        </p>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">บทบาท</th>
              <th className="p-2">แผนก</th>
              <th className="p-2">ตำแหน่ง</th>
              <th className="p-2">ระดับ</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{ROLE_LABEL[r.roleCode as AppRole] ?? r.roleCode}</td>
                <td className="p-2">{r.department ?? <span className="text-muted-foreground">(ทุกแผนก)</span>}</td>
                <td className="p-2">{r.position ?? <span className="text-muted-foreground">(ทุกตำแหน่ง)</span>}</td>
                <td className="p-2">{r.jobLevel ?? <span className="text-muted-foreground">(ทุกระดับ)</span>}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => remove(r.id)}>🗑️</Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">ยังไม่มีกฎ</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end border-t pt-4">
        <div>
          <Label>บทบาท *</Label>
          <Select value={roleCode} onValueChange={(v) => setRoleCode(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>แผนก (ว่าง = ทุกแผนก)</Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกแผนก)</SelectItem>
              {attributeValues.department.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ตำแหน่ง (ว่าง = ทุกตำแหน่ง)</Label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกตำแหน่ง)</SelectItem>
              {attributeValues.position.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ระดับ (ว่าง = ทุกระดับ)</Label>
          <Select value={jobLevel} onValueChange={setJobLevel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>(ทุกระดับ)</SelectItem>
              {attributeValues.job_level.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
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

// Per-user exception on top of the rules above — the common "this one
// person is a special case" scenario. Wins outright over any matching
// rule (see resolveRoleCode() in services/auth-gateway/src/attributes.ts).
function OverridesSection() {
  // An override always wins over the attribute rules, so overriding your
  // OWN account away from "admin" has no recovery path — this very tab
  // needs the admin role_code the override would take away. auth-gateway
  // rejects it server-side either way (see adminRoleOverrides.ts); this is
  // just the same "hide the button on your own row" treatment §8 already
  // gives self-revocation, so the mistake is hard to make in the first
  // place rather than only caught after the fact.
  const { profile: me } = useAuth();
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [users, setUsers] = useState<KeycloakUser[]>([]);
  const [userSub, setUserSub] = useState("");
  const [roleCode, setRoleCode] = useState<AppRole>("reporter");
  const [busy, setBusy] = useState(false);
  const selectableUsers = users.filter((u) => u.id !== me?.id);

  async function load() {
    const [rRes, uRes] = await Promise.all([
      fetch(`/auth/admin/apps/${APP_ID}/role-overrides`, { credentials: "same-origin" }),
      fetch("/auth/admin/users", { credentials: "same-origin" }),
    ]);
    if (rRes.ok) setOverrides((await rRes.json()) as Override[]);
    if (uRes.ok) setUsers((await uRes.json()) as KeycloakUser[]);
  }
  useEffect(() => { load(); }, []);

  function userLabel(sub: string): string {
    const u = users.find((x) => x.id === sub);
    return u ? `${u.name} (${u.email})` : sub;
  }

  async function submit() {
    if (!userSub) { toast.error("กรุณาเลือกผู้ใช้งาน"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-overrides`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userSub, roleCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `${res.status}`);
      }
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
      if (!res.ok) throw new Error(`${res.status}`);
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
          กำหนดบทบาทให้ผู้ใช้เฉพาะราย — มีผลเหนือกฎด้านบนเสมอ ใช้สำหรับกรณีพิเศษที่ไม่เข้ากับกฎทั่วไป
        </p>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">ผู้ใช้งาน</th>
              <th className="p-2">บทบาท</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2">{userLabel(o.userSub)}</td>
                <td className="p-2">{ROLE_LABEL[o.roleCode as AppRole] ?? o.roleCode}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => remove(o.id)}>🗑️</Button>
                </td>
              </tr>
            ))}
            {overrides.length === 0 && (
              <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">ยังไม่มีข้อยกเว้น</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border-t pt-4">
        <div>
          <Label>ผู้ใช้งาน *</Label>
          <Select value={userSub} onValueChange={setUserSub}>
            <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้งาน" /></SelectTrigger>
            <SelectContent>
              {selectableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            ไม่รวมบัญชีของคุณเอง — ป้องกันการกำหนดสิทธิ์จนตัวเองถูกล็อกออกจากหน้านี้
          </p>
        </div>
        <div>
          <Label>บทบาท *</Label>
          <Select value={roleCode} onValueChange={(v) => setRoleCode(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={busy} className="w-fit">
          {busy ? "กำลังบันทึก..." : "➕ กำหนดสิทธิ์"}
        </Button>
      </div>
    </Card>
  );
}

// Per-user department override — restores the original app's direct
// admin-assigned profiles.department_id workflow, checked BEFORE
// department_aliases below (see current_dept() in the
// 20260717000000_dept_user_overrides migration). Independent of role_code
// assignment above; a leader still needs a role_code from
// RulesSection/OverridesSection — this only fixes which department they see.
function DeptOverridesSection() {
  const [overrides, setOverrides] = useState<DeptOverride[]>([]);
  const [users, setUsers] = useState<KeycloakUser[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [userSub, setUserSub] = useState("");
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: o }, { data: d }, uRes] = await Promise.all([
      supabase.from("department_user_overrides").select("id, user_sub, department_id").order("id"),
      supabase.from("departments").select("id, name").order("name"),
      fetch("/auth/admin/users", { credentials: "same-origin" }),
    ]);
    setOverrides((o ?? []) as DeptOverride[]);
    setDepts((d ?? []) as Dept[]);
    if (uRes.ok) setUsers((await uRes.json()) as KeycloakUser[]);
  }
  useEffect(() => { load(); }, []);

  function userLabel(sub: string): string {
    const u = users.find((x) => x.id === sub);
    return u ? `${u.name} (${u.email})` : sub;
  }

  async function submit() {
    if (!userSub || !deptId) { toast.error("กรอกข้อมูลให้ครบ"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("department_user_overrides").upsert(
        { user_sub: userSub, department_id: deptId },
        { onConflict: "user_sub" },
      );
      if (error) throw error;
      toast.success("บันทึกแล้ว");
      setUserSub(""); setDeptId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const { error } = await supabase.from("department_user_overrides").delete().eq("id", id);
    if (error) toast.error(error.message); else await load();
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🧭 กำหนดแผนกรายบุคคล (ข้อยกเว้น)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          กำหนดแผนก/สังกัดในระบบนี้ให้ผู้ใช้เฉพาะราย — มีผลเหนือ "จับคู่แผนก CentralHub" ด้านล่างเสมอ
          ใช้เมื่อแผนกของผู้ใช้ใน CentralHub ไม่มีคู่ที่ตรงกัน (ไม่มีค่าตั้งไว้ หรือสะกดไม่ตรง)
        </p>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">ผู้ใช้งาน</th>
              <th className="p-2">แผนกในระบบนี้</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2">{userLabel(o.user_sub)}</td>
                <td className="p-2">{depts.find((d) => d.id === o.department_id)?.name ?? "-"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => remove(o.id)}>🗑️</Button>
                </td>
              </tr>
            ))}
            {overrides.length === 0 && (
              <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">ยังไม่มีข้อยกเว้น</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border-t pt-4">
        <div>
          <Label>ผู้ใช้งาน *</Label>
          <Select value={userSub} onValueChange={setUserSub}>
            <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้งาน" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>แผนกในระบบนี้ *</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
            <SelectContent>
              {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={busy} className="w-fit">
          {busy ? "กำลังบันทึก..." : "➕ กำหนดแผนก"}
        </Button>
      </div>
    </Card>
  );
}

// Lives entirely in engineering-db (department_aliases table, see the
// centralhub_rls migration) — managed straight through this app's own
// PostgREST, not an auth-gateway route, since this mapping has nothing to
// do with CentralHub identity itself, only this app's own departments.
function DeptAliasSection() {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [centralhubDept, setCentralhubDept] = useState("");
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);
  const attributeValues = useAttributeValues();

  async function load() {
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.from("department_aliases").select("id, centralhub_department, department_id").order("id"),
      supabase.from("departments").select("id, name").order("name"),
    ]);
    setAliases((a ?? []) as Alias[]);
    setDepts((d ?? []) as Dept[]);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!centralhubDept.trim() || !deptId) { toast.error("กรอกข้อมูลให้ครบ"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("department_aliases").upsert(
        { centralhub_department: centralhubDept.trim(), department_id: deptId },
        { onConflict: "centralhub_department" },
      );
      if (error) throw error;
      toast.success("บันทึกแล้ว");
      setCentralhubDept(""); setDeptId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const { error } = await supabase.from("department_aliases").delete().eq("id", id);
    if (error) toast.error(error.message); else await load();
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🏢 จับคู่แผนก CentralHub ↔ แผนกในระบบแจ้งซ่อม</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ใช้กำหนดว่าค่า "แผนก" ของผู้ใช้ CentralHub แต่ละค่า สอดคล้องกับแผนก/สังกัดใดในระบบนี้
          (ใช้สำหรับ "หัวหน้าสังกัด" ดูงานเฉพาะสังกัดของตน)
        </p>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">แผนก CentralHub</th>
              <th className="p-2">แผนกในระบบนี้</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.centralhub_department}</td>
                <td className="p-2">{depts.find((d) => d.id === a.department_id)?.name ?? "-"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => remove(a.id)}>🗑️</Button>
                </td>
              </tr>
            ))}
            {aliases.length === 0 && (
              <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">ยังไม่มีการจับคู่</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border-t pt-4">
        <div>
          <Label>แผนก CentralHub *</Label>
          <Select value={centralhubDept} onValueChange={setCentralhubDept}>
            <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
            <SelectContent>
              {attributeValues.department.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>แผนกในระบบนี้ *</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
            <SelectContent>
              {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={busy} className="w-fit">
          {busy ? "กำลังบันทึก..." : "➕ จับคู่"}
        </Button>
      </div>
    </Card>
  );
}

// Resolved-identity diagnostics — surfaces exactly the failure mode this app
// used to hide: role_code and department are resolved by independent
// mechanisms (auth-gateway rules/overrides vs. this app's own department
// overrides/aliases); a mismatch used to manifest only as LeaderPage.tsx's
// silent blank page. Lets an admin check what a user WOULD get before they
// even log in.
function DiagnosticsSection() {
  const [users, setUsers] = useState<KeycloakUser[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [deptOverrides, setDeptOverrides] = useState<DeptOverride[]>([]);
  const [userSub, setUserSub] = useState("");
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/auth/admin/users", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : [])),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("department_aliases").select("id, centralhub_department, department_id"),
      supabase.from("department_user_overrides").select("id, user_sub, department_id"),
    ]).then(([u, { data: d }, { data: a }, { data: o }]) => {
      setUsers(u as KeycloakUser[]);
      setDepts((d ?? []) as Dept[]);
      setAliases((a ?? []) as Alias[]);
      setDeptOverrides((o ?? []) as DeptOverride[]);
    });
  }, []);

  async function check() {
    if (!userSub) { toast.error("กรุณาเลือกผู้ใช้งาน"); return; }
    setBusy(true);
    try {
      const [roleRes, attrRes] = await Promise.all([
        fetch(`/auth/admin/apps/${APP_ID}/resolve-role/${userSub}`, { credentials: "same-origin" }),
        fetch(`/auth/admin/users/${userSub}/attributes`, { credentials: "same-origin" }),
      ]);
      const role = roleRes.ok ? (await roleRes.json() as { roleCode: string | null }) : { roleCode: null };
      const attrs = attrRes.ok ? (await attrRes.json() as { department: string | null } | null) : null;
      setRoleCode(role.roleCode);
      setDeptName(attrs?.department ?? null);
      setChecked(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const override = deptOverrides.find((o) => o.user_sub === userSub);
  const alias = !override && deptName ? aliases.find((a) => a.centralhub_department === deptName) : undefined;
  const resolvedDeptId = override?.department_id ?? alias?.department_id ?? null;
  const resolvedDeptName = resolvedDeptId ? depts.find((d) => d.id === resolvedDeptId)?.name ?? null : null;
  const source = override ? "ข้อยกเว้นรายบุคคล" : alias ? "จับคู่แผนก (ทั่วไป)" : "ไม่พบ";
  const needsDept = roleCode === "leader" || roleCode === "department_head";
  const broken = needsDept && !resolvedDeptId;

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🔍 ตรวจสอบสิทธิ์ที่แปลผลแล้ว (การวินิจฉัย)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ตรวจสอบว่าผู้ใช้รายหนึ่งจะได้รับบทบาทและแผนกใดจริง ๆ — ช่วยพบข้อผิดพลาดก่อนหน้าจอ "หัวหน้าสังกัด" ว่างเปล่า
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <Label>ผู้ใช้งาน</Label>
          <Select value={userSub} onValueChange={(v) => { setUserSub(v); setChecked(false); }}>
            <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้งาน" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={check} disabled={busy} className="w-fit">
          {busy ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
        </Button>
      </div>
      {checked && (
        <div className="border rounded-lg p-4 text-sm space-y-1">
          <div>บทบาทที่แปลผล (role_code): <b>{roleCode ?? "(ไม่พบ)"}</b></div>
          <div>แผนก CentralHub (dept_name จาก token): <b>{deptName ?? "(ไม่มีค่า)"}</b></div>
          <div>แหล่งที่มาของแผนกที่แปลผล: <b>{source}</b></div>
          <div>แผนกในระบบนี้ที่แปลผลได้: <b>{resolvedDeptName ?? "(ไม่พบ)"}</b></div>
          {broken && (
            <div className="text-destructive font-semibold pt-2">
              ⚠️ บทบาทนี้ต้องมีแผนก แต่แปลผลแผนกไม่สำเร็จ — หน้าหัวหน้าสังกัดของผู้ใช้รายนี้จะว่างเปล่า
              กรุณาตั้ง "กำหนดแผนกรายบุคคล" หรือ "จับคู่แผนก CentralHub" ด้านบน
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
