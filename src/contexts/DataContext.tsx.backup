import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Opportunity, generateOpportunities, STATUS_MAPPING, PROBABILITY_BY_STAGE } from '@/data/opportunityData';

interface DataContextType {
  opportunities: Opportunity[];
  clearAllData: () => void;
  resetToMockData: () => void;
  refreshFromSheets: (data: Record<string, any>[]) => void;
  isDataCleared: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => generateOpportunities());
  const [isDataCleared, setIsDataCleared] = useState(false);

  const clearAllData = useCallback(() => {
    setOpportunities([]);
    setIsDataCleared(true);
    localStorage.removeItem('opportunities');
    localStorage.removeItem('syncLogs');
    localStorage.removeItem('sharePointConfig');
    localStorage.removeItem('leadMappings');
  }, []);

  const resetToMockData = useCallback(() => {
    setOpportunities(generateOpportunities());
    setIsDataCleared(false);
  }, []);

  const refreshFromSheets = useCallback((data: Record<string, any>[]) => {
    const transformed: Opportunity[] = data.map((row, idx) => {
      const status = row.opportunityStatus?.toUpperCase() || '';
      const canonicalStage = STATUS_MAPPING[status] || 'Pre-bid';
      const probability = row.probability || PROBABILITY_BY_STAGE[canonicalStage] || 10;
      const value = row.opportunityValue || 0;

      return {
        id: row.id || `imported-${idx}`,
        opportunityRefNo: row.opportunityRefNo || '',
        tenderNo: row.tenderNo || '',
        tenderName: row.tenderName || 'Unnamed',
        clientName: row.clientName || '',
        clientType: row.clientType || '',
        clientLead: row.clientLead || '',
        opportunityClassification: row.opportunityClassification || row.tenderType || '',
        opportunityStatus: row.opportunityStatus || '',
        canonicalStage,
        qualificationStatus: row.qualificationStatus || '',
        groupClassification: row.groupClassification || '',
        domainSubGroup: row.domainSubGroup || '',
        internalLead: row.internalLead || '',
        opportunityValue: value,
        opportunityValue_imputed: false,
        opportunityValue_imputation_reason: '',
        probability,
        probability_imputed: false,
        probability_imputation_reason: '',
        expectedValue: value * (probability / 100),
        dateTenderReceived: row.dateTenderReceived || null,
        tenderPlannedSubmissionDate: row.tenderPlannedSubmissionDate || null,
        tenderPlannedSubmissionDate_imputed: false,
        tenderPlannedSubmissionDate_imputation_reason: '',
        tenderSubmittedDate: row.tenderSubmittedDate || null,
        lastContactDate: null,
        lastContactDate_imputed: false,
        lastContactDate_imputation_reason: '',
        daysSinceTenderReceived: 0,
        daysToPlannedSubmission: 0,
        agedDays: 0,
        willMissDeadline: false,
        isAtRisk: false,
        partnerInvolvement: !!row.partnerName,
        partnerName: row.partnerName || '',
        country: row.country || '',
        remarks: row.remarks || '',
        awardStatus: row.awardStatus || '',
      };
    });
    setOpportunities(transformed);
    setIsDataCleared(false);
  }, []);

  return (
    <DataContext.Provider value={{ opportunities, clearAllData, resetToMockData, refreshFromSheets, isDataCleared }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
