import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { buildExam, PASS_SCORE } from "../lib/examBuilder";
import { applyAnswer } from "../lib/leitner";
import { perTopicForAnswers } from "../lib/scoring";
import { loadSrs, saveAttempt, saveSrs } from "../lib/storage";
import { TOPIC_LABELS } from "../types";

export default function Exam() {
  const [startedAt] = useState(Date.now());
  const questions = useMemo(() => buildExam(BANK), []);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null),
  );
  const [finished, setFinished] = useState(false);

  const result = useMemo(
    () => (finished ? perTopicForAnswers(questions, answers) : null),
    [finished, questions, answers],
  );

  function choose(i: number) {
    setAnswers((a) => {
      const next = [...a];
      next[index] = i;
      return next;
    });
  }

  function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    // Finish: grade, update SRS, save attempt.
    const { perTopic, missedIds, score } = perTopicForAnswers(questions, answers);
    let srs = loadSrs();
    const now = Date.now();
    questions.forEach((q, qi) => {
      srs = applyAnswer(srs, q.id, answers[qi] === q.answerIndex, now);
    });
    saveSrs(srs);
    saveAttempt({
      mode: "exam",
      score,
      total: questions.length,
      passed: score >= PASS_SCORE,
      startedAt,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      perTopic,
      missedIds,
    });
    setFinished(true);
  }

  if (finished && result) {
    const passed = result.score >= PASS_SCORE;
    const missed = questions.filter((q) => result.missedIds.includes(q.id));
    return (
      <div className="screen">
        <h1>{passed ? "PASS" : "Not yet"}</h1>
        <p className="big-score">
          {result.score}/{questions.length}
        </p>
        <p className="subtitle">
          The real test needs {PASS_SCORE}/{questions.length} (80%).
        </p>
        {missed.length > 0 && (
          <>
            <h2>Review your misses</h2>
            {missed.map((q) => (
              <div key={q.id} className="card miss-review">
                {q.image && (
                  <img
                    className="sign-img small"
                    src={`${import.meta.env.BASE_URL}${q.image}`}
                    alt="Road sign"
                  />
                )}
                <p className="question-text">{q.question}</p>
                <p className="answer-line">✓ {q.choices[q.answerIndex]}</p>
                <p>{q.explanation}</p>
                <p className="citation">
                  {q.citation} · {TOPIC_LABELS[q.topic]}
                </p>
              </div>
            ))}
          </>
        )}
        <Link className="btn primary" to="/">Home</Link>
      </div>
    );
  }

  const q = questions[index];
  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/">←</Link>
        <span>Practice Exam</span>
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
        question={q}
        selected={answers[index]}
        revealed={false}
        onSelect={choose}
      />
      <button
        className="btn primary"
        disabled={answers[index] === null}
        onClick={next}
      >
        {index + 1 >= questions.length ? "Finish & Grade" : "Next"}
      </button>
    </div>
  );
}
