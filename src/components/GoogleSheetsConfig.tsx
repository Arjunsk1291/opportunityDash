import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { googleSheetsService } from '@/services/googleSheetsService';
import { useData } from '@/contexts/DataContext';
import { Loader2, RefreshCw, ExternalLink, CheckCircle2, XCircle, Bug } from 'lucide-react';
import { toast } from 'sonner';

export function GoogleSheetsConfig() {
  const { loadFromGoogleSheets, isLoading, lastSyncTime, isGoogleSheetsConnected, opportunities } = useData();
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [isSaving, setIsSaving] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
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
      const config = { apiKey, spreadsheetId, sheetName };
      localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
      
      googleSheetsService.initialize(apiKey, spreadsheetId, sheetName);
      
      toast.success('Configuration saved!');
      
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
    setDebugInfo('Testing connection...\n');
    
    try {
      googleSheetsService.initialize(apiKey, spreadsheetId, sheetName);
      const rawData = await googleSheetsService.fetchData();
      
      setDebugInfo(prev => prev + `✅ Fetched ${rawData.length} rows\n`);
      setDebugInfo(prev => prev + `📋 Sample row keys: ${Object.keys(rawData[0] || {}).join(', ')}\n`);
      setDebugInfo(prev => prev + `📊 Sample row data:\n${JSON.stringify(rawData[0], null, 2)}\n`);
      
      const converted = googleSheetsService.convertToOpportunities(rawData);
      setDebugInfo(prev => prev + `✅ Converted to ${converted.length} opportunities\n`);
      setDebugInfo(prev => prev + `📊 Sample opportunity:\n${JSON.stringify(converted[0], null, 2)}\n`);
      
      toast.success('Connection successful! Check debug info below.');
      setShowDebug(true);
    } catch (error: any) {
      setDebugInfo(prev => prev + `❌ Error: ${error.message}\n`);
      toast.error(`Connection failed: ${error.message}`);
      setShowDebug(true);
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
          <div className="text-right">
            {lastSyncTime && (
              <div className="text-sm text-muted-foreground">
                Last synced: {lastSyncTime.toLocaleTimeString()}
              </div>
            )}
            {opportunities.length > 0 && (
              <div className="text-sm font-medium text-green-600">
                {opportunities.length} opportunities loaded
              </div>
            )}
          </div>
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

        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={handleTestConnection} 
            disabled={isSaving || isLoading}
            variant="outline"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bug className="w-4 h-4 mr-2" />}
            Test & Debug
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

        {showDebug && debugInfo && (
          <div className="mt-4">
            <Label>Debug Information</Label>
            <Textarea 
              value={debugInfo} 
              readOnly 
              className="font-mono text-xs h-64 mt-2"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
