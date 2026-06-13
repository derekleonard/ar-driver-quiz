import type { Attempt, SrsState } from "../types";
import { readinessScore, topicStatsFromAttempts } from "./scoring";
import { studyStreak } from "./streak";

/** What the parent dashboard reads from users/{uid}.summary. */
export interface UserSummary {
  readiness: number;
  streak: number;
  topicMastery: Record<string, number>;
  lastExam?: { score: number; total: number; passed: boolean; at: number };
}

/** Build the dashboard summary written after every finished session. */
export function summaryFor(
  srs: SrsState,
  attempts: Attempt[],
  allIds: string[],
  now: number = Date.now(),
): UserSummary {
  const stats = topicStatsFromAttempts(attempts);
  const topicMastery: Record<string, number> = {};
  for (const [topic, s] of Object.entries(stats)) {
    if (s.total > 0) topicMastery[topic] = Math.round((100 * s.correct) / s.total);
  }
  const exams = attempts.filter((a) => a.mode === "exam");
  const last = exams[exams.length - 1];
  return {
    readiness: readinessScore(srs, allIds, attempts),
    streak: studyStreak(attempts, now),
    topicMastery,
    ...(last && {
      lastExam: {
        score: last.score,
        total: last.total,
        passed: !!last.passed,
        at: last.startedAt,
      },
    }),
  };
}
