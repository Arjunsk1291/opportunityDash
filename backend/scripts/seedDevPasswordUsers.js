import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import AuthorizedUser from '../models/AuthorizedUser.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';
const PASSWORD = '123';

const scryptAsync = (password, salt, options) => new Promise((resolve, reject) => {
  nodeScrypt(password, salt, options.keylen, { N: options.N, r: options.r, p: options.p, maxmem: options.maxmem }, (err, derivedKey) => {
    if (err) return reject(err);
    resolve(derivedKey);
  });
});

const PASSWORD_HASH_PREFIX = 'scrypt';
const hashPassword = async (password) => {
  const normalized = String(password || '');
  if (!normalized) throw new Error('Password is required');
  const salt = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
  const params = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
  const derived = await scryptAsync(normalized, salt, params);
  const hash = Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
  return [
    PASSWORD_HASH_PREFIX,
    `N=${params.N}`,
    `r=${params.r}`,
    `p=${params.p}`,
    `salt=${salt.toString('base64')}`,
    `hash=${hash.toString('base64')}`,
  ].join('$');
};

const verifyPassword = async (password, storedHash) => {
  const raw = String(storedHash || '');
  if (!raw) return false;
  const parts = raw.split('$');
  if (parts.length < 6 || parts[0] !== PASSWORD_HASH_PREFIX) return false;
  const parse = (prefix) => {
    const match = parts.find((p) => p.startsWith(prefix));
    return match ? match.slice(prefix.length) : '';
  };
  const N = Number(parse('N='));
  const r = Number(parse('r='));
  const p = Number(parse('p='));
  const saltB64 = parse('salt=');
  const hashB64 = parse('hash=');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(String(password || ''), salt, { N, r, p, keylen: expected.length, maxmem: 64 * 1024 * 1024 });
  const actual = Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};

const roles = [
  { role: 'Master', assignedGroup: null },
  { role: 'Admin', assignedGroup: null },
  { role: 'ProposalHead', assignedGroup: null },
  { role: 'SVP', assignedGroup: 'GES' },
  { role: 'BDTeam', assignedGroup: null },
  { role: 'Basic', assignedGroup: null },
  { role: 'TempUser', assignedGroup: null },
];

const toEmail = (role) => `${String(role).trim().toLowerCase()}@dev.local`;

async function main() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.error('[seed.dev-users] Refusing to seed insecure dev users in production.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('[seed.dev-users] Connected to MongoDB');

  const passwordHash = await hashPassword(PASSWORD);
  const sanity = await verifyPassword(PASSWORD, passwordHash);
  if (!sanity) throw new Error('Password hashing sanity check failed');

  let upserts = 0;
  for (const { role, assignedGroup } of roles) {
    const email = toEmail(role);
    await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        $setOnInsert: { email, createdAt: new Date() },
        $set: {
          displayName: role,
          role,
          status: 'approved',
          assignedGroup,
          passwordHash,
          requiresPasswordChange: false,
          approvedBy: 'seed-dev-users',
          approvedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    upserts += 1;
  }

  console.log(`[seed.dev-users] Upserted ${upserts} users. Password for all roles is "${PASSWORD}".`);
  console.log('[seed.dev-users] Emails:');
  for (const { role } of roles) {
    console.log(`- ${role}: ${toEmail(role)}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed.dev-users] Failed:', err?.message || err);
  process.exitCode = 1;
});

