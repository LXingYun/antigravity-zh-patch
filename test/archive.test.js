import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as asar from '@electron/asar';
import {adapter,buildArchive,hash} from '../src/patch.js';
import {exists,readJSON} from '../src/platform.js';
async function originalArchive(){
 const live='/Applications/Antigravity.app/Contents/Resources/app.asar';
 if(hash(await fs.readFile(live))===adapter.asarSha256)return live;
 const state=path.join(os.homedir(),'Library/Application Support/Antigravity zh-CN/current.json');
 return path.join((await readJSON(state)).backup,'Antigravity.app/Contents/Resources/app.asar');
}
test('官方 ASAR 重打包：原文件保留，解包模块可读取，新头部完整性正确',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-archive-'));
 try{
  const original=await originalArchive(),output=path.join(dir,'app.asar');
  const result=await buildArchive(original,output,path.join(dir,'extracted'));
  const bytes=await fs.readFile(output);
  assert.equal(result.asarSha256,hash(bytes));
  assert.equal(result.headerSha256,hash(bytes.subarray(16,16+bytes.readUInt32LE(12))));
  assert.equal(JSON.parse(asar.extractFile(output,'package.json')).version,'2.25.0');
  assert.ok(await exists(output+'.unpacked/node_modules/chrome-devtools-mcp/build/src/index.js'));
  assert.ok(asar.extractFile(output,'dist/preload.js').toString().includes('ag-zh:ready'));
 }finally{asar.uncacheAll();await fs.rm(dir,{recursive:true,force:true});}
});
