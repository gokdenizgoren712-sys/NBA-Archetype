import test from 'node:test';
import assert from 'node:assert/strict';
import { createRatingQueue } from '../src/rankit/ratingQueue.js';
import { entrySnapshot, snapshotFromMatch } from '../src/rankit/entryState.js';
import { hidesScore } from '../src/rankit/rankitPrefs.js';

function fixture(api = {}) {
  const data = new Map();
  let seq = 0, uid = 'a', full = false;
  const calls = [];
  const storage = {getItem:k=>data.get(k),setItem:(k,v)=>{if(full)throw Error('quota');data.set(k,v);}};
  const queue = createRatingQueue({ storage, account:()=>uid, id:()=>String(++seq),
    api:{log:async x=>calls.push(['log',x]),potm:async()=>calls.push(['potm']),respect:async()=>calls.push(['respect']),...api} });
  return {queue, calls, data, setFull:v=>{full=v;},setUser:v=>{uid=v;}};
}
const payload = rating => ({matchId:42,diary:{match_id:42,rating},potmId:7,respectIds:[8]});
const offline = () => Object.assign(Error('offline'), {offline:true});

test('rating, Classic, review and votes are all dirty fields', () => {
  const saved = snapshotFromMatch({my_rating:4});
  assert.equal(saved,entrySnapshot({rating:4}));
  for(const change of [{rating:3},{classic:true},{review:'New'},{respect:[8]},{potmId:7},{rewatch:true}])
    assert.notEqual(saved,entrySnapshot({rating:4,...change}));
  assert.equal(entrySnapshot({tags:['a','b']}),entrySnapshot({tags:['b','a']}));
});
test('live and finished scores hidden, rated exception respects preference', () => {
  const prefs={hideUntilRated:true};
  for(const status of ['live','finished']) {
    assert.equal(hidesScore(true,{status},prefs),true);
    assert.equal(hidesScore(true,{status,my_rating:4},prefs),false);
    assert.equal(hidesScore(true,{status,my_rating:4},{hideUntilRated:false}),true);
  }
  assert.equal(hidesScore(true,{status:'upcoming'},prefs),false);
  assert.equal(hidesScore(true,{status:'finished',my_watched_date:'2026-09-20'},prefs),true);
  assert.equal(hidesScore(true,{status:'finished',my_rating:0},prefs),true);
});
test('diary and shelf entries use saved rating, not watched status, to lift shield', () => {
  const prefs={hideUntilRated:true};
  const diary={status:'finished',home_score:92,away_score:87,rating:null};
  assert.equal(hidesScore(true,{status:diary.status,my_rating:diary.rating},prefs),true);
  assert.equal(hidesScore(true,{status:diary.status,my_rating:4},prefs),false);
  assert.equal(hidesScore(true,{status:'finished',my_rating:null},prefs),true);
});
test('storage failure never acknowledges queued success', () => {
  const f=fixture();f.setFull(true);
  assert.throws(()=>f.queue.enqueue(payload(4)),/quota/);
  assert.equal(f.calls.length,0);
});
test('offline rating survives and uploads on retry', async () => {
  let failed=true;
  const f=fixture({log:async()=>{if(failed)throw offline();}});
  f.queue.enqueue(payload(4));await f.queue.flush();
  assert.equal(f.queue.read()[0].state,'pending');
  failed=false;assert.equal((await f.queue.flush()).sent,1);
  assert.equal(f.queue.read().length,0);
});
test('partial completion resumes without repeating diary', async () => {
  let logs=0,failed=true;
  const f=fixture({log:async()=>logs++,respect:async()=>{if(failed)throw offline();}});
  f.queue.enqueue(payload(4));await f.queue.flush();
  assert.deepEqual(f.queue.read()[0].completed,['diary','potm']);
  failed=false;await f.queue.flush();assert.equal(logs,1);
});
for(const status of [401,403,422,429,500]) test(`HTTP ${status} preserves rejected changes and avoids auto-retry loop`,async()=>{
  let calls=0;
  const f=fixture({log:async()=>{calls++;throw Object.assign(Error('failed'),{status});}});
  f.queue.enqueue(payload(4));await f.queue.flush();await f.queue.flush();
  assert.equal(f.queue.read().length,1);assert.equal(calls,1);
  await f.queue.flush({retryFailed:true});assert.equal(calls,2);
});
test('newer revision is not removed by older in-flight save',async()=>{
  let release;
  const f=fixture({log:()=>new Promise(r=>{release=r;})});
  f.queue.enqueue(payload(4));const uploading=f.queue.flush();
  await Promise.resolve();await Promise.resolve();
  f.queue.enqueue(payload(5));release();await uploading;
  assert.equal(f.queue.read()[0].diary.rating,5);
  assert.equal(f.calls.length,0);
});
test('account switch never sends remaining steps as another user',async()=>{
  const f=fixture({log:async()=>f.setUser('b')});
  f.queue.enqueue(payload(4));await f.queue.flush();
  assert.equal(f.queue.read().length,0);assert.equal(f.calls.length,0);
  f.setUser('a');assert.equal(f.queue.read().length,1);
});
test('uncertain rewatch is retained, never automatically duplicated',async()=>{
  let calls=0;
  const f=fixture({log:async()=>{calls++;throw offline();}});
  const p=payload(4);p.diary.is_rewatch=true;
  f.queue.enqueue(p);await f.queue.flush();await f.queue.flush({retryFailed:true});
  assert.equal(f.queue.read()[0].state,'uncertain');assert.equal(calls,1);
  assert.throws(()=>f.queue.enqueue(p),/Check your diary/);
});
test('malformed stored queue is not silently overwritten',()=>{
  const f=fixture();f.data.set('rankit:outbox:a','not json');
  assert.throws(()=>f.queue.enqueue(payload(4)));
  assert.equal(f.data.get('rankit:outbox:a'),'not json');
});

test('partially saved rewatch resumes remaining votes without a second diary entry',async()=>{
  let logs=0,failed=true;
  const f=fixture({log:async()=>logs++,respect:async()=>{if(failed)throw offline();}});
  const p=payload(4);p.diary.is_rewatch=true;
  f.queue.enqueue(p);await f.queue.flush();
  assert.throws(()=>f.queue.enqueue(p),/Check your diary/);
  failed=false;await f.queue.flush();
  assert.equal(logs,1);assert.equal(f.queue.read().length,0);
});
