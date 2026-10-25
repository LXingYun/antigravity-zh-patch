import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as asar from '@electron/asar';
import { root, hash, buildArchive } from '../patch.js';
import { exists, readJSON, writeJSON, shaFile, assertResourceOnly, withLock } from '../platform.js';
import * as win from '../platform/windows.js';
import { exchangeResources, commit, rollbackResources, pendingTransactions } from '../transaction.js';
import { selectAdapter } from '../adapters.js';

export const adapter=await readJSON(path.join(root,'data/adapter-2.26.0-win32-x64.json'));
export const stateDir=win.stateRoot;
// Deferred discovery lets --app work even when multiple installations exist.
export const defaultApp=undefined;
export async function recipeHash() {
  const names=['src/patch.js','src/runtime.js','src/native.cjs','data/zh-CN.json','data/adapter-2.26.0-win32-x64.json'];
  return hash(Buffer.concat(await Promise.all(names.map(n=>fs.readFile(path.join(root,n))))));
}
export function instancePaths(app,stateBase=stateDir) {
  const id=hash(win.normalizeApp(app)).slice(0,24),dir=path.join(stateBase,'instances',id);
  return {app:path.resolve(app),dir,current:path.join(dir,'current.json'),health:path.join(dir,'health.json'),transactions:path.join(dir,'transactions'),
    archive:path.join(app,win.layout.archive),marker:path.join(app,win.layout.marker)};
}
function platformCheck() {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('此适配仅支持 Windows x64。');
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major!==24||minor<15)throw Error('需要 Node.js 24.15 或更高的 24.x 版本。');
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identity=app=>({platform:'win32',arch:'x64',version:adapter.version,app:win.normalizeApp(app),originalAsarSha256:adapter.asarSha256});

// A separate state base supports full integration tests against an isolated app copy.
export function createInstaller({stateBase=stateDir}={}) {
  const resolve=app=>instancePaths(app||win.discoverApp(),stateBase);
  async function inspect(app) {
    platformCheck();const p=resolve(app);
    if(!await exists(p.app))throw Error('找不到应用：'+p.app);
    await win.assertPlainTree(p.app);
    const info=win.executableInfo(p.app);
    selectAdapter(process.platform,process.arch,info.version);
    if(info.product!==adapter.product||info.signature!==adapter.signature)throw Error('应用产品或签名状态与已核实的官方分发不符');
    const exe=await fs.readFile(path.join(p.app,'Antigravity.exe'));
    if(win.readPe(exe).machine!==0x8664)throw Error('应用不是 x64');
    if(!equal(win.readFuses(exe),adapter.fuses))throw Error('Electron 保护配置与适配版本不符，拒绝修改');
    if((await fs.readFile(path.join(p.app,'version'),'utf8')).trim()!==adapter.electronVersion)throw Error('Electron 版本不符');
    for(const name of ['app','app.asar.disabled','app.asar.bak'])if(await exists(path.join(p.app,'resources',name)))throw Error('发现其他补丁或资源副本：'+name);
    const digest=await shaFile(p.archive);
    let marker=null;
    if(await exists(p.marker)) {
      marker=await readJSON(p.marker);
      if(marker.mode!=='resource-only'||!equal(marker.identity,identity(p.app))||marker.asarSha256!==digest)throw Error('补丁标记或归档校验失败');
      const record=await readJSON(p.current);
      if(!equal(record.identity,identity(p.app))||!equal(record.marker,marker))throw Error('安装记录不对应当前应用');
      await win.verifyManifest(p.app,record.tree);
    } else if(digest!==adapter.asarSha256)throw Error('原始应用归档指纹不匹配，可能已被其他补丁修改');
    await win.verifyDistribution(p.app,adapter,{patched:!!marker});
    asar.uncache(p.archive);
    const pkg=JSON.parse(asar.extractFile(p.archive,'package.json'));
    if(pkg.name!==adapter.packageName||pkg.version!==adapter.version||pkg.main!=='dist/main.js')throw Error('ASAR 产品身份不匹配');
    return {app:p.app,version:info.version,platform:'win32',arch:'x64',installed:!!marker,asarSha256:digest,marker,
      signature:info.signature,source:'匹配 Google 签名安装器提取的官方文件基线',running:win.processes(p.app).length>0};
  }
  async function health(p,record,since=0) {
    try {
      const h=await readJSON(p.health);
      if(h.time<since||h.version!==adapter.version||h.patchVersion!=='1.0.0'||h.installationId!==record.marker.installationId||
        win.normalizeApp(h.appPath)!==win.normalizeApp(p.archive)||!(h.translated>0))return null;
      if(!win.processes(p.app).some(proc=>proc.pid===h.pid&&win.normalizeApp(proc.path)===win.normalizeApp(path.join(p.app,'Antigravity.exe'))))return null;
      return h;
    }catch{return null;}
  }
  async function status(app) {
    const p=resolve(app),pending=await pendingTransactions(p.transactions);
    if(pending.length)return {app:p.app,installed:null,pending:pending.map(t=>t.journal),message:'存在未完成事务；正常退出应用后运行 restore 恢复。'};
    const info=await inspect(p.app),record=await exists(p.current)?await readJSON(p.current):null;
    return {...info,marker:undefined,pending:[],backup:record?.backup,
      recipeCurrent:info.marker?info.marker.recipe===await recipeHash():true,health:info.installed?await health(p,record):null};
  }
  async function backup(p) {
    const dir=path.join(p.dir,'backups',`win32-x64-${adapter.version}-${adapter.asarSha256.slice(0,16)}`),copy=path.join(dir,'Antigravity');
    if(await exists(dir)) {
      const data=await readJSON(path.join(dir,'backup.json'));
      if(!equal(data.identity,identity(p.app)))throw Error('备份身份不匹配');
      await win.verifyManifest(copy,data.tree);await win.verifyDistribution(copy,adapter);return {dir,copy,...data};
    }
    const staging=dir+'.building-'+randomUUID(),temp=path.join(staging,'Antigravity');
    const tree=await win.manifest(p.app);
    await fs.mkdir(staging,{recursive:true});await win.copyApp(p.app,temp,{isolateParent:true});
    await win.verifyManifest(temp,tree);await win.verifyDistribution(temp,adapter);
    const data={identity:identity(p.app),tree,createdAt:new Date().toISOString()};
    await writeJSON(path.join(staging,'backup.json'),data);await fs.rename(staging,dir);
    return {dir,copy,...data};
  }
  async function prepare(p,stage,kind,backupDir,record) {
    const id=randomUUID(),dir=path.join(p.transactions,id),beforeArchive=path.join(dir,'before.asar');
    await fs.mkdir(dir,{recursive:true});await fs.copyFile(p.archive,beforeArchive);
    const beforeTree=await win.manifest(p.app),afterTree=await win.manifest(stage);
    assertResourceOnly(beforeTree,afterTree,win.layout);
    if(await shaFile(beforeArchive)!==beforeTree[win.layout.archive].sha256)throw Error('事务快照校验失败');
    return {id,format:'windows-resource-transaction-v1',identity:identity(p.app),app:p.app,stage,kind,backup:backupDir,priorRecord:record,
      beforeArchive,beforeTree,afterTree,targetArchive:p.archive,targetMarker:p.marker,stagedArchive:path.join(stage,win.layout.archive),
      beforeMarker:await exists(p.marker)?await readJSON(p.marker):null,afterMarker:await exists(path.join(stage,win.layout.marker))?await readJSON(path.join(stage,win.layout.marker)):null};
  }
  async function validatePartial(p,tx) {
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(tx.id)||tx.format!=='windows-resource-transaction-v1'||!equal(tx.identity,identity(p.app))||win.normalizeApp(tx.app)!==win.normalizeApp(p.app)||
      path.resolve(tx.targetArchive)!==path.resolve(p.archive)||path.resolve(tx.targetMarker)!==path.resolve(p.marker)||
      path.resolve(tx.beforeArchive)!==path.join(p.transactions,tx.id,'before.asar'))throw Error('事务身份或路径不匹配，拒绝恢复');
    win.requireStopped(p.app);await win.assertPlainTree(p.app);
    const tree=await win.manifest(p.app);
    delete tree[win.layout.archive+'.ag-zh-tmp'];delete tree[win.layout.marker+'.ag-zh-tmp'];
    assertResourceOnly(tx.beforeTree,tree,win.layout);
    const current=await shaFile(p.archive);
    if(![tx.beforeTree[win.layout.archive].sha256,tx.afterTree[win.layout.archive].sha256].includes(current))throw Error('归档已被其他程序或更新器更改，拒绝覆盖');
    const marker=await exists(p.marker)?await readJSON(p.marker):null;
    if(!equal(marker,tx.beforeMarker)&&!equal(marker,tx.afterMarker))throw Error('未知补丁标记，拒绝恢复');
  }
  async function undo(p,tx,journal) {
    await rollbackResources(tx,journal,()=>validatePartial(p,tx),async()=>{
      if(await shaFile(tx.beforeArchive)!==tx.beforeTree[win.layout.archive].sha256)throw Error('事务备份损坏');
    },{deferCompletion:true});
    await fs.rm(p.archive+'.ag-zh-tmp',{force:true});await fs.rm(p.marker+'.ag-zh-tmp',{force:true});
    await win.verifyManifest(p.app,tx.beforeTree);
    if(tx.priorRecord)await writeJSON(p.current,tx.priorRecord);else await fs.rm(p.current,{force:true});
    tx.phase='rolled-back';await writeJSON(journal,tx);
  }
  async function recover(p) {
    for(const {tx,journal} of await pendingTransactions(p.transactions))await undo(p,tx,journal);
  }
  async function install(app,{launch=true,log=console.log}={}) {
    const p=resolve(app);
    return withLock(p.dir,async()=>{
      await recover(p);
      const info=await inspect(p.app);
      if(info.installed) {
        if(info.marker.recipe!==await recipeHash())throw Error('已安装另一构建，请先 restore 再 install');
        log('同一补丁已安装，不会重复注入。');return status(p.app);
      }
      win.requireStopped(p.app);
      for(const location of [p.app,p.dir]) {
        const stat=await fs.statfs(location);
        if(Number(stat.bavail)*Number(stat.bsize)<2*1024**3)throw Error('应用或备份所在卷剩余空间不足 2 GiB：'+location);
      }
      log('保存并校验完整原版应用备份…');const original=await backup(p);
      const build=path.join(p.dir,'build',randomUUID()),stage=path.join(build,'Antigravity');
      let tx,journal,startedPid=null,committed=false;
      try {
        await fs.mkdir(build,{recursive:true});await win.copyApp(original.copy,stage,{isolateParent:true});
        const installationId=randomUUID();
        log('构建 Windows 中文资源并核对未修改文件…');
        const result=await buildArchive(path.join(original.copy,win.layout.archive),path.join(stage,win.layout.archive),path.join(build,'extracted'),adapter,{healthFile:p.health,installationId});
        win.preserveMetadata(p.archive,path.join(stage,win.layout.archive));
        const marker={mode:'resource-only',identity:identity(p.app),patchVersion:'1.0.0',installationId,recipe:await recipeHash(),...result};
        await writeJSON(path.join(stage,win.layout.marker),marker);
        await win.verifyDistribution(stage,adapter,{patched:true});
        assertResourceOnly(original.tree,await win.manifest(stage),win.layout);
        tx=await prepare(p,stage,'install',original.dir,null);journal=path.join(p.transactions,tx.id+'.json');
        await exchangeResources(tx,journal,async()=>{win.requireStopped(p.app);await inspect(p.app);await win.verifyManifest(p.app,original.tree);});
        const installedAt=Date.now(),record={identity:identity(p.app),backup:original.dir,installedAt,marker,tree:tx.afterTree,startupVerified:false};
        await win.verifyManifest(p.app,tx.afterTree);
        if(launch) {
          log('启动并等待中文界面就绪…');startedPid=await win.launch(p.app);
          const until=Date.now()+60000;
          while(Date.now()<until) {if(await health(p,record,installedAt)){record.startupVerified=true;break;}await new Promise(r=>setTimeout(r,1000));}
          if(!record.startupVerified)throw Error('60 秒内未收到中文界面就绪确认');
        }
        await writeJSON(p.current,record);await commit(tx,journal);committed=true;
        await fs.rm(build,{recursive:true,force:true});log('安装完成。');return status(p.app);
      }catch(error) {
        if(committed){log('安装已完成，暂存清理未完成：'+error.message);return status(p.app);}
        if(tx&&await exists(journal)) {
          if(startedPid&&win.processes(p.app).length)throw Error(error.message+'；已保留事务和完整备份。请正常退出 Antigravity 后执行 restore。');
          await undo(p,tx,journal);log('安装失败，已恢复原版资源。');
        }
        await fs.rm(build,{recursive:true,force:true});throw error;
      }
    });
  }
  async function restore(app,{log=console.log}={}) {
    const p=resolve(app);
    return withLock(p.dir,async()=>{
      win.requireStopped(p.app);await recover(p);
      const info=await inspect(p.app);
      if(!info.installed){log('当前已是匹配官方分发的原版资源。');return status(p.app);}
      const record=await readJSON(p.current),backupData=await readJSON(path.join(record.backup,'backup.json'));
      if(!equal(record.identity,identity(p.app))||!equal(backupData.identity,identity(p.app)))throw Error('备份版本或安装身份不符');
      const original=path.join(record.backup,'Antigravity');
      await win.verifyManifest(original,backupData.tree);await win.verifyDistribution(original,adapter);
      const tx=await prepare(p,original,'restore',record.backup,record),journal=path.join(p.transactions,tx.id+'.json');
      let committed=false;
      try {
        await exchangeResources(tx,journal,async()=>{win.requireStopped(p.app);await win.verifyManifest(p.app,record.tree);});
        await win.verifyManifest(p.app,backupData.tree);await win.verifyDistribution(p.app,adapter);
        await fs.rm(p.current,{force:true});await commit(tx,journal);committed=true;
      }catch(error){if(!committed&&await exists(journal))await undo(p,tx,journal);throw error;}
      log('原版资源已恢复；主程序仍为官方分发中的未签名文件。');return status(p.app);
    });
  }
  return {inspect,status,install,restore};
}
export const {inspect,status,install,restore}=createInstaller();
