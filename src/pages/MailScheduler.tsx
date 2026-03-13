import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type AttachmentMode = 'filtered_extract' | 'full_sheet_copy';

type Schedule = {
  _id: string;
  name: string;
  templateKey: string;
  subject: string;
  body: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  weekday?: string;
  monthDay?: number;
  sendTime: string;
  timezone: string;
  attachmentMode: AttachmentMode;
  filters: Record<string, string>;
  recipients: string[];
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
};

type ScheduleRun = {
  _id: string;
  runAt: string;
  status: 'success' | 'failed';
  sentCount?: number;
  tenderCount?: number;
  error?: string;
};

const TEMPLATE_OPTIONS = [
  { key: 'weekly_pipeline', label: 'Weekly Pipeline Summary' },
  { key: 'tender_updates', label: 'Tender Updates Digest' },
  { key: 'custom', label: 'Custom Template' },
];

const FREQUENCY_OPTIONS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const WEEKDAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeValue = (value?: string | null) => String(value || '').trim();

const parseDateValue = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const MailScheduler = () => {
  const { opportunities } = useData();
  const { getAllUsers, user, token } = useAuth();
  const allUsers = getAllUsers();
  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const [scheduleName, setScheduleName] = useState('Weekly Tender Digest');
  const [templateKey, setTemplateKey] = useState('weekly_pipeline');
  const [subject, setSubject] = useState('Tender Updates · {{DATE_RANGE}}');
  const [body, setBody] = useState('Hello team,\n\nPlease find the latest tender updates attached.\n\nRegards,\nAvenir Dashboard');
  const [frequency, setFrequency] = useState('weekly');
  const [weekday, setWeekday] = useState('Monday');
  const [sendTime, setSendTime] = useState('08:30');
  const [timezone, setTimezone] = useState('Asia/Dubai');
  const [monthDay, setMonthDay] = useState(1);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);

  const [attachmentMode, setAttachmentMode] = useState<AttachmentMode>('filtered_extract');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [manualRecipient, setManualRecipient] = useState('');

  const [filterGroup, setFilterGroup] = useState('all');
  const [filterLead, setFilterLead] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const groups = useMemo(() => {
    const values = new Set<string>();
    opportunities.forEach((opp) => {
      const group = normalizeValue((opp as any).groupClassification);
      if (group) values.add(group);
    });
    return Array.from(values).sort();
  }, [opportunities]);

  const leads = useMemo(() => {
    const values = new Set<string>();
    opportunities.forEach((opp) => {
      const lead = normalizeValue((opp as any).internalLead);
      if (lead) values.add(lead);
    });
    return Array.from(values).sort();
  }, [opportunities]);

  const clients = useMemo(() => {
    const values = new Set<string>();
    opportunities.forEach((opp) => {
      const client = normalizeValue((opp as any).clientName);
      if (client) values.add(client);
    });
    return Array.from(values).sort();
  }, [opportunities]);

  const statuses = useMemo(() => {
    const values = new Set<string>();
    opportunities.forEach((opp) => {
      const status = normalizeValue((opp as any).canonicalStage || (opp as any).status || (opp as any).avenirStatus);
      if (status) values.add(status);
    });
    return Array.from(values).sort();
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const fromDate = parseDateValue(filterDateFrom);
    const toDate = parseDateValue(filterDateTo);
    return opportunities.filter((opp) => {
      const group = normalizeValue((opp as any).groupClassification);
      const lead = normalizeValue((opp as any).internalLead);
      const client = normalizeValue((opp as any).clientName);
      const status = normalizeValue((opp as any).canonicalStage || (opp as any).status || (opp as any).avenirStatus);
      const receivedRaw = (opp as any).dateTenderReceived || (opp as any).createdAt || '';
      const receivedDate = parseDateValue(receivedRaw);

      if (filterGroup !== 'all' && group !== filterGroup) return false;
      if (filterLead !== 'all' && lead !== filterLead) return false;
      if (filterClient !== 'all' && client !== filterClient) return false;
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if ((fromDate || toDate) && !receivedDate) return false;
      if (fromDate && receivedDate && receivedDate < fromDate) return false;
      if (toDate && receivedDate && receivedDate > toDate) return false;
      return true;
    });
  }, [opportunities, filterGroup, filterLead, filterClient, filterStatus, filterDateFrom, filterDateTo]);

  const selectedUsers = useMemo(
    () => allUsers.filter((person) => recipients.includes(person.email.toLowerCase())),
    [allUsers, recipients],
  );

  const loadSchedules = async () => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/mail-schedules', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load schedules');
      setSchedules(data.schedules || []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load schedules');
    }
  };

  const loadRuns = async (scheduleId: string) => {
    if (!token) return;
    setIsLoadingRuns(true);
    try {
      const response = await fetch(`${API_URL}/mail-schedules/${scheduleId}/runs?limit=20`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load runs');
      setScheduleRuns(data.runs || []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load run history');
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const selectSchedule = (schedule: Schedule) => {
    setSelectedScheduleId(schedule._id);
    setScheduleName(schedule.name);
    setTemplateKey(schedule.templateKey);
    setSubject(schedule.subject);
    setBody(schedule.body);
    setFrequency(schedule.frequency);
    setWeekday(schedule.weekday || 'Monday');
    setMonthDay(schedule.monthDay || 1);
    setSendTime(schedule.sendTime);
    setTimezone(schedule.timezone);
    setAttachmentMode(schedule.attachmentMode);
    setRecipients(schedule.recipients || []);
    setEnabled(Boolean(schedule.enabled));
    const filters = schedule.filters || {};
    setFilterGroup(filters.group || 'all');
    setFilterLead(filters.lead || 'all');
    setFilterClient(filters.client || 'all');
    setFilterStatus(filters.status || 'all');
    setFilterDateFrom(filters.dateFrom || '');
    setFilterDateTo(filters.dateTo || '');
    loadRuns(schedule._id);
  };

  const runScheduleNow = async () => {
    if (!selectedScheduleId || !token) return;
    setIsRunningNow(true);
    try {
      const response = await fetch(`${API_URL}/mail-schedules/${selectedScheduleId}/run`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to run schedule');
      toast.success(`Schedule sent to ${data.dispatch?.sent || 0} recipient${data.dispatch?.sent === 1 ? '' : 's'}.`);
      await loadSchedules();
      await loadRuns(selectedScheduleId);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to run schedule');
    } finally {
      setIsRunningNow(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const addRecipient = (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || recipients.includes(normalized)) return;
    setRecipients((prev) => [...prev, normalized]);
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((item) => item !== email));
  };

  const toggleRecipient = (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (recipients.includes(normalized)) {
      removeRecipient(normalized);
    } else {
      addRecipient(normalized);
    }
  };

  const handleSave = async () => {
    if (!scheduleName.trim()) {
      toast.error('Schedule name is required.');
      return;
    }
    if (!recipients.length) {
      toast.error('Select at least one recipient.');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(API_URL + '/mail-schedules', {
        method: 'POST',
        headers: token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedScheduleId,
          name: scheduleName.trim(),
          templateKey,
          subject,
          body,
          frequency,
          weekday,
          monthDay,
          sendTime,
          timezone,
          attachmentMode,
          recipients,
          enabled,
          filters: {
            group: filterGroup === 'all' ? '' : filterGroup,
            lead: filterLead === 'all' ? '' : filterLead,
            client: filterClient === 'all' ? '' : filterClient,
            status: filterStatus === 'all' ? '' : filterStatus,
            dateFrom: filterDateFrom || '',
            dateTo: filterDateTo || '',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save schedule');
      toast.success(`Schedule saved. Next run: ${data.schedule?.nextRunAt ? new Date(data.schedule.nextRunAt).toLocaleString() : 'scheduled'}.`);
      setSelectedScheduleId(data.schedule?._id || null);
      await loadSchedules();
      if (data.schedule?._id) await loadRuns(data.schedule._id);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Mail Scheduler</h1>
        <p className="text-sm text-muted-foreground">Schedule periodic emails with filtered Excel extracts or a full sheet attachment.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Details</CardTitle>
              <CardDescription>Define cadence, template, and the send window.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Schedule Name</Label>
                <Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="e.g. Weekly Tender Digest" />
              </div>

              <div className="grid gap-2">
                <Label>Email Template</Label>
                <Select value={templateKey} onValueChange={setTemplateKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose template" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_OPTIONS.map((option) => (
                      <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label>Email Body</Label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Send Time</Label>
                  <Input type="time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} />
                </div>
                {frequency === 'weekly' && (
                  <div className="grid gap-2">
                    <Label>Send Day</Label>
                    <Select value={weekday} onValueChange={setWeekday}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_OPTIONS.map((day) => (
                          <SelectItem key={day} value={day}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {frequency === 'monthly' && (
                  <div className="grid gap-2">
                    <Label>Day of Month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDay}
                      onChange={(e) => setMonthDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Timezone</Label>
                  <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
                Enable schedule
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Only matching tenders will be included in the Excel attachment.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Group</Label>
                  <Select value={filterGroup} onValueChange={setFilterGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="All groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Lead</Label>
                  <Select value={filterLead} onValueChange={setFilterLead}>
                    <SelectTrigger>
                      <SelectValue placeholder="All leads" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {leads.map((lead) => (
                        <SelectItem key={lead} value={lead}>{lead}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <Select value={filterClient} onValueChange={setFilterClient}>
                    <SelectTrigger>
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client} value={client}>{client}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Date Received From</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Date Received To</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachment Mode</CardTitle>
              <CardDescription>Choose how the Excel data should be attached.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={attachmentMode} onValueChange={(value) => setAttachmentMode(value as AttachmentMode)} className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="filtered_extract" id="filtered_extract" />
                  <div className="space-y-1">
                    <Label htmlFor="filtered_extract">Filtered Excel Extract</Label>
                    <p className="text-xs text-muted-foreground">Only rows matching the filters above are exported into a new sheet.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="full_sheet_copy" id="full_sheet_copy" />
                  <div className="space-y-1">
                    <Label htmlFor="full_sheet_copy">Attach Full Sheet Copy</Label>
                    <p className="text-xs text-muted-foreground">Attach the original Excel sheet copy along with the email.</p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Existing Schedules</CardTitle>
              <CardDescription>Manage or run saved schedules.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No schedules saved yet.</p>
              ) : (
                schedules.map((schedule) => (
                  <button
                    key={schedule._id}
                    type="button"
                    onClick={() => selectSchedule(schedule)}
                    className={`w-full rounded-lg border p-3 text-left transition ${selectedScheduleId === schedule._id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{schedule.name}</p>
                        <p className="text-xs text-muted-foreground">{schedule.frequency} · {schedule.sendTime} · {schedule.timezone}</p>
                      </div>
                      <Badge variant={schedule.enabled ? 'secondary' : 'outline'}>{schedule.enabled ? 'Enabled' : 'Disabled'}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Next: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : 'Not scheduled'}
                    </div>
                  </button>
                ))
              )}
              {selectedScheduleId && (
                <Button variant="secondary" className="w-full" onClick={runScheduleNow} disabled={isRunningNow}>
                  {isRunningNow ? 'Running...' : 'Run Now'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recipients</CardTitle>
              <CardDescription>Select users or add manual email addresses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Manual Recipient</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="name@company.com"
                    value={manualRecipient}
                    onChange={(e) => setManualRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRecipient(manualRecipient)}
                  />
                  <Button type="button" onClick={() => addRecipient(manualRecipient)} disabled={!manualRecipient.trim()}>
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Authorized Users</Label>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {allUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users loaded for selection.</p>
                  ) : (
                    allUsers.map((person) => (
                      <label key={person.email} className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={recipients.includes(person.email.toLowerCase())}
                          onCheckedChange={() => toggleRecipient(person.email)}
                        />
                        <span className="flex-1 truncate">{person.displayName || person.email}</span>
                        <span className="text-xs text-muted-foreground">{person.role}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <Label>Selected Recipients</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recipients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recipients selected.</p>
                  ) : (
                    recipients.map((email) => (
                      <Badge key={email} variant="secondary" className="gap-2">
                        {email}
                        <button type="button" onClick={() => removeRecipient(email)} className="text-xs text-muted-foreground">×</button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run History</CardTitle>
              <CardDescription>Latest dispatch results for the selected schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!selectedScheduleId ? (
                <p className="text-sm text-muted-foreground">Select a schedule to view run history.</p>
              ) : isLoadingRuns ? (
                <p className="text-sm text-muted-foreground">Loading runs...</p>
              ) : scheduleRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
              ) : (
                scheduleRuns.map((run) => (
                  <div key={run._id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(run.runAt).toLocaleString()}</span>
                      <Badge variant={run.status === 'success' ? 'secondary' : 'destructive'}>{run.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Sent: {run.sentCount || 0} · Tenders: {run.tenderCount || 0}
                    </div>
                    {run.error && <div className="mt-1 text-xs text-destructive">Error: {run.error}</div>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule Preview</CardTitle>
              <CardDescription>Quick view of the current schedule settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">Owner:</span> {user?.displayName || user?.email || 'Unknown'}</p>
              <p><span className="font-medium">Frequency:</span> {frequency} {frequency === 'weekly' ? `· ${weekday}` : ''}{frequency === 'monthly' ? `· Day ${monthDay}` : ''}</p>
              <p><span className="font-medium">Time:</span> {sendTime} ({timezone})</p>
              <p><span className="font-medium">Template:</span> {TEMPLATE_OPTIONS.find((t) => t.key === templateKey)?.label}</p>
              <p><span className="font-medium">Matching Tenders:</span> {filteredOpportunities.length}</p>
              <p><span className="font-medium">Attachment:</span> {attachmentMode === 'full_sheet_copy' ? 'Full sheet copy' : 'Filtered extract'}</p>
              <p><span className="font-medium">Recipients:</span> {recipients.length}</p>
              <p><span className="font-medium">Status:</span> {enabled ? 'Enabled' : 'Disabled'}</p>
            </CardContent>
          </Card>

          <Button onClick={handleSave} className="w-full" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MailScheduler;
