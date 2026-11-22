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
 assert.equal(native.translateContextItem({id:'move-down',label:'Move Down'}),'下移');
 assert.equal(native.translateContextItem({id:'reply-agent-message',label:'Reply'}),'回复');
 assert.equal(native.translateContextItem({id:'move-up',label:'Settings'}),'Settings');
});

test('真实原生右键菜单构建保留命令 ID、回调与快捷键',{skip:!original||!(selectedAdapter.platform==='win32'||selectedAdapter.contextMenu)},()=>{
 const mocks={'electron':{},'electron-updater':{},'./types':{},'./updater':{},'electron-log/main':{},'./customScheme':{},'./tray':{},'./ideInstall/constants':{},'./wsl':{},'./menu':{},'./scriptJail':{},'./utils':{},'./ag-zh-native':native};
 const m=load('ipcHandlers',{...browserIpcMocks,...mocks},'\nexports.testMenu=buildContextMenuTemplate;');let selected;
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
const browserIpcMocks = {
  './paths': {}, './debugConsole': {}, './deviceChooser': {deviceChooserController:{setHostResolver() {}}}, './guestFileChooserController': {},
  './guestPromptController': {}, './webviewPromptPreload': {}, './isolatedWorldExec': {},
  './guestFrameBridge': {}, './guestNetworkController': {}, './guestWebMcpController': {},
  './remote/windowBackends': {}, './remote/remoteWindowSecurity': {isRemoteContents: () => false},
  './hubZoom': {setHubZoomStorageManager() {}}, './webviewBrowser': {}, './externalUrl': {}, './wcvBrowserRegistry': {},
  './guestDialogController': {}, './wcvIpcHandlers': {registerWcvIpcHandlers() {}}
};
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
  const file=new Menu(),appSub=new Menu(),help=new Menu();
  const view=new Menu([{role:'resetZoom',label:'Actual Size'},{role:'zoomIn',label:'Zoom In'},{role:'zoomOut',label:'Zoom Out'}]);
  const zoomActions=[];
  const hubZoom={resolveTargetHubWindow:w=>w,applyHubWindowZoom:async(w,action)=>zoomActions.push([w,action])};
  const menu=new Menu([{label:'Antigravity',submenu:appSub},{label:'File',submenu:file},{label:'Help',submenu:help},{label:'View',submenu:view}]);
  let opened=0,checked=0,restarted=0;
  const updater={MenuUpdateStep:{CheckForUpdates:'Check for Updates'},updateActions:{'Check for Updates':()=>checked++,'Restart to Update':()=>restarted++}};
  const electron={Menu:{getApplicationMenu:()=>menu,setApplicationMenu:()=>{}},MenuItem:class {constructor(options){Object.assign(this,options);}},shell:{openExternal:()=>{}}};
  const module=load('menu',{'./hubZoom':hubZoom,'electron':electron,'./utils':{isMacOS:()=>true,createWindow:()=>opened++},'./updater':updater,'./wsl':{isWslAvailable:()=>false},'./debugConsole':{configureDebugConsoleMenu(){}},'./ag-zh-native':native});
  module.setupApplicationMenu('https://127.0.0.1:1');
  assert.equal(menu.items[1].label,'文件');assert.equal(file.items[0].label,'新建窗口');
  assert.equal(view.items[0].label,'实际大小');
  assert.equal(file.items[0].accelerator,'CmdOrCtrl+Shift+N');file.items[0].click();assert.equal(opened,1);
  if (selectedAdapter.hubWindowArguments) {
    const target={};
    for (const [id,label,accelerator,action] of [
      ['hub-reset-zoom','实际大小','CmdOrCtrl+0','reset'], ['hub-zoom-in','放大','CmdOrCtrl+Plus','in'],
      ['hub-zoom-in-equal','放大','CmdOrCtrl+=','in'], ['hub-zoom-out','缩小','CmdOrCtrl+-','out']
    ]) {
      const item=menu.getMenuItemById(id);
      assert.equal(item.label,label);
      assert.equal(item.accelerator,accelerator);
      item.click(item,target);
      assert.deepEqual(zoomActions.at(-1),[target,action]);
    }
    assert.equal(menu.getMenuItemById('hub-zoom-in-equal').visible,false);
  }
  const update=menu.getMenuItemById('check-for-updates');assert.equal(update.label,'检查更新');update.click(update);assert.equal(checked,1);
  const u=load('updater',{'electron':electron,'electron-updater':{},'./types':{UpdateState:{}},'./services/settingsService':{},'./utils':{},'./ag-zh-native':native},'\nexports.testUpdateMenuState=updateMenuState;');
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

test('本地主窗口的顶帧发送就绪确认', {skip:!original || !selectedAdapter.hubWindowArguments},()=>{
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
  allowTopFrame=false;
  onReady({sender:{mainFrame},senderFrame:mainFrame},{version:'1.0.0',translated:12});
  assert.equal(fs.existsSync(healthFile),false);
  allowTopFrame=true;
  onReady({sender:{mainFrame},senderFrame:mainFrame},{version:'1.0.0',translated:12});
  const written=JSON.parse(fs.readFileSync(healthFile,'utf8'));
  assert.equal(written.translated,12);assert.equal(written.installationId,'test-install');
 } finally { fs.rmSync(healthFile,{force:true}); }
});

test('本地主窗口保留启动参数，SSH 会话和背景视图保持隔离', {skip:!original || !selectedAdapter.hubViews}, () => {
  const origin = 'http://127.0.0.1:43210';
  const scenarios = [{builtInBrowser:false}, {builtInBrowser:true}];
  if (selectedAdapter.hubWindowArguments) scenarios.push(
    {builtInBrowser:true, additionalArguments:['--example-local']},
    {builtInBrowser:false, partition:'persist:example-ssh', additionalArguments:['--agy-backend=ssh']},
    {builtInBrowser:false, additionalArguments:['--agy-backend=ssh']},
    {builtInBrowser:false, partition:'persist:example'}
  );
  if (source('utils').includes('WCV_THREE_LAYER_STACK_ARG')) scenarios.push({builtInBrowser:true,threeLayer:true,additionalArguments:['--example-local']});
  for (const {threeLayer, ...options} of scenarios) {
    const useViews = options.builtInBrowser;
    const captured = [];
    const stop = new Error('window preferences captured');
    class CaptureView {
      constructor({webPreferences}) {
        captured.push(webPreferences);
        if (webPreferences.preload) throw stop;
      }
    }
    const electron = {
      app:{getName:()=>'Antigravity', commandLine:{hasSwitch:name=>name===(useViews?'enable-wcv-browser':'disable-wcv-browser')}},
      BrowserWindow:CaptureView, WebContentsView:CaptureView, BaseWindow:class {}, View:class {}
    };
    const utils = load('utils', {
      electron, './computer/previewViewers':{}, './hubWindows':{},
      './remote/windowBackends':{}, './nodeWrapper':{}, './constants':{WCV_THREE_LAYER_STACK_FLAG:'enable-wcv-three-layer-stack'}, './externalUrl':{}, './keybindings':{}, './loadingOverlay':{},
      './paths':{getSettingsPbPath:()=>'/unused', getAppStoragePath:()=>'/unused'},
      fs:{existsSync:()=>false}, './wsl':{getActiveWslDistro:()=>null},
      './debugConsole':{isDebugConsoleEnabled:()=>false},
      './windowState':{resolveInitialWindowState:()=>({width:800,height:600})}
    });
    const storage = threeLayer ? {getItemsSync:()=>({'enable-wcv-three-layer-stack':true})} : undefined;
    assert.throws(()=>utils.createWindow(origin+'/home?project=sample',storage,options), error=>error===stop);
    assert.equal(captured.length, useViews && !threeLayer ? 2 : 1);
    const hub = captured.at(-1);
    const args = options.additionalArguments || [];
    const remote = options.partition || args.includes('--agy-backend=ssh');
    const expected = remote ? [...args] : [...args,'--ag-zh-origin='+origin];
    if (threeLayer) expected.push('--agy-wcv-three-layer-stack=1');
    assert.deepEqual(Array.from(hub.additionalArguments || []), expected);
    assert.equal(hub.partition, options.partition);
    assert.equal(hub.contextIsolation, true);
    assert.equal(hub.nodeIntegration, false);
    if (useViews && !threeLayer) assert.deepEqual({...captured[0]}, {sandbox:true,javascript:false});
  }
});

test('2.28 脚本隔离接口仍传递原始请求、发送方和调用帧',{
 skip:!original||!asar.listPackage(original).includes('/dist/scriptJail.js')
},async()=>{
 const handlers=new Map(),calls=[];
 const electron={ipcMain:{handle:(id,fn)=>handlers.set(id,fn),on(){}}};
 const jail={
  runScriptInJail:(...args)=>{calls.push(['run',...args]);return Promise.resolve({jailId:'test-jail'});},
  abortScriptInJail:(...args)=>{calls.push(['abort',...args]);return true;}
 };
 const mocks={'electron':electron,'electron-updater':{},'./types':{},'./updater':{},'electron-log/main':{},'./customScheme':{},'./tray':{},'./ideInstall/constants':{},'./wsl':{},'./menu':{},'./scriptJail':jail,'./utils':{},'./ag-zh-native':native};
 load('ipcHandlers',{...browserIpcMocks,...mocks}).registerIpcHandlers({});
 const sender={},senderFrame={},request={code:'Settings New Project'},event={sender,senderFrame};
 assert.deepEqual(await handlers.get('script-jail:run')(event,request),{jailId:'test-jail'});
 assert.equal(handlers.get('script-jail:abort')(event,'test-jail'),true);
 assert.deepEqual(calls,[['run',sender,request,senderFrame],['abort',sender,'test-jail',senderFrame]]);
});
