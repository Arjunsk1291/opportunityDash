import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync('backend/services/graphExcelService.js', 'utf8');
const expected = {
  envValue: 'b9ee2f3fc46365fd8ea418422912f12dcc25a71154a080e1909783c3e9740a69',
  graphClientSecret: '32f0efacfedfb1403734135ad6a11bd95c4e8a696e5bcdd989e63688388920a1',
  mailTenantId: '0bdb90d52279752179139ba11c75d77779c799d34cdf68fda7905a82dd50e47b',
  mailClientId: '28ff5ac9918dbf002654352ee8cffd8db48b135e0083bdcdf42d16fac3638b60',
  validateMailEnv: '8ba21d5e436c2fbca8ad277f3b13f6cadc2918a2d7c2d89478a059311da08782',
  postMailToken: '7bec433b1b17820cb95b7d5e4da146b980a012c8992ae83306275f3e1f17e01c',
  getMailAccessToken: '5c6c2d328020982c7fa6d819b3aa2ed7cdd5a60306a3ca685b9c4129f833d61a',
};
function functionBlock(name) {
  const variants = [`export async function ${name}`, `async function ${name}`, `function ${name}`];
  const start = variants.map((needle) => source.indexOf(needle)).find((index) => index >= 0);
  assert.notEqual(start, undefined, `${name} missing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} block incomplete`);
}
for (const [name, hash] of Object.entries(expected)) {
  assert.equal(crypto.createHash('sha256').update(functionBlock(name)).digest('hex'), hash, `${name} changed`);
}
for (const removed of ['resolveShareLink', 'getWorksheets', 'getWorksheetRangeValues', 'getAccessTokenWithConfig']) {
  assert(!source.includes(`function ${removed}`), `${removed} workbook code remains`);
}
console.log('Graph mail integrity passed: all seven mail/token functions are byte-identical; workbook exports are absent');
