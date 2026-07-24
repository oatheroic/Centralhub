import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Row = {
  id: string;
  display_name: string;
  is_active: boolean;
  updated_at: string;
};

type Mode =
  | { kind: "add" }
  | { kind: "setpw"; row: Row }
  | { kind: "rename"; row: Row }
  | { kind: "toggle"; row: Row };

export default function PersonReceivePasswordPanel() {
  const me = useCurrentRoleInfo();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("person_receive_passwords")
      .select("id,display_name,is_active,updated_at")
      .order("display_name");
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  if (!me?.is_admin) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น
      </div>
    );
  }

  const filtered = rows.filter((r) =>
    r.display_name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">🔐 รหัสรับทรัพย์สินรายบุคคล (Step 3.1)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ใช้เฉพาะตอนพนักงานกดยืนยันรับทรัพย์สินในขั้นตอนที่ 3.1<br/>
          พนักงานลาออก → ใช้ "ปิดใช้งาน" (ไม่ลบ เพื่อเก็บประวัติเอกสารเดิม)
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="🔍 ค้นหาชื่อ..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button onClick={() => setMode({ kind: "add" })}>➕ เพิ่มชื่อ</Button>
      </div>

      <div className="space-y-2">
        {filtered.map((r) => (
          <div key={r.id} className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${!r.is_active ? "opacity-60 bg-muted/40" : ""}`}>
            <div className="min-w-0">
              <div className="font-bold truncate">{r.display_name}</div>
              <div className="text-xs mt-0.5">
                {r.is_active
                  ? <span className="text-emerald-600">✓ ใช้งานอยู่</span>
                  : <span className="text-red-600">⛔ ปิดใช้งาน (ลาออก)</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setMode({ kind: "setpw", row: r })}>
                เปลี่ยนรหัส
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode({ kind: "rename", row: r })}>
                แก้ชื่อ
              </Button>
              <Button
                size="sm"
                variant={r.is_active ? "destructive" : "default"}
                onClick={() => setMode({ kind: "toggle", row: r })}
              >
                {r.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-4">
            {rows.length === 0 ? "ยังไม่มีรายชื่อ กดปุ่ม ➕ เพิ่มชื่อ" : "ไม่พบชื่อตามคำค้น"}
          </p>
        )}
      </div>

      {mode && (
        <ActionDialog
          mode={mode}
          adminCode={me.role_code}
          onClose={() => setMode(null)}
          onDone={() => { setMode(null); load(); }}
        />
      )}
    </Card>
  );
}

function ActionDialog({
  mode, adminCode, onClose, onDone,
}: { mode: Mode; adminCode: string; onClose: () => void; onDone: () => void }) {
  const [adminPwd, setAdminPwd] = useState("");
  const [displayName, setDisplayName] = useState(
    mode.kind === "setpw" || mode.kind === "rename" || mode.kind === "toggle"
      ? mode.row.display_name : "",
  );
  const [newName, setNewName] = useState(mode.kind === "rename" ? mode.row.display_name : "");
  const [pwd, setPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const title = {
    add: "➕ เพิ่มพนักงาน + ตั้งรหัส",
    setpw: `เปลี่ยนรหัสของ: ${mode.kind !== "add" ? mode.row.display_name : ""}`,
    rename: `แก้ชื่อ: ${mode.kind !== "add" ? mode.row.display_name : ""}`,
    toggle: mode.kind === "toggle"
      ? (mode.row.is_active ? `ปิดใช้งาน: ${mode.row.display_name}` : `เปิดใช้งาน: ${mode.row.display_name}`)
      : "",
  }[mode.kind];

  async function submit() {
    if (!adminPwd) return toast.error("กรุณากรอกรหัส Admin");
    setBusy(true);
    try {
      if (mode.kind === "add") {
        if (!displayName.trim()) throw new Error("กรุณากรอกชื่อ");
        if (pwd.length < 4) throw new Error("รหัสต้องอย่างน้อย 4 ตัว");
        if (pwd !== confirmPwd) throw new Error("รหัสยืนยันไม่ตรง");
        const { error } = await supabase.rpc("admin_upsert_person_receive_password", {
          _admin_code: adminCode, _admin_password: adminPwd,
          _display_name: displayName, _new_password: pwd,
        });
        if (error) throw error;
        toast.success("เพิ่มชื่อสำเร็จ");
      } else if (mode.kind === "setpw") {
        if (pwd.length < 4) throw new Error("รหัสต้องอย่างน้อย 4 ตัว");
        if (pwd !== confirmPwd) throw new Error("รหัสยืนยันไม่ตรง");
        const { error } = await supabase.rpc("admin_upsert_person_receive_password", {
          _admin_code: adminCode, _admin_password: adminPwd,
          _display_name: mode.row.display_name, _new_password: pwd,
        });
        if (error) throw error;
        toast.success("เปลี่ยนรหัสสำเร็จ");
      } else if (mode.kind === "rename") {
        if (!newName.trim()) throw new Error("กรุณากรอกชื่อใหม่");
        const { error } = await supabase.rpc("admin_rename_person_receive", {
          _admin_code: adminCode, _admin_password: adminPwd,
          _old_name: mode.row.display_name, _new_name: newName,
        });
        if (error) throw error;
        toast.success("แก้ชื่อสำเร็จ");
      } else if (mode.kind === "toggle") {
        const { error } = await supabase.rpc("admin_set_person_receive_active", {
          _admin_code: adminCode, _admin_password: adminPwd,
          _display_name: mode.row.display_name, _is_active: !mode.row.is_active,
        });
        if (error) throw error;
        toast.success(mode.row.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว");
      }
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            ยืนยันด้วยรหัส Admin ({adminCode}) ของคุณก่อนบันทึก
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode.kind === "add" && (
            <div className="space-y-1.5">
              <Label>ชื่อพนักงาน *</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น ภาวินีย์ เกษมสุข" autoFocus />
              <p className="text-xs text-muted-foreground">
                ต้องตรงกับชื่อในขั้นตอนที่ 6 (จ่ายทรัพย์สิน)
              </p>
            </div>
          )}

          {mode.kind === "rename" && (
            <div className="space-y-1.5">
              <Label>ชื่อใหม่ *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
          )}

          {(mode.kind === "add" || mode.kind === "setpw") && (
            <>
              <div className="space-y-1.5">
                <Label>รหัสส่วนบุคคล *</Label>
                <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                  placeholder="อย่างน้อย 4 ตัวอักษร" autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label>ยืนยันรหัส *</Label>
                <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                  autoComplete="new-password" />
              </div>
            </>
          )}

          {mode.kind === "toggle" && (
            <p className="text-sm">
              {mode.row.is_active
                ? "หลังปิดใช้งาน พนักงานคนนี้จะใช้รหัสรับทรัพย์สินไม่ได้ (เอกสารเก่ายังคงอยู่)"
                : "เปิดใช้งานเพื่อให้พนักงานคนนี้สามารถใช้รหัสรับทรัพย์สินได้อีกครั้ง"}
            </p>
          )}

          <div className="space-y-1.5 pt-2 border-t">
            <Label>รหัส Admin ({adminCode}) *</Label>
            <Input type="password" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)}
              autoComplete="current-password" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
