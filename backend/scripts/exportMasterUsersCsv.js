import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import AuthorizedUser from '../models/AuthorizedUser.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().slice(0, 10);
const csvDir = path.resolve(backendRoot, String(process.env.BACKUP_DIR || 'backups'), 'master-users');
const csvPath = path.join(csvDir, `master-users-${timestamp}.csv`);

const mongoUri = String(process.env.MONGODB_URI || '').trim();

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  if (!mongoUri) {
    console.error('MONGODB_URI is required for backup:master-users-csv');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const users = await AuthorizedUser.find({})
    .sort({ role: 1, email: 1 })
    .lean();

  const headers = [
    'email',
    'displayName',
    'role',
    'assignedGroup',
    'status',
    'lastLogin',
    'createdAt',
    'approvedBy',
    'approvedAt',
    'failedLoginAttempts',
    'accountLockedUntil',
    'lastFailedLoginAt',
    'passwordChangedAt',
    'requiresPasswordChange',
  ];

  fs.mkdirSync(csvDir, { recursive: true });

  const lines = [
    headers.join(','),
    ...users.map((user) => headers.map((field) => {
      const value = user[field];
      if (value instanceof Date) return csvEscape(value.toISOString());
      if (value && typeof value === 'object' && 'toISOString' in value) {
        try {
          return csvEscape(value.toISOString());
        } catch {
          return csvEscape(value);
        }
      }
      return csvEscape(value);
    }).join(',')),
  ];

  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Master users CSV exported: ${csvPath}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Failed to export master users CSV: ${error.message}`);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
