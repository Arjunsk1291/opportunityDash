import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export type ApprovalStatus = 'pending' | 'proposal_head_approved' | 'fully_approved';

export interface ApprovalState {
  status: ApprovalStatus;
  proposalHeadApproved: boolean;
  proposalHeadBy?: string | null;
  svpApproved: boolean;
  svpBy?: string | null;
  svpGroup?: string | null;
}

export interface ApprovalLogEntry {
  id: string;
  opportunityRefNo: string;
  action: 'proposal_head_approved' | 'svp_approved' | 'reverted';
  performedBy: string;
  performedByRole: string;
  group?: string | null;
  timestamp: string;
}

interface ApprovalContextType {
  approvals: Record<string, ApprovalStatus>;
  approvalStates: Record<string, ApprovalState>;
  approvalLogs: ApprovalLogEntry[];
  getApprovalStatus: (opportunityRefNo: string) => ApprovalStatus;
  getApprovalState: (opportunityRefNo: string) => ApprovalState;
  approveAsProposalHead: (opportunityRefNo: string) => Promise<void>;
  approveAsSVP: (opportunityRefNo: string, group?: string) => Promise<void>;
  bulkApprove: (action: 'proposal_head' | 'svp', filters: Record<string, string>) => Promise<{ updated: number; skipped?: string[] }>;
  bulkRevert: (filters: Record<string, string>) => Promise<{ updated: number }>;
  revertApproval: (opportunityRefNo: string) => Promise<void>;
  refreshApprovals: () => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextType | undefined>(undefined);

const defaultState: ApprovalState = {
  status: 'pending',
  proposalHeadApproved: false,
  svpApproved: false,
};

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [approvals, setApprovals] = useState<Record<string, ApprovalStatus>>({});
  const [approvalStates, setApprovalStates] = useState<Record<string, ApprovalState>>({});
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLogEntry[]>([]);
  const { token, isAuthenticated, user, canPerformAction } = useAuth();

  const headers = useCallback(
    () => token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' },
    [token]
  );

  const refreshApprovals = useCallback(async () => {
    if (!isAuthenticated || !token) return;

    try {
      const [approvalsResponse, logsResponse] = await Promise.all([
        fetch(API_URL + '/approvals', { headers: headers() }),
        fetch(API_URL + '/approval-logs', { headers: headers() }),
      ]);
      if (!approvalsResponse.ok) {
        throw new Error('Failed to load approvals');
      }
      if (!logsResponse.ok) {
        throw new Error('Failed to load approval logs');
      }
      const [data, logs] = await Promise.all([approvalsResponse.json(), logsResponse.json()]);
      setApprovals(data.approvals || {});
      setApprovalStates(data.approvalStates || {});
      setApprovalLogs(logs);
    } catch (error) {
      console.error('❌ Failed to refresh approvals:', error);
    }
  }, [headers, isAuthenticated, token]);

  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals]);

  const getApprovalStatus = useCallback((opportunityRefNo: string): ApprovalStatus => {
    return approvals[opportunityRefNo] || 'pending';
  }, [approvals]);

  const getApprovalState = useCallback((opportunityRefNo: string): ApprovalState => {
    return approvalStates[opportunityRefNo] || defaultState;
  }, [approvalStates]);

  const approveAsProposalHead = useCallback(async (opportunityRefNo: string) => {
    if (!canPerformAction('approvals_proposal_head')) {
      throw new Error('You do not have permission to approve as Tender Manager');
    }
    setApprovals((prev) => ({ ...prev, [opportunityRefNo]: 'proposal_head_approved' }));
    setApprovalStates((prev) => ({
      ...prev,
      [opportunityRefNo]: {
        ...defaultState,
        ...(prev[opportunityRefNo] || {}),
        status: 'proposal_head_approved',
        proposalHeadApproved: true,
        proposalHeadBy: user?.displayName || null,
      },
    }));

    const response = await fetch(API_URL + '/approvals/approve-proposal-head', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo }),
    });

    const payload = await response.json();
    if (!response.ok) {
      await refreshApprovals();
      throw new Error(payload.error || 'Tender Manager approval failed');
    }

    setApprovals(payload.approvals || {});
    setApprovalStates(payload.approvalStates || {});
    if (payload.approvalLogs) setApprovalLogs(payload.approvalLogs);
  }, [canPerformAction, headers, refreshApprovals, user?.displayName]);

  const approveAsSVP = useCallback(async (opportunityRefNo: string, group?: string) => {
    if (!canPerformAction('approvals_svp')) {
      throw new Error('You do not have permission to approve as SVP');
    }
    setApprovals((prev) => ({ ...prev, [opportunityRefNo]: 'fully_approved' }));
    setApprovalStates((prev) => ({
      ...prev,
      [opportunityRefNo]: {
        ...defaultState,
        ...(prev[opportunityRefNo] || {}),
        status: 'fully_approved',
        svpApproved: true,
        svpBy: user?.displayName || null,
        svpGroup: group || prev[opportunityRefNo]?.svpGroup || null,
      },
    }));

    const response = await fetch(API_URL + '/approvals/approve-svp', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo, group }),
    });

    const payload = await response.json();
    if (!response.ok) {
      await refreshApprovals();
      throw new Error(payload.error || 'SVP approval failed');
    }

    setApprovals(payload.approvals || {});
    setApprovalStates(payload.approvalStates || {});
    if (payload.approvalLogs) setApprovalLogs(payload.approvalLogs);
  }, [canPerformAction, headers, refreshApprovals, user?.displayName]);

  const bulkApprove = useCallback(async (action: 'proposal_head' | 'svp', filters: Record<string, string>) => {
    const permissionKey = action === 'proposal_head' ? 'approvals_proposal_head' : 'approvals_svp';
    if (!canPerformAction(permissionKey)) {
      throw new Error('You do not have permission to run this bulk approval');
    }
    const response = await fetch(API_URL + '/approvals/bulk-approve', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action, filters }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Bulk approval failed');
    }

    setApprovals(payload.approvals || {});
    setApprovalStates(payload.approvalStates || {});
    if (payload.approvalLogs) setApprovalLogs(payload.approvalLogs);
    return { updated: Number(payload.updated || 0), skipped: payload.skipped || [] };
  }, [canPerformAction, headers]);

  const bulkRevert = useCallback(async (filters: Record<string, string>) => {
    if (!canPerformAction('approvals_bulk_revert')) {
      throw new Error('You do not have permission to bulk revert approvals');
    }
    const response = await fetch(API_URL + '/approvals/bulk-revert', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ filters }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Bulk revert failed');
    }

    setApprovals(payload.approvals || {});
    setApprovalStates(payload.approvalStates || {});
    if (payload.approvalLogs) setApprovalLogs(payload.approvalLogs);
    return { updated: Number(payload.updated || 0) };
  }, [canPerformAction, headers]);

  const revertApproval = useCallback(async (opportunityRefNo: string) => {
    if (!canPerformAction('approvals_revert')) {
      throw new Error('You do not have permission to revert approvals');
    }
    setApprovals((prev) => ({ ...prev, [opportunityRefNo]: 'pending' }));
    setApprovalStates((prev) => ({
      ...prev,
      [opportunityRefNo]: {
        ...defaultState,
        status: 'pending',
        proposalHeadApproved: false,
        proposalHeadBy: null,
        svpApproved: false,
        svpBy: null,
        svpGroup: null,
      },
    }));

    const response = await fetch(API_URL + '/approvals/revert', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo }),
    });

    const payload = await response.json();
    if (!response.ok) {
      await refreshApprovals();
      throw new Error(payload.error || 'Revert failed');
    }

    setApprovals(payload.approvals || {});
    setApprovalStates(payload.approvalStates || {});
    if (payload.approvalLogs) setApprovalLogs(payload.approvalLogs);
  }, [canPerformAction, headers, refreshApprovals]);

  return (
    <ApprovalContext.Provider
      value={{
        approvals,
        approvalStates,
        approvalLogs,
        getApprovalStatus,
        getApprovalState,
        approveAsProposalHead,
        approveAsSVP,
        bulkApprove,
        bulkRevert,
        revertApproval,
        refreshApprovals,
      }}
    >
      {children}
    </ApprovalContext.Provider>
  );
}

export function useApproval() {
  const context = useContext(ApprovalContext);
  if (context === undefined) {
    throw new Error('useApproval must be used within an ApprovalProvider');
  }
  return context;
}
