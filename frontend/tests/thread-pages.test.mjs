import test from "node:test";
import assert from "node:assert/strict";
import { mergeThreadMessages, threadPageCursor } from "../src/rankit/redesign/threadPages.js";

test("6d: eski sayfa başa eklenirken canlı mesaj korunur ve çakışma tekilleşir", () => {
  const page = [{ id: 1, content: "First" }, { id: 2, content: "Second" }];
  const current = [{ id: 2, content: "Second" }, { id: 3, content: "Live" }];
  assert.deepEqual(mergeThreadMessages(page, current).map(message => message.id), [1, 2, 3]);
});

test("6d: yalnız doğrulanmış pozitif sonraki kimlik yeni arşiv sayfasını açar", () => {
  assert.equal(threadPageCursor({ has_more: true, next_before_id: 12 }), 12);
  assert.equal(threadPageCursor({ has_more: false, next_before_id: 12 }), null);
  assert.equal(threadPageCursor({ has_more: true, next_before_id: null }), null);
  assert.equal(threadPageCursor({ has_more: true, next_before_id: "garbled" }), null);
});
