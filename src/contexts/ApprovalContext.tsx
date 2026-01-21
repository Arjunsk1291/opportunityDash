import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useData } from './DataContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export type ApprovalStatus = 'pending' | 'approved';

export interface ApprovalLogEntry {
  id: string;
  opportunityRefNo: string;
  action: 'approved' | 'reverted';
  performedBy: string;
  performedByRole: string;
  timestamp: string;
}

interface ApprovalContextType {
  approvals: Record<string, ApprovalStatus>;
  approvalLogs: ApprovalLogEntry[];
  getApprovalStatus: (opportunityRefNo: string) => ApprovalStatus;
  approveOpportunity: (opportunityRefNo: string, performedBy: string, performedByRole: string) => void;
  revertApproval: (opportunityRefNo: string, performedBy: string, performedByRole: string) => void;
  refreshApprovals: () => void;
}

const ApprovalContext = createContext<ApprovalContextType | undefined>(undefined);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [approvals, setApprovals] = useState<Record<string, ApprovalStatus>>({});
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLogEntry[]>([]);
  const { opportunities } = useData();

  useEffect(() => {
    refreshApprovals();
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '/approvals');
      const data = await response.json();
      
      const cleanedApprovals: Record<string, ApprovalStatus> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (key && key !== 'null' && key !== 'undefined') {
          cleanedApprovals[key] = value as ApprovalStatus;
        }
      });
      setApprovals(cleanedApprovals);
      
      const logsResponse = await fetch(API_URL + '/approval-logs');
      const logs = await logsResponse.json();
      setApprovalLogs(logs);
      console.log('✅ Approvals refreshed from backend:', Object.keys(cleanedApprovals).length, 'approvals');
    } catch (error) {
      console.error('❌ Failed to refresh approvals:', error);
    }
  }, []);

  const getApprovalStatus = useCallback((opportunityRefNo: string): ApprovalStatus => {
    if (!opportunityRefNo || opportunityRefNo === 'null' || opportunityRefNo === 'undefined') {
      console.warn('⚠️  Invalid opportunityRefNo:', opportunityRefNo);
      return 'pending';
    }
    return approvals[opportunityRefNo] || 'pending';
  }, [approvals]);

  const approveOpportunity = useCallback(async (opportunityRefNo: string, performedBy: string, performedByRole: string) => {
    if (!opportunityRefNo || opportunityRefNo === 'null' || opportunityRefNo === 'undefined') {
      console.error('❌ Cannot approve: Invalid opportunityRefNo', opportunityRefNo);
      return;
    }

    try {
      console.log('📤 Approving:', { opportunityRefNo, performedBy, performedByRole });
      const response = await fetch(API_URL + '/approvals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityRefNo, performedBy, performedByRole }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Approval failed:', error);
        return;
      }
      
      const result = await response.json();
      
      if (result.approvals) {
        setApprovals(result.approvals);
      }
      if (result.approvalLogs) {
        setApprovalLogs(result.approvalLogs);
      }
      
      await refreshApprovals();
      console.log('✅ Approval saved successfully');
    } catch (error) {
      console.error('❌ Failed to approve:', error);
    }
  }, [refreshApprovals]);

  const revertApproval = useCallback(async (opportunityRefNo: string, performedBy: string, performedByRole: string) => {
    if (!opportunityRefNo || opportunityRefNo === 'null' || opportunityRefNo === 'undefined') {
      console.error('❌ Cannot revert: Invalid opportunityRefNo', opportunityRefNo);
      return;
    }

    try {
      console.log('📤 Reverting:', { opportunityRefNo, performedBy, performedByRole });
      const response = await fetch(API_URL + '/approvals/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityRefNo, performedBy, performedByRole }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Revert failed:', error);
        return;
      }
      
      const result = await response.json();
      
      if (result.approvals) {
        setApprovals(result.approvals);
      }
      if (result.approvalLogs) {
        setApprovalLogs(result.approvalLogs);
      }
      
      await refreshApprovals();
      console.log('✅ Approval reverted successfully');
    } catch (error) {
      console.error('❌ Failed to revert:', error);
    }
  }, [refreshApprovals]);

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
