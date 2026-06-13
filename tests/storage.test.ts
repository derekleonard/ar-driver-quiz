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

  it("drops corrupt elements inside otherwise-valid containers", () => {
    // A garbage SRS entry or attempt element must not survive the load and
    // crash a consumer later (Object.entries(a.perTopic), entry.box math).
    store.set(
      "ardq:srs",
      JSON.stringify({
        good: { box: 2, due: 1, seen: 1, correct: 1 },
        num: 5,
        nul: null,
        partial: { box: 2 },
        strings: { box: "2", due: "1", seen: "1", correct: "1" },
      }),
    );
    expect(Object.keys(storage.loadSrs())).toEqual(["good"]);

    store.set(
      "ardq:attempts",
      JSON.stringify([attempt(1), 5, null, "x", { mode: "drill" }, { ...attempt(2), perTopic: null }]),
    );
    expect(storage.loadAttempts().map((a) => a.startedAt)).toEqual([1]);
  });

  it("rejects a stale attempt missing durationSec (rules require it)", () => {
    // A pre-durationSec localStorage attempt would be rejected by validAttempt
    // in firestore.rules; isAttempt must drop it client-side so the cloud
    // migration never tries to upload a doc the rules will deny.
    const stale: Partial<Attempt> = attempt(7);
    delete stale.durationSec;
    expect(storage.isAttempt(stale)).toBe(false);
    expect(storage.isAttempt(attempt(7))).toBe(true);
    store.set("ardq:attempts", JSON.stringify([attempt(1), stale]));
    expect(storage.loadAttempts().map((a) => a.startedAt)).toEqual([1]);
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
