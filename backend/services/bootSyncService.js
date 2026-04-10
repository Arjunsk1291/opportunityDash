import { syncTendersFromGraph, transformTendersToOpportunities } from './dataSyncService.js';
import SyncedOpportunity from '../models/SyncedOpportunity.js';
import GraphSyncConfig from '../models/GraphSyncConfig.js';
import OpportunityManualUpdate from '../models/OpportunityManualUpdate.js';
import { applyManualOverridesToOpportunity, normalizeRefKey } from './opportunityManualUpdateService.js';

export async function initializeBootSync() {
  try {
    const config = await GraphSyncConfig.findOne().lean();
    if (!config?.driveId || !config?.fileId || !config?.worksheetName) {
      console.log('ℹ️  BOOT SYNC skipped: Graph Excel config not set yet.');
      return { success: false, message: 'Graph config missing, boot sync skipped' };
    }

    console.log('🚀 BOOT SYNC: syncing from Microsoft Graph Excel...');

    const tenders = await syncTendersFromGraph(config);
    const opportunities = await transformTendersToOpportunities(tenders);

    const existingOpportunityMeta = await SyncedOpportunity.find(
      {},
      {
        opportunityRefNo: 1,
        postBidDetailType: 1,
        postBidDetailOther: 1,
        postBidDetailUpdatedBy: 1,
        postBidDetailUpdatedAt: 1,
      }
    ).lean();
    const metaByRef = new Map(
      existingOpportunityMeta
        .map((row) => [String(row?.opportunityRefNo || '').trim().toUpperCase(), row])
        .filter(([ref]) => Boolean(ref))
    );
    const manualUpdates = await OpportunityManualUpdate.find({}).lean();
    const manualByRef = new Map(
      manualUpdates
        .map((row) => [normalizeRefKey(row?.opportunityRefNo || row?.refKey || ''), row])
        .filter(([ref]) => Boolean(ref))
    );

    const opportunitiesForInsert = opportunities.map((opportunity) => {
      const refKey = String(opportunity?.opportunityRefNo || '').trim().toUpperCase();
      const metaSnapshot = refKey ? metaByRef.get(refKey) : null;
      const manualSnapshot = refKey ? manualByRef.get(normalizeRefKey(refKey)) : null;
      const { opportunity: mergedOpportunity } = applyManualOverridesToOpportunity(opportunity, manualSnapshot);

      return {
        ...mergedOpportunity,
        postBidDetailType: metaSnapshot?.postBidDetailType || mergedOpportunity?.postBidDetailType || '',
        postBidDetailOther: metaSnapshot?.postBidDetailOther || mergedOpportunity?.postBidDetailOther || '',
        postBidDetailUpdatedBy: metaSnapshot?.postBidDetailUpdatedBy || mergedOpportunity?.postBidDetailUpdatedBy || '',
        postBidDetailUpdatedAt: metaSnapshot?.postBidDetailUpdatedAt || mergedOpportunity?.postBidDetailUpdatedAt || null,
      };
    });

    await SyncedOpportunity.deleteMany({});
    const insertResult = await SyncedOpportunity.insertMany(opportunitiesForInsert);

    await GraphSyncConfig.updateOne({ _id: config._id }, { $set: { lastSyncAt: new Date() } });

    return {
      success: true,
      syncedCount: insertResult.length,
      message: `Boot sync successful: ${insertResult.length} tenders loaded`,
    };
  } catch (error) {
    console.error('❌ BOOT SYNC ERROR:', error.message);
    return {
      success: false,
      error: error.message,
      message: 'Boot sync failed',
    };
  }
}
