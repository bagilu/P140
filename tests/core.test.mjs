import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileNetwork,frameAt,tripPosition,pointAlong,splitPathAt,formatTime,validateNetwork} from '../dist/core.mjs';
const n=JSON.parse(fs.readFileSync(new URL('../dist/data/bus_network.json',import.meta.url)));
const c=compileNetwork(n);
assert.equal(n.routes.length,3);assert.equal(formatTime(86400),'24:00:00');
assert.equal(new Set(n.routes.map(r=>r.shortName)).size,3);
assert(frameAt(c,5,28800).buses.length>=6,'multiple buses at initial time');
assert(frameAt(c,5,28800).buses.some(b=>b.dwelling),'initial dwell example');
assert(frameAt(c,5,28800).buses.length>frameAt(c,7,28800).buses.length,'weekday/weekend distinction');
const t=c.trips.find(x=>x.route.routeId==='demo_red2'&&x.tripId.endsWith('dwell_demo')&&x.pattern.direction==='outbound');
const st=t.times[1],pos1=tripPosition(t,st.arrivalOffsetSec),pos2=tripPosition(t,st.departureOffsetSec-0.01);
assert.deepEqual(pos1.coord,pos2.coord,'stationary during dwell');assert(pos1.dwelling);assert(!tripPosition(t,st.departureOffsetSec).dwelling);
assert.deepEqual(splitPathAt(t.pattern,pos1.distanceAlongPathM),splitPathAt(t.pattern,pos2.distanceAlongPathM),'trace split remains fixed during dwell');
for(const route of n.routes)for(const patternId of Object.keys(route.patterns)){
 const p=c.trips.find(x=>x.patternId===patternId).pattern;
 for(const d of [0,p.cumulative[1],p.cumulative.at(-1)/2,p.cumulative.at(-1)]){
  const parts=splitPathAt(p,d),point=pointAlong(p,d);
  assert.deepEqual(parts.past[0],p.path[0]);assert.deepEqual(parts.future.at(-1),p.path.at(-1));assert.deepEqual(parts.past.at(-1),point,'past ends at bus');assert.deepEqual(parts.future[0],point,'future starts at bus');
 }
}
const forward=tripPosition(t,st.departureOffsetSec+10),backward=tripPosition(t,st.arrivalOffsetSec-10);assert(backward.distanceAlongPathM<forward.distanceAlongPathM,'rewinding recomputes along-road trace split');
const one={...c,trips:[t]},sid=t.pattern.stopCalls[1].stopId,name=t.route.stops[sid].name;
const has=(elapsed)=>frameAt(one,1,t.startSec+elapsed).labels.some(l=>l.name===name);
assert(!has(st.arrivalOffsetSec-31));assert(has(st.arrivalOffsetSec-30));assert(has(st.departureOffsetSec+15));assert(!has(st.departureOffsetSec+16));
assert.equal(frameAt(one,1,t.startSec-1).buses.length,0);assert.equal(frameAt(one,1,t.startSec).buses.length,1);assert.equal(frameAt(one,1,t.startSec+t.duration).buses.length,0);
const sunday=c.trips.find(x=>x.tripId.endsWith('overnight'));
assert(frameAt({...c,trips:[sunday]},1,0).buses.length===1,'Sunday service continues Monday 00:00');
assert(frameAt({...c,trips:[sunday]},2,0).buses.length===0,'Monday had no such departure');
assert.deepEqual(frameAt(c,7,86400).buses.map(b=>b.id),frameAt(c,1,0).buses.map(b=>b.id),'24:00 calendar boundary');
for(let day=1;day<=7;day++)for(let sec=0;sec<=86400;sec+=300){const f=frameAt(c,day,sec);assert(f.buses.every(b=>b.coord.every(Number.isFinite)));}
for(const route of n.routes){const local=JSON.parse(fs.readFileSync(new URL(`../dist/data/routes/${route.routeId}.json`,import.meta.url)));assert.deepEqual(local.routes[0],route);}
const bad=structuredClone(n);bad.routes[0].trips[0].days=[0];assert(validateNetwork(bad).length);const bad2=structuredClone(n);bad2.routes[0].timingProfiles[Object.keys(bad2.routes[0].timingProfiles)[0]].stopTimes[1].departureOffsetSec=-1;assert(validateNetwork(bad2).length);
console.log('PASS: road-trace split boundaries, dwell/rewind consistency, labels, weekly filtering, midnight, 24:00, multi-route merge, 2,023 sampled frames and invalid-data rejection.');
