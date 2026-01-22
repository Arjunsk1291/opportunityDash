import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  BarChart3,
  Shield,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  Send,
  Award,
  XCircle,
  Pause,
  Settings,
  FileSpreadsheet,
  AlertTriangle,
  CloudUpload,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Opportunities", url: "/opportunities", icon: FileText },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

const statusNavItems = [
  { title: "Pre-bid", url: "/status/pre-bid", icon: Clock, color: "text-info" },
  { title: "In Progress", url: "/status/in-progress", icon: ChevronRight, color: "text-warning" },
  { title: "Submitted", url: "/status/submitted", icon: Send, color: "text-[hsl(var(--pending))]" },
  { title: "Awarded", url: "/status/awarded", icon: Award, color: "text-success" },
  { title: "Lost/Regretted", url: "/status/lost", icon: XCircle, color: "text-destructive" },
  { title: "On Hold", url: "/status/on-hold", icon: Pause, color: "text-muted-foreground" },
];

const adminNavItems = [
  { title: "Master Panel", url: "/master", icon: Shield },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  
  const [statusOpen, setStatusOpen] = useState(
    location.pathname.startsWith("/status")
  );

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Tender Manager</span>
              <span className="text-xs text-muted-foreground">Tender Tracking</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
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

        {/* By Status */}
        <SidebarGroup>
          <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 -mx-2 flex items-center justify-between">
                <span>By Status</span>
                {statusOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {statusNavItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <NavLink to={item.url}>
                          <item.icon className={cn("h-4 w-4", item.color)} />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>


        {/* Admin Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.title === "Admin Panel" && (
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5">
                          Protected
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && (
          <div className="text-xs text-muted-foreground">
            <p>Last sync: {new Date().toLocaleString()}</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
