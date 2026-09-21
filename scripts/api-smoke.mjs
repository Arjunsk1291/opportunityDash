import assert from 'node:assert/strict';
import jwt from '../backend/node_modules/jsonwebtoken/index.js';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const username = String(process.env.SMOKE_USERNAME || '').trim().toLowerCase();
const secret = String(process.env.JWT_SECRET || process.env.SESSION_JWT_SECRET || '').trim();
assert(username && secret, 'SMOKE_USERNAME and JWT_SECRET/SESSION_JWT_SECRET are required');
const token = jwt.sign({ email: username, username }, secret, { expiresIn: '5m' });
const headers = { authorization: `Bearer ${token}` };

const request = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
const missing = await fetch(`${base}/api/clients`);
assert.equal(missing.status, 401, 'protected API rejects missing auth');

const health = await fetch(`${base}/api/health`).then((r) => r.json());
assert.equal(health.ok, true);
assert.equal(health.dbState, 1);

const intlResponse = await request('/api/clients', { headers: { 'x-brand-key': 'avenir_intl' } });
assert.equal(intlResponse.status, 200);
const intl = await intlResponse.json();
assert(intl.length > 0, 'International clients should contain records');
assert(intl.every((row) => row.entityKey === 'avenir_intl'), 'International result leaked another entity');

const oilResponse = await request('/api/clients', { headers: { 'x-brand-key': 'avenir_oilfield' } });
assert.equal(oilResponse.status, 200);
const oil = await oilResponse.json();
assert(oil.every((row) => row.entityKey === 'avenir_oilfield'), 'Oilfield result leaked another entity');
assert.equal(oil.length, 0, 'Oilfield checkpoint is expected to be empty');

const upload = await request('/api/opportunities/sheet-upload/commit', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-brand-key': 'avenir_intl' },
  body: JSON.stringify({ rows: [] }),
});
assert.equal(upload.status, 400, 'empty upload is rejected before mutation');
console.log(`API smoke passed: auth gate, health, upload validation, brand isolation (${intl.length} Intl / ${oil.length} Oilfield clients)`);
