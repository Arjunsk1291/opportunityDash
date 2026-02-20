import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2 } from 'lucide-react';

const DEFAULT_MASTER_USERNAME = (import.meta.env.VITE_DEFAULT_MASTER_USERNAME || 'arjun.s@avenirengineering.com').toLowerCase();

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, loginWithUsername } = useAuth();
  const [username, setUsername] = useState(DEFAULT_MASTER_USERNAME);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleMasterEntry = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      await loginWithUsername(DEFAULT_MASTER_USERNAME);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to enter as default master user.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSigningIn(true);
      setError(null);
      await loginWithUsername(username);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to sign in. Please try again.'));
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Opportunity Dashboard</CardTitle>
          <CardDescription>Sign in with your username</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <Input
              placeholder="username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Button type="submit" disabled={isSigningIn || !username.trim()} size="lg" className="w-full">
              {isSigningIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <Button type="button" variant="outline" onClick={handleMasterEntry} disabled={isSigningIn} className="w-full">Enter as Default Master</Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>Only authorized users can access this application.</p>
            <p className="mt-2">New users will be placed in pending approval.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
