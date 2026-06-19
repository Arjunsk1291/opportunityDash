import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ collapsed, mobileOpen, onMobileClose }: AppSidebarProps) {
  const location = useLocation();
  const { canAccessPage } = useAuth();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const mainItems = NAV_ITEMS.filter((item) => (item.section ?? 'main') === 'main' && canAccessPage(item.pageKey));
  const adminItems = NAV_ITEMS.filter((item) => (item.section ?? 'main') === 'admin' && canAccessPage(item.pageKey));

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const active = isActive(item.url);
    const Icon = item.icon;
    return (
      <NavLink
        key={item.title}
        to={item.url}
        onClick={onMobileClose}
        title={collapsed ? item.title : undefined}
        className={cn(
          'group/navitem mx-2.5 my-0.5 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] transition-colors',
          collapsed && 'justify-center px-0',
        )}
        style={
          active
            ? {
                color: 'var(--brand-ink)',
                background: 'var(--glass-hover)',
                boxShadow: 'inset 0 0 0 1px rgba(47,107,255,.2)',
                fontWeight: 700,
              }
            : { color: 'var(--glass-text-2)', fontWeight: 500 }
        }
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'var(--glass-hover)';
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" style={active ? { color: 'var(--brand)' } : undefined} />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={cn('fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden', mobileOpen ? 'block' : 'hidden')}
        onClick={onMobileClose}
        aria-hidden
      />
      <aside
        className={cn(
          'z-50 flex h-screen flex-col overflow-hidden border-r transition-[width,transform] duration-300 ease-out',
          'fixed inset-y-0 left-0 md:sticky md:top-0 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{
          width: collapsed ? 76 : 248,
          background: 'var(--glass-sidebar-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderColor: 'var(--glass-card-border)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 whitespace-nowrap px-[18px] pb-3.5 pt-[18px]">
          <div
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white"
            style={{
              background: 'linear-gradient(145deg, var(--brand), var(--brand-ink))',
              boxShadow: '0 6px 16px -4px rgba(47,107,255,.6), inset 0 1px 0 rgba(255,255,255,.4)',
            }}
          >
            <BarChart3 className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-[.02em]" style={{ color: 'var(--brand-ink)' }}>
                AVENIR
              </div>
              <div className="text-[8.5px] font-semibold tracking-[.14em]" style={{ color: 'var(--glass-text-3)' }}>
                ENGINEERS &amp; CONSULTANTS
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-1.5">
          {!collapsed && (
            <div className="px-[26px] pb-1.5 pt-3 text-[10px] font-bold tracking-[.13em]" style={{ color: 'var(--glass-text-3)' }}>
              NAVIGATION
            </div>
          )}
          {mainItems.map(renderItem)}

          {adminItems.length > 0 && (
            <>
              {!collapsed && (
                <div className="px-[26px] pb-1.5 pt-4 text-[10px] font-bold tracking-[.13em]" style={{ color: 'var(--glass-text-3)' }}>
                  ADMIN
                </div>
              )}
              {adminItems.map(renderItem)}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
