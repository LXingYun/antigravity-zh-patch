import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import * as asar from '@electron/asar';
import {selectAdapter} from '../../src/adapters.js';
const root=path.resolve(import.meta.dirname,'../..');
export let selectedAdapter=selectAdapter(process.platform==='win32'?'win32':'darwin',process.platform==='win32'?'x64':'arm64','2.34.0');
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
export const original=(process.env.AG_ZH_ORIGINAL_ASAR?[process.env.AG_ZH_ORIGINAL_ASAR]:candidates).find(p=>{
  if(!fs.existsSync(p))return false;
  try {
    const version=JSON.parse(asar.extractFile(p,'package.json')).version;
    const candidate=selectAdapter(selectedAdapter.platform,selectedAdapter.arch,version);
    if(createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==candidate.asarSha256)return false;
    selectedAdapter=candidate;return true;
  }catch{return false;}
});
if(process.env.AG_ZH_ORIGINAL_ASAR&&!original)throw Error('AG_ZH_ORIGINAL_ASAR 不符合适配指纹');
export const requiresOriginal={skip:original?false:'需要本平台的已验证原始 ASAR；可设置 AG_ZH_ORIGINAL_ASAR'};
