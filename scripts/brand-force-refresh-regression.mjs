import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/contexts/BrandContext.tsx', import.meta.url), 'utf8');
assert.match(source, /localStorage\.setItem\(STORAGE_KEY, nextBrandKey\);\s*window\.location\.reload\(\);/s, 'brand selection must persist before full reload');
assert.match(source, /if \(nextBrandKey === brandKey\) return;/, 'selecting the current brand must not reload');
assert.doesNotMatch(source, /setBrandKey:\s*setBrandKeyState/, 'brand switch must not be an in-place state-only change');
console.log('brand force-refresh regression passed');
