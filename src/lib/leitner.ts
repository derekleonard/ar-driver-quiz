import type { SrsEntry, SrsState } from "../types";

export const BOX_INTERVALS_DAYS = [0, 0, 1, 3, 7, 14]; // index by box 1..5
export const MAX_BOX = 5;
const DAY_MS = 86_400_000;

export function newEntry(now: number): SrsEntry {
  return { box: 1, due: now, seen: 0, correct: 0 };
}

export function recordAnswer(entry: SrsEntry, correct: boolean, now: number): SrsEntry {
  const box = correct ? Math.min(entry.box + 1, MAX_BOX) : 1;
  return {
    box,
    due: now + BOX_INTERVALS_DAYS[box] * DAY_MS,
    seen: entry.seen + 1,
    correct: entry.correct + (correct ? 1 : 0),
  };
}

export function dueIds(state: SrsState, allIds: string[], now: number): string[] {
  return allIds.filter((id) => {
    const e = state[id];
    return !e || e.due <= now;
  });
}

export function applyAnswer(state: SrsState, id: string, correct: boolean, now: number): SrsState {
  const entry = state[id] ?? newEntry(now);
  return { ...state, [id]: recordAnswer(entry, correct, now) };
}

/** Fraction of the bank "mastered" (box >= 3). Unseen questions count as box 1. */
export function masteryFraction(state: SrsState, allIds: string[]): number {
  if (allIds.length === 0) return 0;
  const mastered = allIds.filter((id) => (state[id]?.box ?? 1) >= 3).length;
  return mastered / allIds.length;
}
