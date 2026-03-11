import React from "react";
import { AuthContext } from "./AuthProvider";
import { Loader2 } from "lucide-react";
import { AuthScene, MicrosoftSignInButton } from "@/components/auth/AuthScene";
import { ReportIssueButton } from "@/components/ReportIssueButton";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, isAuthenticated, login } = React.useContext(AuthContext);

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

  if (!isAuthenticated) {
    return (
      <>
        <AuthScene title="Welcome Back">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
              Sign in with your Microsoft work account to access the Avenir tender dashboard.
              Access is restricted to approved organizational users.
            </div>
            <MicrosoftSignInButton
              onClick={() => {
                console.info("[auth.msal] require-auth.login.click");
                login();
              }}
            >
              Sign in with Microsoft
            </MicrosoftSignInButton>
          </div>
        </AuthScene>
        <ReportIssueButton />
      </>
    );
  }

  return <>{children}</>;
};
