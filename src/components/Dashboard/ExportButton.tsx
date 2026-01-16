import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Opportunity } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import * as XLSX from 'xlsx';

interface ExportButtonProps {
  data: Opportunity[];
  filename?: string;
}

export function ExportButton({ data, filename = 'opportunities' }: ExportButtonProps) {
  const { currency, convertValue } = useCurrency();
  const { getApprovalStatus } = useApproval();

  const handleExport = () => {
    const currencySymbol = currency === 'AED' ? 'AED' : 'USD';
    
    const exportData = data.map((opp) => ({
      'Ref No': opp.opportunityRefNo,
      'Tender Name': opp.tenderName,
      'Client': opp.clientName,
      'Client Type': opp.clientType,
      'Status': opp.canonicalStage,
      'Group': opp.groupClassification,
      'Lead': opp.internalLead || 'Unassigned',
      [`Value (${currencySymbol})`]: Math.round(convertValue(opp.opportunityValue)),
      'Probability (%)': opp.probability,
      [`Expected Value (${currencySymbol})`]: Math.round(convertValue(opp.expectedValue)),
      'RFP Received': opp.dateTenderReceived || '',
      'Planned Submission': opp.tenderPlannedSubmissionDate || '',
      'Submitted Date': opp.tenderSubmittedDate || '',
      'Last Contact': opp.lastContactDate || '',
      'At Risk': opp.isAtRisk ? 'Yes' : 'No',
      'Approval Status': getApprovalStatus(opp.id) === 'approved' ? 'Approved' : 'Pending',
      'Partner': opp.partnerName || '',
      'Remarks': opp.remarks || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Opportunities');

    // Auto-size columns
    const maxWidths = Object.keys(exportData[0] || {}).map((key) => ({
      wch: Math.max(
        key.length,
        ...exportData.map((row) => String(row[key as keyof typeof row] || '').length)
      ),
    }));
    worksheet['!cols'] = maxWidths;

    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
      <Download className="h-4 w-4" />
      Export Excel
    </Button>
  );
}
