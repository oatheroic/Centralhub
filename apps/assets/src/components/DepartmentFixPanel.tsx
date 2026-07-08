import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { parseAssetUsers, serializeAssetUsers, type AssetUser } from "@/lib/assetItems";

type Row = {
  id: string;
  doc_no: string | null;
  status: string | null;
  asset_user: any;
  receive_items: any;
};

type ReceiveItem = {
  receiverName?: string;
  receiverDepartment?: string;
  [k: string]: any;
};

function needsFix(row: Row): boolean {
  const users = parseAssetUsers(row.asset_user);
  if (users.some((u) => !u.department || !u.department.trim())) return true;
  const items = Array.isArray(row.receive_items) ? (row.receive_items as ReceiveItem[]) : [];
  if (items.some((it) => !it?.receiverDepartment || !String(it.receiverDepartment).trim())) return true;
  return false;
}

export default function DepartmentFixPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editUsers, setEditUsers] = useState<AssetUser[]>([]);
  const [editItems, setEditItems] = useState<ReceiveItem[]>([]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => rows.filter(needsFix), [rows]);

  async function load() {
    setLoading(true);
    const [docsRes, optsRes] = await Promise.all([
      supabase
        .from("asset_purchase_requests")
        .select("id,doc_no,status,asset_user,receive_items")
        .order("doc_no", { ascending: false }),
      supabase
        .from("dropdown_options")
        .select("value,is_active")
        .eq("category", "department")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);
    if (docsRes.error) toast.error(docsRes.error.message);
    if (optsRes.error) toast.error(optsRes.error.message);
    setRows((docsRes.data ?? []) as Row[]);
    setDepartments((optsRes.data ?? []).map((o: any) => o.value));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(row: Row) {
    setEditing(row);
    setEditUsers(parseAssetUsers(row.asset_user));
    const items = Array.isArray(row.receive_items) ? (row.receive_items as ReceiveItem[]) : [];
    setEditItems(items.map((it) => ({ ...it })));
  }

  function closeEdit() {
    setEditing(null);
    setEditUsers([]);
    setEditItems([]);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const payload = {
      asset_user: serializeAssetUsers(editUsers),
      ...(Array.isArray(editing.receive_items) ? { receive_items: editItems as any } : {}),
    };
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update(payload)
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("บันทึกแผนกเรียบร้อย");
    closeEdit();
    load();
  }

  return (
    <div className="bg-card border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">แก้ไขแผนกผู้รับผิดชอบ</h2>
        <div className="text-sm text-muted-foreground">
          เอกสารที่ยังไม่มีแผนก: <span className="font-semibold text-foreground">{filtered.length}</span> ใบ
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">ไม่มีเอกสารที่ต้องแก้ไข 🎉</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-3 py-2 border-b">เลขที่เอกสาร</th>
                <th className="px-3 py-2 border-b">ผู้รับผิดชอบ</th>
                <th className="px-3 py-2 border-b">สถานะ</th>
                <th className="px-3 py-2 border-b w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const users = parseAssetUsers(r.asset_user);
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono">{r.doc_no ?? "-"}</td>
                    <td className="px-3 py-2">
                      {users.map((u, i) => (
                        <div key={i}>
                          {u.name}
                          {u.department ? (
                            <span className="text-muted-foreground"> ({u.department})</span>
                          ) : (
                            <span className="text-destructive"> (ไม่มีแผนก)</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.status ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        แก้ไข
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขแผนกผู้รับผิดชอบ</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground text-xs">เลขที่เอกสาร</div>
                  <div className="font-mono">{editing.doc_no ?? "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">สถานะ</div>
                  <div>{editing.status ?? "-"}</div>
                </div>
              </div>

              {editUsers.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold">ขั้นตอนที่ 1 — ผู้รับผิดชอบทรัพย์สิน</div>
                  {editUsers.map((u, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 items-center">
                      <div className="px-3 py-2 bg-muted rounded">{u.name}</div>
                      <DeptSelect
                        value={u.department}
                        departments={departments}
                        onChange={(v) =>
                          setEditUsers((prev) => prev.map((x, j) => (j === i ? { ...x, department: v } : x)))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {editItems.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold">ขั้นตอนที่ 6 — ผู้รับทรัพย์สิน (receive_items)</div>
                  {editItems.map((it, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 items-center">
                      <div className="px-3 py-2 bg-muted rounded">{it.receiverName ?? "-"}</div>
                      <DeptSelect
                        value={it.receiverDepartment ?? ""}
                        departments={departments}
                        onChange={(v) =>
                          setEditItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, receiverDepartment: v } : x)),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeptSelect({
  value,
  departments,
  onChange,
}: {
  value: string;
  departments: string[];
  onChange: (v: string) => void;
}) {
  const has = !value || departments.includes(value);
  return (
    <select
      className="border rounded px-2 py-2 bg-background"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-- เลือกแผนก --</option>
      {!has && <option value={value}>{value}</option>}
      {departments.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
