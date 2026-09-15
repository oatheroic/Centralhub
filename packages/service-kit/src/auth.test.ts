import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Response } from "express";
import { createAuth, hasVerb, type AuthedRequest } from "./auth.js";

const CONTEXT = {
  sub: "u1",
  name: "Dev User",
  email: "dev@example.com",
  roles: ["user"],
  department: "Marketing",
  position: null,
  jobLevel: null,
  permissions: { read: true, write: true, edit: false, delete: false },
};

function makeRes() {
  const res = { sendStatus: vi.fn() } as unknown as Response & { sendStatus: ReturnType<typeof vi.fn> };
  return res;
}

function makeReq(cookie?: string): AuthedRequest {
  return { headers: cookie ? { cookie } : {} } as unknown as AuthedRequest;
}

function jsonResponse(status: number, body: unknown): globalThis.Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createAuth().authenticate", () => {
  const fetchMock = vi.fn();
  const { authenticate } = createAuth({ appId: "demo", authGatewayUrl: "http://auth-gateway:4100" });
  let next: NextFunction;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    next = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("401 without a cookie, without calling auth-gateway", async () => {
    const res = makeRes();
    await authenticate(makeReq(), res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards the cookie to /session/context?app=<id> and attaches identity + permissions", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, CONTEXT));
    const req = makeReq("chub_session=abc");
    await authenticate(req, makeRes(), next);
    expect(fetchMock).toHaveBeenCalledWith("http://auth-gateway:4100/session/context?app=demo", {
      headers: { cookie: "chub_session=abc" },
    });
    expect(next).toHaveBeenCalled();
    expect(req.identity).toEqual({
      sub: "u1",
      name: "Dev User",
      email: "dev@example.com",
      roles: ["user"],
      department: "Marketing",
      position: null,
      jobLevel: null,
    });
    expect(req.permissions).toEqual(CONTEXT.permissions);
  });

  it("401 when auth-gateway says the session is missing/revoked", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "not authenticated" }));
    const res = makeRes();
    await authenticate(makeReq("chub_session=stale"), res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403 when read is denied (defense in depth behind Nginx's gate)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...CONTEXT, permissions: { read: false, write: false, edit: false, delete: false } }),
    );
    const res = makeRes();
    await authenticate(makeReq("chub_session=abc"), res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed with 502 when auth-gateway is unreachable or errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res1 = makeRes();
    await authenticate(makeReq("chub_session=abc"), res1, next);
    expect(res1.sendStatus).toHaveBeenCalledWith(502);

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }));
    const res2 = makeRes();
    await authenticate(makeReq("chub_session=abc"), res2, next);
    expect(res2.sendStatus).toHaveBeenCalledWith(502);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireVerb / hasVerb", () => {
  const { requireVerb } = createAuth({ appId: "demo", authGatewayUrl: "http://auth-gateway:4100" });

  it("passes a granted verb through and 403s a denied one, with no HTTP", () => {
    const req = { headers: {}, permissions: CONTEXT.permissions } as unknown as AuthedRequest;
    const next = vi.fn();
    const okRes = makeRes();
    requireVerb("write")(req, okRes, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(okRes.sendStatus).not.toHaveBeenCalled();

    const deniedRes = makeRes();
    requireVerb("delete")(req, deniedRes, next);
    expect(deniedRes.sendStatus).toHaveBeenCalledWith(403);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("401s if authenticate never ran (no permissions on the request)", () => {
    const res = makeRes();
    requireVerb("write")(makeReq(), res, vi.fn());
    expect(res.sendStatus).toHaveBeenCalledWith(401);
  });

  it("hasVerb is false for a missing or denied verb", () => {
    expect(hasVerb(makeReq(), "read")).toBe(false);
    const req = { headers: {}, permissions: CONTEXT.permissions } as unknown as AuthedRequest;
    expect(hasVerb(req, "write")).toBe(true);
    expect(hasVerb(req, "edit")).toBe(false);
  });
});
