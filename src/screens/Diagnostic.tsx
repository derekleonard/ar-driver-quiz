import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { buildDiagnostic } from "../lib/diagnosticBuilder";
import { applyAnswer } from "../lib/leitner";
import { perTopicForAnswers } from "../lib/scoring";
import { useAppData } from "../state/AppData";
import type { Topic } from "../types";
import { TOPIC_LABELS } from "../types";

export default function Diagnostic() {
  const { srs, finishQuiz } = useAppData();
  const [startedAt] = useState(Date.now());
  const questions = useMemo(() => buildDiagnostic(BANK), []);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null),
  );
  const [finished, setFinished] = useState(false);

  const result = useMemo(
    () => (finished ? perTopicForAnswers(questions, answers) : null),
    [finished, questions, answers],
  );

  function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    const { perTopic, missedIds, score } = perTopicForAnswers(questions, answers);
    let newSrs = srs;
    const now = Date.now();
    questions.forEach((q, qi) => {
      newSrs = applyAnswer(newSrs, q.id, answers[qi] === q.answerIndex, now);
    });
    finishQuiz(newSrs, {
      mode: "diagnostic",
      score,
      total: questions.length,
      startedAt,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      perTopic,
      missedIds,
    });
    setFinished(true);
  }

  if (finished && result) {
    const rows = Object.entries(result.perTopic) as [
      Topic,
      { correct: number; total: number },
    ][];
    rows.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
    return (
      <div className="screen">
        <h1>Diagnostic complete</h1>
        <p className="big-score">
          {result.score}/{questions.length}
        </p>
        <h2>Your topics, weakest first</h2>
        <div className="card">
          {rows.map(([topic, s]) => {
            const pct = Math.round((100 * s.correct) / s.total);
            return (
              <Link key={topic} className="diag-row" to={`/drill/${topic}`}>
                <span>{TOPIC_LABELS[topic]}</span>
                <span className={pct >= 80 ? "good" : pct >= 60 ? "ok" : "bad"}>
                  {s.correct}/{s.total}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="subtitle">
          Tap a topic to start drilling it. Your misses are now queued for review.
        </p>
        <Link className="btn primary" to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/">←</Link>
        <span>Diagnostic</span>
        <span>
          {index + 1}/{questions.length}
        </span>
      </header>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(100 * index) / questions.length}%` }}
        />
      </div>
      <QuestionCard
        question={questions[index]}
        selected={answers[index]}
        revealed={false}
        onSelect={(i) =>
          setAnswers((a) => {
            const nextA = [...a];
            nextA[index] = i;
            return nextA;
          })
        }
      />
      <button
        className="btn primary"
        disabled={answers[index] === null}
        onClick={next}
      >
        {index + 1 >= questions.length ? "Finish" : "Next"}
      </button>
    </div>
  );
}
