import type { Question } from "../types";

interface Props {
  question: Question;
  selected: number | null;
  /** When true, the correct answer and explanation are revealed. */
  revealed: boolean;
  onSelect: (index: number) => void;
}

export default function QuestionCard({ question, selected, revealed, onSelect }: Props) {
  return (
    <div className="card">
      {question.image && (
        <img
          className="sign-img"
          src={`${import.meta.env.BASE_URL}${question.image}`}
          alt="Road sign"
        />
      )}
      <p className="question-text">{question.question}</p>
      <div className="choices">
        {question.choices.map((choice, i) => {
          let cls = "choice";
          if (revealed) {
            if (i === question.answerIndex) cls += " correct";
            else if (i === selected) cls += " wrong";
          } else if (i === selected) {
            cls += " selected";
          }
          return (
            <button
              key={i}
              className={cls}
              disabled={revealed}
              onClick={() => onSelect(i)}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className={`explanation ${selected === question.answerIndex ? "good" : "bad"}`}>
          <p>{selected === question.answerIndex ? "Correct!" : "Not quite."}</p>
          <p>{question.explanation}</p>
          <p className="citation">{question.citation}</p>
        </div>
      )}
    </div>
  );
}
