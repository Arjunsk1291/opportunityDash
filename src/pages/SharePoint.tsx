// src/pages/SharePoint.tsx - UPDATED VERSION

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Database,
  AlertCircle,
  Download,
  Settings,
  FileSpreadsheet
} from 'lucide-react';
import { useSharePointData } from '@/hooks/useSharePointData';
import { format } from 'date-fns';

const SharePoint = () => {
  const [sharePointUrl, setSharePointUrlInput] = useState(
    import.meta.env.VITE_SHAREPOINT_URL || 
    'https://avenirengineeringae-my.sharepoint.com/:x:/g/personal/arjun_s_avenirengineering_com/EQAIb2CegyykRawrrCej8MBSASmxPd8IAwgZPX1ieGZZcr0?e=EKLIxa'
  );

  const {
    data,
    syncStatus,
    syncData,
    setSharePointUrl,
    isLoading,
    error,
    lastSync,
    recordCount,
  } = useSharePointData({
    autoSync: true,
    syncInterval: 5 * 60 * 1000, // 5 minutes
  });

  const handleUpdateUrl = () => {
    setSharePointUrl(sharePointUrl);
  };

  const handleManualSync = () => {
    syncData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          SharePoint Integration
        </h1>
        <p className="text-muted-foreground">
          Connect and sync data from your SharePoint Excel file
        </p>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Connection Status
            </span>
            <Badge variant={error ? 'destructive' : lastSync ? 'success' : 'secondary'}>
              {error ? 'Error' : lastSync ? 'Connected' : 'Not Connected'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Configure your SharePoint Excel file URL and sync settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SharePoint URL Input */}
          <div className="space-y-2">
            <Label htmlFor="sharepoint-url">SharePoint File URL</Label>
            <div className="flex gap-2">
              <Input
                id="sharepoint-url"
                value={sharePointUrl}
                onChange={(e) => setSharePointUrlInput(e.target.value)}
                placeholder="https://yourcompany.sharepoint.com/..."
                className="flex-1"
              />
              <Button onClick={handleUpdateUrl} variant="outline">
                Update
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste the sharing link from your SharePoint Excel file
            </p>
          </div>

          <Separator />

          {/* Sync Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Last Sync</p>
                <p className="text-xs text-muted-foreground">
                  {lastSync ? format(lastSync, 'PPp') : 'Never'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <FileSpreadsheet className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium">Records</p>
                <p className="text-xs text-muted-foreground">
                  {recordCount} rows
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10">
                <RefreshCw className={`h-5 w-5 text-info ${isLoading ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-medium">Auto-Sync</p>
                <p className="text-xs text-muted-foreground">
                  Every 5 minutes
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleManualSync} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button variant="outline" disabled>
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Sync Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {!error && lastSync && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Connected</AlertTitle>
              <AlertDescription>
                Successfully synced {recordCount} records from SharePoint
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Data Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Preview
          </CardTitle>
          <CardDescription>
            Preview of synced data from SharePoint Excel
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {data.map((row, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Tender No</p>
                        <p className="font-semibold">{row.tenderNo}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Tender Name</p>
                        <p className="font-semibold">{row.tenderName}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Client</p>
                        <p>{row.client}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Assigned Person</p>
                        <p>{row.assignedPerson}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Status</p>
                        <Badge>{row.avenirStatus}</Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Tender Value</p>
                        <p className="font-semibold">
                          {row.tenderValue 
                            ? `${row.currency || 'AED'} ${row.tenderValue.toLocaleString()}`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No data synced yet</p>
              <Button onClick={handleManualSync} className="mt-4">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Get SharePoint Link
            </h4>
            <p className="text-sm text-muted-foreground ml-8">
              Open your Excel file in SharePoint, click Share, and copy the link
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Paste URL Above
            </h4>
            <p className="text-sm text-muted-foreground ml-8">
              Paste the SharePoint URL in the field above and click Update
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">3</span>
              Auto-Sync Enabled
            </h4>
            <p className="text-sm text-muted-foreground ml-8">
              Data will automatically sync every 5 minutes. You can also manually sync anytime.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SharePoint;