import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt } from "../src/types";

const store = vi.hoisted(() => ({
  addAttemptDoc: vi.fn(),
  saveSrsDoc: vi.fn(),
  updateSummary: vi.fn(),
}));

vi.mock("../src/firebase/store", () => store);

import { syncFinishedQuiz } from "../src/state/finishSync";
import * as local from "../src/lib/storage";

// localStorage shim for the fallback path
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
  store.addAttemptDoc.mockResolvedValue(undefined);
  store.saveSrsDoc.mockResolvedValue(undefined);
  store.updateSummary.mockResolvedValue(undefined);
});

describe("syncFinishedQuiz", () => {
  it("writes all three cloud docs and reports success online", async () => {
    const a = attempt(1);
    const res = await syncFinishedQuiz("u1", {}, a, [a]);
    expect(res).toEqual({ ok: true });
    expect(store.addAttemptDoc).toHaveBeenCalledWith("u1", a);
    expect(store.saveSrsDoc).toHaveBeenCalledOnce();
    expect(store.updateSummary).toHaveBeenCalledOnce();
    // Success must NOT also write the localStorage fallback queue.
    expect(local.loadAttempts()).toEqual([]);
  });

  it("falls back to localStorage + banner when the cloud write never settles (offline)", async () => {
    // A queued Firestore write offline never resolves; the old code awaited it
    // directly and hung, losing SRS/summary and never showing the banner.
    store.addAttemptDoc.mockReturnValue(new Promise<void>(() => {}));
    const a = attempt(2);
    const res = await syncFinishedQuiz("u1", { q1: { box: 2, due: 0 } } as never, a, [a], 20);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("saved on this device");
    // The session's attempt and SRS landed in the local fallback queue.
    expect(local.loadAttempts()).toEqual([a]);
    expect(store.saveSrsDoc).not.toHaveBeenCalled();
  });

  it("falls back when a cloud write rejects (permission-denied)", async () => {
    store.addAttemptDoc.mockRejectedValue({ code: "permission-denied" });
    const a = attempt(3);
    const res = await syncFinishedQuiz("u1", {}, a, [a], 20);
    expect(res.ok).toBe(false);
    expect(local.loadAttempts()).toEqual([a]);
  });
});
