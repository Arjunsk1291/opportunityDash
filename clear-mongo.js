import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SyncedOpportunity from './backend/models/SyncedOpportunity.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

async function clearData() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🗑️  Clearing SyncedOpportunity collection...');
    const result = await SyncedOpportunity.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} records from SyncedOpportunity`);

    console.log('\n📊 Collection stats:');
    const count = await SyncedOpportunity.countDocuments();
    console.log(`   Total documents remaining: ${count}`);

    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearData();
