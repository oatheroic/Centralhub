export type NotificationType = "info" | "success" | "warning" | "action_required";

export type NotifyInput = {
  recipientSubs: string[];
  title: string;
  body?: string | null;
  // Where the bell entry navigates to when clicked, e.g. "/apps/<id>/".
  link?: string | null;
  type?: NotificationType;
  actorSub?: string | null;
  // Same (recipient, dedupe_key) pair never creates a second row — use it
  // for anything that could legitimately fire twice (retries, double-clicks).
  dedupeKey?: string | null;
};

export type NotifierOptions = {
  appId: string;
  authGatewayUrl: string;
};

// App-originated notifications (README §16) from a trusted first-party
// backend. Posts server-to-server to auth-gateway's POST
// /internal/notifications — reachable only over the Docker network, never
// through the public gateway, which is exactly why a backend (not a
// browser) must be the one asserting "notify this user".
//
// Fire-and-forget by design: `notify()` never throws and never rejects. A
// notification is a side effect of a mutation that already happened; a
// notifications outage must not turn that into a failed request or an
// unhandled rejection. Failures are logged with the app id so they're
// findable. Callers may `await` it (to sequence logs in tests) or not.
export function createNotifier({ appId, authGatewayUrl }: NotifierOptions) {
  const url = `${authGatewayUrl}/internal/notifications`;

  return async function notify(input: NotifyInput): Promise<void> {
    if (input.recipientSubs.length === 0) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient_subs: input.recipientSubs,
          source_app_id: appId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          actor_sub: input.actorSub ?? null,
          dedupe_key: input.dedupeKey ?? null,
        }),
      });
      if (!res.ok) {
        console.error(`${appId}: notify() rejected by auth-gateway with ${res.status}`);
      }
    } catch (err) {
      console.error(`${appId}: notify() failed`, err);
    }
  };
}
