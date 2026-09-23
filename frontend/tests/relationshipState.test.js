import test from 'node:test';
import assert from 'node:assert/strict';
import { relationshipState, overlapPercent } from '../src/rankit/redesign/relationshipState.js';

test('HTML t9 has four independent relationship states', () => {
  assert.equal(relationshipState(false, false).label, 'Follow');
  assert.equal(relationshipState(true, false).label, 'Following');
  assert.equal(relationshipState(false, true).label, 'Follow back');
  assert.equal(relationshipState(true, true).label, 'Mutual');
});
test('old servers cannot display a percentage below ten matches', () => {
  assert.equal(overlapPercent({ shared: 9, pct: 1, min_shared: 5 }), null);
  assert.equal(overlapPercent({ shared: 10, pct: .72, min_shared: 10 }), 72);
  assert.equal(overlapPercent({ shared: 10, pct: null }), null);
  assert.equal(overlapPercent({ shared: 10, pct: .9, min_shared: 20 }), null);
  assert.equal(overlapPercent(null), null);
});
