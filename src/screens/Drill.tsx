import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { applyAnswer } from "../lib/leitner";
import { perTopicForAnswers } from "../lib/scoring";
import { shuffle } from "../lib/shuffle";
import { loadSrs, saveAttempt, saveSrs } from "../lib/storage";
import type { Topic } from "../types";
import { TOPIC_LABELS } from "../types";

const DRILL_SIZE = 10;

export default function Drill() {
  const { topic } = useParams<{ topic: Topic }>();
  const [startedAt] = useState(Date.now());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  const questions = useMemo(() => {
    const srs = loadSrs();
    const pool = BANK.filter((q) => q.topic === topic);
    // Worst-first: lowest Leitner box (unseen = box 1), then shuffle within.
    return shuffle(pool)
      .sort((a, b) => (srs[a.id]?.box ?? 1) - (srs[b.id]?.box ?? 1))
      .slice(0, DRILL_SIZE);
  }, [topic]);

  if (!topic || questions.length === 0) {
    return (
      <div className="screen">
        <p>No questions for this topic yet.</p>
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
    saveSrs(applyAnswer(loadSrs(), q.id, i === q.answerIndex, Date.now()));
    setAnswers((a) => [...a, i]);
  }

  function next() {
    if (index + 1 >= questions.length) {
      const { perTopic, missedIds, score } = perTopicForAnswers(questions, [
        ...answers,
      ]);
      saveAttempt({
        mode: "drill",
        topic,
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
        <h1>Drill complete</h1>
        <p className="big-score">
          {score}/{questions.length}
        </p>
        <Link className="btn primary" to={`/drill/${topic}`} onClick={() => window.location.reload()}>
          Drill again
        </Link>
        <Link className="btn" to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/">←</Link>
        <span>{TOPIC_LABELS[topic]}</span>
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
