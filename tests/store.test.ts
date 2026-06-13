import { describe, expect, it, vi } from "vitest";

const { orderBy, limit, getDocs, runTransaction, txGet, txSet } = vi.hoisted(() => {
  const txGet = vi.fn();
  const txSet = vi.fn();
  return {
    orderBy: vi.fn((field: string, dir: string) => ({ type: "orderBy", field, dir })),
    limit: vi.fn((n: number) => ({ type: "limit", n })),
    getDocs: vi.fn(async () => ({
      // Firestore returns newest-first under the desc query
      docs: [50, 40, 30, 20, 10].map((startedAt) => ({ data: () => ({ startedAt }) })),
    })),
    runTransaction: vi.fn(
      async (_db: unknown, fn: (tx: { get: typeof txGet; set: typeof txSet }) => Promise<void>) =>
        fn({ get: txGet, set: txSet }),
    ),
    txGet,
    txSet,
  };
});

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(() => ({ type: "doc" })),
  getDoc: vi.fn(),
  getDocs,
  limit,
  orderBy,
  query: vi.fn(),
  runTransaction,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("../src/firebase/firebase", () => ({ db: {} }));

import { ATTEMPTS_LOAD_LIMIT, loadAttempts, saveSrsDoc } from "../src/firebase/store";

describe("loadAttempts", () => {
  it("queries newest-first so the limit keeps the most recent attempts", async () => {
    await loadAttempts("uid");
    expect(orderBy).toHaveBeenCalledWith("startedAt", "desc");
    expect(limit).toHaveBeenCalledWith(ATTEMPTS_LOAD_LIMIT);
    expect(ATTEMPTS_LOAD_LIMIT).toBe(200);
  });

  it("returns attempts in ascending order (callers rely on chronological order)", async () => {
    const attempts = await loadAttempts("uid");
    expect(attempts.map((a) => a.startedAt)).toEqual([10, 20, 30, 40, 50]);
  });
});

describe("saveSrsDoc", () => {
  it("merges with the existing cloud doc instead of blind-overwriting it", async () => {
    // The cloud has progress on q1 from another device; this writer only
    // knows q2. A blind setDoc would wipe q1 — the merge keeps both, and
    // per-id the most-progressed entry wins.
    const cloudQ1 = { box: 4, due: 9, seen: 6, correct: 5 };
    const cloudQ2Stale = { box: 1, due: 1, seen: 1, correct: 0 };
    txGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries: { q1: cloudQ1, q2: cloudQ2Stale } }),
    });
    const localQ2 = { box: 2, due: 5, seen: 2, correct: 1 };
    await saveSrsDoc("uid", { q2: localQ2 });
    expect(txSet).toHaveBeenCalledWith(
      { type: "doc" },
      { entries: { q1: cloudQ1, q2: localQ2 } },
    );
  });

  it("writes as-is when no cloud doc exists yet", async () => {
    txGet.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    const entries = { q1: { box: 2, due: 5, seen: 1, correct: 1 } };
    await saveSrsDoc("uid", entries);
    expect(txSet).toHaveBeenCalledWith({ type: "doc" }, { entries });
  });
});
