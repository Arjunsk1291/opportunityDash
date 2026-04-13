import { BarChart3, BriefcaseBusiness, Building2, FileText, LayoutDashboard, Shield, Sparkles } from 'lucide-react';
export type PageKey =
  | 'dashboard'
  | 'opportunities'
  | 'tender_updates'
  | 'vendor_directory'
  | 'clients'
  | 'analytics'
  | 'bd_engagements'
  | 'master'
  | 'master_general'
  | 'master_users'
  | 'master_data_sync'
  | 'master_telecast'
  | 'master_update'
  | 'master_export';

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  opportunities: 'Opportunities',
  tender_updates: 'Tender Updates Tracker',
  vendor_directory: 'Vendor Directory',
  clients: 'Clients',
  analytics: 'Analytics',
  bd_engagements: 'BD Engagements',
  master: 'Master Panel',
  master_general: 'Master Panel · General',
  master_users: 'Master Panel · User Management',
  master_data_sync: 'Master Panel · Data Sync',
  master_telecast: 'Master Panel · Telecast',
  master_update: 'Master Panel · Update',
  master_export: 'Master Panel · Export',
};

export const PAGE_GROUPS: Array<{ label: string; pages: PageKey[] }> = [
  { label: 'Core Workspace', pages: ['dashboard', 'opportunities', 'tender_updates', 'vendor_directory', 'clients', 'analytics', 'bd_engagements'] },
  { label: 'Master Panel', pages: ['master', 'master_general', 'master_users', 'master_data_sync', 'master_telecast', 'master_update', 'master_export'] },
];

export const DEFAULT_PAGE_ROLE_ACCESS: Record<PageKey, string[]> = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bd_engagements: ['Master', 'Admin', 'BDTeam'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
  master_update: ['Master', 'Admin'],
  master_export: ['Master', 'Admin'],
};

export const NAV_ITEMS = [
  { title: 'Dashboard', url: '/', pageKey: 'dashboard' as const, icon: LayoutDashboard, section: 'main' as const },
  { title: 'Opportunities', url: '/opportunities', pageKey: 'opportunities' as const, icon: FileText, section: 'main' as const },
  { title: 'Tender Updates', url: '/tender-updates', pageKey: 'tender_updates' as const, icon: Sparkles, section: 'main' as const },
  { title: 'Vendors', url: '/vendors', pageKey: 'vendor_directory' as const, icon: Building2, section: 'main' as const },
  { title: 'Clients', url: '/clients', pageKey: 'clients' as const, icon: Building2, section: 'main' as const },
  { title: 'Analytics', url: '/analytics', pageKey: 'analytics' as const, icon: BarChart3, section: 'main' as const },
  { title: 'BD Engagements', url: '/bd-engagements', pageKey: 'bd_engagements' as const, icon: BriefcaseBusiness, section: 'main' as const },
  { title: 'Master Panel', url: '/master', pageKey: 'master' as const, icon: Shield, section: 'admin' as const },
];
