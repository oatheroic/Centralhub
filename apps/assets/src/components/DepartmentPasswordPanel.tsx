import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Row = { department_name: string; has_password: boolean };

export default function DepartmentPasswordPanel() {
  const me = useCurrentRoleInfo();
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adminPwd, setAdminPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [opts, pws] = await Promise.all([
      supabase.from("dropdown_options").select("value").eq("category", "department").order("sort_order"),
      supabase.from("department_passwords").select("department_name,has_password" as any),
    ]);
    const map = new Map<string, boolean>();
    (opts.data ?? []).forEach((o: any) => map.set(o.value, false));
    (pws.data ?? []).forEach((p: any) => map.set(p.department_name, !!p.has_password));
    setRows(
      Array.from(map.entries())
        .map(([department_name, has_password]) => ({ department_name, has_password }))
        .sort((a, b) => a.department_name.localeCompare(b.department_name, "th")),
    );
  }

  useEffect(() => { load(); }, []);

  if (!me?.is_admin) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้
      </div>
    );
  }

  function openDialog(dept: string) {
    setEditing(dept);
    setAdminPwd(""); setNewPwd(""); setConfirmPwd("");
  }

  async function submit() {
    if (!editing) return;
    if (!adminPwd) return toast.error("กรุณากรอกรหัสผ่านผู้ดูแล");
    if (newPwd.length < 4) return toast.error("รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัวอักษร");
    if (newPwd !== confirmPwd) return toast.error("รหัสผ่านใหม่ไม่ตรงกัน");
    setSaving(true);
    const { error } = await supabase.rpc("set_department_password", {
      _admin_code: me!.role_code,
      _admin_password: adminPwd,
      _department: editing,
      _new_password: newPwd,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`ตั้งรหัสแผนก "${editing}" เรียบร้อย`);
    setEditing(null);
    load();
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🏢 จัดการรหัสผ่านแผนก (สำหรับรับทรัพย์สิน Step 3.1)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          แต่ละแผนกต้องตั้งรหัสผ่านก่อน Role ของแผนกถึงจะเข้าใช้งานหน้า "รับทรัพย์สิน" ได้
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.department_name}
            className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <div className="font-bold">{r.department_name}</div>
              <div className="text-xs mt-0.5">
                {r.has_password
                  ? <span className="text-emerald-600">✓ ตั้งรหัสแล้ว</span>
                  : <span className="text-red-600">⚠️ ยังไม่ได้ตั้งรหัส</span>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => openDialog(r.department_name)}>
              {r.has_password ? "เปลี่ยนรหัส" : "ตั้งรหัส"}
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">ยังไม่มีแผนกในระบบ</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งรหัสผ่านแผนก: {editing}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>รหัสผ่านของคุณ ({me.role_code}) *</Label>
              <Input type="password" value={adminPwd}
                onChange={(e) => setAdminPwd(e.target.value)}
                placeholder="ยืนยันตัวตนผู้ดูแล" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label>รหัสผ่านแผนกใหม่ *</Label>
              <Input type="password" value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="อย่างน้อย 4 ตัวอักษร" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>ยืนยันรหัสผ่านแผนกใหม่ *</Label>
              <Input type="password" value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
