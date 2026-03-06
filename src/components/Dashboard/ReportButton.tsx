import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Opportunity, calculateFunnelData, calculateSummaryStats, getClientData, getLeaderboardData } from '@/data/opportunityData';
import { FilterState } from '@/components/Dashboard/AdvancedFilters';

interface ReportButtonProps {
  data: Opportunity[];
  filters: FilterState;
}

function toHtml(filters: FilterState, data: Opportunity[]) {
  const summary = calculateSummaryStats(data);
  const funnel = calculateFunnelData(data);
  const clients = getClientData(data);
  const leads = getLeaderboardData(data);
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

  // Calculate additional metrics
  const totalOpportunities = data.length;
  const totalPipelineValue = data.reduce((sum, o) => sum + (o.opportunityValue || 0), 0);
  const totalExpectedValue = data.reduce((sum, o) => sum + (o.expectedValue || 0), 0);
  const winRate = summary.wonCount + summary.lostCount > 0 
    ? Math.round((summary.wonCount / (summary.wonCount + summary.lostCount)) * 100)
    : 0;

  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>Sales Pipeline Report</title>
<style>
* { margin: 0; padding: 0; }
body { 
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
  background: #f8fafc; 
  color: #0f172a; 
  line-height: 1.6;
}
.container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
header { 
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: white;
  padding: 30px;
  border-radius: 8px;
  margin-bottom: 30px;
}
header h1 { font-size: 28px; margin-bottom: 5px; }
header p { opacity: 0.8; font-size: 14px; }
.timestamp { font-size: 12px; opacity: 0.6; margin-top: 10px; }

section { 
  background: white;
  padding: 25px;
  margin-bottom: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
h2 { 
  color: #1e293b;
  font-size: 18px;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e2e8f0;
}
h3 { 
  color: #334155;
  font-size: 14px;
  margin: 15px 0 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
.metric-card { 
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 15px;
  text-align: center;
}
.metric-label { 
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}
.metric-value { 
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}
.metric-unit { 
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.filters {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 15px;
}
.filters p {
  font-size: 13px;
  color: #166534;
}

table { 
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 15px;
}
th { 
  background: #f1f5f9;
  color: #334155;
  padding: 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  border-bottom: 2px solid #e2e8f0;
}
td { 
  padding: 11px 12px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
tr:last-child td { border-bottom: none; }
tr:nth-child(even) { background: #f8fafc; }

.highlight { color: #0c63e4; font-weight: 600; }
.positive { color: #16a34a; font-weight: 600; }
.negative { color: #dc2626; font-weight: 600; }
.warning { color: #ea580c; font-weight: 600; }

.summary-text {
  background: #eff6ff;
  border-left: 4px solid #0c63e4;
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  margin: 10px 0;
  line-height: 1.5;
}

footer {
  text-align: center;
  padding: 20px;
  color: #64748b;
  font-size: 12px;
  border-top: 1px solid #e2e8f0;
  margin-top: 40px;
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>📊 SALES PIPELINE REPORT</h1>
    <p>Executive Summary & Detailed Analytics</p>
    <div class="timestamp">Generated: ${safe(generatedAt)} | Total Records: ${safe(totalOpportunities)}</div>
  </header>

  <!-- FILTERS SECTION -->
  <section>
    <h2>Applied Filters</h2>
    <div class="filters">
      <p><strong>Active Filters:</strong> ${activeFilters.length ? activeFilters.map((item) => safe(item)).join(' • ') : 'None (all data shown)'}</p>
    </div>
  </section>

  <!-- KEY METRICS SECTION -->
  <section>
    <h2>Key Performance Indicators</h2>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Total Opportunities</div>
        <div class="metric-value">${safe(totalOpportunities)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Win Rate</div>
        <div class="metric-value" style="color: ${winRate >= 70 ? '#16a34a' : winRate >= 50 ? '#ea580c' : '#dc2626'}">${safe(winRate)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pipeline Value</div>
        <div class="metric-value">$${safe(Math.round(totalPipelineValue / 1000000))}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Expected Value</div>
        <div class="metric-value positive">$${safe(Math.round(totalExpectedValue / 1000000))}M</div>
      </div>
    </div>

    <div class="summary-text">
      <strong>Summary:</strong> Currently tracking <span class="highlight">${safe(summary.totalActive)} active opportunities</span> with a <span class="highlight">${safe(totalPipelineValue.toFixed(0))}</span> total pipeline value. <span class="positive">${safe(summary.wonCount)} opportunities won</span> and <span class="negative">${safe(summary.lostCount)} lost</span> to date.
    </div>
  </section>

  <!-- STAGE BREAKDOWN SECTION -->
  <section>
    <h2>Sales Funnel Analysis</h2>
    <table>
      <thead>
        <tr>
          <th>Stage</th>
          <th>Count</th>
          <th>Pipeline Value</th>
          <th>Conversion %</th>
          <th>Avg Opportunity Value</th>
        </tr>
      </thead>
      <tbody>
      ${funnel.map((row) => {
        const avgValue = row.count > 0 ? (row.value / row.count).toFixed(0) : 0;
        return `<tr>
          <td><strong>${safe(row.stage)}</strong></td>
          <td>${safe(row.count)}</td>
          <td class="highlight">$${safe((row.value / 1000000).toFixed(2))}M</td>
          <td>${safe(row.conversionRate)}%</td>
          <td>$${safe((avgValue / 1000000).toFixed(2))}M</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </section>

  <!-- STATUS BREAKDOWN -->
  <section>
    <h2>Opportunity Status Breakdown</h2>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">✅ Working</div>
        <div class="metric-value">${safe(summary.workingCount)}</div>
        <div class="metric-unit">$${safe((summary.workingValue / 1000000).toFixed(1))}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🏆 Awarded</div>
        <div class="metric-value positive">${safe(summary.awardedCount)}</div>
        <div class="metric-unit">$${safe((summary.awardedValue / 1000000).toFixed(1))}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">❌ Lost</div>
        <div class="metric-value negative">${safe(summary.lostCount)}</div>
        <div class="metric-unit">$${safe((summary.lostValue / 1000000).toFixed(1))}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">📋 Regretted</div>
        <div class="metric-value warning">${safe(summary.regrettedCount)}</div>
        <div class="metric-unit">$${safe((summary.regrettedValue / 1000000).toFixed(1))}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">⏱️ At Risk</div>
        <div class="metric-value negative">${safe(summary.atRiskCount)}</div>
        <div class="metric-unit">Urgent Attention</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🚀 To Start</div>
        <div class="metric-value">${safe(summary.toStartCount)}</div>
        <div class="metric-unit">$${safe((summary.toStartValue / 1000000).toFixed(1))}M</div>
      </div>
    </div>
  </section>

  <!-- TOP CLIENTS SECTION -->
  <section>
    <h2>Top 10 Clients by Pipeline Value</h2>
    <table>
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Opportunities</th>
          <th>Submitted Value</th>
          <th>Avg Opportunity</th>
        </tr>
      </thead>
      <tbody>
      ${clients.map((row) => {
        const avgValue = row.count > 0 ? (row.value / row.count).toFixed(0) : 0;
        return `<tr>
          <td><strong>${safe(row.name)}</strong></td>
          <td>${safe(row.count)}</td>
          <td class="highlight">$${safe((row.value / 1000000).toFixed(2))}M</td>
          <td>$${safe((avgValue / 1000000).toFixed(2))}M</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </section>

  <!-- TOP LEADS SECTION -->
  <section>
    <h2>Sales Team Performance</h2>
    <table>
      <thead>
        <tr>
          <th>Lead Name</th>
          <th>Total Opps</th>
          <th>Pipeline Value</th>
          <th>Won</th>
          <th>Lost</th>
          <th>Win Rate</th>
        </tr>
      </thead>
      <tbody>
      ${leads.slice(0, 15).map((row) => `<tr>
        <td><strong>${safe(row.name)}</strong></td>
        <td>${safe(row.count)}</td>
        <td class="highlight">$${safe((row.value / 1000000).toFixed(2))}M</td>
        <td class="positive">${safe(row.won)}</td>
        <td class="negative">${safe(row.lost)}</td>
        <td style="color: ${row.winRate >= 70 ? '#16a34a' : row.winRate >= 50 ? '#ea580c' : '#dc2626'}"><strong>${safe(row.winRate)}%</strong></td>
      </tr>`).join('')}
      </tbody>
    </table>
  </section>

  <footer>
    <p>This is an automated report generated from your sales pipeline system.</p>
    <p>For questions or to request changes, please contact your sales operations team.</p>
  </footer>
</div>
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
    link.download = `sales-pipeline-report-${stamp}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button 
      onClick={handleExportReport} 
      className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg"
    >
      <FileText className="h-4 w-4" />
      Generate Report
    </Button>
  );
}
