import fs from 'node:fs/promises';
import { exists, readJSON, writeJSON } from './platform.js';

export async function commit(tx,journal) {
  tx.phase='committed';await writeJSON(journal,tx);
}
export async function pendingTransactions(dir) {
  if(!await exists(dir)) return [];
  const pending=[];
  for(const file of await fs.readdir(dir)) {
    if(!file.endsWith('.json'))continue;
    const journal=dir+'/'+file, tx=await readJSON(journal);
    if(!['committed','rolled-back'].includes(tx.phase))pending.push({journal,tx});
  }
  return pending;
}

/** Replace only the archive, keeping the application bundle / native executable identities. */
export async function atomicFile(from,to) {
  const tmp=to+'.ag-zh-tmp';
  for(const file of [from,to,tmp]) {
    if(await exists(file)&&(await fs.lstat(file)).isSymbolicLink())throw Error('拒绝替换链接文件：'+file);
  }
  await fs.copyFile(from,tmp);
  if(process.platform==='win32'&&await exists(to)) {
    const {preserveMetadata}=await import('./platform/windows.js');
    preserveMetadata(to,tmp);
  }
  const handle=await fs.open(tmp,'r+');
  try{await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,to);
}
export async function exchangeResources(tx,journal,validateCurrent,fail=()=>{}) {
  await validateCurrent();
  tx.phase='prepared';await writeJSON(journal,tx);fail('prepared');
  await atomicFile(tx.stagedArchive,tx.targetArchive);
  tx.phase='archive-replaced';await writeJSON(journal,tx);fail('archive-replaced');
  if(tx.afterMarker)await resourceMarker(tx.targetMarker,tx.afterMarker);
  else await fs.rm(tx.targetMarker,{force:true});
  tx.phase='swapped';await writeJSON(journal,tx);fail('swapped');
}
export async function rollbackResources(tx,journal,validateCurrent,validateBackup,{deferCompletion=false}={}) {
  await validateCurrent();await validateBackup();
  await atomicFile(tx.beforeArchive,tx.targetArchive);
  if(tx.beforeMarker)await resourceMarker(tx.targetMarker,tx.beforeMarker);
  else await fs.rm(tx.targetMarker,{force:true});
  if(!deferCompletion){tx.phase='rolled-back';await writeJSON(journal,tx);}
}

async function resourceMarker(file,value) {
  const tmp=file+'.ag-zh-tmp';
  for(const candidate of [file,tmp])if(await exists(candidate)&&(await fs.lstat(candidate)).isSymbolicLink())throw Error('拒绝写入链接标记：'+candidate);
  await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const handle=await fs.open(tmp,'r+');try{await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,file);
}
