import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Opportunity, calculateFunnelData, calculateSummaryStats, getClientData } from '@/data/opportunityData';
import { FilterState } from '@/components/Dashboard/AdvancedFilters';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ReportButtonProps {
  data: Opportunity[];
  filters: FilterState;
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

type ReportDurationKey = '30d' | '90d' | '180d' | '365d' | 'all';

const REPORT_DURATION_OPTIONS: Array<{ key: ReportDurationKey; label: string; description: string; days: number | null }> = [
  { key: '30d', label: 'Last 30 days', description: 'Short-term pipeline snapshot based on RFP Received date.', days: 30 },
  { key: '90d', label: 'Last 90 days', description: 'Quarter-style view for recent sales activity.', days: 90 },
  { key: '180d', label: 'Last 6 months', description: 'Balanced trend view across an extended cycle.', days: 180 },
  { key: '365d', label: 'Last 12 months', description: 'Annual report view for broader performance review.', days: 365 },
  { key: 'all', label: 'All available data', description: 'Uses the full currently filtered dataset.', days: null },
];

const getReportReferenceDate = (opp: Opportunity) => {
  const candidates = [
    opp.dateTenderReceived,
    opp.tenderSubmittedDate,
    opp.tenderPlannedSubmissionDate,
    typeof opp.rawGraphData?.rfpReceivedDisplay === 'string' ? opp.rawGraphData.rfpReceivedDisplay : '',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const filterDataByDuration = (data: Opportunity[], durationKey: ReportDurationKey) => {
  const option = REPORT_DURATION_OPTIONS.find((item) => item.key === durationKey) || REPORT_DURATION_OPTIONS[1];
  if (option.days === null) return data;

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (option.days - 1));
  start.setHours(0, 0, 0, 0);

  return data.filter((opp) => {
    const date = getReportReferenceDate(opp);
    if (!date) return false;
    return date >= start && date <= end;
  });
};

const getDurationMeta = (durationKey: ReportDurationKey) => {
  const option = REPORT_DURATION_OPTIONS.find((item) => item.key === durationKey) || REPORT_DURATION_OPTIONS[1];
  if (option.days === null) {
    return { key: option.key, label: option.label, rangeLabel: 'All available dates' };
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (option.days - 1));

  return {
    key: option.key,
    label: option.label,
    rangeLabel: `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
  };
};

const getPortfolioLimit = (durationKey?: string) => (durationKey === 'all' ? Number.POSITIVE_INFINITY : 12);

function generatePieChart(values: number[], labels: string[], colors: string[]): string {
  const total = values.reduce((a, b) => a + b, 0);
  let currentAngle = 0;
  let paths = '';
  
  values.forEach((value, i) => {
    const percentage = (value / total) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const x1 = 100 + 80 * Math.cos(startRad);
    const y1 = 100 + 80 * Math.sin(startRad);
    const x2 = 100 + 80 * Math.cos(endRad);
    const y2 = 100 + 80 * Math.sin(endRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    const path = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`;
    paths += `<path d="${path}" fill="${colors[i]}" stroke="white" stroke-width="2"/>`;
    
    currentAngle = endAngle;
  });
  
  return `<svg viewBox="0 0 200 200" style="width: 100%; height: 250px;">${paths}</svg>`;
}

function generateBarChart(labels: string[], values: number[], color: string): string {
  const maxValue = Math.max(...values);
  const chartHeight = 200;
  const barWidth = Math.min(40, 200 / labels.length);
  const spacing = Math.max(10, (200 - labels.length * barWidth) / (labels.length + 1));
  
  let bars = '';
  labels.forEach((label, i) => {
    const barHeight = (values[i] / maxValue) * chartHeight;
    const x = spacing + i * (barWidth + spacing);
    const y = chartHeight - barHeight;
    
    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4" />`;
    bars += `<text x="${x + barWidth / 2}" y="${chartHeight + 20}" text-anchor="middle" font-size="11" fill="#64748b">${label}</text>`;
    bars += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" font-size="10" font-weight="600" fill="#0f172a">${values[i]}</text>`;
  });
  
  return `<svg viewBox="0 0 250 250" style="width: 100%; height: 250px;">${bars}</svg>`;
}

function toHtml(filters: FilterState, data: Opportunity[], reportMeta: { key?: string; label: string; rangeLabel: string }) {
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

  const totalOpportunities = data.length;
  
  const statusCounts = [summary.workingCount, summary.awardedCount, summary.lostCount, summary.regrettedCount, summary.toStartCount];
  const statusLabels = ['Working', 'Awarded', 'Lost', 'Regretted', 'To Start'];
  const statusColors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6'];
  
  const funnelLabels = funnel.map(f => f.stage).slice(0, 5);
  const funnelCounts = funnel.map(f => f.count).slice(0, 5);
  const portfolioRows = data
    .slice()
    .sort((a, b) => new Date(b.dateTenderReceived || b.tenderSubmittedDate || 0).getTime() - new Date(a.dateTenderReceived || a.tenderSubmittedDate || 0).getTime())
    .slice(0, getPortfolioLimit(reportMeta.key));

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>Sales Pipeline Report</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
  background: #f8fafc; 
  color: #0f172a;
  line-height: 1.6;
}
.container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
header { 
  background:
    radial-gradient(circle at top right, rgba(125,211,252,0.24), transparent 28%),
    linear-gradient(135deg, #082f49 0%, #0f172a 55%, #172554 100%);
  color: white;
  padding: 40px;
  border-radius: 12px;
  margin-bottom: 40px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}
header h1 { font-size: 32px; margin-bottom: 8px; font-weight: 700; }
header p { opacity: 0.85; font-size: 15px; }
.timestamp { font-size: 12px; opacity: 0.6; margin-top: 15px; }
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}
.hero-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.16);
  font-size: 12px;
  letter-spacing: 0.02em;
}

section { 
  background: white;
  padding: 30px;
  margin-bottom: 25px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border: 1px solid #e2e8f0;
}
h2 { 
  color: #1e293b;
  font-size: 20px;
  margin-bottom: 25px;
  padding-bottom: 12px;
  border-bottom: 3px solid #0c63e4;
  display: inline-block;
}
h3 { 
  color: #334155;
  font-size: 14px;
  margin: 20px 0 12px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 25px; }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 25px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

.metric-card { 
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  padding: 18px;
  text-align: center;
}

.metric-label { 
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}
.metric-value { 
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
}
.metric-unit { 
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}

.chart-container {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}
.chart-title {
  font-weight: 600;
  color: #334155;
  margin-bottom: 15px;
  font-size: 13px;
  text-transform: uppercase;
}

.filters {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
  padding: 14px;
  border-radius: 6px;
  margin-bottom: 20px;
}
.filters p {
  font-size: 13px;
  color: #166534;
  line-height: 1.6;
}

table { 
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 15px;
}
th { 
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  color: #334155;
  padding: 13px;
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  border-bottom: 2px solid #cbd5e1;
  letter-spacing: 0.5px;
}
td { 
  padding: 12px 13px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
tr:last-child td { border-bottom: none; }
tr:nth-child(even) { background: #f8fafc; }

.highlight { color: #0c63e4; font-weight: 700; }
.positive { color: #16a34a; font-weight: 700; }
.negative { color: #dc2626; font-weight: 700; }
.warning { color: #ea580c; font-weight: 700; }

.summary-box {
  background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
  border-left: 4px solid #0c63e4;
  padding: 16px;
  border-radius: 6px;
  font-size: 13px;
  margin: 15px 0;
  line-height: 1.7;
  border: 1px solid #bfdbfe;
}

.portfolio-caption {
  font-size: 13px;
  color: #475569;
  margin-bottom: 14px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 15px;
  font-size: 12px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

footer {
  text-align: center;
  padding: 25px;
  color: #64748b;
  font-size: 12px;
  border-top: 2px solid #e2e8f0;
  margin-top: 50px;
}

@media print {
  body { background: white; }
  section { box-shadow: none; border: 1px solid #ddd; }
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>📊 SALES PIPELINE ANALYTICS REPORT</h1>
    <p>Comprehensive Sales Intelligence & Market Insights</p>
    <div class="hero-meta">
      <div class="hero-chip">Report window: ${safe(reportMeta.label)}</div>
      <div class="hero-chip">Date span: ${safe(reportMeta.rangeLabel)}</div>
      <div class="hero-chip">Included opportunities: ${safe(totalOpportunities)}</div>
    </div>
    <div class="timestamp">Generated: ${safe(generatedAt)} | Total Opportunities: ${safe(totalOpportunities)}</div>
  </header>

  <section>
    <h2>Report Filters</h2>
    <div class="filters">
      <p><strong>Applied Filters:</strong> ${activeFilters.length ? activeFilters.map((item) => safe(item)).join(' • ') : 'None (all data shown)'}</p>
      <p><strong>Report duration:</strong> ${safe(reportMeta.label)} (${safe(reportMeta.rangeLabel)})</p>
    </div>
  </section>

  <section>
    <h2>Key Business Metrics</h2>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Total Opportunities</div>
        <div class="metric-value">${safe(totalOpportunities)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Opportunities Won</div>
        <div class="metric-value positive">${safe(summary.wonCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Opportunities Lost</div>
        <div class="metric-value negative">${safe(summary.lostCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">At Risk Count</div>
        <div class="metric-value warning">${safe(summary.atRiskCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Active Pipeline</div>
        <div class="metric-value highlight">${safe(summary.totalActive)}</div>
      </div>
    </div>

    <div class="summary-box">
      <strong>📈 Executive Summary:</strong> Currently tracking <span class="highlight">${safe(summary.totalActive)} active opportunities</span>. Successfully closed <span class="positive">${safe(summary.wonCount)} deals</span> while <span class="negative">${safe(summary.lostCount)} opportunities</span> were lost. <span class="warning">${safe(summary.atRiskCount)} opportunities</span> require immediate attention due to approaching submission deadlines.
    </div>
  </section>

  <section>
    <h2>Visual Analytics Dashboard</h2>
    <div class="grid-2">
      <div class="chart-container">
        <div class="chart-title">📊 Opportunity Status Distribution</div>
        ${generatePieChart(statusCounts, statusLabels, statusColors)}
        <div class="legend">
          ${statusLabels.map((label, i) => `<div class="legend-item"><div class="legend-color" style="background: ${statusColors[i]}"></div>${label}: ${statusCounts[i]}</div>`).join('')}
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-title">📈 Sales Funnel Pipeline</div>
        ${generateBarChart(funnelLabels.map(l => l.substring(0, 8)), funnelCounts, '#3b82f6')}
      </div>
    </div>
  </section>

  <section>
    <h2>Opportunity Status Breakdown</h2>
    <div class="grid-3">
      <div class="metric-card">
        <div class="metric-label">✅ Working</div>
        <div class="metric-value">${safe(summary.workingCount)}</div>
        <div class="metric-unit">Active Negotiations</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🏆 Awarded</div>
        <div class="metric-value positive">${safe(summary.awardedCount)}</div>
        <div class="metric-unit">Won Deals</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">❌ Lost</div>
        <div class="metric-value negative">${safe(summary.lostCount)}</div>
        <div class="metric-unit">Lost Opportunities</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">📋 Regretted</div>
        <div class="metric-value warning">${safe(summary.regrettedCount)}</div>
        <div class="metric-unit">Declined Bids</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🚀 To Start</div>
        <div class="metric-value">${safe(summary.toStartCount)}</div>
        <div class="metric-unit">Pipeline Queue</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">⏱️ At Risk</div>
        <div class="metric-value negative">${safe(summary.atRiskCount)}</div>
        <div class="metric-unit">Urgent Action</div>
      </div>
    </div>

    <div class="summary-box" style="margin-top: 20px;">
      <strong>💡 Insights:</strong> Your pipeline shows <span class="positive">${safe(summary.workingCount)} opportunities in active negotiation</span>. Focus on converting <span class="highlight">${safe(summary.toStartCount)} pending opportunities</span> and managing the <span class="negative">${safe(summary.atRiskCount)} at-risk deals</span> to prevent further losses.
    </div>
  </section>

  <section>
    <h2>Sales Funnel Analysis</h2>
    <table>
      <thead>
        <tr>
          <th>Pipeline Stage</th>
          <th>Opportunities</th>
          <th>Total Value</th>
        </tr>
      </thead>
      <tbody>
      ${funnel.map((row) => `<tr>
        <td><strong>${safe(row.stage)}</strong></td>
        <td>${safe(row.count)}</td>
        <td class="highlight">$${safe((row.value / 1000000).toFixed(2))}M</td>
      </tr>`).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>🔍 Funnel Analysis:</strong> The funnel shows <span class="highlight">${funnel[0].count} opportunities at the initial stage</span>. Track progression between stages to identify bottlenecks and optimize sales process efficiency.
    </div>
  </section>

  <section>
    <h2>${safe(reportMeta.key === 'all' ? 'Complete Tender Register' : 'Portfolio Snapshot')}</h2>
    <p class="portfolio-caption">${safe(reportMeta.key === 'all' ? 'All opportunities inside the selected report duration, ordered by RFP Received date.' : 'Most recent opportunities inside the selected report duration, ordered by RFP Received date.')}</p>
    <table>
      <thead>
        <tr>
          <th>AVE No.</th>
          <th>ADNOC Ref No.</th>
          <th>Tender Name</th>
          <th>Client</th>
          <th>Received</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
      ${portfolioRows.map((row) => `<tr>
        <td><strong>${safe(row.opportunityRefNo || '—')}</strong></td>
        <td>${safe(getAdnocRftNo(row) || '—')}</td>
        <td><strong>${safe(row.tenderName || 'Untitled Tender')}</strong></td>
        <td>${safe(row.clientName || '—')}</td>
        <td>${safe(row.dateTenderReceived || '—')}</td>
        <td>${safe(row.tenderResult || row.avenirStatus || row.canonicalStage || 'UNSPECIFIED')}</td>
      </tr>`).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>📌 Portfolio View:</strong> This section expands beyond only five tenders and reflects the selected reporting duration so the snapshot feels aligned with the report scope.
    </div>
  </section>

  <section>
    <h2>Top 10 Clients by Pipeline Value</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 40%;">Client Name</th>
          <th>Opportunities</th>
          <th>Submitted Value</th>
          <th>Ranking</th>
        </tr>
      </thead>
      <tbody>
      ${clients.map((row, i) => `<tr>
        <td><strong>${safe(row.name)}</strong></td>
        <td>${safe(row.count)}</td>
        <td class="highlight">$${safe((row.value / 1000000).toFixed(2))}M</td>
        <td>#${i + 1}</td>
      </tr>`).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>🎯 Client Strategy:</strong> Your top client <span class="highlight">${safe(clients[0]?.name || 'N/A')}</span> represents significant opportunity. Develop targeted engagement strategies for top 5 clients to maximize revenue potential.
    </div>
  </section>

  <footer>
    <p>This report is generated automatically from your Sales Pipeline Management System.</p>
    <p>For data accuracy and strategic questions, please contact your Sales Operations team.</p>
    <p style="margin-top: 10px; font-size: 11px; opacity: 0.7;">© ${new Date().getFullYear()} Sales Intelligence Report</p>
  </footer>
</div>
</body>
</html>`;
}

export function ReportButton({ data, filters }: ReportButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [durationKey, setDurationKey] = useState<ReportDurationKey>('90d');

  const reportData = useMemo(() => filterDataByDuration(data, durationKey), [data, durationKey]);
  const reportMeta = useMemo(() => getDurationMeta(durationKey), [durationKey]);

  const handleExportHTML = () => {
    const blob = new Blob([toHtml(filters, reportData, reportMeta)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `sales-analytics-report-${stamp}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setIsDialogOpen(false);
  };

  const handleExportWord = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: reportData, filters, reportMeta }),
      });

      if (!response.ok) throw new Error('Failed to generate Word document');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `sales-analytics-report-${stamp}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error generating Word document:', error);
      alert('Failed to generate Word document. Please try again.');
    }
  };

  return (
    <>
      <Button className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg hover:from-blue-700 hover:to-blue-800" onClick={() => setIsDialogOpen(true)}>
        <FileText className="h-4 w-4" />
        Report
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate sales report</DialogTitle>
            <DialogDescription>
              Choose the report duration first. The report uses your current dashboard filters and then applies the selected time window on top.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Report duration</p>
              <p className="mt-1 text-sm text-slate-600">Based on RFP Received date where available.</p>
            </div>

            <RadioGroup value={durationKey} onValueChange={(value) => setDurationKey(value as ReportDurationKey)} className="gap-3">
              {REPORT_DURATION_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  htmlFor={`report-duration-${option.key}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <RadioGroupItem id={`report-duration-${option.key}`} value={option.key} />
                  <div className="space-y-1">
                    <Label htmlFor={`report-duration-${option.key}`} className="cursor-pointer text-sm font-medium">
                      {option.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-medium">Selected window</div>
              <div className="mt-1">{reportMeta.label} • {reportMeta.rangeLabel}</div>
              <div className="mt-1">{reportData.length} opportunit{reportData.length === 1 ? 'y' : 'ies'} included after applying the time window.</div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={handleExportHTML} disabled={!reportData.length}>
              <FileText className="mr-2 h-4 w-4" />
              HTML Report
            </Button>
            <Button type="button" onClick={handleExportWord} disabled={!reportData.length}>
              <Download className="mr-2 h-4 w-4" />
              Word Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
