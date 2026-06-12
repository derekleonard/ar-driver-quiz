import type { Attempt, Question, SrsState, Topic } from "../types";
import { masteryFraction } from "./leitner";

export interface TopicStats {
  correct: number;
  total: number;
}

export function topicStatsFromAttempts(attempts: Attempt[]): Partial<Record<Topic, TopicStats>> {
  const out: Partial<Record<Topic, TopicStats>> = {};
  for (const a of attempts) {
    for (const [topic, s] of Object.entries(a.perTopic) as [Topic, TopicStats][]) {
      const cur = (out[topic] ??= { correct: 0, total: 0 });
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

  const exams = attempts.filter((a) => a.mode === "exam").slice(-5);
  const examAvg =
    exams.length === 0
      ? 0
      : exams.reduce((s, a) => s + a.score / a.total, 0) / exams.length;

  const stats = topicStatsFromAttempts(attempts);
  const topicRates = Object.values(stats)
    .filter((s) => s.total >= 3)
    .map((s) => s.correct / s.total);
  const worstTopic = topicRates.length === 0 ? 0 : Math.min(...topicRates);

  return Math.round(100 * (0.5 * mastery + 0.3 * examAvg + 0.2 * worstTopic));
}
