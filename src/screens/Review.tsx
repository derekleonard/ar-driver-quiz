import { useMemo } from "react";
import { Link } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { useQuizSession } from "../hooks/useQuizSession";
import { reviewQueue } from "../lib/leitner";
import { useAppData } from "../state/AppData";

export default function Review() {
  const { srs } = useAppData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questions = useMemo(() => reviewQueue(srs, BANK, Date.now()), []);
  const quiz = useQuizSession(questions, { mode: "review", revealEach: true });

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

  if (quiz.finished && quiz.result) {
    return (
      <div className="screen">
        <h1>Review complete</h1>
        <p className="big-score">
          {quiz.result.score}/{quiz.total}
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
        <Link to="/" onClick={quiz.confirmLeave}>←</Link>
        <span>Review</span>
        <span>
          {quiz.index + 1}/{quiz.total}
        </span>
      </header>
      <QuestionCard
        question={quiz.questions[quiz.index]}
        selected={quiz.selected}
        revealed={quiz.revealed}
        onSelect={quiz.choose}
      />
      {quiz.revealed && (
        <button className="btn primary" onClick={quiz.next}>
          {quiz.index + 1 >= quiz.total ? "Finish" : "Next"}
        </button>
      )}
    </div>
  );
}
