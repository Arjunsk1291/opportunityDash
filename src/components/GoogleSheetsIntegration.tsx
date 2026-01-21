import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ColumnMappingUI } from './ColumnMappingUI';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function GoogleSheetsIntegration() {
  const { user } = useAuth();
  const [config, setConfig] = useState({
    apiKey: '',
    spreadsheetId: '',
    sheetName: 'Opportunities',
    columnMapping: {},
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [configSavedBy, setConfigSavedBy] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/config`);
      const data = await res.json();
      if (data.apiKey) {
        setConfig(data);
        setSyncStatus(data.lastSyncStatus || '');
        
        // ✅ Display persistence info
        if (data.lastSavedTime) {
          const savedDate = new Date(data.lastSavedTime);
          setLastSavedTime(savedDate.toLocaleString());
          setConfigSavedBy(data.configSavedBy || 'Unknown');
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          configSavedBy: user?.displayName || 'Master User',
        }),
      });
      const data = await res.json();
      setMessage(`✅ ${data.message}`);
      
      // ✅ Update persistence display
      if (data.config) {
        const savedDate = new Date(data.config.lastSavedTime);
        setLastSavedTime(savedDate.toLocaleString());
        setConfigSavedBy(data.config.configSavedBy);
      }
    } catch (err) {
      setError(`❌ Failed to save: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setError('');
    setTestResult(null);
    setSheetHeaders([]);
    
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.apiKey,
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      
      const data = await res.json();
      setTestResult(data);
      setSheetHeaders(data.headers || []);
      setMessage('✅ Connection successful!');
    } catch (err) {
      setError(`❌ Connection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (mapping) => {
    console.log('📍 Mapping changed:', mapping);
    setConfig({ ...config, columnMapping: mapping });
  };

  const handleSaveMapping = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    
    console.log('💾 Saving mapping:', config.columnMapping);
    
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          configSavedBy: user?.displayName || 'Master User',
        }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to save mapping');
      }
      
      const data = await res.json();
      console.log('✅ Mapping saved:', data);
      setMessage('✅ Column mapping saved successfully! Ready to sync.');
      
      // ✅ Update persistence display
      if (data.config) {
        const savedDate = new Date(data.config.lastSavedTime);
        setLastSavedTime(savedDate.toLocaleString());
        setConfigSavedBy(data.config.configSavedBy);
      }
    } catch (err) {
      setError(`❌ Failed to save mapping: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    
    console.log('🔄 Starting sync with mapping:', config.columnMapping);
    
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      
      const data = await res.json();
      setSyncStatus(data.message);
      setMessage(`✅ Synced ${data.syncedCount} opportunities`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(`❌ Sync failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSyncedData = async () => {
    if (!confirm('⚠️ This will delete all synced Google Sheets data. Continue?')) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/google-sheets/clear`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setSyncStatus('');
      setMessage(`✅ Cleared ${data.deletedCount} synced records`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(`❌ Clear failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ✅ Config Persistence Display */}
      {lastSavedTime && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-sm">Configuration Saved</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lastSavedTime} by {configSavedBy}
                  </p>
                </div>
              </div>
              <Button onClick={loadConfig} variant="outline" size="sm">
                Reload Config
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="mapping" disabled={sheetHeaders.length === 0}>Column Mapping</TabsTrigger>
          <TabsTrigger value="sync">Sync & Data</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Google Sheets API Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Google Sheets API Key</label>
                <Input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="Enter your Google API key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Spreadsheet ID</label>
                <Input
                  value={config.spreadsheetId}
                  onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
                  placeholder="From Google Sheets URL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Sheet Name</label>
                <Input
                  value={config.sheetName}
                  onChange={(e) => setConfig({ ...config, sheetName: e.target.value })}
                  placeholder="e.g., Opportunities"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveConfig} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Configuration
                </Button>
                <Button onClick={handleTestConnection} disabled={loading || !config.apiKey} variant="outline">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Test Connection
                </Button>
              </div>
              {testResult && (
                <Alert>
                  <AlertDescription>
                    ✅ Found {testResult.columnCount} columns and {testResult.rowCount} data rows
                  </AlertDescription>
                </Alert>
              )}
              {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping">
          {sheetHeaders.length > 0 ? (
            <div className="space-y-4">
              <ColumnMappingUI 
                headers={sheetHeaders}
                onMappingChange={handleMappingChange}
                isLoading={loading}
              />
              <Button onClick={handleSaveMapping} disabled={loading} size="lg" className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Column Mapping
              </Button>
              {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Test your connection first in the "Configuration" tab
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="sync">
          <Card>
            <CardHeader>
              <CardTitle>Sync Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {syncStatus && (
                <Alert>
                  <AlertDescription>{syncStatus}</AlertDescription>
                </Alert>
              )}
              
              <Button onClick={handleSync} disabled={loading} size="lg" className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sync from Google Sheets
              </Button>
              <Button onClick={handleClearSyncedData} disabled={loading} variant="destructive" size="lg" className="w-full">
                Clear All Synced Data
              </Button>
              {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
