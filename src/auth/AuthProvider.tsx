import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getMsalInstance } from "./msalClient";
import { loginRequest } from "./msalConfig";

type AuthContextType = {
  loading: boolean;
  loginInProgress: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  accountUpn?: string;
};

export const AuthContext = React.createContext<AuthContextType>({
  loading: true,
  loginInProgress: false,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [accountUpn, setAccountUpn] = useState<string | undefined>(undefined);
  const authDebug = React.useCallback((message: string, details?: Record<string, unknown>) => {
    if (details) {
      console.info(`[auth.msal] ${message}`, details);
    } else {
      console.info(`[auth.msal] ${message}`);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const msalInstance = getMsalInstance();
      authDebug("init.start", { mode: import.meta.env.MODE });
      try {
        const resp = await msalInstance.handleRedirectPromise();
        authDebug("redirect.handled", { hasResponse: Boolean(resp), account: resp?.account?.username || null });
        if (resp?.account) {
          msalInstance.setActiveAccount(resp.account);
        } else {
          const acct = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
          if (acct) msalInstance.setActiveAccount(acct);
        }
        const active = msalInstance.getActiveAccount();
        setIsAuthenticated(!!active);
        setAccountUpn(active?.username);
        if (active?.username) {
          window.dispatchEvent(new CustomEvent("msal:user", { detail: { username: active.username } }));
        } else {
          window.dispatchEvent(new CustomEvent("msal:user", { detail: { username: null } }));
        }
        authDebug("init.complete", {
          activeAccount: active?.username || null,
          accountCount: msalInstance.getAllAccounts().length,
          isAuthenticated: Boolean(active),
        });
      } catch (error) {
        console.error("[auth.msal] init.failed", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    window.dispatchEvent(
      new CustomEvent("msal:user", { detail: { username: accountUpn ?? null } })
    );
  }, [accountUpn, loading]);

  const performLogout = React.useCallback(() => {
    const msalInstance = getMsalInstance();
    const account = msalInstance.getActiveAccount();
    authDebug("logout.start", { account: account?.username || null });
    setIsAuthenticated(false);
    setAccountUpn(undefined);
    window.dispatchEvent(new CustomEvent("msal:user", { detail: { username: null } }));
    msalInstance.logoutRedirect({ account });
  }, [authDebug]);

  const login = useCallback(async () => {
    if (loginInProgress) return;
    setLoginInProgress(true);
    const msalInstance = getMsalInstance();
    authDebug("login.redirect.start");
    try {
      await msalInstance.loginRedirect(loginRequest);
    } finally {
      setLoginInProgress(false);
    }
  }, [authDebug, loginInProgress]);

  const logout = () => {
    performLogout();
  };

  useEffect(() => {
    const handler = () => performLogout();
    window.addEventListener("app:logout", handler);
    return () => window.removeEventListener("app:logout", handler);
  }, [performLogout]);

  const value = useMemo(
    () => ({ loading, loginInProgress, isAuthenticated, login, logout, accountUpn }),
    [loading, loginInProgress, isAuthenticated, login, logout, accountUpn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
