import React, { useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle, Loader2, Lock, Mail, KeyRound, ArrowLeft, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
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

    if (message.includes('Invalid email format')) return 'Please enter a valid email address.';
    if (message.includes('locked')) return 'Account locked after too many failed attempts. Wait 15 minutes or ask your admin to unlock it.';
    if (message.includes('pending')) return 'Account is pending admin approval. Contact your administrator.';
    if (message.includes('rejected')) return 'Account access has been rejected. Contact your administrator.';
    if (message.includes('not approved')) return 'Account is not approved for login. Contact your administrator.';
    if (message.includes('not configured') || message.includes('not set')) return 'No password has been configured for this account. Ask your admin to set one.';
    if (message.includes('expired')) return 'Temporary access has expired. Contact your administrator.';
    if (message.includes('offline') || message.includes('unavailable')) return 'Login service is temporarily unavailable.';
    if (message.includes('429') || message.includes('Too many requests')) return 'Too many login attempts. Please try again later.';
    if (message.includes('Invalid credentials') || message.includes('403')) return 'Invalid email or password.';
    return `Authentication failed: ${message}`;
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
          </div>
          <p className="text-slate-400 font-medium tracking-wide animate-pulse">Initializing Security Session...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background overflow-x-hidden">
      {/* Brand Panel (Left) */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 relative overflow-hidden items-center justify-center p-16">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 z-0">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute -top-1/4 -left-1/4 w-full h-full bg-blue-600/30 blur-[120px] rounded-full"
          />
          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              rotate: [90, 0, 90],
              opacity: [0.1, 0.15, 0.1],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-indigo-600/20 blur-[120px] rounded-full"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.8)_100%)]" />
          <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:32px_32px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 max-w-lg text-center"
        >
          <div className="flex justify-center mb-10">
             <div className="p-6 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl">
               <img src={logo} alt="Avenir" className="h-16 w-auto" />
             </div>
          </div>

          <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-6">
            Intelligent Opportunity <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Management Ecosystem</span>
          </h2>

          <p className="text-lg text-slate-400 font-medium leading-relaxed mb-12">
            Streamline your sales pipeline with real-time analytics, automated workflows, and executive-level business intelligence.
          </p>
        </motion.div>
      </div>

      {/* Form Panel (Right) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 lg:p-24 relative">
        <div className="lg:hidden absolute top-8 left-8">
           <img src={logo} alt="Avenir" className="h-8 w-auto grayscale brightness-0 dark:invert" />
        </div>

        <div className="w-full max-w-[420px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={authMode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="mb-10">
                <h1 className="text-3xl font-black tracking-tight text-foreground mb-3">
                  {authMode === 'success' ? 'Welcome Back' : authMode.includes('reset') ? 'Account Recovery' : 'Portal Access'}
                </h1>
                <p className="text-muted-foreground font-medium">
                  {authMode === 'password-login' && 'Please authenticate to proceed to your dashboard.'}
                  {authMode === 'reset-request' && 'Enter your verified email to receive a secure recovery code.'}
                  {authMode === 'reset-confirm' && 'Submit the recovery code and your new secure credentials.'}
                  {authMode === 'success' && 'Authentication successful. Redirecting...'}
                </p>
              </div>

              {/* Status Notifications */}
              <AnimatePresence>
                {formState.error && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6 overflow-hidden">
                    <Alert variant="destructive" className="rounded-2xl border-destructive/20 bg-destructive/5">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="font-semibold text-xs ml-2">{formState.error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {formState.successMessage && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6 overflow-hidden">
                    <Alert className="rounded-2xl border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription className="font-semibold text-xs ml-2">{formState.successMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Password Login Form */}
              {authMode === 'password-login' && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handlePasswordLogin(); }}
                  className="space-y-5"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1">Work Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type="email"
                        placeholder="name@avenirenergy.me"
                        value={formState.email}
                        onChange={(e) => setFormState(prev => ({ ...prev, email: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all text-base"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">Credentials</label>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('reset-request'); setFormState(prev => ({ ...prev, error: null, successMessage: null, resetEmail: prev.email || prev.resetEmail })); }}
                        className="text-xs font-bold text-primary hover:underline"
                        tabIndex={-1}
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type={formState.showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formState.password}
                        onChange={(e) => setFormState(prev => ({ ...prev, password: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 pr-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all text-base"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setFormState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={formState.loading}
                      >
                        {formState.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 space-y-4">
                    <Button
                      type="submit"
                      loading={formState.loading}
                      disabled={!formState.email || !formState.password}
                      className="w-full h-14 rounded-2xl text-base font-bold shadow-xl shadow-primary/10 hover:shadow-2xl hover:shadow-primary/20 transition-all"
                    >
                      Authenticate
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormState(prev => ({ ...prev, email: '', password: '', error: null, successMessage: null }))}
                      disabled={formState.loading}
                      className="w-full h-12 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    >
                      Clear form
                    </Button>
                  </div>
                </form>
              )}

              {/* Reset Request Form */}
              {authMode === 'reset-request' && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleResetRequest(); }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1 text-left block">Work Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type="email"
                        placeholder="name@avenirenergy.me"
                        value={formState.resetEmail}
                        onChange={(e) => setFormState(prev => ({ ...prev, resetEmail: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Button
                      type="submit"
                      loading={formState.loading}
                      disabled={!formState.resetEmail}
                      className="w-full h-14 rounded-2xl text-base font-bold"
                    >
                      Send Verification Code
                    </Button>
                    <Button
                      type="button"
                      onClick={() => { setAuthMode('password-login'); setFormState(prev => ({ ...prev, error: null, successMessage: null })); }}
                      disabled={formState.loading}
                      variant="ghost"
                      className="w-full h-12 rounded-2xl text-muted-foreground"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to sign in
                    </Button>
                  </div>
                </form>
              )}

              {/* Reset Confirm Form */}
              {authMode === 'reset-confirm' && (
                <form
                   onSubmit={(e) => { e.preventDefault(); handleResetConfirm(); }}
                   className="space-y-5"
                >
                   <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1 block">Account</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type="email"
                        value={formState.resetEmail}
                        onChange={(e) => setFormState(prev => ({ ...prev, resetEmail: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1 block">Recovery Code</label>
                    <div className="relative group">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type="text"
                        placeholder="ENTER-CODE"
                        value={formState.resetCode}
                        onChange={(e) => setFormState(prev => ({ ...prev, resetCode: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all tracking-[0.2em] font-mono"
                        autoComplete="one-time-code"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1 block">New Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        type={formState.showPassword ? 'text' : 'password'}
                        placeholder="New secure password"
                        value={formState.resetPassword}
                        onChange={(e) => setFormState(prev => ({ ...prev, resetPassword: e.target.value, error: null, successMessage: null }))}
                        disabled={formState.loading}
                        className="pl-12 pr-12 h-14 rounded-2xl bg-muted/40 border-transparent focus:bg-background focus:border-primary/30 transition-all"
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setFormState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                        disabled={formState.loading}
                      >
                        {formState.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 space-y-4">
                    <Button
                      type="submit"
                      loading={formState.loading}
                      disabled={!formState.resetEmail || !formState.resetCode || !formState.resetPassword}
                      className="w-full h-14 rounded-2xl text-base font-bold shadow-xl shadow-primary/10"
                    >
                      Update Credentials
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        onClick={handleResetRequest}
                        disabled={formState.loading || !formState.resetEmail}
                        variant="outline"
                        className="h-12 rounded-2xl border-border/50"
                      >
                        Resend Code
                      </Button>
                      <Button
                        type="button"
                        onClick={() => { setAuthMode('password-login'); setFormState(prev => ({ ...prev, error: null, successMessage: null })); }}
                        disabled={formState.loading}
                        variant="outline"
                        className="h-12 rounded-2xl border-border/50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* Success Animation */}
              {authMode === 'success' && (
                <div className="text-center py-12 space-y-8">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="flex justify-center"
                  >
                    <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center relative">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-emerald-500 rounded-full blur-xl"
                      />
                      <CheckCircle className="h-12 w-12 text-emerald-500 relative z-10" />
                    </div>
                  </motion.div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold text-foreground">Secure Session Established</p>
                    <p className="text-muted-foreground font-medium">Provisioning workspace environment...</p>
                  </div>
                  <div className="flex justify-center gap-1.5 pt-4">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        className="h-2 w-2 bg-primary rounded-full"
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-20 text-center">
             <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
               © {new Date().getFullYear()} Avenir Engineering · All Rights Reserved
             </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
