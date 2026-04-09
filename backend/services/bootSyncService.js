import { syncTendersFromGraph, transformTendersToOpportunities } from './dataSyncService.js';
import SyncedOpportunity from '../models/SyncedOpportunity.js';
import GraphSyncConfig from '../models/GraphSyncConfig.js';

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

    const opportunitiesForInsert = opportunities.map((opportunity) => {
      const refKey = String(opportunity?.opportunityRefNo || '').trim().toUpperCase();
      const metaSnapshot = refKey ? metaByRef.get(refKey) : null;

      return {
        ...opportunity,
        postBidDetailType: metaSnapshot?.postBidDetailType || opportunity?.postBidDetailType || '',
        postBidDetailOther: metaSnapshot?.postBidDetailOther || opportunity?.postBidDetailOther || '',
        postBidDetailUpdatedBy: metaSnapshot?.postBidDetailUpdatedBy || opportunity?.postBidDetailUpdatedBy || '',
        postBidDetailUpdatedAt: metaSnapshot?.postBidDetailUpdatedAt || opportunity?.postBidDetailUpdatedAt || null,
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
