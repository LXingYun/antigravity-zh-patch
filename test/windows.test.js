import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import * as win from '../src/platform/windows.js';
import {atomicFile,exchangeResources,rollbackResources,pendingTransactions} from '../src/transaction.js';
import {shaFile,readJSON,writeJSON} from '../src/platform.js';
import {createInstaller,instancePaths} from '../src/installers/windows.js';
import {original,selectedAdapter} from './support/original.js';
const windows={skip:process.platform!=='win32'};
async function temporary(fn) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-win-'));
 try{return await fn(dir);}finally{assert.ok(path.basename(dir).startsWith('ag-zh-win-'));await fs.rm(dir,{recursive:true,force:true});}
}
test('PE 与 fuse schema 异常必须拒绝',()=>{
 const b=Buffer.alloc(256);b.write('MZ');b.writeUInt32LE(64,60);b.write('PE\0\0',64);b.writeUInt16LE(0x8664,68);
 b.write('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX',128);b[160]=1;b[161]=9;b.write('101100011',162);
 assert.equal(win.readPe(b).machine,0x8664);assert.equal(win.readFuses(b).values,'101100011');
 const unknown=Buffer.from(b);unknown[161]=10;assert.throws(()=>win.readFuses(unknown),/schema/);
 b[0]=0;assert.throws(()=>win.readPe(b),/PE/);
});
test('Windows 长路径、中文、空格和引号：替换保留 ACL 与属性',windows,()=>temporary(async dir=>{
 const deep=path.join(dir,"中文 ' space",...Array(5).fill('long-path-'.repeat(5)));await fs.mkdir(deep,{recursive:true});
 await win.assertPlainTree(deep);
 const original=path.join(deep,'app.asar'),replacement=path.join(dir,'new.asar');await fs.writeFile(original,'old');await fs.writeFile(replacement,'new');
 win.powershell(`$p=LongPath $data.file;$acl=Get-Acl -LiteralPath $p;$rule=New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().Name,'Read','Allow');$acl.AddAccessRule($rule);Set-Acl -LiteralPath $p -AclObject $acl`,{file:original});
 const before=win.metadata(deep)['app.asar'];await atomicFile(replacement,original);
 assert.equal(await fs.readFile(original,'utf8'),'new');assert.deepEqual(win.metadata(deep)['app.asar'],before);
}));

test('Windows 拒绝路径穿越事务与 junction 安装入口',windows,()=>temporary(async dir=>{
 const app=path.join(dir,'app'),state=path.join(dir,'state'),p=instancePaths(app,state);
 await fs.mkdir(app);const link=path.join(dir,'junction');await fs.symlink(app,link,'junction');
 await assert.rejects(win.assertPlainTree(link),/reparse point/);
 await writeJSON(path.join(p.transactions,'invalid.json'),{id:'../outside'});
 await assert.rejects(createInstaller({stateBase:state}).install(app,{launch:false,log:()=>{}}),/事务身份或路径/);
 assert.deepEqual(await fs.readdir(app),[]);
}));
test('Windows 文件锁拒绝替换，释放后可用日志恢复',windows,()=>temporary(async dir=>{
 const archive=path.join(dir,'app.asar'),staged=path.join(dir,'new.asar'),backup=path.join(dir,'old.asar'),marker=path.join(dir,'marker.json'),journal=path.join(dir,'tx/journal.json');
 await fs.writeFile(archive,'old');await fs.writeFile(staged,'new');await fs.copyFile(archive,backup);
 const tx={targetArchive:archive,stagedArchive:staged,beforeArchive:backup,targetMarker:marker,beforeMarker:null,afterMarker:{installed:true}};
 const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$f=[IO.File]::Open($env:AG_ZH_LOCK_FILE,'Open','Read','None');[Console]::WriteLine('locked');[Console]::ReadLine()|Out-Null;$f.Dispose()"],{windowsHide:true,env:{...process.env,AG_ZH_LOCK_FILE:archive},stdio:['pipe','pipe','pipe']});
 const exited=once(locker,'exit');
 try {
   await Promise.race([once(locker.stdout,'data'),exited.then(()=>{throw Error('锁进程未就绪')})]);
   await assert.rejects(exchangeResources(tx,journal,async()=>{}),/EPERM|EACCES|EBUSY/);
 } finally {locker.stdin.end('\n');await exited;}
 assert.equal(await fs.readFile(archive,'utf8'),'old');assert.equal((await pendingTransactions(path.dirname(journal))).length,1);
 await rollbackResources(await readJSON(journal),journal,async()=>{},async()=>assert.equal(await fs.readFile(backup,'utf8'),'old'));
 assert.equal((await pendingTransactions(path.dirname(journal))).length,0);
}));

test('Windows 备份跨越不同继承权限的父目录，完整 ACL 保持原样',windows,()=>temporary(async dir=>{
 const sourceParent=path.join(dir,'source-parent'),destParent=path.join(dir,'other-parent'),container=path.join(destParent,'private-container');
 await fs.mkdir(sourceParent);await fs.mkdir(container,{recursive:true});
 win.powershell(`$acl=Get-Acl -LiteralPath $data.parent;$acl.SetAccessRuleProtection($true,$true);$sid=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'Read','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);Set-Acl -LiteralPath $data.parent -AclObject $acl`,{parent:sourceParent});
 const source=path.join(sourceParent,'app'),copy=path.join(container,'app');await fs.mkdir(path.join(source,'resources'),{recursive:true});await fs.writeFile(path.join(source,'resources/app.asar'),'sample');
 const before=await win.manifest(source),outer=win.metadata(destParent)[''];
 await win.copyApp(source,copy,{isolateParent:true});assert.deepEqual(await win.manifest(copy),before);
 assert.deepEqual(win.metadata(destParent)[''],outer);
}));
test('Windows 只读归档写入失败时原文件保持不变',windows,()=>temporary(async dir=>{
 const file=path.join(dir,'app.asar'),next=path.join(dir,'new.asar');await fs.writeFile(file,'old');await fs.writeFile(next,'new');await fs.chmod(file,0o444);
 try{await assert.rejects(atomicFile(next,file));assert.equal(await fs.readFile(file,'utf8'),'old');}
 finally{await fs.chmod(file,0o666);await fs.chmod(file+'.ag-zh-tmp',0o666).catch(()=>{});}
}));
test('Windows 安装副本：完整备份、重复安装、未知资源拒绝、恢复与事务记录恢复',
 {skip:process.platform!=='win32'||!original,timeout:180000},()=>temporary(async dir=>{
 const app=path.join(dir,'中文 App'),state=path.join(dir,'state'),installer=createInstaller({stateBase:state});
 await win.copyApp(path.dirname(path.dirname(original)),app);
 const before=await win.manifest(app),p=instancePaths(app,state);
 const result=await installer.install(app,{launch:false,log:()=>{}});
 assert.equal(result.installed,true);assert.equal(result.health,null);assert.equal(result.signature,'NotSigned');
 const current=await readJSON(p.current),installedHash=await shaFile(p.archive);
 assert.equal((await installer.install(app,{launch:false,log:()=>{}})).asarSha256,installedHash);
 await fs.writeFile(path.join(app,'resources/unknown.js'),'foreign');await assert.rejects(installer.inspect(app),/完整应用校验失败/);await fs.rm(path.join(app,'resources/unknown.js'));
 await fs.appendFile(p.archive,'upgraded');await assert.rejects(installer.restore(app,{log:()=>{}}),/补丁标记或归档校验失败/);
 const journals=(await fs.readdir(p.transactions)).filter(x=>x.endsWith('.json'));
 const tx=await readJSON(path.join(p.transactions,journals[0]));
 // Restore the known installed archive from the verified backup by building again is unnecessary:
 // remove only the bytes appended above, then simulate interruption after current.json was written.
 const handle=await fs.open(p.archive,'r+');await handle.truncate((await handle.stat()).size-'upgraded'.length);await handle.close();
 assert.equal(await shaFile(p.archive),installedHash);
 tx.phase='swapped';await writeJSON(path.join(p.transactions,journals[0]),tx);
 assert.equal((await installer.status(app)).pending.length,1);
 await installer.restore(app,{log:()=>{}});await win.verifyManifest(app,before);
 assert.equal(await shaFile(p.archive),selectedAdapter.asarSha256);assert.equal(await fs.stat(p.current).catch(()=>null),null);
 const again=await installer.install(app,{launch:false,log:()=>{}});assert.equal(again.installed,true);
 await installer.restore(app,{log:()=>{}});await win.verifyManifest(app,before);
 assert.equal((await pendingTransactions(p.transactions)).length,0);assert.ok(current.backup);
}));
