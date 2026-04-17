import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Copy, Globe, MapPin, Plus, Search, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useClientStore } from '@/hooks/useClientStore';
import { useAuth } from '@/contexts/AuthContext';
import type { ClientContactInput, ClientInput, ClientProfile } from '@/types/client';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const safeQuery = escapeRegex(query);
  const queryLower = query.toLowerCase();
  const regex = new RegExp(`(${safeQuery})`, 'gi');
  const parts = String(text || '').split(regex);
  return parts.map((part, idx) =>
    part.toLowerCase() === queryLower ? (
      <mark key={`${part}-${idx}`} className="bg-yellow-200/70 text-foreground px-1 rounded-sm">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  );
};

const buildSearchBlob = (client: ClientProfile) => {
  const contactBlob = client.contacts
    .map((contact) => [contact.firstName, contact.lastName, contact.email, contact.phone].join(' '))
    .join(' ');
  return [
    client.companyName,
    client.domain,
    client.group,
    client.location.city,
    client.location.country,
    contactBlob,
  ]
    .join(' ')
    .toLowerCase();
};

const countMatches = (client: ClientProfile, query: string) => {
  if (!query) return 0;
  const blob = buildSearchBlob(client);
  const needle = query.toLowerCase();
  if (!needle.trim()) return 0;
  let count = 0;
  let idx = blob.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = blob.indexOf(needle, idx + needle.length);
  }
  return count;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let current: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      current.push(value.trim());
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (value || current.length > 0) {
        current.push(value.trim());
        value = '';
      }
      if (current.length > 0) rows.push(current);
      current = [];
      if (char === '\r' && next === '\n') i += 1;
      continue;
    }

    value += char;
  }

  if (value || current.length > 0) {
    current.push(value.trim());
  }
  if (current.length > 0) rows.push(current);
  return rows;
};

const normalizeHeader = (value: string) =>
  String(value || '')
    .replace(/\\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const HEADER_SYNONYMS: Record<string, string[]> = {
  companyName: ['companyname', 'company', 'client', 'clientname', 'account', 'accountname', 'organisation', 'organization'],
  city: ['city', 'town'],
  country: ['country', 'nation', 'regioncountry'],
  domain: ['domain', 'website', 'web', 'url'],
  firstName: ['firstname', 'first', 'givenname', 'contactfirstname'],
  lastName: ['lastname', 'last', 'surname', 'familyname', 'contactlastname'],
  email: ['email', 'emailaddress', 'mail', 'contactemail'],
  phone: ['phone', 'phonenumber', 'telephone', 'mobile', 'contactphone'],
};

const detectHeaderRow = (rows: string[][]) => {
  let bestRowIndex = 0;
  let bestScore = -1;
  let bestMap: Record<string, number> = {};

  const scanLimit = Math.min(rows.length, 10);
  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map((cell) => normalizeHeader(cell));
    const map: Record<string, number> = {};
    let score = 0;

    Object.entries(HEADER_SYNONYMS).forEach(([key, variants]) => {
      const idx = normalized.findIndex((cell) => variants.includes(cell));
      if (idx >= 0) {
        map[key] = idx;
        score += 1;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = i;
      bestMap = map;
    }
  }

  return { headerRowIndex: bestRowIndex, map: bestMap, score: bestScore };
};

const mapCsvRows = (rows: string[][]): ClientInput[] => {
  if (!rows.length) return [];
  const { headerRowIndex, map, score } = detectHeaderRow(rows);
  const dataRows = rows.slice(headerRowIndex + 1);

  const idxCompany = map.companyName ?? -1;
  const idxCity = map.city ?? -1;
  const idxCountry = map.country ?? -1;
  const idxDomain = map.domain ?? -1;
  const idxFirst = map.firstName ?? -1;
  const idxLast = map.lastName ?? -1;
  const idxEmail = map.email ?? -1;
  const idxPhone = map.phone ?? -1;

  const hasHeader = score >= 2 && idxCompany >= 0;
  const fallbackIndices = rows[0]?.length >= 8 ? { idxCompany: 0, idxCity: 1, idxCountry: 2, idxDomain: 3, idxFirst: 4, idxLast: 5, idxEmail: 6, idxPhone: 7 } : null;

  if (!hasHeader && !fallbackIndices) return [];

  return dataRows.map((row) => {
    const companyIndex = hasHeader ? idxCompany : fallbackIndices!.idxCompany;
    const cityIndex = hasHeader ? idxCity : fallbackIndices!.idxCity;
    const countryIndex = hasHeader ? idxCountry : fallbackIndices!.idxCountry;
    const domainIndex = hasHeader ? idxDomain : fallbackIndices!.idxDomain;
    const firstIndex = hasHeader ? idxFirst : fallbackIndices!.idxFirst;
    const lastIndex = hasHeader ? idxLast : fallbackIndices!.idxLast;
    const emailIndex = hasHeader ? idxEmail : fallbackIndices!.idxEmail;
    const phoneIndex = hasHeader ? idxPhone : fallbackIndices!.idxPhone;

    const contact: ClientContactInput = {
      firstName: row[firstIndex] || '',
      lastName: row[lastIndex] || '',
      email: row[emailIndex] || '',
      phone: row[phoneIndex] || '',
    };

    return {
      companyName: row[companyIndex] || '',
      domain: row[domainIndex] || '',
      city: row[cityIndex] || '',
      country: row[countryIndex] || '',
      contacts: contact.firstName || contact.lastName || contact.email || contact.phone ? [contact] : [],
    };
  });
};

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      toast.error('Copy failed');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-7 w-7 rounded border border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground transition"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  );
};

const Clients = () => {
  const { clients, stats, addClient, importClients, updateClient, normalizeCompanyName, isLoading, error, refreshClients } = useClientStore();
  const { canPerformAction } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canManageClients = canPerformAction('clients_import');
  const canEditClients = canPerformAction('clients_write');
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<{ attempted: number; created: number; updated: number; at: string } | null>(null);
  const [filters, setFilters] = useState<{ domains: string[]; countries: string[] }>({ domains: [], countries: [] });

  const [newClient, setNewClient] = useState<ClientInput>({
    companyName: '',
    group: '',
    domain: '',
    city: '',
    country: '',
    contacts: [{ firstName: '', lastName: '', email: '', phone: '' }],
  });
  const [editClient, setEditClient] = useState<{ id: string; data: ClientInput } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editClientId = params.get('editClientId') || '';
    if (!editClientId) return;
    if (clients.length === 0) return;

    const match = clients.find((client) => String(client.id || '').trim() === editClientId.trim()) || null;
    if (!match) return;

    setSelectedClient(match);
    setIsDetailOpen(false);
    setEditClient({
      id: match.id,
      data: {
        companyName: match.companyName,
        group: match.group || '',
        domain: match.domain || '',
        city: match.location.city || '',
        country: match.location.country || '',
        contacts: match.contacts.map((contact) => ({
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          email: contact.email || '',
          phone: contact.phone || '',
        })),
      },
    });
    setIsEditOpen(true);

    params.delete('editClientId');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [clients, location.pathname, location.search, navigate]);

  const topFilters = useMemo(() => {
    const domainCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    clients.forEach((client) => {
      const domainKey = client.domain || client.group || '';
      if (domainKey) domainCounts.set(domainKey, (domainCounts.get(domainKey) || 0) + 1);
      if (client.location.country) {
        countryCounts.set(client.location.country, (countryCounts.get(client.location.country) || 0) + 1);
      }
    });
    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([value, count]) => ({ value, count }));
    const topCountries = Array.from(countryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([value, count]) => ({ value, count }));
    return { topDomains, topCountries };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients.filter((client) => {
      const domainKey = client.domain || client.group || '';
      if (filters.domains.length > 0 && !filters.domains.includes(domainKey)) return false;
      if (filters.countries.length > 0 && !filters.countries.includes(client.location.country)) return false;
      if (!query) return true;
      return buildSearchBlob(client).includes(query);
    });
  }, [clients, filters, search]);

  const handleCardClick = (client: ClientProfile) => {
    setSelectedClient(client);
    setIsDetailOpen(true);
  };

  const toggleFilter = (type: 'domains' | 'countries', value: string) => {
    setFilters((prev) => {
      const exists = prev[type].includes(value);
      return {
        ...prev,
        [type]: exists ? prev[type].filter((item) => item !== value) : [...prev[type], value],
      };
    });
  };

  const handleDownloadTemplate = () => {
    const headers = ['Company Name', 'City', 'Country', 'Domain', 'First Name', 'Last Name', 'Email', 'Phone'];
    const example = [
      ['Acme Corp', 'Dubai', 'UAE', 'acme.com', 'Sara', 'Ali', 'sara@acme.com', '+971 50 000 0000'],
      ['Acme Corp', 'Dubai', 'UAE', 'acme.com', 'Omar', 'Hassan', 'omar@acme.com', '+971 55 000 0000'],
    ];
    const csv = [headers.join(','), ...example.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'client-import-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    if (!canManageClients) {
      toast.error('You do not have permission to import clients');
      return;
    }
    setIsImporting(true);
    try {
      console.log('[clients.import] start', {
        fileName: file.name,
        sizeBytes: file.size,
        type: file.type,
        timestamp: new Date().toISOString(),
      });
      const text = await file.text();
      const rows = parseCsv(text);
      console.log('[clients.import] csv-parsed', { rows: rows.length });
      if (rows.length < 2) {
        toast.error('No rows found in the CSV file');
        return;
      }
      const inputs = mapCsvRows(rows).filter((row) => row.companyName.trim());
      console.log('[clients.import] mapped-inputs', { totalMapped: inputs.length });
      if (!inputs.length) {
        toast.error('CSV headers are missing or no valid client rows found');
        return;
      }
      const result = await importClients(inputs);
      const created = Number((result as { created?: number })?.created || 0);
      const updated = Number((result as { updated?: number })?.updated || 0);
      const summary = { attempted: inputs.length, created, updated, at: new Date().toISOString() };
      setLastImportSummary(summary);
      console.log('[clients.import] completed', summary);
      toast.success(`Imported ${inputs.length} rows (created ${created}, updated ${updated})`);
      setIsImportOpen(false);
    } catch (err) {
      console.error('[clients.import.error]', err);
      toast.error((err as Error).message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddClient = async () => {
    if (!canEditClients) {
      toast.error('You do not have permission to add clients');
      return;
    }
    if (!newClient.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    const cleanedContacts = newClient.contacts.filter((contact) =>
      [contact.firstName, contact.lastName, contact.email, contact.phone].some((value) => String(value || '').trim())
    );
    setIsSavingClient(true);
    try {
      await addClient({
        ...newClient,
        companyName: normalizeCompanyName(newClient.companyName),
        contacts: cleanedContacts,
      });
      setNewClient({
        companyName: '',
        group: '',
        domain: '',
        city: '',
        country: '',
        contacts: [{ firstName: '', lastName: '', email: '', phone: '' }],
      });
      setIsAddOpen(false);
      toast.success('Client added');
    } catch (err) {
      console.error('[clients.add.error]', err);
      toast.error((err as Error).message || 'Failed to add client');
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleStartEdit = (client: ClientProfile) => {
    setEditClient({
      id: client.id,
      data: {
        companyName: client.companyName,
        group: client.group || '',
        domain: client.domain || '',
        city: client.location.city || '',
        country: client.location.country || '',
        contacts: client.contacts.map((contact) => ({
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          email: contact.email || '',
          phone: contact.phone || '',
        })),
      },
    });
    setIsEditOpen(true);
  };

  const handleUpdateClient = async () => {
    if (!editClient) return;
    if (!canEditClients) {
      toast.error('You do not have permission to edit clients');
      return;
    }
    if (!editClient.data.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    const cleanedContacts = editClient.data.contacts.filter((contact) =>
      [contact.firstName, contact.lastName, contact.email, contact.phone].some((value) => String(value || '').trim())
    );
    setIsSavingClient(true);
    try {
      await updateClient(editClient.id, {
        ...editClient.data,
        companyName: normalizeCompanyName(editClient.data.companyName),
        contacts: cleanedContacts,
      });
      toast.success('Client updated');
      setIsEditOpen(false);
    } catch (err) {
      console.error('[clients.update.error]', err);
      toast.error((err as Error).message || 'Failed to update client');
    } finally {
      setIsSavingClient(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground">Vendor-style directory of client profiles and contacts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageClients && (
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Import Clients</DialogTitle>
                <DialogDescription>
                  Download the template and drop your completed CSV to merge clients by company name.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={handleDownloadTemplate} className="w-fit">
                    Download CSV Template
                  </Button>
                  <Button
                    variant="outline"
                    className="w-fit"
                    disabled={isImporting}
                    onClick={async () => {
                      try {
                        console.log('[clients.import] verify-refresh.start', { timestamp: new Date().toISOString() });
                        await refreshClients();
                        console.log('[clients.import] verify-refresh.done', { clientsCount: clients.length, timestamp: new Date().toISOString() });
                        toast.success('Client list refreshed from server');
                      } catch (error) {
                        console.error('[clients.import] verify-refresh.error', error);
                        toast.error((error as Error).message || 'Failed to refresh clients');
                      }
                    }}
                  >
                    Verify Upload (Refresh)
                  </Button>
                </div>
                {lastImportSummary ? (
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Last import: attempted {lastImportSummary.attempted}, created {lastImportSummary.created}, updated {lastImportSummary.updated}
                    {' '}at {new Date(lastImportSummary.at).toLocaleString()}
                  </div>
                ) : null}
                <div
                  className="border border-dashed border-border/50 rounded-lg p-6 text-center bg-muted/30"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    if (isImporting) return;
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) handleImportFile(file);
                  }}
                >
                  <p className="text-sm text-muted-foreground">
                    {isImporting ? 'Importing CSV...' : 'Drag and drop CSV here, or click to upload.'}
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    className="mt-3 block w-full text-sm"
                    disabled={isImporting}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleImportFile(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Merge behavior example</p>
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Company Name</th>
                          <th className="p-2 text-left">City</th>
                          <th className="p-2 text-left">Country</th>
                          <th className="p-2 text-left">Domain</th>
                          <th className="p-2 text-left">First Name</th>
                          <th className="p-2 text-left">Last Name</th>
                          <th className="p-2 text-left">Email</th>
                          <th className="p-2 text-left">Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border/50">
                          <td className="p-2">Acme Corp</td>
                          <td className="p-2">Dubai</td>
                          <td className="p-2">UAE</td>
                          <td className="p-2">acme.com</td>
                          <td className="p-2">Sara</td>
                          <td className="p-2">Ali</td>
                          <td className="p-2">sara@acme.com</td>
                          <td className="p-2">+971 50 000 0000</td>
                        </tr>
                        <tr className="border-t border-border/50">
                          <td className="p-2">ACME CORP</td>
                          <td className="p-2">Dubai</td>
                          <td className="p-2">UAE</td>
                          <td className="p-2">acme.com</td>
                          <td className="p-2">Omar</td>
                          <td className="p-2">Hassan</td>
                          <td className="p-2">omar@acme.com</td>
                          <td className="p-2">+971 55 000 0000</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Both rows merge into a single client with two contacts because company names are normalized to title-case.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          )}

          {canManageClients && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Client
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Client</DialogTitle>
                <DialogDescription>Create a new client profile and add contacts.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input
                      value={newClient.companyName}
                      onChange={(event) => setNewClient({ ...newClient, companyName: event.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Group</Label>
                    <Input
                      value={newClient.group || ''}
                      onChange={(event) => setNewClient({ ...newClient, group: event.target.value })}
                      placeholder="GES / GDS / GTS"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Domain</Label>
                    <Input
                      value={newClient.domain}
                      onChange={(event) => setNewClient({ ...newClient, domain: event.target.value })}
                      placeholder="acme.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={newClient.city}
                      onChange={(event) => setNewClient({ ...newClient, city: event.target.value })}
                      placeholder="Dubai"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input
                      value={newClient.country}
                      onChange={(event) => setNewClient({ ...newClient, country: event.target.value })}
                      placeholder="UAE"
                    />
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Contacts</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setNewClient((prev) => ({
                          ...prev,
                          contacts: [...prev.contacts, { firstName: '', lastName: '', email: '', phone: '' }],
                        }))
                      }
                    >
                      Add Contact
                    </Button>
                  </div>
                  {newClient.contacts.map((contact, idx) => (
                    <div key={`contact-${idx}`} className="grid gap-3 md:grid-cols-4 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">First Name</Label>
                        <Input
                          value={contact.firstName}
                          onChange={(event) => {
                            const updated = [...newClient.contacts];
                            updated[idx] = { ...updated[idx], firstName: event.target.value };
                            setNewClient({ ...newClient, contacts: updated });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last Name</Label>
                        <Input
                          value={contact.lastName}
                          onChange={(event) => {
                            const updated = [...newClient.contacts];
                            updated[idx] = { ...updated[idx], lastName: event.target.value };
                            setNewClient({ ...newClient, contacts: updated });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input
                          value={contact.email}
                          onChange={(event) => {
                            const updated = [...newClient.contacts];
                            updated[idx] = { ...updated[idx], email: event.target.value };
                            setNewClient({ ...newClient, contacts: updated });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          value={contact.phone}
                          onChange={(event) => {
                            const updated = [...newClient.contacts];
                            updated[idx] = { ...updated[idx], phone: event.target.value };
                            setNewClient({ ...newClient, contacts: updated });
                          }}
                        />
                      </div>
                      {newClient.contacts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = newClient.contacts.filter((_, i) => i !== idx);
                            setNewClient({ ...newClient, contacts: updated });
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddClient} disabled={isSavingClient}>{isSavingClient ? 'Saving...' : 'Save Client'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border border-border/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Clients</p>
            <p className="text-2xl font-bold text-foreground">{stats.totalClients}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">With Contacts</p>
            <p className="text-2xl font-bold text-foreground">{stats.withContacts}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Contacts</p>
            <p className="text-2xl font-bold text-foreground">{stats.totalContacts}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Domains</p>
            <p className="text-2xl font-bold text-foreground">{stats.domains}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies, domains, locations, or contacts..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-12 pl-11 bg-card border-border/50"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.domains.length > 0 || filters.countries.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ domains: [], countries: [] })}
            >
              Clear Filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">Top Domains</p>
          {topFilters.topDomains.map((item) => (
            <Badge
              key={item.value}
              onClick={() => toggleFilter('domains', item.value)}
              className={`cursor-pointer border border-border/50 ${filters.domains.includes(item.value) ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground'}`}
            >
              {item.value} ({item.count})
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">Top Countries</p>
          {topFilters.topCountries.map((item) => (
            <Badge
              key={item.value}
              onClick={() => toggleFilter('countries', item.value)}
              className={`cursor-pointer border border-border/50 ${filters.countries.includes(item.value) ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground'}`}
            >
              {item.value} ({item.count})
            </Badge>
          ))}
        </div>
      </div>

      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        style={{ perspective: '1000px' }}
      >
        {isLoading && (
          <Card className="border border-border/50 bg-card p-6 text-sm text-muted-foreground">
            Loading clients from MongoDB...
          </Card>
        )}
        {error && !isLoading && (
          <Card className="border border-border/50 bg-card p-6 text-sm text-destructive">
            {error}
          </Card>
        )}
        {filteredClients.map((client) => {
          const firstContact = client.contacts[0];
          const domainDisplay = client.domain || client.group || 'No domain';
          const matchCount = countMatches(client, search);
          return (
            <Card
              key={client.id}
              onClick={() => handleCardClick(client)}
              className="group relative cursor-pointer overflow-hidden border border-border/50 bg-card transform-gpu transition-all hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01]"
            >
              <div className="h-1 w-full bg-gradient-to-r from-primary via-info to-accent" />
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary">
                    {highlightText(client.companyName, search)}
                  </CardTitle>
                  {search.trim() && matchCount > 0 && (
                    <Badge variant="secondary">{matchCount} matches</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    {highlightText(domainDisplay, search)}
                  </span>
                  <Badge className="flex items-center gap-1 bg-muted/30 text-muted-foreground border border-border/50">
                    <MapPin className="h-3 w-3" />
                    {highlightText(
                      client.location.city || client.location.country
                        ? `${client.location.city}${client.location.city && client.location.country ? ', ' : ''}${client.location.country}`
                        : 'Unknown location',
                      search
                    )}
                  </Badge>
                  <Badge className="bg-primary/10 text-primary border border-border/50">
                    {client.contacts.length} contacts
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Primary contact</p>
                <p className="text-sm font-medium text-foreground">
                  {firstContact
                    ? highlightText(`${firstContact.firstName} ${firstContact.lastName}`.trim() || 'Unnamed contact', search)
                    : 'No contacts yet'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl">
          {selectedClient && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-gradient-to-br from-primary/5 via-info/5 to-accent/5 p-4">
                <DialogHeader>
                  <DialogTitle className="text-xl text-foreground">{selectedClient.companyName}</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {(selectedClient.domain || selectedClient.group || 'No domain')} • {selectedClient.location.city || 'Unknown city'}{' '}
                    {selectedClient.location.country ? `, ${selectedClient.location.country}` : ''}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-border/50 bg-card p-3">
                    <p className="text-xs text-muted-foreground">Domain</p>
                    <p className="text-sm font-medium text-foreground">{selectedClient.domain || selectedClient.group || 'N/A'}</p>
                  </div>
                  <div className="rounded border border-border/50 bg-card p-3">
                    <p className="text-xs text-muted-foreground">City</p>
                    <p className="text-sm font-medium text-foreground">{selectedClient.location.city || 'N/A'}</p>
                  </div>
                  <div className="rounded border border-border/50 bg-card p-3">
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="text-sm font-medium text-foreground">{selectedClient.location.country || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Contacts</p>
                  <Badge className="bg-primary/10 text-primary border border-border/50">
                    {selectedClient.contacts.length} total
                  </Badge>
                </div>
                <ScrollArea className="h-64 rounded-lg border border-border/50 bg-card">
                  <div className="divide-y divide-border/50">
                    {selectedClient.contacts.map((contact) => (
                      <div key={contact.id} className="p-3 grid gap-2 md:grid-cols-3 items-center">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {contact.firstName} {contact.lastName}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground truncate">{contact.email || 'No email'}</p>
                          <CopyButton value={contact.email} label="Email" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground truncate">{contact.phone || 'No phone'}</p>
                          <CopyButton value={contact.phone} label="Phone" />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {canEditClients && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => handleStartEdit(selectedClient)}>Edit</Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client details and contacts.</DialogDescription>
          </DialogHeader>
          {editClient && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input
                    value={editClient.data.companyName}
                    onChange={(event) => setEditClient({ ...editClient, data: { ...editClient.data, companyName: event.target.value } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Group</Label>
                  <Input
                    value={editClient.data.group || ''}
                    onChange={(event) => setEditClient({ ...editClient, data: { ...editClient.data, group: event.target.value } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Input
                    value={editClient.data.domain}
                    onChange={(event) => setEditClient({ ...editClient, data: { ...editClient.data, domain: event.target.value } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={editClient.data.city}
                    onChange={(event) => setEditClient({ ...editClient, data: { ...editClient.data, city: event.target.value } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={editClient.data.country}
                    onChange={(event) => setEditClient({ ...editClient, data: { ...editClient.data, country: event.target.value } })}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Contacts</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditClient({
                        ...editClient,
                        data: { ...editClient.data, contacts: [...editClient.data.contacts, { firstName: '', lastName: '', email: '', phone: '' }] },
                      })
                    }
                  >
                    Add Contact
                  </Button>
                </div>
                {editClient.data.contacts.map((contact, idx) => (
                  <div key={`edit-contact-${idx}`} className="grid gap-3 md:grid-cols-4 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name</Label>
                      <Input
                        value={contact.firstName}
                        onChange={(event) => {
                          const updated = [...editClient.data.contacts];
                          updated[idx] = { ...updated[idx], firstName: event.target.value };
                          setEditClient({ ...editClient, data: { ...editClient.data, contacts: updated } });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name</Label>
                      <Input
                        value={contact.lastName}
                        onChange={(event) => {
                          const updated = [...editClient.data.contacts];
                          updated[idx] = { ...updated[idx], lastName: event.target.value };
                          setEditClient({ ...editClient, data: { ...editClient.data, contacts: updated } });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        value={contact.email}
                        onChange={(event) => {
                          const updated = [...editClient.data.contacts];
                          updated[idx] = { ...updated[idx], email: event.target.value };
                          setEditClient({ ...editClient, data: { ...editClient.data, contacts: updated } });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={contact.phone}
                        onChange={(event) => {
                          const updated = [...editClient.data.contacts];
                          updated[idx] = { ...updated[idx], phone: event.target.value };
                          setEditClient({ ...editClient, data: { ...editClient.data, contacts: updated } });
                        }}
                      />
                    </div>
                    {editClient.data.contacts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = editClient.data.contacts.filter((_, i) => i !== idx);
                          setEditClient({ ...editClient, data: { ...editClient.data, contacts: updated } });
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsEditOpen(false)} disabled={isSavingClient}>Cancel</Button>
            <Button onClick={handleUpdateClient} disabled={isSavingClient}>{isSavingClient ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Clients;
