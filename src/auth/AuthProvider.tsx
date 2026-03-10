import React, { useEffect, useMemo, useState } from "react";
import { msalInstance } from "./msalClient";
import { loginRequest } from "./msalConfig";

type AuthContextType = {
  loading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  accountUpn?: string;
};

export const AuthContext = React.createContext<AuthContextType>({
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accountUpn, setAccountUpn] = useState<string | undefined>(undefined);
  const authDebug = (message: string, details?: Record<string, unknown>) => {
    if (details) {
      console.info(`[auth.msal] ${message}`, details);
    } else {
      console.info(`[auth.msal] ${message}`);
    }
  };

  useEffect(() => {
    (async () => {
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

  const login = async () => {
    authDebug("login.popup.start");
    try {
      await msalInstance.loginPopup(loginRequest);
      authDebug("login.popup.success");
    } catch (e: any) {
      console.warn("[auth.msal] login.popup.failed", e);
      if (e?.errorCode === "popup_window_error" || e?.errorCode === "user_cancelled") {
        authDebug("login.redirect.fallback", { errorCode: e?.errorCode || "unknown" });
        msalInstance.loginRedirect(loginRequest);
        return;
      }
      throw e;
    }
    const acct = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (acct) {
      msalInstance.setActiveAccount(acct);
      setIsAuthenticated(true);
      setAccountUpn(acct.username);
      authDebug("login.complete", { account: acct.username });
    }
  };

  const logout = () => {
    const account = msalInstance.getActiveAccount();
    authDebug("logout.start", { account: account?.username || null });
    msalInstance.logoutPopup({ account })
      .then(() => authDebug("logout.popup.success"))
      .catch((error) => {
        console.warn("[auth.msal] logout.popup.failed", error);
        msalInstance.logoutRedirect({ account });
      });
  };

  const value = useMemo(
    () => ({ loading, isAuthenticated, login, logout, accountUpn }),
    [loading, isAuthenticated, accountUpn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
