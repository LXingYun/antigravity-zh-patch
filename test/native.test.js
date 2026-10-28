import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as asar from '@electron/asar';
import {patchModule,words,adapter,hash} from '../src/patch.js';
import {original,selectedAdapter,requiresOriginal} from './support/original.js';
const req=createRequire(import.meta.url);
const source=n=>asar.extractFile(original,'dist/'+n+'.js');
const nativeModule={exports:{}};
vm.runInNewContext(fs.readFileSync(new URL('../src/native.cjs',import.meta.url),'utf8'),{module:nativeModule,require:()=>words});
const native=nativeModule.exports;
test('WSL 用户命名与原生右键菜单未知标签保持原样，固定命令只改显示',()=>{
 const child={label:'Settings',click:()=>42},menu={items:[{label:'Connect to WSL',submenu:{items:[child]}},{label:'Reopen Locally'}]};
 native.localizeMenu(menu);native.localizeMenu(menu);
 assert.equal(menu.items[0].label,'连接到 WSL');assert.equal(child.label,'Settings');assert.equal(child.click(),42);
 assert.equal(native.translateContextItem({id:'copy',label:'Copy'}),'复制');
 assert.equal(native.translateContextItem({id:'copy',label:'Settings'}),'Settings');
 assert.equal(native.translateContextItem({id:'project-user',label:'New Project'}),'New Project');
 assert.equal(native.translateContextItem({id:'cmi-0',label:'Settings'}),'Settings');
});

test('真实原生右键菜单构建保留命令 ID、回调与快捷键',{skip:!original||!(selectedAdapter.platform==='win32'||selectedAdapter.contextMenu)},()=>{
 const mocks={'electron':{},'electron-updater':{},'./types':{},'./updater':{},'electron-log/main':{},'./customScheme':{},'./tray':{},'./ideInstall/constants':{},'./wsl':{},'./menu':{},'./utils':{},'./ag-zh-native':native};
 const m=load('ipcHandlers',mocks,'\nexports.testMenu=buildContextMenuTemplate;');let selected;
 const result=m.testMenu([{id:'copy',label:'Copy',accelerator:'Ctrl+C'},{id:'user',label:'Settings'},{id:'group',label:'New Project',type:'submenu',submenu:[{id:'rename',label:'Rename'}]}],id=>selected=id);
 assert.equal(result[0].label,'复制');assert.equal(result[0].accelerator,'Ctrl+C');result[0].click();assert.equal(selected,'copy');
 assert.equal(result[1].label,'Settings');assert.equal(result[2].label,'New Project');assert.equal(result[2].submenu[0].label,'重命名');
});
class Menu {
  constructor(items=[]) {this.items=items;}
  insert(pos,item){this.items.splice(pos,0,item);}
  getMenuItemById(id){for(const item of this.items){if(item.id===id)return item;const child=item.submenu?.getMenuItemById(id);if(child)return child;}}
}
function load(n,mocks,append='') {
  const exports={};
  const context={exports,require:name=>Object.hasOwn(mocks,name)?mocks[name]:req(name),console,process,setTimeout,clearTimeout,setInterval,clearInterval,__dirname:'/app/dist'};
  vm.runInNewContext(patchModule(n,source(n),selectedAdapter)+append,context);return exports;
}
test('原生菜单翻译后，新建窗口、快捷键和更新动作仍正常',requiresOriginal,async()=>{
  const file=new Menu(),appSub=new Menu(),help=new Menu();
  const menu=new Menu([{label:'Antigravity',submenu:appSub},{label:'File',submenu:file},{label:'Help',submenu:help}]);
  let opened=0,checked=0,restarted=0;
  const updater={MenuUpdateStep:{CheckForUpdates:'Check for Updates'},updateActions:{'Check for Updates':()=>checked++,'Restart to Update':()=>restarted++}};
  const electron={Menu:{getApplicationMenu:()=>menu,setApplicationMenu:()=>{}},MenuItem:class {constructor(options){Object.assign(this,options);}},shell:{openExternal:()=>{}}};
  const module=load('menu',{'electron':electron,'./utils':{isMacOS:()=>true,createWindow:()=>opened++},'./updater':updater,'./wsl':{isWslAvailable:()=>false},'./debugConsole':{configureDebugConsoleMenu(){}},'./ag-zh-native':native});
  module.setupApplicationMenu('https://127.0.0.1:1');
  assert.equal(menu.items[1].label,'文件');assert.equal(file.items[0].label,'新建窗口');
  assert.equal(file.items[0].accelerator,'CmdOrCtrl+Shift+N');file.items[0].click();assert.equal(opened,1);
  const update=menu.getMenuItemById('check-for-updates');assert.equal(update.label,'检查更新');update.click(update);assert.equal(checked,1);
  const u=load('updater',{'electron':electron,'electron-updater':{},'./types':{UpdateState:{}},'./services/settingsService':{},'./ag-zh-native':native},'\nexports.testUpdateMenuState=updateMenuState;');
  u.testUpdateMenuState('Checking for Updates...');assert.equal(update.label,'正在检查更新…');assert.equal(update.enabled,false);
  u.testUpdateMenuState('Downloading Update...');assert.equal(update.label,'正在下载更新…');assert.equal(update.enabled,false);
  u.testUpdateMenuState('Restart to Update');assert.equal(update.label,'重启以更新');assert.equal(update.enabled,true);update.click(update);assert.equal(restarted,1);
  u.testUpdateMenuState('Check for Updates');update.click(update);assert.equal(checked,2);
});
test('托盘计数重复变化，不丢失原有操作',requiresOriginal,()=>{
  let current,clicked=0;
  const electron={app:{getName:()=>'Antigravity'},nativeImage:{createFromPath:()=>({setTemplateImage(){}})},Tray:class{setToolTip(){}setContextMenu(menu){current=menu;}},Menu:{buildFromTemplate:items=>new Menu(items)}};
  const t=load('tray',{'electron':electron,'./utils':{isMacOS:()=>true},'./ag-zh-native':native});
  t.createTray([{id:'running-agents',label:'No agents running',enabled:false},{label:'Open Antigravity',click:()=>clicked++}]);
  assert.equal(current.items[0].label,'没有正在运行的智能体');
  for(const count of [1,2,0,3]){t.updateTrayAgentCount(count);assert.equal(current.items[0].label,count?`${count} 个智能体正在运行`:'没有正在运行的智能体');}
  current.items[1].click();assert.equal(clicked,1);
});
test('未知资源被拒绝，预加载保留原 API 且只注入一次',requiresOriginal,()=>{
  for(const n of ['preload','menu','tray','updater','utils','main'])assert.throws(()=>patchModule(n,Buffer.from('changed')),/指纹/);
  const preload=source('preload').toString(),patched=patchModule('preload',source('preload'),selectedAdapter);
  assert.ok(patched.startsWith(preload));assert.equal(patched.split('isolated, origin-bound').length,2);
  assert.throws(()=>patchModule('preload',Buffer.from(patched)),/指纹/);
});

test('原生文件夹选择框标题汉化，保留路径、选项和取消行为',requiresOriginal,async()=>{
 const handlers=new Map();let options,canceled=false;
 const electron={ipcMain:{handle:(id,fn)=>handlers.set(id,fn),on(){}},dialog:{showOpenDialog:async o=>{options=o;return {canceled,filePaths:['/tmp/Settings']};}}};
 const mocks={'electron':electron,'electron-updater':{},'./types':{},'./updater':{},'electron-log/main':{},'./customScheme':{},'./tray':{},'./ideInstall/constants':{},'./wsl':{getActiveWslDistro:()=>null},'./menu':{},'./utils':{},'./ag-zh-native':native};
 const module=load('ipcHandlers',mocks);module.registerIpcHandlers({});
 assert.equal(await handlers.get('dialog:open-workspace')(),'/tmp/Settings');assert.equal(options.title,'打开工作区');
 assert.equal(Array.from(options.properties).join(','),'openDirectory,createDirectory');
 assert.equal(Array.from(await handlers.get('dialog:open-workspaces')()).join(','),'/tmp/Settings');assert.equal(options.title,'打开工作区');
 assert.equal(Array.from(options.properties).join(','),'openDirectory,createDirectory,multiSelections');
 canceled=true;assert.equal(await handlers.get('dialog:open-workspace')(),undefined);assert.equal((await handlers.get('dialog:open-workspaces')()).length,0);
});
