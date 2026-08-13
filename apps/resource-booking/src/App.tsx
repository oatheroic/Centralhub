import { AppShell, ToastProvider } from "@centralhub/ui";
import { usePermissions, useReadGuard } from "./lib/usePermissions";
import { BookingBoard } from "./components/BookingBoard";
import { ManageRooms } from "./components/ManageRooms";

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { permissions, loading } = usePermissions();
  const denied = useReadGuard(permissions, loading);

  if (denied) {
    return (
      <main
        onClick={() => {
          window.location.href = "/";
        }}
        className="min-h-screen bg-bg text-text-muted flex flex-col items-center justify-center gap-2 p-8 cursor-pointer"
      >
        <h1 className="text-xl font-semibold text-text">Access denied</h1>
        <p className="text-sm text-text-muted">Click anywhere to go back to the dashboard.</p>
      </main>
    );
  }

  const canManageRooms = permissions?.edit || permissions?.delete;

  return (
    <AppShell title="Resource Booking">
      <div className="flex flex-col gap-6">
        <BookingBoard permissions={permissions} />
        {canManageRooms && <ManageRooms permissions={permissions} />}
      </div>
    </AppShell>
  );
}
