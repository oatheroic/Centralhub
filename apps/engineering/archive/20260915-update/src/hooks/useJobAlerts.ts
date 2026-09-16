import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Job = {
  id: string;
  job_code: string;
  title: string;
  status: string;
  reporter_id: string;
  assigned_to: string | null;
  department_id: string | null;
};

type AlertCondition = (newRow: Job, oldRow: Job | null) => string | null;

let audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    const beep = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = "sine";
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(880, 0, 0.18);
    beep(1320, 0.22, 0.22);
  } catch {
    /* noop */
  }
}

/**
 * Subscribes to repair_jobs realtime; calls condition() on every change.
 * If condition returns a message, plays sound + shows toast popup.
 */
export function useJobAlerts(condition: AlertCondition, deps: unknown[] = []) {
  const condRef = useRef(condition);
  condRef.current = condition;

  useEffect(() => {
    const channel = supabase
      .channel(`job-alerts-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "repair_jobs" },
        (payload) => {
          const msg = condRef.current(payload.new as Job, null);
          if (msg) { playBeep(); toast.success(msg, { duration: 8000 }); }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "repair_jobs" },
        (payload) => {
          const msg = condRef.current(payload.new as Job, payload.old as Job);
          if (msg) { playBeep(); toast.success(msg, { duration: 8000 }); }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
