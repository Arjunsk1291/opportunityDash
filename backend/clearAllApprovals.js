import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Approval from './models/Approval.js';

dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Delete ALL approvals
    const result = await Approval.deleteMany({});
    console.log('🗑️ Deleted ' + result.deletedCount + ' ALL approval records');
    console.log('✅ Approvals cleared - ready for new Google Sheet sync');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
