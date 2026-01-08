import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { googleSheetsService } from '@/services/googleSheetsService';
import { useData } from '@/contexts/DataContext';
import { Loader2, RefreshCw, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function GoogleSheetsConfig() {
  const { loadFromGoogleSheets, isLoading, lastSyncTime, isGoogleSheetsConnected } = useData();
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load saved config
    const savedConfig = localStorage.getItem('googleSheetsConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setApiKey(config.apiKey || '');
        setSpreadsheetId(config.spreadsheetId || '');
        setSheetName(config.sheetName || 'Sheet1');
      } catch (error) {
        console.error('Failed to load saved config:', error);
      }
    }
  }, []);

  const handleSaveConfig = () => {
    if (!apiKey || !spreadsheetId) {
      toast.error('Please provide both API Key and Spreadsheet ID');
      return;
    }

    setIsSaving(true);
    try {
      // Save to localStorage
      const config = { apiKey, spreadsheetId, sheetName };
      localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
      
      // Initialize service
      googleSheetsService.initialize(apiKey, spreadsheetId, sheetName);
      
      toast.success('Configuration saved!');
      
      // Auto-sync after saving
      setTimeout(() => {
        loadFromGoogleSheets();
        setIsSaving(false);
      }, 500);
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey || !spreadsheetId) {
      toast.error('Please provide both API Key and Spreadsheet ID');
      return;
    }

    setIsSaving(true);
    try {
      googleSheetsService.initialize(apiKey, spreadsheetId, sheetName);
      await googleSheetsService.fetchData();
      toast.success('Connection successful!');
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const extractSpreadsheetId = (url: string): string => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Google Sheets Integration
              {isGoogleSheetsConnected ? (
                <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>
              ) : (
                <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" /> Not Connected</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Connect your Google Sheets to sync opportunities in real-time
            </CardDescription>
          </div>
          {lastSyncTime && (
            <div className="text-sm text-muted-foreground">
              Last synced: {lastSyncTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-sm">
            <strong>Setup Instructions:</strong>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Cloud Console</a></li>
              <li>Create a project and enable Google Sheets API</li>
              <li>Create API Key (Credentials → Create Credentials → API Key)</li>
              <li>Make your Google Sheet public (Share → Anyone with the link can view)</li>
              <li>Copy the Spreadsheet ID from the URL</li>
            </ol>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div>
            <Label htmlFor="apiKey">Google Sheets API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="spreadsheetId">Spreadsheet ID or URL</Label>
            <Input
              id="spreadsheetId"
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(extractSpreadsheetId(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              From URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
            </p>
          </div>

          <div>
            <Label htmlFor="sheetName">Sheet Name (Tab)</Label>
            <Input
              id="sheetName"
              placeholder="Sheet1"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleTestConnection} 
            disabled={isSaving || isLoading}
            variant="outline"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Test Connection
          </Button>
          
          <Button 
            onClick={handleSaveConfig} 
            disabled={isSaving || isLoading}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save & Sync
          </Button>

          {isGoogleSheetsConnected && (
            <Button 
              onClick={() => loadFromGoogleSheets()} 
              disabled={isLoading}
              variant="secondary"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh Data
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank')}
            disabled={!spreadsheetId}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Sheet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
