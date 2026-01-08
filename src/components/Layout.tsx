import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { useData } from "@/contexts/DataContext";
import { Badge } from "@/components/ui/badge";

export function Layout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const { isGoogleSheetsConnected, lastSyncTime } = useData();

  return (
    <SidebarProvider open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <div className="flex-1" />
            
            {/* Connection Status */}
            {isGoogleSheetsConnected && lastSyncTime && (
              <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Connected
                </Badge>
                <span>Last synced: {lastSyncTime.toLocaleTimeString()}</span>
              </div>
            )}
            
            {/* Currency Switcher */}
            <CurrencySwitcher />
            
            {/* Refresh Button */}
            <RefreshButton variant="outline" size="sm" />
            
            <ThemeToggle />
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
