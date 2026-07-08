import { useEffect, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Skeleton,
  ToastProvider,
  useToast,
  type DataTableColumn,
} from "@centralhub/ui";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

type UserAttributes = { department: string; position: string; jobLevel: string };
const EMPTY_ATTRS: UserAttributes = { department: "", position: "", jobLevel: "" };

type PermissionSet = { read: boolean; write: boolean; edit: boolean; delete: boolean };

type PermissionMatrix = {
  users: { id: string; name: string; email: string }[];
  apps: string[];
  permissions: Record<string, Record<string, PermissionSet>>;
};

const VERBS: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];

function PermissionsPanel() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/auth/admin/permissions", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<PermissionMatrix>;
      })
      .then(setMatrix)
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  async function toggle(userId: string, appId: string, verb: keyof PermissionSet) {
    if (!matrix) return;
    const current = matrix.permissions[userId][appId];
    const next = { ...current, [verb]: !current[verb] };

    // Optimistic update — no separate "save" step.
    setMatrix({
      ...matrix,
      permissions: { ...matrix.permissions, [userId]: { ...matrix.permissions[userId], [appId]: next } },
    });

    try {
      const res = await fetch(`/auth/admin/permissions/${userId}/${appId}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      // Roll back on failure.
      setMatrix({
        ...matrix,
        permissions: { ...matrix.permissions, [userId]: { ...matrix.permissions[userId], [appId]: current } },
      });
      toast.show({
        tone: "danger",
        title: "Couldn't save permission",
        description: (err as Error).message,
      });
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text">Permissions</h2>
        <p className="text-text-muted">
          Per-user, per-app read/write/edit/delete grants. Toggling a checkbox saves immediately.
        </p>
      </header>

      {loadError && (
        <p className="text-sm text-danger">Failed to load permissions: {loadError}</p>
      )}

      {!loadError && !matrix && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {matrix && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="border-b border-border px-4 py-2 font-medium">User</th>
                {matrix.apps.map((appId) => (
                  <th key={appId} className="border-b border-border px-4 py-2 font-medium">
                    {appId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matrix.users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 align-top">
                    <div className="text-text">{user.name}</div>
                    <div className="text-text-muted">{user.email}</div>
                  </td>
                  {matrix.apps.map((appId) => {
                    const permission = matrix.permissions[user.id][appId];
                    return (
                      <td key={appId} className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          {VERBS.map((verb) => (
                            <label key={verb} className="flex items-center gap-2 text-text-muted">
                              <input
                                type="checkbox"
                                checked={permission[verb]}
                                onChange={() => toggle(user.id, appId, verb)}
                              />
                              {verb}
                            </label>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);
  // Drafts, keyed by user id — edited locally as the admin types, saved on
  // blur (not per-keystroke). Required fields (department/position/
  // jobLevel), enforced client-side by refusing to save while any is
  // blank — these feed apps/assets's (and any future app's) identity ->
  // role_code mapping, see services/auth-gateway/src/attributes.ts.
  const [attrDrafts, setAttrDrafts] = useState<Record<string, UserAttributes>>({});
  const toast = useToast();

  useEffect(() => {
    fetch("/auth/admin/users", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<AdminUser[]>;
      })
      .then(setUsers)
      .catch((err) => setLoadError((err as Error).message));

    // Needed to hide the "Revoke session" action on the logged-in admin's
    // own row — there's no recovery path in this UI if an admin locks
    // themselves out, so the server also rejects self-revocation, but
    // hiding the button avoids the confusing "why did that fail" moment.
    fetch("/auth/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<{ sub: string }>) : null))
      .then((me) => setOwnId(me?.sub ?? null));

    fetch("/auth/admin/users/attributes", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, UserAttributes>>) : {}))
      .then(setAttrDrafts);
  }, []);

  function editAttr(userId: string, field: keyof UserAttributes, value: string) {
    setAttrDrafts((prev) => ({ ...prev, [userId]: { ...(prev[userId] ?? EMPTY_ATTRS), [field]: value } }));
  }

  async function saveAttrs(userId: string) {
    const draft = attrDrafts[userId] ?? EMPTY_ATTRS;
    if (!draft.department.trim() || !draft.position.trim() || !draft.jobLevel.trim()) return;
    try {
      const res = await fetch(`/auth/admin/users/${userId}/attributes`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      toast.show({
        tone: "danger",
        title: "Couldn't save attributes",
        description: (err as Error).message,
      });
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    const { id, name } = revokeTarget;
    try {
      const res = await fetch(`/auth/admin/sessions/${id}/revoke`, {
        method: "PUT",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast.show({ tone: "success", title: `Session revoked for ${name}` });
    } catch (err) {
      toast.show({
        tone: "danger",
        title: `Couldn't revoke session for ${name}`,
        description: (err as Error).message,
      });
    }
  }

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: "name",
      header: "Name",
      render: (user) => user.name,
      sortValue: (user) => user.name.toLowerCase(),
    },
    {
      key: "email",
      header: "Email",
      render: (user) => <span className="text-text-muted">{user.email}</span>,
      sortValue: (user) => user.email.toLowerCase(),
    },
    {
      key: "roles",
      header: "Roles",
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <Badge key={role} tone="success">
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (user) => (
        <Input
          value={attrDrafts[user.id]?.department ?? ""}
          placeholder="Required"
          className="h-8 w-28"
          onChange={(e) => editAttr(user.id, "department", e.target.value)}
          onBlur={() => saveAttrs(user.id)}
        />
      ),
    },
    {
      key: "position",
      header: "Position",
      render: (user) => (
        <Input
          value={attrDrafts[user.id]?.position ?? ""}
          placeholder="Required"
          className="h-8 w-28"
          onChange={(e) => editAttr(user.id, "position", e.target.value)}
          onBlur={() => saveAttrs(user.id)}
        />
      ),
    },
    {
      key: "jobLevel",
      header: "Job level",
      render: (user) => (
        <Input
          value={attrDrafts[user.id]?.jobLevel ?? ""}
          placeholder="Required"
          className="h-8 w-28"
          onChange={(e) => editAttr(user.id, "jobLevel", e.target.value)}
          onBlur={() => saveAttrs(user.id)}
        />
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (user) =>
        user.id === ownId ? (
          <span className="text-text-muted">(you)</span>
        ) : (
          <Button variant="danger" onClick={() => setRevokeTarget(user)}>
            Revoke session
          </Button>
        ),
    },
  ];

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text">Users</h2>
        <p className="text-text-muted">Users registered in Keycloak.</p>
      </header>

      {loadError && <p className="text-sm text-danger">Failed to load users: {loadError}</p>}

      {!loadError && (
        <DataTable
          columns={columns}
          rows={users ?? []}
          getRowId={(user) => user.id}
          searchFields={(user) => [user.name, user.email]}
          searchPlaceholder="Search by name or email..."
          loading={users === null}
          emptyTitle="No users found"
          emptyDescription="No users match your search."
        />
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={`Revoke session for ${revokeTarget?.name ?? ""}?`}
        description="They'll be signed out immediately and required to log in again."
        confirmLabel="Revoke session"
        danger
        onConfirm={confirmRevoke}
      />
    </section>
  );
}

type Tab = "users" | "permissions";

export default function App() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <ToastProvider>
      <AppShell
        title="Admin"
        actions={
          <nav className="flex gap-2">
            <Button variant={tab === "users" ? "primary" : "secondary"} onClick={() => setTab("users")}>
              Users
            </Button>
            <Button
              variant={tab === "permissions" ? "primary" : "secondary"}
              onClick={() => setTab("permissions")}
            >
              Permissions
            </Button>
          </nav>
        }
      >
        <div className="space-y-10">
          {tab === "users" ? <UsersPanel /> : <PermissionsPanel />}
        </div>
      </AppShell>
    </ToastProvider>
  );
}
