import mongoose from 'mongoose';
import PqActivity, { getPqModel } from './backend/models/PqActivity.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/avenir';

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const totalDocs = await PqActivity.countDocuments();
    console.log(`Found ${totalDocs} documents in pq_activities`);

    const tenants = [
      'avenir_abudhabi',
      'avenir_india',
      'bcts_dubai',
      'bcts_abudhabi',
      'avenir_energy',
    ];

    for (const tenant of tenants) {
      const docs = await PqActivity.find({ tenant }).lean();
      console.log(`Migrating ${docs.length} documents for tenant: ${tenant}`);

      if (docs.length > 0) {
        const Model = getPqModel(tenant);
        // Clear existing docs in target collection to avoid duplicates if rerun
        await Model.deleteMany({ tenant });
        await Model.insertMany(docs);
        console.log(`Inserted ${docs.length} documents into ${Model.collection.name}`);
      }
    }

    // Handle 'others' or any other tenants not in the list
    const otherDocs = await PqActivity.find({ tenant: { $nin: tenants } }).lean();
    if (otherDocs.length > 0) {
       console.log(`Migrating ${otherDocs.length} documents for other tenants`);
       const Model = getPqModel('other');
       await Model.deleteMany({});
       await Model.insertMany(otherDocs);
       console.log(`Inserted ${otherDocs.length} documents into ${Model.collection.name}`);
    }

    console.log('Migration complete');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
