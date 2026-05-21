import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Defensive shim: some deployments/bundles may reference a global `downloadTemplate()`.
// Provide a safe no-op so the app doesn't crash with a ReferenceError.
// Real template downloads are implemented within their respective pages.
if (typeof window !== "undefined") {
  const w = window as unknown as { downloadTemplate?: () => void };
  if (typeof w.downloadTemplate !== "function") {
    w.downloadTemplate = () => {
      // Intentionally empty.
    };
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
