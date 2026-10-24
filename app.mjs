import {compileNetwork,frameAt,formatTime,VERSION,meters} from './core.mjs?v=0.008';
import {buildStopIndex,stationTimetable,stationTime,STOP_ZOOM,STOP_NAME_ZOOM} from './stop-timetable.mjs?v=0.008';
const $=id=>document.getElementById(id),days=['','星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
let compiled,map,layer,currentFrame,playing=false,last=0,simTime=28800,speed=60,selectedDay=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short'}).format(new Date()).replace(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/g,x=>({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[x]))),pending=false;
if(!selectedDay)selectedDay=1;
let selectedBusId=null,busHitBoxes=[],stopIndex,stationLayer,stationMarkers=new Map(),selectedStationId=null,stationCardKey='',stationAllKey='';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const screenCoord=c=>map.latLngToContainerPoint([c[1],c[0]]);
function draw(){
 if(!layer||!currentFrame)return;const canvas=layer.canvas,ctx=canvas.getContext('2d'),size=map.getSize(),dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(size.x*dpr)||canvas.height!==Math.round(size.y*dpr)){canvas.width=Math.round(size.x*dpr);canvas.height=Math.round(size.y*dpr);canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.x,size.y);
 const selected=currentFrame.buses.find(b=>b.id===selectedBusId);
 busHitBoxes=[];
 // Draw an active direction once, regardless of the number of buses on it.
 // A uniform solid stroke keeps past/future movement legible without dark stacking.
 function trace(coords,color,focused){
  if(coords.length<2)return;ctx.beginPath();for(let i=0;i<coords.length;i++){const p=screenCoord(coords[i]);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
  ctx.strokeStyle=color;ctx.lineWidth=focused?2.8:2.4;ctx.globalAlpha=focused?.56:.38;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.stroke();ctx.globalAlpha=1;
 }
 const drawnDirections=new Set();for(const b of selected?[selected]:currentFrame.buses){const key=b.trip.route.routeId+':'+b.trip.patternId;if(drawnDirections.has(key))continue;drawnDirections.add(key);trace(b.trip.pattern.path,b.trip.route.color,!!selected);}
 const placed=[];const font='600 12px "Microsoft JhengHei", "PingFang TC", sans-serif';
 // One vehicle point is always drawn; badges may offset to keep nearby buses legible.
 for(const b of currentFrame.buses){
  const p=screenCoord(b.coord),ahead=screenCoord(b.ahead);if(p.x< -90||p.y< -40||p.x>size.x+90||p.y>size.y+40)continue;
  ctx.font=font;const w=Math.max(40,ctx.measureText(b.trip.route.shortName).width+25),h=25;
  let box={x:p.x-w/2,y:p.y-h/2,w,h};
  const candidates=[[0,0],[0,-30],[0,30],[w+6,0],[-w-6,0],[w+6,-30],[-w-6,30]];
  for(const [dx,dy]of candidates){const c={x:p.x-w/2+dx,y:p.y-h/2+dy,w,h};if(!placed.some(v=>overlaps(c,v))){box=c;break;}}
  placed.push({...box,x:box.x-3,y:box.y-3,w:w+6,h:h+6});
  busHitBoxes.push({...box,id:b.id});
  const bx=box.x+w/2,by=box.y+h/2;
  if(Math.hypot(bx-p.x,by-p.y)>4){ctx.strokeStyle=b.trip.route.color;ctx.lineWidth=1;ctx.globalAlpha=.65;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(bx,by);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=b.trip.route.color;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
  if(b.id===selectedBusId){rounded(ctx,box.x-4,box.y-4,w+8,h+8,9);ctx.fillStyle='#fff8dc';ctx.fill();ctx.strokeStyle=b.trip.route.color;ctx.lineWidth=1;ctx.stroke();}
  ctx.shadowColor='#143a332a';ctx.shadowBlur=7;ctx.shadowOffsetY=2;rounded(ctx,box.x,box.y,w,h,6);ctx.fillStyle=b.trip.route.color;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.lineWidth=1.5;ctx.strokeStyle='#ffffff';ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(b.trip.route.shortName,box.x+9,box.y+h/2+.5);
  const ax=box.x+w-8,ay=box.y+h/2;
  if(b.dwelling){ctx.fillStyle='#f8e5aa';ctx.fillRect(ax-3,ay-3,2,6);ctx.fillRect(ax+1,ay-3,2,6);}
  else{let angle=Math.atan2(ahead.y-p.y,ahead.x-p.x);if(!Number.isFinite(angle))angle=0;ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(3.5,0);ctx.lineTo(-2.5,-3);ctx.lineTo(-2.5,3);ctx.closePath();ctx.fill();ctx.restore();}
 }
 for(const label of currentFrame.labels){
  const p=screenCoord(label.coord);if(p.x< -100||p.y< -50||p.x>size.x+100||p.y>size.y+50)continue;
  const name=label.name.replace(/〔.*?〕/g,'');ctx.font='500 11px "Microsoft JhengHei", "PingFang TC", sans-serif';const suffix=label.priority===3?' · 停靠':'';const text=name+suffix,w=ctx.measureText(text).width+18,h=23;
  let box;for(const [dx,dy]of [[0,-31],[0,31],[w/2+19,0],[-w/2-19,0],[0,-58],[0,58]]){const c={x:p.x-w/2+dx,y:p.y-h/2+dy,w,h};if(c.x<4||c.x+w>size.x-4||c.y<4||c.y+h>size.y-4)continue;if(!placed.some(v=>overlaps(c,v))){box=c;break;}}
  // Hide a conflicting label before hiding a vehicle; it reappears as space opens.
  if(!box)continue;placed.push({...box,x:box.x-3,y:box.y-2,w:w+6,h:h+4});
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(box.x+w/2,box.y+h/2);ctx.strokeStyle='#7f948b90';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=label.color;ctx.lineWidth=1.5;ctx.stroke();
  rounded(ctx,box.x,box.y,w,h,5);ctx.fillStyle=label.priority===3?'#fff7df':'#fffef8f5';ctx.fill();ctx.strokeStyle=label.priority===3?'#c9ad6c':'#ced9ce';ctx.lineWidth=1;ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=label.priority===3?'#80642b':'#415c50';ctx.fillText(text,box.x+w/2,box.y+h/2+.5);
 }
 if(stopIndex&&map.getZoom()>=STOP_NAME_ZOOM){
  ctx.font='500 10px "Microsoft JhengHei", sans-serif';
  for(const group of stopIndex.groups){
   if(currentFrame.labels.some(l=>l.name===group.name&&meters(l.coord,group.coord)<=150))continue;
   const pt=screenCoord(group.coord);if(pt.x<0||pt.y<0||pt.x>size.x||pt.y>size.y)continue;
   const w=ctx.measureText(group.name).width+12,h=19;let box;
   for(const [dx,dy]of [[10,-23],[10,8],[-w-10,-23]]){const c={x:pt.x+dx,y:pt.y+dy,w,h};if(c.x<4||c.y<4||c.x+w>size.x-4||c.y+h>size.y-4||placed.some(v=>overlaps(c,v)))continue;box=c;break;}
   if(!box)continue;placed.push(box);rounded(ctx,box.x,box.y,w,h,4);ctx.fillStyle='#fffef5df';ctx.fill();ctx.fillStyle='#51695c';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(group.name,box.x+6,box.y+h/2);
  }
 }

}
function requestDraw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;draw();});}
function closeStation(){selectedStationId=null;stationCardKey='';stationAllKey='';$('station-card').hidden=true;document.querySelector('.map-shell').classList.remove('station-open');for(const marker of stationMarkers.values())marker.getElement()?.classList.remove('selected');}
function selectStation(group){selectedBusId=null;selectedStationId=group.id;stationCardKey='';stationAllKey='';$('station-all').open=false;$('station-card').hidden=false;document.querySelector('.map-shell').classList.add('station-open');for(const [id,marker]of stationMarkers)marker.getElement()?.classList.toggle('selected',id===group.id);render();$('close-station').focus({preventScroll:true});}
function updateStationLayer(){
 const visible=map.getZoom()>=STOP_ZOOM;$('station-layer-hint').textContent=visible?'點選站點圓點，查看所選星期班次。':'放大地圖可查看站點與班次。';
 if(!visible){closeStation();stationLayer.clearLayers();stationMarkers.clear();return;}
 if(!stationMarkers.size)for(const group of stopIndex.groups){
  const icon=L.divIcon({className:'station-marker',html:'<span aria-hidden="true"></span>',iconSize:[26,26],iconAnchor:[13,13]});
  const marker=L.marker([group.coord[1],group.coord[0]],{icon,title:'查看'+group.name+'時刻表',keyboard:true,bubblingMouseEvents:false}).addTo(stationLayer);
  marker.getElement().setAttribute('aria-label','查看'+group.name+'時刻表');const tip=document.createElement('span');tip.textContent=group.name;marker.bindTooltip(tip,{direction:'top',offset:[0,-9]});
  marker.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);selectStation(group);});stationMarkers.set(group.id,marker);
 }
 requestDraw();
}
function timetableRow(event,time){
 const now=event.arrivalSec<=time&&event.departureSec>=time,past=event.departureSec<time;
 const raw=event.originalSec!==null&&stationTime(event.originalSec)!==stationTime(event.arrivalSec)?'<span class="source-original">原表 '+stationTime(event.originalSec)+'</span>':'';
 return `<li class="station-time-row ${past?'past':''} ${now?'current':''}" data-arrival="${event.arrivalSec}" data-departure="${event.departureSec}"><div class="station-time-clock"><strong>${stationTime(event.arrivalSec)}</strong><small>${event.type}</small></div><span class="station-route-tag" style="--route-color:${event.color}">${escape(event.routeName)}</span><div class="station-time-direction"><b>往 ${escape(event.headsign)}</b><small>${escape(event.sourceLabel)}</small>${raw}</div></li>`;
}
function renderStationCard(){
 if(!selectedStationId||!stopIndex)return;const table=stationTimetable(stopIndex,selectedStationId,selectedDay,simTime);if(!table)return closeStation();
 const phase=table.upcoming.map(e=>e.key+':'+(e.arrivalSec<=table.time&&e.departureSec>=table.time)).join('|');const key=selectedStationId+':'+table.day+':'+Math.floor(table.time/60)+':'+phase;
 if(stationCardKey===key)return;stationCardKey=key;
 $('station-title').textContent=table.group.name;$('station-meta').textContent=(simTime>=86400?'24:00起以隔日排程顯示 · ':'')+days[table.day]+' · 時間軸 '+stationTime(table.time);
 $('station-routes').innerHTML=[...table.group.routes.values()].map(r=>`<span class="station-route-tag" style="--route-color:${r.color}">${escape(r.name)}</span>`).join('');
 $('station-next-title').textContent='接下來 '+table.upcoming.length+' 班（含此時段）';$('station-next').innerHTML=table.upcoming.length?table.upcoming.map(e=>timetableRow(e,table.time)).join(''):'<li class="station-empty">所選星期已無後續班次，可展開下方全天時刻。</li>';
 $('station-all-summary').textContent=days[table.day]+'全部時刻 · '+table.events.length+'筆';
 const allKey=selectedStationId+':'+table.day;if(stationAllKey!==allKey){stationAllKey=allKey;$('station-all-list').innerHTML=table.events.length?table.events.map(e=>timetableRow(e,table.time)).join(''):'<li class="station-empty">所選星期沒有班次。</li>';}
 for(const row of $('station-all-list').querySelectorAll('[data-departure]')){const past=Number(row.dataset.departure)<table.time,current=Number(row.dataset.arrival)<=table.time&&!past;row.classList.toggle('past',past);row.classList.toggle('current',current);}
}
function render(){
 $('clock').textContent=formatTime(simTime);$('timeline').value=Math.floor(simTime);$('timeline').setAttribute('aria-valuetext',formatTime(simTime));$('timeline').style.background=`linear-gradient(to right,var(--green) ${simTime/864}%,#dce4da ${simTime/864}%)`;
 $('day-label').textContent=days[selectedDay]+(simTime>=86400?' · 24:00':'');
 for(const b of document.querySelectorAll('[data-day]'))b.setAttribute('aria-pressed',String(Number(b.dataset.day)===selectedDay));
 if(!compiled)return;currentFrame=frameAt(compiled,selectedDay,simTime);$('active-count').textContent=currentFrame.buses.length;const stopped=currentFrame.buses.filter(b=>b.dwelling).length;$('dwell-count').textContent=stopped?`含 ${stopped} 輛停靠`:'';$('empty').hidden=currentFrame.buses.length>0;
 const selected=currentFrame.buses.find(b=>b.id===selectedBusId);if(!selected)selectedBusId=null;
 $('trace-focus').hidden=!selected;$('trace-overview-note').hidden=!!selected;
 if(selected)$('trace-focus-text').textContent=`${selected.trip.route.shortName} · ${formatTime(selected.trip.startSec).slice(0,5)} 發車 → ${selected.trip.pattern.headsign.replace(/〔.*?〕/g,'')}`;
 renderStationCard();requestDraw();
 // A small read-only QA surface, no source credentials or personal data.
 window.P140={version:VERSION,time:simTime,day:selectedDay,playing,buses:currentFrame.buses.length,stopped,selectedBusId,labels:currentFrame.labels.map(l=>l.name),center:map?.getCenter(),zoom:map?.getZoom()};
}
function setPlaying(on){playing=on;last=0;$('play').setAttribute('aria-label',on?'暫停模擬':'播放模擬');$('play').innerHTML=on?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h4v12H5zm6 0h4v12h-4z"/></svg><span>暫停</span>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5 16 10 6 16.5z"/></svg><span>播放</span>';render();}
function animate(now){if(playing&&compiled){if(last){simTime=Math.min(86400,simTime+Math.min((now-last)/1000,.25)*speed);if(simTime>=86400)setPlaying(false);else render();}last=now;}requestAnimationFrame(animate);}
async function start(){
 try{
  if(!window.L)throw Error('地圖元件未載入，請重新整理。');
  let network;
  if(document.documentElement.dataset.editorPreview==='true'){
   const text=localStorage.getItem('p140-editor-preview-v1');if(!text)throw Error('請先在工作台按「播放目前草稿」');network=JSON.parse(text);
   document.querySelector('.demo-badge').textContent='編輯草稿預覽';document.querySelector('.brand p').textContent='此預覽不會變更正式路網。';
  }else{const response=await fetch('data/bus_network.json?v=0.008');if(!response.ok)throw Error('無法讀取模擬路網 JSON');network=await response.json();}
  compiled=compileNetwork(network);stopIndex=buildStopIndex(compiled);
  map=L.map('map',{zoomControl:true,attributionControl:true,zoomAnimation:false,fadeAnimation:false,minZoom:9,maxZoom:19}).setView([23.9905,121.6055],14);
  stationLayer=L.layerGroup().addTo(map);
  const tile=L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',{maxZoom:19,attribution:'底圖 © <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>'}).addTo(map);
  let tileErrors=0;tile.on('tileerror',()=>{if(++tileErrors>=4)$('tile-warning').hidden=false;});tile.on('tileload',()=>{$('tile-warning').hidden=true;});
  L.control.scale({position:'bottomright',imperial:false,maxWidth:100}).addTo(map);
  // Canvas is a map sibling using container coordinates, so pan/zoom never reset time.
  const canvas=document.createElement('canvas');canvas.className='bus-canvas';canvas.setAttribute('aria-hidden','true');$('map').append(canvas);layer={canvas};map.on('move zoom resize',requestDraw);
  map.on('click',e=>{const {x,y}=e.containerPoint;const hit=[...busHitBoxes].reverse().find(b=>x>=b.x-5&&x<=b.x+b.w+5&&y>=b.y-5&&y<=b.y+b.h+5);closeStation();selectedBusId=hit?(hit.id===selectedBusId?null:hit.id):null;render();});
  map.on('mousemove',e=>{const{x,y}=e.containerPoint;$('map').style.cursor=busHitBoxes.some(b=>x>=b.x-5&&x<=b.x+b.w+5&&y>=b.y-5&&y<=b.y+b.h+5)?'pointer':'';});
  map.attributionControl.addAttribution('道路候選：<a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>');
  const isEditorPreview=document.documentElement.dataset.editorPreview==='true';
  const pts=network.routes.flatMap(r=>Object.values(r.patterns).flatMap(p=>p.path.map(c=>[c[1],c[0]])));
  if(pts.length)map.fitBounds(pts,{paddingTopLeft:[60,70],paddingBottomRight:[60,165],maxZoom:14});
  const initial={center:[map.getCenter().lat,map.getCenter().lng],zoom:map.getZoom()};$('reset-view').onclick=()=>map.setView(initial.center,initial.zoom,{animate:false});
  document.querySelector('.legend-title span').textContent=network.routes.length+' 條'+(isEditorPreview?'草稿':'')+'路線';
  if(!isEditorPreview)document.querySelector('.demo-badge').textContent=network.routes.map(r=>r.shortName).join('＋')+' · 資料試行';
  const sources=$('route-sources');sources.replaceChildren();for(const r of network.routes){const li=document.createElement('li'),hasOperatorTimes=Object.values(r.timingProfiles).some(tm=>Array.isArray(tm.estimationMetadata?.officialArrivalOffsetSec));li.textContent=r.shortName+'：'+(hasOperatorTimes?'業者逐站預估表＋動畫時間平滑。':'已整理的班次資料；途中到站時間為模型估算。');sources.append(li);}
  for(const r of network.routes){const node=document.createElement('span');node.className='legend-route';const dot=document.createElement('i');dot.style.background=r.color;const text=document.createElement('span');text.textContent=r.shortName;node.append(dot,text);$('legend-items').append(node);}
  map.on('zoomend',updateStationLayer);updateStationLayer();
  $('play').disabled=false;$('loading').hidden=true;render();
 }catch(e){$('loading').textContent=`載入失敗：${e.message}`;console.error(e);}
}
for(const b of document.querySelectorAll('[data-day]')){b.setAttribute('aria-label','選擇'+days[Number(b.dataset.day)]);b.onclick=()=>{selectedDay=Number(b.dataset.day);selectedBusId=null;last=0;render();};}
$('play').onclick=()=>{if(simTime>=86400)simTime=0;setPlaying(!playing);};
$('timeline').addEventListener('input',e=>{simTime=Number(e.target.value);last=0;render();});
$('speed').onchange=e=>{speed=Number(e.target.value);last=0;};
$('jump-morning').onclick=()=>{simTime=28800;last=0;render();};
$('clear-focus').onclick=()=>{selectedBusId=null;render();};
$('close-station').onclick=closeStation;document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeStation();selectedBusId=null;render();}});
$('info').onclick=()=>{$('about').showModal();};$('close-info').onclick=()=>$('about').close();
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
document.addEventListener('visibilitychange',()=>{last=0;});
render();window.addEventListener('load',start,{once:true});requestAnimationFrame(animate);
