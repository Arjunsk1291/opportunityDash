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
  SidebarFooter,
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

  const visibleMainItems = NAV_ITEMS.filter((item) => item.pageKey !== 'master' && canAccessPage(item.pageKey));
  const visibleAdminItems = NAV_ITEMS.filter((item) => item.pageKey === 'master' && canAccessPage(item.pageKey));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-2 sm:p-3 md:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-semibold truncate">Tender Manager</span>
              <span className="text-xs sm:text-sm text-muted-foreground truncate">Tender Tracking</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                      <span className="text-xs sm:text-sm md:text-base truncate" title={item.title}>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                        <span className="text-xs sm:text-sm md:text-base truncate" title={item.title}>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 sm:p-3 md:p-4">
        {!collapsed && (
          <div className="text-xs sm:text-sm text-muted-foreground truncate">
            <p>Last sync: {new Date().toLocaleString()}</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
