import React from "react";
import { AuthContext } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, LogIn } from "lucide-react";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, isAuthenticated, login } = React.useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/40 to-muted">
        <Card className="w-full max-w-md border-border/50 shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary border border-border/50">Auth</Badge>
              <Badge variant="secondary">Loading</Badge>
            </div>
            <CardTitle className="text-xl">Preparing your dashboard</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Checking your sign-in session…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-muted">
        <Card className="w-full max-w-lg border-border/50 shadow-2xl">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge className="bg-primary/10 text-primary border border-border/50">OpportunityDash</Badge>
              <Badge variant="secondary">Secure</Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Sign in required</CardTitle>
                <p className="text-sm text-muted-foreground">Use your work Microsoft account to continue.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground">
              Single-tenant access. Only approved organization accounts can enter.
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => {
                console.info("[auth.msal] require-auth.login.click");
                login();
              }}
            >
              <LogIn className="h-4 w-4" />
              Sign in with Microsoft
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
