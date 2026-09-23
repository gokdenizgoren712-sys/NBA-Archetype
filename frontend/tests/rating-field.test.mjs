/* B2: gunluk govdesinde `rating` alani ne zaman var? */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratingField } from "../src/rankit/redesign/ratingField.js";

test("dokunulmamis puan mevcut kayitta HIC gonderilmiyor", () => {
  // Asil kusur buydu: rating yerel olarak 0 iken inceleme kaydetmek
  // sunucudaki puani siliyordu.
  assert.deepEqual(ratingField({ touched: false, hasEntry: true, rating: 0 }), {});
  assert.deepEqual(ratingField({ touched: false, hasEntry: true, rating: 4 }), {});
  assert.ok(!("rating" in ratingField({ touched: false, hasEntry: true, rating: undefined })));
});

test("dokunulduysa niyet aynen gidiyor", () => {
  assert.deepEqual(ratingField({ touched: true, hasEntry: true, rating: 4.5 }), { rating: 4.5 });
  // Sifir = "puani kaldir" -> acik null, uc siliyor.
  assert.deepEqual(ratingField({ touched: true, hasEntry: true, rating: 0 }), { rating: null });
});

test("kayit yokken ilk log puanini ifade ediyor", () => {
  assert.deepEqual(ratingField({ touched: false, hasEntry: false, rating: 0 }), { rating: null });
  assert.deepEqual(ratingField({ touched: false, hasEntry: false, rating: 3 }), { rating: 3 });
});

test("govde JSON'a yazildiginda alan gercekten yok", () => {
  // `{rating: undefined}` JSON.stringify'da dusuyor ama nesne anahtari
  // tasiyor; uc `model_fields_set` ile baktigi icin ikisi de olmamali.
  const body = { match_id: 1, ...ratingField({ touched: false, hasEntry: true, rating: 0 }), review: "x" };
  assert.deepEqual(Object.keys(body), ["match_id", "review"]);
  assert.equal(JSON.parse(JSON.stringify(body)).rating, undefined);
});
