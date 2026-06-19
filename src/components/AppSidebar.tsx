import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS } from '@/config/navigation';

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { canAccessPage } = useAuth();
  const collapsed = state === 'collapsed';

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const visibleMainItems = NAV_ITEMS.filter((item) => (item.section ?? 'main') === 'main' && canAccessPage(item.pageKey));
  const visibleAdminItems = NAV_ITEMS.filter((item) => (item.section ?? 'main') === 'admin' && canAccessPage(item.pageKey));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60" style={{ background: 'var(--glass-sidebar-bg)', backdropFilter: 'var(--glass-blur)' }}>
      <SidebarHeader className="border-b border-sidebar-border/60 p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground shadow-sm"
            style={{ background: 'linear-gradient(145deg, hsl(var(--primary)), hsl(var(--primary)) 130%)' }}
          >
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-extrabold tracking-tight">AVENIR</span>
            <span className="text-[8px] font-semibold tracking-[0.14em] text-muted-foreground">ENGINEERS &amp; CONSULTANTS</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold tracking-[0.13em]">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className={isActive(item.url) ? 'rounded-xl font-bold animate-[pulse-glow_2.5s_ease-in-out_infinite]' : 'rounded-xl'}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-bold tracking-[0.13em]">Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} className="rounded-xl">
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

    </Sidebar>
  );
}
