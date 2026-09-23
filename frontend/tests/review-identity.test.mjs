import test from "node:test";
import assert from "node:assert/strict";
import { reviewerFromStorage, isOwnContent } from "../src/rankit/redesign/reviewIdentity.js";

test("4a/5c: kendi incelemesine veya yanıtına respect sunulmaz", () => {
  const me = reviewerFromStorage({ getItem: () => '{"id":7,"username":"deniz"}' });
  assert.equal(isOwnContent({ user_id: 7, username: "deniz" }, me), true);
  assert.equal(isOwnContent({ user_id: 8, username: "deniz" }, me), false);
  assert.equal(isOwnContent({ username: "deniz" }, me), true);
  assert.equal(isOwnContent({ username: "mert" }, me), false);
});

test("oturum yoksa veya bozuksa sahiplik uydurulmaz", () => {
  assert.equal(reviewerFromStorage({ getItem: () => "{" }), null);
  assert.equal(reviewerFromStorage({ getItem: () => null }), null);
  assert.equal(isOwnContent({ user_id: 7 }, null), false);
});

test("B5: uc `is_mine` diyorsa oturum kopyasi tartisilmaz", () => {
  // Oturum kopyasi bayat/eksik olsa bile sunucunun cevabi gecerli: kendi
  // icerigine respect yok (§6.1), yanlis taraf sessiz bir hata olurdu.
  assert.equal(isOwnContent({ is_mine: true, user_id: 9, username: "baskasi" },
                            { id: 7, username: "deniz" }), true);
  assert.equal(isOwnContent({ is_mine: false, user_id: 7, username: "deniz" },
                            { id: 7, username: "deniz" }), false);
  // Oturum hic yokken de (girissiz demo) uc karar veriyor.
  assert.equal(isOwnContent({ is_mine: true }, null), true);
  assert.equal(isOwnContent({ is_mine: false }, null), false);
});

test("B5: alan yoksa eski yol aynen calisiyor", () => {
  // Eski yanitlar ve onbellekteki eski satirlar kirilmasin.
  assert.equal(isOwnContent({ user_id: 7 }, { id: 7, username: null }), true);
  assert.equal(isOwnContent({ username: "deniz" }, { id: null, username: "deniz" }), true);
  assert.equal(isOwnContent({ is_mine: "true", user_id: 8 }, { id: 7 }), false,
    "string 'true' boolean degil; uc alani gondermemis sayilmali");
});
