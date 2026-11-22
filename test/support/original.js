import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const winAdapters=['adapter-2.34.0-win32-x64.json','adapter-2.33.0-win32-x64.json','adapter-2.26.0-win32-x64.json']
  .map(name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8')));
const macAdapter=JSON.parse(fs.readFileSync(path.join(root,'data/adapter-2.25.0.json'),'utf8'));
const candidates=[];
if(process.env.AG_ZH_ORIGINAL_ASAR)candidates.push(process.env.AG_ZH_ORIGINAL_ASAR);
if(process.platform==='win32') {
  candidates.push(path.join(root,'work/official-2.34/app/resources/app.asar'));
  candidates.push(path.join(root,'work/official-2.33/app/resources/app.asar'));
  candidates.push(path.join(root,'work/official/app/resources/app.asar'));
  candidates.push(path.join(process.env.LOCALAPPDATA||'','Programs/antigravity/resources/app.asar'));
} else {
  candidates.push('/Applications/Antigravity.app/Contents/Resources/app.asar');
  const record=path.join(os.homedir(),'Library/Application Support/Antigravity zh-CN/current.json');
  if(fs.existsSync(record))candidates.push(path.join(JSON.parse(fs.readFileSync(record)).backup,'Antigravity.app/Contents/Resources/app.asar'));
}
const allowedAdapters=process.platform==='win32'?winAdapters:[macAdapter];
let matchedOriginal,matchedAdapter;
for(const candidate of candidates) {
  if(!fs.existsSync(candidate))continue;
  const digest=createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
  const found=allowedAdapters.find(a=>a.asarSha256===digest);
  if(found){matchedOriginal=candidate;matchedAdapter=found;break;}
}
export const original=matchedOriginal;
export const selectedAdapter=matchedAdapter||allowedAdapters[0];
if(process.env.AG_ZH_ORIGINAL_ASAR&&!original)throw Error('AG_ZH_ORIGINAL_ASAR 不符合适配指纹');
export const requiresOriginal={skip:original?false:'需要本平台的已验证原始 ASAR；可设置 AG_ZH_ORIGINAL_ASAR'};
