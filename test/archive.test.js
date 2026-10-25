import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as asar from '@electron/asar';
import {buildArchive,hash} from '../src/patch.js';
import {exists} from '../src/platform.js';
import {original,selectedAdapter,requiresOriginal} from './support/original.js';
test('官方 ASAR 重打包：原文件保留，解包模块可读取，新头部完整性正确',requiresOriginal,async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-archive-'));
 try{
  const output=path.join(dir,'app.asar');
  const result=await buildArchive(original,output,path.join(dir,'extracted'),selectedAdapter);
  const bytes=await fs.readFile(output);
  assert.equal(result.asarSha256,hash(bytes));
  assert.equal(result.headerSha256,hash(bytes.subarray(16,16+bytes.readUInt32LE(12))));
  assert.equal(JSON.parse(asar.extractFile(output,'package.json')).version,selectedAdapter.version);
  assert.ok(await exists(output+'.unpacked/node_modules/chrome-devtools-mcp/build/src/index.js'));
  assert.ok(asar.extractFile(output,'dist/preload.js').toString().includes('ag-zh:ready'));
 }finally{asar.uncacheAll();await fs.rm(dir,{recursive:true,force:true});}
});
