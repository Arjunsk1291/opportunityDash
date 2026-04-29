import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserRole } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, loginAsRole } = useAuth();
  const [emailOverride, setEmailOverride] = useState('');
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleButtons: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];

  if (!isAuthenticated) {
    return (
      <div className="mx-auto mt-16 w-full max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">Simple Role Login</h1>
        <p className="text-sm text-slate-600">
          OAuth/MSAL is temporarily disabled. Click a role to sign in for diagnostics.
        </p>
        <Input
          value={emailOverride}
          onChange={(e) => setEmailOverride(e.target.value)}
          placeholder="Optional email override (e.g. admin@local.test)"
          className="max-w-md"
        />
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {roleButtons.map((role) => (
            <Button
              key={role}
              type="button"
              variant="outline"
              disabled={Boolean(loadingRole)}
              onClick={async () => {
                setLoadingRole(role);
                setError(null);
                try {
                  await loginAsRole(role, emailOverride);
                } catch (err) {
                  setError((err as Error).message || 'Role login failed');
                } finally {
                  setLoadingRole(null);
                }
              }}
            >
              {loadingRole === role ? 'Signing in...' : role}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
