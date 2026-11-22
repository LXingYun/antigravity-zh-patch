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
 assert.equal(native.translateContextItem({id:'pin',label:'Pin'}),'置顶');
 assert.equal(native.translateContextItem({id:'pin',label:'Unpin'}),'取消置顶');
 assert.equal(native.translateContextItem({id:'delete',label:'Delete Permanently'}),'永久删除');
 assert.equal(native.translateContextItem({id:'open-in-builtin-browser',label:'Open in Built-in Browser'}),'在内置浏览器中打开');
 assert.equal(native.translateContextItem({id:'group-1',label:'Settings'}),'Settings');
 assert.equal(native.translateContextItem({id:'pin',label:'My Project'}),'My Project');
});

test('Windows 真实原生菜单构建保留命令 ID、回调与快捷键',{skip:!original||selectedAdapter.platform!=='win32'},()=>{
 const m=load('ipcHandlers',{'./ag-zh-native':native},'\nexports.testMenu=buildContextMenuTemplate;');let selected;
 const result=m.testMenu([{id:'copy',label:'Copy',accelerator:'Ctrl+C'},{id:'user',label:'Settings'},{id:'group',label:'New Project',type:'submenu',submenu:[{id:'rename',label:'Rename'}]}],id=>selected=id);
 assert.equal(result[0].label,'复制');assert.equal(result[0].accelerator,'Ctrl+C');result[0].click();assert.equal(selected,'copy');
 assert.equal(result[1].label,'Settings');assert.equal(result[2].label,'New Project');assert.equal(result[2].submenu[0].label,'重命名');
});
class Menu {
  constructor(items=[]) {this.items=items;}
  insert(pos,item){this.items.splice(pos,0,item);}
  getMenuItemById(id){for(const item of this.items){if(item.id===id)return item;const child=item.submenu?.getMenuItemById?.(id);if(child)return child;}}
}
function autoStub() {
  const fn=()=>autoStub();
  return new Proxy(fn,{get:(t,k)=>k==='__esModule'?true:k==='WSL_STATE_FILE'?'wsl.json':k===Symbol.toPrimitive?()=>'':autoStub()});
}
function load(n,mocks,append='') {
  const exports={};
  const context={
    exports,
    require:name=>{
      if(Object.hasOwn(mocks,name))return mocks[name];
      if(name.startsWith('./')||['electron','electron-updater','electron-log/main'].includes(name))return autoStub();
      return req(name);
    },
    URL,console,process,setTimeout,clearTimeout,setInterval,clearInterval,__dirname:'/app/dist'
  };
  vm.runInNewContext(patchModule(n,source(n),selectedAdapter)+append,context);return exports;
}
test('原生菜单翻译后，新建窗口、快捷键和更新动作仍正常',requiresOriginal,async()=>{
  const file=new Menu(),appSub=new Menu(),help=new Menu(),view=new Menu([{role:'resetzoom',label:'Actual Size'}]);
  const menu=new Menu([{label:'Antigravity',submenu:appSub},{label:'File',submenu:file},{label:'View',submenu:view},{label:'Help',submenu:help}]);
  let opened=0,checked=0,restarted=0;
  const updater={MenuUpdateStep:{CheckForUpdates:'Check for Updates'},updateActions:{'Check for Updates':()=>checked++,'Restart to Update':()=>restarted++}};
  const electron={Menu:{getApplicationMenu:()=>menu,setApplicationMenu:()=>{}},MenuItem:class {constructor(options){Object.assign(this,options);}},shell:{openExternal:()=>{}}};
  const module=load('menu',{'electron':electron,'./utils':{isMacOS:()=>true,createWindow:()=>opened++},'./updater':updater,'./wsl':{isWslAvailable:()=>false},'./ag-zh-native':native});
  module.setupApplicationMenu('https://127.0.0.1:1');
  assert.equal(menu.items[1].label,'文件');assert.equal(file.items[0].label,'新建窗口');
  assert.equal(view.items[0].label,'实际大小');
  assert.equal(file.items[0].accelerator,'CmdOrCtrl+Shift+N');file.items[0].click();assert.equal(opened,1);
  const update=menu.getMenuItemById('check-for-updates');assert.equal(update.label,'检查更新');update.click(update);assert.equal(checked,1);
  const u=load('updater',{'electron':electron,'./ag-zh-native':native},'\nexports.testUpdateMenuState=updateMenuState;');
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
 const sampleDir=path.resolve('/tmp/Settings');
 const electron={ipcMain:{handle:(id,fn)=>handlers.set(id,fn),on(){},removeListener(){},removeAllListeners(){}},dialog:{showOpenDialog:async o=>{options=o;return {canceled,filePaths:[sampleDir]};}},BrowserWindow:{fromWebContents:()=>null},app:{getPath:()=>path.resolve('/tmp/Downloads')}};
 const module=load('ipcHandlers',{'electron':electron,'./wsl':{getActiveWslDistro:()=>null},'./remote/remoteWindowSecurity':{isRemoteContents:()=>false},'./ag-zh-native':native});
 module.registerIpcHandlers({});
 assert.equal(await handlers.get('dialog:open-workspace')({}),sampleDir);assert.equal(options.title,'打开工作区');
 assert.equal(Array.from(options.properties).join(','),'openDirectory,createDirectory');
 assert.equal(Array.from(await handlers.get('dialog:open-workspaces')({})).join(','),sampleDir);assert.equal(options.title,'打开工作区');
 assert.equal(Array.from(options.properties).join(','),'openDirectory,createDirectory,multiSelections');
 canceled=true;assert.equal(await handlers.get('dialog:open-workspace')({}),undefined);assert.equal((await handlers.get('dialog:open-workspaces')({})).length,0);
 if(handlers.has('dialog:select-download-dir')) {
  canceled=false;await handlers.get('dialog:select-download-dir')({sender:{id:1,isDestroyed:()=>false},senderFrame:{parent:null}});
  assert.equal(options.title,'选择下载文件夹');
 }
});

test('多版本 utils 保留已有启动参数并注入 origin，main 支持 BaseWindow 顶帧就绪确认',requiresOriginal,()=>{
 const utilsCode=patchModule('utils',source('utils'),selectedAdapter);
 if(utilsCode.includes('options?.additionalArguments ?? []')) {
  assert.ok(utilsCode.includes('--ag-zh-origin='));
  let capturedOpts=[];
  class BaseWin{constructor(o){capturedOpts.push(o);this.contentView={children:[],addChildView(){},removeChildView(){},on(){}};}on(){}setTitle(){}isDestroyed(){return false;}getContentSize(){return [800,600];}}
  class Wcv{constructor(o){capturedOpts.push(o);this.webContents={on(){},once(){},off(){},loadURL:async()=>{},setWindowOpenHandler(){},setIgnoreMenuShortcuts(){},setZoomMode(){},setZoomFactor(){},setVisualZoomLevelLimits:async()=>{},isDestroyed:()=>false};}setBackgroundColor(){}setBounds(){}setVisible(){}}
  const electron={app:{getName:()=>'Antigravity',isPackaged:true,getPath:()=>'/tmp'},nativeTheme:{shouldUseDarkColors:true},BaseWindow:BaseWin,View:class{setBounds(){}setVisible(){}},WebContentsView:Wcv,BrowserWindow:class{constructor(o){capturedOpts.push(o);}on(){}}};
  const m=load('utils',{electron,'./paths':{getSettingsPbPath:()=>'/nonexistent',getAppStoragePath:()=>'/nonexistent'},'./windowState':{resolveInitialWindowState:()=>({width:800,height:600}),trackWindowState(){},MIN_WINDOW_WIDTH:400,MIN_WINDOW_HEIGHT:300},'./wsl':{getActiveWslDistro:()=>null},'./debugConsole':{isDebugConsoleEnabled:()=>false},'./hubWindows':{isAuxWindow:()=>false},'./remote/windowBackends':{isLocalAppWindow:()=>true}});
  m.createWindow('https://127.0.0.1:4321/',null,{builtInBrowser:true,additionalArguments:['--agy-backend=ssh']});
  const hubArgs=capturedOpts.flatMap(o=>o?.webPreferences?.additionalArguments||[]);
  assert.ok(hubArgs.includes('--agy-backend=ssh'));
  assert.ok(hubArgs.includes('--ag-zh-origin=https://127.0.0.1:4321'));
 }
 const mainCode=patchModule('main',source('main'),selectedAdapter);
 assert.ok(mainCode.includes('isLocalHubTopFrame'));
 const healthFile=path.join(os.tmpdir(),`ag-zh-health-test-${process.pid}.json`);
 try {
  const listeners=new Map();
  const mainFrame={id:'main'};
  const electron={app:{requestSingleInstanceLock:()=>false,quit(){},getName:()=>'Antigravity',getVersion:()=>selectedAdapter.version,getAppPath:()=>'/app/resources/app.asar',getPath:()=>'/tmp',commandLine:{hasSwitch:()=>false,getSwitchValue:()=>'',appendSwitch(){}},isDefaultProtocolClient:()=>true,setAsDefaultProtocolClient(){},on(){},whenReady:()=>new Promise(()=>{})},BrowserWindow:{fromWebContents:()=>null},ipcMain:{on:(ch,fn)=>listeners.set(ch,fn),handle(){}}};
  let allowTopFrame=true;
  const patchedMain=patchModule('main',source('main'),selectedAdapter,{healthFile,installationId:'test-install'});
  const bodyAfterLock=patchedMain.replace('process.exit(0);','');
  const exports={};
  const requireFn=name=>name==='electron'?electron:name==='./utils'?{isLocalHubTopFrame:()=>allowTopFrame}:name==='./remote/signInReturn'?{protocolSchemeFor:()=>'antigravity'}:(name.startsWith('./')||name==='electron-log/main')?autoStub():req(name);
  vm.runInNewContext(bodyAfterLock,{exports,require:requireFn,URL,console,process,setTimeout,clearTimeout,setInterval,clearInterval,__dirname:'/app/dist'});
  const onReady=listeners.get('ag-zh:ready');assert.ok(onReady);
  onReady({sender:{mainFrame},senderFrame:mainFrame},{version:'1.0.0',translated:12});
  const written=JSON.parse(fs.readFileSync(healthFile,'utf8'));
  assert.equal(written.translated,12);assert.equal(written.installationId,'test-install');
 } finally { fs.rmSync(healthFile,{force:true}); }
});
