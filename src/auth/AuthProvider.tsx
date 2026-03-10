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

  useEffect(() => {
    (async () => {
      try {
        const resp = await msalInstance.handleRedirectPromise();
        if (resp?.account) {
          msalInstance.setActiveAccount(resp.account);
        } else {
          const acct = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
          if (acct) msalInstance.setActiveAccount(acct);
        }
        const active = msalInstance.getActiveAccount();
        setIsAuthenticated(!!active);
        setAccountUpn(active?.username);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async () => {
    try {
      await msalInstance.loginPopup(loginRequest);
    } catch (e: any) {
      if (e?.errorCode === "popup_window_error" || e?.errorCode === "user_cancelled") {
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
    }
  };

  const logout = () => {
    const account = msalInstance.getActiveAccount();
    msalInstance.logoutPopup({ account })
      .catch(() => msalInstance.logoutRedirect({ account }));
  };

  const value = useMemo(
    () => ({ loading, isAuthenticated, login, logout, accountUpn }),
    [loading, isAuthenticated, accountUpn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
