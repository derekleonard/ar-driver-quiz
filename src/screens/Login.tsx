import { useState } from "react";
import { signInWithGoogle, signOutUser } from "../firebase/firebase";
import { useAppData } from "../state/AppData";

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="screen login-screen">
      <header className="app-header">
        <h1>AR Driver Quiz</h1>
        <p className="subtitle">Arkansas knowledge test prep</p>
      </header>
      <button
        className="btn primary"
        onClick={() =>
          signInWithGoogle().catch((e) => {
            if (e.code !== "auth/popup-closed-by-user") setError(String(e.message ?? e));
          })
        }
      >
        Sign in with Google
      </button>
      {error && <p className="error-text">{error}</p>}
      <p className="legal-links">
        <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy Policy</a>
        {" · "}
        <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms of Use</a>
      </p>
    </div>
  );
}

export function DeniedScreen() {
  const { deniedReason } = useAppData();
  return (
    <div className="screen login-screen">
      <header className="app-header">
        <h1>AR Driver Quiz</h1>
      </header>
      <div className="card">
        <p className="question-text">This account isn't on the family list yet.</p>
        <p>Ask Dad to add your Google email to the allowlist, then sign in again.</p>
        {deniedReason && <p className="citation">{deniedReason}</p>}
      </div>
      <button className="btn" onClick={() => void signOutUser()}>
        Use a different account
      </button>
    </div>
  );
}

export function ErrorScreen() {
  const { errorReason, retry } = useAppData();
  return (
    <div className="screen login-screen">
      <header className="app-header">
        <h1>AR Driver Quiz</h1>
      </header>
      <div className="card">
        <p className="question-text">Can't reach the cloud right now.</p>
        <p>Your progress is safe. Reconnect, then try again.</p>
        {errorReason && <p className="citation">{errorReason}</p>}
      </div>
      <button className="btn primary" onClick={retry}>
        Try again
      </button>
      <button className="btn" onClick={() => void signOutUser()}>
        Sign out
      </button>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="screen login-screen">
      <p className="subtitle">Loading…</p>
    </div>
  );
}
