import type { Attempt, SrsState } from "../types";
import { readinessScore, topicStatsFromAttempts } from "./scoring";
import { isRecord } from "./storage";
import { studyStreak } from "./streak";

/** What the parent dashboard reads from users/{uid}.summary. */
export interface UserSummary {
  readiness: number;
  streak: number;
  topicMastery: Record<string, number>;
  lastExam?: { score: number; total: number; passed: boolean; at: number };
}

/**
 * Validate an untrusted users/{uid}.summary field instead of blind-casting it.
 * Pre-shape-rule legacy docs (or a hand-edited console doc) could carry
 * wrong-typed fields; a bad summary should be dropped, not handed to the
 * dashboard where every numeric read would silently render NaN/undefined.
 */
export function isUserSummary(v: unknown): v is UserSummary {
  if (
    !isRecord(v) ||
    typeof v.readiness !== "number" ||
    typeof v.streak !== "number" ||
    !isRecord(v.topicMastery) ||
    !Object.values(v.topicMastery).every((n) => typeof n === "number")
  ) {
    return false;
  }
  if (v.lastExam !== undefined) {
    const e = v.lastExam;
    if (
      !isRecord(e) ||
      typeof e.score !== "number" ||
      typeof e.total !== "number" ||
      typeof e.passed !== "boolean" ||
      typeof e.at !== "number"
    ) {
      return false;
    }
  }
  return true;
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
