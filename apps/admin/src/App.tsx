import { useEffect, useMemo, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Select,
  Skeleton,
  ToastProvider,
  useToast,
  type DataTableColumn,
} from "@centralhub/ui";
import { AttributeSelect } from "./components/AttributeSelect";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

type UserAttributes = { department: string; position: string; jobLevel: string };
const EMPTY_ATTRS: UserAttributes = { department: "", position: "", jobLevel: "" };

// Matches auth-gateway's attribute_values.kind values (snake_case, mirrors
// the user_attributes column names) — jobLevel's kind is "job_level".
type AttributeKind = "department" | "position" | "job_level";
const EMPTY_ATTRIBUTE_VALUES: Record<AttributeKind, string[]> = {
  department: [],
  position: [],
  job_level: [],
};

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
  // App is a filter, not a column — this is what keeps the panel's layout
  // O(1) in the number of apps instead of growing 4 checkbox columns wider
  // per app (the old matrix layout, which overflowed horizontally past a
  // handful of apps). Defaulted once the matrix loads, in the effect below.
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/auth/admin/permissions", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<PermissionMatrix>;
      })
      .then((data) => {
        setMatrix(data);
        setSelectedApp((prev) => prev ?? data.apps[0] ?? null);
      })
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
      const userName = matrix.users.find((u) => u.id === userId)?.name;
      const res = await fetch(`/auth/admin/permissions/${userId}/${appId}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, userName }),
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

  const columns = useMemo<DataTableColumn<PermissionMatrix["users"][number]>[]>(() => {
    if (!matrix || !selectedApp) return [];
    return [
      {
        key: "user",
        header: "User",
        render: (user) => (
          <div>
            <div className="text-text">{user.name}</div>
            <div className="text-text-muted">{user.email}</div>
          </div>
        ),
        sortValue: (user) => user.name.toLowerCase(),
      },
      ...VERBS.map((verb) => ({
        key: verb,
        header: verb,
        render: (user: PermissionMatrix["users"][number]) => (
          <input
            type="checkbox"
            checked={matrix.permissions[user.id][selectedApp][verb]}
            onChange={() => toggle(user.id, selectedApp, verb)}
          />
        ),
      })),
    ];
  }, [matrix, selectedApp]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text">Permissions</h2>
        <p className="text-text-muted">
          Pick an app, then grant read/write/edit/delete per user. Toggling a checkbox saves immediately.
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

      {matrix && selectedApp && (
        <div className="space-y-4">
          <Select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="h-9 w-56"
          >
            {matrix.apps.map((appId) => (
              <option key={appId} value={appId}>
                {appId}
              </option>
            ))}
          </Select>

          <DataTable
            columns={columns}
            rows={matrix.users}
            getRowId={(user) => user.id}
            searchFields={(user) => [user.name, user.email]}
            searchPlaceholder="Search by name or email..."
            emptyTitle="No users found"
            emptyDescription="No users match your search."
          />
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
  // Drafts, keyed by user id — each AttributeSelect change saves
  // immediately (see handleAttrChange below). Required fields (department/
  // position/jobLevel), enforced client-side by refusing to save while any
  // is blank — these feed apps/assets's (and any future app's) identity ->
  // role_code mapping, see services/auth-gateway/src/attributes.ts.
  const [attrDrafts, setAttrDrafts] = useState<Record<string, UserAttributes>>({});
  const [attributeValues, setAttributeValues] = useState<Record<AttributeKind, string[]>>(
    EMPTY_ATTRIBUTE_VALUES,
  );
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

    (["department", "position", "job_level"] as const).forEach((kind) => {
      fetch(`/auth/admin/attribute-values/${kind}`, { credentials: "same-origin" })
        .then((res) => (res.ok ? (res.json() as Promise<string[]>) : []))
        .then((values) => setAttributeValues((prev) => ({ ...prev, [kind]: values })));
    });
  }, []);

  async function saveAttrs(userId: string, draft: UserAttributes) {
    if (!draft.department.trim() || !draft.position.trim() || !draft.jobLevel.trim()) return;
    try {
      const userName = users?.find((u) => u.id === userId)?.name;
      const res = await fetch(`/auth/admin/users/${userId}/attributes`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, userName }),
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

  // Select changes are already a discrete, complete edit (unlike each
  // keystroke in a text input) — save immediately instead of waiting for
  // blur. Passes the merged draft straight through since the setAttrDrafts
  // update below hasn't landed in state yet at this point in the function.
  function handleAttrChange(userId: string, field: keyof UserAttributes, value: string) {
    const next = { ...(attrDrafts[userId] ?? EMPTY_ATTRS), [field]: value };
    setAttrDrafts((prev) => ({ ...prev, [userId]: next }));
    void saveAttrs(userId, next);
  }

  async function addAttributeValue(kind: AttributeKind, value: string) {
    try {
      const res = await fetch(`/auth/admin/attribute-values/${kind}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const values = (await res.json()) as string[];
      setAttributeValues((prev) => ({ ...prev, [kind]: values }));
    } catch (err) {
      toast.show({
        tone: "danger",
        title: "Couldn't add value",
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
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
        <AttributeSelect
          value={attrDrafts[user.id]?.department ?? ""}
          options={attributeValues.department}
          placeholder="Select department"
          onChange={(value) => handleAttrChange(user.id, "department", value)}
          onAddOption={(value) => addAttributeValue("department", value)}
        />
      ),
    },
    {
      key: "position",
      header: "Position",
      render: (user) => (
        <AttributeSelect
          value={attrDrafts[user.id]?.position ?? ""}
          options={attributeValues.position}
          placeholder="Select position"
          onChange={(value) => handleAttrChange(user.id, "position", value)}
          onAddOption={(value) => addAttributeValue("position", value)}
        />
      ),
    },
    {
      key: "jobLevel",
      header: "Job level",
      render: (user) => (
        <AttributeSelect
          value={attrDrafts[user.id]?.jobLevel ?? ""}
          options={attributeValues.job_level}
          placeholder="Select job level"
          onChange={(value) => handleAttrChange(user.id, "jobLevel", value)}
          onAddOption={(value) => addAttributeValue("job_level", value)}
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

type AuditRow = {
  id: number;
  at: string;
  actorSub: string | null;
  actorName: string;
  action: string;
  targetSub: string | null;
  targetName: string | null;
  appId: string | null;
  detail: unknown;
};

// Detail's shape depends on `action` (see auth-gateway's audit.ts) — this
// only ever renders rows this same admin panel (or the auth-gateway routes
// it drives) has itself produced, so a per-action switch covering exactly
// those shapes is safe; unrecognized actions still fall back to raw JSON
// rather than throwing.
function summarizeAuditDetail(row: AuditRow): string {
  const detail = (row.detail ?? {}) as Record<string, any>;
  switch (row.action) {
    case "permission.update": {
      const verbs: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];
      const changes = verbs
        .filter((v) => detail.before?.[v] !== detail.after?.[v])
        .map((v) => `${v}: ${detail.before?.[v] ? "✓" : "✗"} → ${detail.after?.[v] ? "✓" : "✗"}`);
      return changes.length > 0 ? changes.join(", ") : "no change";
    }
    case "session.revoke":
      return "Session revoked";
    case "role.sync": {
      const added = (detail.added ?? []) as string[];
      const removed = (detail.removed ?? []) as string[];
      const parts = [...added.map((r) => `+${r}`), ...removed.map((r) => `-${r}`)];
      return parts.join(", ") || "no change";
    }
    case "attribute.update": {
      const fields = ["department", "position", "jobLevel"] as const;
      const changes = fields
        .filter((f) => detail.before?.[f] !== detail.after?.[f])
        .map((f) => `${f}: ${detail.before?.[f] ?? "(none)"} → ${detail.after?.[f]}`);
      return changes.length > 0 ? changes.join(", ") : "no change";
    }
    case "role_rule.create":
      return `Rule added: ${detail.roleCode ?? ""}`;
    case "role_rule.delete":
      return `Rule removed: ${detail.roleCode ?? `(id ${detail.id ?? "?"})`}`;
    default:
      return JSON.stringify(detail);
  }
}

const ACTION_LABELS: Record<string, string> = {
  "permission.update": "Permission",
  "session.revoke": "Session revoke",
  "role.sync": "Role sync",
  "attribute.update": "Attribute",
  "role_rule.create": "Role rule added",
  "role_rule.delete": "Role rule removed",
};

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/admin/audit?limit=200", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<AuditRow[]>;
      })
      .then(setRows)
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "at",
      header: "Time",
      render: (row) => <span className="whitespace-nowrap">{new Date(row.at).toLocaleString()}</span>,
      sortValue: (row) => row.at,
    },
    {
      key: "actor",
      header: "Actor",
      render: (row) => row.actorName,
      sortValue: (row) => row.actorName.toLowerCase(),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => <Badge tone={row.action === "session.revoke" ? "danger" : "neutral"}>{ACTION_LABELS[row.action] ?? row.action}</Badge>,
      sortValue: (row) => row.action,
    },
    {
      key: "target",
      header: "Target",
      render: (row) => row.targetName ?? row.targetSub ?? "—",
      sortValue: (row) => (row.targetName ?? row.targetSub ?? "").toLowerCase(),
    },
    {
      key: "app",
      header: "App",
      render: (row) => row.appId ?? "—",
    },
    {
      key: "detail",
      header: "Detail",
      render: (row) => <span className="text-text-muted">{summarizeAuditDetail(row)}</span>,
    },
  ];

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text">Audit log</h2>
        <p className="text-text-muted">
          Most recent 200 admin-initiated permission, session, attribute, and role changes.
        </p>
      </header>

      {loadError && <p className="text-sm text-danger">Failed to load audit log: {loadError}</p>}

      {!loadError && (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          getRowId={(row) => String(row.id)}
          searchFields={(row) => [row.actorName, row.targetName ?? "", row.appId ?? "", row.action]}
          searchPlaceholder="Search by actor, target, app, or action..."
          loading={rows === null}
          emptyTitle="No audit history yet"
          emptyDescription="Permission, session, attribute, and role changes will show up here."
        />
      )}
    </section>
  );
}

type Tab = "users" | "permissions" | "audit";

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
            <Button variant={tab === "audit" ? "primary" : "secondary"} onClick={() => setTab("audit")}>
              Audit
            </Button>
          </nav>
        }
      >
        <div className="space-y-10">
          {tab === "users" ? <UsersPanel /> : tab === "permissions" ? <PermissionsPanel /> : <AuditPanel />}
        </div>
      </AppShell>
    </ToastProvider>
  );
}
