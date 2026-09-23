/* 6a — kaydin vardigi tam ekran. Kutlama veya ust uste acilan modal degil. */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Cloud, Edit3, Palette, Share2 } from 'lucide-react';
import MatchCard from './MatchCard';
import { toMatchCardProps } from './toMatchCardProps';
import { useBackClose } from './backStack';
import { collectibleShareText } from '../collectibleState';
import SkinPicker from './SkinPicker';
import { SKIN_NAMES, normalizeSkin, skinTokens, unlockSentence } from './skins';

/* 2j'ye giden kart ozeti: karolar bu macin kendisiyle cizilir. */
function thumbCard(props, match) {
  const hidden = props.spoiler;
  return {
    eyebrow: match.competition || '', homeColor: props.homeColor, awayColor: props.awayColor,
    homeAbbr: props.homeAbbr, awayAbbr: props.awayAbbr,
    homeScore: hidden ? '—' : props.homeScore || '—', awayScore: hidden ? '—' : props.awayScore || '—',
    score: hidden || !props.homeScore ? '—' : `${props.homeScore}–${props.awayScore}`,
  };
}

function UnlockRow({ skin, onUse }) {
  const t = skinTokens(skin.id);
  return <div className="ri-result-unlock">
    <div className="ri-unlock-swatch" aria-hidden="true"><i style={{ background: t.base }} />
      {t.sheen !== 'none' && <i style={{ background: t.sheen }} />}<b /></div>
    <div><strong>{(SKIN_NAMES[skin.id] || skin.name).toUpperCase()} UNLOCKED</strong><p>{unlockSentence(skin)}</p></div>
    {onUse && <button type="button" onClick={onUse} aria-label={`Use ${SKIN_NAMES[skin.id] || skin.name}`}>Use it</button>}
  </div>;
}

export default function CollectibleResult({ result, hideScores, onEdit, onDone, onSkinApplied }) {
  const { match, entry, queued, deltas, canEdit, cardNumber, collection, seasonAward, skinsUnlocked = [] } = result;
  const heading = useRef(null);
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  // 2j: kaydin skini. Sunucu dogrusu secicide yuklenir; burada son bilinen.
  const [skin, setSkin] = useState(normalizeSkin(entry.skin || match.my_skin));
  const [picker, setPicker] = useState(null);      // null kapali; { preset } acik
  const entryId = result.receipt?.entry_id || entry.entryId || null;
  useBackClose(onDone);
  useEffect(() => { heading.current?.focus(); }, []);
  const share = async () => {
    if (sharing) return;
    setSharing(true); setNotice('');
    try {
      const text = collectibleShareText(result);
      if (navigator.share) await navigator.share({ title: 'RankIt by Primary Arch', text });
      else { await navigator.clipboard.writeText(text); setNotice('Your rating text was copied.'); }
    } catch (error) {
      if (error.name !== 'AbortError') setNotice('Could not share. Your diary entry is safe.');
    } finally { setSharing(false); }
  };
  const props = toMatchCardProps({ ...match, my_rating:queued ? match.my_rating : entry.rating }, { hideScores });
  return <div className="rankit-app ri-result-app">
    <main className="ri-collectible-result" aria-labelledby="collectible-title" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onDone();}}}>
      <header className="ri-result-header"><button type="button" onClick={onDone}><ArrowLeft size={18}/> Back to RankIt</button><span>YOUR COLLECTION</span></header>
      <div className="ri-result-content">
        <div className="ri-result-state">{queued ? <Cloud size={16}/> : <Check size={16}/>}<span>{queued ? 'SAVED ON THIS PHONE' : result.receipt?.updated ? 'ENTRY UPDATED' : 'SAVED TO YOUR DIARY'}</span></div>
        <h1 id="collectible-title" ref={heading} tabIndex={-1}>{queued ? 'Kept here. Ready to sync.' : result.receipt?.updated ? 'Your take, refined.' : 'A match worth keeping.'}</h1>
        {/* §4.1 tek satirlik ifade. Kacinci kart oldugu UCTAN geliyor
            (`card_number`); cevrimdisi kuyrukta receipt yok, o zaman sayi
            soylenmez — kart numarasi uydurulmaz. */}
        <p className="ri-result-intro">{queued
          ? 'Upload confirmation and earned progress will appear in your diary when connected.'
          : cardNumber !== null
            ? `That's card ${cardNumber}. ${match.home.short} vs ${match.away.short}.`
            : `${match.home.short} vs ${match.away.short} · ${entry.rating ? `${entry.rating}/5 from you` : 'Watched and logged'}`}</p>
        <div className="ri-result-card"><MatchCard {...props} skin={skin} crestSize={52} scoreSize={match.sport==='Basketball'?30:38} artHeight={140}
          ratingKind="personal" heatLabel="YOUR RATING" heat={entry.rating || 0} classic={entry.classic} ratings={entry.classic?'YOUR CLASSIC':'YOUR DIARY'} footNote={entry.tags?.[0] || ''}/></div>
        <dl className="ri-result-deltas">{deltas.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value===null?'—':`${value>0?'+':''}${value}`}</dd></div>)}
          {/* Ucuncu delta: ilerleyen koleksiyon. Yoksa karo YOK — bos bir
              "0/0" ilerleme uydurmaktansa hic cizmemek dogru (§4.1 "any
              collection advanced"). */}
          {collection && <div className="ri-result-collection"><dt>{collection.title}</dt>
            <dd>{collection.collected}/{collection.total}{collection.delta > 0 ? ` +${collection.delta}` : ''}</dd></div>}
        </dl>
        {/* Sezon odulu nadir ve buyuk; deltalarin yaninda kucuk bir sayi
            olarak degil, kendi satirinda duruyor. */}
        {seasonAward?.points > 0 && <p className="ri-result-season">A season followed end to end · +{seasonAward.points}</p>}
        {skinsUnlocked.map(s => <UnlockRow key={s.id} skin={s}
          onUse={entryId && !queued ? () => setPicker({ preset: s.id }) : null} />)}
        <p className="ri-result-meta">{queued ? 'Progress is not confirmed until upload completes.' : deltas.some(d=>d.value===null) ? 'Some progress details were not returned by the server.' : 'Confirmed by your diary. Updates do not earn the same reward twice.'}</p>
        <div className="ri-result-actions">
          {/* §4.1 "Gold appears once: the Classic hairline if stamped, otherwise
              the primary action. Never both." Classic damgaliysa altin kartin
              hairline'inda; degilse birincil eylem (Share) altin. */}
          <button type="button" className={entry.classic ? '' : 'primary'} onClick={share} disabled={sharing || queued} aria-busy={sharing}><Share2 size={17}/>{sharing?'Sharing…':'Share'}</button>
          <button type="button" onClick={() => setPicker({ preset: null })} disabled={!entryId || queued}
            aria-describedby={!entryId || queued ? 'result-skin-note' : undefined}><Palette size={17}/> Skin · {SKIN_NAMES[skin]}</button>
          <button type="button" onClick={onEdit} disabled={!canEdit}><Edit3 size={17}/> Edit</button>
        </div>
        <p id="result-skin-note" className="ri-result-meta">{!entryId || queued
          ? 'Skins apply once this entry has synced. Share sends your rating as text.'
          : 'Share sends your rating as text. Image export is being prepared.'}</p>
        {!canEdit&&<p className="ri-result-meta">Check the uploaded rewatch in your diary before editing; a second copy will not be created here.</p>}
        <p className="ri-result-notice" role="status">{notice}</p>
      </div>
    </main>
    {picker && <SkinPicker entryId={entryId} matchId={match.id} card={thumbCard(props, match)} initial={skin}
      preset={picker.preset} onApplied={id => { setSkin(id); onSkinApplied?.(entryId, id); setNotice(`${SKIN_NAMES[id]} applied to this card.`); }}
      onClose={() => setPicker(null)} />}
  </div>;
}
