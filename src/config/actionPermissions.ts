import type { UserRole } from '@/contexts/AuthContext';

export type ActionKey =
  | 'opportunities_sync'
  | 'approvals_proposal_head'
  | 'approvals_svp'
  | 'approvals_bulk_revert'
  | 'approvals_revert'
  | 'vendors_write'
  | 'vendors_import'
  | 'clients_write'
  | 'clients_import'
  | 'clients_seed'
  | 'users_manage'
  | 'navigation_permissions_write'
  | 'graph_config_write'
  | 'graph_auth_write'
  | 'telecast_config_write'
  | 'telecast_auth_write'
  | 'manual_opportunity_updates_write'
  | 'export_template_write'
  | 'notification_alert_flags_write'
  | 'lead_email_manage'
  | 'logs_cleanup';

export const ACTION_LABELS: Record<ActionKey, string> = {
  opportunities_sync: 'Sync Opportunities to MongoDB',
  approvals_proposal_head: 'Tender Manager Approval Writes',
  approvals_svp: 'SVP Approval Writes',
  approvals_bulk_revert: 'Bulk Revert Approval Writes',
  approvals_revert: 'Single Revert Approval Writes',
  vendors_write: 'Create / Update Vendors',
  vendors_import: 'Import Vendors',
  clients_write: 'Create / Update Clients',
  clients_import: 'Import Clients',
  clients_seed: 'Seed Clients from Opportunities',
  users_manage: 'Manage Authorized Users',
  navigation_permissions_write: 'Save Page Visibility Rules',
  graph_config_write: 'Save Data Sync Config',
  graph_auth_write: 'Save Graph Auth Tokens',
  telecast_config_write: 'Save Telecast Config',
  telecast_auth_write: 'Save Telecast Auth Tokens',
  manual_opportunity_updates_write: 'Upload Manual Opportunity Updates',
  export_template_write: 'Save Export Template Config',
  notification_alert_flags_write: 'Update Telecast Alert Flags',
  lead_email_manage: 'Approve lead email mappings',
  logs_cleanup: 'Cleanup Login Logs',
};

export const ACTION_DESCRIPTIONS: Record<ActionKey, string> = {
  opportunities_sync: 'Manual sync and dashboard auto-sync that write synced rows into MongoDB.',
  approvals_proposal_head: 'Writes proposal-head approval state into MongoDB.',
  approvals_svp: 'Writes SVP approval state into MongoDB.',
  approvals_bulk_revert: 'Bulk approval revert operations.',
  approvals_revert: 'Single-tender approval revert operations.',
  vendors_write: 'Create or update vendor directory records.',
  vendors_import: 'Bulk import vendor directory records.',
  clients_write: 'Create or update client records.',
  clients_import: 'Bulk import client records.',
  clients_seed: 'Seed clients from synced opportunity data.',
  users_manage: 'Add, approve, reject, remove, or change authorized users.',
  navigation_permissions_write: 'Persist sidebar and route visibility rules.',
  graph_config_write: 'Persist workbook sync configuration.',
  graph_auth_write: 'Persist delegated Graph auth for sync.',
  telecast_config_write: 'Persist telecast templates and recipients.',
  telecast_auth_write: 'Persist delegated Graph auth for telecast.',
  manual_opportunity_updates_write: 'Upload manual workbook data that backfills synced opportunity fields by Avenir Ref.',
  export_template_write: 'Persist Excel export template layout, logo, and styling.',
  notification_alert_flags_write: 'Persist telecast alert flag updates on synced tenders.',
  lead_email_manage: 'Approve lead name to email mappings for deadline alerts.',
  logs_cleanup: 'Delete old login logs.',
};

export const DEFAULT_ACTION_ROLE_ACCESS: Record<ActionKey, UserRole[]> = {
  opportunities_sync: ['Master', 'Admin'],
  approvals_proposal_head: ['Master', 'ProposalHead'],
  approvals_svp: ['Master', 'SVP'],
  approvals_bulk_revert: ['Master', 'ProposalHead'],
  approvals_revert: ['Master'],
  vendors_write: ['Master', 'Admin'],
  vendors_import: ['Master', 'Admin'],
  clients_write: ['Master', 'Admin', 'ProposalHead'],
  clients_import: ['Master', 'Admin'],
  clients_seed: ['Master', 'Admin'],
  users_manage: ['Master'],
  navigation_permissions_write: ['Master'],
  graph_config_write: ['Master'],
  graph_auth_write: ['Master'],
  telecast_config_write: ['Master'],
  telecast_auth_write: ['Master'],
  manual_opportunity_updates_write: ['Master', 'Admin'],
  export_template_write: ['Master'],
  notification_alert_flags_write: ['Master', 'Admin'],
  lead_email_manage: ['Master', 'Admin'],
  logs_cleanup: ['Master'],
};
