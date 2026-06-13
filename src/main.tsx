import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppDataProvider } from "./state/AppData";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppDataProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AppDataProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
