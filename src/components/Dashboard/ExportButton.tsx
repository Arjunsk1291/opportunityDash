import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import * as XLSX from 'xlsx';

interface ExportButtonProps {
  data: any[];
  filename?: string;
}

export function ExportButton({ data, filename = 'export' }: ExportButtonProps) {
  const { currency, convertCurrency, formatCurrency } = useCurrency();

  const handleExport = () => {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const currencySymbol = currency === 'AED' ? 'AED' : 'USD';

    // Convert data to export format
    const exportData = data.map(opp => {
      // Convert values to selected currency
      const value = currency === 'USD' 
        ? opp.opportunityValue 
        : convertCurrency(opp.opportunityValue, 'USD', 'AED');
      
      const expectedValue = currency === 'USD'
        ? opp.expectedValue
        : convertCurrency(opp.expectedValue, 'USD', 'AED');

      return {
        'Ref No': opp.opportunityRefNo,
        'Tender Name': opp.tenderName,
        'Client': opp.clientName,
        'Status': opp.canonicalStage,
        'Group': opp.groupClassification,
        'Internal Lead': opp.internalLead,
        [`Value (${currencySymbol})`]: Math.round(value),
        'Probability (%)': opp.probability,
        [`Expected Value (${currencySymbol})`]: Math.round(expectedValue),
        'Date Received': opp.dateTenderReceived || '',
        'Planned Submission': opp.tenderPlannedSubmissionDate || '',
        'Submitted Date': opp.tenderSubmittedDate || '',
        'Days Aging': opp.agedDays,
        'At Risk': opp.isAtRisk ? 'Yes' : 'No',
        'Partner': opp.partnerName || '',
        'Qualification': opp.qualificationStatus,
      };
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Opportunities');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}.xlsx`;

    // Download
    XLSX.writeFile(wb, fullFilename);
  };

  return (
    <Button onClick={handleExport} variant="outline" size="sm">
      <Download className="h-4 w-4 mr-2" />
      Export
    </Button>
  );
}
