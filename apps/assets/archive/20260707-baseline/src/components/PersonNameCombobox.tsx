import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useCurrentRoleInfo } from "@/lib/role";

const labelCls = "font-bold text-[color:var(--label-brown)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";

const CATEGORY = "person_name";

type Opt = { value: string; is_active: boolean };

/**
 * ช่องชื่อพนักงาน (employee name combobox)
 * - พิมพ์เองได้ (free text) — ตอน submit auto-save เข้าตัวเลือก
 * - มี dropdown แนะนำตัวเลือก (filter ตามคำพิมพ์, ตัด is_active=false ออก)
 * - admin: เพิ่ม / แก้ไข / เปิด-ปิดใช้งาน / ลบ
 * - placeholder "ชื่อxxนามสกุล" สีแดง
 */
export default function PersonNameCombobox({
  value,
  onChange,
  placeholder = "ชื่อxxนามสกุล",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const info = useCurrentRoleInfo();
  const isAdmin = !!info?.is_admin;
  const [opts, setOpts] = useState<Opt[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("dropdown_options")
      .select("value,is_active")
      .eq("category", CATEGORY)
      .order("sort_order")
      .order("value");
    setOpts((data ?? []) as Opt[]);
  }
  useEffect(() => { load(); }, []);

  const activeOpts = opts.filter((o) => o.is_active);
  const filtered = value.trim()
    ? activeOpts.filter((o) => o.value.toLowerCase().includes(value.trim().toLowerCase()) && o.value !== value)
    : activeOpts;

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={inputCls + " placeholder:text-red-500 placeholder:font-bold"}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                className={"w-full text-left px-3 py-1.5 text-sm hover:bg-accent " + inputCls}
              >
                {o.value}
              </button>
            ))}
          </div>
        )}
      </div>

      {isAdmin && <AdminPanel opts={opts} reload={load} onPick={(v) => onChange(v)} />}
    </div>
  );
}

function AdminPanel({ opts, reload, onPick }: { opts: Opt[]; reload: () => void; onPick: (v: string) => void }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function add() {
    const v = adding.trim();
    if (!v) return;
    const existing = opts.find((o) => o.value === v);
    if (existing) {
      if (existing.is_active) return toast.error("มีชื่อนี้อยู่แล้ว");
      const { error } = await supabase
        .from("dropdown_options")
        .update({ is_active: true })
        .eq("category", CATEGORY).eq("value", v);
      if (error) return toast.error("เปิดใช้งานไม่สำเร็จ");
      toast.success("เปิดใช้งานชื่อเดิมแล้ว");
    } else {
      const { error } = await supabase
        .from("dropdown_options")
        .insert({ category: CATEGORY, value: v, sort_order: 999, is_active: true });
      if (error) return toast.error("เพิ่มไม่สำเร็จ");
      toast.success("เพิ่มแล้ว");
    }
    setAdding("");
    reload();
  }
  async function save(oldVal: string) {
    const v = draft.trim();
    if (!v) return toast.error("ห้ามเว้นว่าง");
    if (v !== oldVal && opts.some((o) => o.value === v)) return toast.error("มีชื่อนี้อยู่แล้ว");
    const { error } = await supabase
      .from("dropdown_options")
      .update({ value: v })
      .eq("category", CATEGORY).eq("value", oldVal);
    if (error) return toast.error("แก้ไขไม่สำเร็จ");
    setEditing(null); setDraft("");
    toast.success("แก้ไขแล้ว");
    reload();
  }
  async function toggle(o: Opt) {
    if (o.is_active && !confirm(`ปิดการใช้งาน "${o.value}" ?`)) return;
    const { error } = await supabase
      .from("dropdown_options")
      .update({ is_active: !o.is_active })
      .eq("category", CATEGORY).eq("value", o.value);
    if (error) return toast.error("ไม่สำเร็จ");
    toast.success(o.is_active ? "ปิดการใช้งานแล้ว" : "เปิดการใช้งานแล้ว");
    reload();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" title="จัดการรายชื่อ (Admin)">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <Label className={labelCls}>เพิ่มชื่อใหม่</Label>
          <div className="flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className={inputCls}
              placeholder="ชื่อ-นามสกุล"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <Button size="sm" onClick={add}>เพิ่ม</Button>
          </div>
          {opts.length > 0 && (
            <>
              <div className="border-t pt-2 mt-2">
                <Label className={labelCls}>จัดการรายชื่อ ({opts.length})</Label>
                <div className="text-xs text-muted-foreground">ปิดใช้งาน = ไม่โผล่ใน dropdown แต่ของเก่ายังแสดงปกติ</div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {opts.map((o) => {
                  return (
                    <div key={o.value} className={"flex items-center justify-between gap-1 text-sm " + (o.is_active ? "" : "opacity-50")}>
                      {editing === o.value ? (
                        <>
                          <Input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className={inputCls + " h-7 text-sm"}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") save(o.value); if (e.key === "Escape") setEditing(null); }}
                          />
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => save(o.value)}><Check className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => onPick(o.value)} className={inputCls + " truncate flex-1 text-left hover:underline"}>
                            {o.value}{!o.is_active && <span className="ml-1 text-xs text-muted-foreground">(ปิด)</span>}
                          </button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(o.value); setDraft(o.value); }} title="แก้ไข">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className={"h-7 w-7 " + (o.is_active ? "text-amber-600" : "text-green-600")}
                            title={o.is_active ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
                            onClick={() => toggle(o)}
                          >
                            {o.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Auto-save: ถ้าชื่อยังไม่มีในตัวเลือก → insert เพื่อให้ครั้งหน้าโผล่ใน dropdown */
export async function ensurePersonNameOption(name: string) {
  const v = (name ?? "").trim();
  if (!v) return;
  const { data } = await supabase
    .from("dropdown_options")
    .select("value")
    .eq("category", CATEGORY)
    .eq("value", v)
    .maybeSingle();
  if (data) return;
  await supabase
    .from("dropdown_options")
    .insert({ category: CATEGORY, value: v, sort_order: 999, is_active: true });
}
