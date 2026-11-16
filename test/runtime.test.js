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
test('2.29 首页问候保留姓名，同名下载目录、草稿和对话不被翻译',async()=>{
  const phrase='Hi Settings, what can we get done today?';
  const f=await fixture(`<div data-testid="home-greeting"><h1>${phrase}</h1></div>
    <div class="settings-modal-container"><label>Download Location</label>
    <span data-testid="builtin-browser-download-dir-value">Settings</span>
    <div data-testid="voice-settings-mic"><span>Settings</span></div></div>
    <button data-testid="location-selector-trigger" aria-label="Where the agent runs, current: Settings"><span class="truncate">Settings</span></button>
    <div role="menu"><div data-testid="location-cloud-dev" data-env-id="dev">New Project</div>
    <div data-testid="location-local"><span class="truncate">This Computer</span></div></div>
    <textarea>${phrase}</textarea><div data-testid="planner-response-text"><h1>${phrase}</h1></div>`);
  try {
    const greeting=f.doc.querySelector('h1');
    assert.equal(greeting.textContent,'你好，Settings，今天想做点什么？');
    assert.equal(f.doc.querySelector('label').textContent,'下载位置');
    assert.equal(f.doc.querySelector('span').textContent,'Settings');
    assert.equal(f.doc.querySelector('[data-testid="voice-settings-mic"]').textContent,'Settings');
    const location = f.doc.querySelector('[data-testid="location-selector-trigger"]');
    assert.equal(location.getAttribute('aria-label'),'智能体运行位置，当前：Settings');
    assert.equal(location.textContent,'Settings');
    assert.equal(f.doc.querySelector('[data-env-id="dev"]').textContent,'New Project');
    assert.equal(f.doc.querySelector('[data-testid="location-local"]').textContent,'本机');
    assert.equal(f.doc.querySelector('textarea').value,phrase);
    assert.equal(f.doc.querySelector('[data-testid="planner-response-text"]').textContent,phrase);
    greeting.firstChild.nodeValue='What can we get done today?';
    await delay(100);
    assert.equal(greeting.textContent,'今天想做点什么？');
  }finally{f.close();}
});
test('2.28 浏览器设置标签翻译，保留选择状态、事件与同名用户内容',async()=>{
  const f=await fixture(`<div class="settings-modal-container">
    <h3>Built-in Browser</h3><p>Configure link opening and built-in browser preferences.</p>
    <label>Open Links In</label><p>Choose where links open by default when clicked.</p>
    <button role="radio" aria-checked="false" id="external">External Browser</button>
    <button role="radio" aria-checked="true" id="builtin">Built-in Browser</button>
    <h3>Browser Subagent</h3><textarea>Built-in Browser</textarea></div>
    <div data-testid="planner-response-text">Built-in Browser</div>
    <div data-project-name="Browser Subagent">Browser Subagent</div>`);
  try {
    assert.deepEqual([...f.doc.querySelectorAll('h3')].map(e=>e.textContent),['内置浏览器','浏览器子智能体']);
    assert.equal(f.doc.querySelector('label').textContent,'链接打开方式');
    assert.deepEqual([...f.doc.querySelectorAll('p')].map(e=>e.textContent),['设置链接打开方式和内置浏览器偏好。','选择点击链接时默认使用的浏览器。']);
    const external=f.doc.querySelector('#external'),builtin=f.doc.querySelector('#builtin');
    assert.equal(external.textContent,'外部浏览器');assert.equal(builtin.textContent,'内置浏览器');
    assert.equal(external.getAttribute('aria-checked'),'false');assert.equal(builtin.getAttribute('aria-checked'),'true');
    let clicked=0;external.addEventListener('click',()=>clicked++);external.click();assert.equal(clicked,1);
    assert.equal(f.doc.querySelector('textarea').value,'Built-in Browser');
    assert.equal(f.doc.querySelector('[data-testid="planner-response-text"]').textContent,'Built-in Browser');
    assert.equal(f.doc.querySelector('[data-project-name]').textContent,'Browser Subagent');
  }finally{f.close();}
});
test('2.27 设置反馈入口与配额恢复提示翻译，保留账号名、正文及动态数字',async()=>{
  const source='You have used some of your weekly limit, it will fully refresh in 3 days, 16 hours.';
  const f=await fixture(`<div class="settings-modal-container">
    <button data-testid="settings-nav-item-Give Feedback">Give Feedback</button>
    <button data-testid="settings-nav-item-Account">Give Feedback</button>
    <p id="quota">${source}</p><textarea>${source}</textarea></div>
    <div data-testid="planner-response-text">${source}</div><p id="outside">${source}</p>
    <button id="filter" aria-label="Sort and filter conversations"></button>
    <div role="menu"><span id="archived">Only Archived</span><span id="automations">Only Automations</span></div>`);
  try {
    assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Give Feedback"]').textContent,'提供反馈');
    assert.equal(f.doc.querySelector('[data-testid="settings-nav-item-Account"]').textContent,'Give Feedback');
    assert.equal(f.doc.querySelector('#quota').textContent,'本周配额已使用一部分，将在 3 天 16 小时后完全恢复。');
    assert.equal(f.doc.querySelector('#filter').getAttribute('aria-label'),'对话排序与筛选');
    assert.equal(f.doc.querySelector('#archived').textContent,'仅显示已归档');
    assert.equal(f.doc.querySelector('#automations').textContent,'仅显示自动化');
    for(const q of ['textarea','[data-testid="planner-response-text"]','#outside'])assert.equal(f.doc.querySelector(q).textContent,source);
    f.doc.querySelector('#quota').firstChild.nodeValue='You have used some of your weekly limit, it will fully refresh in 1 hour, 2 minutes.';
    await delay(100);
    assert.equal(f.doc.querySelector('#quota').textContent,'本周配额已使用一部分，将在 1 小时 2 分钟后完全恢复。');
    assert.equal(f.state.errors,0);
  }finally{f.close();}
});
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

test('2.32 轮换问候只翻译首页标题，保留姓名及对话内容', async () => {
  const f = await fixture('<div data-testid="home-greeting"><h1></h1></div><div data-testid="planner-response-text"><h1></h1></div>');
  try {
    const [home, message] = f.doc.querySelectorAll('h1');
    for (const [source, expected] of [
      ['Hey New, what should we build today?', '你好，New，今天想做点什么？'],
      ['Hey there, what should we build today?', '你好，今天想做点什么？'],
      ['Welcome back, Settings. Where should we pick up?', '欢迎回来，Settings。想从哪里继续？'],
      ['Welcome back. Where should we pick up?', '欢迎回来。想从哪里继续？'],
      ["Good to see you, 小林. What's next?", '很高兴见到你，小林。接下来想做什么？'],
      ["Good to see you. What's next?", '很高兴见到你。接下来想做什么？']
    ]) {
      home.textContent = message.textContent = source;
      await delay(60);
      assert.equal(home.textContent, expected);
      assert.equal(message.textContent, source);
    }
  } finally { f.close(); }
});

test('2.32 SSH 弹窗翻译操作，保留主机、配置路径、输入和错误详情', async () => {
  const f = await fixture(`<div data-testid="ssh-connect-dialog">
    <input data-testid="ssh-connect-host-input" value="Settings" aria-label="SSH host" placeholder="user@host:port">
    <button data-testid="ssh-connect-button">Connecting…</button><button data-testid="ssh-config-file-choose">Choose File…</button>
    <button data-testid="ssh-connect-hidden-hosts-toggle">2 hidden hosts</button>
    <div data-testid="ssh-connect-host-option">Settings</div><span data-testid="ssh-config-file-name">Interface Layout</span>
    <div data-testid="ssh-connect-error">New Project</div><p>No hosts in /example/SSH Config yet. Type one above.</p>
    </div><div role="menu"><button data-testid="ssh-host-project-item">SSH Config</button></div>`);
  try {
    const input = f.doc.querySelector('input');
    assert.equal(input.getAttribute('aria-label'), 'SSH 主机');
    assert.equal(input.placeholder, 'user@host:port');
    assert.equal(input.value, 'Settings');
    assert.deepEqual([...f.doc.querySelectorAll('button')].map(b => b.textContent),
      ['正在连接…','选择文件…','已隐藏 2 个主机','SSH Config']);
    for (const [id, expected] of [['ssh-connect-host-option','Settings'],['ssh-config-file-name','Interface Layout'],['ssh-connect-error','New Project']])
      assert.equal(f.doc.querySelector(`[data-testid="${id}"]`).textContent, expected);
    assert.equal(f.doc.querySelector('p').textContent,'/example/SSH Config 中暂无主机。可在上方输入主机地址。');
  } finally { f.close(); }
});
