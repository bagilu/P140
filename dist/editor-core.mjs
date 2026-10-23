import {meters,validateNetwork} from './core.mjs';
export const DRAFT_VERSION='1.0.0';
export const uid=prefix=>prefix+'_'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replaceAll('-','').slice(0,12);
export const normalizeName=name=>String(name||'').normalize('NFKC').replace(/[（(〔【].*?[）)〕】]/g,'').replace(/[臺]/g,'台').replace(/[\s・·－—-]/g,'');
export function parseTime(value){const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());if(!m||+m[1]>23||+m[2]>59||+(m[3]||0)>59)throw Error('發車時間請使用00:00至23:59');return +m[1]*3600 + +m[2]*60 + +(m[3]||0);}
export function timeString(sec){return [Math.floor(sec/3600),Math.floor(sec%3600/60),Math.floor(sec%60)].map(x=>String(x).padStart(2,'0')).join(':').replace(/:00$/,'');}
export function validCoord(c){return Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90;}
export function blankDraft(){return {draftVersion:DRAFT_VERSION,routeId:uid('route'),shortName:'新路線',name:'新公車路線',color:'#166b63',isDemo:false,source:{title:'',url:'',date:'',notes:'',images:[]},warnings:[],patterns:[{id:uid('pattern'),name:'去程',headsign:'',stops:[],segments:[],departures:[],sequenceConfirmed:false}],updatedAt:new Date().toISOString()};}
export function ensureSegments(p){const old=new Map((p.segments||[]).map(s=>[s.from+'|'+s.to,s]));p.segments=p.stops.slice(0,-1).map((s,i)=>({from:s.id,to:p.stops[i+1].id,path:null,via:[],durationSec:null,confirmed:false,locked:false,source:'OSRM道路候選',...old.get(s.id+'|'+p.stops[i+1].id)}));return p;}
export function invalidateStop(p,id){for(const s of p.segments||[])if(s.from===id||s.to===id){s.path=null;s.durationSec=null;s.confirmed=false;s.locked=false;}p.stops.find(s=>s.id===id).confirmed=false;}
export function fromRecognition(data){
 if(data.recognitionVersion!=='1.0.0'||!Array.isArray(data.patterns)||!data.patterns.length)throw Error('需要 recognitionVersion=1.0.0 與 patterns 陣列');
 const d=blankDraft();for(const k of ['routeId','shortName','name','color'])if(typeof data[k]==='string'&&data[k])d[k]=data[k];
 d.source={...d.source,...data.source};d.warnings=(data.warnings||[]).map(String);
 d.patterns=data.patterns.map((p,i)=>ensureSegments({id:p.id||uid('pattern'),name:p.name||`方向${i+1}`,headsign:p.headsign||p.stops?.at(-1)?.name||'',sequenceConfirmed:false,stops:(p.stops||[]).map(s=>({id:uid('call'),name:typeof s==='string'?s:s.name,coord:typeof s==='object'&&validCoord(s.coord)?s.coord:null,confirmed:false,coordinateSource:'AI匯入：待確認',dwellSec:20,arrivalOffsetSec:null,departureOffsetSec:null,candidateId:null})),departures:(p.departures||[]).map(t=>{parseTime(t.time);if(!Array.isArray(t.days)||!t.days.length||!t.days.every(d=>Number.isInteger(d)&&d>=1&&d<=7))throw Error('班次星期須為1至7');return {id:uid('trip'),time:t.time,days:[...new Set(t.days)]};}),segments:[]}));
 validateDraftShape(d);return d;
}
export function validateDraftShape(d){
 if(d?.draftVersion!==DRAFT_VERSION||!Array.isArray(d.patterns)||!d.patterns.length)throw Error('草稿格式不符');
 if(typeof d.shortName!=='string'||!d.shortName.trim()||typeof d.name!=='string'||!d.name.trim())throw Error('路線簡稱與名稱不可空白');
 if(!d.source||typeof d.source.title!=='string')throw Error('草稿缺少來源紀錄');
 d.source={title:'',url:'',date:'',notes:'',images:[],...d.source};if(!Array.isArray(d.source.images)||d.source.images.some(x=>typeof x!=='string'))throw Error('來源圖片格式不符');
 if(!Array.isArray(d.warnings))d.warnings=[];
 if(!/^[a-zA-Z0-9_-]+$/.test(d.routeId||''))throw Error('路線識別碼只能使用英數、底線與連字號');
 if(!/^#[a-f\d]{6}$/i.test(d.color||''))throw Error('路線顏色格式錯誤');
 const ids=new Set();for(const p of d.patterns){if(ids.has(p.id))throw Error('方向識別碼重複');ids.add(p.id);if(!Array.isArray(p.stops)||!Array.isArray(p.departures))throw Error('站點與班次需為陣列');let calls=new Set();for(const s of p.stops){if(typeof s.name!=='string'||!s.name.trim()||calls.has(s.id))throw Error('站名空白或停靠識別碼重複');calls.add(s.id);if(s.coord!==null&&!validCoord(s.coord))throw Error('站牌經緯度格式錯誤');}for(const t of p.departures){parseTime(t.time);if(!Array.isArray(t.days)||!t.days.length||t.days.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('班次星期格式錯誤');}ensureSegments(p);for(const s of p.segments){if(!Array.isArray(s.via)||s.via.some(c=>!validCoord(c))||s.path!==null&&(!Array.isArray(s.path)||s.path.length<2||s.path.some(c=>!validCoord(c))))throw Error('道路折線或必經點格式錯誤');}}
 return d;
}
export function fromNetwork(n,routeId){
 const errors=validateNetwork(n);if(errors.length)throw Error(errors.join('\n'));const r=n.routes.find(r=>r.routeId===routeId)||n.routes[0],d=blankDraft();
 for(const k of ['routeId','shortName','name','color','isDemo'])d[k]=r[k];d.source={...d.source,title:'已匯入的P140路線JSON',notes:'站位、道路與時間來源請依原始資料查證。原路線完整保存於 originalRoute。'};d.originalRoute=r;
 d.patterns=Object.entries(r.patterns).map(([pid,p])=>{
 const profiles=Object.values(r.timingProfiles).filter(t=>t.patternId===pid);if(profiles.length!==1)throw Error('第一版工作台每方向只編輯一組行車時間；此JSON含多組時間，請另存單一設定後再匯入。');const tm=profiles[0];const pp={id:pid,name:p.direction==='outbound'?'去程':p.direction==='inbound'?'回程':p.headsign,headsign:p.headsign,sequenceConfirmed:p.verificationStatus==='verified',stops:p.stopCalls.map((c,i)=>({id:uid('call'),name:r.stops[c.stopId].name,coord:r.stops[c.stopId].coord,confirmed:r.stops[c.stopId].verificationStatus==='verified',coordinateSource:r.sources[r.stops[c.stopId].sourceId]?.description||'匯入資料',dwellSec:tm.stopTimes[i].departureOffsetSec-tm.stopTimes[i].arrivalOffsetSec,arrivalOffsetSec:tm.stopTimes[i].arrivalOffsetSec,departureOffsetSec:tm.stopTimes[i].departureOffsetSec})),segments:[],departures:r.trips.filter(t=>t.patternId===pid).map(t=>({id:uid('trip'),time:timeString(t.startSec),days:t.days}))};
 let cumulative=[0];for(let i=1;i<p.path.length;i++)cumulative.push(cumulative.at(-1)+meters(p.path[i-1],p.path[i]));
 function along(d){let i=1;while(i<cumulative.length-1&&cumulative[i]<d)i++;const a=p.path[i-1],b=p.path[i],f=Math.min(1,Math.max(0,(d-cumulative[i-1])/(cumulative[i]-cumulative[i-1]||1)));return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}
 pp.segments=pp.stops.slice(0,-1).map((s,i)=>{let a=p.stopCalls[i].distanceAlongPathM,b=p.stopCalls[i+1].distanceAlongPathM;return {from:s.id,to:pp.stops[i+1].id,path:[along(a),...p.path.filter((c,j)=>cumulative[j]>a&&cumulative[j]<b),along(b)],via:[],durationSec:tm.stopTimes[i+1].arrivalOffsetSec-tm.stopTimes[i].departureOffsetSec,confirmed:p.verificationStatus==='verified',locked:false,source:'匯入JSON道路'};});return pp;
 });return validateDraftShape(d);
}
export function candidatesFor(name,catalogue){
 const key=normalizeName(name);return catalogue.map(c=>{const n=normalizeName(c.name);let score=n===key?100:(n.includes(key)||key.includes(n))&&Math.min(n.length,key.length)>=2?65:0;return {...c,score};}).filter(c=>c.score).sort((a,b)=>b.score-a.score||Number(b.kind==='official')-Number(a.kind==='official')||a.name.localeCompare(b.name)).slice(0,12);
}
export function normalizeCatalogue(data){
 const records=Array.isArray(data)?data:data?.stops||data?.elements||data?.features?.map(f=>({...f.properties,...f.attributes,coord:f.geometry?.coordinates||(f.geometry?[f.geometry.x,f.geometry.y]:null)}));
 if(!Array.isArray(records))throw Error('站牌資料須為JSON陣列、{stops:[...]} 或 Overpass elements');
 const result=records.map((x,i)=>{const official=!!(x.StopUID||x.stopuid);const name=x.name||x.tags?.['name:zh']||x.tags?.name||x.StopName?.Zh_tw||x.StopName||x.stopname;const coord=x.coord||(x.StopPosition?[Number(x.StopPosition.PositionLon),Number(x.StopPosition.PositionLat)]:[Number(x.lon),Number(x.lat)]);return {id:String(x.id||x.StopUID||x.stopuid||'import_'+i),name,coord,kind:official?'official':x.kind||'imported',source:x.source||(official?'使用者匯入政府站牌資料':x.tags?'OpenStreetMap站牌候選':'使用者匯入站牌資料')};}).filter(x=>typeof x.name==='string'&&validCoord(x.coord));
 if(!result.length)throw Error('找不到包含站名與經緯度的有效資料');return result;
}
export function estimateTimes(p,factor=1.5,dwell=20){
 if(!Number.isFinite(factor)||factor<.2||factor>5)throw Error('調整倍數須為0.2至5');
 if(p.segments.length!==p.stops.length-1||p.segments.some(s=>!s.path?.length||!Number.isFinite(s.durationSec)))throw Error('請先完成所有站間道路，才能估算時間');
 let t=0;for(let i=0;i<p.stops.length;i++){if(i)t+=Math.max(1,Math.round(p.segments[i-1].durationSec*factor));const s=p.stops[i];s.arrivalOffsetSec=t;s.dwellSec=i===0?0:Math.max(0,Number.isFinite(s.dwellSec)?s.dwellSec:dwell);s.departureOffsetSec=t+s.dwellSec;t=s.departureOffsetSec;}
 p.timeSource=`依各路段旅行時間乘${factor}，另加停站時間；非官方到站時刻。`;
}
export function inspectDraft(d,strict=true){
 const errors=[],warnings=[...d.warnings||[]];
 try{validateDraftShape(d);}catch(e){return {errors:[e.message],warnings};}
 if(!d.source.title.trim())errors.push('請填寫來源名稱');
 for(const p of d.patterns){
  if(p.stops.length<2)errors.push(`${p.name}：至少需要兩站`);if(!p.departures.length)errors.push(`${p.name}：沒有發車班次`);if(strict&&!p.sequenceConfirmed)errors.push(`${p.name}：站序尚未確認`);
  let previous=0;for(const [i,s]of p.stops.entries()){if(!validCoord(s.coord))errors.push(`${p.name}／${s.name}：缺少位置`);else if(strict&&!s.confirmed)errors.push(`${p.name}／${s.name}：位置尚未確認`);if(!Number.isFinite(s.arrivalOffsetSec)||!Number.isFinite(s.departureOffsetSec)||s.arrivalOffsetSec<previous||s.departureOffsetSec<s.arrivalOffsetSec)errors.push(`${p.name}／${s.name}：到離站時間缺漏或順序錯誤`);if(i===0&&(s.arrivalOffsetSec!==0||s.departureOffsetSec!==0))errors.push(`${p.name}：起站時間必須為0`);previous=s.departureOffsetSec;}
  for(const [i,s]of p.segments.entries()){if(!s.path||s.path.length<2)errors.push(`${p.name}路段${i+1}：缺少道路`);else if(strict&&!s.confirmed)errors.push(`${p.name}路段${i+1}：道路尚未確認`);}
  const distinct=new Set();for(const t of p.departures)for(const day of t.days){let key=day+':'+parseTime(t.time);if(distinct.has(key))errors.push(`${p.name}：${t.time}星期${day}重複班次`);distinct.add(key);}
 }
 if(!d.source.date)warnings.push('資料取得日期尚未填寫；官方生效日期請核對來源附註。');warnings.push('途中時間為估算，行程後段可能累積較大誤差。');return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export function exportNetwork(d,{strict=true}={}){
 const report=inspectDraft(d,strict);if(report.errors.length)throw Error(report.errors.join('\n'));
 const original=d.originalRoute?.sources||{},sources={...original,editor_official:{kind:d.isDemo?'synthetic':'official',description:d.source.title+(d.source.notes?'；'+d.source.notes:'')},editor_positions:{kind:'manual',description:'站牌候選由管理者校正；各站描述見 editor_draft 專案檔。'},editor_roads:{kind:'routing',description:'道路候選經管理者確認；不是營運單位即時路徑。',url:'https://project-osrm.org/'},editor_times:{kind:'estimated',description:'依道路候選與停站設定估算，非官方途中到站時刻。'}};
 if(/^https?:\/\//.test(d.source.url||''))sources.editor_official.url=d.source.url;if(/^\d{4}-\d{2}-\d{2}$/.test(d.source.date||''))sources.editor_official.retrievedAt=d.source.date;
 const route={routeId:d.routeId,shortName:d.shortName,name:d.name,color:d.color,isDemo:d.isDemo,sources,stops:{},patterns:{},timingProfiles:{},trips:[]};
 for(const p of d.patterns){let path=[],calls=[],total=0;
  p.stops.forEach((s,i)=>{if(i){const seg=p.segments[i-1].path;if(path.length&&meters(path.at(-1),seg[0])>2)throw Error(`${p.name}路段${i}不連續，請重算連接道路`);const part=path.length?seg.slice(1):seg;for(const c of part){if(path.length)total+=meters(path.at(-1),c);path.push(c);}}const sid=d.routeId+'_'+p.id+'_'+s.id;route.stops[sid]={name:s.name,coord:s.coord,sourceId:'editor_positions',verificationStatus:strict?'verified':'unverified'};calls.push({stopId:sid,distanceAlongPathM:Math.round(total*100)/100});});
  const tid=p.id+'_timing';route.patterns[p.id]={direction:p.name.includes('回')?'inbound':'outbound',headsign:p.headsign||p.stops.at(-1).name,path,stopCalls:calls,sourceId:'editor_roads',verificationStatus:strict?'verified':'unverified'};
  route.timingProfiles[tid]={patternId:p.id,sourceId:'editor_times',stopTimes:p.stops.map(s=>({arrivalOffsetSec:Math.round(s.arrivalOffsetSec),departureOffsetSec:Math.round(s.departureOffsetSec)}))};
  for(const t of p.departures)route.trips.push({tripId:t.id,patternId:p.id,timingProfileId:tid,startSec:parseTime(t.time),days:t.days,sourceId:'editor_official'});
 }
 const network={schemaVersion:'1.0.0',dataVersion:d.routeId+'-'+new Date().toISOString().slice(0,10),timezone:'Asia/Taipei',generatedAt:new Date().toISOString().slice(0,10),isDemo:d.isDemo,displaySettings:{stopLabelBeforeArrivalSec:30,stopLabelAfterDepartureSec:15},routes:[route]};const errors=validateNetwork(network);if(errors.length)throw Error(errors.join('\n'));return network;
}
function oldPatternFor(d,p){return d.patterns.find(o=>o.id===p.id)||d.patterns.find(o=>o.name===p.name);}
export function compareRecognition(d,recognition){
 if(recognition.routeId&&recognition.routeId!==d.routeId)throw Error('這是不同路線的資料，請作為新草稿匯入，避免覆蓋原路線。');
 const incoming=fromRecognition(recognition),changes=[];
 for(const p of incoming.patterns){const old=oldPatternFor(d,p);if(!old){changes.push({type:'新增方向',name:p.name});continue;}const a=old.stops.map(s=>s.name),b=p.stops.map(s=>s.name);if(JSON.stringify(a)!==JSON.stringify(b))changes.push({type:'站序變更',name:p.name,detail:`${a.length}站 → ${b.length}站`});const times=p=>p.departures.map(t=>t.time+'('+t.days.join(',')+')').sort();if(JSON.stringify(times(old))!==JSON.stringify(times(p)))changes.push({type:'班次變更',name:p.name,detail:`${old.departures.length}班 → ${p.departures.length}班`});}
 if(d.patterns.length>incoming.patterns.length)changes.push({type:'方向減少',name:`${d.patterns.length} → ${incoming.patterns.length}`});return {incoming,changes};
}
export function mergeRecognition(d,incoming){
 const next=structuredClone(d);next.warnings=incoming.warnings;next.source={...next.source,...incoming.source,images:d.source.images||[]};
 next.patterns=incoming.patterns.map(p=>{const old=oldPatternFor(d,p);if(!old)return p;const same=old.stops.length===p.stops.length&&old.stops.every((s,j)=>s.name===p.stops[j].name);if(same)return {...structuredClone(old),departures:p.departures};
 const remaining=old.stops.map(s=>structuredClone(s));const result={...p,id:old.id,sequenceConfirmed:false};result.stops=p.stops.map(s=>{const j=remaining.findIndex(x=>x.name===s.name);return j>=0?remaining.splice(j,1)[0]:s;});result.segments=structuredClone(old.segments);ensureSegments(result);for(const s of result.stops){s.arrivalOffsetSec=null;s.departureOffsetSec=null;}return result;});return next;
}
