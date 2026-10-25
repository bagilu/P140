import {meters,wrapDay} from './core.mjs';

export const STOP_ZOOM=14,STOP_NAME_ZOOM=16;
const stopKey=(routeId,stopId)=>JSON.stringify([routeId,stopId]);
const normalized=name=>name.normalize('NFKC').replace(/臺/g,'台').replace(/\s/g,'');

// Nearby opposite-side poles may share one overview card. Same-name distant
// stops stay separate; their original coordinates and direction stay in events.
export function buildStopIndex(compiled){
 const groups=[],byStop=new Map();
 for(const route of compiled.routes)for(const [id,stop]of Object.entries(route.stops)){
  const key=normalized(stop.name);let group=groups.find(g=>g.nameKey===key&&meters(g.coord,stop.coord)<=150);
  if(!group){group={id:'station_'+groups.length,name:stop.name,nameKey:key,coord:[...stop.coord],members:[],routes:new Map(),events:[]};groups.push(group);}
  group.members.push({routeId:route.routeId,stopId:id,coord:stop.coord});group.routes.set(route.routeId,{name:route.shortName,color:route.color});byStop.set(stopKey(route.routeId,id),group);
 }
 for(const trip of compiled.trips){
  const profile=trip.route.timingProfiles[trip.timingProfileId],raw=profile.estimationMetadata?.officialArrivalOffsetSec;
  const source=trip.route.sources[profile.sourceId],adjustments=profile.estimationMetadata?.animationAdjustmentSec;
  const smoothed=Array.isArray(adjustments)&&adjustments.some(sec=>Number.isFinite(sec)&&sec!==0);
  const kind=Array.isArray(raw)?(smoothed?'業者預估＋平滑':'業者逐站預估'):source?.kind==='official'?'官方時刻':'模型估算';
  trip.pattern.stopCalls.forEach((call,i)=>{
   const group=byStop.get(stopKey(trip.route.routeId,call.stopId));
   group.events.push({key:JSON.stringify([trip.route.routeId,trip.tripId,i]),tripId:trip.tripId,routeId:trip.route.routeId,routeName:trip.route.shortName,color:trip.route.color,
    headsign:trip.pattern.headsign,direction:trip.pattern.direction,days:trip.days,startSec:trip.startSec,
    arrivalOffsetSec:trip.times[i].arrivalOffsetSec,departureOffsetSec:trip.times[i].departureOffsetSec,
    originalOffsetSec:Number.isFinite(raw?.[i])?raw[i]:null,sourceLabel:kind,
    type:i===0?'發車':i===trip.times.length-1?'終點抵達':'到站'});
  });
 }
 return {groups,byId:new Map(groups.map(g=>[g.id,g])),byStop,cache:new Map()};
}

function eventsOnDay(index,group,day){
 const key=group.id+':'+day;if(index.cache.has(key))return index.cache.get(key);
 const events=[];
 for(const e of group.events)for(const shift of [0,-86400]){
  if(!e.days.includes(shift?wrapDay(day-1):day))continue;
  const base=e.startSec+shift,arrivalSec=base+e.arrivalOffsetSec,departureSec=base+e.departureOffsetSec;
  // Include a dwell spanning midnight, but no next-calendar-day arrivals.
  if(arrivalSec>=86400||departureSec<0)continue;
  events.push({...e,key:e.key+':'+shift,arrivalSec,departureSec,originalSec:e.originalOffsetSec===null?null:base+e.originalOffsetSec});
 }
 events.sort((a,b)=>a.arrivalSec-b.arrivalSec||a.routeName.localeCompare(b.routeName)||a.key.localeCompare(b.key));
 index.cache.set(key,events);return events;
}

export function stationTimetable(index,id,day,time,limit=3){
 const group=index.byId.get(id);if(!group)return null;
 if(time>=86400){day=wrapDay(day+1);time=0;}
 const events=eventsOnDay(index,group,day),upcoming=events.filter(e=>e.departureSec>=time).slice(0,limit);
 return {group,day,time,events,upcoming};
}

export function stationTime(sec){
 const prefix=sec<0?'前日 ':sec>=86400?'翌日 ':'';sec=((Math.floor(sec)%86400)+86400)%86400;
 return prefix+[Math.floor(sec/3600),Math.floor(sec%3600/60)].map(n=>String(n).padStart(2,'0')).join(':');
}
