import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoleInfo, useCurrentRole } from "@/lib/role";

// Identity badge only — deliberately no logout action here. Logging out is
// CentralHub's job (AssetsNav / central-hub's own logout), not a duplicate,
// confusing affordance inside a third-party app's content area. This badge
// still shows which workflow role/step the current browser session is
// acting as — that's still meaningful and independent of CentralHub
// identity until the deferred identity->role_code mapping (README §13)
// lands.
export default function RoleSwitcher() {
  const info = useCurrentRoleInfo();
  if (!info) return null;
  return (
    <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-sm">
      <span className="text-sm font-bold text-[color:var(--label-brown)]">
        👤 {info.role_code} — {info.display_name}
        {info.is_admin && <span className="ml-1 text-xs text-primary">(Admin)</span>}
      </span>
    </div>
  );
}

// ขั้นตอนที่จำกัดสิทธิ์เฉพาะ role_code ที่ระบุ (hardcoded) — แม้จะตั้ง step_access ใน role อื่นก็เข้าไม่ได้
const STEP_ROLE_WHITELIST: Record<number, string[]> = {
  7: ["ADM01", "AST01"],
};

export function useHasStepAccess(step: number) {
  const role = useCurrentRole();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!role) { setAllowed(false); return; }
    const whitelist = STEP_ROLE_WHITELIST[step];
    if (whitelist && !whitelist.includes(role)) {
      setAllowed(false);
      return;
    }
    supabase
      .from("role_assignments")
      .select("step_access,is_admin")
      .eq("role_code", role)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setAllowed(false);
        setAllowed(data.is_admin || (data.step_access as number[]).includes(step));
      });
  }, [role, step]);
  return allowed;
}
