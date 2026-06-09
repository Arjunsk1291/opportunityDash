import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, KeyRound, Copy, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { PAGE_LABELS } from '@/config/navigation';

const API = import.meta.env.VITE_API_URL || '/api';

const ASSIGNABLE_PAGES = Object.entries(PAGE_LABELS)
  .filter(([key]) => !key.startsWith('master'))
  .map(([key, label]) => ({ key, label }));

interface TempAccess {
  id: string;
  accessId: string;
  displayName: string;
  allowedPages: string[];
  validFrom: string | null;
  validUntil: string;
  isActive: boolean;
  lastLoginAt: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
}

interface CreatedCredential {
  accessId: string;
  password: string;
}

const BLANK_FORM = {
  displayName: '',
  allowedPages: [] as string[],
  validFrom: '',
  validUntil: '',
  isActive: true,
  notes: '',
};

interface Props { token: string | null; isMaster: boolean; }

export function TempAccessPanel({ token, isMaster }: Props) {
  const [items, setItems] = useState<TempAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TempAccess | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [credModal, setCredModal] = useState<CreatedCredential | null>(null);
  const [copied, setCopied] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/temp-access`, { headers: headers() });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...BLANK_FORM });
    setDialogOpen(true);
  };

  const openEdit = (item: TempAccess) => {
    setEditTarget(item);
    setForm({
      displayName: item.displayName,
      allowedPages: [...item.allowedPages],
      validFrom: item.validFrom ? item.validFrom.slice(0, 10) : '',
      validUntil: item.validUntil ? item.validUntil.slice(0, 10) : '',
      isActive: item.isActive,
      notes: item.notes,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const body = {
        displayName: form.displayName.trim(),
        allowedPages: form.allowedPages,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil,
        isActive: form.isActive,
        notes: form.notes,
      };
      const res = editTarget
        ? await fetch(`${API}/admin/temp-access/${editTarget.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) })
        : await fetch(`${API}/admin/temp-access`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDialogOpen(false);
      if (!editTarget && data.password) {
        setCredModal({ accessId: data.accessId, password: data.password });
      } else {
        toast.success(editTarget ? 'Updated' : 'Created');
      }
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (item: TempAccess) => {
    if (!token || !isMaster) return;
    if (!confirm(`Reset password for ${item.accessId}?`)) return;
    const res = await fetch(`${API}/admin/temp-access/${item.id}/reset-password`, { method: 'POST', headers: headers() });
    const data = await res.json();
    if (res.ok && data.password) {
      setCredModal({ accessId: item.accessId, password: data.password });
    } else {
      toast.error(data.error || 'Failed to reset');
    }
  };

  const handleDelete = async (item: TempAccess) => {
    if (!isMaster) return;
    if (!confirm(`Delete ${item.accessId}? This cannot be undone.`)) return;
    await fetch(`${API}/admin/temp-access/${item.id}`, { method: 'DELETE', headers: headers() });
    toast.success('Deleted');
    await load();
  };

  const togglePage = (key: string) => {
    setForm(f => ({
      ...f,
      allowedPages: f.allowedPages.includes(key)
        ? f.allowedPages.filter(p => p !== key)
        : [...f.allowedPages, key],
    }));
  };

  const copyCredentials = async () => {
    if (!credModal) return;
    await navigator.clipboard.writeText(`Username: ${credModal.accessId}\nPassword: ${credModal.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = (validUntil: string) => new Date(validUntil) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Temp Access Accounts</h3>
          <p className="text-xs text-slate-500 mt-0.5">Auto-generated TEMP-xxx IDs with restricted page access</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />New</Button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-slate-400">
            No temp access accounts yet. Create one to get started.
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Pages</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs font-semibold">{item.accessId}</TableCell>
                      <TableCell className="text-sm">{item.displayName || <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-500">{item.allowedPages.length} page{item.allowedPages.length !== 1 ? 's' : ''}</span>
                      </TableCell>
                      <TableCell className={`text-xs ${isExpired(item.validUntil) ? 'text-red-500' : 'text-slate-600'}`}>
                        {item.validUntil ? new Date(item.validUntil).toLocaleDateString() : '—'}
                        {isExpired(item.validUntil) && <span className="ml-1">(expired)</span>}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Badge className={item.isActive && !isExpired(item.validUntil) ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                          {item.isActive && !isExpired(item.validUntil) ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleResetPassword(item)}>
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reset Password</TooltipContent>
                          </Tooltip>
                          {isMaster && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
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
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit ${editTarget.accessId}` : 'New Temp Access Account'}</DialogTitle>
            {!editTarget && <DialogDescription>A TEMP-xxx ID and password will be auto-generated. The password is shown once on creation.</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>Display Name (optional)</Label>
              <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="e.g. External Reviewer" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valid From (optional)</Label>
                <Input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
              </div>
              <div>
                <Label>Valid Until <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes…" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Active</Label>
            </div>
            <div>
              <Label className="mb-2 block">Allowed Pages</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {ASSIGNABLE_PAGES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 hover:text-slate-900">
                    <Checkbox
                      checked={form.allowedPages.includes(key)}
                      onCheckedChange={() => togglePage(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.validUntil}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time credential display */}
      <Dialog open={!!credModal} onOpenChange={() => setCredModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Credentials Created</DialogTitle>
            <DialogDescription>Copy these credentials now — the password will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 font-mono text-sm space-y-1">
            <p><span className="text-slate-500">Username:</span> <strong>{credModal?.accessId}</strong></p>
            <p><span className="text-slate-500">Password:</span> <strong>{credModal?.password}</strong></p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyCredentials}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button onClick={() => setCredModal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
