import { describe, expect, it, vi } from "vitest";

const { orderBy, limit, getDoc, getDocs, runTransaction, txGet, txSet } = vi.hoisted(() => {
  const txGet = vi.fn();
  const txSet = vi.fn();
  return {
    orderBy: vi.fn((field: string, dir: string) => ({ type: "orderBy", field, dir })),
    limit: vi.fn((n: number) => ({ type: "limit", n })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
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
  getDoc,
  getDocs,
  limit,
  orderBy,
  query: vi.fn(),
  runTransaction,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("../src/firebase/firebase", () => ({ db: {} }));

import {
  ATTEMPTS_LOAD_LIMIT,
  fetchAllowlist,
  loadAttempts,
  loadSrsDoc,
  saveSrsDoc,
} from "../src/firebase/store";

const attempt = (startedAt: number) => ({
  mode: "drill",
  score: 8,
  total: 10,
  startedAt,
  durationSec: 60,
  perTopic: {},
  missedIds: [],
});

function mockAttemptDocs(docs: unknown[]) {
  getDocs.mockResolvedValueOnce({ docs: docs.map((d) => ({ data: () => d })) });
}

describe("loadAttempts", () => {
  it("queries newest-first so the limit keeps the most recent attempts", async () => {
    mockAttemptDocs([]);
    await loadAttempts("uid");
    expect(orderBy).toHaveBeenCalledWith("startedAt", "desc");
    expect(limit).toHaveBeenCalledWith(ATTEMPTS_LOAD_LIMIT);
    expect(ATTEMPTS_LOAD_LIMIT).toBe(200);
  });

  it("returns attempts in ascending order (callers rely on chronological order)", async () => {
    // Firestore returns newest-first under the desc query
    mockAttemptDocs([50, 40, 30, 20, 10].map(attempt));
    const attempts = await loadAttempts("uid");
    expect(attempts.map((a) => a.startedAt)).toEqual([10, 20, 30, 40, 50]);
  });

  it("drops malformed docs instead of blind-casting them", async () => {
    mockAttemptDocs([
      attempt(30),
      { startedAt: 20 }, // missing every other field
      "garbage",
      attempt(10),
    ]);
    const attempts = await loadAttempts("uid");
    expect(attempts.map((a) => a.startedAt)).toEqual([10, 30]);
  });
});

describe("loadSrsDoc", () => {
  it("returns null when the doc does not exist", async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    expect(await loadSrsDoc("uid")).toBeNull();
  });

  it("returns {} (not undefined) when the doc exists without `entries`", async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({}) });
    expect(await loadSrsDoc("uid")).toEqual({});
  });

  it("keeps only well-formed entries", async () => {
    const good = { box: 2, due: 5, seen: 3, correct: 2 };
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries: { q1: good, q2: { box: "two" }, q3: null } }),
    });
    expect(await loadSrsDoc("uid")).toEqual({ q1: good });
  });
});

describe("fetchAllowlist", () => {
  const allowDoc = (data: unknown) =>
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => data });

  it("returns a valid allowlist", async () => {
    allowDoc({ emails: ["a@x.com"], parentEmail: "a@x.com" });
    expect(await fetchAllowlist()).toEqual({
      emails: ["a@x.com"],
      parentEmail: "a@x.com",
    });
  });

  it("throws allowlist-missing when the doc does not exist", async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    await expect(fetchAllowlist()).rejects.toThrow("allowlist-missing");
  });

  it.each([
    ["emails is a string", { emails: "a@x.com", parentEmail: "a@x.com" }],
    ["emails has a non-string", { emails: ["a@x.com", 5], parentEmail: "a@x.com" }],
    ["parentEmail missing", { emails: ["a@x.com"] }],
  ])("throws allowlist-malformed when %s", async (_name, data) => {
    allowDoc(data);
    await expect(fetchAllowlist()).rejects.toThrow("allowlist-malformed");
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

  it("drops malformed cloud entries during the merge", async () => {
    txGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries: { junk: { box: "NaN" } } }),
    });
    const entries = { q1: { box: 2, due: 5, seen: 1, correct: 1 } };
    await saveSrsDoc("uid", entries);
    expect(txSet).toHaveBeenCalledWith({ type: "doc" }, { entries });
  });
});
