import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Users, Crown, Shield, User, FileCheck, Briefcase } from 'lucide-react';

const GROUPS = ['GES', 'GDS', 'GTN', 'GTS'];

export default function UserRolesPanel() {
  const { getAllUsers, updateUserRole, isMaster } = useAuth();
  const allUsers = getAllUsers();

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'Master':
        return <Crown className="h-4 w-4 text-primary" />;
      case 'Admin':
        return <Shield className="h-4 w-4 text-success" />;
      case 'ProposalHead':
        return <FileCheck className="h-4 w-4 text-info" />;
      case 'SVP':
        return <Briefcase className="h-4 w-4 text-warning" />;
      case 'Basic':
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          User Roles Management
        </CardTitle>
        <CardDescription>
          Assign roles including Proposal Head (step 1) and SVP per group (step 2).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {allUsers.map((u) => (
            <div key={u.id || u.email} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {getRoleIcon(u.role)}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isMaster && u.role !== 'Master' ? (
                  <>
                    <Select
                      value={u.role}
                      onValueChange={(value: UserRole) => updateUserRole(u.id || u.email, value, value === 'SVP' ? u.assignedGroup || undefined : undefined)}
                    >
                      <SelectTrigger className="w-[150px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="ProposalHead">Proposal Head</SelectItem>
                        <SelectItem value="SVP">SVP</SelectItem>
                        <SelectItem value="Basic">Basic</SelectItem>
                      </SelectContent>
                    </Select>
                    {u.role === 'SVP' && (
                      <Select
                        value={u.assignedGroup || ''}
                        onValueChange={(group) => updateUserRole(u.id || u.email, 'SVP', group)}
                      >
                        <SelectTrigger className="w-[90px] h-8 text-xs">
                          <SelectValue placeholder="Group" />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUPS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{u.role}</Badge>
                    {u.role === 'SVP' && u.assignedGroup && <Badge variant="secondary" className="text-xs">{u.assignedGroup}</Badge>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
