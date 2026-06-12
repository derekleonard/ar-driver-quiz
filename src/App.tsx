import { Route, Routes } from "react-router-dom";
import Home from "./screens/Home";
import Drill from "./screens/Drill";
import Exam from "./screens/Exam";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/drill/:topic" element={<Drill />} />
      <Route path="/exam" element={<Exam />} />
    </Routes>
  );
}
