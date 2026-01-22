import { syncTendersFromGoogleSheets, transformTendersToOpportunities } from './dataSyncService.js';
import SyncedOpportunity from '../models/SyncedOpportunity.js';

export async function initializeBootSync() {
  try {
    console.log('\n📊 ════════════════════════════════════════');
    console.log('🚀 BOOT SYNC: Starting automatic data sync...');
    console.log('📊 ════════════════════════════════════════\n');

    const existingCount = await SyncedOpportunity.countDocuments();
    console.log(`📋 Current documents in MongoDB: ${existingCount}`);

    console.log('📡 Fetching data from Google Sheets...');
    const tenders = await syncTendersFromGoogleSheets();
    console.log(`✅ Fetched ${tenders.length} tenders from Google Sheets`);

    const opportunities = await transformTendersToOpportunities(tenders);
    console.log(`✅ Transformed ${opportunities.length} opportunities`);

    const deleteResult = await SyncedOpportunity.deleteMany({});
    console.log(`✅ Cleared ${deleteResult.deletedCount} old documents`);

    const insertResult = await SyncedOpportunity.insertMany(opportunities);
    console.log(`✅ Inserted ${insertResult.length} new opportunities into MongoDB`);

    console.log('\n📊 ════════════════════════════════════════');
    console.log('✅ BOOT SYNC COMPLETE!');
    console.log(`📊 Total records synced: ${insertResult.length}`);
    console.log('📊 ════════════════════════════════════════\n');

    return {
      success: true,
      syncedCount: insertResult.length,
      message: `Boot sync successful: ${insertResult.length} tenders loaded`,
    };
  } catch (error) {
    console.error('\n❌ BOOT SYNC ERROR:', error.message);
    console.log('⚠️  Continuing with empty database...\n');
    return {
      success: false,
      error: error.message,
      message: 'Boot sync failed, database may be empty',
    };
  }
}
