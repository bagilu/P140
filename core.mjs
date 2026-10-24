export const VERSION='V0.008';
export const wrapDay=d=>((d-1)%7+7)%7+1;
export function formatTime(s){s=Math.max(0,Math.min(86400,Math.floor(s)));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');}
export function meters(a,b){const r=Math.PI/180;return Math.hypot((b[0]-a[0])*r*Math.cos((a[1]+b[1])*r/2),(b[1]-a[1])*r)*6371000;}
export function validateNetwork(n){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg)};
 check(n?.schemaVersion==='1.0.0','不支援的 schemaVersion');check(n?.timezone==='Asia/Taipei','時區必須為 Asia/Taipei');
 check(Array.isArray(n?.routes)&&n.routes.length>0,'至少需要一條路線');
 check(Number.isInteger(n?.displaySettings?.stopLabelBeforeArrivalSec)&&n.displaySettings.stopLabelBeforeArrivalSec>=0&&Number.isInteger(n?.displaySettings?.stopLabelAfterDepartureSec)&&n.displaySettings.stopLabelAfterDepartureSec>=0,'站名顯示秒數必須為非負整數');
 const ids=new Set();
 for(const r of n?.routes||[]){
  check(typeof r.routeId==='string'&&!ids.has(r.routeId),'路線識別碼重複或缺漏');ids.add(r.routeId);
  check(typeof r.shortName==='string'&&r.shortName.length>0,'路線簡稱必須是文字');
  check(/^#[0-9a-f]{6}$/i.test(r.color||''),`${r.routeId} 顏色錯誤`);
  const sourceOk=id=>typeof id==='string'&&!!r.sources?.[id];
  for(const [sid,s]of Object.entries(r.stops||{})){check(Array.isArray(s.coord)&&s.coord.length===2&&s.coord.every(Number.isFinite)&&Math.abs(s.coord[0])<=180&&Math.abs(s.coord[1])<=90,`${sid} 站牌座標錯誤`);check(sourceOk(s.sourceId),`${sid} 找不到來源`);}
  for(const [pid,p] of Object.entries(r.patterns||{})){
   check(sourceOk(p.sourceId),`${pid} 找不到來源`);
   check(Array.isArray(p.path)&&p.path.length>=2,`${pid} 缺少道路折線`);
   for(const c of p.path||[])check(Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90,`${pid} 座標格式錯誤`);
   const length=(p.path||[]).slice(1).reduce((sum,c,i)=>sum+meters(p.path[i],c),0);
   check(p.stopCalls?.length>=2,`${pid} 至少需要兩個停靠點`);
   let last=-1;
   for(const c of p.stopCalls||[]){check(!!r.stops?.[c.stopId],`${pid} 找不到站點 ${c.stopId}`);check(Number.isFinite(c.distanceAlongPathM)&&c.distanceAlongPathM>=last&&c.distanceAlongPathM<=length+2,`${pid} 停靠距離順序或範圍錯誤`);last=c.distanceAlongPathM;}
  }
  for(const [id,tm] of Object.entries(r.timingProfiles||{})){
   check(sourceOk(tm.sourceId),`${id} 找不到來源`);const p=r.patterns?.[tm.patternId];check(!!p,`${id} 找不到路徑`);check(tm.stopTimes?.length===p?.stopCalls?.length,`${id} 時間筆數不符`);
   let last=0;
   for(const s of tm.stopTimes||[]){check(Number.isFinite(s.arrivalOffsetSec)&&Number.isFinite(s.departureOffsetSec)&&s.arrivalOffsetSec>=last&&s.departureOffsetSec>=s.arrivalOffsetSec,`${id} 到離站時間順序錯誤`);last=s.departureOffsetSec;}
   check(tm.stopTimes?.[0]?.arrivalOffsetSec===0&&tm.stopTimes?.[0]?.departureOffsetSec===0,`${id} 起站發車為第0秒`);check(last>0&&last<=86400,`${id} 行程須介於0至24小時`);
  }
  const trips=new Set();
  for(const t of r.trips||[]){check(sourceOk(t.sourceId),`${t.tripId} 找不到來源`);check(!trips.has(t.tripId),`${r.routeId} 班次識別碼重複`);trips.add(t.tripId);check(Number.isInteger(t.startSec)&&t.startSec>=0&&t.startSec<86400,`${t.tripId} 發車秒數錯誤`);check(Array.isArray(t.days)&&t.days.length>0&&new Set(t.days).size===t.days.length&&t.days.every(d=>Number.isInteger(d)&&d>=1&&d<=7),`${t.tripId} 星期須為1至7且不重複`);check(!!r.patterns?.[t.patternId]&&r.timingProfiles?.[t.timingProfileId]?.patternId===t.patternId,`${t.tripId} 路徑與時間設定不符`);}
 }
 return [...new Set(errors)];
}
export function compileNetwork(n){
 const errors=validateNetwork(n);if(errors.length)throw Error(errors.join('\n'));
 const trips=[];
 for(const r of n.routes){
  const paths={};for(const [id,p] of Object.entries(r.patterns)){let cumulative=[0];for(let i=1;i<p.path.length;i++)cumulative.push(cumulative.at(-1)+meters(p.path[i-1],p.path[i]));paths[id]={...p,cumulative};}
  for(const t of r.trips){const p=paths[t.patternId],timing=r.timingProfiles[t.timingProfileId];trips.push({...t,route:r,pattern:p,times:timing.stopTimes,duration:timing.stopTimes.at(-1).departureOffsetSec});}
 }
 return {trips,settings:n.displaySettings,routes:n.routes};
}
export function pointAlong(p,d){
 const cum=p.cumulative,path=p.path;d=Math.max(0,Math.min(d,cum.at(-1)));
 let lo=0,hi=cum.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(cum[mid]<=d)lo=mid;else hi=mid;}
 const f=cum[hi]===cum[lo]?0:(d-cum[lo])/(cum[hi]-cum[lo]);
 return [path[lo][0]+(path[hi][0]-path[lo][0])*f,path[lo][1]+(path[hi][1]-path[lo][1])*f];
}
// Use the exact same along-road distance as the vehicle position, including dwell.
export function splitPathAt(p,d){
 const total=p.cumulative.at(-1);d=Math.max(0,Math.min(d,total));
 if(d===0)return {past:[p.path[0]],future:p.path};
 if(d===total)return {past:p.path,future:[p.path.at(-1)]};
 let lo=0,hi=p.cumulative.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(p.cumulative[mid]<=d)lo=mid;else hi=mid;}
 const point=pointAlong(p,d),past=p.path.slice(0,lo+1);
 if(d!==p.cumulative[lo])past.push(point);
 return {past,future:[point,...p.path.slice(hi)]};
}
export function tripPosition(trip,elapsed){
 const times=trip.times,calls=trip.pattern.stopCalls;let d=calls.at(-1).distanceAlongPathM,dwelling=false,index=times.length-1;
 for(let i=0;i<times.length;i++){
  const st=times[i];if(elapsed>=st.arrivalOffsetSec&&elapsed<st.departureOffsetSec){d=calls[i].distanceAlongPathM;dwelling=true;index=i;break;}
  if(i<times.length-1&&elapsed>=st.departureOffsetSec&&elapsed<times[i+1].arrivalOffsetSec){const span=times[i+1].arrivalOffsetSec-st.departureOffsetSec;const f=span?((elapsed-st.departureOffsetSec)/span):1;d=calls[i].distanceAlongPathM+f*(calls[i+1].distanceAlongPathM-calls[i].distanceAlongPathM);index=i;break;}
 }
 return {coord:pointAlong(trip.pattern,d),ahead:pointAlong(trip.pattern,Math.min(d+15,trip.pattern.cumulative.at(-1))),distanceAlongPathM:d,dwelling,index};
}
export function frameAt(compiled,day,time){
 const buses=[],labelMap=new Map(),before=compiled.settings.stopLabelBeforeArrivalSec,after=compiled.settings.stopLabelAfterDepartureSec;
 // 24:00 means the next calendar day's 00:00. Previous service-day trips remain visible.
 if(time>=86400){day=wrapDay(day+1);time=0;}
 for(const trip of compiled.trips){for(const shift of [0,-86400]){
  const serviceDay=shift?wrapDay(day-1):day;if(!trip.days.includes(serviceDay))continue;
  const elapsed=time-trip.startSec-shift;
  if(elapsed>=0&&elapsed<trip.duration)buses.push({id:trip.route.routeId+':'+trip.tripId+':'+shift,trip,...tripPosition(trip,elapsed)});
  if(elapsed< -before||elapsed>trip.duration+after)continue;
  for(let i=0;i<trip.times.length;i++){
   const tm=trip.times[i];if(elapsed<tm.arrivalOffsetSec-before||elapsed>tm.departureOffsetSec+after)continue;
   const call=trip.pattern.stopCalls[i],stop=trip.route.stops[call.stopId];const coord=stop.coord;
   const key=stop.name+':'+coord.map(x=>x.toFixed(4)).join(',');const priority=elapsed>=tm.arrivalOffsetSec&&elapsed<tm.departureOffsetSec?3:elapsed<tm.arrivalOffsetSec?2:1;
   const old=labelMap.get(key);if(!old||old.priority<priority)labelMap.set(key,{key,name:stop.name,coord,color:trip.route.color,priority,phase:priority===3?'停靠':priority===2?'即將抵達':'已離站'});
  }
 }}
 return {buses,labels:[...labelMap.values()].sort((a,b)=>b.priority-a.priority)};
}
