import { BarChart3, Building2, FileText, LayoutDashboard, Shield } from 'lucide-react';
export type PageKey = 'dashboard' | 'opportunities' | 'clients' | 'analytics' | 'master';

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  opportunities: 'Opportunities',
  clients: 'Clients',
  analytics: 'Analytics',
  master: 'Master Panel',
};

export const DEFAULT_PAGE_ROLE_ACCESS: Record<PageKey, string[]> = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic'],
  master: ['Master', 'Admin'],
};

export const NAV_ITEMS = [
  { title: 'Dashboard', url: '/', pageKey: 'dashboard' as const, icon: LayoutDashboard },
  { title: 'Opportunities', url: '/opportunities', pageKey: 'opportunities' as const, icon: FileText },
  { title: 'Clients', url: '/clients', pageKey: 'clients' as const, icon: Building2 },
  { title: 'Analytics', url: '/analytics', pageKey: 'analytics' as const, icon: BarChart3 },
  { title: 'Master Panel', url: '/master', pageKey: 'master' as const, icon: Shield },
];
