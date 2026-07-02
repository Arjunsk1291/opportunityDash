import { BarChart3, BriefcaseBusiness, Building2, CalendarClock, FileCheck2, FileText, LayoutDashboard, ListChecks, Shield, Sparkles } from 'lucide-react';
export type PageKey =
  | 'dashboard'
  | 'opportunities'
  | 'bid_decision'
  | 'tender_updates'
  | 'pq_activities'
  | 'vendor_directory'
  | 'clients'
  | 'analytics'
  | 'bd_engagements'
  | 'tender_follow_ups'
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
  bid_decision: 'Bid Decision',
  tender_updates: 'Potential Opportunities',
  pq_activities: 'Pre-Qualification',
  vendor_directory: 'Partners',
  clients: 'Clients',
  analytics: 'Analytics',
  bd_engagements: 'BD Engagements',
  tender_follow_ups: 'Follow-Ups',
  master: 'Master Panel',
  master_general: 'Master Panel · General',
  master_users: 'Master Panel · User Management',
  master_data_sync: 'Master Panel · Data Sync',
  master_telecast: 'Master Panel · Telecast',
  master_update: 'Master Panel · Update',
  master_export: 'Master Panel · Export',
};

export const PAGE_GROUPS: Array<{ label: string; pages: PageKey[] }> = [
  { label: 'Core Workspace', pages: ['dashboard', 'opportunities', 'bid_decision', 'tender_updates', 'pq_activities', 'vendor_directory', 'clients', 'analytics', 'bd_engagements', 'tender_follow_ups'] },
  { label: 'Master Panel', pages: ['master', 'master_general', 'master_users', 'master_data_sync', 'master_telecast', 'master_update', 'master_export'] },
];

export const DEFAULT_PAGE_ROLE_ACCESS: Record<PageKey, string[]> = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bid_decision: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  pq_activities: ['Master', 'Admin', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bd_engagements: ['Master', 'Admin', 'BDTeam'],
  tender_follow_ups: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
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
  { title: 'Bid Decision', url: '/bid-decision', pageKey: 'bid_decision' as const, icon: FileCheck2, section: 'main' as const },
  { title: 'Potential Opportunities', url: '/potential-opportunities', pageKey: 'tender_updates' as const, icon: Sparkles, section: 'main' as const },
  { title: 'Pre-Qualification', url: '/pq-activities', pageKey: 'pq_activities' as const, icon: FileText, section: 'main' as const },
  { title: 'Partners', url: '/vendors', pageKey: 'vendor_directory' as const, icon: Building2, section: 'main' as const },
  { title: 'Clients', url: '/clients', pageKey: 'clients' as const, icon: Building2, section: 'main' as const },
  { title: 'Analytics', url: '/analytics', pageKey: 'analytics' as const, icon: BarChart3, section: 'main' as const },
  { title: 'BD Engagements', url: '/bd-engagements', pageKey: 'bd_engagements' as const, icon: BriefcaseBusiness, section: 'main' as const },
  { title: 'Follow-Ups', url: '/follow-ups', pageKey: 'tender_follow_ups' as const, icon: CalendarClock, section: 'main' as const },
  { title: 'Master Panel', url: '/master', pageKey: 'master' as const, icon: Shield, section: 'admin' as const },
  { title: 'Upcoming', url: '/upcoming', pageKey: 'master' as const, icon: ListChecks, section: 'admin' as const },
];
