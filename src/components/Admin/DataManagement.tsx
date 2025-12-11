import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Trash2,
  Copy,
  Edit,
  Plus,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Save,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { LEAD_MAPPING, STATUS_MAPPING, GROUP_CLASSIFICATIONS } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';

interface CanonicalMapping {
  original: string;
  canonical: string;
  count: number;
}

const DataManagement = () => {
  const { opportunities, clearAllData, resetToMockData, isDataCleared } = useData();
  
  const [duplicates, setDuplicates] = useState<typeof opportunities>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [leadMappings, setLeadMappings] = useState<CanonicalMapping[]>(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach(opp => {
      const lead = opp.internalLead || 'Unassigned';
      counts[lead] = (counts[lead] || 0) + 1;
    });
    return Object.entries(LEAD_MAPPING).map(([original, canonical]) => ({
      original,
      canonical,
      count: counts[original] || 0,
    }));
  });
  const [newLeads, setNewLeads] = useState<string[]>([]);
  const [editingMapping, setEditingMapping] = useState<CanonicalMapping | null>(null);
  const [newCanonicalValue, setNewCanonicalValue] = useState('');

  // Scan for duplicates
  const scanDuplicates = () => {
    setIsScanning(true);
    setTimeout(() => {
      const seen = new Map<string, typeof opportunities[0]>();
      const dups: typeof opportunities = [];
      
      opportunities.forEach(opp => {
        const key1 = opp.opportunityRefNo;
        const key2 = `${opp.clientName?.toLowerCase()}-${opp.tenderName?.toLowerCase().slice(0, 50)}`;
        
        if (key1 && seen.has(key1)) {
          dups.push(opp);
        } else if (seen.has(key2)) {
          dups.push(opp);
        } else {
          if (key1) seen.set(key1, opp);
          seen.set(key2, opp);
        }
      });
      
      setDuplicates(dups);
      setIsScanning(false);
      toast.success(`Scan complete. Found ${dups.length} potential duplicates.`);
    }, 1500);
  };

  // Detect new lead names from data
  const detectNewLeads = () => {
    const existingLeads = new Set(Object.keys(LEAD_MAPPING).map(l => l.toLowerCase()));
    const detected: string[] = [];
    
    opportunities.forEach(opp => {
      const lead = opp.internalLead;
      if (lead && !existingLeads.has(lead.toLowerCase())) {
        if (!detected.includes(lead)) {
          detected.push(lead);
        }
        existingLeads.add(lead.toLowerCase());
      }
    });
    
    setNewLeads(detected);
    if (detected.length > 0) {
      toast.info(`Found ${detected.length} new lead names not in mappings`);
    } else {
      toast.success('All lead names are already mapped');
    }
  };

  // Add new lead to mapping
  const addLeadMapping = (lead: string, canonical: string) => {
    setLeadMappings(prev => [...prev, { original: lead, canonical, count: 1 }]);
    setNewLeads(prev => prev.filter(l => l !== lead));
    toast.success(`Added mapping: ${lead} → ${canonical}`);
  };

  // Update canonical mapping
  const updateMapping = () => {
    if (!editingMapping || !newCanonicalValue) return;
    
    setLeadMappings(prev => prev.map(m => 
      m.original === editingMapping.original 
        ? { ...m, canonical: newCanonicalValue }
        : m
    ));
    toast.success(`Updated mapping: ${editingMapping.original} → ${newCanonicalValue}`);
    setEditingMapping(null);
    setNewCanonicalValue('');
  };

  // Delete duplicate
  const deleteDuplicate = (id: string) => {
    setDuplicates(prev => prev.filter(d => d.id !== id));
    toast.success('Duplicate marked for deletion');
  };

  // Handle clear all data
  const handleClearAllData = () => {
    clearAllData();
    setDuplicates([]);
    setLeadMappings([]);
    setNewLeads([]);
    setEditingMapping(null);
    setNewCanonicalValue('');
    toast.success('All data cleared successfully');
  };

  // Handle reset to mock data
  const handleResetData = () => {
    resetToMockData();
    toast.success('Data reset to original mock data');
  };

  // Export mappings
  const exportMappings = () => {
    const data = {
      leadMappings: leadMappings.reduce((acc, m) => ({ ...acc, [m.original]: m.canonical }), {}),
      statusMappings: STATUS_MAPPING,
      groupClassifications: GROUP_CLASSIFICATIONS,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canonical-mappings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Mappings exported');
  };

  return (
    <div className="space-y-6">
      {/* Data Status */}
      {isDataCleared && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">All data has been cleared</span>
              </div>
              <Button variant="outline" onClick={handleResetData}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore Mock Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Actions Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Button variant="outline" onClick={scanDuplicates} disabled={isScanning || isDataCleared}>
          {isScanning ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
          Scan Duplicates
        </Button>
        <Button variant="outline" onClick={detectNewLeads} disabled={isDataCleared}>
          <Plus className="h-4 w-4 mr-2" />
          Detect New Leads
        </Button>
        <Button variant="outline" onClick={exportMappings}>
          <Download className="h-4 w-4 mr-2" />
          Export Mappings
        </Button>
        <Button variant="outline" onClick={handleResetData}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset Data
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all opportunity data including mock data. 
                You can restore mock data later using the "Reset Data" button.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAllData} className="bg-destructive text-destructive-foreground">
                Yes, Clear Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Current Data Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current records in database:</span>
            <Badge variant={opportunities.length > 0 ? "default" : "secondary"}>
              {opportunities.length} opportunities
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Duplicates Section */}
      {duplicates.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Duplicate Records ({duplicates.length})
            </CardTitle>
            <CardDescription>
              Review and delete duplicate entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref No.</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.map((dup) => (
                    <TableRow key={dup.id}>
                      <TableCell className="font-mono text-xs">{dup.opportunityRefNo || 'N/A'}</TableCell>
                      <TableCell>{dup.clientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{dup.tenderName}</TableCell>
                      <TableCell>${dup.opportunityValue?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteDuplicate(dup.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* New Leads Detection */}
      {newLeads.length > 0 && (
        <Card className="border-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-info">
              <Plus className="h-5 w-5" />
              New Lead Names Detected ({newLeads.length})
            </CardTitle>
            <CardDescription>
              These lead names were found in the data but not in your canonical mappings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {newLeads.map((lead) => (
                <div key={lead} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Badge variant="outline">{lead}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Enter canonical name"
                    className="max-w-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addLeadMapping(lead, (e.target as HTMLInputElement).value || lead);
                      }
                    }}
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => addLeadMapping(lead, lead)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Use As-Is
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead Mappings Editor */}
      {leadMappings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lead Name Mappings</CardTitle>
            <CardDescription>
              Edit how lead names are normalized in the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {leadMappings.slice(0, 30).map((mapping) => (
                  <div key={mapping.original} className="flex items-center gap-3 p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                    <code className="text-sm flex-1">{mapping.original}</code>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Badge variant="secondary" className="flex-shrink-0">{mapping.canonical}</Badge>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{mapping.count} uses</Badge>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setEditingMapping(mapping);
                            setNewCanonicalValue(mapping.canonical);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Mapping</DialogTitle>
                          <DialogDescription>
                            Change how "{mapping.original}" is displayed in the dashboard
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Original Value</Label>
                            <Input value={mapping.original} disabled />
                          </div>
                          <div className="space-y-2">
                            <Label>Canonical (Display) Value</Label>
                            <Input 
                              value={newCanonicalValue}
                              onChange={(e) => setNewCanonicalValue(e.target.value)}
                              placeholder="Enter display name"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={updateMapping}>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DataManagement;