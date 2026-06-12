import { beforeEach, describe, expect, it } from "vitest";
import * as storage from "../src/lib/storage";
import type { Attempt, SrsState } from "../src/types";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
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

describe("storage", () => {
  beforeEach(() => store.clear());

  it("srs round-trips", () => {
    const srs: SrsState = { q1: { box: 2, due: 123, seen: 1, correct: 1 } };
    storage.saveSrs(srs);
    expect(storage.loadSrs()).toEqual(srs);
  });

  it("attempts accumulate and round-trip", () => {
    storage.saveAttempt(attempt(1));
    const all = storage.saveAttempt(attempt(2));
    expect(all).toHaveLength(2);
    expect(storage.loadAttempts().map((a) => a.startedAt)).toEqual([1, 2]);
  });

  it("returns empty defaults when nothing is stored", () => {
    expect(storage.loadSrs()).toEqual({});
    expect(storage.loadAttempts()).toEqual([]);
  });

  it("survives unparseable JSON", () => {
    store.set("ardq:srs", "{not json");
    store.set("ardq:attempts", "[broken");
    expect(storage.loadSrs()).toEqual({});
    expect(storage.loadAttempts()).toEqual([]);
  });

  it("survives corrupt-but-parseable values (null, numbers, wrong shapes)", () => {
    store.set("ardq:srs", "null");
    store.set("ardq:attempts", "null");
    expect(storage.loadSrs()).toEqual({});
    expect(storage.loadAttempts()).toEqual([]);
    store.set("ardq:srs", "[1,2]");
    store.set("ardq:attempts", '{"a":1}');
    expect(storage.loadSrs()).toEqual({});
    expect(storage.loadAttempts()).toEqual([]);
  });

  it("clearAll removes both keys", () => {
    storage.saveSrs({ q1: { box: 1, due: 0, seen: 0, correct: 0 } });
    storage.saveAttempt(attempt(1));
    storage.clearAll();
    expect(storage.loadSrs()).toEqual({});
    expect(storage.loadAttempts()).toEqual([]);
    expect(store.size).toBe(0);
  });
});
