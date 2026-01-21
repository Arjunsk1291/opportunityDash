import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ColumnMappingUIProps {
  headers: string[];
  onMappingChange: (mapping: Record<string, string>) => void;
  isLoading?: boolean;
}

const REQUIRED_FIELDS = [
  { 
    key: 'opportunityRefNo', 
    label: 'Ref No / Opportunity Number', 
    description: 'Unique identifier for the opportunity (e.g., AC25363, OPP-001)',
    required: true 
  },
  { 
    key: 'tenderName', 
    label: 'Tender Name', 
    description: 'Title or name of the tender/opportunity',
    required: true 
  },
  { 
    key: 'clientName', 
    label: 'Client Name', 
    description: 'Name of the client/company (e.g., FALCOR, Aramco)',
    required: true 
  },
  { 
    key: 'canonicalStage', 
    label: 'Status / Stage', 
    description: 'Current status (Pre-bid, In Progress, Submitted, Awarded, Lost, On Hold)',
    required: true 
  },
  { 
    key: 'internalLead', 
    label: 'Internal Lead / Person', 
    description: 'Name of the sales person or account manager leading this opportunity',
    required: true 
  },
];

const OPTIONAL_FIELDS = [
  { 
    key: 'opportunityValue', 
    label: 'Opportunity Value / Amount', 
    description: 'Monetary value of the opportunity (numbers only, e.g., 500000, 1500000). Leave unmapped if not available yet. Will default to 0.',
    required: false 
  },
  { 
    key: 'groupClassification', 
    label: 'Group / Classification', 
    description: 'Business group or division (GES, GDS, GTN, GTS)',
    required: false 
  },
  { 
    key: 'opportunityClassification', 
    label: 'Opportunity Classification', 
    description: 'Type of opportunity (EOI, Tender, RFQ, etc)',
    required: false 
  },
  { 
    key: 'qualificationStatus', 
    label: 'Qualification Status', 
    description: 'Whether we qualify for this bid (Qualified, Not Qualified, Under Review)',
    required: false 
  },
  { 
    key: 'dateTenderReceived', 
    label: 'Date Tender Received', 
    description: 'When the RFP/tender was received (e.g., 21-Oct, 2024-10-21)',
    required: false 
  },
  { 
    key: 'tenderPlannedSubmissionDate', 
    label: 'Planned Submission Date / Deadline', 
    description: 'When we plan to submit our bid (e.g., 28-Oct, 2024-10-28)',
    required: false 
  },
  { 
    key: 'tenderSubmittedDate', 
    label: 'Submitted Date', 
    description: 'When we actually submitted the bid',
    required: false 
  },
  { 
    key: 'probability', 
    label: 'Win Probability %', 
    description: 'Estimated probability of winning (0-100 as number, e.g., 75, 50, 25)',
    required: false 
  },
  { 
    key: 'awardStatus', 
    label: 'Award Status', 
    description: 'Result status (PENDING, ONGOING, AWARDED, LOST)',
    required: false 
  },
  { 
    key: 'clientType', 
    label: 'Client Type', 
    description: 'Type of client (Government, Private, Semi-Government)',
    required: false 
  },
  { 
    key: 'partnerName', 
    label: 'Partner Name', 
    description: 'Name of partner company if applicable',
    required: false 
  },
  { 
    key: 'partnerInvolvement', 
    label: 'Partner Involvement', 
    description: 'Whether there is partner involvement (Yes/No)',
    required: false 
  },
  { 
    key: 'country', 
    label: 'Country', 
    description: 'Country where opportunity is (e.g., UAE, Saudi Arabia)',
    required: false 
  },
  { 
    key: 'remarks', 
    label: 'Remarks / Comments', 
    description: 'Any additional notes or comments about the opportunity',
    required: false 
  },
  { 
    key: 'domainSubGroup', 
    label: 'Domain / Sub Group', 
    description: 'Technical domain or sub-category',
    required: false 
  },
  { 
    key: 'lastContactDate', 
    label: 'Last Contact Date', 
    description: 'When we last contacted the client',
    required: false 
  },
];

export function ColumnMappingUI({ headers, onMappingChange, isLoading }: ColumnMappingUIProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [allMapped, setAllMapped] = useState(false);

  useEffect(() => {
    const requiredMapped = REQUIRED_FIELDS.every(field => mapping[field.key]);
    setAllMapped(requiredMapped);
  }, [mapping]);

  const handleFieldChange = (fieldKey: string, columnIndex: string) => {
    const newMapping = { ...mapping, [fieldKey]: columnIndex };
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  const handleSaveMapping = () => {
    if (!allMapped) {
      alert('Please map all required fields (marked with *)');
      return;
    }
    onMappingChange(mapping);
  };

  const columnOptions = headers.map((header, index) => ({
    value: index.toString(),
    label: `Col ${index}: ${header || '(empty)'}`,
  }));

  const FieldSelect = ({ fieldKey, currentValue }: { fieldKey: string; currentValue: string }) => (
    <Select value={currentValue || 'unmapped'} onValueChange={(val) => {
      if (val === 'unmapped') {
        handleFieldChange(fieldKey, '');
      } else {
        handleFieldChange(fieldKey, val);
      }
    }}>
      <SelectTrigger className="w-full bg-white border border-input">
        <SelectValue placeholder="Select column..." />
      </SelectTrigger>
      <SelectContent className="w-full max-w-md">
        <SelectItem value="unmapped">— Not mapped —</SelectItem>
        {columnOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="py-2">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Column Mapping Instructions:</strong><br />
          Match each field with the corresponding column from your Google Sheet. 
          Fields marked with <span className="text-red-600 font-bold">*</span> are required.
          Each field shows what kind of data it should contain.
        </AlertDescription>
      </Alert>

      {/* Required Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required Fields *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {REQUIRED_FIELDS.map((field) => (
            <div key={field.key} className="pb-4 border-b last:border-b-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1">
                  <label className="text-sm font-semibold">
                    {field.label} <span className="text-red-600">*</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">Field: {field.key}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 max-w-sm">
                  <FieldSelect fieldKey={field.key} currentValue={mapping[field.key] || ''} />
                </div>
                {mapping[field.key] && <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Optional Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Optional Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {OPTIONAL_FIELDS.map((field) => (
            <div key={field.key} className="pb-4 border-b last:border-b-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1">
                  <label className="text-sm font-semibold">{field.label}</label>
                  <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">Field: {field.key}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 max-w-sm">
                  <FieldSelect fieldKey={field.key} currentValue={mapping[field.key] || ''} />
                </div>
                {mapping[field.key] && <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className={allMapped ? 'border-green-600 bg-green-50/30' : 'border-red-600 bg-red-50/30'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {allMapped ? '✅ All required fields mapped!' : '❌ Missing required fields'}
              </p>
              <p className="text-sm text-muted-foreground">
                Mapped: {Object.keys(mapping).filter(k => mapping[k]).length} fields total
              </p>
            </div>
            <Button 
              onClick={handleSaveMapping} 
              disabled={!allMapped || isLoading}
              size="lg"
            >
              {isLoading ? 'Saving...' : 'Save Mapping & Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
