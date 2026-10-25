import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const run = (cmd, args) => execFileSync(cmd,args,{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
export const exists = p => fs.lstat(p).then(()=>true,()=>false);
export async function readJSON(file) { return JSON.parse(await fs.readFile(file,'utf8')); }
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+randomUUID()+'.tmp';
  const handle=await fs.open(tmp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,file);
}
export async function shaFile(file) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function plist(app, key) {
  return run('/usr/bin/plutil',['-extract',key,'raw','-o','-',path.join(app,'Contents/Info.plist')]).trim();
}
export function verifySignature(app, official=false) {
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  if(official) {
    // codesign writes its display output to stderr.
    const {stderr}=execFileSyncResult('/usr/bin/codesign',['-dv',app]);
    if(!stderr.includes('TeamIdentifier=EQHXZ8M8AV')) throw Error('不是已验证的 Google 原厂签名');
  }
}
function execFileSyncResult(cmd,args) {
  // spawnSync retains stderr even on successful codesign display.
  return spawnSync(cmd,args,{encoding:'utf8'});
}
import {spawnSync} from 'node:child_process';
export function runningPids(app) {
  const prefix=path.join(app,'Contents/');
  return run('/bin/ps',['-axo','pid=,comm=']).split('\n').flatMap(line=>{
    const m=line.trim().match(/^(\d+)\s+(.+)$/);
    return m && m[2].startsWith(prefix) ? [Number(m[1])] : [];
  });
}
export function requireStopped(app) {
  if(runningPids(app).length) throw Error('请先正常退出 Antigravity，再运行此命令。工具不会强制结束你的任务。');
}
export async function treeManifest(dir) {
  const result={};
  async function visit(rel) {
    for(const name of (await fs.readdir(path.join(dir,rel))).sort()) {
      const child=path.join(rel,name), full=path.join(dir,child), stat=await fs.lstat(full);
      if(stat.isSymbolicLink()) result[child]={link:await fs.readlink(full)};
      else if(stat.isDirectory()) { result[child]={directory:true,mode:stat.mode&0o777};await visit(child); }
      else result[child]={sha256:await shaFile(full),mode:stat.mode&0o777};
    }
  }
  await visit('');return result;
}
export async function verifyTree(app, expected) {
  const actual=await treeManifest(app);
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw Error('完整应用校验失败：'+app);
}
export async function copyApp(from,to) {
  if(await exists(to)) throw Error('目标已存在，拒绝覆盖：'+to);
  run('/usr/bin/ditto',[from,to]);
}
export function verifyOriginalCode(app) {
  run('/usr/bin/codesign',['--verify','--deep','--strict','--ignore-resources',app]);
  const display=spawnSync('/usr/bin/codesign',['-dv',app],{encoding:'utf8'});
  if(!display.stderr.includes('TeamIdentifier=EQHXZ8M8AV')||!display.stderr.includes('runtime'))
    throw Error('原厂代码签名或加固运行时标志已改变。');
}
export function assertResourceOnly(before,after) {
  const archive='Contents/Resources/app.asar',marker='Contents/Resources/ag-zh-patch.json';
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(key===marker)continue;
    if(key===archive) {
      if(before[key]?.mode!==after[key]?.mode||!after[key]?.sha256)throw Error('归档权限变化');
    } else if(JSON.stringify(before[key])!==JSON.stringify(after[key])) throw Error('资源补丁意外改变原厂文件：'+key);
  }
}
export async function withLock(stateDir, fn) {
  await fs.mkdir(stateDir,{recursive:true,mode:0o700});
  const lock=path.join(stateDir,'operation.lock');
  try {await fs.mkdir(lock);} catch(err) {
    if(err.code!=='EEXIST')throw err;
    let owner;
    try{owner=await readJSON(path.join(lock,'owner.json'));}catch{throw Error('存在不完整操作锁，请检查是否有另一个补丁进程。');}
    try{process.kill(owner.pid,0);throw Error('另一个补丁操作正在运行。');}catch(e){if(e.code!=='ESRCH')throw e;}
    await fs.rm(lock,{recursive:true});await fs.mkdir(lock);
  }
  await writeJSON(path.join(lock,'owner.json'),{pid:process.pid});
  try{return await fn();}finally{await fs.rm(lock,{recursive:true,force:true});}
}
