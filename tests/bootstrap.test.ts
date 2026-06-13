import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "../src/types";

const store = vi.hoisted(() => ({
  fetchAllowlist: vi.fn(),
  ensureUserDoc: vi.fn(),
  loadSrsDoc: vi.fn(),
  loadAttempts: vi.fn(),
  addAttemptDoc: vi.fn(),
  saveSrsDoc: vi.fn(),
}));

vi.mock("../src/firebase/store", () => store);

import { bootstrapCloudUser, type BootstrapTimeouts } from "../src/state/bootstrap";
import * as local from "../src/lib/storage";

// localStorage shim for the migration paths
const lsMap = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => lsMap.get(k) ?? null,
  setItem: (k: string, v: string) => void lsMap.set(k, v),
  removeItem: (k: string) => void lsMap.delete(k),
  clear: () => lsMap.clear(),
  key: (i: number) => [...lsMap.keys()][i] ?? null,
  get length() {
    return lsMap.size;
  },
} as Storage;

const T: BootstrapTimeouts = { readMs: 100, ensureWaitMs: 20, migrateMs: 100 };

const PARENT = "dad@example.com";
const KID = "kid@example.com";
const ALLOWLIST = { emails: [PARENT, KID], parentEmail: PARENT };

const user = (email: string, emailVerified = true) => ({
  uid: "u1",
  email,
  displayName: "Test User",
  emailVerified,
});

const attempt = (ts: number): Attempt => ({
  mode: "drill",
  score: 5,
  total: 10,
  startedAt: ts,
  durationSec: 60,
  perTopic: {},
  missedIds: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  lsMap.clear();
  store.fetchAllowlist.mockResolvedValue(ALLOWLIST);
  store.ensureUserDoc.mockResolvedValue(undefined);
  store.loadSrsDoc.mockResolvedValue(null);
  store.loadAttempts.mockResolvedValue([]);
  store.addAttemptDoc.mockResolvedValue(undefined);
  store.saveSrsDoc.mockResolvedValue(undefined);
});

describe("bootstrapCloudUser access policy", () => {
  it("readies a clean student login with the right role", async () => {
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r).toEqual({ kind: "ready", role: "student", srs: {}, attempts: [] });
  });

  it("recognizes the parent", async () => {
    const r = await bootstrapCloudUser(user(PARENT), T);
    expect(r).toMatchObject({ kind: "ready", role: "parent" });
  });

  it("denies an email that isn't on the allowlist", async () => {
    const r = await bootstrapCloudUser(user("rando@example.com"), T);
    expect(r).toMatchObject({ kind: "denied" });
  });

  it("denies an unverified email (mirror of the rules' isAllowed)", async () => {
    const r = await bootstrapCloudUser(user(KID, false), T);
    expect(r.kind).toBe("denied");
    expect((r as { reason: string }).reason).toMatch(/verif/i);
  });

  it("an offline allowlist read is an ERROR (retryable), not a denial", async () => {
    store.fetchAllowlist.mockRejectedValue({ code: "unavailable" });
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("error");
  });

  it("permission-denied reading the allowlist names both possible causes", async () => {
    store.fetchAllowlist.mockRejectedValue({ code: "permission-denied" });
    const r = await bootstrapCloudUser(user("rando@example.com"), T);
    expect(r.kind).toBe("denied");
    const reason = (r as { reason: string }).reason;
    expect(reason).toMatch(/family list/);
    expect(reason).toMatch(/rules/);
  });

  it("a missing config/allowlist doc is a denial naming the setup fix", async () => {
    store.fetchAllowlist.mockRejectedValue(new Error("allowlist-missing"));
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("denied");
    const reason = (r as { reason: string }).reason;
    expect(reason).toMatch(/config/);
    expect(reason).toMatch(/allowlist/);
  });

  it("a malformed config/allowlist doc is a denial naming the required shape", async () => {
    store.fetchAllowlist.mockRejectedValue(new Error("allowlist-malformed"));
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("denied");
    const reason = (r as { reason: string }).reason;
    expect(reason).toMatch(/emails/);
    expect(reason).toMatch(/parentEmail/);
  });

  it("a hanging allowlist read times out into an ERROR, not a spinner", async () => {
    store.fetchAllowlist.mockReturnValue(new Promise(() => {}));
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("error");
  });
});

describe("bootstrapCloudUser data load", () => {
  it("proceeds when ensureUserDoc hangs (offline write stays queued)", async () => {
    store.ensureUserDoc.mockReturnValue(new Promise(() => {}));
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("ready");
  });

  it("a permission-denied user-doc write is a denial with a rules diagnosis", async () => {
    store.ensureUserDoc.mockRejectedValue({ code: "permission-denied" });
    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("denied");
    expect((r as { reason: string }).reason).toMatch(/rules/);
  });

  it("migrates local progress: fresh attempts up first, merged SRS, then clear", async () => {
    store.loadSrsDoc.mockResolvedValue({ q1: { box: 4, due: 9, seen: 6, correct: 5 } });
    store.loadAttempts.mockResolvedValue([attempt(10)]);
    local.saveSrs({ q2: { box: 2, due: 5, seen: 2, correct: 1 } });
    local.saveAttempt(attempt(10)); // already known: must not re-upload
    local.saveAttempt(attempt(20)); // fresh

    const r = await bootstrapCloudUser(user(KID), T);
    expect(r).toMatchObject({ kind: "ready" });
    expect(store.addAttemptDoc).toHaveBeenCalledTimes(1);
    expect(store.addAttemptDoc.mock.calls[0][1].startedAt).toBe(20);
    expect(store.saveSrsDoc).toHaveBeenCalledWith("u1", {
      q1: { box: 4, due: 9, seen: 6, correct: 5 },
      q2: { box: 2, due: 5, seen: 2, correct: 1 },
    });
    const ready = r as { srs: object; attempts: Attempt[] };
    expect(ready.attempts.map((a) => a.startedAt)).toEqual([10, 20]);
    // migration succeeded -> local queue cleared
    expect(local.loadAttempts()).toEqual([]);
    expect(local.loadSrs()).toEqual({});
  });

  it("login succeeds even if one attempt upload is rejected by the rules", async () => {
    // A single stale/malformed local attempt the cloud denies must be skipped,
    // not allowed to wedge the entire sign-in into the denied screen.
    store.loadAttempts.mockResolvedValue([]);
    local.saveAttempt(attempt(10)); // bad: cloud rejects this one
    local.saveAttempt(attempt(20)); // good
    store.addAttemptDoc.mockImplementation((_uid: string, a: Attempt) =>
      a.startedAt === 10
        ? Promise.reject({ code: "permission-denied" })
        : Promise.resolve(undefined),
    );

    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("ready");
    expect(store.addAttemptDoc).toHaveBeenCalledTimes(2);
    expect(store.saveSrsDoc).toHaveBeenCalledTimes(1);
    // migration ran to completion -> local queue cleared
    expect(local.loadAttempts()).toEqual([]);
  });

  it("serves the merged view but KEEPS localStorage when migration fails transiently", async () => {
    store.saveSrsDoc.mockRejectedValue({ code: "unavailable" });
    local.saveAttempt(attempt(20));

    const r = await bootstrapCloudUser(user(KID), T);
    expect(r.kind).toBe("ready");
    const ready = r as { attempts: Attempt[] };
    expect(ready.attempts.map((a) => a.startedAt)).toEqual([20]);
    // next sign-in must retry the upload
    expect(local.loadAttempts()).toHaveLength(1);
  });
});
