import type { Attempt, SrsEntry, SrsState } from "../types";

const SRS_KEY = "ardq:srs";
const ATTEMPTS_KEY = "ardq:attempts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isSrsEntry(v: unknown): v is SrsEntry {
  return (
    isRecord(v) &&
    typeof v.box === "number" &&
    typeof v.due === "number" &&
    typeof v.seen === "number" &&
    typeof v.correct === "number"
  );
}

function isAttempt(v: unknown): v is Attempt {
  return (
    isRecord(v) &&
    typeof v.mode === "string" &&
    typeof v.score === "number" &&
    typeof v.total === "number" &&
    typeof v.startedAt === "number" &&
    isRecord(v.perTopic) &&
    Array.isArray(v.missedIds)
  );
}

export function loadSrs(): SrsState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SRS_KEY) ?? "{}");
    // "null" or "5" parse cleanly but aren't states, and individual entries
    // can be garbage too — keep only well-formed entries so one corrupt
    // value can't white-screen the app downstream.
    if (!isRecord(parsed)) return {};
    const out: SrsState = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (isSrsEntry(entry)) out[id] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSrs(state: SrsState): void {
  localStorage.setItem(SRS_KEY, JSON.stringify(state));
}

export function loadAttempts(): Attempt[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isAttempt) : [];
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: Attempt): Attempt[] {
  const all = [...loadAttempts(), attempt];
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  return all;
}

export function clearAll(): void {
  localStorage.removeItem(SRS_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
}
