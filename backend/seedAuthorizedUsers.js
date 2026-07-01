import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AuthorizedUser from './models/AuthorizedUser.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const authorizedUsers = [
  // Master
  { email: 'tender-notify@avenirengineering.com', role: 'Master', status: 'approved' },
  // Admin
  { email: 'bp@avenirengineering.com', role: 'Admin', status: 'approved' },
  { email: 'srini@avenirengineering.com', role: 'Admin', status: 'approved' },
  { email: 'murali@avenirengineering.com', role: 'Admin', status: 'approved' },
  { email: 'sabu@avenirengineering.com', role: 'Admin', status: 'approved' },
  { email: 'ganesh@avenirengineering.com', role: 'Admin', status: 'approved' },
  { email: 'aseeb@avenirengineering.com', role: 'Admin', status: 'approved' },
  // Basic
  { email: 'gayathri.dinesh@avenirengineering.com', role: 'Basic', status: 'approved' },
  { email: 'ashwin.j@avenirengineering.com', role: 'Basic', status: 'approved' },
  { email: 'shalini.k@avenirengineering.com', role: 'Basic', status: 'approved' },
  { email: 'hamsavarthan@avenirengineering.com', role: 'Basic', status: 'approved' },
  { email: 'visal.j@avenirengineering.com', role: 'Basic', status: 'approved' },
];

// DANGER: a full reset deletes EVERY user in the collection — including users that
// were added later through the admin panel. It is now opt-in only. Run with
// `node seedAuthorizedUsers.js --reset` (or SEED_RESET=true) to wipe and rebuild.
// The default run is a safe, idempotent upsert that never removes existing users.
const RESET = process.argv.includes('--reset') || String(process.env.SEED_RESET || '').toLowerCase() === 'true';

async function seedUsers() {
  try {
    await mongoose.connect(MONGODB_URI);

    if (RESET) {
      console.warn('⚠️  --reset supplied: DELETING ALL authorized users before reseeding.');
      console.warn('⚠️  Any admin-added users NOT in the hardcoded list will be permanently removed.');
      const { deletedCount } = await AuthorizedUser.deleteMany({});
      console.warn(`⚠️  Removed ${deletedCount} existing user(s).`);
    }

    // Idempotent upsert: ensure each canonical account exists with the intended
    // role/status, without touching (or deleting) any other users.
    let created = 0;
    let updated = 0;
    for (const { email, role, status } of authorizedUsers) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const result = await AuthorizedUser.updateOne(
        { email: normalizedEmail },
        {
          $set: { role, status },
          $setOnInsert: { email: normalizedEmail, createdAt: new Date() },
        },
        { upsert: true },
      );
      if (result.upsertedCount) created += 1;
      else if (result.modifiedCount) updated += 1;
    }

    console.log(`✅ Seed complete. Ensured ${authorizedUsers.length} canonical users (created ${created}, updated ${updated}).`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
}

seedUsers();
