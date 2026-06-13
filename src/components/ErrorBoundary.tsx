import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearAll } from "../lib/storage";

interface State {
  error: Error | null;
}

/**
 * Last-resort catch so a render-time throw (e.g. unexpected data shapes)
 * shows a recovery screen instead of a white page.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Render crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen login-screen">
        <header className="app-header">
          <h1>AR Driver Quiz</h1>
        </header>
        <div className="card">
          <p className="question-text">Something went wrong.</p>
          <p>Reloading usually fixes it. Your synced progress is safe.</p>
          <p className="citation">{String(this.state.error)}</p>
        </div>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button
          className="btn"
          onClick={() => {
            if (
              window.confirm(
                "Reset data saved on this device and reload? Cloud-synced progress is kept.",
              )
            ) {
              clearAll();
              window.location.reload();
            }
          }}
        >
          Reset locally saved data
        </button>
      </div>
    );
  }
}
