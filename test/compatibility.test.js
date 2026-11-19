import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspect} from '../src/installer.js';
import {selectAdapter} from '../src/adapters.js';
test('平台、架构与版本独立选择，Mac 指纹保留且未知版本拒绝',()=>{
 assert.equal(selectAdapter('darwin','arm64','2.25.0').asarSha256,'ad7fb1a177a11522490cba910c0970a117bec568cd9ad85233fa62873361ed05');
 assert.equal(selectAdapter('win32','x64','2.26.0').asarSha256,'8ce27ff7c2defa10ed1ed2817288a61c546690f4cae1b1a8c91d4e69e0851e4d');
 assert.equal(selectAdapter('win32','x64','2.33.0').asarSha256,'b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b');
 for(const args of [['win32','x64','2.27.0'],['win32','x64','2.34.0'],['win32','arm64','2.26.0'],['win32','arm64','2.33.0'],['darwin','arm64','2.26.0'],['darwin','arm64','2.33.0'],['win32','x64','2.25.0']])assert.throws(()=>selectAdapter(...args),/不支持.*拒绝/);
});
test('Mac 未知版本在访问或修改应用资源之前被拒绝',{skip:process.platform!=='darwin'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-version-'));
 try {
  await fs.mkdir(root+'/Contents');
  const file=root+'/Contents/Info.plist';
  const content='<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.26.0</string></dict></plist>';
  await fs.writeFile(file,content);
  await assert.rejects(inspect(root),/2.26.0.*2.25.0/);assert.equal(await fs.readFile(file,'utf8'),content);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
