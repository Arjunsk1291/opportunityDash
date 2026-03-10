import React from "react";
import { AuthContext } from "./AuthProvider";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, isAuthenticated, login } = React.useContext(AuthContext);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Sign in required</h2>
        <p>Use your work Microsoft account to continue.</p>
        <button
          onClick={() => {
            console.info("[auth.msal] require-auth.login.click");
            login();
          }}
        >
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
