import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import SystemConfig from '../models/SystemConfig.js';
import SyncedOpportunity from '../models/SyncedOpportunity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

const normalizeRefNo = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const buildSignature = (opportunity) => {
  const parts = [
    opportunity?.opportunityRefNo || '',
    opportunity?.tenderName || '',
    opportunity?.clientName || '',
    opportunity?.groupClassification || '',
    opportunity?.opportunityClassification || '',
    opportunity?.dateTenderReceived || '',
  ];

  return parts.map((part) => String(part || '').trim().toUpperCase()).join('||');
};

const getRefNo = (opportunity) => {
  const direct = normalizeRefNo(opportunity?.opportunityRefNo || '');
  if (direct) return direct;
  return normalizeRefNo(opportunity?.rawGraphData?.rowSnapshot?.['TENDER NO'] || '');
};

const buildNotificationKey = (opportunity) => {
  const ref = getRefNo(opportunity);
  if (ref) return `REF::${ref}`;
  const signature = buildSignature(opportunity);
  return signature ? `SIG::${signature}` : '';
};

async function run() {
  await mongoose.connect(MONGODB_URI);

  let config = await SystemConfig.findOne();
  if (!config) config = await SystemConfig.create({});

  const opportunities = await SyncedOpportunity.find({}, {
    opportunityRefNo: 1,
    tenderName: 1,
    clientName: 1,
    groupClassification: 1,
    opportunityClassification: 1,
    dateTenderReceived: 1,
    rawGraphData: 1,
  }).lean();

  const alertedKeys = new Set(Array.isArray(config.telecastAlertedKeys) ? config.telecastAlertedKeys : []);
  const alertedRefs = new Set(
    Array.isArray(config.telecastAlertedRefNos)
      ? config.telecastAlertedRefNos.map((ref) => normalizeRefNo(ref)).filter(Boolean)
      : []
  );

  for (const row of opportunities) {
    const key = buildNotificationKey(row);
    if (key) alertedKeys.add(key);

    const refNo = getRefNo(row);
    if (refNo) alertedRefs.add(refNo);
  }

  const now = new Date();
  config.telecastAlertedKeys = Array.from(alertedKeys).slice(-50000);
  config.telecastAlertedRefNos = Array.from(alertedRefs).slice(-50000);
  config.telecastAlertSeededAt = config.telecastAlertSeededAt || now;
  config.telecastAlertSeededCount = config.telecastAlertSeededCount || opportunities.length;
  config.notificationLastCheckedAt = now;
  config.updatedBy = 'seedTelecastAlertHistoryScript';
  await config.save();

  console.log(JSON.stringify({
    success: true,
    mongodbUri: MONGODB_URI,
    syncedOpportunities: opportunities.length,
    telecastAlertedKeys: config.telecastAlertedKeys.length,
    telecastAlertedRefNos: config.telecastAlertedRefNos.length,
    telecastAlertSeededAt: config.telecastAlertSeededAt,
    telecastAlertSeededCount: config.telecastAlertSeededCount,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('seedTelecastAlertHistory failed:', error?.message || error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
