import React from "react";
import { AuthContext } from "./AuthProvider";
import { Loader2 } from "lucide-react";
import { AuthScene, MicrosoftSignInButton } from "@/components/auth/AuthScene";
import { ReportIssueButton } from "@/components/ReportIssueButton";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, loginInProgress, isAuthenticated, login } = React.useContext(AuthContext);
  const { isAuthenticated: hasSession, loginWithPassword } = useAuth();
  const isPopupWindow = typeof window !== "undefined" && window.opener && window.opener !== window;
  const isMsalCallbackWindow = typeof window !== "undefined"
    && window.location.pathname === "/auth/callback"
    && /(?:^#|&)(code|error)=/.test(window.location.hash || "");
  const isMsalCallbackPopup = isPopupWindow && isMsalCallbackWindow;
  const [showPassword, setShowPassword] = React.useState(false);
  const [passwordEmail, setPasswordEmail] = React.useState("");
  const [passwordValue, setPasswordValue] = React.useState("");
  const [passwordLoading, setPasswordLoading] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isMsalCallbackPopup) return;
    const closeAttempt = () => {
      try {
        window.close();
      } catch {
        // Ignore close failures; fallback UI is shown below.
      }
    };
    closeAttempt();
    const timer = window.setTimeout(closeAttempt, 250);
    return () => window.clearTimeout(timer);
  }, [isMsalCallbackPopup]);

  if (loading) {
    return (
      <>
        <AuthScene title="Welcome Back">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Checking your Microsoft session</p>
              <p className="text-sm leading-6 text-slate-500">Preparing secure access to the Avenir opportunity workspace.</p>
            </div>
          </div>
        </AuthScene>
        <ReportIssueButton />
      </>
    );
  }

  if (!isAuthenticated && !hasSession) {
    if (isPopupWindow || isMsalCallbackPopup) {
      return (
        <>
          <AuthScene title="Completing Sign-In">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
              Microsoft sign-in is being completed in this window. You can close this popup if it does not close automatically.
            </div>
          </AuthScene>
          <ReportIssueButton />
        </>
      );
    }
    return (
      <>
        <AuthScene title="Welcome Back">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
              Sign in with your Microsoft work account to access the Avenir tender dashboard.
              Access is restricted to approved organizational users.
            </div>
            <MicrosoftSignInButton
              disabled={loginInProgress}
              onClick={() => {
                if (loginInProgress) return;
                console.info("[auth.msal] require-auth.login.click");
                login();
              }}
            >
              {loginInProgress ? "Opening Microsoft sign-in..." : "Sign in with Microsoft"}
            </MicrosoftSignInButton>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">Temp user password login</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Use password"}
                </Button>
              </div>
              {showPassword ? (
                <div className="mt-4 space-y-3">
                  {passwordError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {passwordError}
                    </div>
                  ) : null}
                  <Input
                    placeholder="Email"
                    value={passwordEmail}
                    onChange={(e) => setPasswordEmail(e.target.value)}
                    className="text-sm"
                    autoComplete="username"
                  />
                  <Input
                    placeholder="Password"
                    type="password"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className="text-sm"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={passwordLoading}
                    onClick={async () => {
                      if (passwordLoading) return;
                      setPasswordLoading(true);
                      setPasswordError(null);
                      try {
                        await loginWithPassword(passwordEmail, passwordValue);
                      } catch (err) {
                        setPasswordError((err as Error).message || "Password login failed");
                      } finally {
                        setPasswordLoading(false);
                      }
                    }}
                  >
                    {passwordLoading ? "Signing in..." : "Sign in"}
                  </Button>
                  <p className="text-xs text-slate-500">
                    Password login is restricted to TempUser accounts and expires automatically.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </AuthScene>
        <ReportIssueButton />
      </>
    );
  }

  return <>{children}</>;
};
