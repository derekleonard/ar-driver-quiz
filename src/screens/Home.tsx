import { Link } from "react-router-dom";
import { BANK, BANK_IDS } from "../data/bank";
import { dueCount, reviewQueue } from "../lib/leitner";
import { readinessScore, topicStatsFromAttempts } from "../lib/scoring";
import { studyStreak } from "../lib/streak";
import { useAppData } from "../state/AppData";
import { TOPICS, TOPIC_LABELS } from "../types";

export default function Home() {
  const { srs, attempts, mode, role, userName, signOut } = useAppData();
  const readiness = readinessScore(srs, BANK_IDS, attempts);
  const stats = topicStatsFromAttempts(attempts);
  const exams = attempts.filter((a) => a.mode === "exam");
  const lastExams = exams.slice(-5).reverse();
  const streak = studyStreak(attempts, Date.now());
  const now = Date.now();
  const due = dueCount(srs, BANK_IDS, now);
  // Same source of truth as the Review screen, so the button never lies.
  const reviewLen = reviewQueue(srs, BANK, now).length;

  const counts = new Map<string, number>();
  for (const q of BANK) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);

  return (
    <div className="screen">
      <header className="app-header">
        <h1>AR Driver Quiz</h1>
        <p className="subtitle">
          Arkansas knowledge test prep
          {userName ? ` · ${userName.split(" ")[0]}` : ""}
        </p>
      </header>

      <div className="readiness">
        <div className="readiness-score">{readiness}</div>
        <div className="readiness-label">
          Readiness
          <span className="readiness-hint">
            {readiness >= 85 ? "You're ready — go pass it!" : readiness >= 60 ? "Getting close. Drill your weak topics." : "Keep practicing — focus on drills."}
          </span>
          {streak > 1 && <span className="streak">🔥 {streak}-day streak</span>}
        </div>
      </div>

      {role === "parent" && (
        <Link className="btn" to="/dashboard">
          Family Dashboard
        </Link>
      )}

      {attempts.length === 0 && (
        <Link className="btn primary" to="/diagnostic">
          Start with the Diagnostic (40 questions)
        </Link>
      )}

      {attempts.length > 0 && reviewLen > 0 && (
        <Link className="btn primary" to="/review">
          Review {reviewLen} question{reviewLen === 1 ? "" : "s"}
          {due > 0 ? ` (${due} due)` : ""}
        </Link>
      )}

      <Link
        className={`btn ${attempts.length === 0 || due > 0 ? "" : "primary"}`}
        to="/exam"
      >
        Take a Practice Exam (25 questions)
      </Link>

      <h2>Drill by topic</h2>
      <div className="topic-grid">
        {TOPICS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => {
          const s = stats[t];
          const pct = s && s.total > 0 ? Math.round((100 * s.correct) / s.total) : null;
          return (
            <Link key={t} className="topic-tile" to={`/drill/${t}`}>
              <span className="topic-name">{TOPIC_LABELS[t]}</span>
              <span className={`topic-pct ${pct === null ? "" : pct >= 80 ? "good" : pct >= 60 ? "ok" : "bad"}`}>
                {pct === null ? "—" : `${pct}%`}
              </span>
            </Link>
          );
        })}
      </div>

      {lastExams.length > 0 && (
        <>
          <h2>Recent exams</h2>
          <ul className="exam-history">
            {lastExams.map((a, i) => (
              <li key={i} className={a.passed ? "passed" : "failed"}>
                <span>{new Date(a.startedAt).toLocaleDateString()}</span>
                <span>
                  {a.score}/{a.total} {a.passed ? "PASS" : "fail"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === "cloud" && (
        <button className="link-btn" onClick={signOut}>
          Sign out
        </button>
      )}
    </div>
  );
}
