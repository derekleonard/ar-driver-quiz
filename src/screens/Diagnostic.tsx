import { useMemo } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { useQuizSession } from "../hooks/useQuizSession";
import { buildDiagnostic } from "../lib/diagnosticBuilder";
import type { Topic } from "../types";
import { TOPIC_LABELS } from "../types";

export default function Diagnostic() {
  const questions = useMemo(() => buildDiagnostic(BANK), []);
  const quiz = useQuizSession(questions, { mode: "diagnostic" });

  if (quiz.finished && quiz.result) {
    const rows = Object.entries(quiz.result.perTopic) as [
      Topic,
      { correct: number; total: number },
    ][];
    rows.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
    return (
      <div className="screen">
        <h1>Diagnostic complete</h1>
        <p className="big-score">
          {quiz.result.score}/{quiz.total}
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
          {quiz.index + 1}/{quiz.total}
        </span>
      </header>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(100 * quiz.index) / quiz.total}%` }}
        />
      </div>
      <QuestionCard
        question={questions[quiz.index]}
        selected={quiz.selected}
        revealed={false}
        onSelect={quiz.choose}
      />
      <button
        className="btn primary"
        disabled={quiz.selected === null}
        onClick={quiz.next}
      >
        {quiz.index + 1 >= quiz.total ? "Finish" : "Next"}
      </button>
    </div>
  );
}
