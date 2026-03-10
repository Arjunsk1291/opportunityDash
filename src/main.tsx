import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { msalInstance } from "./auth/msalClient";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import "./index.css";

async function bootstrap() {
  await msalInstance.initialize();
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
