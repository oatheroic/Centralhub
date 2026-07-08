import { useEffect, useMemo, useState } from "react";
import AssetPurchaseForm from "@/components/AssetPurchaseForm";
import ApproverPanel from "@/components/ApproverPanel";
import AssetRegistrationPanel from "@/components/AssetRegistrationPanel";
import PurchasingPanel from "@/components/PurchasingPanel";
import WriteOffPanel from "@/components/WriteOffPanel";
import AssetReceivePanel from "@/components/AssetReceivePanel";
import AssetReceiveByDeptPanel from "@/components/AssetReceiveByDeptPanel";
import AssetTransferPanel from "@/components/AssetTransferPanel";
import PasswordManagerPanel from "@/components/PasswordManagerPanel";
import PersonReceivePasswordPanel from "@/components/PersonReceivePasswordPanel";
import DepartmentFixPanel from "@/components/DepartmentFixPanel";
import RoleRulesPanel from "@/components/RoleRulesPanel";
import InternalReport from "@/components/InternalReport";
import RoleSwitcher from "@/components/RoleSwitcher";
import LoginForm from "@/components/LoginForm";
import { AssetsNav } from "@/components/AssetsNav";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentRoleInfo, setCurrentRole, type RoleInfo } from "@/lib/role";
import { supabase, getResolvedRoleCode } from "@/integrations/supabase/client";

const ALL_STEPS = [
  { value: "step1", step: 1, label: "1️⃣ ผู้นำเสนอ", Comp: AssetPurchaseForm },
  { value: "step2", step: 2, label: "2️⃣ ผู้อนุมัติ", Comp: ApproverPanel },
  { value: "step3", step: 3, label: "3️⃣ ตั้งรหัสทรัพย์สิน", Comp: AssetRegistrationPanel },
  { value: "step3_1", step: 31, label: "📥 3.1 รับทรัพย์สิน", Comp: AssetReceiveByDeptPanel },
  { value: "step4", step: 4, label: "4️⃣ จัดซื้อ", Comp: PurchasingPanel },
  { value: "step5", step: 5, label: "5️⃣ ตัดทรัพย์สิน", Comp: WriteOffPanel },
  { value: "step6", step: 6, label: "6️⃣ รับ&จ่ายทรัพย์สิน", Comp: AssetReceivePanel },
  { value: "step7", step: 7, label: "7️⃣ โอนความรับผิดชอบทรัพย์สิน", Comp: AssetTransferPanel },
];

export default function App() {
  const info = useCurrentRoleInfo();

  const allowedSteps = useMemo(() => {
    if (!info) return [];
    // ขั้นตอนที่จำกัดสิทธิ์เฉพาะ role_code ที่ระบุ
    const STEP_ROLE_WHITELIST: Record<number, string[]> = { 7: ["ADM01", "AST01"] };
    const passWhitelist = (step: number) => {
      const wl = STEP_ROLE_WHITELIST[step];
      return !wl || wl.includes(info.role_code);
    };
    // step 31 (3.1 รับทรัพย์สิน) เปิดให้ทุก role ที่ login แล้ว — มี password gate ภายใน
    const STEP_OPEN_TO_ALL = new Set<number>([31]);
    const base = info.is_admin
      ? ALL_STEPS.filter((s) => passWhitelist(s.step))
      : ALL_STEPS.filter(
          (s) =>
            (info.step_access?.includes(s.step) || STEP_OPEN_TO_ALL.has(s.step)) &&
            passWhitelist(s.step),
        );
    const canReport =
      info.is_admin ||
      info.step_access?.includes(2) ||
      info.step_access?.includes(3);
    const extras: typeof ALL_STEPS = [];
    if (canReport) {
      extras.push({ value: "report", step: 90, label: "📊 รายงานบันทึกภายใน", Comp: InternalReport });
    }
    if (info.is_admin) {
      extras.push({ value: "admin", step: 99, label: "⚙️ จัดการผู้ใช้งาน", Comp: PasswordManagerPanel });
      extras.push({ value: "person_pw", step: 98, label: "🔐 รหัสรับทรัพย์สินรายบุคคล", Comp: PersonReceivePasswordPanel });
      extras.push({ value: "dept_fix", step: 97, label: "🏢 แก้ไขแผนกผู้รับผิดชอบ", Comp: DepartmentFixPanel });
      extras.push({ value: "role_rules", step: 96, label: "🔗 กฎเชื่อมสิทธิ์", Comp: RoleRulesPanel });
    }
    return [...base, ...extras];
  }, [info]);

  // Auto-login: if the CentralHub session resolves to a role_code (via
  // department/position/job level matching one of this app's rules, see
  // RoleRulesPanel), log straight into that role — skipping the manual
  // picker below entirely. Runs on every mount regardless of whatever's
  // already in localStorage (`info`) — a resolved role_code is tied to the
  // current CentralHub identity and must win over a stale manual pick left
  // over from a previous, possibly different, Keycloak login on this same
  // browser (localStorage isn't cleared on Keycloak logout — see README
  // §10). Only when nothing resolves does existing localStorage state (or
  // the picker, if there's none) stay in effect.
  const [autoLoginChecked, setAutoLoginChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const roleCode = await getResolvedRoleCode();
      if (cancelled) return;
      if (!roleCode) {
        setAutoLoginChecked(true);
        return;
      }
      const { data } = await supabase
        .from("role_assignments")
        .select("role_code,display_name,step_access,is_admin")
        .eq("role_code", roleCode)
        .maybeSingle();
      if (!cancelled) {
        if (data) setCurrentRole(data.role_code, data as RoleInfo);
        setAutoLoginChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately run-once (mount only), not on every `info` change —
    // setCurrentRole below dispatches a "role-changed" event that updates
    // `info`, which would otherwise re-trigger this effect on its own
    // write and loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!autoLoginChecked) {
    return (
      <>
        <AssetsNav />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  if (!info) {
    return (
      <>
        <AssetsNav />
        <LoginForm />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <>
      <AssetsNav />
      <div className="min-h-screen bg-muted/30 py-8">
        <div className="max-w-4xl mx-auto px-6 mb-4 flex justify-end">
          <RoleSwitcher />
        </div>
        {allowedSteps.length === 0 ? (
          <div className="max-w-4xl mx-auto px-6">
            <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
              ผู้ใช้นี้ยังไม่มีสิทธิ์เข้าถึงขั้นตอนใด ๆ กรุณาติดต่อผู้ดูแลระบบ
            </div>
          </div>
        ) : (
          <Tabs defaultValue={allowedSteps[0].value} className="max-w-4xl mx-auto px-6">
            <TabsList className="mb-4 flex-wrap h-auto">
              {allowedSteps.map((s) => (
                <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
            {allowedSteps.map((s) => (
              <TabsContent key={s.value} value={s.value}><s.Comp /></TabsContent>
            ))}
          </Tabs>
        )}
        <Toaster richColors position="top-right" />
      </div>
    </>
  );
}
