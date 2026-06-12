import type { SrsEntry, SrsState } from "../types";
import { shuffle } from "./shuffle";

export const BOX_INTERVALS_DAYS = [0, 0, 1, 3, 7, 14]; // index by box 1..5
export const MAX_BOX = 5;
export const REVIEW_SIZE = 15;
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

/** Count of seen questions whose review is due (due exactly now counts). */
export function dueCount(state: SrsState, allIds: string[], now: number): number {
  return allIds.filter((id) => {
    const e = state[id];
    return !!e && e.due <= now;
  }).length;
}

/**
 * The single owner of what a review session serves: seen-and-due questions
 * first (most fragile box first), then unseen filler, capped at `size`.
 */
export function reviewQueue<T extends { id: string }>(
  state: SrsState,
  items: T[],
  now: number,
  size: number = REVIEW_SIZE,
  rand: () => number = Math.random,
): T[] {
  const seenDue = items
    .filter((q) => {
      const e = state[q.id];
      return !!e && e.due <= now;
    })
    .sort((a, b) => state[a.id].box - state[b.id].box);
  const unseen = shuffle(
    items.filter((q) => !state[q.id]),
    rand,
  );
  return [...seenDue, ...unseen].slice(0, size);
}

export function applyAnswer(state: SrsState, id: string, correct: boolean, now: number): SrsState {
  const entry = state[id] ?? newEntry(now);
  return { ...state, [id]: recordAnswer(entry, correct, now) };
}

/**
 * Merge two SRS states that progressed independently (e.g. local + cloud).
 * Per id, keeps the entry with the most history: higher seen, then higher
 * box, then later due. Histories may overlap, so counts are never summed.
 */
export function mergeSrs(a: SrsState, b: SrsState): SrsState {
  const merged: SrsState = { ...a };
  for (const [id, eb] of Object.entries(b)) {
    const ea = merged[id];
    if (
      !ea ||
      eb.seen > ea.seen ||
      (eb.seen === ea.seen && (eb.box > ea.box || (eb.box === ea.box && eb.due > ea.due)))
    ) {
      merged[id] = eb;
    }
  }
  return merged;
}

/** Fraction of the bank "mastered" (box >= 3). Unseen questions count as box 1. */
export function masteryFraction(state: SrsState, allIds: string[]): number {
  if (allIds.length === 0) return 0;
  const mastered = allIds.filter((id) => (state[id]?.box ?? 1) >= 3).length;
  return mastered / allIds.length;
}
