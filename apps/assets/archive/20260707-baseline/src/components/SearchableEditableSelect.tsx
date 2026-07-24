import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, EyeOff, Eye, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentRoleInfo } from "@/lib/role";
import { cn } from "@/lib/utils";

const labelCls = "font-bold text-[color:var(--label-brown)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";

type Opt = { value: string; is_active: boolean };

/**
 * Searchable dropdown backed by `dropdown_options` table.
 * Admins can add / edit / disable (และลบได้เฉพาะรายการที่เพิ่งเพิ่มในเซสชันนี้ กรณีพิมพ์ผิด).
 */
export default function SearchableEditableSelect({
  category,
  value,
  onChange,
  placeholder = "-- เลือก --",
  extraOptions = [],
  manageable = true,
}: {
  category: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  extraOptions?: string[];
  manageable?: boolean;
}) {
  const info = useCurrentRoleInfo();
  const isAdmin = !!info?.is_admin;
  const [open, setOpen] = useState(false);
  const [dbOptions, setDbOptions] = useState<Opt[]>([]);
  const [adding, setAdding] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("dropdown_options")
      .select("value,is_active")
      .eq("category", category)
      .order("sort_order");
    setDbOptions((data ?? []) as Opt[]);
  }
  useEffect(() => { load(); }, [category]);

  const activeDbValues = dbOptions.filter((o) => o.is_active).map((o) => o.value);
  const merged = Array.from(new Set([...extraOptions.filter(Boolean), ...activeDbValues]));
  // ถ้าค่าปัจจุบันถูกปิดการใช้งานไปแล้ว ให้ยังเลือกแสดงได้
  if (value && !merged.includes(value)) merged.unshift(value);

  async function add() {
    const v = adding.trim();
    if (!v) return;
    const existing = dbOptions.find((o) => o.value === v);
    if (existing) {
      if (existing.is_active) return toast.error("มีตัวเลือกนี้อยู่แล้ว");
      // เปิดใช้งานอันเดิมที่ถูกปิดไว้
      const { error } = await supabase
        .from("dropdown_options")
        .update({ is_active: true })
        .eq("category", category).eq("value", v);
      if (error) return toast.error("เปิดใช้งานไม่สำเร็จ");
      toast.success("เปิดใช้งานตัวเลือกเดิมแล้ว");
    } else {
      const { error } = await supabase
        .from("dropdown_options")
        .insert({ category, value: v, sort_order: 999 });
      if (error) return toast.error("เพิ่มไม่สำเร็จ");
      toast.success("เพิ่มตัวเลือกแล้ว");
    }
    setAdding("");
    load();
  }

  async function disable(v: string) {
    if (!confirm(`ปิดการใช้งานตัวเลือก "${v}" ?`)) return;
    const { error } = await supabase
      .from("dropdown_options")
      .update({ is_active: false })
      .eq("category", category).eq("value", v);
    if (error) return toast.error("ปิดการใช้งานไม่สำเร็จ");
    toast.success("ปิดการใช้งานแล้ว");
    load();
  }

  async function enable(v: string) {
    const { error } = await supabase
      .from("dropdown_options")
      .update({ is_active: true })
      .eq("category", category).eq("value", v);
    if (error) return toast.error("เปิดการใช้งานไม่สำเร็จ");
    toast.success("เปิดการใช้งานแล้ว");
    load();
  }



  async function saveEdit(oldVal: string) {
    const newVal = editingDraft.trim();
    if (!newVal) return toast.error("ห้ามเว้นว่าง");
    if (newVal === oldVal) { setEditingValue(null); return; }
    if (dbOptions.some((o) => o.value === newVal))
      return toast.error("มีตัวเลือกนี้อยู่แล้ว");
    const { error } = await supabase
      .from("dropdown_options")
      .update({ value: newVal })
      .eq("category", category).eq("value", oldVal);
    if (error) return toast.error("แก้ไขไม่สำเร็จ");
    if (value === oldVal) onChange(newVal);
    toast.success("แก้ไขแล้ว");
    setEditingValue(null);
    setEditingDraft("");
    load();
  }

  const visibleDbOptions = showInactive ? dbOptions : dbOptions.filter((o) => o.is_active);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn("flex-1 justify-between font-normal", inputCls)}
          >
            <span className={value ? "" : "text-muted-foreground"}>
              {value || placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[240px]" align="start">
          <Command>
            <CommandInput placeholder="ค้นหา..." />
            <CommandList>
              <CommandEmpty>ไม่พบรายการ</CommandEmpty>
              <CommandGroup>
                {merged.map((o) => (
                  <CommandItem
                    key={o}
                    value={o}
                    onSelect={() => { onChange(o); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                    <span className={inputCls}>{o}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {isAdmin && manageable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" title="จัดการตัวเลือก (ผู้ดูแลระบบ)">
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <Label className={labelCls}>เพิ่มตัวเลือกใหม่</Label>
              <div className="flex gap-2">
                <Input
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  className={inputCls}
                  onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                />
                <Button size="sm" onClick={add}>เพิ่ม</Button>
              </div>
              {dbOptions.length > 0 && (
                <>
                  <div className="border-t pt-2 mt-2 flex items-center justify-between">
                    <Label className={labelCls}>จัดการตัวเลือก</Label>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-6 text-xs"
                      onClick={() => setShowInactive((v) => !v)}
                    >
                      {showInactive ? "ซ่อนที่ปิดอยู่" : "แสดงที่ปิดอยู่"}
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {visibleDbOptions.map((opt) => {
                      const o = opt.value;
                      return (
                        <div key={o} className="flex items-center justify-between gap-2 text-sm">
                          {editingValue === o ? (
                            <>
                              <Input
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                className={inputCls + " h-7 text-sm"}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(o);
                                  if (e.key === "Escape") { setEditingValue(null); }
                                }}
                              />
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(o)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingValue(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className={cn(inputCls, "truncate flex-1", !opt.is_active && "line-through opacity-50")}>
                                {o}
                              </span>
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="แก้ไข" onClick={() => { setEditingValue(o); setEditingDraft(o); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {opt.is_active ? (
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="ปิดการใช้งาน" onClick={() => disable(o)}>
                                    <EyeOff className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="เปิดการใช้งาน" onClick={() => enable(o)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
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
      )}
    </div>
  );
}
