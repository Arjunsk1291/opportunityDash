import React from "react";
import { AuthContext } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, LogIn } from "lucide-react";
import { BrandCornerLogo } from "@/components/BrandCornerLogo";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, isAuthenticated, login } = React.useContext(AuthContext);

  if (loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-[#0a1a33] text-white overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,_rgba(8,18,36,0.95),_rgba(10,38,74,0.95)),radial-gradient(circle_at_top,_rgba(48,122,196,0.35),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(14,97,132,0.35),_transparent_60%)]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
        <Card className="w-full max-w-md border-border/50 shadow-xl text-foreground">
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
        <BrandCornerLogo className="bg-white/5" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-[#0a1a33] text-white overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,_rgba(8,18,36,0.95),_rgba(10,38,74,0.95)),radial-gradient(circle_at_top,_rgba(48,122,196,0.35),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(14,97,132,0.35),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.18)_1px,_transparent_0)] [background-size:22px_22px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
        <Card className="w-full max-w-lg border-border/50 shadow-2xl bg-card/90 backdrop-blur text-foreground">
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
        <BrandCornerLogo className="bg-white/5" />
      </div>
    );
  }

  return <>{children}</>;
};
