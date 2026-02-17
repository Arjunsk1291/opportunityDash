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
  const { token, isAuthenticated } = useAuth();

  const headers = useCallback(
    () => token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' },
    [token]
  );

  const refreshApprovals = useCallback(async () => {
    if (!isAuthenticated || !token) return;

    try {
      const response = await fetch(API_URL + '/approvals', { headers: headers() });
      if (!response.ok) {
        throw new Error('Failed to load approvals');
      }
      const data = await response.json();
      setApprovals(data.approvals || {});
      setApprovalStates(data.approvalStates || {});

      const logsResponse = await fetch(API_URL + '/approval-logs', { headers: headers() });
      if (!logsResponse.ok) {
        throw new Error('Failed to load approval logs');
      }
      const logs = await logsResponse.json();
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
    const response = await fetch(API_URL + '/approvals/approve-proposal-head', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Proposal Head approval failed');
    }

    await refreshApprovals();
  }, [headers, refreshApprovals]);

  const approveAsSVP = useCallback(async (opportunityRefNo: string, group?: string) => {
    const response = await fetch(API_URL + '/approvals/approve-svp', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo, group }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'SVP approval failed');
    }

    await refreshApprovals();
  }, [headers, refreshApprovals]);

  const revertApproval = useCallback(async (opportunityRefNo: string) => {
    const response = await fetch(API_URL + '/approvals/revert', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ opportunityRefNo }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Revert failed');
    }

    await refreshApprovals();
  }, [headers, refreshApprovals]);

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
