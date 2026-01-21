import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { msalInstance } from '@/config/msalConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setAuthToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Processing login...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus('Authenticating with Microsoft...');

        // Handle redirect
        await msalInstance.handleRedirectPromise();

        const accounts = msalInstance.getAllAccounts();
        if (accounts.length === 0) {
          throw new Error('No account found after login');
        }

        const account = accounts[0];
        setStatus('Getting access token...');

        // Get token
        const response = await msalInstance.acquireTokenSilent({
          scopes: ['User.Read'],
          account: account,
        });

        const token = response.accessToken;

        setStatus('Verifying with server...');

        // Set auth token (will validate with backend)
        await setAuthToken(token);

        setStatus('Login successful! Redirecting...');
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } catch (err: any) {
        console.error('Auth callback error:', err);
        const errorMsg = err.errorCode === 'user_cancelled_login'
          ? 'Login cancelled'
          : err.error?.message || err.message || 'Authentication failed';
        setError(errorMsg);
        setStatus('');
      }
    };

    handleCallback();
  }, [navigate, setAuthToken]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Signing in...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="text-sm text-muted-foreground">
                <p>Reason: {error}</p>
                <p className="mt-2">
                  <a href="/login" className="text-primary hover:underline">
                    Return to login
                  </a>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-center text-sm text-muted-foreground">{status}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
