import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { AlertTriangle, BarChart3, BriefcaseBusiness, Briefcase, Building2, CalendarDays, Database, FileCheck2, Globe, LayoutGrid, LayoutList, Plus, Search, SearchX, Upload, Users, TrendingUp, Handshake, Target, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { STAGE_ORDER } from '@/data/opportunityData';
import { normalizeCanonicalStatus, getDisplayStatus } from '@/lib/opportunityStatus';
import { toast } from 'sonner';
import {
  BD_ENGAGEMENTS_SEED,
  BDEngagement,
  MEETING_TYPES,
  createBDEngagementId,
} from '@/lib/bdEngagements';
import { downloadWorkbook, getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToMatrix } from '@/lib/excelWorkbook';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { motion } from 'framer-motion';
import { staggerGrid, cardVariant, rowVariant } from '@/lib/animations';
const API_URL = import.meta.env.VITE_API_URL || '/api';

type MeetingTypeOption = typeof MEETING_TYPES[number];

type FormState = {
  ref: string;
  date: string;
  clientName: string;
  meetingType: string;
  status: string;
  location: string;
  discussionPoints: string;
  reportSubmitted: boolean;
  leadGenerated: boolean;
  focalPerson: string;
  designation: string;
  email: string;
  mobileNumber: string;
  leadDescription: string;
  nextSteps: string;
  lastContact: string;
};

const DASHBOARD_COLORS = ['#2dd4bf', '#818cf8', '#f59e0b', '#34d399', '#fb7185', '#38bdf8'];

const emptyForm: FormState = {
  ref: '',
  date: '',
  clientName: '',
  meetingType: MEETING_TYPES[0],
  status: 'Open',
  location: '',
  discussionPoints: '',
  reportSubmitted: false,
  leadGenerated: false,
  focalPerson: '',
  designation: '',
  email: '',
  mobileNumber: '',
  leadDescription: '',
  nextSteps: '',
  lastContact: '',
};

const parseBDEngagementDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const wholeDays = Math.floor(serial);
      const utcDays = wholeDays - 25569;
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      if (!Number.isNaN(dateInfo.getTime())) return dateInfo;
    }
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? Number(`20${dmy[3]}`) : Number(dmy[3]);
    const dt = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoDate = (value: string) => {
  const parsed = parseBDEngagementDate(value);
  if (!parsed) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeEngagementDates = (row: BDEngagement) => {
  const normalizedDate = toIsoDate(row.date);
  const normalizedLastContact = toIsoDate(row.lastContact || row.date);
  return {
    ...row,
    date: normalizedDate || String(row.date || '').trim(),
    lastContact: normalizedLastContact || normalizedDate || String(row.lastContact || row.date || '').trim(),
  };
};

const sortByDateDesc = (left: string, right: string) => {
  const leftTs = parseBDEngagementDate(left)?.getTime() || 0;
  const rightTs = parseBDEngagementDate(right)?.getTime() || 0;
  return rightTs - leftTs;
};

const deriveIsoDateFromRef = (ref: string) => {
  const raw = String(ref || '').trim();
  if (!/^[0-9]{6}$/.test(raw)) return '';
  const yy = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  const iso = `20${yy}-${mm}-${dd}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? '' : iso;
};

const formatMonthLabel = (value: string) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const formatPrettyDate = (value: string) => {
  if (!value) return '—';
  const parsed = parseBDEngagementDate(value);
  if (!parsed) return value;
  if (Number.isNaN(parsed.getTime())) return value;
  // Display as DD/MM/YY (en-GB) for the sheet table column.
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const buildFormFromRow = (row: BDEngagement): FormState => ({
  ref: row.ref,
  date: row.date,
  clientName: row.clientName,
  meetingType: row.meetingType,
  status: row.status || 'Open',
  location: row.location || '',
  discussionPoints: row.discussionPoints,
  reportSubmitted: row.reportSubmitted,
  leadGenerated: row.leadGenerated,
  focalPerson: row.focalPerson || '',
  designation: row.designation || '',
  email: row.email || '',
  mobileNumber: row.mobileNumber || '',
  leadDescription: row.leadDescription,
  nextSteps: row.nextSteps,
  lastContact: row.lastContact,
});

const buildRowFromForm = (form: FormState, current?: BDEngagement): BDEngagement => {
  const timestamp = new Date().toISOString();
  return {
    id: current?.id || createBDEngagementId(),
    ref: form.ref.trim(),
    date: form.date,
    clientName: form.clientName.trim(),
    meetingType: form.meetingType.trim(),
    status: form.status.trim() || 'Open',
    location: form.location.trim(),
    discussionPoints: form.discussionPoints.trim(),
    reportSubmitted: form.reportSubmitted,
    leadGenerated: form.leadGenerated,
    focalPerson: form.focalPerson.trim(),
    designation: form.designation.trim(),
    email: form.email.trim(),
    mobileNumber: form.mobileNumber.trim(),
    leadDescription: form.leadGenerated ? form.leadDescription.trim() : '',
    nextSteps: form.nextSteps.trim(),
    lastContact: form.lastContact,
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

const chartTooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.9rem',
  color: 'hsl(var(--foreground))',
};

const chartAxisStroke = 'hsl(var(--muted-foreground))';
const chartGridStroke = 'hsl(var(--border))';
const chartNodeFill = 'hsl(var(--muted))';
const chartNodeStroke = 'hsl(var(--border))';
const chartLinkFill = 'hsl(var(--primary))';
const BULK_ADD_ACCESS_KEY = 'bd_engagement_bulk_add_access';
const MAX_BD_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_BD_UPLOAD_ROWS = 5000;

const MA_COLORS = ['#2dd4bf', '#818cf8', '#f59e0b', '#34d399', '#fb7185', '#38bdf8', '#a855f7', '#6366f1'];

const BDEngagements = () => {
  const { isAdmin, isMaster, user, token } = useAuth();
  const { opportunities: syncedOpportunities } = useData();
  const { status: trackedStatus, run: runTracked } = useTrackedAction();
  const [rows, setRows] = useState<BDEngagement[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [meetingTypeFilter, setMeetingTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [leadFilter, setLeadFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [reportFilter, setReportFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'date' | 'client' | 'lastContact'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateSourceMode, setDateSourceMode] = useState<'sheet' | 'ref'>('sheet');
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState<'engagements' | 'leads' | 'reports' | 'name' | 'lastContact'>('engagements');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAccessOpen, setBulkAccessOpen] = useState(false);
  const [bulkAccessInput, setBulkAccessInput] = useState('');
  const [bulkAccessEmails, setBulkAccessEmails] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [uploadReport, setUploadReport] = useState<{ title: string; lines: string[] } | null>(null);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);
  const [uploadPreviewRows, setUploadPreviewRows] = useState<BDEngagement[]>([]);
  const [uploadPreviewWarnings, setUploadPreviewWarnings] = useState<string[]>([]);
  const [uploadPreviewProcessedCount, setUploadPreviewProcessedCount] = useState(0);
  const [uploadPreviewImporting, setUploadPreviewImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BDEngagement | null>(null);
  const [clearDbOpen, setClearDbOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<BDEngagement | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; rows: BDEngagement[] } | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<BDEngagement | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [engViewMode, setEngViewMode] = useState<'table' | 'card'>('table');
  const [bdCurrentPage, setBdCurrentPage] = useState(1);
  const BD_PAGE_SIZE = 10;

  const canBulkAdd = Boolean(isAdmin || isMaster || bulkAccessEmails.includes(String(user?.email || '').toLowerCase()));
  const canManageBulkAccess = Boolean(isAdmin || isMaster);

  const openDrilldown = (title: string, drilldownRows: BDEngagement[]) => {
    setDrilldown({ title, rows: drilldownRows });
  };

  const logDateDiagnostics = (source: string, inputRows: BDEngagement[]) => {
    // Hidden diagnostics
  };

  const persistBulkAccess = (emails: string[]) => {
    setBulkAccessEmails(emails);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BULK_ADD_ACCESS_KEY, JSON.stringify(emails));
    }
  };

  const parseBulkRows = (text: string): BDEngagement[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const timestamp = new Date().toISOString();
    return lines.map((line, index) => {
      const parts = line.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1'));
      const [
        ref,
        date,
        clientName,
        meetingType,
        discussionPoints,
        location,
        reportSubmittedRaw,
        leadGeneratedRaw,
        status,
        focalPerson,
        designation,
        email,
        mobileNumber,
        leadDescription,
        nextSteps,
        lastContact,
      ] = parts;
      if (!ref || !date || !clientName) {
        throw new Error(`Line ${index + 1} missing required fields (ref, date, clientName).`);
      }
      const reportSubmitted = ['yes', 'true', '1'].includes(String(reportSubmittedRaw || '').toLowerCase());
      const leadGenerated = ['yes', 'true', '1'].includes(String(leadGeneratedRaw || '').toLowerCase());
      return {
        id: createBDEngagementId(),
        ref: ref.trim(),
        date: date.trim(),
        clientName: clientName.trim(),
        meetingType: (meetingType || MEETING_TYPES[0]).trim(),
        status: (status || 'Open').trim() || 'Open',
        location: (location || '').trim(),
        discussionPoints: (discussionPoints || '').trim(),
        reportSubmitted,
        leadGenerated,
        focalPerson: (focalPerson || '').trim(),
        designation: (designation || '').trim(),
        email: (email || '').trim(),
        mobileNumber: (mobileNumber || '').trim(),
        leadDescription: leadGenerated ? String(leadDescription || '').trim() : '',
        nextSteps: (nextSteps || '').trim(),
        lastContact: (lastContact || date || '').trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  };

  const createEngagement = async (row: BDEngagement) => {
    if (!token) throw new Error('Missing auth token');
    const response = await fetch(`${API_URL}/bd-engagements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Failed to create BD engagement');
    return data?.row as BDEngagement;
  };

  const createBulkEngagements = async (inputRows: BDEngagement[]) => {
    if (!token) throw new Error('Missing auth token');
    if (!inputRows.length) return [];
    const response = await fetch(`${API_URL}/bd-engagements/bulk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: inputRows }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Failed to create BD engagements in bulk');
    const createdRows = Array.isArray(data?.rows) ? data.rows : [];
    return createdRows as BDEngagement[];
  };

  const handleBulkAdd = async () => {
    try {
      const newRows = parseBulkRows(bulkText);
      const normalizedRows = newRows.map(normalizeEngagementDates);
      logDateDiagnostics('bulk_text.before_upload', normalizedRows);
      const createdRows = await createBulkEngagements(normalizedRows);
      setRows((current) => [...createdRows, ...current]);
      setBulkText('');
      setBulkDialogOpen(false);
      toast.success(`Added ${newRows.length} engagement${newRows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Bulk add failed:', error);
      toast.error((error as Error).message || 'Bulk add failed.');
    }
  };

  const downloadBulkTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const headers = [
        'Ref.',
        'Date',
        'Client Name',
        'Meeting Type',
        'Discussion Points',
        'Meeting location',
        'Report Y/N',
        'Lead Y/N',
        'Status Q/N',
        'Focal Person',
        'Designation',
        'Email ',
        'Mobile Number',
        'Lead Description',
        'Next Steps',
        'Last contact',
      ];
      const sample = {
        'Ref.': 'BD-2026-001',
        Date: new Date().toISOString().slice(0, 10),
        'Client Name': 'Client A',
        'Meeting Type': MEETING_TYPES[0],
        'Discussion Points': 'Discussed scope and next steps.',
        'Meeting location': 'Abu Dhabi',
        'Report Y/N': 'Y',
        'Lead Y/N': 'N',
        'Status Q/N': 'Open',
        'Focal Person': 'Jane Doe',
        Designation: 'Project Manager',
        'Email ': 'jane@client.com',
        'Mobile Number': '0500000000',
        'Lead Description': '',
        'Next Steps': 'Share capability deck.',
        'Last contact': new Date().toISOString().slice(0, 10),
      };
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('BD Engagements');
      worksheet.addRow(headers);
      worksheet.addRow(headers.map((header) => sample[header as keyof typeof sample] ?? ''));
      await downloadWorkbook(workbook, `bd-engagements-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Template downloaded.');
    } catch (error) {
      console.error('Template download failed:', error);
      toast.error((error as Error).message || 'Failed to download template.');
    }
  };

  const handleBulkUpload = async (file: File) => {
    try {
      if (file.size > MAX_BD_UPLOAD_BYTES) {
        throw new Error('File too large. Maximum allowed size is 5MB.');
      }
      if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
        throw new Error('Only .xlsx files are supported.');
      }
      const buffer = await file.arrayBuffer();
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('No worksheet found in uploaded file.');
      const rowsMatrix = worksheetToMatrix(worksheet, { maxRows: MAX_BD_UPLOAD_ROWS, maxColumns: 32 });
      if (!rowsMatrix.length) throw new Error('No data found in the uploaded file.');
      if (rowsMatrix.length > MAX_BD_UPLOAD_ROWS) {
        throw new Error(`Too many rows (${rowsMatrix.length}). Limit is ${MAX_BD_UPLOAD_ROWS}.`);
      }

      const normalizeHeader = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const headerCandidates: Record<string, string[]> = {
        ref: ['ref', 'ref.', 'reference', 'ref no', 'ref no.'],
        date: ['date'],
        clientName: ['client name', 'client'],
        meetingType: ['meeting type', 'meeting'],
        discussionPoints: ['discussion points', 'discussion'],
        location: ['meeting location', 'meeting location ', 'location', 'meeting place'],
        reportSubmitted: ['report y/n', 'report submitted', 'report'],
        leadGenerated: ['lead y/n', 'lead generated', 'lead'],
        status: ['status q/n', 'status', 'status qn'],
        focalPerson: ['focal person', 'focal'],
        designation: ['designation', 'title'],
        email: ['email', 'e-mail'],
        mobileNumber: ['mobile number', 'mobile', 'phone'],
        leadDescription: ['lead description', 'lead desc'],
        nextSteps: ['next steps', 'next step'],
        lastContact: ['last contact', 'last contact date'],
      };

      const scoreHeaderRow = (row: unknown[]) => {
        const normalized = row.map(normalizeHeader);
        let score = 0;
        Object.values(headerCandidates).forEach((candidates) => {
          if (normalized.some((cell) => candidates.includes(cell))) score += 1;
        });
        return score;
      };

      let headerRowIndex = 0;
      let bestScore = -1;
      rowsMatrix.slice(0, 10).forEach((row, index) => {
        const score = scoreHeaderRow(row);
        if (score > bestScore) {
          bestScore = score;
          headerRowIndex = index;
        }
      });

      const headerRow = rowsMatrix[headerRowIndex] || [];
      const normalizedHeader = headerRow.map(normalizeHeader);
      const columnIndex: Record<string, number> = {};
      Object.entries(headerCandidates).forEach(([key, candidates]) => {
        const index = normalizedHeader.findIndex((cell) => candidates.includes(cell));
        if (index >= 0) columnIndex[key] = index;
      });

      const timestamp = new Date().toISOString();
      const warnings: string[] = [];
      const parsedRows: BDEngagement[] = [];

      const parseDateValue = (value: unknown) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(0, 10);
        }
        const raw = String(value || '').trim();
        if (!raw) return '';
        const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (isoMatch) {
          const [_, year, month, day] = isoMatch;
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (dmy) {
          const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
          return `${year}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
        }
        return raw;
      };

      const startRow = headerRowIndex + 1;
      rowsMatrix.slice(startRow).forEach((row, rowOffset) => {
        const rowIndex = startRow + rowOffset + 1;

        const getCell = (key: string) => {
          const idx = columnIndex[key];
          if (idx === undefined) return '';
          return String(row[idx] ?? '').trim();
        };

        const ref = getCell('ref');
        const date = parseDateValue(getCell('date'));
        const clientName = getCell('clientName');
        const meetingType = getCell('meetingType');
        if (!ref && !clientName && !meetingType && !date) return;
        if (!ref || !date || !clientName) {
          warnings.push(`Row ${rowIndex}: missing required fields (Ref, Date, Client Name).`);
          return;
        }

        const reportSubmitted = ['y', 'yes', 'true', '1'].includes(getCell('reportSubmitted').toLowerCase());
        const leadGenerated = ['y', 'yes', 'true', '1'].includes(getCell('leadGenerated').toLowerCase());

        parsedRows.push({
          id: createBDEngagementId(),
          ref,
          date,
          clientName,
          meetingType: meetingType || MEETING_TYPES[0],
          status: getCell('status') || 'Open',
          location: getCell('location'),
          discussionPoints: getCell('discussionPoints'),
          reportSubmitted,
          leadGenerated,
          focalPerson: getCell('focalPerson'),
          designation: getCell('designation'),
          email: getCell('email'),
          mobileNumber: getCell('mobileNumber'),
          leadDescription: leadGenerated ? getCell('leadDescription') : '',
          nextSteps: getCell('nextSteps'),
          lastContact: parseDateValue(getCell('lastContact') || date) || date,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });

      if (!parsedRows.length) {
        throw new Error('No valid engagement rows found. Check the template headers and required fields.');
      }

      const normalizedRows = parsedRows.map(normalizeEngagementDates);
      setUploadPreviewRows(normalizedRows);
      setUploadPreviewWarnings(warnings);
      setUploadPreviewProcessedCount(rowsMatrix.length - startRow);
      setUploadPreviewOpen(true);
    } catch (error) {
      console.error('Bulk upload failed:', error);
      toast.error((error as Error).message || 'Failed to upload bulk file.');
    }
  };

  const confirmBulkUploadPreview = async () => {
    if (!uploadPreviewRows.length) {
      setUploadPreviewOpen(false);
      return;
    }
    try {
      setUploadPreviewImporting(true);
      logDateDiagnostics('bulk_excel.before_upload', uploadPreviewRows);
      const createdRows = await createBulkEngagements(uploadPreviewRows);
      setRows((current) => [...createdRows, ...current]);
      toast.success(`Uploaded ${uploadPreviewRows.length} engagement${uploadPreviewRows.length === 1 ? '' : 's'}.`);
      setUploadReport({
        title: 'Bulk Upload Report',
        lines: [
          `Processed ${uploadPreviewProcessedCount} row(s).`,
          `Imported ${uploadPreviewRows.length} row(s).`,
          uploadPreviewWarnings.length ? `Skipped ${uploadPreviewWarnings.length} row(s) due to missing required fields.` : 'No rows skipped.',
          ...uploadPreviewWarnings,
        ],
      });
      setUploadPreviewOpen(false);
      setUploadPreviewRows([]);
      setUploadPreviewWarnings([]);
      setUploadPreviewProcessedCount(0);
    } catch (error) {
      console.error('Bulk upload confirm failed:', error);
      toast.error((error as Error).message || 'Failed to import preview rows.');
    } finally {
      setUploadPreviewImporting(false);
    }
  };

  useEffect(() => {
    const loadFromDb = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_URL}/bd-engagements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load BD engagements');
        const initialRows = (Array.isArray(data) ? data : []).map(normalizeEngagementDates);
        logDateDiagnostics('load_from_db', initialRows);
        setRows(initialRows);
        setSelectedClient(initialRows[0]?.clientName || '');
      } catch (error) {
        console.error('Failed to load BD engagements from DB:', error);
        setRows(BD_ENGAGEMENTS_SEED);
      }
    };

    loadFromDb();

    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(BULK_ADD_ACCESS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setBulkAccessEmails(parsed.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
          }
        } catch {
          // ignore invalid local data
        }
      }
    }
  }, [token]);

  const uniqueClientNames = useMemo(
    () => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const sorted = [...rows].filter((row) => {
      if (meetingTypeFilter !== 'ALL' && row.meetingType !== meetingTypeFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (leadFilter === 'YES' && !row.leadGenerated) return false;
      if (leadFilter === 'NO' && row.leadGenerated) return false;
      if (reportFilter === 'YES' && !row.reportSubmitted) return false;
      if (reportFilter === 'NO' && row.reportSubmitted) return false;
      if (!searchTerm) return true;

      return [
        row.ref,
        row.clientName,
        row.meetingType,
        row.status,
        row.discussionPoints,
        row.leadDescription,
        row.nextSteps,
      ].join(' ').toLowerCase().includes(searchTerm);
    });

    const getSortDate = (row: BDEngagement) => {
      if (sortField !== 'date') return row.date;
      if (dateSourceMode === 'ref') {
        const refIso = deriveIsoDateFromRef(row.ref);
        if (refIso) return refIso;
      }
      return row.date;
    };

    sorted.sort((left, right) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'client') return left.clientName.localeCompare(right.clientName) * direction;
      if (sortField === 'lastContact') {
        const leftTs = parseBDEngagementDate(left.lastContact)?.getTime() || 0;
        const rightTs = parseBDEngagementDate(right.lastContact)?.getTime() || 0;
        return (leftTs - rightTs) * direction;
      }
      const leftTs = parseBDEngagementDate(getSortDate(left))?.getTime() || 0;
      const rightTs = parseBDEngagementDate(getSortDate(right))?.getTime() || 0;
      return (leftTs - rightTs) * direction;
    });

    return sorted;
  }, [dateSourceMode, leadFilter, meetingTypeFilter, reportFilter, rows, search, sortField, sortOrder, statusFilter]);

  useEffect(() => { setBdCurrentPage(1); }, [filteredRows.length, search, meetingTypeFilter, statusFilter, leadFilter, reportFilter]);

  const bdTotalPages = Math.max(1, Math.ceil(filteredRows.length / BD_PAGE_SIZE));
  const pagedEngagements = filteredRows.slice((bdCurrentPage - 1) * BD_PAGE_SIZE, bdCurrentPage * BD_PAGE_SIZE);

  const stats = useMemo(() => {
    const totalEngagements = rows.length;
    const totalLeads = rows.filter((row) => row.leadGenerated).length;
    const reportsSubmitted = rows.filter((row) => row.reportSubmitted).length;
    const clientsContacted = new Set(rows.map((row) => row.clientName)).size;
    const leadConversionRate = totalEngagements ? (totalLeads / totalEngagements) * 100 : 0;
    return { totalEngagements, totalLeads, reportsSubmitted, clientsContacted, leadConversionRate };
  }, [rows]);

  const monthlyData = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      const normalizedDate = toIsoDate(row.date);
      if (!normalizedDate) return acc;
      const key = normalizedDate.slice(0, 7);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, label: formatMonthLabel(month), count }));
  }, [rows]);

  const meetingTypeBreakdown = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.meetingType] = (acc[row.meetingType] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [rows]);


  const topClients = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.clientName] = (acc[row.clientName] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([client, count]) => ({ client, count }));
  }, [rows]);

  const clientSummaries = useMemo(() => {
    const grouped = rows.reduce<Record<string, {
      clientName: string;
      engagements: number;
      leads: number;
      reports: number;
      lastContact: string;
      meetingTypeCounts: Record<string, number>;
      rows: BDEngagement[];
    }>>((acc, row) => {
      if (!acc[row.clientName]) {
        acc[row.clientName] = {
          clientName: row.clientName,
          engagements: 0,
          leads: 0,
          reports: 0,
          lastContact: row.lastContact,
          meetingTypeCounts: {},
          rows: [],
        };
      }
      const entry = acc[row.clientName];
      entry.engagements += 1;
      if (row.leadGenerated) entry.leads += 1;
      if (row.reportSubmitted) entry.reports += 1;
      if (row.lastContact > entry.lastContact) entry.lastContact = row.lastContact;
      entry.meetingTypeCounts[row.meetingType] = (entry.meetingTypeCounts[row.meetingType] || 0) + 1;
      entry.rows.push(row);
      return acc;
    }, {});

    return Object.values(grouped).map((entry) => {
      const primaryMeetingType = Object.entries(entry.meetingTypeCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '—';
      return {
        clientName: entry.clientName,
        engagements: entry.engagements,
        leads: entry.leads,
        reports: entry.reports,
        lastContact: entry.lastContact,
        primaryMeetingType,
        rows: entry.rows.sort((a, b) => sortByDateDesc(a.date, b.date)),
      };
    });
  }, [rows]);

  const visibleClients = useMemo(() => {
    const searchTerm = clientSearch.trim().toLowerCase();
    const next = clientSummaries.filter((client) => (
      !searchTerm
      || client.clientName.toLowerCase().includes(searchTerm)
      || client.primaryMeetingType.toLowerCase().includes(searchTerm)
    ));

    next.sort((left, right) => {
      if (clientSort === 'name') return left.clientName.localeCompare(right.clientName);
      if (clientSort === 'leads') return right.leads - left.leads || left.clientName.localeCompare(right.clientName);
      if (clientSort === 'reports') return right.reports - left.reports || left.clientName.localeCompare(right.clientName);
      if (clientSort === 'lastContact') return right.lastContact.localeCompare(left.lastContact);
      return right.engagements - left.engagements || left.clientName.localeCompare(right.clientName);
    });

    return next;
  }, [clientSearch, clientSort, clientSummaries]);

  const selectedClientSummary = useMemo(
    () => visibleClients.find((client) => client.clientName === selectedClient) || visibleClients[0] || null,
    [selectedClient, visibleClients],
  );

  useEffect(() => {
    if (!selectedClientSummary) {
      setSelectedClient('');
      return;
    }
    if (selectedClient !== selectedClientSummary.clientName) {
      setSelectedClient(selectedClientSummary.clientName);
    }
  }, [selectedClient, selectedClientSummary]);

  const maVerticalData = useMemo(() => {
    const counts: Record<string, number> = {};
    syncedOpportunities.forEach(opp => {
      const v = opp.groupClassification || 'Other';
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [syncedOpportunities]);

  const maClientTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    syncedOpportunities.forEach(opp => {
      const t = opp.clientType || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [syncedOpportunities]);

  const maStatusByVertical = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const verticals = Array.from(new Set(syncedOpportunities.map(o => o.groupClassification || 'Other')));
    verticals.forEach(v => {
      map[v] = {};
      STAGE_ORDER.forEach(s => { map[v][s] = 0; });
    });
    syncedOpportunities.forEach(opp => {
      const v = opp.groupClassification || 'Other';
      const s = normalizeCanonicalStatus(getDisplayStatus(opp));
      if (map[v] && map[v][s] !== undefined) map[v][s]++;
    });
    return Object.entries(map).map(([name, stats]) => ({ name, ...stats }));
  }, [syncedOpportunities]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm({
      ...emptyForm,
      date: new Date().toISOString().slice(0, 10),
      lastContact: new Date().toISOString().slice(0, 10),
      ref: `BD-${new Date().getFullYear()}-${String(rows.length + 1).padStart(3, '0')}`,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (row: BDEngagement) => {
    setEditingRow(row);
    setForm(buildFormFromRow(row));
    setDialogOpen(true);
  };

  const saveRow = async () => {
    if (!form.ref.trim() || !form.date || !form.clientName.trim() || !form.meetingType.trim()) return;
    const nextRow = normalizeEngagementDates(buildRowFromForm(form, editingRow || undefined));
    if (!token) {
      toast.error('Missing auth token');
      return;
    }
    setSaving(true);
    try {
      await runTracked('Save Engagement', async (setProgress) => {
        setProgress(30, 'Saving…');
        if (editingRow?._id || editingRow?.id) {
          const response = await fetch(`${API_URL}/bd-engagements/${editingRow._id || editingRow.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(nextRow),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Failed to update engagement');
          setRows((current) => current.map((row) => ((row as unknown as { _id?: string })._id === (editingRow as unknown as { _id?: string })._id || row.id === editingRow.id ? data.row : row)));
        } else {
          const created = await createEngagement(nextRow);
          setRows((current) => [created, ...current]);
        }
        setProgress(90, 'Updating…');
        setRows((current) => [...current].sort((a, b) => sortByDateDesc(a.date, b.date)));
        setDialogOpen(false);
      });
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save engagement');
    } finally {
      setSaving(false);
    }
  };

  const resetSeedData = async () => {
    if (!token) {
      toast.error('Missing auth token');
      return;
    }
    setClearing(true);
    try {
      const response = await fetch(`${API_URL}/bd-engagements/clear`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to clear BD engagements');
      setRows([]);
      setSelectedClient('');
      toast.success('BD engagements cleared from DB.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to clear BD engagements');
    } finally {
      setClearing(false);
    }
  };

  const deleteRow = async () => {
    if (!deleteTarget) return;
    if (!token) {
      toast.error('Missing auth token');
      return;
    }
    setDeleting(true);
    try {
      const targetId = (deleteTarget as unknown as { _id?: string })._id || deleteTarget.id;
      const response = await fetch(`${API_URL}/bd-engagements/${targetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to delete engagement');
      setRows((current) => current.filter((row) => {
        const rowId = (row as unknown as { _id?: string })._id || row.id;
        return rowId !== targetId;
      }));
      setDeleteTarget(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete engagement');
    } finally {
      setDeleting(false);
    }
  };

  const statCards = [
    {
      label: 'Active Engagements',
      value: stats.totalEngagements,
      icon: TrendingUp,
      accent: 'from-blue-500/20 to-indigo-500/5',
      rows: rows,
    },
    {
      label: 'Unique Clients',
      value: stats.clientsContacted,
      icon: Handshake,
      accent: 'from-emerald-500/20 to-teal-500/5',
      rows: rows,
    },
    {
      label: 'Lead Generation',
      value: stats.totalLeads,
      icon: Target,
      accent: 'from-amber-500/20 to-orange-500/5',
      rows: rows.filter((row) => row.leadGenerated),
    },
    {
      label: 'Conversion Rate',
      value: `${stats.leadConversionRate.toFixed(1)}%`,
      icon: Zap,
      accent: 'from-violet-500/20 to-fuchsia-500/5',
      rows: rows.filter((row) => row.leadGenerated),
    },
    {
      label: 'Reports Ready',
      value: stats.reportsSubmitted,
      icon: FileCheck2,
      accent: 'from-sky-500/20 to-cyan-500/5',
      rows: rows.filter((row) => row.reportSubmitted),
    },
  ];

  return (
    <>
    <ActionProgressBar status={trackedStatus} />
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(129,140,248,0.12),_transparent_28%),linear-gradient(180deg,_#020617,_#0f172a)] p-6 text-slate-50 shadow-2xl shadow-slate-950/40">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/10">BD Engagement Management</Badge>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Client engagement intelligence in one place.</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              A separate BD workspace with live dashboard analytics, engagement CRUD, and a client-centric relationship view. All records persist locally in your browser and stay fully isolated from opportunity dashboard data.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Engagement
            </Button>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted text-muted-foreground">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="engagements">Engagements</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="market-analysis">Market Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <motion.div variants={staggerGrid} initial="hidden" animate="visible" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {statCards.map((card, index) => (
              <motion.button
                key={card.label}
                variants={cardVariant}
                type="button"
                onClick={() => openDrilldown(card.label, card.rows)}
                className="text-left"
              >
                <Card className="group relative overflow-hidden border-border text-card-foreground shadow-xl">
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-70 transition-opacity duration-300 group-hover:opacity-100`} />
                  <CardContent className="relative flex items-start justify-between p-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{card.label}</div>
                      <div className="mt-3 text-3xl font-black tracking-tight">{card.value}</div>
                      <div className="mt-2 text-xs text-muted-foreground">Card {String(index + 1).padStart(2, '0')}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <card.icon className="h-5 w-5 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              </motion.button>
            ))}
          </motion.div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border text-card-foreground">
              <CardHeader>
                <CardTitle>Engagements Over Time</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="label" stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <YAxis stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar
                      dataKey="count"
                      radius={[10, 10, 0, 0]}
                      fill="#2dd4bf"
                      onClick={(dataPoint) => {
                        const monthKey = (dataPoint?.payload as { month?: string })?.month;
                        if (!monthKey) return;
                        const monthRows = rows.filter((row) => row.date.startsWith(monthKey));
                        openDrilldown(`Engagements • ${formatMonthLabel(monthKey)}`, monthRows);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border text-card-foreground">
              <CardHeader>
                <CardTitle>Meeting Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={meetingTypeBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={68}
                        outerRadius={110}
                        paddingAngle={3}
                        onClick={(dataPoint) => {
                          const meetingType = (dataPoint?.payload as { name?: string })?.name;
                          if (!meetingType) return;
                          openDrilldown(`Meeting Type • ${meetingType}`, rows.filter((row) => row.meetingType === meetingType));
                        }}
                      >
                        {meetingTypeBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={DASHBOARD_COLORS[index % DASHBOARD_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {meetingTypeBreakdown.map((entry, index) => (
                    <button
                      key={entry.name}
                      type="button"
                      onClick={() => openDrilldown(`Meeting Type • ${entry.name}`, rows.filter((row) => row.meetingType === entry.name))}
                      className="flex w-full items-center justify-between rounded-2xl border border-border bg-muted/40 px-3 py-2 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: DASHBOARD_COLORS[index % DASHBOARD_COLORS.length] }} />
                        <span className="text-sm text-foreground">{entry.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{entry.value}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-1">
            <Card className="border-border text-card-foreground">
              <CardHeader>
                <CardTitle>Top Clients by Engagement Count</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topClients}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis type="number" stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="client" width={120} stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar
                      dataKey="count"
                      radius={[0, 10, 10, 0]}
                      fill="#818cf8"
                      onClick={(dataPoint) => {
                        const clientName = (dataPoint?.payload as { client?: string })?.client;
                        if (!clientName) return;
                        openDrilldown(`Client • ${clientName}`, rows.filter((row) => row.clientName === clientName));
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagements" className="space-y-6">
          <Card className="border-border text-card-foreground">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">{filteredRows.length} of {rows.length} engagements</span>
                <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
                  <button
                    type="button"
                    onClick={() => setEngViewMode('table')}
                    className={`rounded-md p-1.5 transition-colors ${engViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    title="Table view"
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngViewMode('card')}
                    className={`rounded-md p-1.5 transition-colors ${engViewMode === 'card' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    title="Card view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ref, client, meeting, notes..." className="pl-9" />
                </div>
                <Select value={meetingTypeFilter} onValueChange={setMeetingTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="Meeting Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Meeting Types</SelectItem>
                    {MEETING_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    {statusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={leadFilter} onValueChange={(value) => setLeadFilter(value as 'ALL' | 'YES' | 'NO')}>
                  <SelectTrigger><SelectValue placeholder="Lead Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Leads</SelectItem>
                    <SelectItem value="YES">Lead Yes</SelectItem>
                    <SelectItem value="NO">Lead No</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={reportFilter} onValueChange={(value) => setReportFilter(value as 'ALL' | 'YES' | 'NO')}>
                  <SelectTrigger><SelectValue placeholder="Report Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Reports</SelectItem>
                    <SelectItem value="YES">Report Yes</SelectItem>
                    <SelectItem value="NO">Report No</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={`${sortField}:${sortOrder}`} onValueChange={(value) => {
                  const [field, order] = value.split(':');
                  setSortField(field as 'date' | 'client' | 'lastContact');
                  setSortOrder(order as 'asc' | 'desc');
                }}>
                  <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date:desc">Newest First</SelectItem>
                    <SelectItem value="date:asc">Oldest First</SelectItem>
                    <SelectItem value="client:asc">Client A-Z</SelectItem>
                    <SelectItem value="lastContact:desc">Latest Contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Engagement Records</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{filteredRows.length} visible of {rows.length} stored engagements</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(isAdmin || isMaster) && (
                  <Button type="button" variant="destructive" onClick={() => setClearDbOpen(true)}>
                    <Database className="mr-2 h-4 w-4" />
                    Clear DB
                  </Button>
                )}
                {canManageBulkAccess && (
                  <Button type="button" variant="outline" onClick={() => {
                    setBulkAccessInput(bulkAccessEmails.join(', '));
                    setBulkAccessOpen(true);
                  }}>
                    Manage Bulk Access
                  </Button>
                )}
                {canBulkAdd && (
                  <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(true)}>
                    Bulk Add
                  </Button>
                )}
                <Button type="button" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Engagement
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {engViewMode === 'table' ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref</TableHead>
                        <TableHead
                          className="select-none"
                          title="Double-click to toggle date source (sheet vs ref-derived)"
                          onDoubleClick={() => {
                            setDateSourceMode((prev) => (prev === 'sheet' ? 'ref' : 'sheet'));
                            setSortField('date');
                          }}
                        >
                          Date {dateSourceMode === 'ref' ? '(Ref)' : '(Sheet)'}
                        </TableHead>
                        <TableHead>Client Name</TableHead>
                        <TableHead>Meeting Type</TableHead>
                        <TableHead>Status Q/N</TableHead>
                        <TableHead>Meeting location</TableHead>
                        <TableHead>Discussion Points</TableHead>
                        <TableHead>Report</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Focal Person</TableHead>
                        <TableHead>Lead Description</TableHead>
                        <TableHead>Next Steps</TableHead>
                        <TableHead>Last contact</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedEngagements.map((row, idx) => (
                        <motion.tr key={row.id} custom={idx} initial="hidden" animate="visible" variants={rowVariant} className="group cursor-pointer transition-colors hover:bg-muted/30" onClick={() => setSelectedEngagement(row)}>
                          <TableCell className="font-medium">{row.ref}</TableCell>
                          <TableCell>{formatPrettyDate(dateSourceMode === 'ref' ? (deriveIsoDateFromRef(row.ref) || row.date) : row.date)}</TableCell>
                          <TableCell>{row.clientName}</TableCell>
                          <TableCell>{row.meetingType}</TableCell>
                          <TableCell>{row.status || '—'}</TableCell>
                          <TableCell>{row.location || '—'}</TableCell>
                          <TableCell className="max-w-[280px] whitespace-pre-wrap break-words text-justify align-top">{row.discussionPoints}</TableCell>
                          <TableCell>{row.reportSubmitted ? <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                          <TableCell>{row.leadGenerated ? <Badge className="border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                          <TableCell>{row.focalPerson || '—'}</TableCell>
                          <TableCell className="max-w-[240px] whitespace-pre-wrap break-words text-justify align-top">{row.leadDescription || '—'}</TableCell>
                          <TableCell className="max-w-[240px] whitespace-pre-wrap break-words text-justify align-top">{row.nextSteps || '—'}</TableCell>
                          <TableCell>{formatPrettyDate(row.lastContact)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEditDialog(row); }}>Edit</Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                      {filteredRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={14} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <SearchX className="h-10 w-10 text-muted-foreground/40" />
                              <p className="text-sm text-muted-foreground">No engagement records match the current filters.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {filteredRows.length > BD_PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">
                        {(bdCurrentPage - 1) * BD_PAGE_SIZE + 1}–{Math.min(bdCurrentPage * BD_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                      </p>
                      <Pagination className="w-auto mx-0 justify-end">
                        <PaginationContent>
                          <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setBdCurrentPage(p => Math.max(1, p - 1)); }} className={bdCurrentPage === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'} /></PaginationItem>
                          {Array.from({ length: bdTotalPages }).map((_, idx) => {
                            const pg = idx + 1;
                            if (bdTotalPages <= 7 || pg === 1 || pg === bdTotalPages || Math.abs(pg - bdCurrentPage) <= 1) return <PaginationItem key={pg}><PaginationLink href="#" isActive={pg === bdCurrentPage} onClick={(e) => { e.preventDefault(); setBdCurrentPage(pg); }} className="cursor-pointer">{pg}</PaginationLink></PaginationItem>;
                            if (pg === bdCurrentPage - 2 || pg === bdCurrentPage + 2) return <PaginationItem key={pg}><PaginationEllipsis /></PaginationItem>;
                            return null;
                          })}
                          <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setBdCurrentPage(p => Math.min(bdTotalPages, p + 1)); }} className={bdCurrentPage === bdTotalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'} /></PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16">
                      <SearchX className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No engagement records match the current filters.</p>
                    </div>
                  ) : (
                    <motion.div variants={staggerGrid} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {pagedEngagements.map((row) => (
                        <motion.div
                          key={row.id}
                          variants={cardVariant}
                          className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                          onClick={() => setSelectedEngagement(row)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-mono text-muted-foreground">{row.ref}</p>
                              <p className="mt-0.5 font-semibold text-foreground leading-tight">{row.clientName}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {formatPrettyDate(dateSourceMode === 'ref' ? (deriveIsoDateFromRef(row.ref) || row.date) : row.date)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-xs">{row.meetingType}</Badge>
                            {row.status && <Badge variant="outline" className="text-xs border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300">{row.status}</Badge>}
                            {row.reportSubmitted && <Badge className="text-xs border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Report</Badge>}
                            {row.leadGenerated && <Badge className="text-xs border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">Lead</Badge>}
                          </div>
                          {row.discussionPoints && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{row.discussionPoints}</p>
                          )}
                          <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                            <div className="text-xs text-muted-foreground">
                              {row.focalPerson ? <span>{row.focalPerson}</span> : <span className="italic">No focal person</span>}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(event) => { event.stopPropagation(); openEditDialog(row); }}
                            >
                              Edit
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                  {filteredRows.length > BD_PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">
                        {(bdCurrentPage - 1) * BD_PAGE_SIZE + 1}–{Math.min(bdCurrentPage * BD_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                      </p>
                      <Pagination className="w-auto mx-0 justify-end">
                        <PaginationContent>
                          <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setBdCurrentPage(p => Math.max(1, p - 1)); }} className={bdCurrentPage === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'} /></PaginationItem>
                          {Array.from({ length: bdTotalPages }).map((_, idx) => {
                            const pg = idx + 1;
                            if (bdTotalPages <= 7 || pg === 1 || pg === bdTotalPages || Math.abs(pg - bdCurrentPage) <= 1) return <PaginationItem key={pg}><PaginationLink href="#" isActive={pg === bdCurrentPage} onClick={(e) => { e.preventDefault(); setBdCurrentPage(pg); }} className="cursor-pointer">{pg}</PaginationLink></PaginationItem>;
                            if (pg === bdCurrentPage - 2 || pg === bdCurrentPage + 2) return <PaginationItem key={pg}><PaginationEllipsis /></PaginationItem>;
                            return null;
                          })}
                          <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setBdCurrentPage(p => Math.min(bdTotalPages, p + 1)); }} className={bdCurrentPage === bdTotalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'} /></PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <Card className="border-border text-card-foreground">
            <CardContent className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search client or meeting type..." className="pl-9" />
              </div>
              <Select value={clientSort} onValueChange={(value) => setClientSort(value as 'engagements' | 'leads' | 'reports' | 'name' | 'lastContact')}>
                <SelectTrigger><SelectValue placeholder="Sort clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="engagements">Most Engagements</SelectItem>
                  <SelectItem value="leads">Most Leads</SelectItem>
                  <SelectItem value="reports">Most Reports</SelectItem>
                  <SelectItem value="lastContact">Latest Contact</SelectItem>
                  <SelectItem value="name">Client A-Z</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleClients.map((client, index) => (
                <button
                  key={client.clientName}
                  type="button"
                  onClick={() => {
                    setSelectedClient(client.clientName);
                    openDrilldown(`Client • ${client.clientName}`, client.rows);
                  }}
                  className={`rounded-[24px] border p-5 text-left shadow-sm transition-all hover:-translate-y-1 ${selectedClientSummary?.clientName === client.clientName ? 'border-teal-400/50 bg-teal-500/10 shadow-teal-500/10' : 'border-border bg-card'}`}
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-foreground">{client.clientName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{client.primaryMeetingType}</div>
                    </div>
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-muted px-3 py-2 text-foreground">
                      <div className="text-xs text-muted-foreground">Engagements</div>
                      <div className="mt-1 text-2xl font-black">{client.engagements}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-violet-700 dark:text-violet-300">
                      <div className="text-xs text-violet-600 dark:text-violet-300/80">Leads</div>
                      <div className="mt-1 text-2xl font-black">{client.leads}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">
                      <div className="text-xs text-emerald-600 dark:text-emerald-300/80">Reports</div>
                      <div className="mt-1 text-2xl font-black">{client.reports}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                      <div className="text-xs text-amber-600 dark:text-amber-300/80">Last Contact</div>
                      <div className="mt-1 text-sm font-bold">{formatPrettyDate(client.lastContact)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <Card className="border-border text-card-foreground">
              <CardHeader>
                <CardTitle>{selectedClientSummary?.clientName || 'Client Details'}</CardTitle>
                <p className="text-sm text-muted-foreground">Full engagement history in reverse chronological order.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedClientSummary && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
                    No client selected.
                  </div>
                )}
                {selectedClientSummary?.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedEngagement(row)}
                    className="w-full rounded-2xl border border-border bg-background p-4 text-left"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{row.ref} · {row.meetingType}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatPrettyDate(row.date)} · Last contact {formatPrettyDate(row.lastContact)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.reportSubmitted ? <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Report Submitted</Badge> : <Badge variant="outline">No Report</Badge>}
                        {row.leadGenerated ? <Badge className="border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">Lead Generated</Badge> : <Badge variant="outline">No Lead</Badge>}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                      <div><span className="font-semibold text-foreground">Discussion:</span> {row.discussionPoints}</div>
                      <div><span className="font-semibold text-foreground">Lead Description:</span> {row.leadDescription || '—'}</div>
                      <div><span className="font-semibold text-foreground">Next Steps:</span> {row.nextSteps || '—'}</div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="market-analysis" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Volume', value: syncedOpportunities.length, icon: Briefcase, color: 'text-blue-500' },
              { label: 'Market Verticals', value: maVerticalData.length, icon: Globe, color: 'text-emerald-500' },
              { label: 'Client Segments', value: maClientTypeData.length, icon: Users, color: 'text-amber-500' },
              { label: 'Data Points', value: syncedOpportunities.length * 12, icon: Target, color: 'text-violet-500' },
            ].map(stat => (
              <Card key={stat.label} className="border-border/50 bg-card/50">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-black mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-2xl bg-muted/50 ${stat.color}`}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden">
              <CardHeader className="border-b bg-muted/10 p-6">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Vertical Performance Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={maVerticalData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden">
              <CardHeader className="border-b bg-muted/10 p-6">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Client Segmentation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 h-[400px]">
                <ResponsiveContainer width="100%" height="80%">
                  <PieChart>
                    <Pie data={maClientTypeData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                      {maClientTypeData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={MA_COLORS[index % MA_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {maClientTypeData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MA_COLORS[index % MA_COLORS.length] }} />
                      <span className="text-xs font-medium text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden lg:col-span-2">
              <CardHeader className="border-b bg-muted/10 p-6">
                <CardTitle className="text-lg font-bold">Market Vertical × Lifecycle Stage</CardTitle>
              </CardHeader>
              <CardContent className="p-8 h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={maStatusByVertical} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }} />
                    {STAGE_ORDER.map((stage, index) => (
                      <Bar key={stage} dataKey={stage} stackId="a" fill={MA_COLORS[index % MA_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingRow ? 'Edit Engagement' : 'Add Engagement'}</DialogTitle>
            <DialogDescription>Manage BD engagement records stored separately from the opportunity dashboard.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ref</label>
              <Input value={form.ref} onChange={(event) => setForm((current) => ({ ...current, ref: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Name</label>
              <Input list="bd-client-list" value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} />
              <datalist id="bd-client-list">
                {uniqueClientNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting Type</label>
              <Select value={form.meetingType} onValueChange={(value) => setForm((current) => ({ ...current, meetingType: value as MeetingTypeOption }))}>
                <SelectTrigger><SelectValue placeholder="Select meeting type" /></SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status Q/N</label>
              <Input value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} placeholder="Open / In Progress / Closed" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Discussion Points</label>
              <Textarea value={form.discussionPoints} onChange={(event) => setForm((current) => ({ ...current, discussionPoints: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting location</label>
              <Input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Focal Person</label>
              <Input value={form.focalPerson} onChange={(event) => setForm((current) => ({ ...current, focalPerson: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Designation</label>
              <Input value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mobile Number</label>
              <Input value={form.mobileNumber} onChange={(event) => setForm((current) => ({ ...current, mobileNumber: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Report Submitted</label>
              <Select value={form.reportSubmitted ? 'YES' : 'NO'} onValueChange={(value) => setForm((current) => ({ ...current, reportSubmitted: value === 'YES' }))}>
                <SelectTrigger><SelectValue placeholder="Report submitted" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Lead Generated</label>
              <Select value={form.leadGenerated ? 'YES' : 'NO'} onValueChange={(value) => setForm((current) => ({ ...current, leadGenerated: value === 'YES' }))}>
                <SelectTrigger><SelectValue placeholder="Lead generated" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Lead Description</label>
              <Textarea value={form.leadDescription} onChange={(event) => setForm((current) => ({ ...current, leadDescription: event.target.value }))} disabled={!form.leadGenerated} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Next Steps</label>
              <Textarea value={form.nextSteps} onChange={(event) => setForm((current) => ({ ...current, nextSteps: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last contact</label>
              <Input type="date" value={form.lastContact} onChange={(event) => setForm((current) => ({ ...current, lastContact: event.target.value }))} />
            </div>
            {!form.clientName.trim() || !form.ref.trim() || !form.date ? (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 md:col-span-2">
                <AlertTriangle className="h-4 w-4" />
                Ref, date, client, and meeting type are required to save.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            {editingRow && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDialogOpen(false);
                  setDeleteTarget(editingRow);
                }}
                disabled={saving}
              >
                Delete
              </Button>
            )}
            <Button type="button" onClick={saveRow} loading={saving}>Save Engagement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Add Engagements</DialogTitle>
            <DialogDescription>Paste comma-separated rows in the order shown below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              Format:
              {' '}
              <span className="font-semibold text-foreground">ref,date,clientName,meetingType,discussionPoints,meetingLocation,reportYn,leadYn,statusQn,focalPerson,designation,email,mobileNumber,leadDescription,nextSteps,lastContact</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadBulkTemplate}>
                Download Excel Template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium">
                <Upload className="h-4 w-4" />
                Upload Filled Template
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleBulkUpload(file);
                      event.currentTarget.value = '';
                    }
                  }}
                />
              </label>
            </div>
            <Textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={10}
              placeholder="BD-2026-001,2026-04-01,Client A,Capability Meeting,Discussed scope and next steps,Abu Dhabi,YES,NO,Open,Jane Doe,Project Manager,jane@client.com,0500000000,,Share capability deck,2026-04-03"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleBulkAdd} disabled={!bulkText.trim()}>Add Rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkAccessOpen} onOpenChange={setBulkAccessOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Add Access</DialogTitle>
            <DialogDescription>Allow specific emails to use the bulk add tool.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Allowed Emails (comma-separated)</Label>
            <Input
              value={bulkAccessInput}
              onChange={(event) => setBulkAccessInput(event.target.value)}
              placeholder="user1@company.com, user2@company.com"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkAccessOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => {
                const emails = bulkAccessInput
                  .split(',')
                  .map((value) => value.trim().toLowerCase())
                  .filter(Boolean);
                persistBulkAccess(emails);
                setBulkAccessOpen(false);
                toast.success('Bulk add access updated.');
              }}
            >
              Save Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(uploadReport)} onOpenChange={(open) => { if (!open) setUploadReport(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uploadReport?.title || 'Upload Report'}</DialogTitle>
            <DialogDescription>Deviations and skipped rows from the last bulk upload.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <ul className="list-disc pl-5">
              {(uploadReport?.lines || []).map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadPreviewOpen}
        onOpenChange={(open) => {
          setUploadPreviewOpen(open);
          if (!open && !uploadPreviewImporting) {
            setUploadPreviewRows([]);
            setUploadPreviewWarnings([]);
            setUploadPreviewProcessedCount(0);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Bulk Upload Preview</DialogTitle>
            <DialogDescription>
              Review parsed rows before importing. Showing first 10 of {uploadPreviewRows.length}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Meeting Type</TableHead>
                  <TableHead>Meeting location</TableHead>
                  <TableHead>Status Q/N</TableHead>
                  <TableHead>Next Steps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploadPreviewRows.slice(0, 10).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.ref}</TableCell>
                    <TableCell>{formatPrettyDate(row.date)}</TableCell>
                    <TableCell>{row.clientName || '—'}</TableCell>
                    <TableCell>{row.meetingType || '—'}</TableCell>
                    <TableCell>{row.location || '—'}</TableCell>
                    <TableCell>{row.status || '—'}</TableCell>
                    <TableCell className="max-w-[260px] whitespace-pre-wrap break-words text-justify align-top">{row.nextSteps || '—'}</TableCell>
                  </TableRow>
                ))}
                {!uploadPreviewRows.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No parsed rows to preview.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {uploadPreviewWarnings.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Warnings ({uploadPreviewWarnings.length})</p>
              <ul className="list-disc pl-5">
                {uploadPreviewWarnings.slice(0, 20).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
              </ul>
              {uploadPreviewWarnings.length > 20 && <p className="mt-2">+ {uploadPreviewWarnings.length - 20} more warning(s)</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUploadPreviewOpen(false)} disabled={uploadPreviewImporting}>Cancel</Button>
            <Button type="button" onClick={confirmBulkUploadPreview} loading={uploadPreviewImporting} disabled={!uploadPreviewRows.length}>
              Import {uploadPreviewRows.length} Row{uploadPreviewRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => { if (!open) setDrilldown(null); }}>
        <DialogContent className="max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>{drilldown?.title || 'Drilldown'}</DialogTitle>
            <DialogDescription>Click any row to view the full engagement details.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Status Q/N</TableHead>
                  <TableHead>Meeting location</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Focal Person</TableHead>
                  <TableHead>Last contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drilldown?.rows || []).map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedEngagement(row)}>
                    <TableCell className="font-medium">{row.ref}</TableCell>
                    <TableCell>{formatPrettyDate(row.date)}</TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell>{row.meetingType}</TableCell>
                    <TableCell>{row.status || '—'}</TableCell>
                    <TableCell>{row.location || '—'}</TableCell>
                    <TableCell>{row.reportSubmitted ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.leadGenerated ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.focalPerson || '—'}</TableCell>
                    <TableCell>{formatPrettyDate(row.lastContact)}</TableCell>
                  </TableRow>
                ))}
                {(drilldown?.rows || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      No engagement rows available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedEngagement)} onOpenChange={(open) => { if (!open) setSelectedEngagement(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Engagement Detail</DialogTitle>
            <DialogDescription>Full record details for the selected engagement.</DialogDescription>
          </DialogHeader>
          {selectedEngagement && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-semibold">Ref:</span> {selectedEngagement.ref}</div>
                <div><span className="font-semibold">Status:</span> {selectedEngagement.status || '—'}</div>
                <div><span className="font-semibold">Client:</span> {selectedEngagement.clientName}</div>
                <div><span className="font-semibold">Meeting Type:</span> {selectedEngagement.meetingType}</div>
                <div><span className="font-semibold">Meeting location:</span> {selectedEngagement.location || '—'}</div>
                <div><span className="font-semibold">Date:</span> {formatPrettyDate(selectedEngagement.date)}</div>
                <div><span className="font-semibold">Last contact:</span> {formatPrettyDate(selectedEngagement.lastContact)}</div>
                <div><span className="font-semibold">Report Submitted:</span> {selectedEngagement.reportSubmitted ? 'Yes' : 'No'}</div>
                <div><span className="font-semibold">Lead Generated:</span> {selectedEngagement.leadGenerated ? 'Yes' : 'No'}</div>
                <div><span className="font-semibold">Focal Person:</span> {selectedEngagement.focalPerson || '—'}</div>
                <div><span className="font-semibold">Designation:</span> {selectedEngagement.designation || '—'}</div>
                <div><span className="font-semibold">Email:</span> {selectedEngagement.email || '—'}</div>
                <div><span className="font-semibold">Mobile:</span> {selectedEngagement.mobileNumber || '—'}</div>
              </div>
              <div><span className="font-semibold">Discussion Points:</span> {selectedEngagement.discussionPoints || '—'}</div>
              <div><span className="font-semibold">Lead Description:</span> {selectedEngagement.leadDescription || '—'}</div>
              <div><span className="font-semibold">Next Steps:</span> {selectedEngagement.nextSteps || '—'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.ref || 'this record'} from the BD engagement workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteRow} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDbOpen} onOpenChange={setClearDbOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear BD engagement DB?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all BD engagements from the local BD storage for this environment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={resetSeedData}
              disabled={clearing}
            >
              {clearing ? 'Clearing...' : 'Clear DB'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
};

export default BDEngagements;
