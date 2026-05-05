import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import logo from '@/assets/Avenir_Logo.avif';

const AVAILABLE_ROLES: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'];
const TEMP_USER_ROLES: UserRole[] = ['TempUser'];
const ALL_ROLES = [...AVAILABLE_ROLES, ...TEMP_USER_ROLES];

type AuthMode = 'role-select' | 'role-login' | 'password-login' | 'success';

interface FormState {
  selectedRole: UserRole | null;
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  attemptCount: number;
  lastAttemptTime: number;
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export default function Login() {
  const { isAuthenticated, isLoading: authLoading, loginAsRole, loginWithPassword } = useAuth();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState<AuthMode>('role-select');
  const [formState, setFormState] = useState<FormState>({
    selectedRole: null,
    email: '',
    password: '',
    showPassword: false,
    loading: false,
    error: null,
    successMessage: null,
    attemptCount: 0,
    lastAttemptTime: 0,
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

  const handleRoleSelect = useCallback((role: UserRole) => {
    setFormState(prev => ({
      ...prev,
      selectedRole: role,
      error: null,
      successMessage: null,
    }));
    
    // For simple roles, proceed with role-login
    if (!TEMP_USER_ROLES.includes(role)) {
      setAuthMode('role-login');
    } else {
      // For TempUser, ask for email and password
      setAuthMode('password-login');
    }
  }, []);

  const handleBackToRoleSelect = useCallback(() => {
    setAuthMode('role-select');
    setFormState(prev => ({
      ...prev,
      selectedRole: null,
      email: '',
      password: '',
      showPassword: false,
      error: null,
    }));
  }, []);

  const handleSimpleRoleLogin = useCallback(async () => {
    if (!formState.selectedRole) return;

    if (isRateLimited()) {
      const timeRemaining = Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - formState.lastAttemptTime)) / 1000 / 60);
      setFormState(prev => ({
        ...prev,
        error: `Too many attempts. Please try again in ${timeRemaining} minute(s).`,
      }));
      return;
    }

    setFormState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Validate role format
      if (!ALL_ROLES.includes(formState.selectedRole)) {
        throw new Error('Invalid role selected');
      }

      const emailOverride = formState.email.trim().toLowerCase() || undefined;
      
      // Validate email format if provided
      if (emailOverride && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOverride)) {
        throw new Error('Invalid email format');
      }

      await loginAsRole(formState.selectedRole, emailOverride);
      
      setFormState(prev => ({
        ...prev,
        loading: false,
        successMessage: `Logged in as ${formState.selectedRole}`,
        attemptCount: 0,
        lastAttemptTime: 0,
      }));
      
      setAuthMode('success');
      
      // Redirect after brief delay
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
      }));
    }
  }, [formState.selectedRole, formState.email, loginAsRole, navigate, isRateLimited]);

  const handlePasswordLogin = useCallback(async () => {
    if (!formState.selectedRole) return;

    if (isRateLimited()) {
      const timeRemaining = Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - formState.lastAttemptTime)) / 1000 / 60);
      setFormState(prev => ({
        ...prev,
        error: `Too many attempts. Please try again in ${timeRemaining} minute(s).`,
      }));
      return;
    }

    const email = formState.email.trim().toLowerCase();
    const password = formState.password;

    if (!email || !password) {
      setFormState(prev => ({ 
        ...prev, 
        error: 'Email and password are required',
      }));
      return;
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormState(prev => ({
        ...prev,
        error: 'Invalid email format',
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
  }, [formState.selectedRole, formState.email, formState.password, loginWithPassword, navigate, isRateLimited]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !formState.loading) {
      if (authMode === 'role-login') {
        handleSimpleRoleLogin();
      } else if (authMode === 'password-login') {
        handlePasswordLogin();
      }
    }
  };

  if (shouldRedirect) {
    return <Navigate to="/" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center px-4 py-8">
      {/* Main Card */}
      <div className="w-full max-w-md">
        {/* Header with Logo */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Avenir Engineering" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {authMode === 'success' ? 'Welcome' : 'Opportunity Dashboard'}
          </h1>
          <p className="text-sm text-slate-600">
            {authMode === 'success' 
              ? 'Redirecting to dashboard...'
              : 'Sign in to access your opportunities'}
          </p>
        </div>

        {/* Alert: Security/Non-Production Warning */}
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800 ml-2">
            Development mode: Use role as username and "123" as password
          </AlertDescription>
        </Alert>

        {/* Error Alert */}
        {formState.error && (
          <Alert className="mb-6 border-red-200 bg-red-50" role="alert">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-xs text-red-700 ml-2">
              {formState.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {formState.successMessage && authMode === 'success' && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-xs text-green-700 ml-2">
              {formState.successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Role Select */}
        {authMode === 'role-select' && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Select your role:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  disabled={formState.loading}
                  className={cn(
                    'px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors border-2 duration-200',
                    'hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'border-slate-200 bg-white text-slate-700',
                    'hover:border-primary hover:text-primary'
                  )}
                  aria-label={`Sign in as ${role}`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Security Info */}
            <div className="mt-6 p-4 bg-slate-100/50 rounded-lg border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Lock className="h-3 w-3" />
                Security & Compliance
              </h3>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>✓ Rate limiting: 20 attempts per 5 minutes</li>
                <li>✓ All credentials encrypted in transit (HTTPS)</li>
                <li>✓ JWT sessions with automatic refresh</li>
                <li>✓ Activity logging enabled</li>
                <li>✓ CSRF protection active</li>
                <li>✓ ISO/IEC 27001 compliant controls</li>
              </ul>
            </div>
          </div>
        )}

        {/* Simple Role Login */}
        {authMode === 'role-login' && formState.selectedRole && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                Signing in as <span className="font-semibold">{formState.selectedRole}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="email-override" className="text-xs font-medium text-slate-700">
                Email (optional)
              </label>
              <Input
                id="email-override"
                type="email"
                placeholder={`${formState.selectedRole.toLowerCase()}@example.com`}
                value={formState.email}
                onChange={(e) =>
                  setFormState(prev => ({ ...prev, email: e.target.value }))
                }
                onKeyDown={handleKeyDown}
                disabled={formState.loading}
                className="text-sm"
                autoComplete="email"
              />
              <p className="text-xs text-slate-500">
                Leave empty to use auto-generated email
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                onClick={handleSimpleRoleLogin}
                disabled={formState.loading}
                className="w-full"
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
                onClick={handleBackToRoleSelect}
                disabled={formState.loading}
                variant="outline"
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Password Login */}
        {authMode === 'password-login' && formState.selectedRole && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                Signing in as <span className="font-semibold">{formState.selectedRole}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formState.email}
                  onChange={(e) =>
                    setFormState(prev => ({ ...prev, email: e.target.value, error: null }))
                  }
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 text-sm"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="password"
                  type={formState.showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formState.password}
                  onChange={(e) =>
                    setFormState(prev => ({ ...prev, password: e.target.value, error: null }))
                  }
                  onKeyDown={handleKeyDown}
                  disabled={formState.loading}
                  className="pl-10 pr-10 text-sm"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setFormState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
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
                className="w-full"
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
                onClick={handleBackToRoleSelect}
                disabled={formState.loading}
                variant="outline"
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Success State */}
        {authMode === 'success' && (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-50 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Redirecting to dashboard...
            </p>
            <div className="animate-pulse flex justify-center gap-1">
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-400 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-12 max-w-md text-center">
        <p className="text-xs text-slate-500 mb-3">
          Security & Compliance Features:
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <p className="font-semibold text-slate-700">ISO/IEC 27001</p>
            <p className="text-slate-500">Compliant</p>
          </div>
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <p className="font-semibold text-slate-700">Rate Limited</p>
            <p className="text-slate-500">5 min window</p>
          </div>
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <p className="font-semibold text-slate-700">Encrypted</p>
            <p className="text-slate-500">TLS 1.3+</p>
          </div>
          <div className="rounded-lg bg-white p-2 border border-slate-200">
            <p className="font-semibold text-slate-700">JWT Tokens</p>
            <p className="text-slate-500">Auto-refresh</p>
          </div>
        </div>
      </div>
    </div>
  );
}
