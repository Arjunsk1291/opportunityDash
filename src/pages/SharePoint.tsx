import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  CloudUpload,
  Link2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Settings,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

const SharePoint = () => {
  const [sharepointUrl, setSharepointUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTestConnection = async () => {
    if (!sharepointUrl) {
      toast.error('Please enter a SharePoint URL');
      return;
    }
    
    setIsTesting(true);
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsTesting(false);
    
    // For demo purposes, always succeed
    setIsConnected(true);
    toast.success('Successfully connected to SharePoint');
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsSyncing(false);
    toast.success('Data synchronized successfully', {
      description: '52 records updated from SharePoint'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CloudUpload className="h-6 w-6 text-primary" />
          SharePoint Integration
        </h1>
        <p className="text-muted-foreground">Connect to a live Excel file on SharePoint</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Read-Only Sync</AlertTitle>
        <AlertDescription>
          This integration reads data from your SharePoint Excel file. Changes made in the dashboard 
          will not be written back to SharePoint. To update the source data, edit the Excel file directly.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Connection Setup
            </CardTitle>
            <CardDescription>
              Enter your SharePoint Excel file URL to enable live data sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sharepoint-url">SharePoint Excel URL</Label>
              <Input
                id="sharepoint-url"
                placeholder="https://yourcompany.sharepoint.com/sites/..."
                value={sharepointUrl}
                onChange={(e) => setSharepointUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste the full URL to your Excel file on SharePoint
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleTestConnection} 
                disabled={isTesting || !sharepointUrl}
                className="flex-1"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>

            {isConnected && (
              <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="text-sm font-medium text-success">Connected to SharePoint</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Last Sync</span>
                </div>
                <p className="font-semibold">
                  {isConnected ? new Date().toLocaleString() : 'Never'}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Records</span>
                </div>
                <p className="font-semibold">52 rows</p>
              </div>
            </div>

            <Button 
              onClick={handleSync} 
              disabled={!isConnected || isSyncing}
              className="w-full"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>

            {!isConnected && (
              <p className="text-sm text-muted-foreground text-center">
                Connect to SharePoint first to enable sync
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sync Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Auto-Sync Interval</Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="60" className="w-20" defaultValue={60} />
                <span className="text-sm text-muted-foreground self-center">minutes</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data Entry Sheet</Label>
              <Input placeholder="Data Entry" defaultValue="Data Entry" />
            </div>

            <div className="space-y-2">
              <Label>Tender Details Sheet</Label>
              <Input placeholder="Sheet1" defaultValue="Sheet1" />
            </div>
          </div>

          <Separator className="my-6" />

          <div className="space-y-4">
            <h4 className="font-medium">Column Mapping</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-muted-foreground">Opportunity ID</p>
                <p className="font-medium">Opportunity Ref. No.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-muted-foreground">Tender ID</p>
                <p className="font-medium">Tender no</p>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-muted-foreground">Client</p>
                <p className="font-medium">Client Name</p>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-muted-foreground">Value</p>
                <p className="font-medium">Opportunity Value</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button variant="outline">Save Configuration</Button>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Note */}
      <Alert variant="default">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Implementation Note</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            To enable live SharePoint integration, you'll need to:
          </p>
          <ol className="list-decimal list-inside text-sm space-y-1 mt-2">
            <li>Register an Azure AD application with SharePoint permissions</li>
            <li>Configure OAuth2 authentication flow</li>
            <li>Use Microsoft Graph API to read Excel files</li>
            <li>Set up a backend endpoint to handle the API calls securely</li>
          </ol>
          <p className="mt-2">
            This requires enabling Lovable Cloud for backend functionality and storing your Azure credentials securely.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default SharePoint;
