import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

dotenv.config();

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const dryRun = process.argv.includes('--dry-run') || String(process.env.DRY_RUN || '').toLowerCase() === 'true';

if (!mongoUri) {
  console.error('MONGODB_URI (or MONGO_URI) is required.');
  process.exit(1);
}

const mappings = [
  {
    source: 'syncedopportunities',
    target: 'synced_opportunities__avenir_intl',
    label: 'opportunities',
  },
  {
    source: 'clients',
    target: 'clients__avenir_intl',
    label: 'clients',
  },
  {
    source: 'vendors',
    target: 'vendors__avenir_intl',
    label: 'vendors',
  },
];

const cloneDocument = (doc) => {
  const next = JSON.parse(JSON.stringify(doc));
  delete next._id;
  next.brandKey = 'avenir_intl';
  return next;
};

async function copyCollection(db, { source, target, label }) {
  const sourceCount = await db.collection(source).countDocuments();
  const targetCount = await db.collection(target).countDocuments();
  console.log(`\n[${label}] source=${source} count=${sourceCount} target=${target} count=${targetCount}`);

  if (!sourceCount) {
    console.log(`[${label}] nothing to copy`);
    return;
  }

  if (targetCount && !dryRun) {
    console.log(`[${label}] target already has rows; skipping to avoid duplicates`);
    return;
  }

  const docs = await db.collection(source).find({}).toArray();
  const cloned = docs.map(cloneDocument);

  console.log(`[${label}] would copy ${cloned.length} document(s)`);
  if (dryRun) {
    return;
  }

  if (targetCount === 0) {
    await db.collection(target).insertMany(cloned, { ordered: false });
  } else {
    console.log(`[${label}] target not empty; manual merge required`);
  }
}

async function main() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  console.log(`Connected to ${db.databaseName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);

  for (const mapping of mappings) {
    await copyCollection(db, mapping);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
