import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type ApprovalStatus = 'pending' | 'approved';

interface ApprovalContextType {
  approvals: Record<string, ApprovalStatus>;
  getApprovalStatus: (opportunityId: string) => ApprovalStatus;
  approveOpportunity: (opportunityId: string) => void;
  revokeApproval: (opportunityId: string) => void;
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

  useEffect(() => {
    localStorage.setItem('tender_approvals', JSON.stringify(approvals));
  }, [approvals]);

  const getApprovalStatus = useCallback((opportunityId: string): ApprovalStatus => {
    return approvals[opportunityId] || 'pending';
  }, [approvals]);

  const approveOpportunity = useCallback((opportunityId: string) => {
    setApprovals((prev) => ({ ...prev, [opportunityId]: 'approved' }));
  }, []);

  const revokeApproval = useCallback((opportunityId: string) => {
    setApprovals((prev) => ({ ...prev, [opportunityId]: 'pending' }));
  }, []);

  return (
    <ApprovalContext.Provider value={{ approvals, getApprovalStatus, approveOpportunity, revokeApproval }}>
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
