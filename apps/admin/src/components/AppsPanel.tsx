import { useEffect, useState } from "react";
import { Badge, Button, ConfirmDialog, DataTable, useToast, type DataTableColumn } from "@centralhub/ui";
import { AppFormDialog, type AppFormValues } from "./AppFormDialog";

type App = {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string | null;
  hidden: boolean;
  requiresRole: string | null;
  knownApp: boolean;
  adminRoleCode: string | null;
  source: "manifest" | "manual";
};

type AppUsage = { appPermissions: number; appRoleRules: number; appRoleOverrides: number };

// Not part of the wire shape — both the server and apps/central-hub derive
// an app's route from its id the same way; see central-hub's AppCard.tsx.
function appPath(id: string): string {
  return id === "central-hub" ? "/" : `/apps/${id}/`;
}

type Reachability = "unknown" | "checking" | "reachable" | "blocked" | "unreachable";

const REACHABILITY_LABEL: Record<Reachability, string> = {
  unknown: "Not checked",
  checking: "Checking...",
  reachable: "Reachable",
  blocked: "Blocked (no permission)",
  unreachable: "Unreachable",
};

const REACHABILITY_TONE: Record<Reachability, "success" | "danger" | "neutral"> = {
  unknown: "neutral",
  checking: "neutral",
  reachable: "success",
  blocked: "danger",
  unreachable: "danger",
};

// Both the permission-denied page and the app-unavailable page come back
// as a plain HTTP 200 (Nginx's `error_page N = @target` with no explicit
// status inherits @target's own response code, not N) — see
// gateway/conf.d/default.conf's comments on @permission_denied/
// @app_unavailable. So status code alone can't tell "real app content"
// apart from either error page; the body has to be inspected, same
// technique scripts/test-stack.mjs already uses for the denial page.
const DENIED_MARKER = "You don't have access to this app";
const UNAVAILABLE_MARKER = "This app isn't available right now";

function toFormValues(app: App): AppFormValues {
  return {
    id: app.id,
    name: app.name,
    department: app.department,
    icon: app.icon,
    description: app.description ?? "",
    hidden: app.hidden,
    requiresRole: app.requiresRole ?? "",
    knownApp: app.knownApp,
    adminRoleCode: app.adminRoleCode ?? "",
  };
}

export function AppsPanel() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<App | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<App | null>(null);
  const [reachability, setReachability] = useState<Record<string, Reachability>>({});
  const toast = useToast();

  function refetch() {
    fetch("/auth/admin/apps", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<App[]>;
      })
      .then(setApps)
      .catch((err) => setLoadError((err as Error).message));
  }

  useEffect(refetch, []);

  async function checkReachability(app: App) {
    setReachability((prev) => ({ ...prev, [app.id]: "checking" }));
    try {
      // GET, not HEAD — a HEAD response has no body to inspect, which is
      // exactly the bug that made a denied app misreport as "Reachable".
      const res = await fetch(appPath(app.id), { method: "GET", credentials: "same-origin" });
      const text = await res.text();
      const status: Reachability = text.includes(DENIED_MARKER)
        ? "blocked"
        : text.includes(UNAVAILABLE_MARKER)
          ? "unreachable"
          : res.ok
            ? "reachable"
            : "unreachable";
      setReachability((prev) => ({ ...prev, [app.id]: status }));
    } catch {
      setReachability((prev) => ({ ...prev, [app.id]: "unreachable" }));
    }
  }

  async function saveApp(values: AppFormValues): Promise<boolean> {
    const isCreate = editing === "new";
    const body = {
      name: values.name.trim(),
      department: values.department.trim(),
      icon: values.icon.trim() || "LayoutGrid",
      description: values.description.trim() || null,
      hidden: values.hidden,
      requiresRole: values.requiresRole.trim() || null,
      knownApp: values.knownApp,
      adminRoleCode: values.adminRoleCode.trim() || null,
    };
    try {
      const res = await fetch(isCreate ? "/auth/admin/apps" : `/auth/admin/apps/${values.id}`, {
        method: isCreate ? "POST" : "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isCreate ? { id: values.id.trim(), ...body } : body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `${res.status}`);
      }
      refetch();
      toast.show({ tone: "success", title: isCreate ? `Registered ${values.id}` : `Saved ${values.id}` });
      return true;
    } catch (err) {
      toast.show({ tone: "danger", title: "Couldn't save app", description: (err as Error).message });
      return false;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/auth/admin/apps/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 409) {
        const body = (await res.json()) as { usage?: AppUsage };
        const u = body.usage;
        const parts = [
          u?.appPermissions ? `${u.appPermissions} permission row(s)` : null,
          u?.appRoleRules ? `${u.appRoleRules} role rule(s)` : null,
          u?.appRoleOverrides ? `${u.appRoleOverrides} role override(s)` : null,
        ].filter(Boolean);
        toast.show({
          tone: "danger",
          title: `Can't delete ${deleteTarget.id}`,
          description: `still referenced by ${parts.join(", ")}`,
        });
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      refetch();
      toast.show({ tone: "success", title: `Deleted ${deleteTarget.id}` });
    } catch (err) {
      toast.show({ tone: "danger", title: "Couldn't delete app", description: (err as Error).message });
    }
  }

  const columns: DataTableColumn<App>[] = [
    { key: "id", header: "Id", render: (app) => <span className="font-mono text-xs">{app.id}</span>, sortValue: (app) => app.id },
    { key: "name", header: "Name", render: (app) => app.name, sortValue: (app) => app.name.toLowerCase() },
    { key: "department", header: "Department", render: (app) => app.department },
    {
      key: "flags",
      header: "Flags",
      render: (app) => (
        <div className="flex flex-wrap gap-1">
          {app.hidden && <Badge tone="neutral">hidden</Badge>}
          {app.requiresRole && <Badge tone="success">role: {app.requiresRole}</Badge>}
          {!app.knownApp && <Badge tone="danger">not permission-gated</Badge>}
          {app.adminRoleCode && <Badge tone="success">admin role: {app.adminRoleCode}</Badge>}
          <Badge tone={app.source === "manifest" ? "success" : "neutral"}>{app.source}</Badge>
        </div>
      ),
    },
    {
      key: "reachable",
      header: "Reachable",
      render: (app) => {
        const status = reachability[app.id] ?? "unknown";
        return (
          <div className="flex items-center gap-2">
            <Badge tone={REACHABILITY_TONE[status]}>{REACHABILITY_LABEL[status]}</Badge>
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              disabled={status === "checking"}
              onClick={() => void checkReachability(app)}
            >
              Check
            </button>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (app) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(app)}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleteTarget(app)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Apps</h2>
          <p className="text-text-muted">
            What appears on the dashboard and participates in permission checks. Registering an app here is
            metadata only — the container/route it needs is a separate step (see README).
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          Add app
        </Button>
      </header>

      {loadError && <p className="text-sm text-danger">Failed to load apps: {loadError}</p>}

      {!loadError && (
        <DataTable
          columns={columns}
          rows={apps ?? []}
          getRowId={(app) => app.id}
          searchFields={(app) => [app.id, app.name, app.department]}
          searchPlaceholder="Search by id, name, or department..."
          loading={apps === null}
          emptyTitle="No apps registered"
          emptyDescription="Add one, or add an app.manifest.json and re-run the stack."
        />
      )}

      <AppFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        initial={editing && editing !== "new" ? toFormValues(editing) : null}
        onSave={saveApp}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.id ?? ""}?`}
        description="This only removes the dashboard/registry entry — it does not stop or delete the app's container. Blocked if any permission, role rule, or role override still references it."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
      />
    </section>
  );
}
