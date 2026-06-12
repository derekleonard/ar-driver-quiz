import { Route, Routes } from "react-router-dom";
import { useAppData } from "./state/AppData";
import Home from "./screens/Home";
import Drill from "./screens/Drill";
import Exam from "./screens/Exam";
import Diagnostic from "./screens/Diagnostic";
import { DeniedScreen, LoadingScreen, LoginScreen } from "./screens/Login";

export default function App() {
  const { phase } = useAppData();

  if (phase === "loading") return <LoadingScreen />;
  if (phase === "signed-out") return <LoginScreen />;
  if (phase === "denied") return <DeniedScreen />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/diagnostic" element={<Diagnostic />} />
      <Route path="/drill/:topic" element={<Drill />} />
      <Route path="/exam" element={<Exam />} />
    </Routes>
  );
}
