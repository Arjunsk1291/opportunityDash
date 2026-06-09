import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

type Status = 'Planned' | 'In Progress' | 'Done';
type Priority = 'High' | 'Medium' | 'Low';

interface UpcomingItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: Status;
  priority: Priority;
  sortOrder: number;
  updatedBy: string;
}

const STATUS_COLORS: Record<Status, string> = {
  Planned: 'bg-slate-100 text-slate-700 border-slate-200',
  'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
  Done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  High: 'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-blue-100 text-blue-700 border-blue-200',
  Low: 'bg-gray-100 text-gray-500 border-gray-200',
};

const BLANK: Partial<UpcomingItem> = {
  title: '', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 0,
};

export default function Upcoming() {
  const { token, isMaster, isAdmin } = useAuth();
  const canEdit = isMaster || isAdmin;

  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<UpcomingItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/upcoming`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => { setEditing({ ...BLANK }); setDialogOpen(true); };
  const openEdit = (item: UpcomingItem) => { setEditing({ ...item }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!editing || !token) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await fetch(
        isNew ? `${API}/upcoming` : `${API}/upcoming/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(editing),
        }
      );
      if (res.ok) { await fetchItems(); setDialogOpen(false); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !isMaster) return;
    if (!confirm('Delete this item?')) return;
    await fetch(`${API}/upcoming/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchItems();
  };

  const categories = ['All', ...Array.from(new Set(items.map(i => i.category || 'General')))];
  const filtered = items.filter(i => {
    if (filterStatus !== 'All' && i.status !== filterStatus) return false;
    if (filterCategory !== 'All' && (i.category || 'General') !== filterCategory) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, UpcomingItem[]>>((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Upcoming Features</h1>
          <p className="text-sm text-slate-500 mt-1">Roadmap of planned improvements and enhancements</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {(['All', 'Planned', 'In Progress', 'Done'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              filterStatus === s
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {s}
          </button>
        ))}
        {categories.length > 2 && (
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="text-sm border border-slate-200 rounded-full px-3 py-1 text-slate-600 bg-white"
          >
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-slate-400 text-sm">No items match the current filter.</p>
      )}

      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryItems.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800 leading-snug flex-1">{item.title}</p>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-slate-700 p-0.5">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {isMaster && (
                        <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 p-0.5">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                )}
                <div className="flex gap-1.5 flex-wrap mt-auto pt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[item.status]}`}>
                    {item.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[item.priority]}`}>
                    {item.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Item' : 'New Upcoming Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Title</Label>
              <Input
                value={editing?.title || ''}
                onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                placeholder="Feature title…"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editing?.description || ''}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Optional details…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input
                  value={editing?.category || 'General'}
                  onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}
                />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={editing?.sortOrder ?? 0}
                  onChange={e => setEditing(p => ({ ...p, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={editing?.status || 'Planned'} onValueChange={v => setEditing(p => ({ ...p, status: v as Status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={editing?.priority || 'Medium'} onValueChange={v => setEditing(p => ({ ...p, priority: v as Priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !editing?.title?.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
