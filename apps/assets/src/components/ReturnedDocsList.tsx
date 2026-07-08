import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import EditReturnedDoc from "./EditReturnedDoc";
// formatDate import removed (no longer used)

const labelCls = "font-bold text-[color:var(--label-brown)]";
const valueCls = "text-[color:var(--input-blue)] font-medium";

export default function ReturnedDocsList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [tick, setTick] = useState(0);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("asset_purchase_requests")
      .select("*")
      .eq("status", "ตีกลับแก้ไข")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [refreshKey, tick]);

  if (editing) {
    return (
      <EditReturnedDoc
        doc={editing}
        onCancel={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          setTick((n) => n + 1);
        }}
      />
    );
  }

  return (
    <div
      className="bg-card border rounded-xl p-6 shadow-sm"
      style={{
        borderColor: rows.length > 0 ? "var(--status-darkred)" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ color: "var(--status-darkred)" }}>
          📝 เอกสารที่ต้องแก้ไข ({rows.length})
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={"h-4 w-4 mr-1 " + (loading ? "animate-spin" : "")} />
          รีเฟรช
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          ไม่มีเอกสารที่ถูกตีกลับ
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const rc = r.return_count ?? 0;
            const lastReason =
              rc === 3 ? r.return_reason_3 : rc === 2 ? r.return_reason_2 : r.return_reason_1;
            return (
              <button
                key={r.id}
                onClick={() => setEditing(r)}
                className="w-full text-left border rounded-lg p-3 hover:bg-accent transition"
                style={{ borderColor: "var(--status-darkred)" }}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-0.5 flex-1">
                    <div className="text-sm">
                      <span className="text-xs font-bold text-[color:var(--label-brown)]">เลขที่เอกสาร: </span>
                      <span className="font-bold" style={{ color: "var(--doc-green)" }}>{r.doc_no}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs font-bold text-[color:var(--label-brown)]">แผนกที่นำเสนอ: </span>
                      <span className={valueCls}>{r.department}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs font-bold text-[color:var(--label-brown)]">สถานะเอกสาร: </span>
                      <span className="font-bold text-[color:var(--status-darkred)]">{r.status}</span>
                    </div>
                  </div>
                  <span className="font-bold text-[color:var(--status-darkred)] whitespace-nowrap">
                    ตีกลับครั้งที่ {rc}
                  </span>
                </div>
                {lastReason && (
                  <div className="mt-2 text-sm">
                    <span className={labelCls}>เหตุผล:</span>{" "}
                    <span className={valueCls}>{lastReason}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
