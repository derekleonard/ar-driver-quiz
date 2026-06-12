import type { Attempt, SrsState } from "../types";

const SRS_KEY = "ardq:srs";
const ATTEMPTS_KEY = "ardq:attempts";

export function loadSrs(): SrsState {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveSrs(state: SrsState): void {
  localStorage.setItem(SRS_KEY, JSON.stringify(state));
}

export function loadAttempts(): Attempt[] {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: Attempt): Attempt[] {
  const all = [...loadAttempts(), attempt];
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  return all;
}
