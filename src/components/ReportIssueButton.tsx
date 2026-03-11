import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquareWarning } from 'lucide-react';
import { toast } from 'sonner';
type ReporterInfo = {
  displayName?: string;
  role?: string;
  email?: string;
};

type ReportIssueButtonProps = {
  authToken?: string | null;
  reporter?: ReporterInfo | null;
  page?: string;
};

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ISSUE_TYPES = [
  { key: 'not_working', label: 'Not working properly' },
  { key: 'crashing', label: 'Crashing' },
  { key: 'data_mismatch', label: 'Data mismatch' },
];

const FEATURE_OPTIONS = [
  'Dashboard',
  'Opportunities',
  'Clients',
  'Analytics',
  'Approvals',
  'Data Sync',
  'Admin',
  'Login',
  'Other',
];

export function ReportIssueButton({ authToken, reporter, page }: ReportIssueButtonProps) {
  const token = authToken || null;
  const user = reporter || null;
  const resolvedPage = page || window.location.pathname;
  const [open, setOpen] = useState(false);
  const [issueTypes, setIssueTypes] = useState<string[]>([]);
  const [feature, setFeature] = useState<string>('Dashboard');
  const [featureOther, setFeatureOther] = useState('');
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!comments.trim()) return false;
    if (issueTypes.length === 0) return false;
    if (feature === 'Other' && !featureOther.trim()) return false;
    return Boolean(token);
  }, [comments, feature, featureOther, issueTypes.length, token]);

  const toggleIssueType = (key: string) => {
    setIssueTypes((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const handleSubmit = async () => {
    if (!token) {
      toast.error('Please sign in to submit an issue report.');
      return;
    }
    if (!comments.trim()) {
      toast.error('Comments are required.');
      return;
    }
    if (issueTypes.length === 0) {
      toast.error('Select at least one issue type.');
      return;
    }
    if (feature === 'Other' && !featureOther.trim()) {
      toast.error('Please specify the feature.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(API_URL + '/issue-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          issueTypes,
          feature,
          featureOther: feature === 'Other' ? featureOther.trim() : '',
          summary: summary.trim(),
          steps: steps.trim(),
          comments: comments.trim(),
          page: resolvedPage,
          reporterDisplayName: user?.displayName || '',
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send report');
      }
      toast.success('Issue report sent to Master users.');
      setOpen(false);
      setIssueTypes([]);
      setFeature('Dashboard');
      setFeatureOther('');
      setSummary('');
      setSteps('');
      setComments('');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50">
        <Button className="gap-2 shadow-lg" onClick={() => setOpen(true)}>
          <MessageSquareWarning className="h-4 w-4" />
          Report Issue
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Report an Issue</DialogTitle>
            <DialogDescription>
              Share what went wrong and we will notify the Master users.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Issue Type</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ISSUE_TYPES.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={issueTypes.includes(item.key)}
                      onCheckedChange={() => toggleIssueType(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Affected Feature</Label>
              <Select value={feature} onValueChange={setFeature}>
                <SelectTrigger>
                  <SelectValue placeholder="Select feature" />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {feature === 'Other' && (
                <Input
                  placeholder="Specify feature"
                  value={featureOther}
                  onChange={(e) => setFeatureOther(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Issue Summary</Label>
              <Input
                placeholder="Short summary (optional)"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Steps to Reproduce (optional)</Label>
              <Textarea
                rows={4}
                placeholder="1. ... 2. ... 3. ..."
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Comments (required)</Label>
              <Textarea
                rows={4}
                placeholder="Describe the issue and impact"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? 'Sending...' : 'Send Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
