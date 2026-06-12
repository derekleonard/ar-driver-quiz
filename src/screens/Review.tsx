import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { applyAnswer } from "../lib/leitner";
import { perTopicForAnswers } from "../lib/scoring";
import { shuffle } from "../lib/shuffle";
import { useAppData } from "../state/AppData";
import type { SrsState } from "../types";

const REVIEW_SIZE = 15;

export default function Review() {
  const { srs, finishQuiz } = useAppData();
  const [startedAt] = useState(Date.now());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const sessionSrs = useRef<SrsState | null>(null);

  const questions = useMemo(() => {
    const now = Date.now();
    // Seen-and-due first (real reviews, most fragile box first), then unseen.
    const seenDue = BANK.filter((q) => srs[q.id] && srs[q.id].due <= now).sort(
      (a, b) => srs[a.id].box - srs[b.id].box,
    );
    const unseen = shuffle(BANK.filter((q) => !srs[q.id]));
    return [...seenDue, ...unseen].slice(0, REVIEW_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (questions.length === 0) {
    return (
      <div className="screen">
        <h1>All caught up!</h1>
        <p className="subtitle">Nothing is due for review. Come back tomorrow, or take a practice exam.</p>
        <Link className="btn primary" to="/exam">Practice Exam</Link>
        <Link className="btn" to="/">Home</Link>
      </div>
    );
  }

  const done = index >= questions.length;

  function choose(i: number) {
    if (revealed) return;
    setSelected(i);
    setRevealed(true);
    const q = questions[index];
    sessionSrs.current = applyAnswer(
      sessionSrs.current ?? srs,
      q.id,
      i === q.answerIndex,
      Date.now(),
    );
    setAnswers((a) => [...a, i]);
  }

  function next() {
    if (index + 1 >= questions.length) {
      const { perTopic, missedIds, score } = perTopicForAnswers(questions, [
        ...answers,
      ]);
      finishQuiz(sessionSrs.current ?? srs, {
        mode: "review",
        score,
        total: questions.length,
        startedAt,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        perTopic,
        missedIds,
      });
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  }

  if (done) {
    const score = answers.filter((a, i) => a === questions[i].answerIndex).length;
    return (
      <div className="screen">
        <h1>Review complete</h1>
        <p className="big-score">
          {score}/{questions.length}
        </p>
        <p className="subtitle">
          Questions you got right moved up a box; misses start over at box 1.
        </p>
        <Link className="btn primary" to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/">←</Link>
        <span>Review</span>
        <span>
          {index + 1}/{questions.length}
        </span>
      </header>
      <QuestionCard
        question={questions[index]}
        selected={selected}
        revealed={revealed}
        onSelect={choose}
      />
      {revealed && (
        <button className="btn primary" onClick={next}>
          {index + 1 >= questions.length ? "Finish" : "Next"}
        </button>
      )}
    </div>
  );
}
