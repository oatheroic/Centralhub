const BASE = "/apps/resource-booking/api";

export type Resource = {
  id: number;
  name: string;
  location: string | null;
  capacity: number | null;
  isActive: boolean;
};

export type Booking = {
  id: number;
  resourceId: number;
  userName: string;
  title: string;
  startsAt: string;
  endsAt: string;
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 401) {
    // The session expired or was revoked mid-use. The API surface answers
    // with a bare 401 (no HTML login redirect — see the gateway's generic
    // /apps/<id>/api/ block); a full reload hits the page-level gate, which
    // does redirect to /auth/login.
    window.location.reload();
    throw new ApiError(401, "Your session has ended — reloading to sign in again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { ApiError };

export function fetchResources(): Promise<Resource[]> {
  return request("/resources");
}

export function createResource(input: { name: string; location?: string; capacity?: number }): Promise<Resource> {
  return request("/resources", { method: "POST", body: JSON.stringify(input) });
}

export function updateResource(
  id: number,
  input: Partial<{ name: string; location: string; capacity: number; isActive: boolean }>,
): Promise<Resource> {
  return request(`/resources/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteResource(id: number): Promise<void> {
  return request(`/resources/${id}`, { method: "DELETE" });
}

export function fetchBookings(from: string, to: string): Promise<Booking[]> {
  return request(`/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function fetchMyBookings(): Promise<Booking[]> {
  return request("/bookings/mine");
}

export function createBooking(input: {
  resourceId: number;
  title: string;
  startsAt: string;
  endsAt: string;
}): Promise<Booking> {
  return request("/bookings", { method: "POST", body: JSON.stringify(input) });
}

export function cancelBooking(id: number): Promise<void> {
  return request(`/bookings/${id}`, { method: "DELETE" });
}
