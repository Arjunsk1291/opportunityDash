import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Opportunity, calculateFunnelData, calculateSummaryStats, getClientData } from '@/data/opportunityData';
import { FilterState } from '@/components/Dashboard/AdvancedFilters';

interface ReportButtonProps {
  data: Opportunity[];
  filters: FilterState;
}

function toHtml(filters: FilterState, data: Opportunity[]) {
  const summary = calculateSummaryStats(data);
  const funnel = calculateFunnelData(data);
  const clients = getClientData(data);
  const generatedAt = new Date().toLocaleString();

  const safe = (value: string | number) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  const activeFilters = [
    filters.search ? `Search: ${filters.search}` : '',
    filters.statuses.length ? `Statuses: ${filters.statuses.join(', ')}` : '',
    filters.groups.length ? `Verticals: ${filters.groups.join(', ')}` : '',
    filters.leads.length ? `Leads: ${filters.leads.join(', ')}` : '',
    filters.clients.length ? `Clients: ${filters.clients.join(', ')}` : '',
    filters.datePreset !== 'all' ? `Date preset: ${filters.datePreset}` : '',
    filters.showAtRisk ? 'At risk only' : '',
    filters.showMissDeadline ? 'Miss deadline only' : '',
  ].filter(Boolean);

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>Dashboard Report</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
h1 { margin: 0 0 8px; }
small { color: #475569; }
section { margin-top: 18px; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
th { background: #f1f5f9; text-align: left; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; }
.label { color: #475569; font-size: 11px; text-transform: uppercase; }
.value { font-weight: 700; margin-top: 4px; }
</style>
</head>
<body>
  <h1>SALES DASHBOARD REPORT</h1>
  <small>Generated: ${safe(generatedAt)} • Opportunities: ${safe(data.length)}</small>

  <section>
    <h3>Applied Filters</h3>
    <p>${activeFilters.length ? activeFilters.map((item) => safe(item)).join(' | ') : 'None (all data shown)'}</p>
  </section>

  <section>
    <h3>Summary</h3>
    <div class="grid">
      <div class="card"><div class="label">Active</div><div class="value">${safe(summary.totalActive)}</div></div>
      <div class="card"><div class="label">Won Count</div><div class="value">${safe(summary.wonCount)}</div></div>
      <div class="card"><div class="label">Lost Count</div><div class="value">${safe(summary.lostCount)}</div></div>
      <div class="card"><div class="label">At Risk Count</div><div class="value">${safe(summary.atRiskCount)}</div></div>
    </div>
  </section>

  <section>
    <h3>Funnel (Chart Data)</h3>
    <table>
      <thead><tr><th>Stage</th><th>Count</th><th>Value</th><th>Conversion %</th></tr></thead>
      <tbody>
      ${funnel.map((row) => `<tr><td>${safe(row.stage)}</td><td>${safe(row.count)}</td><td>${safe(Math.round(row.value))}</td><td>${safe(row.conversionRate)}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>

  <section>
    <h3>Top Clients (Chart Data)</h3>
    <table>
      <thead><tr><th>Client</th><th>Count</th><th>Submitted Value</th></tr></thead>
      <tbody>
      ${clients.map((row) => `<tr><td>${safe(row.name)}</td><td>${safe(row.count)}</td><td>${safe(Math.round(row.value))}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>
</body>
</html>`;
}

export function ReportButton({ data, filters }: ReportButtonProps) {
  const handleExportReport = () => {
    const blob = new Blob([toHtml(filters, data)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `dashboard-report-${stamp}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" onClick={handleExportReport} className="gap-2">
      <FileText className="h-4 w-4" />
      Report
    </Button>
  );
}
