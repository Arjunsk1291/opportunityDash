import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const loginLockRef = useRef(false);
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
    msalInstance.logoutPopup({ account })
      .then(() => authDebug("logout.popup.success"))
      .catch((error) => {
        console.warn("[auth.msal] logout.popup.failed", error);
        msalInstance.logoutRedirect({ account });
      });
  }, [authDebug]);

  const login = useCallback(async () => {
    if (loginLockRef.current) return;
    loginLockRef.current = true;
    setLoginInProgress(true);
    const msalInstance = getMsalInstance();
    authDebug("login.popup.start");
    try {
      await msalInstance.loginPopup(loginRequest);
      authDebug("login.popup.success");
    } catch (e: any) {
      console.warn("[auth.msal] login.popup.failed", e);
      if (e?.errorCode === "user_cancelled") {
        const recoveredAccount = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
        if (recoveredAccount) {
          msalInstance.setActiveAccount(recoveredAccount);
          setIsAuthenticated(true);
          setAccountUpn(recoveredAccount.username);
          window.dispatchEvent(new CustomEvent("msal:user", { detail: { username: recoveredAccount.username } }));
          authDebug("login.popup.recovered", { account: recoveredAccount.username });
          return;
        }
        authDebug("login.redirect.fallback", { errorCode: e?.errorCode || "unknown" });
        msalInstance.loginRedirect(loginRequest);
        return;
      }
      if (e?.errorCode === "popup_window_error") {
        authDebug("login.redirect.fallback", { errorCode: e?.errorCode || "unknown" });
        msalInstance.loginRedirect(loginRequest);
        return;
      }
      throw e;
    } finally {
      loginLockRef.current = false;
      setLoginInProgress(false);
    }
    const acct = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (acct) {
      msalInstance.setActiveAccount(acct);
      setIsAuthenticated(true);
      setAccountUpn(acct.username);
      window.dispatchEvent(new CustomEvent("msal:user", { detail: { username: acct.username } }));
      authDebug("login.complete", { account: acct.username });
    }
  }, [authDebug]);

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
