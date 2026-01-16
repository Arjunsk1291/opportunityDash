import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

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
  revertApproval: (opportunityId: string, performedBy: string, performedByRole: string) => void; // Master only
}

const ApprovalContext = createContext<ApprovalContextType | undefined>(undefined);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [approvals, setApprovals] = useState<Record<string, ApprovalStatus>>(() => {
    const saved = localStorage.getItem('tender_approvals');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  const [approvalLogs, setApprovalLogs] = useState<ApprovalLogEntry[]>(() => {
    const saved = localStorage.getItem('approval_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('tender_approvals', JSON.stringify(approvals));
  }, [approvals]);

  useEffect(() => {
    localStorage.setItem('approval_logs', JSON.stringify(approvalLogs));
  }, [approvalLogs]);

  const getApprovalStatus = useCallback((opportunityId: string): ApprovalStatus => {
    return approvals[opportunityId] || 'pending';
  }, [approvals]);

  const approveOpportunity = useCallback((opportunityId: string, performedBy: string, performedByRole: string) => {
    setApprovals((prev) => {
      if (prev[opportunityId] === 'approved') return prev;
      return { ...prev, [opportunityId]: 'approved' };
    });
    setApprovalLogs((prev) => [
      {
        id: crypto.randomUUID(),
        opportunityId,
        action: 'approved',
        performedBy,
        performedByRole,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  const revertApproval = useCallback((opportunityId: string, performedBy: string, performedByRole: string) => {
    setApprovals((prev) => {
      if (prev[opportunityId] !== 'approved') return prev;
      const copy = { ...prev };
      delete copy[opportunityId];
      return copy;
    });
    setApprovalLogs((prev) => [
      {
        id: crypto.randomUUID(),
        opportunityId,
        action: 'reverted',
        performedBy,
        performedByRole,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  return (
    <ApprovalContext.Provider value={{ approvals, approvalLogs, getApprovalStatus, approveOpportunity, revertApproval }}>
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
