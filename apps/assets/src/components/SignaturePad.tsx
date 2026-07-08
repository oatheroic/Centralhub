import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const inputCls = "text-[color:var(--input-darkgreen)] font-medium";

export default function SignaturePad({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState("type");
  const [typed, setTyped] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0a3d2c";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [tab]);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width),
             y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function end() { drawing.current = false; }

  function clearCanvas() {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  }

  async function uploadDataUrl(dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `signatures/${Date.now()}.png`;
    const { error } = await supabase.storage.from("asset-images")
      .upload(path, blob, { contentType: "image/png" });
    if (error) { toast.error("อัปโหลดลายเซ็นไม่สำเร็จ"); return; }
    const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("บันทึกลายเซ็นแล้ว");
  }

  async function saveDraw() {
    const c = canvasRef.current!;
    await uploadDataUrl(c.toDataURL("image/png"));
  }

  async function uploadFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const path = `signatures/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("asset-images")
      .upload(path, f, { contentType: f.type });
    if (error) { toast.error("อัปโหลดไม่สำเร็จ"); return; }
    const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("อัปโหลดลายเซ็นแล้ว");
  }

  function saveTyped() {
    if (!typed.trim()) return toast.error("กรุณาพิมพ์ชื่อ");
    onChange(`text:${typed.trim()}`);
    toast.success("บันทึกลายเซ็นแล้ว");
  }

  const isText = value.startsWith("text:");
  const display = isText ? value.slice(5) : value;

  return (
    <div className="space-y-2">
      {value && (
        <div className="border rounded p-2 bg-muted/30 flex items-center gap-3">
          <span className="text-xs font-bold text-[color:var(--label-brown)]">ปัจจุบัน:</span>
          {isText ? (
            <span className="font-bold text-lg" style={{ fontFamily: "cursive" }}>{display}</span>
          ) : (
            <img src={display} alt="signature" className="h-12" />
          )}
          <Button type="button" variant="ghost" size="sm"
            onClick={() => onChange("")}>เปลี่ยน</Button>
        </div>
      )}

      {!value && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="type">⌨️ พิมพ์ชื่อ</TabsTrigger>
            <TabsTrigger value="draw">✍️ วาด</TabsTrigger>
            <TabsTrigger value="upload">📁 อัปโหลด</TabsTrigger>
          </TabsList>
          <TabsContent value="type" className="space-y-2">
            <Input className={inputCls} value={typed}
              onChange={(e) => setTyped(e.target.value)} placeholder="ชื่อ-นามสกุล" />
            <Button type="button" size="sm" onClick={saveTyped}>บันทึก</Button>
          </TabsContent>
          <TabsContent value="draw" className="space-y-2">
            <canvas ref={canvasRef} width={500} height={150}
              className="border rounded w-full bg-white touch-none"
              onPointerDown={start} onPointerMove={move}
              onPointerUp={end} onPointerLeave={end} />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={saveDraw}>บันทึก</Button>
              <Button type="button" size="sm" variant="outline" onClick={clearCanvas}>ล้าง</Button>
            </div>
          </TabsContent>
          <TabsContent value="upload">
            <Input type="file" accept="image/*" className={inputCls}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
