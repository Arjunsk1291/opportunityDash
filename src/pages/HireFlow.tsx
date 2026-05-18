import { ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PLAN_URL = import.meta.env.VITE_HIREFLOW_PLAN_URL as string | undefined;

export default function HireFlow() {
  const href = (PLAN_URL && String(PLAN_URL).trim()) || '';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight">HireFlow</h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
            Hiring pipeline and interview management (planned). This page is role-gated via the existing Master/Admin access model.
          </p>
        </header>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Plan</span>
              {href ? (
                <Button asChild variant="secondary" className="gap-2">
                  <a href={href} target="_blank" rel="noreferrer">
                    Open plan <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Badge variant="secondary">VITE_HIREFLOW_PLAN_URL not set</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Set `VITE_HIREFLOW_PLAN_URL` to your planning link to enable the button.
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle>Phases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Phase 1 (core contract)</div>
              <Badge variant="secondary">Incomplete</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Phase 2 (reviews/voting/scheduling)</div>
              <Badge variant="secondary">Incomplete</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Phase 3 (offer generation + approvals)</div>
              <Badge variant="secondary">Incomplete</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Phase 4 (Teams/Mail/analytics)</div>
              <Badge variant="secondary">Incomplete</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

