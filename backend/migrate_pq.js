import mongoose from 'mongoose';
import PqActivity, { getPqModel } from './models/PqActivity.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/avenir';

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);

    const totalDocs = await PqActivity.countDocuments();

    const tenants = [
      'avenir_abudhabi',
      'avenir_india',
      'bcts_dubai',
      'bcts_abudhabi',
      'avenir_energy',
    ];

    for (const tenant of tenants) {
      const docs = await PqActivity.find({ tenant }).lean();

      if (docs.length > 0) {
        const Model = getPqModel(tenant);
        // Clear existing docs in target collection to avoid duplicates if rerun
        await Model.deleteMany({ tenant });
        await Model.insertMany(docs);
      }
    }

    // Handle 'others' or any other tenants not in the list
    const otherDocs = await PqActivity.find({ tenant: { $nin: tenants } }).lean();
    if (otherDocs.length > 0) {
       const Model = getPqModel('other');
       await Model.deleteMany({});
       await Model.insertMany(otherDocs);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
