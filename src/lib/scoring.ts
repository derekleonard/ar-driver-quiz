import type { Attempt, Question, SrsState, Topic } from "../types";
import { masteryFraction } from "./leitner";

export interface TopicStats {
  correct: number;
  total: number;
}

export function topicStatsFromAttempts(attempts: Attempt[]): Partial<Record<Topic, TopicStats>> {
  const out: Partial<Record<Topic, TopicStats>> = {};
  for (const a of attempts) {
    // perTopic can be element-corrupt in a cloud attempt: firestore.rules only
    // checks `perTopic is map`, not the shape of its values (rules can't iterate
    // a map's entries), so an allowlisted student could store {topic:"junk"}.
    // Skip entries that aren't {correct:number,total:number} so one bad value
    // can't poison the dashboard math with NaN.
    for (const [topic, s] of Object.entries(a.perTopic)) {
      if (!s || !Number.isFinite(s.correct) || !Number.isFinite(s.total)) {
        continue;
      }
      const cur = (out[topic as Topic] ??= { correct: 0, total: 0 });
      cur.correct += s.correct;
      cur.total += s.total;
    }
  }
  return out;
}

export function perTopicForAnswers(
  questions: Question[],
  answers: (number | null)[],
): { perTopic: Attempt["perTopic"]; missedIds: string[]; score: number } {
  const perTopic: Attempt["perTopic"] = {};
  const missedIds: string[] = [];
  let score = 0;
  questions.forEach((q, i) => {
    const correct = answers[i] === q.answerIndex;
    const cur = (perTopic[q.topic] ??= { correct: 0, total: 0 });
    cur.total += 1;
    if (correct) {
      cur.correct += 1;
      score += 1;
    } else {
      missedIds.push(q.id);
    }
  });
  return { perTopic, missedIds, score };
}

/**
 * Single owner of the mastery color bands every screen uses (topic tiles,
 * diagnostic rows, dashboard chips).
 */
export function masteryClass(pct: number): "good" | "ok" | "bad" {
  return pct >= 80 ? "good" : pct >= 60 ? "ok" : "bad";
}

/**
 * Readiness 0-100: 50% bank mastery (Leitner box >= 3), 30% recent exam
 * average, 20% worst-topic floor. Encourages fixing weak topics, not just
 * grinding strong ones.
 */
export function readinessScore(
  srs: SrsState,
  allIds: string[],
  attempts: Attempt[],
): number {
  const mastery = masteryFraction(srs, allIds);

  // Defensive: even though isAttempt now rejects total<=0 / non-finite fields,
  // cloud attempts can reach here via paths that don't re-validate, so clamp
  // each exam's ratio to a finite [0,1] so one bad row can't yield NaN.
  const exams = attempts.filter((a) => a.mode === "exam").slice(-5);
  const examRatio = (a: Attempt): number => {
    if (!Number.isFinite(a.score) || !Number.isFinite(a.total) || a.total <= 0) return 0;
    return Math.max(0, Math.min(1, a.score / a.total));
  };
  const examAvg =
    exams.length === 0
      ? 0
      : exams.reduce((s, a) => s + examRatio(a), 0) / exams.length;

  const stats = topicStatsFromAttempts(attempts);
  const topicRates = Object.values(stats)
    .filter((s) => s.total >= 3)
    .map((s) => s.correct / s.total);
  const worstTopic = topicRates.length === 0 ? 0 : Math.min(...topicRates);

  return Math.round(100 * (0.5 * mastery + 0.3 * examAvg + 0.2 * worstTopic));
}
