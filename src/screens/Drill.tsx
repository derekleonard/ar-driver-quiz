import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { BANK } from "../data/bank";
import { useQuizSession } from "../hooks/useQuizSession";
import { shuffle } from "../lib/shuffle";
import { useAppData } from "../state/AppData";
import type { Question, Topic } from "../types";
import { TOPIC_LABELS } from "../types";

const DRILL_SIZE = 10;

export default function Drill() {
  const { topic } = useParams<{ topic: Topic }>();
  const { srs } = useAppData();
  const [round, setRound] = useState(0);

  const questions = useMemo(() => {
    const pool = BANK.filter((q) => q.topic === topic);
    // Worst-first: lowest Leitner box (unseen = box 1), then shuffle within.
    return shuffle(pool)
      .sort((a, b) => (srs[a.id]?.box ?? 1) - (srs[b.id]?.box ?? 1))
      .slice(0, DRILL_SIZE);
    // srs intentionally omitted: the set is fixed for the round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, round]);

  if (!topic || questions.length === 0) {
    return (
      <div className="screen">
        <p>No questions for this topic yet.</p>
        <Link className="btn" to="/">Home</Link>
      </div>
    );
  }

  return (
    <DrillRound
      key={`${topic}-${round}`}
      topic={topic}
      questions={questions}
      onAgain={() => setRound((r) => r + 1)}
    />
  );
}

function DrillRound({
  topic,
  questions,
  onAgain,
}: {
  topic: Topic;
  questions: Question[];
  onAgain: () => void;
}) {
  const quiz = useQuizSession(questions, { mode: "drill", topic, revealEach: true });

  if (quiz.finished && quiz.result) {
    return (
      <div className="screen">
        <h1>Drill complete</h1>
        <p className="big-score">
          {quiz.result.score}/{quiz.total}
        </p>
        <button className="btn primary" onClick={onAgain}>
          Drill again
        </button>
        <Link className="btn" to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/" onClick={quiz.confirmLeave}>←</Link>
        <span>{TOPIC_LABELS[topic]}</span>
        <span>
          {quiz.index + 1}/{quiz.total}
        </span>
      </header>
      <QuestionCard
        question={questions[quiz.index]}
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
