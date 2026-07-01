// Runnable self-check for the manual-entry duplicate matcher.
// No test framework: run with `node --experimental-strip-types src/lib/manualMatchFinder.selfcheck.ts`.
// Exits non-zero (via assert) if the matching rules regress.
import assert from 'node:assert';
import { findManualMatches, isEoiRef, getBaseRefForMatch } from './manualMatchFinder.ts';

// Ref helpers: an `_EOI` ref is a different tender from its base.
assert.strictEqual(isEoiRef('T-100_EOI'), true);
assert.strictEqual(isEoiRef('T-100'), false);
assert.strictEqual(getBaseRefForMatch('T-100_EOI'), 't-100');
assert.strictEqual(getBaseRefForMatch('T-100'), 't-100');

const bid = (opportunityRefNo: string, projectName: string, endUser = '') =>
  ({ _id: `${opportunityRefNo}|${projectName}`, opportunityRefNo, projectName, endUser } as any);

// Case B — same base ref, different EOI phase: NOT a duplicate even with an identical name.
assert.strictEqual(
  findManualMatches(
    [{ opportunityRefNo: 'T-100', tenderName: 'Zeta Pipeline Alpha' }],
    [bid('T-100_EOI', 'Zeta Pipeline Alpha')],
    [],
  ).length,
  0,
  'EOI variant must not be flagged as a duplicate of its base tender',
);

// Case A — identical full ref: already the same tender, nothing to reconcile.
assert.strictEqual(
  findManualMatches(
    [{ opportunityRefNo: 'T-100', tenderName: 'Zeta Pipeline Alpha' }],
    [bid('T-100', 'Zeta Pipeline Alpha')],
    [],
  ).length,
  0,
  'identical ref must be skipped',
);

// Case C strong name (similarity 1.0 >= 0.85): matches on name alone, no client needed.
assert.strictEqual(
  findManualMatches(
    [{ opportunityRefNo: 'P-1', tenderName: 'Zeta Pipeline Alpha' }],
    [bid('M-1', 'Zeta Pipeline Alpha')],
    [],
  ).length,
  1,
  'strong-name different-ref entry must match',
);

// Case C moderate name (similarity 0.75, in [0.7, 0.85)): needs client corroboration.
const moderate = (endUser: string) =>
  findManualMatches(
    [{ opportunityRefNo: 'P-1', tenderName: 'Zeta Pipeline Alpha', clientName: 'Adnoc Offshore' }],
    [bid('M-1', 'Zeta Pipeline Alpha Beta', endUser)],
    [],
  ).length;
assert.strictEqual(moderate(''), 0, 'moderate-name match without client corroboration must be dropped');
assert.strictEqual(moderate('Adnoc Onshore'), 1, 'moderate-name match with shared client token must surface');

console.log('manualMatchFinder self-check passed');
