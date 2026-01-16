import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, RefreshCw, Link2, Check, ArrowRight, AlertCircle, Table2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';

interface ColumnMapping {
  sheetColumn: string;
  dashboardField: string;
}

interface SheetConnection {
  apiKey: string;
  spreadsheetId: string;
  sheetName: string;
  mappings: ColumnMapping[];
  connectedAt: string;
}

const DASHBOARD_FIELDS = [
  { value: 'opportunityRefNo', label: 'Reference No.' },
  { value: 'tenderNo', label: 'Tender No.' },
  { value: 'tenderName', label: 'Tender Name' },
  { value: 'tenderType', label: 'Type (EOI/Tender)' },
  { value: 'clientName', label: 'Client Name' },
  { value: 'clientType', label: 'Client Type' },
  { value: 'clientLead', label: 'Client Lead' },
  { value: 'opportunityClassification', label: 'Classification' },
  { value: 'opportunityStatus', label: 'Status' },
  { value: 'groupClassification', label: 'Group (GTS/GDS/GES/GTN)' },
  { value: 'domainSubGroup', label: 'Domain Sub-Group' },
  { value: 'internalLead', label: 'Internal Lead' },
  { value: 'opportunityValue', label: 'Tender Value' },
  { value: 'probability', label: 'Probability (%)' },
  { value: 'dateTenderReceived', label: 'RFP Received Date' },
  { value: 'tenderPlannedSubmissionDate', label: 'Planned Submission Date' },
  { value: 'tenderSubmittedDate', label: 'Submitted Date' },
  { value: 'partnerInvolvement', label: 'Partner Involvement' },
  { value: 'partnerName', label: 'Partner Name' },
  { value: 'country', label: 'Country' },
  { value: 'remarks', label: 'Remarks' },
  { value: 'awardStatus', label: 'Award Status' },
  { value: 'bidNoBid', label: 'Bid/No Bid' },
  { value: 'qualificationStatus', label: 'Qualification Status' },
  { value: 'skip', label: '-- Skip this column --' },
];

export default function GoogleSheetsSync() {
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [savedConnection, setSavedConnection] = useState<SheetConnection | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { refreshFromSheets } = useData();

  // Load saved connection on mount
  useEffect(() => {
    const saved = localStorage.getItem('gsheets_connection');
    if (saved) {
      try {
        const conn: SheetConnection = JSON.parse(saved);
        setSavedConnection(conn);
        setApiKey(conn.apiKey);
        setSpreadsheetId(conn.spreadsheetId);
        setSheetName(conn.sheetName);
        setColumnMappings(conn.mappings);
        setIsConnected(true);
      } catch {
        // ignore
      }
    }
  }, []);

  const extractSpreadsheetId = (input: string): string => {
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) return urlMatch[1];
    return input.trim();
  };

  const fetchSheetHeaders = async (): Promise<string[]> => {
    const id = extractSpreadsheetId(spreadsheetId);
    const range = sheetName ? `${sheetName}!1:1` : 'Sheet1!1:1';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Failed to fetch headers (${res.status})`);
    }
    const data = await res.json();
    const headers: string[] = data.values?.[0] || [];
    return headers.filter((h: string) => h && h.trim() !== '');
  };

  const fetchSheetData = async (): Promise<Record<string, string>[]> => {
    const id = extractSpreadsheetId(spreadsheetId);
    const range = sheetName ? `${sheetName}` : 'Sheet1';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Failed to fetch data (${res.status})`);
    }
    const data = await res.json();
    const rows: string[][] = data.values || [];
    if (rows.length < 2) return [];

    const headers = rows[0];
    const result: Record<string, string>[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] || '';
      });
      result.push(obj);
    }
    return result;
  };

  const handleConnect = async () => {
    if (!apiKey || !spreadsheetId) {
      toast.error('Please enter API Key and Spreadsheet ID');
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      const headers = await fetchSheetHeaders();
      if (headers.length === 0) {
        throw new Error('No column headers found in the first row');
      }
      setDetectedColumns(headers);
      // Auto-suggest mappings
      setColumnMappings(headers.map(col => {
        const suggestion = autoSuggestMapping(col);
        return { sheetColumn: col, dashboardField: suggestion };
      }));
      setShowMappingDialog(true);
    } catch (err: any) {
      console.error('Google Sheets connect error:', err);
      setFetchError(err.message || 'Failed to connect');
      toast.error(err.message || 'Failed to connect to Google Sheets');
    } finally {
      setIsLoading(false);
    }
  };

  const autoSuggestMapping = (colName: string): string => {
    const lower = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hints: Record<string, string> = {
      'refno': 'opportunityRefNo',
      'referenceno': 'opportunityRefNo',
      'tenderno': 'tenderNo',
      'tendername': 'tenderName',
      'name': 'tenderName',
      'type': 'opportunityClassification',
      'client': 'clientName',
      'clientname': 'clientName',
      'status': 'opportunityStatus',
      'group': 'groupClassification',
      'lead': 'internalLead',
      'internallead': 'internalLead',
      'value': 'opportunityValue',
      'tendervalue': 'opportunityValue',
      'probability': 'probability',
      'prob': 'probability',
      'rfpdate': 'dateTenderReceived',
      'rfpreceived': 'dateTenderReceived',
      'submissiondate': 'tenderPlannedSubmissionDate',
      'plannedsubmission': 'tenderPlannedSubmissionDate',
      'submitteddate': 'tenderSubmittedDate',
      'partner': 'partnerName',
      'country': 'country',
      'remarks': 'remarks',
      'bidstatus': 'bidNoBid',
      'bidnobid': 'bidNoBid',
      'qualification': 'qualificationStatus',
    };
    return hints[lower] || 'skip';
  };

  const handleMappingChange = (sheetColumn: string, dashboardField: string) => {
    setColumnMappings(prev =>
      prev.map(m =>
        m.sheetColumn === sheetColumn
          ? { ...m, dashboardField }
          : m
      )
    );
  };

  const handleApplyMapping = async () => {
    const mappedCount = columnMappings.filter(m => m.dashboardField !== 'skip').length;

    if (mappedCount === 0) {
      toast.error('Please map at least one column');
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      // Fetch actual data
      const rawData = await fetchSheetData();

      // Transform using mappings
      const transformed = rawData.map((row, idx) => {
        const obj: Record<string, any> = { id: `sheet-${idx}` };
        columnMappings.forEach(m => {
          if (m.dashboardField !== 'skip') {
            let val: any = row[m.sheetColumn] ?? '';
            // Parse numbers for value/probability
            if (m.dashboardField === 'opportunityValue') {
              val = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
            } else if (m.dashboardField === 'probability') {
              val = parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
            }
            obj[m.dashboardField] = val;
          }
        });
        return obj;
      });

      // Save connection
      const connection: SheetConnection = {
        apiKey,
        spreadsheetId: extractSpreadsheetId(spreadsheetId),
        sheetName,
        mappings: columnMappings,
        connectedAt: new Date().toISOString(),
      };
      localStorage.setItem('gsheets_connection', JSON.stringify(connection));
      setSavedConnection(connection);

      // Update data context
      refreshFromSheets(transformed);

      setShowMappingDialog(false);
      setIsConnected(true);
      toast.success(`Imported ${transformed.length} records with ${mappedCount} mapped columns`);
    } catch (err: any) {
      console.error('Import error:', err);
      setFetchError(err.message || 'Failed to import data');
      toast.error(err.message || 'Failed to import data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!savedConnection) {
      toast.error('No saved connection');
      return;
    }
    setIsLoading(true);
    setFetchError(null);

    try {
      const rawData = await fetchSheetData();
      const transformed = rawData.map((row, idx) => {
        const obj: Record<string, any> = { id: `sheet-${idx}` };
        savedConnection.mappings.forEach(m => {
          if (m.dashboardField !== 'skip') {
            let val: any = row[m.sheetColumn] ?? '';
            if (m.dashboardField === 'opportunityValue') {
              val = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
            } else if (m.dashboardField === 'probability') {
              val = parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
            }
            obj[m.dashboardField] = val;
          }
        });
        return obj;
      });
      refreshFromSheets(transformed);
      toast.success(`Synced ${transformed.length} records`);
    } catch (err: any) {
      console.error('Sync error:', err);
      setFetchError(err.message || 'Sync failed');
      toast.error(err.message || 'Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setApiKey('');
    setSpreadsheetId('');
    setSheetName('');
    setColumnMappings([]);
    setSavedConnection(null);
    localStorage.removeItem('gsheets_connection');
    toast.info('Disconnected from Google Sheets');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5 text-success" />
            Google Sheets Sync
          </CardTitle>
          <CardDescription>
            Connect to Google Sheets to sync tender data automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fetchError && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {!isConnected ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="api-key">Google Sheets API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter your API key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="underline">
                    Google Cloud Console
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spreadsheet-id">Spreadsheet ID or URL</Label>
                <Input
                  id="spreadsheet-id"
                  placeholder="Enter Spreadsheet ID or paste full URL..."
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  From URL: docs.google.com/spreadsheets/d/<span className="font-mono text-primary">SPREADSHEET_ID</span>/edit
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sheet-name">Sheet Name (Tab)</Label>
                <Input
                  id="sheet-name"
                  placeholder="e.g., Sheet1, Tenders, Data..."
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the first sheet
                </p>
              </div>

              <Button
                onClick={handleConnect}
                disabled={isLoading || !apiKey || !spreadsheetId}
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect & Configure
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                <Check className="h-5 w-5 text-success" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Spreadsheet ID: {extractSpreadsheetId(spreadsheetId).substring(0, 20)}...
                  </p>
                </div>
                <Badge variant="outline" className="text-success border-success">
                  {columnMappings.filter(m => m.dashboardField !== 'skip').length} columns mapped
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSync} disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                <Button variant="outline" onClick={() => setShowMappingDialog(true)}>
                  <Table2 className="h-4 w-4 mr-2" />
                  Edit Mappings
                </Button>
                <Button variant="destructive" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Mapping Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="h-5 w-5" />
              Map Sheet Columns to Dashboard Fields
            </DialogTitle>
            <DialogDescription>
              Select which dashboard field each sheet column should map to. Use "Skip" to ignore a column.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {detectedColumns.map((column, index) => (
                <div key={column} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{column}</p>
                    <p className="text-xs text-muted-foreground">Column {String.fromCharCode(65 + index)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Select
                    value={columnMappings.find(m => m.sheetColumn === column)?.dashboardField || 'skip'}
                    onValueChange={(value) => handleMappingChange(column, value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DASHBOARD_FIELDS.map(field => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Separator />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>
              {columnMappings.filter(m => m.dashboardField !== 'skip').length} of {detectedColumns.length} columns will be imported
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyMapping} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Apply Mapping & Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
