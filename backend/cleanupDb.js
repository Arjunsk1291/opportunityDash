import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Approval from './models/Approval.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Delete all documents with null opportunityRefNo
    const result = await Approval.deleteMany({ opportunityRefNo: null });
    console.log('Deleted ' + result.deletedCount + ' records with null opportunityRefNo');
    
    // Drop the old index if it exists
    try {
      await Approval.collection.dropIndex('opportunityId_1');
      console.log('Dropped old opportunityId_1 index');
    } catch (e) {
      console.log('Index does not exist, skipping drop');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
