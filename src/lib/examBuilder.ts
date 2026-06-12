import type { Question, Topic } from "../types";
import { TOPICS } from "../types";
import { shuffle } from "./shuffle";

export const EXAM_SIZE = 25;
export const PASS_SCORE = 20;

/** Approximate topic mix of the real 25-question AR knowledge test. */
export const EXAM_MIX: Record<Topic, number> = {
  "signs-signals-markings": 7,
  "right-of-way": 4,
  "speed-following": 3,
  "turning-parking": 3,
  "adverse-conditions": 2,
  "sharing-the-road": 2,
  "alcohol-gdl": 2,
  "license-admin": 2,
};

/**
 * Build a 25-question exam matching EXAM_MIX. If a topic has too few
 * questions, the shortfall is filled from the remaining pool so the exam
 * is always EXAM_SIZE long (or the whole bank if smaller).
 */
export function buildExam(bank: Question[], rand: () => number = Math.random): Question[] {
  const byTopic = new Map<Topic, Question[]>();
  for (const t of TOPICS) byTopic.set(t, []);
  for (const q of bank) byTopic.get(q.topic)?.push(q);

  const picked: Question[] = [];
  for (const t of TOPICS) {
    const pool = shuffle(byTopic.get(t)!, rand);
    picked.push(...pool.slice(0, EXAM_MIX[t]));
  }

  if (picked.length < EXAM_SIZE) {
    const pickedIds = new Set(picked.map((q) => q.id));
    const rest = shuffle(bank.filter((q) => !pickedIds.has(q.id)), rand);
    picked.push(...rest.slice(0, EXAM_SIZE - picked.length));
  }

  return shuffle(picked, rand).slice(0, EXAM_SIZE);
}
