import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectible, collectibleEditMatch, collectibleShareText } from '../src/rankit/collectibleState.js';
import { createRatingQueue } from '../src/rankit/ratingQueue.js';
const match={id:7,home:{name:'Boston',short:'BOS'},away:{name:'Golden State',short:'GSW'},competition:'NBA',score:'112 – 108'};
const entry={rating:4,classic:true,review:'Private review',tags:['Clutch'],respect:[8],rewatch:true};

test('confirmed zero deltas are not missing; result edits the acknowledged entry',()=>{
  const result=createCollectible(match,entry,{receipt:{entry_id:42,updated:true,points_awarded:0,diary_entries_delta:0,streak_delta:0}});
  // Ucuncu delta artik ayri bir karo (koleksiyon); iki sayisal delta kaldi.
  assert.deepEqual(result.deltas.map(d=>d.value),[0,0]);
  assert.equal(collectibleEditMatch(result).__entry.entryId,42);
  assert.equal(collectibleEditMatch(result).__entry.rewatch,true);
  assert.equal(result.canEdit,true);
});
test('queued result never claims awards and cannot duplicate an unconfirmed rewatch',()=>{
  const result=createCollectible(match,entry,{queued:true,receipt:{entry_id:42,points_awarded:15}});
  assert.deepEqual(result.deltas.map(d=>d.value),[null,null]);
  assert.equal(result.canEdit,false);
  assert.equal(result.receipt,null);
});
test('missing or invalid server deltas are not invented',()=>{
  const result=createCollectible(match,entry,{receipt:{points_awarded:NaN,streak_delta:'1'}});
  assert.deepEqual(result.deltas.map(d=>d.value),[null,null]);
});
test('result is a snapshot; shared rating omits score and private review',()=>{
  const tags=['Clutch'];const result=createCollectible(match,{...entry,tags});tags.push('Upset');
  assert.deepEqual(result.entry.tags,['Clutch']);
  const text=collectibleShareText(result);
  assert.match(text,/4\/5/);assert.match(text,/My Classic/);
  assert.doesNotMatch(text,/112|108|Private review/);
});
test('queue preserves receipt through partial failure and returns it on completion',async()=>{
  const data=new Map();let failed=true,logs=0;
  const receipt={entry_id:42,points_awarded:15};
  const queue=createRatingQueue({storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},account:()=>1,id:()=> 'r1',
    api:{log:async()=>{logs++;return receipt;},respect:async()=>{if(failed)throw Object.assign(Error('offline'),{offline:true});}}});
  queue.enqueue({matchId:7,diary:{match_id:7,rating:4}});await queue.flush();
  assert.deepEqual(queue.read()[0].receipt,receipt);
  failed=false;const result=await queue.flush();
  assert.equal(logs,1);assert.deepEqual(result.receipts,[{revision:'r1',receipt}]);
});
test('rewatch updates with known ID can retry; ambiguous creates cannot',async()=>{
  for(const entry_id of [undefined,42]){
    const data=new Map();let logs=0;
    const queue=createRatingQueue({storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},account:()=>1,id:()=> 'r1',
      api:{log:async()=>{logs++;throw Object.assign(Error('Server failure'),{status:500});}}});
    queue.enqueue({matchId:7,diary:{match_id:7,is_rewatch:true,entry_id}});await queue.flush();await queue.flush({retryFailed:true});
    assert.equal(logs,entry_id?2:1);
    assert.equal(queue.read()[0].state,entry_id?'retryable-error':'uncertain');
  }
});

// --- ONARIM Asama 5 / BUILD §4.1: tek satirlik ifade + uc delta ---
test("6a: kart numarasi ve koleksiyon ucun receipt'inden geliyor", () => {
  const r = createCollectible(match, entry, { receipt: {
    entry_id: 9, card_number: 143, points_awarded: 15, streak_delta: 1,
    collection: { id: 3, title: "London Derby", collected: 8, total: 12, delta: 1 },
    season_award: { points: 300 },
  }});
  assert.equal(r.cardNumber, 143);
  assert.deepEqual(r.deltas.map(d => d.label), ["Rank points", "Streak nights"],
    "ucuncu delta artik koleksiyon karosu; 'Diary entries' cumlede zaten var");
  assert.equal(r.collection.title, "London Derby");
  assert.equal(r.collection.collected, 8);
  assert.equal(r.seasonAward.points, 300);
});

test("6a: cevrimdisi kuyrukta kart numarasi UYDURULMUYOR", () => {
  // Kuyrukta receipt yok: kacinci kart oldugunu sunucu soyler, istemci sayamaz
  // (baska cihazdan eklenen kayitlari bilmiyor).
  const r = createCollectible(match, entry, { queued: true });
  assert.equal(r.cardNumber, null);
  assert.equal(r.collection, null);
  assert.equal(r.seasonAward, null);
  assert.deepEqual(r.deltas.map(d => d.value), [null, null]);
});

test("6a: ilerleyen koleksiyon yoksa karo hic olusmuyor", () => {
  const r = createCollectible(match, entry, { receipt: { entry_id: 9, card_number: 2, points_awarded: 5 } });
  assert.equal(r.collection, null, "bos bir 0/0 ilerleme uydurulmamali");
  assert.equal(r.seasonAward, null);
  assert.equal(r.cardNumber, 2);
});

test("6a: bozuk kart numarasi sayi sayilmiyor", () => {
  for (const bad of ["143", null, undefined, NaN, Infinity]) {
    const r = createCollectible(match, entry, { receipt: { entry_id: 1, card_number: bad } });
    assert.equal(r.cardNumber, null, String(bad));
  }
});

// §4.1 "Gold appears once: the Classic hairline if stamped, otherwise the
// primary action. Never both." Sinif gecisi oldugu icin kaynaktan denetleniyor.
test('6a: altin bir kez — Classic varsa kartta, yoksa birincil eylemde', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
    '..', 'src', 'rankit', 'redesign', 'CollectibleResult.jsx'), 'utf8');
  assert.match(src, /className=\{entry\.classic \? '' : 'primary'\}[^>]*onClick=\{share\}/,
    'Share dugmesi Classic yokken birincil (altin) olmali, varken olmamali');
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
    '..', 'src', 'rankit', 'rankit.css'), 'utf8');
  assert.match(css, /\.ri-result-actions button\.primary\{background:var\(--ri-gold\)/,
    'primary sinifi altin arka plan vermiyor');
  // Baska hicbir sonuc ogesi altin boyamamali (bolgenin tek altini).
  const others = [...css.matchAll(/\.ri-result-[a-z-]*[^{]*\{[^}]*\}/g)]
    .map(m => m[0])
    .filter(rule => /var\(--ri-gold\)|#ffb11b/.test(rule) && !/button\.primary/.test(rule));
  assert.deepEqual(others, [], `sonuc ekraninda ikinci bir altin: ${others.join(' | ')}`);
});
