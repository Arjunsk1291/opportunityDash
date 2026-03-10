import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initMsal } from "./auth/msalClient";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import "./index.css";

async function bootstrap() {
  try {
    const response = await fetch("/api/auth/msal-config", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) {
      const runtime = await response.json();
      await initMsal(runtime);
    } else {
      await initMsal();
    }
  } catch {
    await initMsal();
  }
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AuthProvider>
        <RequireAuth>
          <App />
        </RequireAuth>
      </AuthProvider>
    </React.StrictMode>
  );
}

bootstrap();
