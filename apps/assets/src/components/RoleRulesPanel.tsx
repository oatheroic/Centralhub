import { useEffect, useState } from "react";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

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

const APP_ID = "assets";

export default function RoleRulesPanel() {
  const me = useCurrentRoleInfo();
  const [rules, setRules] = useState<Rule[]>([]);
  const [roleCode, setRoleCode] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [jobLevel, setJobLevel] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules`, { credentials: "same-origin" });
    if (res.ok) setRules((await res.json()) as Rule[]);
  }
  useEffect(() => {
    load();
  }, []);

  if (!me?.is_admin) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้
      </div>
    );
  }

  async function submit() {
    if (!roleCode.trim()) {
      toast.error("กรุณากรอกรหัสผู้ใช้ (role_code)");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/auth/admin/apps/${APP_ID}/role-rules`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleCode: roleCode.trim().toUpperCase(),
          department: department.trim() || null,
          position: position.trim() || null,
          jobLevel: jobLevel.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setRoleCode("");
      setDepartment("");
      setPosition("");
      setJobLevel("");
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
                <td className="p-2">{r.department ?? <span className="text-muted-foreground">(ทุกแผนก)</span>}</td>
                <td className="p-2">{r.position ?? <span className="text-muted-foreground">(ทุกตำแหน่ง)</span>}</td>
                <td className="p-2">{r.jobLevel ?? <span className="text-muted-foreground">(ทุกระดับ)</span>}</td>
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
          <Input value={roleCode} onChange={(e) => setRoleCode(e.target.value)} placeholder="เช่น PUR01" />
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
