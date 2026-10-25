import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateNetwork} from '../core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.join(root,'data');
const manifest=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'),'utf8'));
const files=manifest.routes.map(item=>{const p=path.resolve(data,item.file);if(!p.startsWith(data+path.sep))throw Error('路線檔路徑超出 data');const doc=JSON.parse(fs.readFileSync(p,'utf8'));if(doc.routes.length!==1||doc.routes[0].routeId!==item.routeId)throw Error('索引與路線檔不符');
 for(const normalization of item.normalizations||[]){
  if(normalization!=='restore_loop_direction_from_originalPatternDirection')throw Error('未知路線轉換');
  const r=doc.routes[0];let restored=0;
  for(const tm of Object.values(r.timingProfiles)){const md=tm.estimationMetadata;if(md?.originalPatternDirection==='loop'&&md.singleDirectionLoop===true){r.patterns[tm.patternId].direction='loop';restored++;}}
  if(!restored)throw Error('缺少原始環線註記，不能還原');
 }
 return doc;});
if(!files.length)throw Error('索引沒有路線');const base=files[0];
for(const doc of files)for(const key of ['schemaVersion','timezone','displaySettings'])if(JSON.stringify(doc[key])!==JSON.stringify(base[key]))throw Error(`路線格式或共用設定不同：${key}`);
if(manifest.schemaVersion!==base.schemaVersion||!manifest.dataVersion)throw Error('索引版本不符');
const result={...base,dataVersion:manifest.dataVersion,generatedAt:manifest.generatedAt||base.generatedAt,isDemo:files.some(f=>f.isDemo||f.routes[0].isDemo),routes:files.flatMap(f=>f.routes)};
const errors=validateNetwork(result);if(errors.length)throw Error(errors.join('\n'));
fs.writeFileSync(path.join(data,'bus_network.json'),JSON.stringify(result));console.log(`Merged ${result.routes.length} routes; references and simulation invariants passed.`);
