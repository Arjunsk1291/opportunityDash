import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const assets = path.resolve('dist/assets');
const index = fs.readdirSync(assets).find((name) => /^index-.*\.js$/.test(name));
assert(index, 'main index chunk not found');
const source = fs.readFileSync(path.join(assets, index), 'utf8');
const mainBytes = fs.statSync(path.join(assets, index)).size;
assert(mainBytes < 500_000, `initial chunk unexpectedly large: ${mainBytes}`);
const files = fs.readdirSync(assets);
assert(files.some((name) => name.startsWith('exceljs.')), 'ExcelJS feature chunk missing');
assert(files.some((name) => name.startsWith('jspreadsheet-')), 'jspreadsheet feature chunk missing');
assert(files.some((name) => name.startsWith('BDEngagements-')), 'chart feature chunk missing');
console.log('lazy-boundary regression passed: heavy features stay out of the initial bundle');
