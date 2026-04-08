import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Opportunity } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import * as XLSX from 'xlsx';
import { getRawAvenirStatus, getRawTenderResult } from '@/lib/opportunityStatus';

interface ExportButtonProps {
  data: Opportunity[];
  filename?: string;
}

interface ExportColumn {
  id: string;
  label: string;
  getValue: (opp: Opportunity) => string | number;
}

const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getSnapshotValue = (opp: Opportunity, candidateHeaders: string[]) => {
  const snapshot = opp.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';

  const entries = Object.entries(snapshot);
  for (const header of candidateHeaders) {
    const normalizedHeader = normalizeHeader(header);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedHeader);
    if (match) return String(match[1] ?? '').trim();
  }

  return '';
};

const getAdnocRftNo = (opp: Opportunity) => String(
  opp.adnocRftNo
  || getSnapshotValue(opp, ['ADNOC RFT NO', 'ADNOC RFT NO.'])
  || '',
).trim();

const getRfpReceivedDisplay = (opp: Opportunity) => (
  opp.dateTenderReceived
  || (typeof opp.rawGraphData?.rfpReceivedDisplay === 'string' ? opp.rawGraphData.rfpReceivedDisplay : '')
  || ''
);

const getSubmissionDisplay = (opp: Opportunity) => (
  opp.tenderSubmittedDate
  || opp.tenderPlannedSubmissionDate
  || (typeof opp.rawGraphData?.tenderSubmittedDisplay === 'string' ? opp.rawGraphData.tenderSubmittedDisplay : '')
  || (typeof opp.rawGraphData?.plannedSubmissionDisplay === 'string' ? opp.rawGraphData.plannedSubmissionDisplay : '')
  || ''
);

export function ExportButton({ data, filename = 'opportunities' }: ExportButtonProps) {
  const { currency, convertValue } = useCurrency();
  const { getApprovalStatus } = useApproval();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const columns = useMemo<ExportColumn[]>(() => {
    const currencySymbol = currency === 'AED' ? 'AED' : 'USD';

    return [
      { id: 'refNo', label: 'Avenir Ref', getValue: (opp) => opp.opportunityRefNo },
      { id: 'adnocRftNo', label: 'ADNOC Ref', getValue: (opp) => getAdnocRftNo(opp) },
      { id: 'tenderName', label: 'Tender Name', getValue: (opp) => opp.tenderName },
      { id: 'tenderType', label: 'Tender Type', getValue: (opp) => opp.opportunityClassification || '' },
      { id: 'client', label: 'Client', getValue: (opp) => opp.clientName },
      { id: 'clientType', label: 'Client Type', getValue: (opp) => opp.clientType },
      { id: 'avenirStatus', label: 'AVENIR STATUS', getValue: (opp) => getRawAvenirStatus(opp) },
      { id: 'tenderResult', label: 'TENDER RESULT', getValue: (opp) => getRawTenderResult(opp) },
      { id: 'group', label: 'Group', getValue: (opp) => opp.groupClassification },
      { id: 'lead', label: 'Lead', getValue: (opp) => opp.internalLead || 'Unassigned' },
      { id: 'value', label: `Value (${currencySymbol})`, getValue: (opp) => Math.round(convertValue(opp.opportunityValue)) },
      { id: 'rfpReceived', label: 'RFP Received', getValue: (opp) => getRfpReceivedDisplay(opp) },
      { id: 'submission', label: 'Submission', getValue: (opp) => getSubmissionDisplay(opp) },
      { id: 'lastContact', label: 'Last Contact', getValue: (opp) => opp.lastContactDate || '' },
      { id: 'approvalStatus', label: 'Approval Status', getValue: (opp) => (getApprovalStatus(opp.id) === 'approved' ? 'Approved' : 'Pending') },
      { id: 'partner', label: 'Partner', getValue: (opp) => opp.partnerName || '' },
      { id: 'remarksReason', label: 'Remarks/Reason', getValue: (opp) => opp.remarksReason || '' },
      { id: 'comments', label: 'Comments', getValue: (opp) => opp.comments || '' },
    ];
  }, [convertValue, currency, getApprovalStatus]);

  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => columns.map((column) => column.id));

  useEffect(() => {
    setSelectedColumnIds((previous) => {
      const validIds = new Set(columns.map((column) => column.id));
      const retained = previous.filter((id) => validIds.has(id));
      return retained.length ? retained : columns.map((column) => column.id);
    });
  }, [columns]);

  const handleExport = () => {
    const selectedColumns = columns.filter((column) => selectedColumnIds.includes(column.id));
    if (!selectedColumns.length) return;

    const seenSignatures = new Set<string>();
    const exportData = data.reduce<Array<Record<string, string | number>>>((rows, opp) => {
      const row = Object.fromEntries(
        selectedColumns.map((column) => [column.label, column.getValue(opp)]),
      );
      const signature = JSON.stringify(row);
      if (seenSignatures.has(signature)) return rows;
      seenSignatures.add(signature);
      rows.push(row);
      return rows;
    }, []);

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
    setIsDialogOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)} className="gap-2">
        <Download className="h-4 w-4" />
        Export Excel
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export opportunity columns</DialogTitle>
            <DialogDescription>
              Choose which columns to export for the current filtered result set. {data.length} row{data.length === 1 ? '' : 's'} will be included.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedColumnIds.length} of {columns.length} columns selected
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedColumnIds(columns.map((column) => column.id))}>
                  Select all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedColumnIds([])}>
                  Clear all
                </Button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                {columns.map((column) => {
                  const checked = selectedColumnIds.includes(column.id);
                  return (
                    <div
                      key={column.id}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        id={`export-column-${column.id}`}
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedColumnIds((current) => (
                            nextChecked
                              ? Array.from(new Set([...current, column.id]))
                              : current.filter((id) => id !== column.id)
                          ));
                        }}
                      />
                      <Label htmlFor={`export-column-${column.id}`} className="cursor-pointer leading-5">
                        {column.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleExport} disabled={!data.length || !selectedColumnIds.length}>
              Export selected columns
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
