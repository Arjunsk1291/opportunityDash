import mongoose from 'mongoose';
import SyncedOpportunity from './backend/models/SyncedOpportunity.js';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Check one document
    const sample = await SyncedOpportunity.findOne();
    console.log('\n📋 Sample document:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Check if tenderResult field exists
    const withTenderResult = await SyncedOpportunity.countDocuments({ tenderResult: { $exists: true } });
    console.log(`\n📊 Documents with tenderResult field: ${withTenderResult}`);
    
    const total = await SyncedOpportunity.countDocuments();
    console.log(`📊 Total documents: ${total}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
