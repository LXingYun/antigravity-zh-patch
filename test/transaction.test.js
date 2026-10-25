import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exchangeResources,rollbackResources,commit,pendingTransactions} from '../src/transaction.js';
import {treeManifest,verifyTree,readJSON,shaFile,assertResourceOnly} from '../src/platform.js';
async function setup() {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-test-')),app=root+'/Antigravity.app',stage=root+'/stage.app',journal=root+'/transactions/test.json';
 for(const p of [app,stage]){await fs.mkdir(p+'/Contents/Resources',{recursive:true});await fs.mkdir(p+'/Contents/MacOS');await fs.writeFile(p+'/Contents/MacOS/app','vendor-code');}
 const targetArchive=app+'/Contents/Resources/app.asar',stagedArchive=stage+'/Contents/Resources/app.asar',targetMarker=app+'/Contents/Resources/ag-zh-patch.json';
 await fs.writeFile(targetArchive,'original');await fs.writeFile(stagedArchive,'patched');
 const beforeArchive=root+'/backup.asar';await fs.copyFile(targetArchive,beforeArchive);
 const before=await treeManifest(app),after=await treeManifest(stage);
 const tx={app,stage,targetArchive,targetMarker,stagedArchive,beforeArchive,beforeMarker:null,afterMarker:{patched:true}};
 return {root,journal,tx,before,after,cleanup:()=>fs.rm(root,{recursive:true,force:true}),
  validate:async()=>{const tree=await treeManifest(app);delete tree['Contents/Resources/app.asar.ag-zh-tmp'];assertResourceOnly(before,tree);if(![before['Contents/Resources/app.asar'].sha256,after['Contents/Resources/app.asar'].sha256].includes(await shaFile(targetArchive)))throw Error('新版本归档');},
  validateBackup:async()=>{assert.equal(await shaFile(beforeArchive),before['Contents/Resources/app.asar'].sha256);}};
}
for(const point of ['prepared','archive-replaced','swapped'])test('资源原子替换中断恢复：'+point,async()=>{
 const f=await setup();try{
  const inode=(await fs.stat(f.tx.app)).ino,codeInode=(await fs.stat(f.tx.app+'/Contents/MacOS/app')).ino;
  await assert.rejects(exchangeResources(f.tx,f.journal,()=>verifyTree(f.tx.app,f.before),p=>{if(p===point)throw Error('模拟中断')}));
  await rollbackResources(await readJSON(f.journal),f.journal,f.validate,f.validateBackup);
  await verifyTree(f.tx.app,f.before);assert.equal((await fs.stat(f.tx.app)).ino,inode);assert.equal((await fs.stat(f.tx.app+'/Contents/MacOS/app')).ino,codeInode);
  assert.equal((await pendingTransactions(path.dirname(f.journal))).length,0);
 }finally{await f.cleanup();}
});
test('暂存写入失败仍可还原；没有替换应用目录或主程序',async()=>{
 const f=await setup();try{
  await fs.rm(f.tx.stagedArchive);await assert.rejects(exchangeResources(f.tx,f.journal,()=>verifyTree(f.tx.app,f.before)));
  await rollbackResources(f.tx,f.journal,f.validate,f.validateBackup);await verifyTree(f.tx.app,f.before);
 }finally{await f.cleanup();}
});
test('升级后的归档和损坏备份均拒绝覆盖',async()=>{
 const f=await setup();try{
  await exchangeResources(f.tx,f.journal,()=>verifyTree(f.tx.app,f.before));await fs.writeFile(f.tx.targetArchive,'newer-version');
  await assert.rejects(rollbackResources(f.tx,f.journal,f.validate,f.validateBackup));assert.equal(await fs.readFile(f.tx.targetArchive,'utf8'),'newer-version');
  await fs.writeFile(f.tx.targetArchive,'patched');await fs.writeFile(f.tx.beforeArchive,'corrupt');
  await assert.rejects(rollbackResources(f.tx,f.journal,f.validate,f.validateBackup));
 }finally{await f.cleanup();}
});
test('签名或构建校验失败不写资源，提交后没有未完成事务',async()=>{
 const f=await setup();try{
  await assert.rejects(exchangeResources(f.tx,f.journal,async()=>{throw Error('模拟签名检查失败')}));await verifyTree(f.tx.app,f.before);
  await exchangeResources(f.tx,f.journal,()=>verifyTree(f.tx.app,f.before));await commit(f.tx,f.journal);
  assert.equal((await pendingTransactions(path.dirname(f.journal))).length,0);
 }finally{await f.cleanup();}
});
test('原位补丁拒绝任何二进制、Info.plist 或权限的意外改动',async()=>{
 const f=await setup();try{
  assertResourceOnly(f.before,f.after);
  await fs.writeFile(f.tx.stage+'/Contents/MacOS/app','modified');
  const tree=await treeManifest(f.tx.stage);assert.throws(()=>assertResourceOnly(f.before,tree),/意外改变/);
 }finally{await f.cleanup();}
});
test('资源写入到临时文件后中断，仍能恢复',async()=>{
 const f=await setup();try{
  await assert.rejects(exchangeResources(f.tx,f.journal,()=>verifyTree(f.tx.app,f.before),()=>{throw Error('中断')}));
  await fs.writeFile(f.tx.targetArchive+'.ag-zh-tmp','partial-write');
  await rollbackResources(f.tx,f.journal,f.validate,f.validateBackup);await verifyTree(f.tx.app,f.before);
 }finally{await f.cleanup();}
});
