import { useEffect, useState } from "react";
import { MapPin, Users } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, Input, useToast } from "@centralhub/ui";
import { ApiError, createResource, deleteResource, fetchResources, updateResource, type Resource } from "../lib/api";
import type { PermissionSet } from "../lib/usePermissions";
import { useGuardedAction } from "../lib/usePermissions";

export function ManageRooms({ permissions }: { permissions: PermissionSet | null }) {
  const toast = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);

  async function reload() {
    setResources(await fetchResources());
  }

  useEffect(() => {
    void reload();
  }, []);

  const addRoom = useGuardedAction(permissions, "edit", async () => {
    if (!name.trim()) {
      toast.show({ title: "Name is required", tone: "danger" });
      return;
    }
    try {
      await createResource({ name: name.trim(), location: location.trim() || undefined, capacity: capacity ? Number(capacity) : undefined });
      toast.show({ title: "Room added", tone: "success" });
      setName("");
      setLocation("");
      setCapacity("");
      await reload();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : "Could not add the room.";
      toast.show({ title: "Add room failed", description, tone: "danger" });
    }
  });

  const toggleActive = useGuardedAction(permissions, "edit", async (room: Resource) => {
    try {
      await updateResource(room.id, { isActive: !room.isActive });
      await reload();
    } catch {
      toast.show({ title: "Update failed", tone: "danger" });
    }
  });

  // Permission is checked here, at the moment "Delete" is clicked, so a user
  // without the "delete" verb gets immediate feedback instead of walking
  // through a confirm dialog only to be denied at the end.
  const requestDelete = useGuardedAction(permissions, "delete", (room: Resource) => {
    setDeleteTarget(room);
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteResource(deleteTarget.id);
      toast.show({ title: "Room deleted", tone: "success" });
      await reload();
    } catch {
      toast.show({ title: "Delete failed", tone: "danger" });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-text">Manage rooms</h2>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Conference Room A" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Location
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Floor 3" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Capacity
          <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="8" />
        </label>
        <Button onClick={addRoom}>Add room</Button>
      </div>

      <ul className="flex flex-col gap-2">
        {resources.map((room) => (
          <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={room.isActive ? "font-medium text-text" : "text-text-muted line-through"}>{room.name}</span>
              {!room.isActive && <Badge tone="neutral">Inactive</Badge>}
              {room.location && (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  {room.location}
                </span>
              )}
              {room.capacity != null && (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Users className="h-3.5 w-3.5" />
                  {room.capacity}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => toggleActive(room)}>
                {room.isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="danger" onClick={() => requestDelete(room)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this room?"
        description={deleteTarget ? `"${deleteTarget.name}" and all of its bookings will be permanently deleted. This can't be undone.` : undefined}
        confirmLabel="Delete room"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
