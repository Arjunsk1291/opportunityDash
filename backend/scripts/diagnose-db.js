import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SyncedOpportunity from '../models/SyncedOpportunity.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI (or MONGO_URI) is required.');
}

async function run() {
  const startConnect = Date.now();
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected successfully in ${Date.now() - startConnect}ms`);

  const count = await SyncedOpportunity.countDocuments();
  console.log(`Total SyncedOpportunity documents: ${count}`);

  const startQuery = Date.now();
  console.log('Querying opportunities (excluding rawGoogleData)...');
  const docs = await SyncedOpportunity.find({}, { rawGoogleData: 0 })
    .sort({ createdAt: -1 })
    .lean();
  console.log(`Retrieved ${docs.length} documents in ${Date.now() - startQuery}ms`);

  // Measure size of documents returned
  const sizeBytes = Buffer.byteLength(JSON.stringify(docs));
  console.log(`Total size of retrieved data: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
