import type { Attempt, SrsState } from "../types";

const SRS_KEY = "ardq:srs";
const ATTEMPTS_KEY = "ardq:attempts";

export function loadSrs(): SrsState {
  try {
    const parsed = JSON.parse(localStorage.getItem(SRS_KEY) ?? "{}");
    // "null" or "5" parse cleanly but aren't states — guard the shape too.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSrs(state: SrsState): void {
  localStorage.setItem(SRS_KEY, JSON.stringify(state));
}

export function loadAttempts(): Attempt[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
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
