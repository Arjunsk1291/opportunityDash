import { ReactNode, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type MasterSectionKey =
  | 'overview'
  | 'users'
  | 'permissions'
  | 'data-sync'
  | 'telecast'
  | 'columns'
  | 'diagnostics';

type MasterNavItem = {
  key: MasterSectionKey;
  label: string;
  path: string;
  keywords: string[];
};

const MASTER_NAV: MasterNavItem[] = [
  { key: 'overview', label: 'Overview', path: '/master/overview', keywords: ['health', 'sync', 'counts', 'overview'] },
  { key: 'users', label: 'Users', path: '/master/users', keywords: ['users', 'role', 'approval'] },
  { key: 'permissions', label: 'Permissions', path: '/master/permissions', keywords: ['permissions', 'matrix', 'access'] },
  { key: 'data-sync', label: 'Data Sync', path: '/master/data-sync', keywords: ['sync', 'graph', 'fxrate', 'rate'] },
{ key: 'telecast', label: 'Telecast', path: '/master/telecast', keywords: ['telecast', 'alerts', 'mail'] },
  { key: 'columns', label: 'Columns', path: '/master/columns', keywords: ['columns', 'visibility', 'color'] },
  { key: 'diagnostics', label: 'Diagnostics', path: '/master/diagnostics', keywords: ['diagnostics', 'latency', 'log', 'build'] },
];

export function getMasterNavItemFromPath(pathname: string) {
  return MASTER_NAV.find((item) => pathname.startsWith(item.path)) || MASTER_NAV[0];
}

export function MasterShell({
  children,
  activeKey,
}: {
  children: ReactNode;
  activeKey: MasterSectionKey;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const activeItem = useMemo(() => MASTER_NAV.find((item) => item.key === activeKey) || MASTER_NAV[0], [activeKey]);
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MASTER_NAV;
    return MASTER_NAV.filter((item) => (
      item.label.toLowerCase().includes(q)
      || item.keywords.some((keyword) => keyword.includes(q) || q.includes(keyword))
    ));
  }, [query]);

  return (
    <div className="min-h-[calc(100vh-5.5rem)]">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-background p-3 shadow-sm">
          <div className="sticky top-3 space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Master</div>
              <div className="text-lg font-semibold">Sections</div>
              <div className="text-xs text-muted-foreground">Browse the existing admin panels under the new route shell.</div>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a setting..."
            />
            <div className="lg:hidden">
              <Select value={activeItem.key} onValueChange={(value) => navigate(`/master/${value}`)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MASTER_NAV.map((item) => (
                    <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <nav className="hidden lg:block space-y-1">
              {filteredItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.path}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted',
                    location.pathname.startsWith(item.path) ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="sticky top-0 z-10 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Master &gt; {activeItem.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {activeItem.label} inside the existing admin experience.
            </div>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
