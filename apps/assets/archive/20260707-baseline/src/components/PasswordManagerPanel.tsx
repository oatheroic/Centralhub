import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Row = {
  role_code: string;
  display_name: string;
  step_access: number[];
  is_admin: boolean;
  is_active: boolean;
};

const STEPS = [
  { v: 1, label: "1 ผู้นำเสนอ" },
  { v: 2, label: "2 ผู้อนุมัติ" },
  { v: 3, label: "3 ตั้งรหัสทรัพย์สิน" },
  { v: 4, label: "4 จัดซื้อ" },
  { v: 5, label: "5 ตัดทรัพย์สิน" },
  { v: 6, label: "6 รับ&จ่าย" },
  { v: 7, label: "7 โอนทรัพย์สิน" },
];

export default function PasswordManagerPanel() {
  const me = useCurrentRoleInfo();
  const [users, setUsers] = useState<Row[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [pwdTarget, setPwdTarget] = useState<Row | null>(null);
  const [delTarget, setDelTarget] = useState<Row | null>(null);

  async function load() {
    const { data } = await supabase
      .from("role_assignments")
      .select("role_code,display_name,step_access,is_admin,is_active")
      .order("is_active", { ascending: false })
      .order("role_code");
    setUsers((data as Row[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  if (!me?.is_admin) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้
      </div>
    );
  }

  const visible = users.filter((u) => showInactive || u.is_active);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">⚙️ จัดการผู้ใช้งาน</h2>
          <p className="text-sm text-muted-foreground mt-1">
            เพิ่ม / แก้ไข / เปลี่ยนรหัสผ่าน / ปิดใช้งาน / ลบ พนักงาน
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
            แสดงที่ปิดใช้งานแล้ว
          </label>
          <Button onClick={() => setOpenCreate(true)}>➕ เพิ่มพนักงาน</Button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">รหัส</th>
              <th className="p-2">ชื่อ (display_name)</th>
              <th className="p-2">สิทธิ์ขั้นตอน</th>
              <th className="p-2 text-center">Admin</th>
              <th className="p-2 text-center">สถานะ</th>
              <th className="p-2 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.role_code} className={`border-t ${!u.is_active ? "bg-muted/20 text-muted-foreground" : ""}`}>
                <td className="p-2 font-mono">{u.role_code}</td>
                <td className="p-2 font-medium">{u.display_name}</td>
                <td className="p-2 text-xs">{(u.step_access ?? []).join(", ") || "-"}</td>
                <td className="p-2 text-center">{u.is_admin ? "✅" : ""}</td>
                <td className="p-2 text-center">
                  {u.is_active
                    ? <span className="text-green-700 font-semibold">ใช้งาน</span>
                    : <span className="text-gray-500">ปิดใช้งาน</span>}
                </td>
                <td className="p-2 text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => setEditTarget(u)}>✏️ แก้ไข</Button>
                  <Button size="sm" variant="outline" onClick={() => setPwdTarget(u)}>🔑 รหัสผ่าน</Button>
                  <Button size="sm" variant="destructive" onClick={() => setDelTarget(u)}>🗑️</Button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">ไม่มีรายการ</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openCreate && (
        <CreateUserDialog
          me={me} onClose={() => setOpenCreate(false)} onDone={() => { setOpenCreate(false); load(); }}
        />
      )}
      {editTarget && (
        <EditUserDialog
          me={me} target={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); load(); }}
        />
      )}
      {pwdTarget && (
        <ChangePasswordDialog
          me={me} target={pwdTarget}
          onClose={() => setPwdTarget(null)}
          onDone={() => setPwdTarget(null)}
        />
      )}
      {delTarget && (
        <DeleteUserDialog
          me={me} target={delTarget}
          onClose={() => setDelTarget(null)}
          onDone={() => { setDelTarget(null); load(); }}
        />
      )}
    </Card>
  );
}

/* ========== Dialogs ========== */

function StepAccessPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {STEPS.map((s) => {
        const checked = value.includes(s.v);
        return (
          <label key={s.v} className="text-sm flex items-center gap-2 border rounded p-1.5">
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => {
                if (c) onChange([...value, s.v].sort((a, b) => a - b));
                else onChange(value.filter((x) => x !== s.v));
              }}
            />
            {s.label}
          </label>
        );
      })}
    </div>
  );
}

function CreateUserDialog({ me, onClose, onDone }: { me: any; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [steps, setSteps] = useState<number[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPwd, setAdminPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim() || !name.trim()) return toast.error("กรุณากรอกรหัสและชื่อ");
    if (pwd.length < 4) return toast.error("รหัสผ่านต้องอย่างน้อย 4 ตัวอักษร");
    if (!adminPwd) return toast.error("กรุณายืนยันรหัสผ่าน Admin");
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_user", {
      _admin_code: me.role_code,
      _admin_password: adminPwd,
      _role_code: code.trim(),
      _display_name: name.trim(),
      _new_password: pwd,
      _step_access: steps,
      _is_admin: isAdmin,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("เพิ่มพนักงานสำเร็จ");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>➕ เพิ่มพนักงานใหม่</DialogTitle>
          <DialogDescription>กรอกข้อมูลและยืนยันด้วยรหัสผ่าน Admin</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>รหัสผู้ใช้ * (เช่น PCH02)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div><Label>ชื่อที่แสดง (display_name) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="พิมพ์ให้ตรงกับชื่อในเอกสาร" /></div>
          <div><Label>รหัสผ่าน *</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
          <div><Label>สิทธิ์เข้าถึงขั้นตอน</Label><StepAccessPicker value={steps} onChange={setSteps} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isAdmin} onCheckedChange={(v) => setIsAdmin(!!v)} /> เป็น Admin
          </label>
          <div><Label>🔐 รหัสผ่านของคุณ ({me.role_code}) *</Label>
            <Input type="password" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ me, target, onClose, onDone }: { me: any; target: Row; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(target.display_name);
  const [steps, setSteps] = useState<number[]>(target.step_access ?? []);
  const [isAdmin, setIsAdmin] = useState(target.is_admin);
  const [isActive, setIsActive] = useState(target.is_active);
  const [adminPwd, setAdminPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("กรุณากรอกชื่อ");
    if (!adminPwd) return toast.error("กรุณายืนยันรหัสผ่าน Admin");
    setBusy(true);
    const { error } = await supabase.rpc("admin_update_user", {
      _admin_code: me.role_code,
      _admin_password: adminPwd,
      _target_code: target.role_code,
      _display_name: name.trim(),
      _step_access: steps,
      _is_admin: isAdmin,
      _is_active: isActive,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("อัพเดทสำเร็จ");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>✏️ แก้ไข: {target.role_code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>ชื่อที่แสดง *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>สิทธิ์เข้าถึงขั้นตอน</Label><StepAccessPicker value={steps} onChange={setSteps} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isAdmin} onCheckedChange={(v) => setIsAdmin(!!v)} /> เป็น Admin
          </label>
          <label className="flex items-center gap-2 text-sm border-t pt-2">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
            <span className={isActive ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
              {isActive ? "ใช้งาน (active)" : "🚫 ปิดใช้งาน (ลาออก)"}
            </span>
          </label>
          {!isActive && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ ปิดใช้งานแล้ว: login ไม่ได้, ไม่โผล่ในรายการ — แต่เอกสารเดิมยังเปิดดูได้
            </p>
          )}
          <div><Label>🔐 รหัสผ่านของคุณ ({me.role_code}) *</Label>
            <Input type="password" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ me, target, onClose, onDone }: { me: any; target: Row; onClose: () => void; onDone: () => void }) {
  const [adminPwd, setAdminPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (newPwd.length < 4) return toast.error("รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัวอักษร");
    if (newPwd !== confirmPwd) return toast.error("รหัสผ่านใหม่ไม่ตรงกัน");
    if (!adminPwd) return toast.error("กรุณายืนยันรหัสผ่าน Admin");
    setBusy(true);
    const { error } = await supabase.rpc("admin_change_password", {
      _admin_code: me.role_code,
      _admin_password: adminPwd,
      _target_code: target.role_code,
      _new_password: newPwd,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔑 เปลี่ยนรหัสผ่าน: {target.display_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>รหัสผ่านใหม่ *</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
          <div><Label>ยืนยันรหัสผ่านใหม่ *</Label>
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} /></div>
          <div><Label>🔐 รหัสผ่านของคุณ ({me.role_code}) *</Label>
            <Input type="password" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "กำลัง..." : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ me, target, onClose, onDone }: { me: any; target: Row; onClose: () => void; onDone: () => void }) {
  const [adminPwd, setAdminPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!adminPwd) return toast.error("กรุณายืนยันรหัสผ่าน Admin");
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_user", {
      _admin_code: me.role_code,
      _admin_password: adminPwd,
      _target_code: target.role_code,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("ลบสำเร็จ");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">🗑️ ลบถาวร: {target.display_name}</DialogTitle>
          <DialogDescription>
            ⚠️ <b>ใช้เฉพาะกรณีกรอกผิด</b><br />
            ถ้าพนักงานลาออก แนะนำใช้ "✏️ แก้ไข" → ติ๊กปิดใช้งานแทน เพื่อเก็บข้อมูลเดิมไว้
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>🔐 รหัสผ่านของคุณ ({me.role_code}) *</Label>
            <Input type="password" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "กำลังลบ..." : "ลบถาวร"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
