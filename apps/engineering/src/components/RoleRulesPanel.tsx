import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// Three independent mapping tables, none of which touches a CentralHub
// user's own attributes or requires per-user editing on the CentralHub
// side (README's engineering ingestion section):
//  1. Role rules (attributes -> role_code) — auth-gateway, generic, same
//     table/endpoints apps/assets already uses.
//  2. Role overrides (named user -> role_code exception) — auth-gateway,
//     generic, checked before rules by resolveRoleCode().
//  3. Department aliases (CentralHub department string -> this app's own
//     departments.id) — lives entirely in engineering-db, managed
//     straight through this app's own PostgREST, no auth-gateway route.
const APP_ID = "engineering";

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

const ROLE_OPTIONS: AppRole[] = ["admin", "leader", "department_head", "repairer", "reporter"];

export default function RoleRulesPanel() {
  return (
    <div className="space-y-4">
      <RulesSection />
      <OverridesSection />
      <DeptAliasSection />
    </div>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [roleCode, setRoleCode] = useState<AppRole>("reporter");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [jobLevel, setJobLevel] = useState("");
  const [busy, setBusy] = useState(false);

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
          department: department.trim() || null,
          position: position.trim() || null,
          jobLevel: jobLevel.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDepartment(""); setPosition(""); setJobLevel("");
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
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div>
          <Label>ตำแหน่ง (ว่าง = ทุกตำแหน่ง)</Label>
          <Input value={position} onChange={(e) => setPosition(e.target.value)} />
        </div>
        <div>
          <Label>ระดับ (ว่าง = ทุกระดับ)</Label>
          <Input value={jobLevel} onChange={(e) => setJobLevel(e.target.value)} />
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
          <Input value={centralhubDept} onChange={(e) => setCentralhubDept(e.target.value)} placeholder="เช่น Purchasing" />
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
