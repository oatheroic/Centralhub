import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotifier } from "./notify.js";

describe("createNotifier().notify", () => {
  const fetchMock = vi.fn();
  const notify = createNotifier({ appId: "demo", authGatewayUrl: "http://auth-gateway:4100" });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("posts the snake_case body /internal/notifications expects", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await notify({
      recipientSubs: ["u1", "u2"],
      title: "Hello",
      body: "World",
      link: "/apps/demo/",
      type: "warning",
      actorSub: "admin",
      dedupeKey: "hello:1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://auth-gateway:4100/internal/notifications");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      recipient_subs: ["u1", "u2"],
      source_app_id: "demo",
      type: "warning",
      title: "Hello",
      body: "World",
      link: "/apps/demo/",
      actor_sub: "admin",
      dedupe_key: "hello:1",
    });
  });

  it("skips the request entirely with no recipients", async () => {
    await notify({ recipientSubs: [], title: "nobody" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws — network errors and non-2xx are logged, not raised", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(notify({ recipientSubs: ["u1"], title: "x" })).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    await expect(notify({ recipientSubs: ["u1"], title: "x" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
