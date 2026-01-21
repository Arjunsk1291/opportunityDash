import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type ApprovalStatus = 'pending' | 'approved';

export interface ApprovalLogEntry {
  id: string;
  opportunityId: string;
  action: 'approved' | 'reverted';
  performedBy: string;
  performedByRole: string;
  timestamp: string;
}

interface ApprovalContextType {
  approvals: Record<string, ApprovalStatus>;
  approvalLogs: ApprovalLogEntry[];
  getApprovalStatus: (opportunityId: string) => ApprovalStatus;
  approveOpportunity: (opportunityId: string, performedBy: string, performedByRole: string) => void;
  revertApproval: (opportunityId: string, performedBy: string, performedByRole: string) => void;
  refreshApprovals: () => void;
}

const ApprovalContext = createContext<ApprovalContextType | undefined>(undefined);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [approvals, setApprovals] = useState<Record<string, ApprovalStatus>>({});
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLogEntry[]>([]);

  // Load approvals on mount
  useEffect(() => {
    refreshApprovals();
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/approvals`);
      const data = await response.json();
      setApprovals(data);
      
      const logsResponse = await fetch(`${API_URL}/api/approval-logs`);
      const logs = await logsResponse.json();
      setApprovalLogs(logs);
      console.log('✅ Approvals refreshed from backend');
    } catch (error) {
      console.error('❌ Failed to refresh approvals:', error);
    }
  }, []);

  const getApprovalStatus = useCallback((opportunityId: string): ApprovalStatus => {
    return approvals[opportunityId] || 'pending';
  }, [approvals]);

  const approveOpportunity = useCallback(async (opportunityId: string, performedBy: string, performedByRole: string) => {
    try {
      const response = await fetch(`${API_URL}/api/approvals/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, performedBy, performedByRole }),
      });
      const result = await response.json();
      setApprovals(result.approvals);
      setApprovalLogs(result.approvalLogs);
      console.log('✅ Approval saved');
    } catch (error) {
      console.error('❌ Failed to approve:', error);
    }
  }, []);

  const revertApproval = useCallback(async (opportunityId: string, performedBy: string, performedByRole: string) => {
    try {
      const response = await fetch(`${API_URL}/api/approvals/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, performedBy, performedByRole }),
      });
      const result = await response.json();
      setApprovals(result.approvals);
      setApprovalLogs(result.approvalLogs);
      console.log('✅ Approval reverted');
    } catch (error) {
      console.error('❌ Failed to revert:', error);
    }
  }, []);

  return (
    <ApprovalContext.Provider value={{ approvals, approvalLogs, getApprovalStatus, approveOpportunity, revertApproval, refreshApprovals }}>
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
