import React from "react";
import { AuthContext } from "../auth/AuthProvider";

export const AuthStatus: React.FC = () => {
  const { isAuthenticated, accountUpn, logout } = React.useContext(AuthContext);
  if (!isAuthenticated) return null;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span>{accountUpn}</span>
      <button onClick={logout}>Sign out</button>
    </div>
  );
};
