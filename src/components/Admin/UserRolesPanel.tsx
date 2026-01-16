import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Users, Crown, Shield, User } from 'lucide-react';

export default function UserRolesPanel() {
  const { getAllUsers, updateUserRole, isMaster, user: currentUser } = useAuth();

  const allUsers = getAllUsers();

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'master':
        return <Crown className="h-4 w-4 text-primary" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-success" />;
      case 'basic':
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'master':
        return 'border-primary text-primary';
      case 'admin':
        return 'border-success text-success';
      case 'basic':
        return 'border-muted-foreground text-muted-foreground';
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
          {isMaster 
            ? 'Assign roles to users. Master can assign Admin or Basic roles.'
            : 'Only Master users can manage roles.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {allUsers.map((u) => (
            <div 
              key={u.id} 
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-3">
                {getRoleIcon(u.role)}
                <div>
                  <p className="text-sm font-medium">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>

              {isMaster && u.role !== 'master' ? (
                <Select
                  value={u.role}
                  onValueChange={(value: UserRole) => updateUserRole(u.id, value)}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className={getRoleBadgeColor(u.role)}>
                  {u.role}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
