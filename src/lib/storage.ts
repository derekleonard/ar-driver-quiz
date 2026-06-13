import type { Attempt, SrsEntry, SrsState } from "../types";

const SRS_KEY = "ardq:srs";
const ATTEMPTS_KEY = "ardq:attempts";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isSrsEntry(v: unknown): v is SrsEntry {
  // Number.isFinite (not typeof === "number") because typeof NaN/Infinity is
  // "number" too; a NaN box/due would serialize to Firestore as null on
  // write-back and poison Leitner math.
  return (
    isRecord(v) &&
    Number.isFinite(v.box) &&
    Number.isFinite(v.due) &&
    Number.isFinite(v.seen) &&
    Number.isFinite(v.correct)
  );
}

export function isAttempt(v: unknown): v is Attempt {
  // Number.isFinite + total>0: typeof NaN === "number", so a NaN/Infinity or
  // zero-total exam would otherwise pass and make readinessScore divide
  // score/total = 0/0 = NaN, which reaches the dashboard as the literal "NaN".
  return (
    isRecord(v) &&
    typeof v.mode === "string" &&
    Number.isFinite(v.score) &&
    Number.isFinite(v.total) &&
    (v.total as number) > 0 &&
    Number.isFinite(v.startedAt) &&
    Number.isFinite(v.durationSec) &&
    isRecord(v.perTopic) &&
    Array.isArray(v.missedIds)
  );
}

/**
 * Coerce untrusted data (localStorage JSON or a Firestore doc field) into a
 * well-formed SrsState. "null" or "5" parse cleanly but aren't states, and
 * individual entries can be garbage too — keep only well-formed entries so
 * one corrupt value can't white-screen the app downstream.
 */
export function sanitizeSrs(parsed: unknown): SrsState {
  if (!isRecord(parsed)) return {};
  const out: SrsState = {};
  for (const [id, entry] of Object.entries(parsed)) {
    if (isSrsEntry(entry)) out[id] = entry;
  }
  return out;
}

export function loadSrs(): SrsState {
  try {
    return sanitizeSrs(JSON.parse(localStorage.getItem(SRS_KEY) ?? "{}"));
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
