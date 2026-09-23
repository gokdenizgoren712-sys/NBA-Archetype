import test from "node:test";
import assert from "node:assert/strict";
import { communityHeat, communityRatingCount, communityVerdictCovered, expectedHeat, expectedInterestCount, hasCommunityVerdict, hasOwnRating, MIN_COMMUNITY_RATINGS } from "../src/rankit/redesign/heat.js";

test("BUILD §5.5: topluluk ısısı için en az 20 oy gerekir", () => {
  assert.equal(MIN_COMMUNITY_RATINGS, 20);
  assert.equal(communityHeat({ community_rating: 4.6, rating_count: 19 }), null);
  assert.equal(communityHeat({ community_rating: 4.6, rating_count: 20 }), 4.6);
  assert.equal(communityHeat({ communityRating: 3.4, ratings: 2481 }), 3.4);
});

test("eksik veya geçersiz oy sayısı ısıyı uydurmaz", () => {
  assert.equal(communityRatingCount({ rating_count: 0 }), 0);
  assert.equal(communityRatingCount({ ratings: "2,481 ratings" }), null);
  assert.equal(communityHeat({ community_rating: 5 }), null);
  assert.equal(communityHeat({ community_rating: 0, rating_count: 20 }), null);
});

test("BUILD §9/§19: beklenen ısı topluluk ısısından ayrı ve yalnızca geçerli alanda görünür", () => {
  assert.equal(expectedHeat({ expected_heat: 3.4, expected_rating_count: 20 }), 3.4);
  assert.equal(expectedHeat({ expected_heat: 3.4, expected_rating_count: 19 }), null);
  assert.equal(expectedHeat({ expected_heat: 3.4, watchlist_count: 1204, expected_rating_count: 19 }), null);
  assert.equal(expectedHeat({ expected_heat: 3.4, rating_count: 2481 }), null);
  assert.equal(expectedInterestCount({ expected_heat: 3.4, want_count: 1204 }), 1204);
  assert.equal(expectedInterestCount({ expected_rating_count: 19, watchlist_count: 1204 }), 19);
  assert.equal(expectedHeat({ community_rating: 4.8, rating_count: 2481 }), null);
  assert.equal(expectedHeat({ expected_heat: 0 }), null);
  assert.equal(expectedHeat({ expected_heat: 5.1, expected_rating_count: 20 }), null);
  assert.equal(expectedInterestCount({ rating_count: 2481 }), null);
});

test("BUILD §3.1: izlemek değil kişisel puan topluluk hükmünü açar", () => {
  assert.equal(hasOwnRating({ my_watched_date: "2026-09-20" }), false);
  assert.equal(hasOwnRating({ my_rating: 0 }), false);
  assert.equal(hasOwnRating({ my_rating: 4.5 }), true);
  const match = { status: "finished", community_rating: 4.6, rating_count: 42 };
  assert.equal(communityVerdictCovered({ ...match, my_watched_date: "2026-09-20" }), true);
  assert.equal(communityVerdictCovered({ ...match, my_rating: 4 }), false);
  // §3.1: yıldız taslağı/sıradaki kayıt değil, yalnız sunucunun onayladığı puan.
  assert.equal(communityVerdictCovered({ ...match, draft_rating: 4 }), true);
  assert.equal(communityVerdictCovered({ ...match, __entry: { rating: 4 }, __entryPending: true }), true);
  assert.equal(communityVerdictCovered({ ...match, __entry: { rating: 4 }, __entryPending: false }), false);
  assert.equal(communityVerdictCovered(match, { revealed: true }), false);
  assert.equal(communityVerdictCovered(match, { personal: true }), false);
  assert.equal(communityVerdictCovered({ status: "upcoming" }), false);
  assert.equal(communityVerdictCovered({ ...match, finished: "true", userRated: "false" }), true);
  assert.equal(communityVerdictCovered({ ...match, finished: "true", userRated: "true" }), false);
});

test("boş topluluk kartı kapı çağrısı üretmez; 19 oy henüz ısı değildir", () => {
  assert.equal(hasCommunityVerdict({ rating_count: 0, review_count: 0 }), false);
  assert.equal(communityVerdictCovered({ status: "finished", rating_count: 0, review_count: 0 }), false);
  assert.equal(hasCommunityVerdict({ community_rating: 4.6, rating_count: 19 }), false);
  assert.equal(hasCommunityVerdict({ community_rating: 4.6, rating_count: 20 }), true);
  assert.equal(hasCommunityVerdict({ rating_count: 0, review_count: 1 }), true);
});
