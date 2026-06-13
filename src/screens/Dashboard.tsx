import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchFamily,
  loadAttempts,
  type FamilyUser,
} from "../firebase/store";
import { masteryClass } from "../lib/scoring";
import { TOPIC_LABELS, type Attempt, type Topic } from "../types";

function ago(ts: number | null): string {
  if (!ts) return "never";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Dashboard() {
  const [family, setFamily] = useState<FamilyUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFamily().then(setFamily, (e) => setError(String(e.message ?? e)));
  }, []);

  if (error) {
    return (
      <div className="screen">
        <p className="error-text">{error}</p>
        <Link className="btn" to="/">Home</Link>
      </div>
    );
  }
  if (!family) {
    return <div className="screen"><p className="subtitle">Loading…</p></div>;
  }

  const kids = family.filter((u) => u.role === "student");

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/">←</Link>
        <span>Family Dashboard</span>
        <span />
      </header>

      {kids.length === 0 && (
        <p className="subtitle">
          No students have signed in yet. Progress appears here after each kid's
          first session.
        </p>
      )}

      {kids.map((kid) => {
        const s = kid.summary;
        const mastery = Object.entries(s?.topicMastery ?? {}) as [Topic, number][];
        mastery.sort((a, b) => a[1] - b[1]);
        return (
          <Link key={kid.uid} to={`/dashboard/${kid.uid}`} className="card kid-card">
            <div className="kid-card-head">
              <span className="kid-name">{kid.displayName}</span>
              <span className="kid-active">{ago(kid.lastActive)}</span>
            </div>
            <div className="kid-stats">
              <div className="kid-stat">
                <span className="kid-stat-num">{s?.readiness ?? "—"}</span>
                <span className="kid-stat-label">readiness</span>
              </div>
              <div className="kid-stat">
                <span className="kid-stat-num">{s?.streak ?? 0}</span>
                <span className="kid-stat-label">day streak</span>
              </div>
              <div className="kid-stat">
                <span className="kid-stat-num">
                  {s?.lastExam ? `${s.lastExam.score}/${s.lastExam.total}` : "—"}
                </span>
                <span className="kid-stat-label">
                  last exam{s?.lastExam?.passed ? " ✓" : ""}
                </span>
              </div>
            </div>
            {mastery.length > 0 && (
              <div className="kid-mastery">
                {mastery.map(([topic, pct]) => (
                  <span key={topic} className={`mastery-chip ${masteryClass(pct)}`}>
                    {TOPIC_LABELS[topic] ?? topic} {pct}%
                  </span>
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function KidDetail() {
  const { uid } = useParams<{ uid: string }>();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    loadAttempts(uid).then(setAttempts, (e) => setError(String(e.message ?? e)));
  }, [uid]);

  if (error) {
    return (
      <div className="screen">
        <p className="error-text">{error}</p>
        <Link className="btn" to="/dashboard">Back</Link>
      </div>
    );
  }
  if (!attempts) {
    return <div className="screen"><p className="subtitle">Loading…</p></div>;
  }

  const recent = [...attempts].reverse().slice(0, 30);

  return (
    <div className="screen">
      <header className="quiz-header">
        <Link to="/dashboard">←</Link>
        <span>Session history</span>
        <span />
      </header>
      {recent.length === 0 && <p className="subtitle">No sessions yet.</p>}
      <ul className="exam-history">
        {recent.map((a, i) => (
          <li
            key={i}
            className={
              a.mode === "exam" ? (a.passed ? "passed" : "failed") : ""
            }
          >
            <span>
              {new Date(a.startedAt).toLocaleDateString()}{" "}
              {a.mode}
              {a.topic ? ` · ${TOPIC_LABELS[a.topic]}` : ""}
            </span>
            <span>
              {a.score}/{a.total}
              {a.mode === "exam" ? (a.passed ? " PASS" : " fail") : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
