import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

type KpiDiagnosticEntry = {
  id: string;
  refNo: string;
  tenderName: string;
  clientName: string;
  journeyType: 'tender' | 'eoi';
  status: string;
  reasonCode?: string;
  reason: string;
  reasonMeta?: Record<string, unknown>;
  replacement?: {
    id: string;
    refNo: string;
    tenderName: string;
    status: string;
  };
};

type KpiDiagnosticsReport = {
  reportId: string;
  generatedAt: string;
  kpiType: string;
  appliedFilters: {
    statuses: string[];
    showAtRisk: boolean;
    excludeLostOutcomes: boolean;
  };
  counts: {
    sourceRows: number;
    preKpiScopedRows: number;
    includedRows: number;
    omittedRows: number;
  };
  included: KpiDiagnosticEntry[];
  omitted: KpiDiagnosticEntry[];
  truncated?: boolean;
};

const readReport = (id: string | null): KpiDiagnosticsReport | null => {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(`kpi-diagnostics:${id}`)
      ?? sessionStorage.getItem(`kpi-diagnostics:${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as KpiDiagnosticsReport;
  } catch {
    return null;
  }
};

const DiagnosticsTable = ({ title, rows }: { title: string; rows: KpiDiagnosticEntry[] }) => (
  <div className="analytics-card p-4 sm:p-5">
    <h2 className="text-sm font-semibold text-slate-800">{title} ({rows.length})</h2>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[1180px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 pr-3">Ref</th>
            <th className="py-2 pr-3">Tender Name</th>
            <th className="py-2 pr-3">Client</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Reason</th>
            <th className="py-2 pr-3">Meta</th>
            <th className="py-2 pr-3">Considered Instead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.id}`} className="border-b border-slate-100 align-top text-slate-700">
              <td className="py-2 pr-3">{row.refNo || '-'}</td>
              <td className="py-2 pr-3">{row.tenderName || '-'}</td>
              <td className="py-2 pr-3">{row.clientName || '-'}</td>
              <td className="py-2 pr-3 uppercase">{row.journeyType}</td>
              <td className="py-2 pr-3">{row.status || '-'}</td>
              <td className="py-2 pr-3 font-mono">{row.reasonCode || '-'}</td>
              <td className="py-2 pr-3">{row.reason}</td>
              <td className="py-2 pr-3 font-mono text-[10px] text-slate-600">
                {row.reasonMeta ? JSON.stringify(row.reasonMeta) : '-'}
              </td>
              <td className="py-2 pr-3">
                {row.replacement
                  ? `${row.replacement.refNo || '-'} | ${row.replacement.tenderName || '-'} | ${row.replacement.status || '-'}`
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const KpiDiagnostics = () => {
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('report');
  const view = (searchParams.get('view') || 'all').toLowerCase();

  const report = useMemo(() => readReport(reportId), [reportId]);
  const duplicateRows = useMemo(
    () => {
      const base = (report?.omitted || []).filter((row) => Boolean(row.replacement));
      if (String(report?.kpiType || '').toLowerCase() === 'value') {
        return base.filter((row) => String(row.status || '').trim().toUpperCase() === 'AWARDED');
      }
      return base;
    },
    [report],
  );
  const omittedRows = useMemo(
    () => {
      const base = (report?.omitted || []).filter((row) => !row.replacement);
      if (String(report?.kpiType || '').toLowerCase() === 'value') {
        return base.filter((row) => String(row.status || '').trim().toUpperCase() === 'AWARDED');
      }
      return base;
    },
    [report],
  );

  if (!report) {
    return (
      <div className="space-y-4">
        <div className="analytics-card p-6">
          <h1 className="text-lg font-semibold text-slate-900">KPI Diagnostics</h1>
          <p className="mt-2 text-sm text-slate-600">No diagnostics report found for this window. Re-open from a KPI card click.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="analytics-card p-5">
        <h1 className="text-lg font-semibold text-slate-900">KPI Diagnostics: {report.kpiType.toUpperCase()}</h1>
        <p className="mt-1 text-xs text-slate-500">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
        {report.truncated ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Report truncated to fit browser storage limits. Narrow filters if you need the full omitted list.
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">Source rows: <strong>{report.counts.sourceRows}</strong></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">Pre-KPI scope: <strong>{report.counts.preKpiScopedRows}</strong></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">Included: <strong>{report.counts.includedRows}</strong></div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">Duplicates removed: <strong>{duplicateRows.length}</strong></div>
        </div>
        <div className="mt-2 text-xs text-slate-700">
          Omitted (non-duplicate): <strong>{omittedRows.length}</strong>
        </div>
        <div className="mt-3 text-xs text-slate-600">
          Applied statuses: {report.appliedFilters.statuses.length ? report.appliedFilters.statuses.join(', ') : 'none'} | showAtRisk: {String(report.appliedFilters.showAtRisk)} | excludeLostOutcomes: {String(report.appliedFilters.excludeLostOutcomes)}
        </div>
      </div>

      {view !== 'omitted' ? <DiagnosticsTable title="Included in KPI" rows={report.included} /> : null}
      <DiagnosticsTable title="Omitted from KPI" rows={omittedRows} />
      <DiagnosticsTable title="Duplicates Removed (Dedupe Only)" rows={duplicateRows} />
    </div>
  );
};

export default KpiDiagnostics;
