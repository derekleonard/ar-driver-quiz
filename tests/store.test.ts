import { describe, expect, it, vi } from "vitest";

const { orderBy, limit, getDocs } = vi.hoisted(() => ({
  orderBy: vi.fn((field: string, dir: string) => ({ type: "orderBy", field, dir })),
  limit: vi.fn((n: number) => ({ type: "limit", n })),
  getDocs: vi.fn(async () => ({
    // Firestore returns newest-first under the desc query
    docs: [50, 40, 30, 20, 10].map((startedAt) => ({ data: () => ({ startedAt }) })),
  })),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs,
  limit,
  orderBy,
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("../src/firebase/firebase", () => ({ db: {} }));

import { ATTEMPTS_LOAD_LIMIT, loadAttempts } from "../src/firebase/store";

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
