import { useState, useEffect, useCallback } from 'react';
import { Trophy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  showForAllUsers: boolean;
  onToggleShowForAll?: (show: boolean) => void;
}

const fmt = (val: number) => {
  if (val >= 1_000_000) return `AED ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `AED ${(val / 1_000).toFixed(0)}K`;
  return `AED ${val.toLocaleString()}`;
};

export function TopPerformerCard({ showForAllUsers, onToggleShowForAll }: Props) {
  const { token, isMaster } = useAuth();
  const [period, setPeriod] = useState<Period>('year');
  const [data, setData] = useState<TopPerformerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/opportunities/top-performer?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setData(json.topPerformer || null);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [token, period]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="font-semibold text-foreground text-sm">Top Performer</span>
            <div className="flex rounded-full border border-border/60 overflow-hidden text-xs">
              <button
                onClick={() => setPeriod('year')}
                className={`px-2.5 py-0.5 transition-colors ${period === 'year' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-[var(--glass-hover)]'}`}
              >
                This Year
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-2.5 py-0.5 transition-colors ${period === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-[var(--glass-hover)]'}`}
              >
                All Time
              </button>
            </div>
          </div>
          {isMaster && onToggleShowForAll && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => onToggleShowForAll(!showForAllUsers)}
                >
                  {showForAllUsers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showForAllUsers ? 'Visible to all users — click to restrict to Master only' : 'Master only — click to show for all users'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="px-5 py-4">
          {loading && <p className="text-sm text-muted-foreground animate-pulse">Computing…</p>}
          {!loading && !data && (
            <p className="text-sm text-muted-foreground">
              No awarded tenders found {period === 'year' ? 'this year' : 'in the database'}.
            </p>
          )}
          {!loading && data && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-foreground leading-tight">{data.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.count} awarded tender{data.count !== 1 ? 's' : ''}
                  {data.totalValue > 0 && <span> · {fmt(data.totalValue)}</span>}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)} className="shrink-0">
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
