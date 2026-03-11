import React from 'react';
import { AuthContext } from '@/auth/AuthProvider';
import { AuthScene, MicrosoftSignInButton } from '@/components/auth/AuthScene';

export default function Login() {
  const { login } = React.useContext(AuthContext);

  return (
    <AuthScene title="Welcome Back">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
          Sign in with your Microsoft work account to continue into the Avenir opportunity dashboard.
        </div>
        <MicrosoftSignInButton onClick={() => login()}>
          Sign in with Microsoft
        </MicrosoftSignInButton>
      </div>
    </AuthScene>
  );
}
