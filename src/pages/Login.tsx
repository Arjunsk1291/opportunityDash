import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { msalInstance, loginRequest } from '@/config/msalConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleMicrosoftLogin = async () => {
    try {
      setIsSigningIn(true);
      setError(null);

      const loginResponse = await msalInstance.loginPopup(loginRequest);

      if (loginResponse) {
        // Redirect to auth callback which will handle token validation
        navigate('/auth/callback');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMsg = err.errorCode === 'user_cancelled_login'
        ? 'Login was cancelled'
        : err.error?.message || 'Failed to sign in with Microsoft. Please try again.';
      setError(errorMsg);
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
          <CardDescription>Sign in with your Microsoft 365 account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleMicrosoftLogin}
            disabled={isSigningIn}
            size="lg"
            className="w-full"
            variant="default"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.4 24H0V12.6h11.4V24ZM24 24H12.6V12.6H24V24ZM11.4 11.4H0V0h11.4v11.4Zm12.6 0H12.6V0H24v11.4Z" />
                </svg>
                Sign in with Microsoft
              </>
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>Only authorized users can access this application.</p>
            <p className="mt-2">Contact your administrator if you need access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
