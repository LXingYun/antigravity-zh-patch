import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspect} from '../src/installer.js';
test('未知版本在访问或修改应用资源之前被拒绝',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ag-zh-version-'));
 try {
  await fs.mkdir(root+'/Contents');
  const file=root+'/Contents/Info.plist';
  const content='<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.26.0</string></dict></plist>';
  await fs.writeFile(file,content);
  await assert.rejects(inspect(root),/2.26.0.*2.25.0/);assert.equal(await fs.readFile(file,'utf8'),content);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
