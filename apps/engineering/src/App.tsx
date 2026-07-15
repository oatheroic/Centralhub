import { useState } from "react";
import { History } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import AdminPage from "@/pages/AdminPage";
import LeaderPage from "@/pages/LeaderPage";
import RepairerPage from "@/pages/RepairerPage";
import ReporterPage from "@/pages/ReporterPage";
import HistoryPage from "@/pages/HistoryPage";

// Replaces TanStack Router's file-based /admin, /leader, /repairer,
// /reporter, /history routes with a single role-gated switch — CentralHub
// is the only login (§6/§7), so there's no "/" login page to route from
// anymore, only "which page does this resolved role see". Mirrors
// apps/assets's App.tsx (role_code-driven tab switch), the established
// pattern for this repo's third-party ingestions.
function Shell() {
  const { loading, role } = useAuth();
  const [showHistory, setShowHistory] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        กำลังโหลด…
      </div>
    );
  }

  if (showHistory) {
    return <HistoryPage onBack={() => setShowHistory(false)} />;
  }

  if (!role) {
    return (
      <>
        <AppHeader subtitle="ไม่มีสิทธิ์เข้าถึง" />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <p className="text-muted-foreground">
            บัญชีของคุณยังไม่มีสิทธิ์ใช้งานระบบนี้ กรุณาติดต่อผู้ดูแลระบบให้กำหนดสิทธิ์
            (แผนก/ตำแหน่ง/ระดับ) ให้ตรงกับกฎการเข้าถึงของแอปนี้
          </p>
          <Button variant="outline" onClick={() => setShowHistory(true)}>
            <History className="size-4 mr-1" /> ดูประวัติรายการแจ้งซ่อม
          </Button>
        </div>
      </>
    );
  }

  const Page =
    role === "admin" ? AdminPage :
    role === "leader" ? LeaderPage :
    role === "repairer" ? RepairerPage :
    role === "reporter" ? ReporterPage :
    null;

  return (
    <>
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-2">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
          <History className="size-4 mr-1" /> ประวัติรายการแจ้งซ่อม
        </Button>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {Page ? (
          <Page />
        ) : (
          // "department_head" is enum-only in this export — the original
          // app never shipped a dedicated page for it (only admin/leader/
          // repairer/reporter have one). Flagged in README §13 rather than
          // built here, since there's no reference UI to carry over.
          <div className="card-soft p-10 text-center text-muted-foreground">
            บทบาทนี้ยังไม่มีหน้าจอใช้งานในระบบ กรุณาติดต่อผู้ดูแลระบบ
          </div>
        )}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
