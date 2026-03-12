import { BarChart3, Building2, FileText, LayoutDashboard, Shield, Sparkles } from 'lucide-react';
export type PageKey =
  | 'dashboard'
  | 'opportunities'
  | 'tender_updates'
  | 'vendor_directory'
  | 'clients'
  | 'analytics'
  | 'master'
  | 'master_general'
  | 'master_users'
  | 'master_data_sync'
  | 'master_telecast';

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  opportunities: 'Opportunities',
  tender_updates: 'Tender Updates Tracker',
  vendor_directory: 'Vendor Directory',
  clients: 'Clients',
  analytics: 'Analytics',
  master: 'Master Panel',
  master_general: 'Master Panel · General',
  master_users: 'Master Panel · User Management',
  master_data_sync: 'Master Panel · Data Sync',
  master_telecast: 'Master Panel · Telecast',
};

export const PAGE_GROUPS: Array<{ label: string; pages: PageKey[] }> = [
  { label: 'Core Workspace', pages: ['dashboard', 'opportunities', 'tender_updates', 'vendor_directory', 'clients', 'analytics'] },
  { label: 'Master Panel', pages: ['master', 'master_general', 'master_users', 'master_data_sync', 'master_telecast'] },
];

export const DEFAULT_PAGE_ROLE_ACCESS: Record<PageKey, string[]> = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
};

export const NAV_ITEMS = [
  { title: 'Dashboard', url: '/', pageKey: 'dashboard' as const, icon: LayoutDashboard },
  { title: 'Opportunities', url: '/opportunities', pageKey: 'opportunities' as const, icon: FileText },
  { title: 'Tender Updates', url: '/tender-updates', pageKey: 'tender_updates' as const, icon: Sparkles },
  { title: 'Vendors', url: '/vendors', pageKey: 'vendor_directory' as const, icon: Building2 },
  { title: 'Clients', url: '/clients', pageKey: 'clients' as const, icon: Building2 },
  { title: 'Analytics', url: '/analytics', pageKey: 'analytics' as const, icon: BarChart3 },
  { title: 'Master Panel', url: '/master', pageKey: 'master' as const, icon: Shield },
];
