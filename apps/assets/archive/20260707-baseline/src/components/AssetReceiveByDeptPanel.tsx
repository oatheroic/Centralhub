import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoleInfo } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ProgressTimeline } from "@/components/DocDetailDialog";
import { formatDate } from "@/lib/formatDate";
import { parseAssetUsers } from "@/lib/assetItems";

const SESSION_KEY = (p: string) => `person_pw_ok:${p}`;
const FAIL_KEY = (p: string) => `person_pw_fails:${p}`;
const BLOCK_KEY = (p: string) => `person_pw_block:${p}`;
const BLOCK_MS = 5 * 60 * 1000;

function normPerson(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}
function getBlockRemaining(key: string): number {
  try {
    const t = parseInt(localStorage.getItem(BLOCK_KEY(key)) || "0", 10);
    if (!t) return 0;
    const remain = t + BLOCK_MS - Date.now();
    return remain > 0 ? remain : 0;
  } catch { return 0; }
}

type Doc = any;
type PersonGroup = { company: string; department: string; personName: string; docs: Doc[] };

/** ดึงรายชื่อผู้รับผิดชอบจากเอกสาร: จาก receive_items[].receiverName ก่อน,
 *  ถ้าไม่มีก็ fallback ไปที่ asset_user */
function extractPersons(d: Doc): string[] {
  const items: any[] = Array.isArray(d.receive_items) ? d.receive_items : [];
  const names = items
    .map((it) => (it?.receiverName ?? "").trim())
    .filter((n) => n.length > 0);
  if (names.length > 0) return Array.from(new Set(names));
  const fb = parseAssetUsers(d.asset_user).map((u) => u.name).filter(Boolean);
  return fb.length ? Array.from(new Set(fb)) : ["(ไม่ระบุ)"];
}

export default function AssetReceiveByDeptPanel() {
  const me = useCurrentRoleInfo();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activePerson, setActivePerson] = useState<PersonGroup | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [pwDialog, setPwDialog] = useState<PersonGroup | null>(null);

  async function load() {
    const { data } = await supabase
      .from("asset_purchase_requests")
      .select("*")
      .eq("status", "จ่ายทรัพย์สินแล้ว")
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }
  useEffect(() => { load(); }, []);

  /** จัดกลุ่ม: บริษัท → แผนก → บุคคล */
  const tree = useMemo(() => {
    const byCompany = new Map<string, Map<string, Map<string, Doc[]>>>();
    docs.forEach((d) => {
      const c = d.company || "(ไม่ระบุ)";
      const dept = d.department || "(ไม่ระบุ)";
      const persons = extractPersons(d);
      persons.forEach((p) => {
        if (!byCompany.has(c)) byCompany.set(c, new Map());
        const byDept = byCompany.get(c)!;
        if (!byDept.has(dept)) byDept.set(dept, new Map());
        const byPerson = byDept.get(dept)!;
        if (!byPerson.has(p)) byPerson.set(p, []);
        byPerson.get(p)!.push(d);
      });
    });
    return byCompany;
  }, [docs]);

  if (!me) return <Empty msg="กรุณาเข้าสู่ระบบ" />;

  async function tryEnter(g: PersonGroup) {
    // Admin → bypass
    if (me!.is_admin) {
      setActivePerson(g);
      return;
    }
    // Session ปลดล็อกแล้ว
    const sessKey = normPerson(g.personName);
    if (sessionStorage.getItem(SESSION_KEY(sessKey)) === "1") {
      setActivePerson(g);
      return;
    }
    // เช็คว่าชื่อมีในตารางรหัสรับทรัพย์สินไหม
    const { data: existsRow, error } = await supabase
      .from("person_receive_passwords")
      .select("display_name,is_active")
      .ilike("display_name", g.personName.trim())
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!existsRow) {
      toast.error(
        `⚠️ ไม่พบชื่อ "${g.personName}" ในระบบรหัสรับทรัพย์สิน\n` +
        `กรุณาให้ Admin เพิ่มชื่อนี้ในเมนู "🔐 รหัสรับทรัพย์สินรายบุคคล"`,
        { duration: 8000 }
      );
      return;
    }
    if (!existsRow.is_active) {
      toast.error(`⛔ "${g.personName}" ถูกปิดใช้งาน (พนักงานลาออก) — ให้ Admin โอนทรัพย์สินก่อน`, { duration: 8000 });
      return;
    }
    setPwDialog(g);
  }

  if (selectedDoc) {
    return (
      <ReceiveDetail
        doc={selectedDoc}
        currentReceiverRole={
          me.is_admin ? me.role_code : `PERSON:${activePerson?.personName ?? ""}`
        }
        onDone={() => { setSelectedDoc(null); load(); }}
        onBack={() => setSelectedDoc(null)}
      />
    );
  }

  if (activePerson) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
            📥 รับทรัพย์สิน — {activePerson.personName}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setActivePerson(null)}>← กลับ</Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {activePerson.company} / {activePerson.department}
        </div>
        {activePerson.docs.length === 0 ? (
          <p className="text-muted-foreground">ไม่มีเอกสารรอรับ</p>
        ) : (
          <div className="space-y-2">
            {activePerson.docs.map((d) => (
              <button key={d.id} onClick={() => setSelectedDoc(d)}
                className="w-full text-left border rounded-lg p-3 hover:bg-accent transition flex justify-between items-center">
                <div>
                  <div className="font-bold text-[color:var(--doc-green)]">{d.doc_no}</div>
                  <div className="text-sm">{d.topic}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.doc_date)} • {d.transfer_no ?? "-"}
                  </div>
                </div>
                <span className="font-bold text-[color:var(--status-emerald)]">{d.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
        📥 รับทรัพย์สิน (3.1) — เลือกบุคคลผู้รับผิดชอบ
      </h2>
      <p className="text-xs text-muted-foreground">
        แสดงเฉพาะเอกสารสถานะ "จ่ายทรัพย์สินแล้ว" • รวม {docs.length} เอกสาร
        {me.is_admin && " • (Admin: เข้าได้ทุกคนโดยไม่ต้องใส่รหัส)"}
      </p>
      {tree.size === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอรับทรัพย์สิน</p>
      ) : (
        <div className="space-y-5">
          {Array.from(tree.entries())
            .sort(([a], [b]) => a.localeCompare(b, "th"))
            .map(([company, byDept]) => (
              <div key={company} className="border rounded-xl p-4 bg-background/50">
                <div className="text-sm font-bold text-[color:var(--label-brown)] mb-2">
                  🏢 {company}
                </div>
                <div className="space-y-3 ml-2">
                  {Array.from(byDept.entries())
                    .sort(([a], [b]) => a.localeCompare(b, "th"))
                    .map(([dept, byPerson]) => (
                      <div key={dept}>
                        <div className="text-sm font-semibold text-[color:var(--label-darkgreen)] mb-1.5">
                          🏬 {dept}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-2">
                          {Array.from(byPerson.entries())
                            .sort(([a], [b]) => a.localeCompare(b, "th"))
                            .map(([person, dlist]) => (
                              <button
                                key={person}
                                onClick={() =>
                                  tryEnter({ company, department: dept, personName: person, docs: dlist })
                                }
                                className="text-left border rounded-lg p-3 hover:bg-accent transition shadow-sm bg-card"
                              >
                                <div className="font-bold text-[color:var(--input-blue)]">
                                  👤 {person}
                                </div>
                                <div className="mt-1.5 inline-flex items-center gap-2">
                                  <span className="bg-[color:var(--label-pink)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {dlist.length} เอกสาร
                                  </span>
                                  {me.is_admin && <span className="text-xs text-primary">🔓 Admin</span>}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {pwDialog && (
        <PasswordDialog
          person={pwDialog.personName}
          onClose={() => setPwDialog(null)}
          onSuccess={() => {
            sessionStorage.setItem(SESSION_KEY(normPerson(pwDialog.personName)), "1");
            setActivePerson(pwDialog);
            setPwDialog(null);
          }}
        />
      )}
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

function PasswordDialog({
  person, onClose, onSuccess,
}: { person: string; onClose: () => void; onSuccess: () => void }) {
  const sessKey = normPerson(person);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [blockRemain, setBlockRemain] = useState(getBlockRemaining(sessKey));

  useEffect(() => {
    if (blockRemain <= 0) return;
    const id = setInterval(() => setBlockRemain(getBlockRemaining(sessKey)), 1000);
    return () => clearInterval(id);
  }, [sessKey, blockRemain]);

  async function submit() {
    if (blockRemain > 0) return;
    if (!pwd) return toast.error("กรุณากรอกรหัสผ่าน");
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_person_receive_password", {
      _display_name: person, _password: pwd,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data === true) {
      localStorage.removeItem(FAIL_KEY(sessKey));
      localStorage.removeItem(BLOCK_KEY(sessKey));
      toast.success("ปลดล็อกสำเร็จ");
      onSuccess();
    } else {
      const fails = parseInt(localStorage.getItem(FAIL_KEY(sessKey)) || "0", 10) + 1;
      localStorage.setItem(FAIL_KEY(sessKey), String(fails));
      if (fails >= 3) {
        localStorage.setItem(BLOCK_KEY(sessKey), String(Date.now()));
        localStorage.removeItem(FAIL_KEY(sessKey));
        setBlockRemain(BLOCK_MS);
        toast.error("ผิด 3 ครั้ง — ถูกบล็อก 5 นาที");
      } else {
        toast.error(`รหัสผ่านไม่ถูกต้อง (เหลืออีก ${3 - fails} ครั้ง)`);
      }
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🔐 ใส่รหัสผ่านของ: {person}</DialogTitle>
          <DialogDescription>
            กรอกรหัสผ่านส่วนตัวของคุณ (Admin ตั้งให้ในหน้าจัดการผู้ใช้)
          </DialogDescription>
        </DialogHeader>
        {blockRemain > 0 ? (
          <div className="text-center py-6">
            <div className="text-red-600 font-bold text-lg">
              ⛔ ถูกบล็อก กรุณารอ {Math.ceil(blockRemain / 1000)} วินาที
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label>รหัสผ่าน *</Label>
            <Input type="password" value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus autoComplete="off" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy || blockRemain > 0}>
            {busy ? "กำลังตรวจสอบ..." : "เข้าสู่หน้ารับทรัพย์สิน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDetail({
  doc, currentReceiverRole, onDone, onBack,
}: { doc: Doc; currentReceiverRole: string; onDone: () => void; onBack: () => void }) {
  const [saving, setSaving] = useState(false);
  const items: any[] = Array.isArray(doc.receive_items) ? doc.receive_items : [];

  async function confirm() {
    if (!confirm_native("ยืนยันรับทรัพย์สินทุกชิ้นในเอกสารนี้?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update({
        status: "รับทรัพย์สินแล้ว",
        asset_received_at: new Date().toISOString(),
        asset_receiver_role: currentReceiverRole,
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success("บันทึก: รับทรัพย์สินแล้ว");
    onDone();
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
          📥 รับทรัพย์สิน — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onBack}>← กลับ</Button>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-bold text-[color:var(--label-darkgreen)]">
          📋 รหัส/ชื่อทรัพย์สินที่ซื้อ (จากขั้นตอนที่ 6)
        </div>
        {items.length === 0 ? (
          <div className="text-muted-foreground text-sm">— ไม่พบรายการ —</div>
        ) : (
          <ol className="space-y-1 text-sm">
            {items.map((it, i) => (
              <li key={i} className="text-[color:var(--input-blue)] font-medium">
                {i + 1}. {it.assetCode || "-"} {it.assetName || ""}
                {it.quantity ? ` • ${it.quantity} ${it.unit || ""}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-bold text-[color:var(--label-darkgreen)]">
          🧾 ใบรับทรัพย์สิน & ผู้รับผิดชอบทรัพย์สิน (จากขั้นตอนที่ 6)
        </div>
        {items.length === 0 ? (
          <div className="text-muted-foreground text-sm">— ไม่พบรายการ —</div>
        ) : (
          <ol className="space-y-1 text-sm">
            {items.map((it, i) => {
              const name = (it.receiverName ?? "").toString().trim();
              const dept = (it.receiverDepartment ?? "").toString().trim();
              const personDisplay = name
                ? (dept ? `${name} (${dept})` : name)
                : "";
              return (
                <li key={i} className="text-[color:var(--input-blue)] font-medium">
                  {i + 1}. {it.requisitionNo || "-"}  {personDisplay}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-brown)] cursor-pointer">
          📜 ดูประวัติเอกสาร (Step 1–6)
        </summary>
        <div className="mt-3">
          <ProgressTimeline row={doc} />
        </div>
      </details>

      <Button
        onClick={confirm}
        disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--status-emerald)" }}
      >
        {saving ? "กำลังบันทึก..." : "✅ บันทึกยืนยันการรับทรัพย์สิน"}
      </Button>
    </div>
  );
}

function confirm_native(msg: string): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(msg);
}
