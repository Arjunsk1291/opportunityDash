import { useState, useEffect, useCallback } from 'react';
import { Trophy, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || '/api';

type Period = 'year' | 'all';

interface Tender {
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  awardedDate: string | null;
  value: number;
}

interface TopPerformerData {
  name: string;
  count: number;
  totalValue: number;
  tenders: Tender[];
}

interface Props {
  visible: boolean;
  onVisibilityToggle?: (visible: boolean) => void;
}

const fmt = (val: number) => {
  if (val >= 1_000_000) return `AED ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `AED ${(val / 1_000).toFixed(0)}K`;
  return `AED ${val.toLocaleString()}`;
};

export function TopPerformerCard({ visible, onVisibilityToggle }: Props) {
  const { token, isMaster } = useAuth();
  const [period, setPeriod] = useState<Period>('year');
  const [data, setData] = useState<TopPerformerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/opportunities/top-performer?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json.topPerformer || null);
    } finally {
      setLoading(false);
    }
  }, [token, period]);

  useEffect(() => { if (visible) void fetchData(); }, [fetchData, visible]);

  if (!visible) return null;

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-slate-800 text-sm">Top Performer</span>
            <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => setPeriod('year')}
                className={`px-2.5 py-0.5 ${period === 'year' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                This Year
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-2.5 py-0.5 ${period === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                All Time
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isMaster && onVisibilityToggle && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-600"
                onClick={() => onVisibilityToggle(!visible)}
                title="Toggle visibility for all users"
              >
                {visible ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="px-5 py-4">
          {loading && <p className="text-sm text-slate-400">Computing…</p>}
          {!loading && !data && (
            <p className="text-sm text-slate-400">No awarded tenders {period === 'year' ? 'this year' : 'found'}.</p>
          )}
          {!loading && data && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-900">{data.name}</p>
                <p className="text-sm text-slate-500">
                  {data.count} awarded tender{data.count !== 1 ? 's' : ''} · {fmt(data.totalValue)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
                View Tenders
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {data?.name} — Awarded Tenders ({period === 'year' ? 'This Year' : 'All Time'})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref No</TableHead>
                  <TableHead>Tender Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Awarded Date</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.tenders || []).map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{t.opportunityRefNo || '—'}</TableCell>
                    <TableCell className="text-sm">{t.tenderName || '—'}</TableCell>
                    <TableCell className="text-sm">{t.clientName || '—'}</TableCell>
                    <TableCell className="text-sm">{t.awardedDate || '—'}</TableCell>
                    <TableCell className="text-right text-sm">{t.value > 0 ? fmt(t.value) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
