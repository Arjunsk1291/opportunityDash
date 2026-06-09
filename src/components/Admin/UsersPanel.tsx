import { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, Lock, LockOpen, Trash2, CheckCircle, XCircle, Clock, Users, AlertTriangle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import type { UserRole } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ROLE_OPTIONS: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];
const GROUP_OPTIONS = ['GES', 'GDS', 'GTS'] as const;

function parseApiErrorPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const d = payload as { error?: string; message?: string; code?: string; troubleshooting?: string[] };
  const base = d.message || d.error || fallback;
  const codePart = d.code ? ` [${d.code}]` : '';
  const tips = Array.isArray(d.troubleshooting) && d.troubleshooting.length
    ? ` | Tips: ${d.troubleshooting.join(' | ')}` : '';
  return `${base}${codePart}${tips}`;
}

interface AuthorizedUser {
  _id: string;
  email: string;
  role: UserRole | 'MASTER' | 'PROPOSAL_HEAD';
  assignedGroup?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  lastLogin?: string | Date;
  createdAt: string | Date;
  approvedBy?: string;
  approvedAt?: string | Date;
  tempAccessExpiresAt?: string | null;
  hasPassword?: boolean;
  isLocked?: boolean;
  failedLoginAttempts?: number;
  accountLockedUntil?: string | Date | null;
  requiresPasswordChange?: boolean;
}


interface AddUserForm {
  email: string;
  displayName: string;
  role: UserRole;
  assignedGroup: string;
  status: 'approved' | 'pending';
  password: string;
  tempAccessExpiresAt: string;
}

interface SetPasswordForm {
  newPassword: string;
  confirmPassword: string;
  requireChange: boolean;
}

interface UsersPanelProps {
  token: string | null;
  isMaster: boolean;
  canManageUsers: boolean;
}

const DEFAULT_ADD_FORM: AddUserForm = {
  email: '',
  displayName: '',
  role: 'Basic',
  assignedGroup: 'GES',
  status: 'approved',
  password: '',
  tempAccessExpiresAt: '',
};

const DEFAULT_SET_PASSWORD_FORM: SetPasswordForm = {
  newPassword: '',
  confirmPassword: '',
  requireChange: false,
};

// Must match assertStrongPassword in backend/server.js exactly
const PWD_RULES = [
  { label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { label: 'Lowercase letter (a–z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Uppercase letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number (0–9)', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character (!@#$…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordRequirements({ password }: { password: string }) {
  if (!password) return (
    <p className="mt-1 text-xs text-muted-foreground">Password must meet all requirements below.</p>
  );
  const met = PWD_RULES.filter((r) => r.test(password)).length;
  return (
    <div className="mt-2 space-y-0.5">
      {PWD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <div key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
            {ok ? <CheckCircle className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
            {rule.label}
          </div>
        );
      })}
      {met < PWD_RULES.length && (
        <p className="text-[10px] text-amber-600 pt-0.5">{PWD_RULES.length - met} requirement{PWD_RULES.length - met > 1 ? 's' : ''} not met — password will be rejected</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <Badge className="bg-green-100 text-green-700 gap-1 hover:bg-green-100"><CheckCircle className="h-3 w-3" />Approved</Badge>;
  if (status === 'pending')
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
}

export function UsersPanel({ token, isMaster, canManageUsers }: UsersPanelProps) {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddUserForm>(DEFAULT_ADD_FORM);

  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [setPasswordTarget, setSetPasswordTarget] = useState('');
  const [setPwdForm, setSetPwdForm] = useState<SetPasswordForm>(DEFAULT_SET_PASSWORD_FORM);
  const [setPwdBusy, setSetPwdBusy] = useState(false);

  const [removeTarget, setRemoveTarget] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);


  const authHeaders = () => ({
    Authorization: 'Bearer ' + (token || ''),
    'Content-Type': 'application/json',
  });

  const patchUserList = (updated: AuthorizedUser) => {
    setUsers((prev) => {
      const email = String(updated.email || '').toLowerCase();
      const exists = prev.some((u) => u.email.toLowerCase() === email);
      if (exists) return prev.map((u) => u.email.toLowerCase() === email ? { ...u, ...updated } : u);
      return [updated, ...prev];
    });
  };

  const removeUserFromList = (email: string) => {
    setUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
  };

  const loadUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(API_URL + '/users/authorized', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to load users'));
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => { void loadUsers(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const approveUser = async (email: string) => {
    if (!canManageUsers) { toast.error('You do not have permission.'); return; }
    const prev = [...users];
    setUsers((u) => u.map((x) => x.email.toLowerCase() === email.toLowerCase() ? { ...x, status: 'approved' } : x));
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/approve', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to approve user'));
      if (data?.user) patchUserList(data.user as AuthorizedUser);
      toast.success('User approved');
    } catch (err) {
      setUsers(prev);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rejectUser = async (email: string) => {
    if (!canManageUsers) { toast.error('You do not have permission.'); return; }
    const prev = [...users];
    setUsers((u) => u.map((x) => x.email.toLowerCase() === email.toLowerCase() ? { ...x, status: 'rejected' } : x));
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/reject', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to reject user'));
      if (data?.user) patchUserList(data.user as AuthorizedUser);
      toast.success('User rejected');
    } catch (err) {
      setUsers(prev);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (email: string, newRole: string, assignedGroup?: string) => {
    if (!canManageUsers) { toast.error('You do not have permission.'); return; }
    const prev = [...users];
    setUsers((u) => u.map((x) =>
      x.email.toLowerCase() === email.toLowerCase()
        ? { ...x, role: newRole as UserRole, assignedGroup: assignedGroup ?? x.assignedGroup }
        : x,
    ));
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/change-role', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ email, newRole, assignedGroup }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to change role'));
      if (data?.user) patchUserList(data.user as AuthorizedUser);
      toast.success('Role updated');
    } catch (err) {
      setUsers(prev);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (email: string) => {
    const prev = [...users];
    removeUserFromList(email);
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/remove', {
        method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to remove user'));
      toast.success('User removed');
    } catch (err) {
      setUsers(prev);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addUser = async () => {
    if (!canManageUsers) { toast.error('You do not have permission.'); return; }
    if (!addForm.email.trim()) { toast.error('Email is required'); return; }
    if (addForm.role === 'TempUser' && !addForm.password) { toast.error('Temp password is required for TempUser'); return; }
    if (addForm.role === 'TempUser' && !addForm.tempAccessExpiresAt) { toast.error('Expiry is required for TempUser'); return; }
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/add', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ...addForm,
          tempAccessExpiresAt: addForm.tempAccessExpiresAt
            ? new Date(addForm.tempAccessExpiresAt).toISOString() : '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to add user'));
      if (data?.user) patchUserList(data.user as AuthorizedUser);
      toast.success('User added');
      setAddForm(DEFAULT_ADD_FORM);
      setAddUserOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async () => {
    if (!setPwdForm.newPassword) { toast.error('Password is required'); return; }
    if (setPwdForm.newPassword !== setPwdForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    setSetPwdBusy(true);
    try {
      const res = await fetch(API_URL + '/users/set-password', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          email: setPasswordTarget,
          newPassword: setPwdForm.newPassword,
          requireChange: setPwdForm.requireChange,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to set password'));
      toast.success('Password set for ' + setPasswordTarget);
      setSetPasswordOpen(false);
      setSetPwdForm(DEFAULT_SET_PASSWORD_FORM);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSetPwdBusy(false);
    }
  };

  const unlockAccount = async (email: string) => {
    setBusy(true);
    try {
      const res = await fetch(API_URL + '/users/unlock-account', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiErrorPayload(data, 'Failed to unlock account'));
      setUsers((prev) => prev.map((u) => u.email === email
        ? { ...u, isLocked: false, failedLoginAttempts: 0, accountLockedUntil: null }
        : u));
      toast.success(`Account unlocked: ${email}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };


  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch = !q || u.email.toLowerCase().includes(q) || (u.assignedGroup || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, search, statusFilter, roleFilter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            Users
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({filteredUsers.length}{filteredUsers.length !== users.length ? ` of ${users.length}` : ''})
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddUserOpen(true)} disabled={!canManageUsers}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search email or group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* User Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role / Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Loading users…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {users.length === 0 ? 'No users found.' : 'No users match the current filters.'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map((u) => (
                  <TableRow key={u._id || u.email}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                          {u.email[0]}
                        </div>
                        <span className="font-mono text-sm">{u.email}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {isMaster || u.role !== 'Master' ? (
                        <div className="space-y-1">
                          <Select
                            value={u.role}
                            onValueChange={(newRole) =>
                              changeRole(u.email, newRole, newRole === 'SVP' ? (u.assignedGroup || 'GES').toUpperCase() : undefined)
                            }
                            disabled={!canManageUsers || busy}
                          >
                            <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {isMaster && <SelectItem value="Master">Master</SelectItem>}
                              <SelectItem value="Admin">Admin</SelectItem>
                              <SelectItem value="ProposalHead">Tender Manager</SelectItem>
                              <SelectItem value="SVP">SVP</SelectItem>
                              <SelectItem value="BDTeam">BD Team</SelectItem>
                              <SelectItem value="Basic">Basic</SelectItem>
                              <SelectItem value="TempUser">Temp User</SelectItem>
                            </SelectContent>
                          </Select>
                          {u.role === 'SVP' && (
                            <Select
                              value={(u.assignedGroup || 'GES').toUpperCase()}
                              onValueChange={(group) => changeRole(u.email, 'SVP', group)}
                              disabled={!canManageUsers || busy}
                            >
                              <SelectTrigger className="h-7 w-[100px]"><SelectValue placeholder="Group" /></SelectTrigger>
                              <SelectContent>
                                {GROUP_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline">Master</Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={u.status} />
                        {u.isLocked && (
                          <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                            <AlertTriangle className="h-2.5 w-2.5" />Locked
                          </Badge>
                        )}
                        {!u.hasPassword && u.role !== 'Master' && (
                          <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                            <KeyRound className="h-2.5 w-2.5" />No password
                          </Badge>
                        )}
                        {u.requiresPasswordChange && (
                          <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 text-sky-600 border-sky-300">
                            <Lock className="h-2.5 w-2.5" />Must change pwd
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.status === 'pending' && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" className="h-7 gap-1" onClick={() => approveUser(u.email)} disabled={!canManageUsers || busy}>
                                  <CheckCircle className="h-3 w-3" /> Approve
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Approve user</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="destructive" className="h-7 gap-1" onClick={() => rejectUser(u.email)} disabled={!canManageUsers || busy}>
                                  <XCircle className="h-3 w-3" /> Reject
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject user</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        {u.isLocked && u.role !== 'Master' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon" variant="outline"
                                className="h-7 w-7 border-amber-300 text-amber-600 hover:bg-amber-50"
                                onClick={() => unlockAccount(u.email)}
                                disabled={!canManageUsers || busy}
                              >
                                <LockOpen className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Unlock account ({u.failedLoginAttempts} failed attempts)</TooltipContent>
                          </Tooltip>
                        )}
                        {u.role !== 'Master' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon" variant="outline"
                                className={`h-7 w-7 ${!u.hasPassword ? 'border-amber-300 text-amber-600 hover:bg-amber-50' : ''}`}
                                onClick={() => {
                                  setSetPasswordTarget(u.email);
                                  setSetPwdForm(DEFAULT_SET_PASSWORD_FORM);
                                  setSetPasswordOpen(true);
                                }}
                                disabled={busy}
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{u.hasPassword ? 'Change Password' : 'Set Password (no password configured!)'}</TooltipContent>
                          </Tooltip>
                        )}

                        {u.role !== 'Master' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon" variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => { setRemoveTarget(u.email); setRemoveOpen(true); }}
                                disabled={!canManageUsers || busy}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove User</TooltipContent>
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


      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add / Update Authorized User</DialogTitle>
            <DialogDescription>Create a new user or update an existing one by email.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@company.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Display Name</Label>
              <Input
                value={addForm.displayName}
                onChange={(e) => setAddForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v: UserRole) => setAddForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="ProposalHead">Tender Manager</SelectItem>
                  <SelectItem value="SVP">SVP</SelectItem>
                  <SelectItem value="BDTeam">BD Team</SelectItem>
                  <SelectItem value="Basic">Basic</SelectItem>
                  <SelectItem value="TempUser">Temp User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={addForm.status} onValueChange={(v: 'approved' | 'pending') => setAddForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addForm.role === 'SVP' && (
              <div className="col-span-2 space-y-1">
                <Label>SVP Group</Label>
                <Select value={addForm.assignedGroup} onValueChange={(v) => setAddForm((f) => ({ ...f, assignedGroup: v }))}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {addForm.role === 'TempUser' && (
              <>
                <div className="space-y-1">
                  <Label>Temp Password</Label>
                  <Input
                    type="password"
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Set a temp password"
                  />
                  <PasswordRequirements password={addForm.password} />
                </div>
                <div className="space-y-1">
                  <Label>Expires At</Label>
                  <Input
                    type="datetime-local"
                    value={addForm.tempAccessExpiresAt}
                    onChange={(e) => setAddForm((f) => ({ ...f, tempAccessExpiresAt: e.target.value }))}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Temp users have view-only access and must log in during the expiry window.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={addUser} disabled={!canManageUsers || busy}>
              {busy ? 'Saving…' : 'Add User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Password Dialog */}
      <Dialog open={setPasswordOpen} onOpenChange={setSetPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />Set Password
            </DialogTitle>
            <DialogDescription>Assign a login password for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>User</Label>
              <Input value={setPasswordTarget} readOnly className="bg-muted font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                value={setPwdForm.newPassword}
                onChange={(e) => setSetPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Enter new password"
              />
              <PasswordRequirements password={setPwdForm.newPassword} />
            </div>
            <div className="space-y-1">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={setPwdForm.confirmPassword}
                onChange={(e) => setSetPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Confirm password"
              />
              {setPwdForm.confirmPassword && setPwdForm.newPassword !== setPwdForm.confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="require-change"
                checked={setPwdForm.requireChange}
                onCheckedChange={(v) => setSetPwdForm((f) => ({ ...f, requireChange: Boolean(v) }))}
              />
              <Label htmlFor="require-change" className="cursor-pointer font-normal">
                Require password change on next login
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetPasswordOpen(false)}>Cancel</Button>
            <Button
              onClick={setPassword}
              disabled={setPwdBusy || !setPwdForm.newPassword || setPwdForm.newPassword !== setPwdForm.confirmPassword}
            >
              {setPwdBusy ? 'Saving…' : 'Set Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm Dialog */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Remove <span className="font-mono font-medium">{removeTarget}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { setRemoveOpen(false); void removeUser(removeTarget); }}
              disabled={busy}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
