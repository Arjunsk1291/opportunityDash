import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const mongoUri = String(process.env.MONGODB_URI || '').trim();
const backupRoot = path.resolve(
  backendRoot,
  String(process.env.BACKUP_DIR || 'backups'),
  'mongodump',
);
const backupPath = path.join(backupRoot, timestamp);
const gzipFlag = String(process.env.BACKUP_COMPRESS || 'true').toLowerCase() !== 'false';

if (!mongoUri) {
  console.error('MONGODB_URI is required for backup:dump');
  process.exit(1);
}

fs.mkdirSync(backupPath, { recursive: true });

const args = ['--uri', mongoUri, '--out', backupPath];
if (gzipFlag) {
  args.push('--gzip');
}

const result = spawnSync('mongodump', args, { stdio: 'inherit' });

if (result.error) {
  console.error(`Failed to run mongodump: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`MongoDB backup completed: ${backupPath}`);
