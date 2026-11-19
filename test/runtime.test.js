import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {startTranslator} from '../src/runtime.js';
import {words} from '../src/patch.js';
const origin='https://127.0.0.1:12345';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(html) {
  const dom=new JSDOM(html,{url:origin,pretendToBeVisual:true});
  const state=startTranslator(dom.window,words,origin);
  await delay(150);
  return {dom,state,doc:dom.window.document,close:()=>dom.window.close()};
}
test('真实界面标记：翻译设置和操作，保护正文、模型名、路径和用户命名',async()=>{
  const f=await fixture(`<div class="settings-modal-container">
    <h2 id="title">General</h2><button id="edit">Edit</button>
    <button data-testid="settings-nav-item-Account">Settings</button>
    <div data-project-name="Settings">Settings</div>
    <input value="Settings" placeholder="Search settings"/><textarea>New Project</textarea>
    <code>Settings</code></div>
    <div data-cascade-id="123"><button>Settings</button></div>
    <div data-testid="turn-cards-container"><h1>Settings</h1><p>New Project</p></div>
    <div data-testid="artifact-view"><h1>Settings</h1></div>
    <div data-testid="project-selector-trigger">Settings</div>
    <div data-testid="model-selector-trigger">Default</div>
    <div role="menu"><div data-model-label="Default">Default</div><div role="menuitem" id="cancel">Cancel</div></div>
    <div contenteditable="true"><button>Settings</button></div>
    <div data-testid="new-conversation-button">New Conversation</div>`);
  try {
    assert.equal(f.doc.querySelector('#title').textContent,'常规');
    assert.equal(f.doc.querySelector('#edit').textContent,'编辑');
    assert.equal(f.doc.querySelector('#cancel').textContent,'取消');
    for(const q of ['[data-testid="settings-nav-item-Account"]','[data-project-name]','[data-cascade-id]',
      '[data-testid="artifact-view"]','[data-testid="project-selector-trigger"]','[contenteditable]','code'])
      assert.equal(f.doc.querySelector(q).textContent,'Settings',q);
    assert.equal(f.doc.querySelector('input').value,'Settings');
    assert.equal(f.doc.querySelector('textarea').value,'New Project');
    assert.equal(f.doc.querySelector('[data-testid="turn-cards-container"]').textContent,'SettingsNew Project');
    assert.equal(f.doc.querySelector('[data-model-label]').textContent,'Default');
    assert.equal(f.doc.querySelector('[data-testid="model-selector-trigger"]').textContent,'Default');
  }finally{f.close();}
});
test('增量更新、属性变化、白边空格、长文不按子串翻译',async()=>{
  const f=await fixture('<div role="dialog" id="root"><span id="s">  Settings \n</span><button title="Copy" id="b">Save</button><p>My Settings file</p></div>');
  try {
    assert.equal(f.doc.querySelector('#s').textContent,'  设置 \n');
    assert.equal(f.doc.querySelector('p').textContent,'My Settings file');
    f.doc.querySelector('#b').setAttribute('title','Paste');
    f.doc.querySelector('#s').firstChild.nodeValue='Appearance';
    const node=f.doc.createElement('span');node.textContent='New Project';f.doc.querySelector('#root').append(node);
    await delay(100);
    assert.equal(node.textContent,'新建项目');assert.equal(f.doc.querySelector('#s').textContent,'外观');
    assert.equal(f.doc.querySelector('#b').getAttribute('title'),'粘贴');
    const slices=f.state.slices;await delay(100);assert.equal(f.state.slices,slices,'空闲时不得扫描');
    assert.equal(f.state.errors,0);
  }finally{f.close();}
});
test('只修改文本节点，保留事件绑定、节点身份及子元素',async()=>{
  const f=await fixture('<div role="menu"><button id="button"><span>Copy</span><svg></svg></button></div>');
  try {
    const button=f.doc.querySelector('#button'),span=button.firstChild,svg=button.lastChild;
    let clicked=0;button.addEventListener('click',()=>clicked++);button.click();
    assert.equal(clicked,1);assert.equal(button.firstChild,span);assert.equal(button.lastChild,svg);
    assert.equal(span.textContent,'复制');
  }finally{f.close();}
});
test('来源隔离、重复初始化和新窗口',async()=>{
  const dom=new JSDOM('<h1>Settings</h1>',{url:'https://example.com',pretendToBeVisual:true});
  assert.equal(startTranslator(dom.window,words,origin),null);assert.equal(dom.window.document.body.textContent,'Settings');dom.window.close();
  const a=await fixture('<h1>Settings</h1>'),b=await fixture('<h1>Settings</h1>');
  assert.equal(startTranslator(a.dom.window,words,origin),a.state);assert.equal(b.doc.querySelector('h1').textContent,'设置');a.close();b.close();
});
test('大量节点变化最终完成且不会形成观察器循环',async()=>{
  const f=await fixture('<div role="dialog" id="root"></div>');
  try {
    const fragment=f.doc.createDocumentFragment();
    for(let i=0;i<1500;i++){const e=f.doc.createElement('span');e.textContent='Settings';fragment.append(e);}
    f.doc.querySelector('#root').append(fragment);
    for(let i=0;i<500&&f.doc.querySelector('#root').textContent.includes('Settings');i++)await delay(20);
    assert.equal([...f.doc.querySelectorAll('#root > span')].filter(e=>e.textContent==='设置').length,1500);
    await delay(100);const slices=f.state.slices;await delay(100);
    assert.equal(f.state.slices,slices);assert.equal(f.state.errors,0);assert.equal(f.state.pending,0);
  }finally{f.close();}
});
test('React 拆分的固定句子按完整词条翻译，不生成“否 项目 找到”',async()=>{
 const f=await fixture('<div role="menu" id="empty"></div>');
 try {
  const e=f.doc.querySelector('#empty');const nodes=['No ','projects',' found'].map(s=>f.doc.createTextNode(s));e.append(...nodes);
  await delay(100);assert.equal(e.textContent,'未找到项目');assert.equal(e.childNodes.length,3);assert.equal(e.firstChild,nodes[0]);
 }finally{f.close();}
});
test('输入框占位提示翻译，但草稿和项目同名文本不变',async()=>{
 const f=await fixture('<div data-testid="agent-input-box"><div contenteditable="true">Settings</div><span>Ask anything, @ to mention, / for actions</span></div><button data-testid="project-selector-trigger" aria-label="Select project, current: No Project">No Project</button>');
 try {assert.equal(f.doc.querySelector('[contenteditable]').textContent,'Settings');assert.equal(f.doc.querySelector('span').textContent,'输入问题或任务，@ 引用，/ 选择操作');assert.equal(f.doc.querySelector('button').textContent,'无项目');}finally{f.close();}
});

test('遗漏控件属性可翻译，模型和项目名称只保留原样',async()=>{
 const f=await fixture(`<button data-testid="sidebar-toggle" aria-label="Toggle Sidebar"></button>
 <button aria-label="Go Back" data-tooltip-id="back"></button>
 <button aria-label="Display Options"></button>
 <button data-testid="model-selector-trigger" aria-label="Select model, current: Default"><span>Default</span></button>
 <button data-testid="project-selector-trigger" aria-label="Select project, current: Settings"><span data-project-icon></span>Settings</button>
 <button data-testid="permissions-selector-trigger" aria-label="Agent permissions preset selector, current: Default">Default</button>
 <div data-testid="turn-cards-container"><button aria-label="Go Back">Settings</button></div>`);
 try {
  const buttons=f.doc.querySelectorAll('button');assert.equal(buttons[0].getAttribute('aria-label'),'显示/隐藏侧边栏');
  assert.equal(buttons[1].getAttribute('aria-label'),'返回');assert.equal(buttons[2].getAttribute('aria-label'),'显示选项');
  assert.equal(buttons[3].getAttribute('aria-label'),'选择模型，当前：Default');assert.equal(buttons[3].textContent,'Default');
  assert.equal(buttons[4].getAttribute('aria-label'),'选择项目，当前：Settings');assert.equal(buttons[4].textContent,'Settings');
  assert.equal(buttons[5].getAttribute('aria-label'),'权限预设，当前：默认');assert.equal(buttons[6].getAttribute('aria-label'),'Go Back');
  buttons[3].setAttribute('aria-label','Select model, current: New Project');await delay(100);
  assert.equal(buttons[3].getAttribute('aria-label'),'选择模型，当前：New Project');assert.equal(buttons[3].textContent,'Default');
 }finally{f.close();}
});
test('自动化表单和搜索占位提示翻译，不改变草稿、时区或模型',async()=>{
 const f=await fixture(`<div data-testid="sidecars-view"><input placeholder="Search automations..." value="Settings"/></div>
 <div data-testid="new-sidecar-modal"><label>Name</label><input data-testid="new-sidecar-name" placeholder="Enter automation name..." value="New Project"/>
 <textarea data-testid="new-sidecar-prompt" placeholder="Enter a prompt for the agent to run...">Settings New Project</textarea>
 <input placeholder="Enter Time Zone..." value="Asia/Shanghai"/><button data-testid="new-sidecar-model">Default</button>
 <div role="option">Daily</div><button data-testid="new-sidecar-submit">Add Automation</button></div>`);
 try {
  const inputs=f.doc.querySelectorAll('input');assert.equal(inputs[0].getAttribute('placeholder'),'搜索自动化…');assert.equal(inputs[0].value,'Settings');
  assert.equal(inputs[1].getAttribute('placeholder'),'输入自动化名称…');assert.equal(inputs[1].value,'New Project');
  const prompt=f.doc.querySelector('textarea');assert.equal(prompt.value,'Settings New Project');assert.equal(prompt.getAttribute('placeholder'),'输入要让智能体执行的指令…');
  assert.equal(inputs[2].value,'Asia/Shanghai');assert.equal(f.doc.querySelector('[data-testid="new-sidecar-model"]').textContent,'Default');
  assert.equal(f.doc.querySelector('[role="option"]').textContent,'每天');assert.equal(f.doc.querySelector('[data-testid="new-sidecar-submit"]').textContent,'添加自动化');
 }finally{f.close();}
});
test('混合内容仅翻译固定标题、徽标和操作，保留技能描述及模型名',async()=>{
 const f=await fixture(`<div data-testid="project-customizations-content"><p class="text-muted-foreground">There are no customizations enabled.</p>
 <div data-testid="workspace-customizations-view"><button><h3>Skills</h3></button><span class="text-sm">Settings</span><p class="description">No custom agents yet.</p><button aria-label="Copy path"></button></div></div>
 <div data-testid="model-selector-item" data-model-label="Notice"><span>Notice</span><div class="bg-secondary rounded-full"><span>Notice</span></div></div>
 <span aria-label="Built In" class="rounded-full font-normal">Built In</span>
 <div data-ag-zh-protect><span aria-label="Built In" class="rounded-full font-normal">Built In</span></div>`);
 try {
  assert.equal(f.doc.querySelector('h3').textContent,'技能');assert.equal(f.doc.querySelector('p').textContent,'当前未启用任何自定义项。');
  assert.equal(f.doc.querySelector('.text-sm').textContent,'Settings');assert.equal(f.doc.querySelector('.description').textContent,'No custom agents yet.');
  assert.equal(f.doc.querySelector('button[aria-label]').getAttribute('aria-label'),'复制路径');
  assert.equal(f.doc.querySelector('[data-model-label] > span').textContent,'Notice');assert.equal(f.doc.querySelector('.bg-secondary span').textContent,'提示');
  assert.equal(f.doc.querySelector('span[aria-label]').textContent,'内置');assert.equal(f.doc.querySelector('[data-ag-zh-protect]').textContent,'Built In');
  const slices=f.state.slices;await delay(100);assert.equal(f.state.slices,slices);assert.equal(f.state.errors,0);
 }finally{f.close();}
});
test('套餐依据实际设置页标题判断，动态邮箱和搜索词保留原样',async()=>{
 const f=await fixture(`<div class="settings-modal-container"><h2>Models &amp; Usage</h2><h3>Plan</h3><span>Send feedback as test@example.invalid</span></div>
 <div data-testid="customizations-empty-state">No plugins found for "Settings".</div><div data-testid="turn-cards-container">Send feedback as test@example.invalid</div>`);
 try {
  assert.equal(f.doc.querySelector('h3').textContent,'套餐');assert.equal(f.doc.querySelector('span').textContent,'以 test@example.invalid 的身份发送反馈');
  assert.equal(f.doc.querySelector('[data-testid="customizations-empty-state"]').textContent,'未找到与“Settings”匹配的插件。');
  assert.equal(f.doc.querySelector('[data-testid="turn-cards-container"]').textContent,'Send feedback as test@example.invalid');
 }finally{f.close();}
});

test('搜索弹窗、MCP 输入和技能操作保留搜索词与名称',async()=>{
 const f=await fixture('');
 try {
  f.dom.window.history.replaceState({},'',origin+'/customizations/installed');
  f.doc.body.innerHTML=`<input data-testid="fastpick-input" placeholder="Search for conversations..." value="Settings"/>
   <button aria-haspopup="menu" aria-label="More actions for New Project"></button>
   <div data-testid="turn-cards-container"><button aria-label="More actions for Settings"></button></div>
   <div data-testid="add-mcp-screen"><input placeholder="Search MCP servers by name" value="New Project"/><p>No MCP servers found for "Settings"</p></div>
   <div data-testid="workspace-customizations-view"><span class="rounded shrink-0 text-blue-400">Global</span><span class="rounded shrink-0 text-green-400">Global</span></div>`;
  await delay(120);
  assert.equal(f.doc.querySelector('input').getAttribute('placeholder'),'搜索对话…');assert.equal(f.doc.querySelector('input').value,'Settings');
  assert.equal(f.doc.querySelector('button').getAttribute('aria-label'),'New Project 的更多操作');
  assert.equal(f.doc.querySelector('[data-testid="turn-cards-container"] button').getAttribute('aria-label'),'More actions for Settings');
  assert.equal(f.doc.querySelector('[data-testid="add-mcp-screen"] input').value,'New Project');
  assert.equal(f.doc.querySelector('p').textContent,'未找到与“Settings”匹配的 MCP 服务器');
  assert.equal(f.doc.querySelector('.text-blue-400').textContent,'全局');assert.equal(f.doc.querySelector('.text-green-400').textContent,'Global');
 }finally{f.close();}
});

test('2.33 设置导航与用户同名项目隔离，分支/SSH/下载/转写不误翻',async()=>{
 const f=await fixture(`<div class="settings-modal-container">
   <div><h1>Settings</h1></div>
   <div><button data-testid="settings-nav-item-Customizations"><span>Customizations</span></button>
   <button data-testid="settings-nav-item-Browser"><span>Browser</span></button>
   <button data-testid="settings-nav-item-Developer"><span>Developer</span></button>
   <button data-testid="settings-nav-item-Running"><span>Running</span></button>
   <button data-testid="settings-nav-item-Provide Feedback"><span>Give Feedback</span></button></div>
   <div><h2>Projects</h2></div>
   <div><div><button data-testid="settings-nav-item-General"><span>General</span></button></div>
   <div><button data-testid="settings-nav-item-Browser"><span>Browser</span></button></div></div>
 </div>
 <div data-testid="agent-response"><p>Settings</p></div>
 <div data-testid="user-message-content"><p>Downloads</p></div>
 <div data-testid="branch-pill-label">Settings</div>
 <div data-ssh-host="General"><span>General</span></div>
 <span data-testid="builtin-browser-download-dir-value">C:\\Users\\Downloads</span>
 <div data-testid="automation-instructions-markdown"><p>Settings</p></div>
 <div data-testid="voice-settings-mic"><span>Default</span></div>
 <div data-testid="bottom-terminal-panel-title">Terminal</div>
 <div data-testid="webview-download-drawer"><span>Downloads</span><button aria-label="Close downloads"></button><span data-testid="webview-download-filename">Settings.zip</span><div>No recent downloads</div></div>`);
 try {
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Customizations"]').textContent,'自定义');
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Browser"]').textContent,'浏览器');
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Developer"]').textContent,'开发者');
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Running"]').textContent,'正在运行');
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Provide Feedback"]').textContent,'提供反馈');
  assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-General"]').textContent,'General');
  assert.equal(f.doc.querySelectorAll('[data-testid="settings-nav-item-Browser"]')[1].textContent,'Browser');
  assert.equal(f.doc.querySelector('[data-testid="agent-response"]').textContent,'Settings');
  assert.equal(f.doc.querySelector('[data-testid="user-message-content"]').textContent,'Downloads');
  assert.equal(f.doc.querySelector('[data-testid="branch-pill-label"]').textContent,'Settings');
  assert.equal(f.doc.querySelector('[data-ssh-host]').textContent,'General');
  assert.equal(f.doc.querySelector('[data-testid="builtin-browser-download-dir-value"]').textContent,'C:\\Users\\Downloads');
  assert.equal(f.doc.querySelector('[data-testid="automation-instructions-markdown"]').textContent,'Settings');
  assert.equal(f.doc.querySelector('[data-testid="voice-settings-mic"]').textContent,'Default');
  assert.equal(f.doc.querySelector('[data-testid="bottom-terminal-panel-title"]').textContent,'终端');
  assert.equal(f.doc.querySelector('[data-testid="webview-download-drawer"] > span').textContent,'下载内容');
  assert.equal(f.doc.querySelector('[data-testid="webview-download-drawer"] button').getAttribute('aria-label'),'关闭下载列表');
  assert.equal(f.doc.querySelector('[data-testid="webview-download-filename"]').textContent,'Settings.zip');
  assert.equal(f.doc.querySelector('[data-testid="webview-download-drawer"] > div').textContent,'暂无最近下载');
  const slices=f.state.slices;await delay(100);assert.equal(f.state.slices,slices);assert.equal(f.state.errors,0);
 }finally{f.close();}
});

test('2.33 首页轮换欢迎语与侧栏分页翻译，保留姓名和会话正文',async()=>{
 const f=await fixture(`<div data-testid="home-greeting"><h1 class="home-greeting-title">Welcome back, Settings. Where should we pick up?</h1></div>
 <div data-testid="conversation-list-sidebar"><button class="select-none text-muted-foreground" id="more">See all (8)</button><div data-sidebar-row-id="1"><a>See all (8)</a></div></div>
 <div data-testid="agent-response"><h1>Welcome back, Settings. Where should we pick up?</h1><button>See all (8)</button></div>`);
 try {
  const title=f.doc.querySelector('h1'),more=f.doc.querySelector('#more');
  assert.equal(title.textContent,'欢迎回来，Settings。接下来从哪里继续？');
  assert.equal(more.textContent,'查看全部（8）');
  for(const [source,translated] of [["Hey New-Project, what should we build today?",'你好，New-Project，今天想做些什么？'],["Good to see you, Memories. What's next?",'很高兴见到你，Memories。接下来做什么？'],['Hey there, what should we build today?','你好，今天想做些什么？'],['Welcome back. Where should we pick up?','欢迎回来。接下来从哪里继续？'],["Good to see you. What's next?",'很高兴见到你。接下来做什么？']]) {
   title.firstChild.nodeValue=source;await delay(60);assert.equal(title.textContent,translated);
  }
  more.firstChild.nodeValue='See less';await delay(60);assert.equal(more.textContent,'收起');
  assert.equal(f.doc.querySelector('[data-sidebar-row-id] a').textContent,'See all (8)');
  assert.equal(f.doc.querySelector('[data-testid="agent-response"] h1').textContent,'Welcome back, Settings. Where should we pick up?');
  assert.equal(f.state.errors,0);
 }finally{f.close();}
});

test('2.33 语音占位及选择器翻译，真实音色和麦克风名称不变',async()=>{
 const f=await fixture(`<div class="settings-modal-container"><h2>Voice mode</h2><p>The voice used in Voice mode. Powered by Gemini Live.</p>
 <span data-testid="voice-settings-name">Not set</span><div data-testid="voice-settings-mic"><button role="combobox" aria-controls="mic-list" aria-labelledby="voice-microphone-label mic-value"><span id="mic-value">System default</span></button></div>
 <p>How loud Antigravity's voice is.</p><input type="range" aria-label="Voice volume" value="62"/></div>
 <div id="mic-list" role="listbox" data-select-popup><div role="option">System default</div><div role="option">System default (2)</div><div role="option">Settings</div><div role="option">Default</div></div>
 <div data-testid="voice-picker"><h2>Choose Antigravity's Voice</h2><span data-testid="voice-picker-name">Fola</span><div>Clear and friendly</div>
 <button data-testid="voice-picker-prev" aria-label="Previous voice"></button><button data-testid="voice-picker-next" aria-label="Next voice"></button>
 <button data-testid="voice-picker-dot-0" aria-label="Fola, voice 1 of 9"></button><button data-testid="voice-picker-use"></button></div>
 <div data-ag-zh-protect><span data-testid="voice-settings-name">Not set</span><div data-testid="voice-settings-mic">System default</div></div>`);
 try {
  assert.equal(f.doc.querySelector('h2').textContent,'语音模式');
  assert.equal(f.doc.querySelector('[data-testid="voice-settings-name"]').textContent,'未设置');
  assert.equal(f.doc.querySelector('#mic-value').textContent,'系统默认');
  assert.deepEqual([...f.doc.querySelectorAll('#mic-list [role="option"]')].map(e=>e.textContent),['系统默认','System default (2)','Settings','Default']);
  assert.equal(f.doc.querySelector('input').getAttribute('aria-label'),'语音音量');assert.equal(f.doc.querySelector('input').value,'62');
  assert.equal(f.doc.querySelector('[data-testid="voice-picker"] h2').textContent,'选择 Antigravity 的音色');
  assert.equal(f.doc.querySelector('[data-testid="voice-picker-name"]').textContent,'Fola');
  assert.equal(f.doc.querySelector('[data-testid="voice-picker"] > div').textContent,'清晰亲切');
  assert.equal(f.doc.querySelector('[data-testid="voice-picker-dot-0"]').getAttribute('aria-label'),'Fola，音色 1/9');
  const use=f.doc.querySelector('[data-testid="voice-picker-use"]');const nodes=['Use ','Fola'].map(s=>f.doc.createTextNode(s));use.append(...nodes);await delay(70);
  assert.equal(use.textContent,'使用 Fola');assert.equal(use.firstChild,nodes[0]);
  nodes[1].nodeValue='Arlo';await delay(70);assert.equal(use.textContent,'使用 Arlo');
  f.doc.querySelector('[data-testid="voice-settings-name"]').firstChild.nodeValue='Fola';f.doc.querySelector('#mic-value').firstChild.nodeValue='Settings';await delay(70);
  assert.equal(f.doc.querySelector('[data-testid="voice-settings-name"]').textContent,'Fola');assert.equal(f.doc.querySelector('#mic-value').textContent,'Settings');
  assert.equal(f.doc.querySelector('[data-ag-zh-protect]').textContent,'Not setSystem default');
  const mic=f.doc.querySelector('[data-testid="voice-settings-mic"] [role="combobox"]');
  const next=f.doc.createElement('div');next.id='mic-next';next.setAttribute('role','listbox');next.innerHTML='<div role="option" data-value="Settings">Settings</div><div role="option" data-value="System default">System default</div>';
  f.doc.body.append(next);await delay(70);mic.setAttribute('aria-controls','mic-next');await delay(70);
  assert.deepEqual([...next.children].map(e=>e.textContent),['Settings','系统默认']);assert.equal(next.firstChild.getAttribute('data-value'),'Settings');
  assert.equal(f.state.errors,0);const slices=f.state.slices;await delay(70);assert.equal(f.state.slices,slices);
 }finally{f.close();}
});

test('2.33 设置说明和音色描述完整命中，音色名硬保护与固定控件互不影响',async()=>{
 const phrases={
  'Simplified interface for research, writing, and everyday tasks.':'适合研究、写作和日常任务的简洁界面。',
  'Full interface for coding, developer tools, and managing agents.':'提供编程、开发工具和智能体管理功能的完整界面。',
  'The voice used in Voice mode. Powered by Gemini Live.':'语音模式使用的音色，由 Gemini Live 提供支持。',
  "How loud Antigravity's voice is.":'调整 Antigravity 的语音音量。',
  'Confident and clear':'自信清晰','Warm and engaging':'温暖生动','Warm and approachable':'温暖随和',
  'Deep and velvety':'低沉柔和','Light and precise':'轻快准确',
  'Open Command Palette':'打开命令面板','Close Tab':'关闭标签页','Reopen Closed Tab':'重新打开已关闭的标签页'
 };
 const f=await fixture(`<div class="settings-modal-container">${Object.keys(phrases).map(s=>`<p>${s}</p>`).join('')}</div>
  <div data-testid="voice-picker"><span data-testid="voice-picker-name">Not set</span><button data-testid="voice-picker-use">Use Unknown</button></div>`);
 try {
  assert.deepEqual([...f.doc.querySelectorAll('p')].map(e=>e.textContent),Object.values(phrases));
  assert.equal(f.doc.querySelector('[data-testid="voice-picker-name"]').textContent,'Not set');
  assert.equal(f.doc.querySelector('[data-testid="voice-picker-use"]').textContent,'Use Unknown');
 }finally{f.close();}
});

test('2.33 固定操作属性与设置补漏，动态分支/设备/快捷键保留原值',async()=>{
 const f=await fixture(`<button aria-label="Project options"></button><a aria-label="New Conversation in Project"></a>
 <button data-testid="conversation-archive-button" aria-label="Archive conversation"></button><button data-testid="conversation-pin-button" aria-label="Pin conversation"></button>
 <button aria-label="More options"></button><button aria-label="More actions"></button><button data-testid="voice-start-button" aria-label="Start Voice mode"></button>
 <button data-testid="branch-pill-trigger" aria-label="Branch, current: Settings"><span data-testid="branch-pill-label">Settings</span></button>
 <button data-testid="location-selector-trigger" aria-label="Where the agent runs, current: New Project">New Project</button>
 <div class="settings-modal-container"><span>Knowledge Work</span><span>Software Engineering</span><span>Controls permissions for remote conversations.</span><span>Font</span><span>Google Sans</span><span>Change…</span><span>Browsing History</span>
 <input aria-label="Background color picker" value="#ffffff"/><div data-testid="shortcut-row-openConvoPicker"><button aria-label="Shortcut Ctrl+K for Open Conversation Picker"></button><button aria-label="Remove shortcut Ctrl+K for Open Conversation Picker"></button><button aria-label="Add shortcut for Open Conversation Picker"></button></div>
 <div data-testid="shortcut-row-openFileSearch"><button aria-label="Shortcut Ctrl+P for Open File Search"></button></div>
 <div data-testid="shortcut-row-openAutomations"><button aria-label="Shortcut Ctrl+U for Automations"></button></div>
 <div data-testid="shortcut-row-unknown"><button aria-label="Add shortcut for My Settings Command"></button></div></div>
 <div data-testid="agent-response"><button aria-label="Project options"></button><button data-testid="voice-start-button" aria-label="Start Voice mode"></button></div>`);
 try {
  const attr=s=>f.doc.querySelector(s).getAttribute('aria-label');
  assert.equal(attr('button'),'项目选项');assert.equal(attr('a'),'在项目中新建对话');
  assert.equal(attr('[data-testid="conversation-archive-button"]'),'归档对话');assert.equal(attr('[data-testid="conversation-pin-button"]'),'置顶对话');
  assert.equal(attr('[data-testid="voice-start-button"]'),'开始语音模式');
  assert.equal(attr('[data-testid="branch-pill-trigger"]'),'分支，当前：Settings');assert.equal(f.doc.querySelector('[data-testid="branch-pill-trigger"]').textContent,'Settings');
  assert.equal(attr('[data-testid="location-selector-trigger"]'),'智能体运行位置，当前：New Project');assert.equal(f.doc.querySelector('[data-testid="location-selector-trigger"]').textContent,'New Project');
  assert.deepEqual([...f.doc.querySelectorAll('.settings-modal-container > span')].map(e=>e.textContent),['知识工作','软件开发','控制远程对话中的权限。','字体','Google Sans','更改…','浏览历史记录']);
  assert.equal(attr('input'),'背景颜色选择器');assert.equal(f.doc.querySelector('input').value,'#ffffff');
  assert.deepEqual([...f.doc.querySelectorAll('[data-testid="shortcut-row-openConvoPicker"] button')].map(e=>e.getAttribute('aria-label')),['打开对话选择器的快捷键：Ctrl+K','移除打开对话选择器的快捷键 Ctrl+K','为打开对话选择器添加快捷键']);
  assert.equal(attr('[data-testid="shortcut-row-openFileSearch"] button'),'打开文件搜索的快捷键：Ctrl+P');
  assert.equal(attr('[data-testid="shortcut-row-openAutomations"] button'),'自动化的快捷键：Ctrl+U');
  assert.equal(attr('[data-testid="shortcut-row-unknown"] button'),'Add shortcut for My Settings Command');
  assert.equal(attr('[data-testid="agent-response"] button'),'Project options');
  assert.equal(f.state.errors,0);
 }finally{f.close();}
});
