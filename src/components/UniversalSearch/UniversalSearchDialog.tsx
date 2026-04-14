import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type UniversalSearchResult = {
  type: 'opportunity' | 'vendor' | 'client' | string;
  id: string;
  key: string;
  title: string;
  subtitle?: string;
  route: string;
  params?: Record<string, string>;
};

type UniversalSearchResponse = {
  success?: boolean;
  query?: string;
  results?: UniversalSearchResult[];
  error?: string;
};

function buildQueryString(params: Record<string, string> | undefined) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, value]) => String(value || '').trim());
  if (!entries.length) return '';
  const search = new URLSearchParams();
  entries.forEach(([key, value]) => search.set(key, value));
  return `?${search.toString()}`;
}

function typeLabel(type: string) {
  switch (type) {
    case 'opportunity':
      return 'Opportunity';
    case 'vendor':
      return 'Vendor';
    case 'client':
      return 'Client';
    default:
      return type || 'Result';
  }
}

export function UniversalSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UniversalSearchResult[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!token) {
      setResults([]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/universal-search?q=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await response.json()) as UniversalSearchResponse;
        if (!response.ok) throw new Error(data?.error || 'Search failed');
        if (cancelled) return;
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          toast.error((error as Error).message || 'Search failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setLoading(false);
    };
  }, [open, query, token]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, UniversalSearchResult[]>();
    results.forEach((row) => {
      const key = row.type || 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    return Array.from(groups.entries());
  }, [results]);

  const handlePick = (row: UniversalSearchResult) => {
    const qs = buildQueryString(row.params);
    onOpenChange(false);
    setQuery('');
    setResults([]);
    navigate(`${row.route}${qs}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Universal Search</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            ref={inputRef}
            placeholder="Search opportunities, vendors, clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="rounded-md border">
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                {query.trim() ? 'No results.' : 'Type to search.'}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {groupedResults.map(([type, rows], idx) => (
                  <div key={type}>
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{typeLabel(type)}</div>
                      <Badge variant="secondary" className="text-[11px]">{rows.length}</Badge>
                    </div>
                    <Separator />
                    {rows.map((row) => (
                      <button
                        key={row.key || row.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => handlePick(row)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold truncate">{row.title}</div>
                          <Badge variant="outline" className="shrink-0 text-[11px]">{typeLabel(row.type)}</Badge>
                        </div>
                        {row.subtitle ? <div className="text-xs text-muted-foreground truncate">{row.subtitle}</div> : null}
                      </button>
                    ))}
                    {idx < groupedResults.length - 1 ? <Separator /> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

