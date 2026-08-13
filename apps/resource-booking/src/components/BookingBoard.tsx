import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Users } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Select, Skeleton, useToast } from "@centralhub/ui";
import {
  ApiError,
  cancelBooking,
  createBooking,
  fetchBookings,
  fetchMyBookings,
  fetchResources,
  type Booking,
  type Resource,
} from "../lib/api";
import type { PermissionSet } from "../lib/usePermissions";
import { useGuardedAction } from "../lib/usePermissions";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local-date formatting (not toISOString, which is UTC and can land on the
// wrong calendar day depending on the viewer's timezone) — matters more now
// that date navigation does arithmetic on this value.
function toDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso(): string {
  return toDateValue(new Date());
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateValue(d);
}

// Defaults the booking form to the next upcoming hour rather than a fixed
// 09:00-10:00 — a hardcoded default silently books an already-past slot
// whenever tested later in the day, which then confusingly never appears
// in "Your upcoming bookings" (that list is deliberately time-filtered).
function nextHourSlot(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: `${pad(start.getHours())}:${pad(start.getMinutes())}`, end: `${pad(end.getHours())}:${pad(end.getMinutes())}` };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// "Free now" / "In use" only means anything relative to the current moment,
// so it's only computed (and shown) for today's date — a past or future day
// has no "now" to compare against.
function isBookedNow(bookings: Booking[], resourceId: number): boolean {
  const now = new Date();
  return bookings.some((b) => b.resourceId === resourceId && new Date(b.startsAt) <= now && new Date(b.endsAt) > now);
}

export function BookingBoard({ permissions }: { permissions: PermissionSet | null }) {
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const [resourceId, setResourceId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const defaultSlot = useMemo(nextHourSlot, []);
  const [startTime, setStartTime] = useState(defaultSlot.start);
  const [endTime, setEndTime] = useState(defaultSlot.end);
  const [submitting, setSubmitting] = useState(false);

  const activeResources = useMemo(() => (resources ?? []).filter((r) => r.isActive), [resources]);
  const isToday = date === todayIso();

  function roomName(id: number): string {
    return resources?.find((r) => r.id === id)?.name ?? `Room #${id}`;
  }

  async function reload() {
    const dayStart = new Date(`${date}T00:00:00`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59`).toISOString();
    const [res, book, mine] = await Promise.all([fetchResources(), fetchBookings(dayStart, dayEnd), fetchMyBookings()]);
    setResources(res);
    setBookings(book);
    setMyBookings(mine);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const submitBooking = useGuardedAction(permissions, "write", async () => {
    if (!resourceId || !title.trim()) {
      toast.show({ title: "Missing details", description: "Pick a room, title, and time.", tone: "danger" });
      return;
    }
    const startsAt = new Date(`${date}T${startTime}`).toISOString();
    const endsAt = new Date(`${date}T${endTime}`).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.show({ title: "Invalid time range", description: "End time must be after start time.", tone: "danger" });
      return;
    }
    if (new Date(startsAt) < new Date()) {
      toast.show({ title: "Invalid time range", description: "Start time can't be in the past.", tone: "danger" });
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({ resourceId: Number(resourceId), title: title.trim(), startsAt, endsAt });
      toast.show({ title: "Room booked", tone: "success" });
      setTitle("");
      await reload();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : "Could not create the booking.";
      toast.show({ title: "Booking failed", description, tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  });

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      await cancelBooking(cancelTarget.id);
      toast.show({ title: "Booking canceled", tone: "success" });
      await reload();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : "Could not cancel the booking.";
      toast.show({ title: "Cancel failed", description, tone: "danger" });
    } finally {
      setCancelTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Date
            <div className="flex items-center gap-1">
              <Button variant="secondary" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-44">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isToday && (
                <Button variant="secondary" onClick={() => setDate(todayIso())}>
                  Today
                </Button>
              )}
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Room
            <Select value={resourceId} onChange={(e) => setResourceId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select a room…</option>
              {activeResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.location ? ` — ${r.location}` : ""}
                  {r.capacity ? ` (up to ${r.capacity})` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Team sync" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Start
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            End
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <Button onClick={submitBooking} disabled={submitting}>
            Book room
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">Bookings for {date}</h2>
        {resources === null || bookings === null ? (
          <Skeleton className="h-24 w-full" />
        ) : activeResources.length === 0 ? (
          <EmptyState title="No rooms yet" description="Ask an admin to add one from Manage rooms." />
        ) : (
          <div className="flex flex-col gap-3">
            {activeResources.map((room) => {
              const roomBookings = bookings.filter((b) => b.resourceId === room.id);
              const bookedNow = isToday && isBookedNow(bookings, room.id);
              return (
                <div key={room.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text">{room.name}</p>
                      {isToday && <Badge tone={bookedNow ? "danger" : "success"}>{bookedNow ? "In use" : "Free now"}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      {room.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {room.location}
                        </span>
                      )}
                      {room.capacity != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {room.capacity}
                        </span>
                      )}
                    </div>
                  </div>
                  {roomBookings.length === 0 ? (
                    <p className="mt-2 text-xs text-text-muted">Free all day.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {roomBookings.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs"
                        >
                          <span className="font-medium text-text">
                            {formatTime(b.startsAt)}–{formatTime(b.endsAt)}
                          </span>
                          <span className="text-text-muted">
                            {b.title} · {b.userName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text">Your upcoming bookings</h2>
        {myBookings === null ? (
          <Skeleton className="h-16 w-full" />
        ) : myBookings.length === 0 ? (
          <EmptyState title="No upcoming bookings" />
        ) : (
          <ul className="flex flex-col gap-2">
            {myBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <Badge tone="neutral">{new Date(b.startsAt).toLocaleString()}</Badge> {roomName(b.resourceId)} — {b.title}
                </span>
                <Button variant="secondary" onClick={() => setCancelTarget(b)}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this booking?"
        description={cancelTarget ? `${roomName(cancelTarget.resourceId)} — ${cancelTarget.title}, ${formatTime(cancelTarget.startsAt)}–${formatTime(cancelTarget.endsAt)}. This can't be undone.` : undefined}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        onConfirm={confirmCancel}
      />
    </div>
  );
}
