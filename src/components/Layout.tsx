import { ReactNode, useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, Search, LogOut, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ReportIssueButton } from '@/components/ReportIssueButton';
import logo from '@/assets/Avenir_Logo.avif';
import { UniversalSearchDialog } from '@/components/UniversalSearch/UniversalSearchDialog';
import { ScrollJourney } from '@/components/ScrollJourney';
import { AmbientBackground } from '@/components/AmbientBackground';
import { NAV_ITEMS } from '@/config/navigation';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAdmin, logout, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    const match = NAV_ITEMS
      .filter((item) => (item.url === '/' ? path === '/' : path.startsWith(item.url)))
      .sort((a, b) => b.url.length - a.url.length)[0];
    return (match?.title || 'Sales Dashboard').toUpperCase();
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const fieldStyle = {
    background: 'var(--glass-field-bg)',
    boxShadow: 'var(--glass-field-shadow)',
  } as const;

  return (
    <div className="relative flex min-h-screen w-full">
      <AmbientBackground />
      <ScrollJourney />
      <AppSidebar collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex min-h-[54px] items-center gap-2 border-b px-3 py-2.5 sm:gap-3.5 sm:px-5"
          style={{
            background: 'var(--glass-topbar-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            borderColor: 'var(--glass-card-border)',
          }}
        >
          {/* Collapse (desktop) */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] transition-colors hover:text-[color:var(--brand)] md:flex"
            style={{ ...fieldStyle, color: 'var(--glass-text-2)' }}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-[17px] w-[17px]" />
          </button>
          {/* Drawer (mobile) */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] md:hidden"
            style={{ ...fieldStyle, color: 'var(--glass-text-2)' }}
            aria-label="Open menu"
          >
            <Menu className="h-[17px] w-[17px]" />
          </button>

          <span className="truncate text-[13px] font-extrabold tracking-[.08em]" style={{ color: 'var(--glass-text-1)' }}>
            {pageTitle}
          </span>

          <div className="flex-1" />

          {/* Search field */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-[10px] px-3 py-[7px] text-left transition-colors hover:text-[color:var(--brand)] sm:min-w-[220px]"
            style={{ ...fieldStyle, color: 'var(--glass-text-3)' }}
          >
            <Search className="h-[14px] w-[14px] shrink-0" />
            <span className="hidden text-[12.5px] sm:inline">Search opportunities, clients…</span>
            <span
              className="ml-auto hidden rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold lg:inline"
              style={{ background: 'var(--glass-hover)', color: 'var(--glass-text-2)' }}
            >
              ⌘K
            </span>
          </button>

          <ThemeToggle />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-2.5"
                style={fieldStyle}
              >
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[11px] font-extrabold text-white"
                  style={{ background: 'linear-gradient(145deg, var(--brand), var(--brand-ink))' }}
                >
                  {(user?.displayName || 'U').charAt(0).toUpperCase()}
                </span>
                <span className="hidden leading-[1.15] md:block">
                  <span className="block text-[11.5px] font-bold" style={{ color: 'var(--glass-text-1)' }}>
                    {user?.displayName}
                  </span>
                  <span className="block text-[10px] font-semibold" style={{ color: 'var(--glass-text-3)' }}>
                    {user?.role}
                  </span>
                </span>
                {isAdmin && <Badge variant="secondary" className="ml-1 hidden text-[10px] sm:inline-flex">Admin</Badge>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/master')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Panel
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <img src={logo} alt="Avenir Engineering" className="hidden h-7 w-auto lg:block" />
        </header>

        {/* Main content */}
        <motion.main
          key={location.pathname}
          className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.main>
      </div>

      <ReportIssueButton authToken={token} reporter={user ? { displayName: user.displayName, role: user.role, email: user.email } : null} />
      <UniversalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
