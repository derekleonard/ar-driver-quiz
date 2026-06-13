import { useMemo } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { useQuizSession } from "../hooks/useQuizSession";
import { buildExam, isPassing, PASS_SCORE } from "../lib/examBuilder";
import { TOPIC_LABELS } from "../types";

export default function Exam() {
  const questions = useMemo(() => buildExam(BANK), []);
  const quiz = useQuizSession(questions, { mode: "exam" });

  if (quiz.finished && quiz.result) {
    const passed = isPassing(quiz.result.score);
    const missed = questions
      .map((q, i) => ({ q, given: quiz.answers[i] }))
      .filter(({ q }) => quiz.result!.missedIds.includes(q.id));
    return (
      <div className="screen">
        <h1>{passed ? "PASS" : "Not yet"}</h1>
        <p className="big-score">
          {quiz.result.score}/{quiz.total}
        </p>
        <p className="subtitle">
          The real test needs {PASS_SCORE}/{quiz.total} (80%).
        </p>
        {missed.length > 0 && (
          <>
            <h2>Review your misses</h2>
            {missed.map(({ q, given }) => (
              <div key={q.id}>
                <p className="citation">
                  {TOPIC_LABELS[q.topic]}
                  {given === null ? " · not answered" : ""}
                </p>
                <QuestionCard
                  question={q}
                  selected={given}
                  revealed
                  onSelect={() => {}}
                />
              </div>
            ))}
          </>
        )}
        <Link className="btn primary" to="/">Home</Link>
      </div>
    );
  }

  const q = questions[quiz.index];
  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/" onClick={quiz.confirmLeave}>←</Link>
        <span>Practice Exam</span>
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
        question={q}
        selected={quiz.selected}
        revealed={false}
        onSelect={quiz.choose}
      />
      <button
        className="btn primary"
        disabled={quiz.selected === null}
        onClick={quiz.next}
      >
        {quiz.index + 1 >= quiz.total ? "Finish & Grade" : "Next"}
      </button>
    </div>
  );
}
