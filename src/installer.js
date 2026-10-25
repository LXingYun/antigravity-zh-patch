import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { adapter, root, hash, buildArchive } from './patch.js';
import { run, exists, readJSON, writeJSON, shaFile, plist, verifySignature, runningPids,
  requireStopped, treeManifest, verifyTree, copyApp, verifyOriginalCode, assertResourceOnly, withLock } from './platform.js';
import { exchangeResources, commit, rollbackResources, pendingTransactions } from './transaction.js';
export const defaultApp='/Applications/Antigravity.app';
export const stateDir=path.join(os.homedir(),'Library/Application Support/Antigravity zh-CN');
const resources=app=>path.join(app,'Contents/Resources');
const archive=app=>path.join(resources(app),'app.asar');
const markerPath=app=>path.join(resources(app),'ag-zh-patch.json');
const transactions=path.join(stateDir,'transactions');
const currentFile=path.join(stateDir,'current.json');
export async function recipeHash() {
  const names=['src/patch.js','src/runtime.js','src/native.cjs','data/zh-CN.json','data/adapter-2.25.0.json'];
  return hash(Buffer.concat(await Promise.all(names.map(n=>fs.readFile(path.join(root,n))))));
}
function platformCheck() {
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('仅支持 Apple Silicon macOS。');
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major!==24||minor<15)throw Error('需要 Node.js 24.15 或更高的 24.x 版本。');
}
export async function inspect(app=defaultApp) {
  platformCheck();
  if(!await exists(app))throw Error('找不到应用：'+app);
  if((await fs.lstat(app)).isSymbolicLink())throw Error('拒绝对应用符号链接执行安装。');
  const version=plist(app,'CFBundleShortVersionString');
  if(version!==adapter.version)throw Error(`当前版本 ${version}，补丁仅适配 ${adapter.version}。请勿使用旧补丁覆盖新版本。`);
  if(plist(app,'CFBundleIdentifier')!==adapter.bundleId)throw Error('应用标识不匹配');
  for(const p of ['app','app.asar.disabled','app.asar.bak'])if(await exists(path.join(resources(app),p)))throw Error('发现其他补丁或资源副本：'+p);
  const framework=await fs.readFile(path.join(app,'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'));
  const fuse=framework.indexOf('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  if(fuse<0||framework[fuse+32]!==1||framework[fuse+33]!==9||framework.subarray(fuse+34,fuse+43).toString()!=='101100011')throw Error('原厂 Electron 保护配置与适配版本不符，拒绝修改。');
  const asarSha256=await shaFile(archive(app));
  if(await shaFile(path.join(resources(app),'bin/language_server'))!==adapter.serverSha256)throw Error('界面服务文件指纹不匹配');
  let marker=null;
  if(await exists(markerPath(app))) {
    marker=await readJSON(markerPath(app));
    if(marker.mode!=='resource-only'||marker.originalAsarSha256!==adapter.asarSha256||marker.asarSha256!==asarSha256||marker.version!==version)throw Error('补丁标记或归档校验失败');
    verifyOriginalCode(app);
    const record=await readJSON(currentFile);
    if(record.app!==app||record.marker.asarSha256!==asarSha256)throw Error('安装记录不对应当前应用');
    await verifyTree(app,record.tree);
  } else {
    if(asarSha256!==adapter.asarSha256)throw Error('应用归档不匹配，可能已被其他补丁修改');
    verifySignature(app,true);
  }
  return {app,version,installed:!!marker,asarSha256,marker,running:runningPids(app).length>0};
}
async function checkedBackup(app, info) {
  const dir=path.join(stateDir,'backups',info.version+'-'+info.asarSha256.slice(0,16));
  const copy=path.join(dir,'Antigravity.app'), metadata=path.join(dir,'backup.json');
  if(await exists(dir)) {
    if(!await exists(metadata))throw Error('原版备份尚未完成，保留现场供检查：'+dir);
    const data=await readJSON(metadata);await verifyTree(copy,data.tree);verifySignature(copy,true);return {dir,copy,...data};
  }
  const staging=dir+'.building-'+randomUUID();
  await fs.mkdir(staging,{recursive:true,mode:0o700});
  const tempCopy=path.join(staging,'Antigravity.app');
  const tree=await treeManifest(app);
  await copyApp(app,tempCopy);
  await verifyTree(tempCopy,tree);verifySignature(tempCopy,true);
  const data={version:info.version,asarSha256:info.asarSha256,tree,createdAt:new Date().toISOString()};
  await writeJSON(path.join(staging,'backup.json'),data);
  await fs.rename(staging,dir);return {dir,copy,...data};
}
async function validatePartial(tx) {
  requireStopped(tx.app);
  const tree=await treeManifest(tx.app);
  delete tree['Contents/Resources/app.asar.ag-zh-tmp'];
  delete tree['Contents/Resources/ag-zh-patch.json.ag-zh-tmp'];
  assertResourceOnly(tx.beforeTree,tree);
  const current=await shaFile(tx.targetArchive);
  if(![tx.beforeTree['Contents/Resources/app.asar'].sha256,tx.afterTree['Contents/Resources/app.asar'].sha256].includes(current))
    throw Error('归档已经被其他程序更改，拒绝自动覆盖。');
}
async function undo(tx,journal) {
  await rollbackResources(tx,journal,()=>validatePartial(tx),async()=>{
    if(await shaFile(tx.beforeArchive)!==tx.beforeTree['Contents/Resources/app.asar'].sha256)throw Error('事务备份损坏');
  });
  await fs.rm(tx.targetArchive+'.ag-zh-tmp',{force:true});
  await fs.rm(tx.targetMarker+'.ag-zh-tmp',{force:true});
  await verifyTree(tx.app,tx.beforeTree);
  if(tx.priorRecord)await writeJSON(currentFile,tx.priorRecord);
  else await fs.rm(currentFile,{force:true});
}
async function recoverPending(app) {
  for(const {tx,journal} of await pendingTransactions(transactions)) {
    if(tx.app!==app||tx.format!=='resource-transaction-v1')throw Error('未完成的事务需要人工检查：'+journal);
    await undo(tx,journal);
  }
}
async function prepareTransaction(app,stage,backup,kind,priorRecord) {
  const id=randomUUID(),dir=path.join(transactions,id);
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const beforeArchive=path.join(dir,'before.asar');
  await fs.copyFile(archive(app),beforeArchive);
  const beforeTree=await treeManifest(app),afterTree=await treeManifest(stage);
  assertResourceOnly(beforeTree,afterTree);
  if(await shaFile(beforeArchive)!==beforeTree['Contents/Resources/app.asar'].sha256)throw Error('事务快照校验失败');
  return {id,format:'resource-transaction-v1',kind,app,stage,backup,beforeArchive,beforeTree,afterTree,priorRecord,
    targetArchive:archive(app),targetMarker:markerPath(app),stagedArchive:archive(stage),
    beforeMarker:await exists(markerPath(app))?await readJSON(markerPath(app)):null,
    afterMarker:await exists(markerPath(stage))?await readJSON(markerPath(stage)):null};
}
async function health(app,since) {
  try {
    const h=await readJSON(path.join(stateDir,'health.json'));
    if(h.time<since||h.version!==adapter.version||h.patchVersion!=='1.0.0'||
       path.resolve(h.appPath)!==archive(app)||!runningPids(app).includes(h.pid))return null;
    return h;
  } catch {return null;}
}
async function launchCheck(app,since) {
  run('/usr/bin/open',['-a',app]);
  const until=Date.now()+30000;
  while(Date.now()<until) {
    const h=await health(app,since);if(h)return h;
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error('启动后 30 秒内未收到中文界面就绪确认。');
}
async function stopLaunchedApp(app) {
  // Used only for an app just launched by this installation, never to stop pre-existing work.
  for(const pid of runningPids(app))try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
  const until=Date.now()+8000;
  while(runningPids(app).length&&Date.now()<until)await new Promise(r=>setTimeout(r,200));
  requireStopped(app);
}
export async function status(app=defaultApp) {
  const pending=await pendingTransactions(transactions);
  if(!await exists(app))return {app,installed:false,pending:pending.map(p=>p.journal),message:'应用路径暂时缺失；退出应用后运行 restore 恢复中断事务。'};
  const info=await inspect(app);
  const record=await exists(currentFile)?await readJSON(currentFile):null;
  return {...info,marker:undefined,signature:info.installed?'原厂代码签名保留；应用资源封印已改变':'原厂完整签名有效',pending:pending.map(p=>p.journal),
    backup:record?.backup,recipeCurrent:info.marker?info.marker.recipe===await recipeHash():true,
    health:info.installed?await health(app,record?.installedAt??0):null};
}
export async function install(app=defaultApp,{launch=true,log=console.log}={}) {
  return withLock(stateDir,async()=>{
    await recoverPending(app);
    const info=await inspect(app);
    if(info.installed) {
      if(info.marker.recipe!==await recipeHash())throw Error('已安装另一构建的中文补丁；请先 restore 再 install。');
      log('同一补丁已安装，不会重复注入。');return status(app);
    }
    requireStopped(app);
    await fs.access(resources(app),fs.constants.W_OK);
    log('保存并校验完整原版应用备份…');
    const backup=await checkedBackup(app,info);
    const build=path.join(stateDir,'build',randomUUID()),stage=path.join(build,'Antigravity.app');
    const installedAt=Date.now();let tx,journal,launchAttempted=false,committed=false;
    try {
      log('构建中文资源并校验其他原厂文件保持不变…');
      await fs.mkdir(build,{recursive:true,mode:0o700});await copyApp(backup.copy,stage);
      const result=await buildArchive(archive(backup.copy),archive(stage),path.join(build,'extracted'));
      const marker={mode:'resource-only',version:adapter.version,patchVersion:'1.0.0',recipe:await recipeHash(),originalAsarSha256:adapter.asarSha256,...result};
      await writeJSON(markerPath(stage),marker);verifyOriginalCode(stage);
      assertResourceOnly(backup.tree,await treeManifest(stage));
      tx=await prepareTransaction(app,stage,backup.dir,'install',await exists(currentFile)?await readJSON(currentFile):null);
      journal=path.join(transactions,tx.id+'.json');
      await exchangeResources(tx,journal,async()=>{requireStopped(app);await inspect(app);await verifyTree(app,backup.tree);});
      let startup=null;
      if(launch) {log('启动并等待中文界面就绪…');launchAttempted=true;startup=await launchCheck(app,installedAt);}
      await writeJSON(currentFile,{app,version:adapter.version,backup:backup.dir,installedAt,marker,tree:tx.afterTree,startupVerified:!!startup});
      await commit(tx,journal);committed=true;
      await fs.rm(build,{recursive:true,force:true});
      log('安装完成。');return status(app);
    } catch(err) {
      if(committed){log('安装完成，暂存清理未完成：'+err.message);return status(app);}
      if(tx&&await exists(journal)) {
        if(launchAttempted)await stopLaunchedApp(app);
        await undo(tx,journal);log('安装失败，已恢复原版资源。');
      }
      await fs.rm(build,{recursive:true,force:true});throw err;
    }
  });
}
export async function restore(app=defaultApp,{log=console.log}={}) {
  return withLock(stateDir,async()=>{
    requireStopped(app);await recoverPending(app);
    const info=await inspect(app);
    if(!info.installed){log('当前已经是原厂应用。');return status(app);}
    const record=await readJSON(currentFile),backup=await readJSON(path.join(record.backup,'backup.json'));
    if(record.app!==app||record.marker.asarSha256!==info.asarSha256||backup.version!==info.version||backup.asarSha256!==info.marker.originalAsarSha256)
      throw Error('备份不对应当前版本，拒绝覆盖。');
    const original=path.join(record.backup,'Antigravity.app');
    await verifyTree(original,backup.tree);verifySignature(original,true);await verifyTree(app,record.tree);
    const tx=await prepareTransaction(app,original,record.backup,'restore',record),journal=path.join(transactions,tx.id+'.json');
    let committed=false;
    try {
      log('恢复原版资源，保留原厂二进制文件和应用目录…');
      await exchangeResources(tx,journal,async()=>{requireStopped(app);await verifyTree(app,record.tree);});
      await verifyTree(app,backup.tree);verifySignature(app,true);
      await fs.rm(currentFile,{force:true});await commit(tx,journal);committed=true;
    }catch(err){if(!committed&&await exists(journal))await undo(tx,journal);throw err;}
    log('已恢复原厂完整签名。');return status(app);
  });
}
