import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, LogOut, Mail } from 'lucide-react';

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Access Pending Approval</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-warning/20 rounded-full blur-lg"></div>
              <Clock className="h-16 w-16 text-warning relative" />
            </div>
          </div>

          <div className="space-y-4">
            <Alert variant="default" className="border-warning/50 bg-warning/5">
              <Clock className="h-4 w-4 text-warning" />
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
                <strong>Status:</strong> <span className="text-warning font-semibold">Pending Approval</span>
              </p>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-3">
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

            <Alert variant="default" className="border-info/50 bg-info/5">
              <AlertDescription className="text-xs">
                📌 Contact your Master user if you need immediate access.
              </AlertDescription>
            </Alert>
          </div>

          <Button 
            onClick={logout} 
            variant="outline" 
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
