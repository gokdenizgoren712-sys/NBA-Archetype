import test from "node:test";
import assert from "node:assert/strict";
import { createReplyAttempts } from "../src/rankit/redesign/replyAttempt.js";

test("belirsiz ağ yanıtından sonra aynı taslak aynı client_id ile tekrar gider", () => {
  let issued = 0;
  const attempts = createReplyAttempts(() => `reply_${++issued}`);
  assert.equal(attempts.forSend(5, " Hello ", 7), "reply_1");
  assert.equal(attempts.forSend(5, "Hello", 7), "reply_1");
  assert.equal(issued, 1);
  attempts.confirmed(5, "Hello", 7);
  assert.equal(attempts.forSend(5, "Hello", 7), "reply_2");
});

test("başka inceleme, metin veya adres aynı gönderim sayılmaz", () => {
  let issued = 0;
  const attempts = createReplyAttempts(() => `reply_${++issued}`);
  assert.equal(attempts.forSend(5, "Hello"), "reply_1");
  assert.equal(attempts.forSend(6, "Hello"), "reply_2");
  assert.equal(attempts.forSend(5, "Different"), "reply_3");
  assert.equal(attempts.forSend(5, "Hello", 7), "reply_4");
  assert.equal(attempts.forSend(5, "Hello"), "reply_1");
});
