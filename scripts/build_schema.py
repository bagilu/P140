import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def obj(props,required=None):return {'type':'object','properties':props,'required':list(props) if required is None else required,'additionalProperties':False}
def ref(name):return {'$ref':'#/$defs/'+name}
def array(items,minimum=0):return {'type':'array','items':items,'minItems':minimum}
string={'type':'string','minLength':1}
number={'type':'number','minimum':0}
sec={'type':'integer','minimum':0,'maximum':86400}
dictionary=lambda name:{'type':'object','additionalProperties':ref(name),'minProperties':1}
defs={}
defs['coord']={'type':'array','prefixItems':[{'type':'number','minimum':-180,'maximum':180},{'type':'number','minimum':-90,'maximum':90}],'minItems':2,'maxItems':2}
defs['source']=obj({'kind':{'enum':['official','routing','estimated','manual','synthetic']},'description':string,'url':{'type':'string','format':'uri'},'retrievedAt':{'type':'string','format':'date'}},['kind','description'])
defs['stop']=obj({'name':string,'coord':ref('coord'),'sourceId':string,'verificationStatus':{'enum':['illustrative','unverified','verified']}})
defs['call']=obj({'stopId':string,'distanceAlongPathM':number})
defs['pattern']=obj({'direction':{'enum':['outbound','inbound','loop','other']},'headsign':string,'path':array(ref('coord'),2),'stopCalls':array(ref('call'),2),'sourceId':string,'verificationStatus':{'enum':['illustrative','unverified','verified']}})
defs['stopTime']=obj({'arrivalOffsetSec':sec,'departureOffsetSec':sec})
defs['timingProfile']=obj({'patternId':string,'sourceId':string,'stopTimes':array(ref('stopTime'),2)})
defs['trip']=obj({'tripId':string,'patternId':string,'timingProfileId':string,'startSec':{'type':'integer','minimum':0,'maximum':86399},'days':{'type':'array','items':{'type':'integer','minimum':1,'maximum':7},'uniqueItems':True,'minItems':1,'maxItems':7},'sourceId':string})
defs['route']=obj({'routeId':string,'shortName':string,'name':string,'color':{'type':'string','pattern':'^#[0-9A-Fa-f]{6}$'},'isDemo':{'type':'boolean'},'sources':dictionary('source'),'stops':dictionary('stop'),'patterns':dictionary('pattern'),'timingProfiles':dictionary('timingProfile'),'trips':array(ref('trip'),1)})
schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:p140:bus-network:1.0.0','title':'P140 Bus Network 1.0.0',**obj({'schemaVersion':{'const':'1.0.0'},'dataVersion':string,'timezone':{'const':'Asia/Taipei'},'generatedAt':{'type':'string','format':'date'},'isDemo':{'type':'boolean'},'displaySettings':obj({'stopLabelBeforeArrivalSec':sec,'stopLabelAfterDepartureSec':sec}),'routes':array(ref('route'),1)}),'$defs':defs}
(ROOT/'dist/data/network.schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2))
print('JSON Schema written')
