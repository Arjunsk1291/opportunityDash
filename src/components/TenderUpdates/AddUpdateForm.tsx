import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FinalDecision, ProjectUpdate, ProjectUpdateType } from '@/lib/tenderUpdates';

type AddUpdateFormProps = {
  tenderId: string;
  existingUpdates: ProjectUpdate[];
  onSubmit: (formData: Omit<ProjectUpdate, 'id' | 'createdAt' | 'updatedBy'>) => void;
  onCancel: () => void;
};

const UPDATE_TYPE_OPTIONS: Array<{ value: ProjectUpdateType; label: string }> = [
  { value: 'vendor_contacted', label: 'Vendor Contacted' },
  { value: 'vendor_response', label: 'Vendor Response' },
  { value: 'vendor_finalized', label: 'Vendor Finalized' },
  { value: 'extension_requested', label: 'Extension Requested' },
  { value: 'due_date_changed', label: 'Due Date Changed' },
  { value: 'status_update', label: 'Status Update' },
  { value: 'general_note', label: 'General Note' },
];

type FormState = {
  updateType: ProjectUpdateType;
  vendorName: string;
  parentUpdateId: string;
  responseDetails: string;
  contactDate: string;
  responseDate: string;
  extensionDate: string;
  finalizedDate: string;
  finalDecision: FinalDecision | '';
  finalInstructions: string;
  finalPrice: string;
  notes: string;
};

const initialState: FormState = {
  updateType: 'vendor_contacted',
  vendorName: '',
  parentUpdateId: '',
  responseDetails: '',
  contactDate: '',
  responseDate: '',
  extensionDate: '',
  finalizedDate: '',
  finalDecision: '',
  finalInstructions: '',
  finalPrice: '',
  notes: '',
};

export function AddUpdateForm({ tenderId, existingUpdates, onSubmit, onCancel }: AddUpdateFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState('');

  const parentOptions = useMemo(
    () => existingUpdates.filter((update) => update.updateType === 'vendor_contacted'),
    [existingUpdates]
  );

  const showParentSelect = ['vendor_response', 'vendor_finalized'].includes(form.updateType) && parentOptions.length > 0;
  const showVendorName = form.updateType === 'vendor_contacted' || ((form.updateType === 'vendor_response' || form.updateType === 'vendor_finalized') && !form.parentUpdateId);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleSubmit = () => {
    if (form.updateType === 'vendor_contacted' && !form.vendorName.trim()) {
      setError('Vendor name is required for vendor contacted updates.');
      return;
    }
    if (form.updateType === 'vendor_response' && !form.responseDetails.trim()) {
      setError('Response details are required for vendor response updates.');
      return;
    }
    if (form.updateType === 'vendor_finalized' && !form.finalInstructions.trim()) {
      setError('Final instructions are required for vendor finalized updates.');
      return;
    }

    onSubmit({
      tenderId,
      updateType: form.updateType,
      vendorName: showVendorName ? form.vendorName.trim() : '',
      parentUpdateId: form.parentUpdateId || '',
      responseDetails: form.responseDetails.trim(),
      contactDate: form.contactDate || '',
      responseDate: form.responseDate || '',
      extensionDate: form.extensionDate || '',
      finalizedDate: form.finalizedDate || '',
      finalDecision: form.finalDecision || undefined,
      finalInstructions: form.finalInstructions.trim(),
      finalPrice: form.finalPrice ? Number(form.finalPrice) : undefined,
      notes: form.notes.trim(),
    });
    setForm(initialState);
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Update Type</Label>
        <Select value={form.updateType} onValueChange={(value: ProjectUpdateType) => updateField('updateType', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select update type" />
          </SelectTrigger>
          <SelectContent>
            {UPDATE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showParentSelect && (
        <div className="space-y-2">
          <Label>Parent Vendor Contact</Label>
          <Select value={form.parentUpdateId || '__none__'} onValueChange={(value) => updateField('parentUpdateId', value === '__none__' ? '' : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Link to vendor contacted update" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No parent</SelectItem>
              {parentOptions.map((update) => (
                <SelectItem key={update.id} value={update.id}>
                  {(update.vendorName || 'Unnamed vendor')} • {update.contactDate || update.createdAt.slice(0, 10)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showVendorName && (
        <div className="space-y-2">
          <Label>Vendor Name</Label>
          <Input
            value={form.vendorName}
            onChange={(event) => updateField('vendorName', event.target.value)}
            placeholder="Vendor / subcontractor name"
          />
        </div>
      )}

      {form.updateType === 'vendor_contacted' && (
        <div className="space-y-2">
          <Label>Contact Date</Label>
          <Input type="date" value={form.contactDate} onChange={(event) => updateField('contactDate', event.target.value)} />
        </div>
      )}

      {form.updateType === 'vendor_response' && (
        <>
          <div className="space-y-2">
            <Label>Response Date</Label>
            <Input type="date" value={form.responseDate} onChange={(event) => updateField('responseDate', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Response Details</Label>
            <Textarea
              rows={4}
              value={form.responseDetails}
              onChange={(event) => updateField('responseDetails', event.target.value)}
              placeholder="Capture vendor response, clarifications, and position"
            />
          </div>
        </>
      )}

      {form.updateType === 'vendor_finalized' && (
        <>
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
            <AlertTitle>Vendor Finalization Details</AlertTitle>
            <AlertDescription>
              Record final instructions, decisions, and agreed terms.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label>Finalized Date</Label>
            <Input type="date" value={form.finalizedDate} onChange={(event) => updateField('finalizedDate', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Final Decision</Label>
            <Select value={form.finalDecision || '__none__'} onValueChange={(value) => updateField('finalDecision', value === '__none__' ? '' : value as FinalDecision)}>
              <SelectTrigger>
                <SelectValue placeholder="Select decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select decision</SelectItem>
                <SelectItem value="accepted">accepted ✅</SelectItem>
                <SelectItem value="negotiating">negotiating 🔄</SelectItem>
                <SelectItem value="rejected">rejected ❌</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Final Price (USD)</Label>
            <Input type="number" value={form.finalPrice} onChange={(event) => updateField('finalPrice', event.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Final Instructions</Label>
            <Textarea
              rows={4}
              value={form.finalInstructions}
              onChange={(event) => updateField('finalInstructions', event.target.value)}
              placeholder="Instructions given to or received from the vendor"
            />
          </div>
        </>
      )}

      {(form.updateType === 'extension_requested' || form.updateType === 'due_date_changed') && (
        <div className="space-y-2">
          <Label>Extension / Due Date</Label>
          <Input type="date" value={form.extensionDate} onChange={(event) => updateField('extensionDate', event.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(event) => updateField('notes', event.target.value)}
          placeholder="Optional notes"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit}>Log Update</Button>
      </div>
    </div>
  );
}
