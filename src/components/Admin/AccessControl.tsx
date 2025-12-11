import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Plus,
  Trash2,
  Edit,
  Shield,
  Eye,
  Mail,
  Key,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface AllowedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'sales_lead' | 'external_partner';
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

const ROLE_DESCRIPTIONS = {
  admin: 'Full access to all data and admin functions',
  manager: 'Full access to all data, no admin functions',
  sales_lead: 'Only own assigned opportunities',
  external_partner: 'Read-only, partner-involved rows only',
};

const ROLE_COLORS = {
  admin: 'bg-primary text-primary-foreground',
  manager: 'bg-info text-info-foreground',
  sales_lead: 'bg-warning text-warning-foreground',
  external_partner: 'bg-muted text-muted-foreground',
};

const AccessControl = () => {
  const [users, setUsers] = useState<AllowedUser[]>(() => {
    const saved = localStorage.getItem('allowedUsers');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: '1',
        email: 'admin@company.com',
        displayName: 'System Admin',
        role: 'admin',
        isActive: true,
        lastLogin: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        email: 'manager@company.com',
        displayName: 'Sales Manager',
        role: 'manager',
        isActive: true,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<AllowedUser | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    role: 'sales_lead' as AllowedUser['role'],
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('allowedUsers', JSON.stringify(users));
  }, [users]);

  const addUser = () => {
    if (!newUser.email || !newUser.displayName) {
      toast.error('Please fill in all fields');
      return;
    }

    if (users.some(u => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      toast.error('User with this email already exists');
      return;
    }

    const user: AllowedUser = {
      id: crypto.randomUUID(),
      email: newUser.email,
      displayName: newUser.displayName,
      role: newUser.role,
      isActive: true,
      lastLogin: null,
      createdAt: new Date().toISOString(),
    };

    setUsers(prev => [...prev, user]);
    setNewUser({ email: '', displayName: '', role: 'sales_lead' });
    setIsAddingUser(false);
    toast.success(`User ${user.displayName} added successfully`);
  };

  const updateUser = () => {
    if (!editingUser) return;
    
    setUsers(prev => prev.map(u => 
      u.id === editingUser.id ? editingUser : u
    ));
    setEditingUser(null);
    toast.success('User updated successfully');
  };

  const deleteUser = (id: string) => {
    const user = users.find(u => u.id === id);
    if (user?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      toast.error('Cannot delete the last admin user');
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success('User deleted');
  };

  const toggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => 
      u.id === id ? { ...u, isActive: !u.isActive } : u
    ));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{users.length}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-success mb-2" />
            <p className="text-2xl font-bold">{users.filter(u => u.isActive).length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Shield className="h-5 w-5 mx-auto text-warning mb-2" />
            <p className="text-2xl font-bold">{users.filter(u => u.role === 'admin').length}</p>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Eye className="h-5 w-5 mx-auto text-info mb-2" />
            <p className="text-2xl font-bold">{users.filter(u => u.role === 'external_partner').length}</p>
            <p className="text-xs text-muted-foreground">External</p>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Microsoft 365 Account Access</CardTitle>
            <CardDescription>
              Manage which Microsoft 365 accounts can access this dashboard
            </CardDescription>
          </div>
          <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Grant access to a Microsoft 365 account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Microsoft 365 Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      value={newUser.email}
                      onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="user@company.onmicrosoft.com"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input 
                    value={newUser.displayName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select 
                    value={newUser.role} 
                    onValueChange={(v) => setNewUser(prev => ({ ...prev, role: v as AllowedUser['role'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="sales_lead">Sales Lead</SelectItem>
                      <SelectItem value="external_partner">External Partner</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_DESCRIPTIONS[newUser.role]}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddingUser(false)}>Cancel</Button>
                <Button onClick={addUser}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={ROLE_COLORS[user.role]}>
                      {user.role.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={user.isActive}
                        onCheckedChange={() => toggleUserStatus(user.id)}
                      />
                      <span className={user.isActive ? 'text-success' : 'text-muted-foreground'}>
                        {user.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <Clock className="h-3 w-3" />
                      {formatDate(user.lastLogin)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit User</DialogTitle>
                          </DialogHeader>
                          {editingUser && (
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Email</Label>
                                <Input 
                                  value={editingUser.email}
                                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Display Name</Label>
                                <Input 
                                  value={editingUser.displayName}
                                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, displayName: e.target.value } : null)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Role</Label>
                                <Select 
                                  value={editingUser.role}
                                  onValueChange={(v) => setEditingUser(prev => prev ? { ...prev, role: v as AllowedUser['role'] } : null)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="sales_lead">Sales Lead</SelectItem>
                                    <SelectItem value="external_partner">External Partner</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                          <DialogFooter>
                            <Button onClick={updateUser}>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove {user.displayName}'s access to the dashboard.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteUser(user.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
              <div key={role} className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={ROLE_COLORS[role as keyof typeof ROLE_COLORS]}>
                    {role.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessControl;
