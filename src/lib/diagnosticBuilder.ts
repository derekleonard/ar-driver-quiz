import type { Question, Topic } from "../types";
import { TOPICS } from "../types";
import { shuffle } from "./shuffle";

export const DIAGNOSTIC_PER_TOPIC = 5;

/** Stratified sample across every topic to seed the topic heatmap and SRS. */
export function buildDiagnostic(
  bank: Question[],
  rand: () => number = Math.random,
): Question[] {
  const byTopic = new Map<Topic, Question[]>();
  for (const t of TOPICS) byTopic.set(t, []);
  for (const q of bank) byTopic.get(q.topic)?.push(q);

  const picked: Question[] = [];
  for (const t of TOPICS) {
    picked.push(...shuffle(byTopic.get(t)!, rand).slice(0, DIAGNOSTIC_PER_TOPIC));
  }
  return shuffle(picked, rand);
}
