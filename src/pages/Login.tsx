import React, { useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle, Loader2, Lock, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import logo from '@/assets/Avenir_Logo.avif';

type AuthMode = 'password-login' | 'reset-request' | 'reset-confirm' | 'success';

interface FormState {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  attemptCount: number;
  lastAttemptTime: number;
  resetEmail: string;
  resetCode: string;
  resetPassword: string;
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export default function Login() {
  const { isAuthenticated, isLoading: authLoading, loginWithPassword } = useAuth();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState<AuthMode>('password-login');
  const [formState, setFormState] = useState<FormState>({
    email: '',
    password: '',
    showPassword: false,
    loading: false,
    error: null,
    successMessage: null,
    attemptCount: 0,
    lastAttemptTime: 0,
    resetEmail: '',
    resetCode: '',
    resetPassword: '',
  });
  const shouldRedirect = isAuthenticated && !authLoading;

  const isRateLimited = useCallback(() => {
    const now = Date.now();
    const timeSinceLastAttempt = now - formState.lastAttemptTime;
    
    if (timeSinceLastAttempt < RATE_LIMIT_WINDOW_MS && formState.attemptCount >= MAX_ATTEMPTS) {
      return true;
    }
    
    if (timeSinceLastAttempt >= RATE_LIMIT_WINDOW_MS) {
      setFormState(prev => ({ ...prev, attemptCount: 0, lastAttemptTime: 0 }));
      return false;
    }
    
    return false;
  }, [formState.attemptCount, formState.lastAttemptTime]);

  const getErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);

    // Don't reveal sensitive information
    if (message.includes('Invalid email format')) {
      return 'Please enter a valid email address.';
    }
    if (message.includes('403') || message.includes('Invalid credentials')) {
      return 'Authentication failed. Please check your credentials.';
    }
    if (message.includes('429') || message.includes('Too many requests')) {
      return 'Too many login attempts. Please try again later.';
    }
    if (message.includes('pending')) {
      return 'Your account is pending approval.';
    }
    if (message.includes('expired')) {
      return 'Your temporary access has expired.';
    }
    
    // Default non-revealing error
    return 'Authentication failed. Please try again.';
  };

  const handlePasswordLogin = useCallback(async () => {
    if (isRateLimited()) {
      const timeRemaining = Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - formState.lastAttemptTime)) / 1000 / 60);
      setFormState(prev => ({
        ...prev,
        error: `Too many attempts. Please try again in ${timeRemaining} minute(s).`,
      }));
      return;
    }

    const email = formState.email.trim();
    const password = formState.password;

    if (!email || !password) {
      setFormState(prev => ({ 
        ...prev, 
        error: 'Email and password are required',
      }));
      return;
    }

    setFormState(prev => ({ ...prev, loading: true, error: null }));

    try {
      await loginWithPassword(email, password);
      
      setFormState(prev => ({
        ...prev,
        loading: false,
        successMessage: 'Login successful',
        attemptCount: 0,
        lastAttemptTime: 0,
        password: '', // Clear password from state
      }));
      
      setAuthMode('success');
      
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1200);
    } catch (error) {
      const now = Date.now();
      setFormState(prev => ({
        ...prev,
        loading: false,
        error: getErrorMessage(error),
        attemptCount: prev.attemptCount + 1,
        lastAttemptTime: now,
        password: '', // Clear password on error for security
      }));
    }
  }, [formState.email, formState.lastAttemptTime, formState.password, loginWithPassword, navigate, isRateLimited]);

  const handleResetRequest = useCallback(async () => {
    if (formState.loading) return;
    const email = formState.resetEmail.trim().toLowerCase();
    if (!email) {
      setFormState(prev => ({ ...prev, error: 'Email is required' }));
      return;
    }
    setFormState(prev => ({ ...prev, loading: true, error: null, successMessage: null }));
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '/api') + '/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      await response.json().catch(() => null);
      setFormState(prev => ({
        ...prev,
        loading: false,
        successMessage: 'If the email is approved, a reset code has been sent.',
      }));
      setAuthMode('reset-confirm');
    } catch {
      setFormState(prev => ({ ...prev, loading: false, successMessage: 'If the email is approved, a reset code has been sent.' }));
      setAuthMode('reset-confirm');
    }
  }, [formState.loading, formState.resetEmail]);

  const handleResetConfirm = useCallback(async () => {
    if (formState.loading) return;
    const email = formState.resetEmail.trim().toLowerCase();
    const code = formState.resetCode.trim();
    const newPassword = formState.resetPassword;
    if (!email || !code || !newPassword) {
      setFormState(prev => ({ ...prev, error: 'Email, code, and new password are required' }));
      return;
    }
    setFormState(prev => ({ ...prev, loading: true, error: null, successMessage: null }));
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '/api') + '/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Reset failed');
      setFormState(prev => ({
        ...prev,
        loading: false,
        successMessage: 'Password updated. You can sign in now.',
        resetCode: '',
        resetPassword: '',
      }));
      setAuthMode('password-login');
    } catch (error) {
      setFormState(prev => ({ ...prev, loading: false, error: getErrorMessage(error) }));
    }
  }, [formState.loading, formState.resetCode, formState.resetEmail, formState.resetPassword, getErrorMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !formState.loading) {
      if (authMode === 'password-login') {
        handlePasswordLogin();
      } else if (authMode === 'reset-request') {
        handleResetRequest();
      } else if (authMode === 'reset-confirm') {
        handleResetConfirm();
      }
    }
  };

  if (shouldRedirect) {
    return <Navigate to="/" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4 py-8">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl animate-[pulse_6s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_55%)]" />
      </div>
      {/* Main Card */}
      <div className="w-full max-w-md">
        {/* Header with Logo */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 backdrop-blur">
              <img src={logo} alt="Avenir Engineering" className="h-10 w-auto" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {authMode === 'success' ? 'Welcome' : authMode === 'reset-request' || authMode === 'reset-confirm' ? 'Reset Password' : 'Opportunity Dashboard'}
          </h1>
          <p className="text-sm text-slate-300">
            {authMode === 'success' 
              ? 'Redirecting to dashboard...'
              : authMode === 'reset-request'
                ? 'Enter your approved email to receive a reset code'
                : authMode === 'reset-confirm'
                  ? 'Enter the reset code and your new password'
                  : 'Sign in to access your opportunities'}
          </p>
        </div>

        {/* Error Alert */}
        {formState.error && (
          <Alert className="mb-6 border-red-500/30 bg-red-500/10 text-red-50" role="alert">
            <AlertCircle className="h-4 w-4 text-red-300" />
            <AlertDescription className="text-xs text-red-100 ml-2">
              {formState.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {formState.successMessage && authMode === 'success' && (
          <Alert className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-50">
            <CheckCircle className="h-4 w-4 text-emerald-300" />
            <AlertDescription className="text-xs text-emerald-100 ml-2">
              {formState.successMessage}
            </AlertDescription>
          </Alert>
        )}

        {(formState.successMessage && (authMode === 'reset-request' || authMode === 'reset-confirm' || authMode === 'password-login')) && authMode !== 'success' && (
          <Alert className="mb-6 border-white/10 bg-white/5 text-white">
            <CheckCircle className="h-4 w-4 text-emerald-300" />
            <AlertDescription className="text-xs text-slate-200 ml-2">
              {formState.successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Password Login */}
        {authMode === 'password-login' && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-slate-200">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@avenirenergy.me"
                  value={formState.email}
                  onChange={(e) =>
                    setFormState(prev => ({ ...prev, email: e.target.value, error: null, successMessage: null }))
                  }
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-slate-200">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="password"
                  type={formState.showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formState.password}
                  onChange={(e) =>
                    setFormState(prev => ({ ...prev, password: e.target.value, error: null, successMessage: null }))
                  }
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 pr-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setFormState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  className="absolute right-3 top-3 text-slate-300 hover:text-white"
                  aria-label={formState.showPassword ? 'Hide password' : 'Show password'}
                  disabled={formState.loading}
                >
                  {formState.showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                onClick={handlePasswordLogin}
                disabled={formState.loading || !formState.email || !formState.password}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-[0_12px_40px_rgba(59,130,246,0.25)]"
                size="lg"
              >
                {formState.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <Button
                onClick={() => setFormState(prev => ({ ...prev, email: '', password: '', error: null, successMessage: null }))}
                disabled={formState.loading}
                variant="outline"
                className="w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
              >
                Clear
              </Button>

              <Button
                onClick={() => { setAuthMode('reset-request'); setFormState(prev => ({ ...prev, error: null, successMessage: null, resetEmail: prev.email || prev.resetEmail })); }}
                disabled={formState.loading}
                variant="ghost"
                className="w-full text-slate-200 hover:text-white hover:bg-white/5"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Reset password
              </Button>
            </div>
          </div>
        )}

        {/* Reset request */}
        {authMode === 'reset-request' && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="space-y-2">
              <label htmlFor="resetEmail" className="text-xs font-medium text-slate-200">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="name@avenirenergy.me"
                  value={formState.resetEmail}
                  onChange={(e) => setFormState(prev => ({ ...prev, resetEmail: e.target.value, error: null, successMessage: null }))}
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                onClick={handleResetRequest}
                disabled={formState.loading || !formState.resetEmail}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-[0_12px_40px_rgba(59,130,246,0.25)]"
                size="lg"
              >
                {formState.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Send reset code'
                )}
              </Button>
              <Button
                onClick={() => { setAuthMode('password-login'); setFormState(prev => ({ ...prev, error: null, successMessage: null })); }}
                disabled={formState.loading}
                variant="ghost"
                className="w-full text-slate-200 hover:text-white hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to sign in
              </Button>
            </div>
          </div>
        )}

        {/* Reset confirm */}
        {authMode === 'reset-confirm' && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="space-y-2">
              <label htmlFor="resetEmail2" className="text-xs font-medium text-slate-200">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="resetEmail2"
                  type="email"
                  value={formState.resetEmail}
                  onChange={(e) => setFormState(prev => ({ ...prev, resetEmail: e.target.value, error: null, successMessage: null }))}
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="resetCode" className="text-xs font-medium text-slate-200">Reset code</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="resetCode"
                  type="text"
                  placeholder="Enter the code from email"
                  value={formState.resetCode}
                  onChange={(e) => setFormState(prev => ({ ...prev, resetCode: e.target.value, error: null, successMessage: null }))}
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60 tracking-widest"
                  autoComplete="one-time-code"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="resetPassword" className="text-xs font-medium text-slate-200">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-300 pointer-events-none" />
                <Input
                  id="resetPassword"
                  type={formState.showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={formState.resetPassword}
                  onChange={(e) => setFormState(prev => ({ ...prev, resetPassword: e.target.value, error: null, successMessage: null }))}
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 pr-10 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setFormState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  className="absolute right-3 top-3 text-slate-300 hover:text-white"
                  aria-label={formState.showPassword ? 'Hide password' : 'Show password'}
                  disabled={formState.loading}
                >
                  {formState.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                onClick={handleResetConfirm}
                disabled={formState.loading || !formState.resetEmail || !formState.resetCode || !formState.resetPassword}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-[0_12px_40px_rgba(59,130,246,0.25)]"
                size="lg"
              >
                {formState.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  'Update password'
                )}
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleResetRequest}
                  disabled={formState.loading || !formState.resetEmail}
                  variant="outline"
                  className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                >
                  Resend code
                </Button>
                <Button
                  onClick={() => { setAuthMode('password-login'); setFormState(prev => ({ ...prev, error: null, successMessage: null })); }}
                  disabled={formState.loading}
                  variant="outline"
                  className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {authMode === 'success' && (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-500/10 border border-emerald-500/30 p-3">
                <CheckCircle className="h-6 w-6 text-emerald-300" />
              </div>
            </div>
            <p className="text-sm text-slate-200">
              Redirecting to dashboard...
            </p>
            <div className="animate-pulse flex justify-center gap-1">
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-200 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-12 max-w-md text-center">
        <p className="text-xs text-slate-300 mb-3">
          Security & Compliance Features:
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-white/5 p-2 border border-white/10 backdrop-blur">
            <p className="font-semibold text-slate-100">ISO/IEC 27001</p>
            <p className="text-slate-300">Aligned controls</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2 border border-white/10 backdrop-blur">
            <p className="font-semibold text-slate-100">Rate Limited</p>
            <p className="text-slate-300">Abuse resistant</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2 border border-white/10 backdrop-blur">
            <p className="font-semibold text-slate-100">Encrypted</p>
            <p className="text-slate-300">Tokens + secrets</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2 border border-white/10 backdrop-blur">
            <p className="font-semibold text-slate-100">JWT Sessions</p>
            <p className="text-slate-300">Signed + refresh</p>
          </div>
        </div>
      </div>
    </div>
  );
}
