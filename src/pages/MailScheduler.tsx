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

type AttachmentMode = 'filtered_extract' | 'full_sheet_copy';

type AttachmentBlock = {
  id: string;
  label: string;
  mode: AttachmentMode;
  filters: {
    group?: string;
    lead?: string;
    client?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
};

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
  attachments?: AttachmentBlock[];
  recipients: string[];
  enabled: boolean;
  archived?: boolean;
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

const renderTemplate = (template: string, values: Record<string, string>) => {
  let output = template || '';
  Object.entries(values).forEach(([key, value]) => {
    output = output.split(`{{${key}}}`).join(value);
  });
  return output;
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

  const [attachments, setAttachments] = useState<AttachmentBlock[]>([
    {
      id: 'filter-1',
      label: 'Filtered',
      mode: 'filtered_extract',
      filters: {},
    },
  ]);
  const [testRecipient, setTestRecipient] = useState('');
  const [showArchived, setShowArchived] = useState(false);

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

  const primaryFilters = useMemo(() => {
    const first = attachments.find((block) => block.mode === 'filtered_extract') || attachments[0];
    return {
      group: first?.filters?.group || 'all',
      lead: first?.filters?.lead || 'all',
      client: first?.filters?.client || 'all',
      status: first?.filters?.status || 'all',
      dateFrom: first?.filters?.dateFrom || '',
      dateTo: first?.filters?.dateTo || '',
    };
  }, [attachments]);

  const filteredOpportunities = useMemo(() => {
    const fromDate = parseDateValue(primaryFilters.dateFrom);
    const toDate = parseDateValue(primaryFilters.dateTo);
    return opportunities.filter((opp) => {
      const group = normalizeValue((opp as any).groupClassification);
      const lead = normalizeValue((opp as any).internalLead);
      const client = normalizeValue((opp as any).clientName);
      const status = normalizeValue((opp as any).canonicalStage || (opp as any).status || (opp as any).avenirStatus);
      const receivedRaw = (opp as any).dateTenderReceived || (opp as any).createdAt || '';
      const receivedDate = parseDateValue(receivedRaw);

      if (primaryFilters.group !== 'all' && group !== primaryFilters.group) return false;
      if (primaryFilters.lead !== 'all' && lead !== primaryFilters.lead) return false;
      if (primaryFilters.client !== 'all' && client !== primaryFilters.client) return false;
      if (primaryFilters.status !== 'all' && status !== primaryFilters.status) return false;
      if ((fromDate || toDate) && !receivedDate) return false;
      if (fromDate && receivedDate && receivedDate < fromDate) return false;
      if (toDate && receivedDate && receivedDate > toDate) return false;
      return true;
    });
  }, [opportunities, primaryFilters]);

  const dateRangeLabel = useMemo(() => {
    if (!filteredOpportunities.length) return 'recent period';
    const dates = filteredOpportunities
      .map((opp) => parseDateValue((opp as any).dateTenderReceived || (opp as any).createdAt))
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return 'recent period';
    const format = (d: Date) => d.toISOString().slice(0, 10);
    return `${format(dates[0])} to ${format(dates[dates.length - 1])}`;
  }, [filteredOpportunities]);

  const templateValues = useMemo(() => ({
    SCHEDULE_NAME: scheduleName || 'Scheduled Update',
    DATE_RANGE: dateRangeLabel,
    COUNT: String(filteredOpportunities.length),
    OWNER: user?.displayName || user?.email || 'Unknown',
  }), [scheduleName, dateRangeLabel, filteredOpportunities.length, user?.displayName, user?.email]);

  const renderedSubject = useMemo(
    () => renderTemplate(subject, templateValues),
    [subject, templateValues],
  );
  const renderedBody = useMemo(
    () => renderTemplate(body, templateValues),
    [body, templateValues],
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
    if (schedule.attachments && schedule.attachments.length > 0) {
      setAttachments(schedule.attachments.map((block, index) => ({
        id: block.id || `filter-${index}`,
        label: block.label || `Filter ${index + 1}`,
        mode: block.mode || 'filtered_extract',
        filters: block.filters || {},
      })));
    } else {
      setAttachments([{
        id: 'filter-1',
        label: 'Filtered',
        mode: schedule.attachmentMode || 'filtered_extract',
        filters: schedule.filters || {},
      }]);
    }
    setRecipients(schedule.recipients || []);
    setEnabled(Boolean(schedule.enabled));
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

  const archiveSchedule = async (id: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/mail-schedules/${id}/archive`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to archive schedule');
      toast.success('Schedule archived.');
      await loadSchedules();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to archive schedule');
    }
  };

  const restoreSchedule = async (id: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/mail-schedules/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to restore schedule');
      toast.success('Schedule restored.');
      await loadSchedules();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to restore schedule');
    }
  };

  const toggleScheduleEnabled = async (schedule: Schedule) => {
    if (!token) return;
    try {
      const response = await fetch(API_URL + '/mail-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          id: schedule._id,
          name: schedule.name,
          templateKey: schedule.templateKey,
          subject: schedule.subject,
          body: schedule.body,
          frequency: schedule.frequency,
          weekday: schedule.weekday,
          monthDay: schedule.monthDay,
          sendTime: schedule.sendTime,
          timezone: schedule.timezone,
          attachmentMode: schedule.attachmentMode,
          attachments: schedule.attachments || [],
          recipients: schedule.recipients,
          enabled: !schedule.enabled,
          archived: schedule.archived || false,
          filters: schedule.filters || {},
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update schedule');
      await loadSchedules();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update schedule');
    }
  };

  const sendTestMail = async () => {
    if (!token) return;
    if (!testRecipient.trim()) {
      toast.error('Enter a test recipient email.');
      return;
    }
    setIsRunningNow(true);
    try {
      const response = await fetch(`${API_URL}/mail-schedules/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          name: scheduleName.trim(),
          templateKey,
          subject,
          body,
          frequency,
          weekday,
          monthDay,
          sendTime,
          timezone,
          attachmentMode: attachments[0]?.mode || attachmentMode,
          attachments,
          filters: primaryFilters,
          testRecipient: testRecipient.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send test mail');
      toast.success('Test mail sent.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send test mail');
    } finally {
      setIsRunningNow(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const filteredSchedules = useMemo(
    () => schedules.filter((schedule) => showArchived ? Boolean(schedule.archived) : !schedule.archived),
    [schedules, showArchived],
  );

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

  const updateAttachment = (id: string, patch: Partial<AttachmentBlock>) => {
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateAttachmentFilters = (id: string, patch: AttachmentBlock['filters']) => {
    setAttachments((prev) => prev.map((item) => (item.id === id ? { ...item, filters: { ...item.filters, ...patch } } : item)));
  };

  const addAttachmentBlock = () => {
    setAttachments((prev) => [
      ...prev,
      {
        id: `filter-${Date.now()}`,
        label: `Filter ${prev.length + 1}`,
        mode: 'filtered_extract',
        filters: {},
      },
    ]);
  };

  const removeAttachmentBlock = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const insertToken = (token: string, target: 'subject' | 'body') => {
    if (target === 'subject') {
      setSubject((prev) => (prev ? `${prev} ${token}` : token));
    } else {
      setBody((prev) => (prev ? `${prev}\n${token}` : token));
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
          attachmentMode: attachments[0]?.mode || attachmentMode,
          attachments,
          recipients,
          enabled,
          archived: false,
          filters: {
            group: primaryFilters.group === 'all' ? '' : primaryFilters.group,
            lead: primaryFilters.lead === 'all' ? '' : primaryFilters.lead,
            client: primaryFilters.client === 'all' ? '' : primaryFilters.client,
            status: primaryFilters.status === 'all' ? '' : primaryFilters.status,
            dateFrom: primaryFilters.dateFrom || '',
            dateTo: primaryFilters.dateTo || '',
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
              <CardTitle>Template Variables</CardTitle>
              <CardDescription>Insert tokens and preview the rendered email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['{{SCHEDULE_NAME}}', '{{DATE_RANGE}}', '{{COUNT}}', '{{OWNER}}'].map((token) => (
                  <Badge key={token} variant="secondary" className="cursor-pointer" onClick={() => insertToken(token, 'body')}>
                    {token}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Click a token to insert into the body. Use buttons below to insert into subject/body.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['{{SCHEDULE_NAME}}', '{{DATE_RANGE}}', '{{COUNT}}', '{{OWNER}}'].map((token) => (
                  <Button key={token} variant="outline" size="sm" onClick={() => insertToken(token, 'subject')}>
                    Insert {token} in subject
                  </Button>
                ))}
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Live Subject Preview</p>
                <p className="text-sm font-medium">{renderedSubject || '—'}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Live Body Preview</p>
                <p className="text-sm whitespace-pre-wrap">{renderedBody || '—'}</p>
              </div>
              <div className="grid gap-2">
                <Label>Test Recipient</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="name@company.com"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                  />
                  <Button type="button" variant="secondary" onClick={sendTestMail} disabled={isRunningNow || !testRecipient.trim()}>
                    {isRunningNow ? 'Sending...' : 'Send Test Mail'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments & Filters</CardTitle>
              <CardDescription>Add multiple filter sets or a full sheet copy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {attachments.map((block, index) => (
                <div key={block.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={block.label}
                      onChange={(e) => updateAttachment(block.id, { label: e.target.value })}
                      placeholder={`Filter ${index + 1}`}
                      className="flex-1 min-w-[200px]"
                    />
                    <Select value={block.mode} onValueChange={(value) => updateAttachment(block.id, { mode: value as AttachmentMode })}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Attachment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="filtered_extract">Filtered Extract</SelectItem>
                        <SelectItem value="full_sheet_copy">Full Sheet Copy</SelectItem>
                      </SelectContent>
                    </Select>
                    {attachments.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeAttachmentBlock(block.id)}>
                        Remove
                      </Button>
                    )}
                  </div>

                  {block.mode === 'filtered_extract' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Group</Label>
                        <Select value={block.filters.group || 'all'} onValueChange={(value) => updateAttachmentFilters(block.id, { group: value })}>
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
                        <Select value={block.filters.lead || 'all'} onValueChange={(value) => updateAttachmentFilters(block.id, { lead: value })}>
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
                        <Select value={block.filters.client || 'all'} onValueChange={(value) => updateAttachmentFilters(block.id, { client: value })}>
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
                        <Select value={block.filters.status || 'all'} onValueChange={(value) => updateAttachmentFilters(block.id, { status: value })}>
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
                      <div className="grid gap-2">
                        <Label>Date Received From</Label>
                        <Input type="date" value={block.filters.dateFrom || ''} onChange={(e) => updateAttachmentFilters(block.id, { dateFrom: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Date Received To</Label>
                        <Input type="date" value={block.filters.dateTo || ''} onChange={(e) => updateAttachmentFilters(block.id, { dateTo: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">The original workbook will be attached as-is.</p>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={addAttachmentBlock}>Add Attachment</Button>
              </div>
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
              <div className="flex flex-wrap gap-2">
                <Button variant={showArchived ? 'outline' : 'secondary'} size="sm" onClick={() => setShowArchived(false)}>
                  Active
                </Button>
                <Button variant={showArchived ? 'secondary' : 'outline'} size="sm" onClick={() => setShowArchived(true)}>
                  Archived
                </Button>
              </div>

              {filteredSchedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No schedules saved yet.</p>
              ) : (
                filteredSchedules.map((schedule) => (
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
                      <div className="flex items-center gap-2">
                        <Badge variant={schedule.enabled ? 'secondary' : 'outline'}>{schedule.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        {!schedule.archived && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleScheduleEnabled(schedule);
                            }}
                          >
                            {schedule.enabled ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Next: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : 'Not scheduled'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!schedule.archived ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            archiveSchedule(schedule._id);
                          }}
                        >
                          Archive
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            restoreSchedule(schedule._id);
                          }}
                        >
                          Restore
                        </Button>
                      )}
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
              <p><span className="font-medium">Attachments:</span> {attachments.length} block{attachments.length === 1 ? '' : 's'}</p>
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
