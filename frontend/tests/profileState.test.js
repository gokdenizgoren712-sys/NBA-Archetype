import test from 'node:test';
import assert from 'node:assert/strict';
import { profileShelf, personalReviews, profileCrest, joinedLabel } from '../src/rankit/redesign/profileState.js';

test('shelf keeps latest unique matches, not rewatch entry ids', () => {
  const entries = [{id:99,match_id:4},{id:98,match_id:'4'},{id:97,match_id:3},{id:96,match_id:2},{id:95,match_id:1}];
  assert.deepEqual(profileShelf(entries).map(e => e.id), [99,97,96]);
  assert.equal(entries.length, 5);
  assert.deepEqual(profileShelf(), []);
});
test('personal review list includes private reviews and separate rewatches', () => {
  const entries = [{id:1,review:'  '},{id:2,review:null},{id:3,review:'My private review',visibility:'private'}, {id:4,review:'My second viewing'}];
  assert.deepEqual(personalReviews(entries).map(e => e.id), [3,4]);
});
test('profile crest clears the column at 320px and stays source-sized at 375px', () => {
  for (const viewport of [320,375,390,520]) {
    const card = (viewport - 52 - 18) / 3;
    assert.ok(profileCrest(card) * 2.414 <= card - 24 + .001);
    assert.ok(profileCrest(card) <= 30);
  }
  assert.equal(profileCrest(102), 30);
});
test('join date never invents membership or displays Invalid Date', () => {
  assert.equal(joinedLabel(null), '');
  assert.equal(joinedLabel('broken'), '');
  assert.equal(joinedLabel('2025-08-15 10:00:00'), 'Aug 2025');
});
