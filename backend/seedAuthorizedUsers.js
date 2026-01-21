import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AuthorizedUser from './models/AuthorizedUser.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const authorizedUsers = [
  // Master
  { email: 'arjun.s@avenirengineering.com', role: 'Master', status: 'approved' },
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

async function seedUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing users
    await AuthorizedUser.deleteMany({});
    console.log('🗑️ Cleared existing authorized users');

    // Insert new users
    const result = await AuthorizedUser.insertMany(authorizedUsers);
    console.log('✅ Seeded ' + result.length + ' authorized users');

    result.forEach(user => {
      console.log('  ✅ ' + user.email + ' (' + user.role + ')');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
}

seedUsers();
