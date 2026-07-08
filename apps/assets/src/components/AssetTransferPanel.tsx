import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useHasStepAccess } from "./RoleSwitcher";
import { useCurrentRole } from "@/lib/role";
import SearchableEditableSelect from "@/components/SearchableEditableSelect";
import { Trash2, Search, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/formatDate";

const labelCls = "font-bold text-[color:var(--label-pink)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";

/** Resolved current ownership for a single asset code. */
type AssetOwnership = {
  assetCode: string;
  assetName: string;
  currentOwner: string;
  sourceDocId: string;
  sourceDocNo: string;
};

/** A pending group inside the "transfer cart". */
type CartGroup = {
  id: string; // local uuid
  receiver: string;
  reason: string;
  note: string;
  items: AssetOwnership[];
};

export default function AssetTransferPanel() {
  const allowed = useHasStepAccess(7);
  const role = useCurrentRole();

  if (!role) return <Empty msg="กรุณาเลือก Role ผู้ใช้ที่ด้านบน" />;
  if (!allowed)
    return (
      <Empty
        msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 7 (โอนความรับผิดชอบทรัพย์สิน)`}
      />
    );

  return (
    <div className="bg-card border rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
        🔄 โอนความรับผิดชอบทรัพย์สิน
      </h2>
      <Tabs defaultValue="transfer" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transfer">โอนทรัพย์สิน</TabsTrigger>
          <TabsTrigger value="history">ประวัติการโอน</TabsTrigger>
        </TabsList>
        <TabsContent value="transfer" className="pt-4">
          <TransferTab role={role} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-card border rounded-xl p-8 shadow-sm text-center text-muted-foreground">
      🔒 {msg}
    </div>
  );
}

/* ============================================================
   ผู้ช่วย: คำนวณ "เจ้าของปัจจุบัน" ของทรัพย์สินทุกชิ้น
   ============================================================ */
async function loadOwnerships(): Promise<AssetOwnership[]> {
  const [{ data: docs }, { data: history }] = await Promise.all([
    supabase
      .from("asset_purchase_requests")
      .select(
        "id, doc_no, receive_items, transfer_items"
      )
      .not("receive_items", "is", null),
    supabase
      .from("asset_transfer_history")
      .select("asset_code, to_user, transfer_date, created_at")
      .order("created_at", { ascending: true }),
  ]);

  const map = new Map<string, AssetOwnership>();

  for (const d of docs ?? []) {
    const items: any[] = Array.isArray(d.receive_items) ? d.receive_items : [];
    for (const it of items) {
      const code = String(it.assetCode || "").trim();
      if (!code) continue;
      map.set(code, {
        assetCode: code,
        assetName: String(it.assetName || "").trim(),
        currentOwner: String(it.receiverName || "").trim(),
        sourceDocId: d.id,
        sourceDocNo: d.doc_no,
      });
    }
    // เผื่อกรณีของเก่า: transfer_items ในเอกสารเดียวกัน (legacy step7)
    const tItems: any[] = Array.isArray(d.transfer_items) ? d.transfer_items : [];
    for (const it of tItems) {
      const code = String(it.assetCode || "").trim();
      if (!code) continue;
      const cur = map.get(code);
      if (cur) cur.currentOwner = String(it.receiver || cur.currentOwner).trim();
    }
  }

  // ใช้ประวัติการโอนเป็นข้อมูลล่าสุด (เรียงเก่า→ใหม่ ทับซ้อนได้เลย)
  for (const h of history ?? []) {
    const code = String(h.asset_code || "").trim();
    if (!code) continue;
    const cur = map.get(code);
    if (cur) cur.currentOwner = String(h.to_user || "").trim();
  }

  return Array.from(map.values()).filter((x) => x.currentOwner);
}

/* ============================================================
   TAB 1: โอนทรัพย์สิน
   ============================================================ */
function TransferTab({ role }: { role: string }) {
  const [ownerships, setOwnerships] = useState<AssetOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [senderQuery, setSenderQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // assetCode set
  const [receiver, setReceiver] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [sig, setSig] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setOwnerships(await loadOwnerships());
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);

  // รหัสที่ถูกใส่ตะกร้าไปแล้ว — ห้ามเลือกซ้ำ
  const inCart = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.items.forEach((it) => s.add(it.assetCode)));
    return s;
  }, [groups]);

  // รายชื่อผู้โอน (เจ้าของปัจจุบัน) ที่ยังเหลือทรัพย์สิน (กรองออกจากตะกร้า)
  const senderOptions = useMemo(() => {
    const set = new Set<string>();
    ownerships.forEach((o) => {
      if (!inCart.has(o.assetCode)) set.add(o.currentOwner);
    });
    return Array.from(set).sort();
  }, [ownerships, inCart]);

  // รายชื่อผู้รับโอน = รวมเจ้าของทุกคนในระบบ (ไม่กรองตะกร้า) เพื่อใช้เลือกซ้ำได้
  const receiverOptions = useMemo(() => {
    const set = new Set<string>();
    ownerships.forEach((o) => o.currentOwner && set.add(o.currentOwner));
    // ตัดผู้โอนคนปัจจุบันออก (ห้ามโอนให้ตัวเอง)
    if (senderQuery) set.delete(senderQuery);
    return Array.from(set).sort();
  }, [ownerships, senderQuery]);

  // เมื่อเลือกผู้โอน → แสดงรายการที่ยังเหลือของผู้โอนนั้น
  const senderAssets = useMemo(() => {
    if (!senderQuery) return [];
    return ownerships.filter(
      (o) => o.currentOwner === senderQuery && !inCart.has(o.assetCode)
    );
  }, [ownerships, senderQuery, inCart]);

  function togglePick(code: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  function addToCart() {
    if (picked.size === 0) return toast.error("กรุณาเลือกรายการทรัพย์สินอย่างน้อย 1 รายการ");
    if (!receiver.trim()) return toast.error("กรุณาเลือกผู้รับโอน");
    if (receiver.trim() === senderQuery)
      return toast.error("ผู้รับโอนต้องไม่ใช่คนเดียวกับผู้โอน");
    if (!reason.trim()) return toast.error("กรุณาเลือกเหตุผลการโอน");

    const items = senderAssets.filter((a) => picked.has(a.assetCode));
    setGroups((gs) => [
      ...gs,
      {
        id: crypto.randomUUID(),
        receiver: receiver.trim(),
        reason: reason.trim(),
        note: note.trim(),
        items,
      },
    ]);
    setPicked(new Set());
    setReceiver("");
    setReason("");
    setNote("");
    setShowNote(false);
    setSenderQuery("");
    toast.success(`เพิ่มเข้าตะกร้า ${items.length} รายการ`);
  }

  function removeGroup(id: string) {
    setGroups((gs) => gs.filter((g) => g.id !== id));
  }

  async function submit() {
    if (groups.length === 0) return toast.error("ยังไม่มีรายการในตะกร้า");
    if (!sig.trim()) return toast.error("กรุณาลงนามเจ้าหน้าที่ทรัพย์สิน");

    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows: any[] = [];
      for (const g of groups) {
        for (const it of g.items) {
          rows.push({
            asset_code: it.assetCode,
            asset_name: it.assetName,
            from_user: it.currentOwner,
            to_user: g.receiver,
            transfer_date: today,
            reason: g.reason,
            note: g.note || null,
            officer_signature: sig.trim(),
            officer_role: role,
            source_doc_id: it.sourceDocId,
            source_doc_no: it.sourceDocNo,
          });
        }
      }
      const { error } = await supabase
        .from("asset_transfer_history")
        .insert(rows);
      if (error) throw error;
      toast.success(`บันทึกการโอนสำเร็จ ${rows.length} รายการ`);
      setGroups([]);
      setSig("");
      await refresh();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ขั้นที่ 1: เลือกผู้โอน */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
        <Label className={labelCls}>1. เลือกผู้โอน (เจ้าของทรัพย์สินคนปัจจุบัน) *</Label>
        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <SearchableEditableSelect
            category="__current_owners__"
            value={senderQuery}
            onChange={setSenderQuery}
            placeholder="-- เลือก/ค้นหาชื่อผู้โอน --"
            extraOptions={senderOptions}
            manageable={false}
          />
        )}
        {senderQuery && senderAssets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            ไม่มีทรัพย์สินคงเหลือของ "{senderQuery}" (อาจถูกใส่ตะกร้าไปหมดแล้ว)
          </p>
        )}
      </div>

      {/* ขั้นที่ 2: เลือกรายการทรัพย์สิน */}
      {senderQuery && senderAssets.length > 0 && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <Label className={labelCls}>
              2. เลือกทรัพย์สินที่จะโอน ({picked.size}/{senderAssets.length}) *
            </Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPicked(new Set(senderAssets.map((a) => a.assetCode)))
                }
              >
                เลือกทั้งหมด
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPicked(new Set())}
              >
                ล้าง
              </Button>
            </div>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {senderAssets.map((a) => (
              <label
                key={a.assetCode}
                className="flex items-start gap-3 border rounded-md p-2 hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={picked.has(a.assetCode)}
                  onCheckedChange={() => togglePick(a.assetCode)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[color:var(--doc-green)]">
                    {a.assetCode}
                  </div>
                  <div className="text-sm text-[color:var(--input-blue)] break-words">
                    {a.assetName || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    เอกสาร: {a.sourceDocNo}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ขั้นที่ 3: ผู้รับโอน + เหตุผล + เพิ่มเข้าตะกร้า */}
      {senderQuery && picked.size > 0 && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
          <Label className={labelCls}>3. ผู้รับโอน *</Label>
          <SearchableEditableSelect
            category="asset_receiver"
            value={receiver}
            onChange={setReceiver}
            placeholder="-- เลือกผู้รับโอน --"
            extraOptions={receiverOptions}
          />
          <Label className={labelCls}>4. เหตุผลการโอน *</Label>
          <SearchableEditableSelect
            category="transfer_reason"
            value={reason}
            onChange={setReason}
            placeholder="-- เลือกเหตุผล --"
          />
          {!showNote ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNote(true)}
              className="w-fit"
            >
              ➕ เพิ่มหมายเหตุ
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className={labelCls}>5. หมายเหตุ (ไม่บังคับ)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNote(false);
                    setNote("");
                  }}
                  className="text-destructive h-auto py-0"
                >
                  ❌ ไม่ใส่หมายเหตุ
                </Button>
              </div>
              <Textarea
                className={inputCls}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="รายละเอียดเพิ่มเติม..."
              />
            </div>
          )}
          <Button
            type="button"
            onClick={addToCart}
            className="w-full"
            style={{ backgroundColor: "var(--label-pink)", color: "white" }}
          >
            ➕ เพิ่มเข้าตะกร้าโอน ({picked.size} รายการ)
          </Button>
        </div>
      )}

      {/* ตะกร้าโอน */}
      {groups.length > 0 && (
        <div className="border-2 border-[color:var(--label-pink)] rounded-lg p-4 space-y-3 bg-card">
          <div className="font-bold text-[color:var(--label-pink)]">
            🛒 ตะกร้ารายการที่จะโอน ({groups.length} กลุ่ม,{" "}
            {groups.reduce((n, g) => n + g.items.length, 0)} รายการ)
          </div>
          {groups.map((g, gi) => (
            <div key={g.id} className="border rounded-md p-3 space-y-2 bg-muted/10">
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div className="font-bold text-[color:var(--doc-green)]">
                  กลุ่มที่ {gi + 1}: {g.items[0]?.currentOwner}{" "}
                  <ArrowRight className="inline w-4 h-4" /> {g.receiver}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGroup(g.id)}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> ลบกลุ่ม
                </Button>
              </div>
              <div className="text-sm text-[color:var(--input-blue)]">
                เหตุผล: {g.reason}
                {g.note && ` • หมายเหตุ: ${g.note}`}
              </div>
              <ul className="text-sm space-y-0.5 pl-4 list-disc">
                {g.items.map((it) => (
                  <li key={it.assetCode}>
                    <span className="font-bold text-[color:var(--doc-green)]">
                      {it.assetCode}
                    </span>{" "}
                    — {it.assetName}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="space-y-1.5 pt-2 border-t">
            <Label className={labelCls}>ลงนามเจ้าหน้าที่ทรัพย์สิน *</Label>
            <Input
              className={inputCls}
              value={sig}
              onChange={(e) => setSig(e.target.value)}
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <Button
            onClick={submit}
            disabled={saving}
            className="w-full text-white text-lg py-6"
            style={{ backgroundColor: "var(--label-pink)" }}
          >
            {saving ? "กำลังบันทึก..." : "💾 ยืนยันโอนทั้งหมด"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAB 2: ประวัติการโอน
   ============================================================ */
function HistoryTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("asset_transfer_history")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql) {
        const hay = [
          r.asset_code,
          r.asset_name,
          r.from_user,
          r.to_user,
          r.reason,
          r.note,
          r.source_doc_no,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (from && r.transfer_date < from) return false;
      if (to && r.transfer_date > to) return false;
      return true;
    });
  }, [rows, q, from, to]);

  async function removeRow(id: string) {
    if (!confirm("ยืนยันการลบประวัติรายการนี้?")) return;
    const { error } = await supabase
      .from("asset_transfer_history")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-2">
        <div className="relative sm:col-span-3">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            className={inputCls + " pl-8"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา รหัส/ชื่อทรัพย์สิน, ผู้โอน, ผู้รับโอน..."
          />
        </div>
        <div>
          <Label className={labelCls}>ตั้งแต่วันที่</Label>
          <Input
            type="date"
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className={labelCls}>ถึงวันที่</Label>
          <Input
            type="date"
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
            }}
            className="w-full"
          >
            ล้างตัวกรอง
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          ไม่พบประวัติการโอน
        </p>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            พบ {filtered.length} รายการ
          </div>
          {filtered.map((r) => (
            <div
              key={r.id}
              className="border rounded-lg p-3 space-y-1 bg-card"
            >
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div>
                  <span className="font-bold text-[color:var(--doc-green)]">
                    {r.asset_code}
                  </span>{" "}
                  <span className="text-[color:var(--input-blue)]">
                    {r.asset_name || "-"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(r.transfer_date)}
                </div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">จาก:</span>{" "}
                <span className="font-medium">{r.from_user}</span>{" "}
                <ArrowRight className="inline w-3 h-3" />{" "}
                <span className="text-muted-foreground">ถึง:</span>{" "}
                <span className="font-medium text-[color:var(--label-pink)]">
                  {r.to_user}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                เหตุผล: {r.reason || "-"}
                {r.note && ` • ${r.note}`}
              </div>
              <div className="text-xs text-muted-foreground flex justify-between items-center flex-wrap gap-2">
                <span>
                  ลงนาม: {r.officer_signature}
                  {r.officer_role && ` (${r.officer_role})`} • เอกสารต้นทาง:{" "}
                  {r.source_doc_no || "-"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(r.id)}
                  className="text-destructive h-7"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> ลบ
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
