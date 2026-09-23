/* Yalniz Vite gelistirme sunucusundan acilan sentetik QA fiksturu.
   Uretim girisinden import edilmez; gercek API/hesap/veritabani kullanmaz. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MatchDetail } from '../src/rankit/RankItPrototype';
import MatchCard from '../src/rankit/redesign/MatchCard';
import SearchSheet from '../src/rankit/redesign/SearchSheet';
import CollectibleResult from '../src/rankit/redesign/CollectibleResult';
import { StandingEntry } from '../src/rankit/redesign/Standing';
import ProfileRoot from '../src/rankit/redesign/ProfileRoot';
import { collectibleEditMatch } from '../src/rankit/collectibleState';
import { toMatchCardProps } from '../src/rankit/redesign/toMatchCardProps';
import { rankitApi } from '../src/rankit/rankitApi';
import { ratingAccount } from '../src/rankit/rankitOutbox';
import { closeTopDialog } from '../src/rankit/redesign/useDialog';
import '../src/index.css';

let fail = false;
const match = {id:9999001,sport:'Basketball',status:'finished',score:'112 – 108',competition:'QA League',season:'2026-27',date:'12 Sep 2026',dateOnly:'12 Sep',
  home:{id:1,short:'Boston',name:'Boston Celtics',color:'#2f5480',crest_url:'/qa/missing-crest.svg'},
  away:{id:2,short:'Golden State',name:'Golden State Warriors',color:'#ffb11b'},
  players:[],tags:[],reviews:[],ratings:66,reviewCount:66,communityRating:4.2};
const response = async value => {await new Promise(resolve=>setTimeout(resolve,250));if(fail)throw Error('QA server failure');return value;};
const people = Array.from({length:36}, (_,i)=>({id:1000+i,username:i===35?'qa_retry':i===0?'a_very_long_username_to_test_truncation':`qa_person_${String(i).padStart(2,'0')}`,
  following:i<33,follows_you:i<2||i>=33,matches:100+i,classics:12,
  overlap:{shared:i===32?9:20,agree:18,pct:i===32?null:.9,bias:0,min_shared:10}}));
const peopleCounts=()=>({following:people.filter(p=>p.following).length,followers:people.filter(p=>p.follows_you).length});
let retryAttempts=0;
rankitApi.people=({kind='following',q='',offset=0,limit=30}={})=>{
  if(q==='offline')return Promise.reject(Object.assign(Error("You're offline"),{offline:true}));
  const rows=people.filter(p=>(kind==='following'?p.following:p.follows_you)&&p.username.includes(q.replace('@','')));
  return response({owner:{id:999,username:'qa_reader'},counts:peopleCounts(),people:structuredClone(rows.slice(offset,offset+limit)),total:rows.length,next_offset:offset+limit<rows.length?offset+limit:null});
};
rankitApi.discoverPeople=({q='',offset=0,limit=20}={})=>{
  if(q==='offline')return Promise.reject(Object.assign(Error("You're offline"),{offline:true}));
  const rows=people.filter(p=>(!q||p.username.includes(q.replace('@','')))&&p.overlap.shared>0);
  return response({people:structuredClone(rows.slice(offset,offset+limit)),total:rows.length,
    next_offset:offset+limit<rows.length?offset+limit:null,primary_arch_connections:null});
};
rankitApi.setUserFollow=async(id,following)=>{
  await response({});
  if(id===1035&&retryAttempts++===0)throw Error('QA first attempt fails');
  const person=people.find(p=>p.id===id);
  person.following=following;
  window.dispatchEvent(new CustomEvent('rankit:relationships',{detail:{account:String(ratingAccount()),id}}));
  return {following,follows_you:person.follows_you};
};
rankitApi.member=id=>{
  const p=people.find(row=>row.id===id);
  return response({member:{id,username:p.username},following:p.following,follows_you:p.follows_you,is_self:false,
    stats:{matches:p.matches,classics:p.classics,avg_rating:4},rank:{tier:2,name:'Regular'},overlap:p.overlap,shelf:[]});
};
rankitApi.companion = ()=>response({status:'finished',pulse:{reads:0,timeline:[]},joined:0,moments:[]});
rankitApi.broadcasts = ()=>response({channels:[]});
rankitApi.search = ()=>response({matches:[match],teams:[],players:[],members:[],lists:[]});
rankitApi.matchReviews = (id,sort,tz,offset=0)=>response({total:66,next_offset:offset?null:60,followed:[],everyone:Array.from({length:offset?6:60},(_,i)=>({id:offset+i+1,username:'qa_reader',rating:4,review:'A close finish. Test review.',respect:2,respected:true,spoiler:true}))});
rankitApi.reviewThread = id=>response({match:{title:'Boston vs Golden State'},review:{id,username:'qa_reader',review:'SECRET MATCH RESULT',tags:['Clutch'],spoiler:true,respect:2,respected:true,rank:2},replies:[]});
rankitApi.watchalong=()=>response({messages:[]});
rankitApi.profile=()=>response({user:{id:999,username:'qa_reader',created_at:'2025-08-15'},stats:{matches:143,classics:12,following_people:peopleCounts().following,followers:peopleCounts().followers,lists:1,reviews:1},owned_lists:[{id:44,title:'My private shelf',visibility:'private',match_count:3}]});
rankitApi.diary=()=>response({entries:[1,2,3].map((id)=>({id,match_id:id+90,sport:id===2?'Basketball':'Football',status:'finished',home_short:id===2?'Thunder':'Arsenal',away_short:id===2?'Nuggets':'Tottenham Hotspur',home_score:id===2?118:3,away_score:id===2?115:1,home_color:'#2f5480',away_color:'#d43a63',rating:4,classic:id===1,competition:'QA League',watched_date:'2026-09-12',review:id===1?'SECRET OWN REVIEW':'',spoiler:true,visibility:'private'}))});
rankitApi.rank=()=>response({username:'qa_reader',matches:142,rank:{tier:4,name:'Terrace Regular',points:2840,next_name:'Season Ticket',next_at:3500,progress:0.6229},streak:{current:12,best:21,rest_nights_enforced:true},breakdown:[{kind:'rate_same_day',count:68,points:1020},{kind:'respect',count:412,points:824},{kind:'companion',count:31,points:620},{kind:'season',count:2,points:600}]});

export default function QA() {
  const [detail,setDetail]=useState(false),[search,setSearch]=useState(false),[saved,setSaved]=useState(0),[failure,setFailure]=useState(false);
  const [result,setResult]=useState(null),[editMatch,setEditMatch]=useState(null),[queued,setQueued]=useState(false);
  const [previewWidth,setPreviewWidth]=useState(390);
  const [profile,setProfile]=useState(false);
  const [action,setAction]=useState('');
  if(result)return <div style={{maxWidth:previewWidth,margin:'auto',minHeight:'100dvh',transform:'translateZ(0)'}}><CollectibleResult result={result} hideScores={true} onDone={()=>setResult(null)} onEdit={()=>{setEditMatch(collectibleEditMatch(result));setDetail(true);setResult(null);}}/></div>;
  return <div className="rankit-app" style={{width:previewWidth,maxWidth:'100%',margin:'auto',minHeight:'100vh',overflow:'hidden'}}>
    <div style={{height:'100%',overflowY:'auto'}}>
    <header style={{padding:16}}><h1>RankIt · isolated QA</h1><p>Synthetic fixtures. No real API writes.</p>
      <button onClick={()=>{setEditMatch(null);setDetail(true);}}>Open test match</button>{' '}
      <button onClick={()=>setPreviewWidth(320)}>320px preview</button>{' '}
      <button onClick={()=>setPreviewWidth(390)}>390px preview</button>{' '}
      <button onClick={()=>setSearch(true)}>Open test search</button>{' '}
      <button onClick={()=>setProfile(v=>!v)}>Toggle profile 6b</button>{' '}
      <button onClick={()=>closeTopDialog()}>Android Back test</button>{' '}
      <label><input type="checkbox" checked={failure} onChange={e=>{fail=e.target.checked;setFailure(e.target.checked);}}/> Fail requests</label>
      <label><input type="checkbox" checked={queued} onChange={e=>setQueued(e.target.checked)}/> Queue saves</label>
      <p role="status">Confirmed saves: {saved}</p>
      <p role="status">{action}</p>
      <StandingEntry/>
    </header>
    {profile && <ProfileRoot onOpen={m=>setAction(`Open match ${m.id}`)} onShelf={()=>setAction('Open diary shelf')} onFind={()=>setSearch(true)} onRank={()=>setAction('Rate a match')} onOpenList={id=>setAction(`Open list ${id}`)} onCreateList={()=>setAction('Create list')}/>}
    <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:18,padding:16}}>
      {[[323,150,62,52,false],[268,140,62,30,false],[155,104,44,30,true],[155,94,40,28,true],[155,88,40,26,true],[295,58,38,26,true]].map(([width,artHeight,crestSize,scoreSize,compact],i)=><section key={i} style={{width,maxWidth:'100%'}}>
        <h2 style={{fontSize:15}}>Preset {i+1} · {width}px</h2>
        <MatchCard {...toMatchCardProps({...match,status:i===1?'live':'finished'},{compact})} compact={compact} artHeight={artHeight} crestSize={crestSize} scoreSize={scoreSize} spoiler={i===0}/>
      </section>)}
    </div>
    </div>
    {detail&&<MatchDetail match={editMatch || match} hideScores={true} onClose={()=>setDetail(false)} onResult={value=>{setResult(value);setDetail(false);}}
      onSave={async payload=>{await response({});setSaved(v=>v+1);return queued?{queued:true}:{receipt:{entry_id:9001,updated:!!payload.diary.entry_id,points_awarded:payload.diary.entry_id?0:15,diary_entries_delta:payload.diary.entry_id?0:1,streak_delta:payload.diary.entry_id?0:1}};}} onRefresh={()=>{}}/>}
    {search&&<SearchSheet hideScores={true} onClose={()=>setSearch(false)} onOpenMatch={()=>{setSearch(false);setDetail(true);}} onOpenEntity={()=>{}}/>}
  </div>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<QA/>);
