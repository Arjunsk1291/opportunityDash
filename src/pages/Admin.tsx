import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Shield,
  Lock,
  Database,
  Activity,
  Bug,
  RefreshCw,
  CloudUpload,
  Zap,
  Settings,
  Users,
  FileStack,
  DollarSign,
} from 'lucide-react';
import { calculateDataHealth } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import SharePointSyncPanel from '@/components/Admin/SharePointSyncPanel';
import ErrorMonitor from '@/components/Admin/ErrorMonitor';
import SystemHealth from '@/components/Admin/SystemHealth';
import QuickActions from '@/components/Admin/QuickActions';
import DataManagement from '@/components/Admin/DataManagement';
import AccessControl from '@/components/Admin/AccessControl';
import AdminSettings from '@/components/Admin/AdminSettings';

const Admin = () => {
  const { opportunities } = useData();
  const { isAdmin, user, logout } = useAuth();
  const { currency, setCurrency } = useCurrency();

  const dataHealth = calculateDataHealth(opportunities);

  // Only admins should access this page
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              You need admin privileges to access this page.
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Master Control Panel
          </h1>
          <p className="text-muted-foreground">Logged in as {user?.displayName} ({user?.role})</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Currency Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">USD</span>
            <Switch
              checked={currency === 'AED'}
              onCheckedChange={(checked) => setCurrency(checked ? 'AED' : 'USD')}
            />
            <span className="text-sm font-medium">AED</span>
          </div>
          <Button variant="outline" onClick={logout}>
            <Lock className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Database className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{opportunities.length}</p>
            <p className="text-xs text-muted-foreground">Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-5 w-5 mx-auto text-success mb-2" />
            <p className="text-2xl font-bold">{dataHealth.healthScore}%</p>
            <p className="text-xs text-muted-foreground">Data Health</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Bug className="h-5 w-5 mx-auto text-warning mb-2" />
            <p className="text-2xl font-bold">{dataHealth.imputedCount}</p>
            <p className="text-xs text-muted-foreground">Imputed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <RefreshCw className="h-5 w-5 mx-auto text-info mb-2" />
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">Sync Status</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CloudUpload className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-sm font-medium">Connected</p>
            <p className="text-xs text-muted-foreground">SharePoint</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Zap className="h-5 w-5 mx-auto text-success mb-2" />
            <p className="text-2xl font-bold">99.9%</p>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sharepoint">
        <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full">
          <TabsTrigger value="sharepoint" className="gap-2">
            <CloudUpload className="h-4 w-4" />
            <span className="hidden md:inline">SharePoint</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <FileStack className="h-4 w-4" />
            <span className="hidden md:inline">Data</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden md:inline">Access</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <Bug className="h-4 w-4" />
            <span className="hidden md:inline">Errors</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden md:inline">Actions</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sharepoint" className="mt-4">
          <SharePointSyncPanel />
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <DataManagement />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <AccessControl />
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <ErrorMonitor />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <SystemHealth />
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <QuickActions />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <AdminSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
