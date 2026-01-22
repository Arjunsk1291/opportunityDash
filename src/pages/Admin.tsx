import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Lock, Users, Trash2, CheckCircle, XCircle, Clock, RefreshCw, Download, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface AuthorizedUser {
  _id: string;
  email: string;
  role: 'Master' | 'Admin' | 'Basic';
  status: 'pending' | 'approved' | 'rejected';
  lastLogin?: Date;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

interface CollectionStats {
  totalTenders: number;
  totalValue: number;
  lastSync?: Date;
  statusDistribution: Record<string, number>;
}

export default function Admin() {
  const { user, isMaster, token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);

  useEffect(() => {
    if (isMaster) {
      loadUsers();
      loadCollectionStats();
    }
  }, [isMaster, token]);

  const loadUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(API_URL + '/users/authorized', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data);
      console.log('✅ Loaded', data.length, 'authorized users');
    } catch (error) {
      console.error('❌ Error loading users:', error);
      setMessage({ type: 'error', text: 'Failed to load users: ' + (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const loadCollectionStats = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/opportunities/stats', {
        headers: {
          'Authorization': 'Bearer ' + token,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCollectionStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const syncFromGoogleSheets = async () => {
    if (!token) return;
    setSyncLoading(true);
    try {
      const response = await fetch(API_URL + '/opportunities/sync-sheets', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to sync data');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: `✅ Synced ${result.count} tenders from Google Sheets` });
      await loadCollectionStats();
      toast.success(`Synced ${result.count} tenders`);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error syncing:', error);
      setMessage({ type: 'error', text: 'Failed to sync: ' + (error as Error).message });
      toast.error('Sync failed');
    } finally {
      setSyncLoading(false);
    }
  };

  const approveUser = async (email: string) => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/users/approve', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve user');
      }

      setMessage({ type: 'success', text: '✅ User approved: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error approving user:', error);
      setMessage({ type: 'error', text: '❌ Failed to approve user: ' + (error as Error).message });
    }
  };

  const rejectUser = async (email: string) => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/users/reject', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject user');
      }

      setMessage({ type: 'success', text: '❌ User rejected: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error rejecting user:', error);
      setMessage({ type: 'error', text: '❌ Failed to reject user: ' + (error as Error).message });
    }
  };

  const changeUserRole = async (email: string, newRole: string) => {
    if (!token) return;
    setChangingRole(email);
    try {
      const response = await fetch(API_URL + '/users/change-role', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, newRole }),
      });

      if (!response.ok) {
        throw new Error('Failed to change role');
      }

      setMessage({ type: 'success', text: '🔄 User role changed to ' + newRole + ': ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error changing role:', error);
      setMessage({ type: 'error', text: '❌ Failed to change role: ' + (error as Error).message });
    } finally {
      setChangingRole(null);
    }
  };

  const removeUser = async (email: string) => {
    if (!token || !confirm('Are you sure you want to remove ' + email + '?')) return;
    try {
      const response = await fetch(API_URL + '/users/remove', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove user');
      }

      setMessage({ type: 'success', text: '🗑️ User removed: ' + email });
      await loadUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error removing user:', error);
      setMessage({ type: 'error', text: '❌ Failed to remove user: ' + (error as Error).message });
    }
  };

  const cleanupLogs = async () => {
    if (!token || !confirm('Delete login logs older than 15 days?')) return;
    try {
      const response = await fetch(API_URL + '/logs/cleanup', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to cleanup logs');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: '🗑️ Cleaned up ' + result.deletedCount + ' old login logs' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('❌ Error cleaning logs:', error);
      setMessage({ type: 'error', text: '❌ Failed to cleanup logs: ' + (error as Error).message });
    }
  };

  if (!isMaster) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert className="max-w-md" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Access Denied</strong>
            <p className="text-sm mt-2">Only Master users can access this panel.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Master Panel</h1>
        <p className="text-muted-foreground mt-2">System administration and control</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="data-sync">Data Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Current User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-mono text-sm">{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Role</p>
                  <Badge>{user?.role}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Master Privileges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Approve and reject tenders</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Revert approvals to pending</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Manage authorized users</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Sync data from Google Sheets</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle>Authorized Users ({users.length})</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadUsers}
                        disabled={loading}
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reload user list</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cleanupLogs}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Cleanup Logs
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete login logs older than 15 days</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u._id}>
                        <TableCell className="font-mono text-sm">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => changeUserRole(u.email, newRole)}
                            disabled={changingRole === u.email}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Master">Master</SelectItem>
                              <SelectItem value="Admin">Admin</SelectItem>
                              <SelectItem value="Basic">Basic</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.status === 'approved' && (
                              <Badge className="bg-success/20 text-success gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Approved
                              </Badge>
                            )}
                            {u.status === 'pending' && (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                            {u.status === 'rejected' && (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.status === 'pending' && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => approveUser(u.email)}
                                      className="h-8 px-2 gap-1"
                                    >
                                      <CheckCircle className="h-3 w-3" />
                                      Approve
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Approve this user</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => rejectUser(u.email)}
                                      className="h-8 px-2 gap-1"
                                    >
                                      <XCircle className="h-3 w-3" />
                                      Reject
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject this user</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            {u.status === 'approved' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeUser(u.email)}
                                    className="h-8 px-2 gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove this user</TooltipContent>
                              </Tooltip>
                            )}
                            {u.status === 'rejected' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeUser(u.email)}
                                    className="h-8 px-2 gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete this user record</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data-sync">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    <div>
                      <CardTitle>Data Collection</CardTitle>
                      <CardDescription>Sync tender data from Google Sheets to MongoDB</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Total Tenders</p>
                    <p className="text-2xl font-bold">{collectionStats?.totalTenders || 0}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">${(collectionStats?.totalValue || 0).toLocaleString()}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Last Sync</p>
                    <p className="text-sm font-mono">
                      {collectionStats?.lastSync 
                        ? new Date(collectionStats.lastSync).toLocaleString() 
                        : 'Never'}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-3">Status Distribution</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {collectionStats?.statusDistribution && 
                      Object.entries(collectionStats.statusDistribution).map(([status, count]) => (
                        <div key={status} className="bg-muted p-3 rounded">
                          <p className="text-xs text-muted-foreground">{status}</p>
                          <p className="text-lg font-bold">{count}</p>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div className="border-t pt-6">
                  <Button 
                    onClick={syncFromGoogleSheets}
                    disabled={syncLoading}
                    size="lg"
                    className="w-full gap-2"
                  >
                    <Download className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
                    {syncLoading ? 'Syncing...' : 'Sync from Google Sheets'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pulls latest tender data from your configured Google Sheet and syncs to database
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
