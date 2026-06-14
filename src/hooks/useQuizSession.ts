import { useEffect, useRef, useState } from "react";
import { isPassing } from "../lib/examBuilder";
import { applyAnswer } from "../lib/leitner";
import { perTopicForAnswers } from "../lib/scoring";
import { shuffleChoices } from "../lib/shuffle";
import { useAppData } from "../state/AppData";
import type { Question, QuizMode, Topic } from "../types";

interface Options {
  mode: QuizMode;
  topic?: Topic;
  /** Reveal the answer after each question instead of grading at the end. */
  revealEach?: boolean;
}

/**
 * Owns the quiz state machine for every screen: answer collection, the
 * reveal flow, SRS application, and Attempt assembly. finishQuiz is called
 * exactly once per session (a fast double-tap on Finish must not save twice).
 */
export function useQuizSession(
  questions: Question[],
  { mode, topic, revealEach = false }: Options,
) {
  const { srs, finishQuiz } = useAppData();
  // Shuffle each question's choices once per session so neither answer
  // position nor length is a tell. This is the canonical list for the
  // session: screens must render from it (returned below) so the option the
  // user taps matches what gets graded here.
  const [items] = useState(() => questions.map((q) => shuffleChoices(q)));
  const [startedAt] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    Array(items.length).fill(null),
  );
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const submitted = useRef(false);

  const selected = answers[index] ?? null;
  const result = finished ? perTopicForAnswers(items, answers) : null;
  const inProgress = !finished && answers.some((a) => a !== null);

  // A refresh, tab close, or back-swipe out of the app would silently drop
  // the in-flight session — ask first.
  useEffect(() => {
    if (!inProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inProgress]);

  /** onClick guard for in-app exits (the header home link). */
  function confirmLeave(e: { preventDefault: () => void }) {
    if (
      inProgress &&
      !window.confirm("Leave this session? Your progress so far will be lost.")
    ) {
      e.preventDefault();
    }
  }

  function choose(i: number) {
    if (revealEach && revealed) return;
    setAnswers((a) => {
      const next = [...a];
      next[index] = i;
      return next;
    });
    if (revealEach) setRevealed(true);
  }

  function next() {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setRevealed(false);
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    const { perTopic, missedIds, score } = perTopicForAnswers(items, answers);
    const now = Date.now();
    let newSrs = srs;
    items.forEach((q, qi) => {
      newSrs = applyAnswer(newSrs, q.id, answers[qi] === q.answerIndex, now);
    });
    finishQuiz(newSrs, {
      mode,
      ...(topic && { topic }),
      score,
      total: items.length,
      ...(mode === "exam" && { passed: isPassing(score) }),
      startedAt,
      durationSec: Math.round((now - startedAt) / 1000),
      perTopic,
      missedIds,
    });
    setFinished(true);
  }

  return {
    index,
    total: items.length,
    questions: items,
    answers,
    selected,
    revealed,
    finished,
    result,
    choose,
    next,
    confirmLeave,
  };
}
