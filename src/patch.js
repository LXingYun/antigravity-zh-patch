import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import MagicString from 'magic-string';
import * as asar from '@electron/asar';
import { createHash } from 'node:crypto';
import { startTranslator } from './runtime.js';
export const root = path.resolve(import.meta.dirname, '..');
export const adapter = JSON.parse(fs.readFileSync(path.join(root,'data/adapter-2.25.0.json')));
export const words = JSON.parse(fs.readFileSync(path.join(root,'data/zh-CN.json')));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, fn));
    else if (value && typeof value === 'object') walk(value, fn);
  }
}
export function patchModule(name, source, adapterOverride=adapter, options={}) {
  const adapter=adapterOverride;
  if (hash(source) !== adapter.modules[`dist/${name}.js`]) throw Error(`${name}: 文件指纹不匹配`);
  const code = source.toString();
  const out = new MagicString(code);
  const ast = parse(code, {ecmaVersion:'latest'});
  let changes = 0;
  const t = text => `require('./ag-zh-native').translate(${text})`;
  const replace = (node, text) => { out.overwrite(node.start,node.end,text); changes++; };
  const raw = node => code.slice(node.start,node.end);
  walk(ast, n => {
    if((adapter.platform==='win32'||adapter.contextMenu)&&name==='ipcHandlers'&&n.type==='LogicalExpression'&&raw(n)==="item.label ?? ''")
      replace(n,"require('./ag-zh-native').translateContextItem(item)");
    if (name === 'menu') {
      if (n.type === 'MemberExpression' && raw(n) === 'updater_1.updateActions[menuItem.label]')
        replace(n, 'updater_1.updateActions[menuItem.__agZhSourceLabel || menuItem.label]');
      if (n.type === 'BinaryExpression' && raw(n) === 'item.label === submenuLabel')
        replace(n, '(item.__agZhSourceLabel || item.label) === submenuLabel');
      if (n.type === 'CallExpression' && raw(n.callee) === 'electron_1.Menu.setApplicationMenu')
        replace(n, `(require('./ag-zh-native').localizeMenu(menu), ${raw(n)})`);
    }
    if (name === 'updater' && n.type === 'ExpressionStatement' && raw(n) === 'item.label = step;')
      replace(n, `item.__agZhSourceLabel = step; item.label = ${t('step')};`);
    if (name === 'tray' && n.type === 'CallExpression' && raw(n.callee) === 'tray.setContextMenu')
      replace(n, `(require('./ag-zh-native').localizeMenu(contextMenu), ${raw(n)})`);
    if (name === 'main') {
      if (n.type === 'CallExpression' && raw(n.callee) === 'electron_1.app.dock.setMenu')
        replace(n, `electron_1.app.dock.setMenu(require('./ag-zh-native').localizeMenu(dockMenu))`);
    }
    if (['main','ipcHandlers','updater'].includes(name)) {
      if (n.type === 'Property' && ['title','message','detail'].includes(n.key.name) &&
          n.value.type === 'Literal' && words[n.value.value]) replace(n.value,t(raw(n.value)));
      if (n.type === 'Property' && n.key.name === 'buttons' && n.value.type === 'ArrayExpression')
        for (const e of n.value.elements) if (e.type === 'Literal' && words[e.value]) replace(e,t(raw(e)));
    }
    if (name === 'utils' && n.type === 'Property' && n.key.name === 'webPreferences') {
      if(n.value.properties.some(p=>p.key.name==='additionalArguments')) throw Error('新增启动参数结构冲突');
      if(code.slice(n.value.properties.at(-1).end,n.value.end-1).trim() !== ',') throw Error('窗口属性分隔符不匹配');
      out.appendLeft(n.value.end-1, `additionalArguments: ['--ag-zh-origin=' + new URL(url).origin]\n`);
      changes++;
    }
  });
  if (name === 'utils') {
    const result = out.toString();
    parse(result,{ecmaVersion:'latest'});
    if(changes!==1) throw Error('窗口注入点数量不匹配');
    return result;
  }
  if (name === 'preload') {
    out.append(`\n// Antigravity zh-CN 1.0.0: isolated, origin-bound, failure-contained.\ntry {\n` +
      `const expectedOrigin = process.argv.find(a => a.startsWith('--ag-zh-origin='))?.slice(15);\n` +
      `if (process.isMainFrame && expectedOrigin) (${startTranslator.toString()})(window, ${JSON.stringify(words)}, expectedOrigin, state => require('electron').ipcRenderer.send('ag-zh:ready', state));\n` +
      `} catch (error) { console.warn('[AG-ZH] translator unavailable'); }\n`);
    changes++;
  }
  if (name === 'main') out.append(`
// Health acknowledgment contains only patch metadata, never page or account content.
electron_1.ipcMain.on('ag-zh:ready', (event, state) => {
  try {
    if (!electron_1.BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame || state?.version !== '1.0.0') return;
    const fs = require('fs'), path = require('path');
    const file = ${options.healthFile ? JSON.stringify(options.healthFile) : "path.join(require('os').homedir(), 'Library/Application Support/Antigravity zh-CN/health.json')"};
    const dir = path.dirname(file);
    fs.mkdirSync(dir, {recursive:true, mode:0o700});
    fs.writeFileSync(file + '.tmp', JSON.stringify({pid:process.pid, version:electron_1.app.getVersion(), patchVersion:state.version, translated:state.translated, appPath:electron_1.app.getAppPath(), installationId:${JSON.stringify(options.installationId||null)}, time:Date.now()}), {mode:0o600});
    fs.renameSync(file + '.tmp', file);
  } catch { console.warn('[AG-ZH] health acknowledgment unavailable'); }
});
`);
  const expected = {menu:4,updater:4,tray:3,main:6,preload:1,ipcHandlers:(adapter.platform==='win32'||adapter.contextMenu)?5:3};
  if(changes!==expected[name]) throw Error(`${name}: 预期 ${expected[name]} 个修改点，实际 ${changes}`);
  const result=out.toString();parse(result,{ecmaVersion:'latest'});return result;
}
export async function buildArchive(original, destination, scratch, adapterOverride=adapter, options={}) {
  const adapter=adapterOverride;
  if(hash(fs.readFileSync(original))!==adapter.asarSha256)throw Error('原始归档指纹不匹配');
  asar.extractAll(original,scratch);
  for(const name of ['preload','menu','tray','updater','utils','main','ipcHandlers']) {
    const file=path.join(scratch,'dist',name+'.js');
    fs.writeFileSync(file,patchModule(name,fs.readFileSync(file),adapter,options));
  }
  fs.copyFileSync(path.join(root,'src/native.cjs'),path.join(scratch,'dist/ag-zh-native.js'));
  fs.copyFileSync(path.join(root,'data/zh-CN.json'),path.join(scratch,'dist/ag-zh-dictionary.json'));
  await asar.createPackageWithOptions(scratch.replaceAll('\\','/'),destination,{unpackDir:path.join('node_modules','chrome-devtools-mcp')});
  // asar 4.3.1 omits executable flags when packing on Windows. Preserve the
  // original archive's metadata with that same pinned package's Pickle encoder.
  if(process.platform==='win32') {
    const before=asar.getRawHeader(original).header;
    const bytes=fs.readFileSync(destination),after=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)));
    const preserve=(old,next)=>{for(const [name,entry] of Object.entries(old.files||{})) {
      if(!next.files?.[name])throw Error('归档文件缺失：'+name);
      if(entry.files)preserve(entry,next.files[name]);
      else if(Object.hasOwn(entry,'executable'))next.files[name].executable=entry.executable;
    }};
    preserve(before,after);
    const {Pickle}=await import(new URL('./pickle.js',import.meta.resolve('@electron/asar')).href);
    const header=new Pickle();header.writeString(JSON.stringify(after));
    const size=new Pickle();size.writeUInt32(header.toBuffer().length);
    fs.writeFileSync(destination,Buffer.concat([size.toBuffer(),header.toBuffer(),bytes.subarray(8+bytes.readUInt32LE(4))]));
  }
  asar.uncacheAll();
  const changed=new Set(Object.keys(adapter.modules));
  // Every original file is preserved byte-for-byte unless explicitly patched.
  for(const entry of asar.listPackage(original)) {
    const p=entry.replaceAll('\\','/').replace(/^\//,''), nativePath=path.normalize(p), old=asar.statFile(original,nativePath), next=asar.statFile(destination,nativePath);
    if(old.files) {if(!next.files)throw Error('归档目录变化: '+p);continue;}
    if(Boolean(old.unpacked)!==Boolean(next.unpacked)||old.link!==next.link||Boolean(old.executable)!==Boolean(next.executable)) throw Error('归档结构变化: '+p);
    if(old.link)continue;
    if(!changed.has(p)&&!asar.extractFile(original,nativePath).equals(asar.extractFile(destination,nativePath))) throw Error('意外修改: '+p);
  }
  const bytes=fs.readFileSync(destination);
  return {asarSha256:hash(bytes),headerSha256:hash(bytes.subarray(16,16+bytes.readUInt32LE(12)))};
}
