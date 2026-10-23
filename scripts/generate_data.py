"""Build synthetic schedules on OSRM road geometry, never real bus schedules."""
import concurrent.futures, datetime, json, math, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data'

def distance(a,b):
    r=math.pi/180
    x=(b[0]-a[0])*r*math.cos((a[1]+b[1])*r/2)
    y=(b[1]-a[1])*r
    return math.hypot(x,y)*6371000

DEFS = [
 ('demo_310','310','310｜市區展示線（非實際310路線）','#166b63',
  [('花蓮轉運站〔示意〕',121.6038,23.9912),('市區北站〔虛構〕',121.600,23.9862),('市區轉乘點〔虛構〕',121.606,23.9796),('南城站〔虛構〕',121.614,23.9756),('海岸轉乘點〔虛構〕',121.621,23.9767)]),
 ('demo_red2','紅2','紅2｜校園展示線（虛構路線）','#b64f45',
  [('慈濟大學〔示意站〕',121.5885,23.9935),('校園東站〔虛構〕',121.5935,23.9941),('花蓮轉運站〔示意〕',121.6038,23.9912),('市區中站〔虛構〕',121.6068,23.9860),('市區南站〔虛構〕',121.6035,23.9807),('西城站〔虛構〕',121.596,23.9796)]),
 ('demo_coast','海線','海線｜海岸展示線（虛構路線）','#3b71ac',
  [('北城站〔虛構〕',121.6045,24.0050),('北濱站〔虛構〕',121.620,24.0035),('海岸北站〔虛構〕',121.628,23.998),('海岸中站〔虛構〕',121.625,23.985),('海岸轉乘點〔虛構〕',121.621,23.9767)])]

def fetch(item):
    rid,label,name,color,stops,direction=item
    if direction=='inbound': stops=list(reversed(stops))
    pid=f'{rid}_{direction}'
    cache=ROOT/'scripts/cache'/f'{pid}.json'
    cache.parent.mkdir(exist_ok=True)
    if cache.exists(): raw=json.loads(cache.read_text())
    else:
        coords=';'.join(f'{s[1]},{s[2]}' for s in stops)
        url=f'https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=false'
        with urllib.request.urlopen(url,timeout=55) as response: raw=json.load(response)
        if raw.get('code')!='Ok': raise RuntimeError(raw)
        cache.write_text(json.dumps(raw))
    route=raw['routes'][0]
    path=route['geometry']['coordinates']
    cumulative=[0.]
    for a,b in zip(path,path[1:]): cumulative.append(cumulative[-1]+distance(a,b))
    calls=[]; stopdefs={}; previous=0; t=0
    for i,(s,wp) in enumerate(zip(stops,raw['waypoints'])):
        coord=wp['location']
        index=min(range(previous,len(path)),key=lambda j:distance(path[j],coord)) if i<len(stops)-1 else len(path)-1
        previous=index
        sid=f'{rid}_{direction}_s{i+1:02}'
        stopdefs[sid]={'name':s[0], 'coord':coord,'sourceId':'synthetic_stops','verificationStatus':'illustrative'}
        if i: t+=max(50,round(route['legs'][i-1]['duration']*1.5))
        arrival=t; departure=t if i==0 else t+20
        calls.append({'stopId':sid,'distanceAlongPathM':round(cumulative[index],2),'arrivalOffsetSec':arrival,'departureOffsetSec':departure})
        t=departure
    pattern={'direction':direction,'headsign':stops[-1][0],'path':path,'stopCalls':[{'stopId':c['stopId'],'distanceAlongPathM':c['distanceAlongPathM']} for c in calls], 'sourceId':'osrm_roads','verificationStatus':'illustrative'}
    timing={'patternId':pid,'sourceId':'synthetic_timing','stopTimes':[{'arrivalOffsetSec':c['arrivalOffsetSec'],'departureOffsetSec':c['departureOffsetSec']} for c in calls]}
    return rid,pid,stopdefs,pattern,timing

def main():
    items=[(*d,di) for d in DEFS for di in ['outbound','inbound']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(fetch,items))
    routes=[]
    for rid,label,name,color,stops in DEFS:
        obj={'routeId':rid,'shortName':label,'name':name,'color':color,'isDemo':True,'sources':{
          'synthetic_stops':{'kind':'synthetic','description':'介面測試用示意站點，非已查證站牌。'},
          'osrm_roads':{'kind':'routing','description':'OSRM driving / OpenStreetMap 道路候選；未確認為實際公車行駛路線。','url':'https://project-osrm.org/','retrievedAt':'2026-10-23'},
          'synthetic_timing':{'kind':'estimated','description':'以道路路由時間乘1.5及停站20秒合成，僅供原型測試。'},
          'synthetic_schedule':{'kind':'synthetic','description':'所有發車時間與適用星期均為測試資料，不是官方班表。'}},'stops':{},'patterns':{},'timingProfiles':{},'trips':[]}
        for _,pid,st,pa,ti in [r for r in results if r[0]==rid]:
            tid=pid+'_standard'
            obj['stops'].update(st); obj['patterns'][pid]=pa; obj['timingProfiles'][tid]=ti
            # Shared default weekly schedules; selected services differ on weekends.
            direction=pa['direction']; shift=0 if direction=='outbound' else 210
            days=[1,2,3,4,5,6,7]
            if rid=='demo_red2': days=[1,2,3,4,5]
            for sec in range(6*3600+shift,22*3600,600 if rid!='demo_coast' else 840):
                obj['trips'].append({'tripId':f'{pid}_{sec}','patternId':pid,'timingProfileId':tid,'startSec':sec,'days':days,'sourceId':'synthetic_schedule'})
            if rid=='demo_red2':
                for sec in range(7*3600+shift,21*3600,1800):
                    obj['trips'].append({'tripId':f'{pid}_weekend_{sec}','patternId':pid,'timingProfileId':tid,'startSec':sec,'days':[6,7],'sourceId':'synthetic_schedule'})
            # Guaranteed visible dwell near initial simulation time, all synthetic.
            sec=28800-ti['stopTimes'][2]['arrivalOffsetSec']-10
            obj['trips'].append({'tripId':pid+'_dwell_demo','patternId':pid,'timingProfileId':tid,'startSec':sec,'days':[1,2,3,4,5,6,7],'sourceId':'synthetic_schedule'})
            # Overnight service tests the previous-service-day weekly boundary.
            if rid=='demo_coast':obj['trips'].append({'tripId':pid+'_overnight','patternId':pid,'timingProfileId':tid,'startSec':86100,'days':[7],'sourceId':'synthetic_schedule'})
        # One special path variant shares the already road-following outbound path.
        if rid=='demo_red2':
            base=rid+'_outbound'; special=rid+'_short'
            path=obj['patterns'][base]['path']; end=obj['patterns'][base]['stopCalls'][3]['distanceAlongPathM']
            cum=0; endindex=0
            for j in range(1,len(path)):
                cum+=distance(path[j-1],path[j]);endindex=j
                if cum>=end-0.1:break
            obj['patterns'][special]={**obj['patterns'][base],'headsign':'市區中站〔區間車〕','path':path[:endindex+1],'stopCalls':obj['patterns'][base]['stopCalls'][:4]}
            obj['timingProfiles'][special+'_standard']={**obj['timingProfiles'][base+'_standard'],'patternId':special,'stopTimes':obj['timingProfiles'][base+'_standard']['stopTimes'][:4]}
            for sec in [28500,32100]:obj['trips'].append({'tripId':special+str(sec),'patternId':special,'timingProfileId':special+'_standard','startSec':sec,'days':[1,2,3,4,5],'sourceId':'synthetic_schedule'})
        routes.append(obj)
    network={'schemaVersion':'1.0.0','dataVersion':'P140-V0.001-demo','timezone':'Asia/Taipei','generatedAt':'2026-10-23','isDemo':True,'displaySettings':{'stopLabelBeforeArrivalSec':30,'stopLabelAfterDepartureSec':15},'routes':routes}
    DATA.mkdir(exist_ok=True)
    (DATA/'bus_network.json').write_text(json.dumps(network,ensure_ascii=False,separators=(',',':')))
    manifest={'schemaVersion':'1.0.0','dataVersion':network['dataVersion'],'routes':[]}
    for r in routes:
        routefile={'schemaVersion':'1.0.0','dataVersion':network['dataVersion'],'timezone':'Asia/Taipei','generatedAt':network['generatedAt'],'isDemo':True,'displaySettings':network['displaySettings'],'routes':[r]}
        (DATA/'routes'/f"{r['routeId']}.json").write_text(json.dumps(routefile,ensure_ascii=False,indent=2))
        manifest['routes'].append({'routeId':r['routeId'],'file':f"routes/{r['routeId']}.json"})
    (DATA/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'routes':len(routes),'trips':sum(len(r['trips']) for r in routes),'patterns':sum(len(r['patterns']) for r in routes),'bytes':(DATA/'bus_network.json').stat().st_size}))

if __name__=='__main__':main()
