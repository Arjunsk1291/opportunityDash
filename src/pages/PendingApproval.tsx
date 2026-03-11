import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, LogOut, Mail } from 'lucide-react';
import { AuthScene } from '@/components/auth/AuthScene';
import { ReportIssueButton } from '@/components/ReportIssueButton';

export default function PendingApproval() {
  const { user, logout, token } = useAuth();

  return (
    <>
      <AuthScene title="Access Pending Approval">
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-200 blur-xl" />
              <Clock className="relative h-16 w-16 text-blue-700" />
            </div>
          </div>

          <div className="space-y-4">
            <Alert variant="default" className="border-blue-200 bg-blue-50 text-slate-700">
              <Clock className="h-4 w-4 text-blue-700" />
              <AlertDescription>
                <strong>Welcome!</strong> Your account has been created and is awaiting approval from the Master user.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                <strong>Email:</strong> {user?.email}
              </p>
              <p className="text-muted-foreground">
                <strong>Role:</strong> {user?.role}
              </p>
              <p className="text-muted-foreground">
                <strong>Status:</strong> <span className="font-semibold text-blue-700">Pending Approval</span>
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" />
                What happens next?
              </p>
              <ul className="text-xs text-muted-foreground space-y-2 ml-6 list-disc">
                <li>The Master user will review your access request</li>
                <li>Once approved, you'll have full access to the Opportunity Dashboard</li>
                <li>You'll receive a notification when your account is activated</li>
                <li>Try logging in again once approved</li>
              </ul>
            </div>

            <Alert variant="default" className="border-slate-200 bg-slate-50">
              <AlertDescription className="text-xs">
                📌 Contact your Master user if you need immediate access.
              </AlertDescription>
            </Alert>
          </div>

          <Button
            onClick={logout} 
            variant="outline"
            className="w-full rounded-2xl border-slate-300"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </AuthScene>
      <ReportIssueButton authToken={token} reporter={user ? { displayName: user.displayName, role: user.role, email: user.email } : null} />
    </>
  );
}
