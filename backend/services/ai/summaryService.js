import { buildLossThemes } from './lossThemeService.js';
import { getDisplayStatus, normalizeText, normalizeRefNo } from './utils.js';

const formatList = (items = []) => items.filter(Boolean).slice(0, 3).join(', ');

export async function buildDrilldownSummary({ rows = [], title = 'Selection' } = {}) {
  const totalRows = rows.length;
  const statusCounts = rows.reduce((acc, row) => {
    const status = getDisplayStatus(row) || 'UNKNOWN';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const groupCounts = rows.reduce((acc, row) => {
    const group = normalizeRefNo(row?.groupClassification) || 'UNKNOWN';
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});
  const clientCounts = rows.reduce((acc, row) => {
    const client = normalizeText(row?.clientName) || 'Unknown';
    acc[client] = (acc[client] || 0) + 1;
    return acc;
  }, {});

  const topStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topGroups = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lossThemes = await buildLossThemes(rows);

  const bullets = [
    `${title} contains ${totalRows} row${totalRows === 1 ? '' : 's'}.`,
    topStatuses.length ? `Top statuses: ${formatList(topStatuses.map(([label, count]) => `${label} (${count})`))}.` : '',
    topGroups.length ? `Top verticals: ${formatList(topGroups.map(([label, count]) => `${label} (${count})`))}.` : '',
    topClients.length ? `Top clients: ${formatList(topClients.map(([label, count]) => `${label} (${count})`))}.` : '',
    lossThemes.length ? `Recurring theme: ${lossThemes[0].label} (${lossThemes[0].count}).` : '',
  ].filter(Boolean).slice(0, 4);

  return {
    bullets,
    stats: {
      totalRows,
      statusCounts,
      groupCounts,
      clientCounts,
    },
  };
}
