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
 assert.equal(selectAdapter('darwin','arm64','2.27.0').asarSha256,'5ed34675d2d5e42f9bb1c0087b06d398c2e2eb052512ec1d0fefd6b71e2db807');
 assert.equal(selectAdapter('darwin','arm64','2.28.0').asarSha256,'4a145127f2fa419489701fd67415feb8667bb14a6f228231c48ebc02c26704b2');
 assert.equal(selectAdapter('darwin','arm64','2.28.1').asarSha256,'cec1039f841be1976dfeef6a9fdb6e71c6981e6857c222430105e3b6979612af');
 assert.equal(selectAdapter('darwin','arm64','2.29.0').asarSha256,'290e1b7a1caa430a0c5367c7b433e8d284e2ca5d0b305e91e5ce8ec926f43283');
 assert.equal(selectAdapter('darwin','arm64','2.32.1').asarSha256,'5b493943e67e500638555315594d5b1acbc7a02e6dac3c786651921c1ee8519f');
 assert.equal(selectAdapter('darwin','arm64','2.33.0').asarSha256,'b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b');
 for(const [platform,arch] of [['darwin','arm64'],['win32','x64']])
   assert.equal(selectAdapter(platform,arch,'2.34.0').asarSha256,'8934adef0622c9271c92eea950a71848764a66f7b10023ccbd82e54b959adb0e');
 for(const args of [['win32','arm64','2.33.0'],['win32','x64','2.35.0'],['darwin','arm64','2.35.0'],['win32','arm64','2.34.0'],['darwin','x64','2.34.0'],['darwin','x64','2.33.0'],['darwin','arm64','2.33.1'],['win32','x64','2.32.1'],['darwin','arm64','2.32.0'],['win32','x64','2.27.0'],['win32','x64','2.28.0'],['win32','x64','2.28.1'],['win32','arm64','2.26.0'],['darwin','arm64','2.26.0'],['darwin','arm64','2.30.0'],['win32','x64','2.29.0'],['win32','x64','2.25.0']])assert.throws(()=>selectAdapter(...args),/不支持.*拒绝/);
});
test('Mac 未知版本在访问或修改应用资源之前被拒绝',{skip:process.platform!=='darwin'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-version-'));
 try {
  await fs.mkdir(root+'/Contents');
  const file=root+'/Contents/Info.plist';
  const content='<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.26.0</string></dict></plist>';
  await fs.writeFile(file,content);
  await assert.rejects(inspect(root),/不支持.*2.26.0.*拒绝/);assert.equal(await fs.readFile(file,'utf8'),content);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
