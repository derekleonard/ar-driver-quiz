import { Navigate, Route, Routes } from "react-router-dom";
import { useAppData } from "./state/AppData";
import Home from "./screens/Home";
import Drill from "./screens/Drill";
import Exam from "./screens/Exam";
import Diagnostic from "./screens/Diagnostic";
import Review from "./screens/Review";
import Dashboard, { KidDetail } from "./screens/Dashboard";
import { DeniedScreen, ErrorScreen, LoadingScreen, LoginScreen } from "./screens/Login";

// Exported so the router test can exercise the exact route table the app
// ships, including the catch-all, without a DOM.
export function appRoutes(role: "parent" | "student") {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/diagnostic" element={<Diagnostic />} />
      <Route path="/drill/:topic" element={<Drill />} />
      <Route path="/exam" element={<Exam />} />
      <Route path="/review" element={<Review />} />
      {role === "parent" && (
        <>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:uid" element={<KidDetail />} />
        </>
      )}
      {/* Unknown URLs — and /dashboard* for a student, where those routes
          aren't registered — would otherwise render a blank body under the
          header. Send them home instead of stranding the user. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const { phase, role, syncError } = useAppData();

  if (phase === "loading") return <LoadingScreen />;
  if (phase === "signed-out") return <LoginScreen />;
  if (phase === "denied") return <DeniedScreen />;
  if (phase === "error") return <ErrorScreen />;

  return (
    <>
      {syncError && <div className="sync-banner">{syncError}</div>}
      {appRoutes(role)}
    </>
  );
}
