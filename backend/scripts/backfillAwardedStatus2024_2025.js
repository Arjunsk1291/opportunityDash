import 'dotenv/config';
import mongoose from 'mongoose';
import SyncedOpportunity from '../models/SyncedOpportunity.js';
import OpportunityChangeLog from '../models/OpportunityChangeLog.js';
import { deriveOpportunityStatusFields } from '../services/opportunityStatusService.js';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const rollbackIdx = args.indexOf('--rollback-batch');
const rollbackBatchId = rollbackIdx >= 0 ? String(args[rollbackIdx + 1] || '').trim() : '';
const batchId = `status-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function normalizeRefKey(value = '') {
  return String(value || '').trim().toUpperCase();
}

function toYear(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/\b(20\d{2})\b/);
  return match ? match[1] : '';
}

function isTargetYear(opportunity = {}) {
  const sheetYear = toYear(opportunity.rawSheetYear);
  if (sheetYear === '2024' || sheetYear === '2025') return true;

  const dateCandidates = [
    opportunity.dateTenderReceived,
    opportunity.tenderSubmittedDate,
    opportunity.tenderPlannedSubmissionDate,
    opportunity.awardedDate,
  ];

  return dateCandidates.some((value) => {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    const year = parsed.getUTCFullYear();
    return year === 2024 || year === 2025;
  });
}

function buildRecomputedStatus(opp = {}) {
  return deriveOpportunityStatusFields({
    rawAvenirStatus: opp.rawAvenirStatus,
    rawTenderResult: opp.rawTenderResult,
    fallbackAvenirStatus: opp.avenirStatus,
    fallbackTenderResult: opp.tenderResult,
    fallbackCanonicalStage: opp.canonicalStage,
    dateTenderReceived: opp.dateTenderReceived,
    tenderPlannedSubmissionDate: opp.tenderPlannedSubmissionDate,
    tenderSubmittedDate: opp.tenderSubmittedDate,
    awardedDate: opp.awardedDate,
    remarksReason: opp.remarksReason,
    comments: opp.comments,
    tenderStatusRemark: opp.tenderStatusRemark,
  });
}

function collectDiffs(previous = {}, next = {}) {
  const keys = ['rawAvenirStatus', 'rawTenderResult', 'avenirStatus', 'tenderResult', 'canonicalStage', 'combinedStatuses'];
  return keys
    .map((fieldKey) => {
      const previousValue = previous[fieldKey] ?? null;
      const nextValue = next[fieldKey] ?? null;
      const changed = JSON.stringify(previousValue) !== JSON.stringify(nextValue);
      return changed ? { fieldKey, previousValue, nextValue } : null;
    })
    .filter(Boolean);
}

async function runRollback() {
  if (!rollbackBatchId) {
    throw new Error('Missing batch id. Usage: --rollback-batch <batchId>');
  }

  const logs = await OpportunityChangeLog.find({
    source: 'status_backfill_awarded_2024_2025',
    action: 'status_backfill_awarded_rollbackable',
    'fieldDiffs.note': `batch:${rollbackBatchId}`,
  }).lean();

  if (!logs.length) {
    console.log(`No change logs found for batch ${rollbackBatchId}`);
    return;
  }

  const rollbackOps = [];
  logs.forEach((log) => {
    const refKey = normalizeRefKey(log?.refKey || '');
    if (!refKey) return;
    const setPayload = {};
    (log.fieldDiffs || []).forEach((diff) => {
      if (String(diff?.note || '') !== `batch:${rollbackBatchId}`) return;
      setPayload[diff.fieldKey] = diff.previousValue ?? null;
    });
    if (!Object.keys(setPayload).length) return;
    rollbackOps.push({
      updateOne: {
        filter: { opportunityRefNo: log.opportunityRefNo },
        update: { $set: setPayload },
      },
    });
  });

  if (!rollbackOps.length) {
    console.log(`No rollback operations generated for batch ${rollbackBatchId}`);
    return;
  }

  await SyncedOpportunity.bulkWrite(rollbackOps, { ordered: false });
  console.log(`Rollback applied for batch ${rollbackBatchId}. Rows reverted: ${rollbackOps.length}`);
}

async function runBackfill() {
  const opportunities = await SyncedOpportunity.find({}).lean();
  const candidates = opportunities.filter((opp) => isTargetYear(opp));

  const changes = candidates
    .map((opp) => {
      const recomputed = buildRecomputedStatus(opp);
      const diffs = collectDiffs(opp, recomputed);
      if (!diffs.length) return null;
      return { opp, recomputed, diffs };
    })
    .filter(Boolean);

  console.log(`Scanned ${opportunities.length} rows. Target-year rows: ${candidates.length}. Changed rows: ${changes.length}.`);
  if (!changes.length) return;

  const preview = changes.slice(0, 20).map((entry) => ({
    ref: entry.opp.opportunityRefNo,
    from: entry.opp.canonicalStage,
    to: entry.recomputed.canonicalStage,
  }));
  console.table(preview);

  if (!applyMode) {
    console.log('Dry run complete. Re-run with --apply to persist changes.');
    return;
  }

  const updateOps = [];
  const logDocs = [];
  changes.forEach((entry) => {
    updateOps.push({
      updateOne: {
        filter: { _id: entry.opp._id },
        update: {
          $set: {
            rawAvenirStatus: entry.recomputed.rawAvenirStatus,
            rawTenderResult: entry.recomputed.rawTenderResult,
            avenirStatus: entry.recomputed.avenirStatus,
            tenderResult: entry.recomputed.tenderResult,
            canonicalStage: entry.recomputed.canonicalStage,
            combinedStatuses: entry.recomputed.combinedStatuses,
          },
        },
      },
    });

    logDocs.push({
      opportunityRefNo: String(entry.opp.opportunityRefNo || ''),
      refKey: normalizeRefKey(entry.opp.opportunityRefNo || ''),
      action: 'status_backfill_awarded_rollbackable',
      source: 'status_backfill_awarded_2024_2025',
      changedBy: 'system_backfill_script',
      changedByDisplayName: 'System Backfill Script',
      changedByRole: 'Master',
      changedAt: new Date(),
      fieldDiffs: entry.diffs.map((diff) => ({
        fieldKey: diff.fieldKey,
        previousValue: diff.previousValue,
        nextValue: diff.nextValue,
        note: `batch:${batchId}`,
      })),
    });
  });

  if (updateOps.length) {
    await SyncedOpportunity.bulkWrite(updateOps, { ordered: false });
  }
  if (logDocs.length) {
    await OpportunityChangeLog.insertMany(logDocs, { ordered: false });
  }

  console.log(`Applied status backfill for ${changes.length} rows.`);
  console.log(`Rollback batch id: ${batchId}`);
  console.log(`Rollback command: node scripts/backfillAwardedStatus2024_2025.js --rollback-batch ${batchId}`);
}

async function main() {
  if (!uri) {
    throw new Error('MONGODB_URI (or MONGO_URI) is required.');
  }

  await mongoose.connect(uri);
  try {
    if (rollbackBatchId) await runRollback();
    else await runBackfill();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('[status-backfill.error]', error?.message || error);
  process.exit(1);
});
