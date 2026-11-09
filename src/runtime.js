/** Standalone isolated-world runtime. Bundled into the original preload at build time. */
export function startTranslator(win, dictionary, expectedOrigin, onReady = () => {}) {
  if (win.top !== win || win.location.origin !== expectedOrigin ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(win.location.hostname)) return null;
  if (win.__AG_ZH_STATE__) return win.__AG_ZH_STATE__;
  const doc = win.document;
  const deny = [
    'script', 'style', 'pre', 'code', 'textarea', 'input', 'iframe', 'webview',
    '[contenteditable]:not([contenteditable="false"])', '.monaco-editor', '.xterm',
    '[data-cascade-id]', '[data-project-name]', '[data-project-label]', '[data-model-base]',
    '[data-testid="settings-nav-item-Account"]', '[data-testid="model-selector-trigger"]',
    '[data-testid="project-selector-trigger"]', '[data-testid="file-title-name"]',
    '[data-testid="turn-cards-container"]', '[data-testid="user-input-step"]',
    '[data-testid="planner-response-text"]', '[data-testid="commentable-content"]',
    '[data-testid="artifact-view"]', '[data-testid="terminal-surface"]',
    '[data-testid="doc-row-modal"]', '[data-testid="sidecar-iframe-slot"]',
    '[data-testid="new-sidecar-model"]', '[data-testid="sidecar-model-option"]',
    '[data-testid="pending-user-messages"]', '[data-testid="queued-messages-card"]',
    '[data-testid="side-question-answer"]', '[data-testid="side-question-question"]',
    '[data-testid="sidecar-logs-content"]', '[data-testid="setup-script-output"]',
    '[data-testid="builtin-browser-download-dir-value"]',
    '[data-testid="location-selector-trigger"]', '[data-testid="location-local"]',
    '[data-testid="location-cloud"]', '[data-testid="voice-settings-name"]',
    '[data-testid="voice-settings-mic"]',
    '[data-testid="permission-target-editor"]', '[data-testid="declared-permissions-arg"]',
    '[data-testid="entity-pill"]', '[data-testid="input-attachment"]',
    '[data-testid="project-customizations-content"]', '[data-testid="workspace-customizations-view"]', '[data-testid="customization-card"]', '[data-testid="sidecar-row"]',
    '[data-ag-zh-protect]'
  ].join(',');
  const uiIds = [
    'new-conversation-button', 'history-button', 'automations-button', 'settings-button',
    'app-icon-new-conversation-button', 'sidebar-add-project-button', 'plugins-section-header',
    'agent-input-box', 'input-box-bottom-toolbar', 'permissions-selector-trigger', 'model-selector-panel',
    'model-selector-header', 'model-selector-context-window-option', 'model-selector-effort-option',
    'model-selector-effort-group', 'model-selector-empty', 'project-selector-new-workspace',
    'group-by-submenu-trigger', 'sort-by-submenu-trigger', 'display-submenu-trigger',
    'filter-submenu-trigger', 'app-update-button', 'manual-update-button', 'sidecar-new-button',
    'sidecar-list-empty', 'sidecar-create-with-prompt', 'customizations-empty-state',
    'plugins-tabs', 'plugins-source', 'add-mcp-button', 'permissions-project-options',
    'permissions-use-global-settings', 'idle-status-text', 'send-button', 'voice-start-button',
    'interaction-continue-button', 'interaction-skip-button', 'permission-app-header',
    'permission-details-toggle', 'title-menu-bar', 'settings-disabled-notice',
    'sidebar-toggle', 'sidebar-search-button', 'plugins-create-with-prompt',
    'sort-folders-submenu-trigger', 'new-sidecar-modal', 'new-sidecar-submit',
    'model-selector-context-window-badge', 'model-selector-context-window-tooltip',
    'model-selector-context-window-submenu', 'model-selector-loading',
    'empty-file-open-button', 'open-editor-empty', 'terminal-empty', 'add-mcp-screen'
  ];
  const attributes = ['title', 'aria-label', 'placeholder', 'data-placeholder'];
  const state = { version: '1.0.0', translated: 0, slices: 0, pending: 0, errors: 0, stop };
  win.__AG_ZH_STATE__ = state;
  let stopped = false, scheduled = false, ready = false;
  const pending = new Set();
  const jobs = [];
  const originals = new WeakMap();
  const selfWrites = new WeakSet();
  function translate(text, el) {
    if (typeof text !== 'string') return text;
    const key = text.trim();
    let value = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
    if (el?.matches('[data-testid="home-greeting"] > h1')) {
      if (key === 'What can we get done today?') value = '今天想做点什么？';
      const greeting = key.match(/^Hi (\S+), what can we get done today\?$/);
      if (greeting) value = `你好，${greeting[1]}，今天想做点什么？`;
    }
    // Settings tabs can change before (or without) the URL. Use the rendered heading.
    if (key === 'Plan' && el?.closest('.settings-modal-container') &&
        [...el.closest('.settings-modal-container').querySelectorAll('h2')].some(h =>
          ['Models & Usage',dictionary['Models & Usage']].some(t => t && h.textContent.startsWith(t)))) value = '套餐';
    if (key === 'New' && el?.closest('[data-testid="model-selector-panel"]')) value = '新';
    if (key === 'Project' && el?.tagName === 'LABEL' && el.closest('[data-testid="new-sidecar-modal"]')) value = '项目';
    if (key === '.' && el?.closest('.settings-modal-container')) value = '。';
    if (win.location.pathname === '/history' && el?.closest('.rounded-lg.border.bg-card')) {
      if (key === '(') value = '（';
      if (key === '.') value = '。';
    }
    // Explicit templates preserve numbers; no substring replacement.
    if (value === undefined && /^\d+ agents? running$/.test(key)) value = `${key.split(' ')[0]} 个智能体正在运行`;
    if (value === undefined && el?.closest('.settings-modal-container') && key.startsWith('Send feedback as ')) value = '以 ' + key.slice(17) + ' 的身份发送反馈';
    if (value === undefined && el?.closest('.settings-modal-container')) {
      const weekly=key.match(/^You have used some of your weekly limit, it will fully refresh in (\d+ (?:days?|hours?|minutes?)(?:, \d+ (?:days?|hours?|minutes?))*)\.$/);
      if (weekly) {
        const units={day:'天',hour:'小时',minute:'分钟'};
        const duration=weekly[1].split(', ').map(part=>{
          const [,count,unit]=part.match(/^(\d+) (day|hour|minute)s?$/);
          return `${count} ${units[unit]}`;
        }).join(' ');
        value=`本周配额已使用一部分，将在 ${duration}后完全恢复。`;
      }
    }
    if (value === undefined && el?.closest('[data-testid="customizations-empty-state"]')) {
      const empty = key.match(/^No plugins found for "(.*)"\.$/);
      const search = key.match(/^Search for "(.*)" in the Marketplace$/);
      if (empty) value = `未找到与“${empty[1]}”匹配的插件。`;
      if (search) value = `在插件市场中搜索“${search[1]}”`;
    }
    if (value === undefined && el?.closest('[data-testid="add-mcp-screen"]')) {
      const result=key.match(/^No MCP servers found for "(.*)"$/);
      if (result) value=`未找到与“${result[1]}”匹配的 MCP 服务器`;
    }
    if (value === undefined || value === key) return text;
    return text.slice(0, text.indexOf(key)) + value + text.slice(text.indexOf(key) + key.length);
  }
  const deniedTags = new Set(['SCRIPT','STYLE','PRE','CODE','TEXTAREA','INPUT','IFRAME','WEBVIEW']);
  const deniedIds = new Set([...deny.matchAll(/\[data-testid="([^"]+)"\]/g)].map(m=>m[1]));
  const uiIdSet = new Set(uiIds);
  const roles = new Set(['dialog','alertdialog','menu','menuitem','menuitemradio','option','tooltip','alert']);
  const settingsNav = new Set(['General','App','Application','Appearance','Notifications','Models','Conversations','Shortcuts','Provide Feedback','Give Feedback','Projects','Workspaces']);
  // These wrappers mix app chrome with user-owned names. They remain blocked by
  // default; only the exact badges, headings and attributes below may be translated.
  const mixedIds = new Set(['model-selector-trigger','project-selector-trigger',
    'project-customizations-content','workspace-customizations-view','customization-card','sidecar-row',
    'location-selector-trigger','location-local','location-cloud','voice-settings-name','voice-settings-mic']);
  const chromeAttributes = new Set(['Display Options','More Actions','Go Back','Go Forward',
    'Toggle Sidebar','Toggle sidebar','Toggle Sidebar, conversations need attention',
    'Search Conversations','Sort and filter conversations','Typeahead menu','Sidebar','Notifications','Copy path','Copy Path',
    'Copy Config File Path','Copied','Path copied!','Clear search',
    'Customizations views','Customizations source','Create plugin','Dismiss error',
    'Actions','Add automation','Select model','Context window','Search customizations...',
    'Search MCP servers by name','Previous card','Next card','Announcements and tips',
    'Toggle Side Panel','Toggle Terminal Panel','Start Voice mode','End Voice mode','Voice volume','Voice speed']);
  const historyText = new Set(['This page is going away soon','Search conversations with',
    'in the top left.','View archived in the sidebar','menu)']);
  const emptyConversations = new Set(['No conversations yet','No conversations found',
    'No pinned conversations','Drop to add to group']);
  const customizationText = new Set(['No custom agents yet.','No skills or rules yet.',
    'No skills or rules match this filter.','No MCP servers yet. Use Add to browse the store.',
    'Loading available plugins...','Loading installed plugins...','Loading workspace customizations...',
    'Loading token usage...','No token data available.','There are no customizations enabled.',
    'The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.']);
  function extraTextAllowed(node, el) {
    const old = originals.get(node);
    const key = (old && node.nodeValue === old.translated ? old.source : node.nodeValue).trim();
    if (key === 'Not set' && el.matches('[data-testid="voice-settings-name"]')) return true;
    if (key === 'System default' && el.closest('[data-testid="voice-settings-mic"]')) return true;
    if (key === 'This Computer' && el.matches('span.truncate') &&
        el.closest('[data-testid="location-local"],[data-testid="location-selector-trigger"]')) return true;
    if (key === 'Remote' && el.closest('[data-testid="location-selector-trigger"]')) return true;
    if (['Remote','Runs in a cloud environment','Clones this repo in a cloud environment'].includes(key) &&
        el.closest('[data-testid="location-cloud"][data-env-id="default"]')) return true;
    if (win.location.pathname === '/history' && historyText.has(key) && el.tagName === 'SPAN') return true;
    if (win.location.pathname === '/history' && ['(','.'].includes(key) && el.closest('.rounded-lg.border.bg-card')) return true;
    if (emptyConversations.has(key) && el.matches('.select-none.text-muted-foreground,span.select-none.opacity-30')) return true;
    if (customizationText.has(key) &&
        (win.location.pathname.startsWith('/customizations') || el.closest('[data-testid="project-customizations-content"]')) &&
        el.matches('p.text-muted-foreground,div.text-muted-foreground,span[role="status"]')) return true;
    if (['Skills','Rules','Plugins','Custom Agents'].includes(key) && el.tagName === 'H3' &&
        el.closest('[data-testid="workspace-customizations-view"]')) return true;
    // 2.25.0 model notices are separate rounded badges, never the model name span.
    if (['Notice','New','Leaving Soon','Leaving soon','Unavailable'].includes(key) &&
        el.closest('[data-testid="model-selector-item"]') && el.closest('div.bg-secondary.rounded-full')) return true;
    if (['Built In','Global','Workspace'].includes(key) && el.matches('span[aria-label].rounded-full.font-normal')) return true;
    if (key === 'Global' && el.matches('span.rounded.shrink-0.text-blue-400') &&
        el.closest('[data-testid="workspace-customizations-view"]')) return true;
    return false;
  }
  function chromeAttribute(el, attr, source) {
    if (!['aria-label','title','placeholder'].includes(attr)) return source;
    const id = el.getAttribute('data-testid');
    if (attr === 'aria-label') {
      const locationPrefix = 'Where the agent runs, current: ';
      if (id === 'location-selector-trigger' && source.startsWith(locationPrefix)) {
        const location = source.slice(locationPrefix.length);
        const name = ['This Computer','Remote'].includes(location) ? dictionary[location] : location;
        return '智能体运行位置，当前：' + name;
      }
      if (el.tagName === 'BUTTON' && win.location.pathname.startsWith('/customizations') && source.startsWith('More actions for ')) return source.slice(17) + ' 的更多操作';
      if (id === 'model-selector-trigger' && source.startsWith('Select model, current: ')) return '选择模型，当前：' + source.slice(23);
      if (id === 'project-selector-trigger' && source.startsWith('Select project, current: ')) {
        const name=source.slice(25);
        return '选择项目，当前：' + (name === 'No Project' && !el.querySelector('[data-project-icon]') ? '无项目' : name);
      }
      if (id === 'permissions-selector-trigger' && source.startsWith('Agent permissions preset selector, current: ')) {
        const preset=source.slice(44);return '权限预设，当前：' + (dictionary[preset] || preset);
      }
    }
    if (chromeAttributes.has(source) ||
        (el.matches('input,textarea') && (['customizations-search','new-sidecar-name','new-sidecar-prompt','fastpick-input'].includes(id) || el.closest('[data-testid="sidecars-view"],[data-testid="new-sidecar-modal"],[data-testid="add-mcp-screen"]'))) ||
        (el.matches('span[aria-label].rounded-full.font-normal') && ['Built In','Global','Workspace'].includes(source))) return translate(source,el);
    return source;
  }
  let scopeCache = new WeakMap();
  function scope(el) {
    if (!el || el.nodeType !== 1) return {blocked:false,allowed:false,hardBlocked:false};
    if (scopeCache.has(el)) return scopeCache.get(el);
    const parent = scope(el.parentElement);
    const id = el.getAttribute('data-testid') || '';
    const customEnvironment = id.startsWith('location-cloud-') && el.hasAttribute('data-env-id');
    const staticNoProject = id === 'project-selector-trigger' && !el.querySelector('[data-project-icon]') && ['Select project, current: No Project','选择项目，当前：无项目'].includes(el.getAttribute('aria-label'));
    const ownBlock = customEnvironment || deniedTags.has(el.tagName) || (deniedIds.has(id) && !staticNoProject) ||
      ['data-cascade-id','data-project-name','data-project-label','data-model-base','data-model-label','data-ag-zh-protect'].some(a=>el.hasAttribute(a)) ||
      (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') ||
      el.classList.contains('monaco-editor') || el.classList.contains('xterm') ||
      (id.startsWith('settings-nav-item-') && !settingsNav.has(id.slice(18)));
    const result = { blocked: parent.blocked || ownBlock,
      hardBlocked: parent.hardBlocked || customEnvironment || deniedTags.has(el.tagName) ||
        (deniedIds.has(id) && !mixedIds.has(id)) ||
        ['data-cascade-id','data-project-name','data-project-label','data-model-base','data-ag-zh-protect'].some(a=>el.hasAttribute(a)) ||
        (el.hasAttribute('data-model-label') && id !== 'model-selector-item') ||
        (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') ||
        el.classList.contains('monaco-editor') || el.classList.contains('xterm') ||
        (id.startsWith('settings-nav-item-') && !settingsNav.has(id.slice(18))),
      allowed: parent.allowed || staticNoProject || uiIdSet.has(id) || roles.has(el.getAttribute('role')) ||
        el.classList.contains('settings-modal-container') || ['H1','H2','H3'].includes(el.tagName) ||
        (el.tagName === 'A' && el.getAttribute('href') === '/customizations') };
    scopeCache.set(el,result);
    return result;
  }
  function handle(node) {
    if (!node.isConnected) return;
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (!el || el.nodeType !== 1) return;
    const classification = scope(el);
    const protectedNode = classification.blocked;
    if (node.nodeType === 3) {
      if ((protectedNode || !classification.allowed) && (classification.hardBlocked || !extraTextAllowed(node,el))) {
        const old = originals.get(node);
        if (old && node.nodeValue === old.translated) node.nodeValue = old.source;
        originals.delete(node);
        return;
      }
      // React can split a fixed sentence into adjacent text nodes. Translate the whole
      // known sentence while retaining every node and its original source for later updates.
      const siblings = Array.from(el.childNodes);
      if (siblings.length > 1 && siblings.every(n => n.nodeType === 3)) {
        const sources = siblings.map(n => {const old=originals.get(n);return old && n.nodeValue===old.translated ? old.source : n.nodeValue;});
        const source = sources.join('');
        const translated = translate(source, el);
        if (translated !== source) {
          siblings.forEach((n,i)=>{const output=i===0?translated:'';if(n.nodeValue!==output){originals.set(n,{source:sources[i],translated:output,compound:true});selfWrites.add(n);n.nodeValue=output;state.translated++;}});
          return;
        }
        // A dynamic slot can make a previously known sentence unknown. Restore the
        // original segments rather than leaving a stale translation around that slot.
        siblings.forEach((n,i)=>{if(originals.get(n)?.compound){n.nodeValue=sources[i];originals.delete(n);}});
        return;
      }
      const old = originals.get(node);
      const source = old && node.nodeValue === old.translated ? old.source : node.nodeValue;
      const translated = translate(source, el);
      if (node.nodeValue !== translated) {
        originals.set(node, { source, translated });
        selfWrites.add(node);
        node.nodeValue = translated;
        state.translated++;
      }
    } else {
      // Translate selected attributes without ever unblocking a model/project label.
      const parentScope = scope(el.parentElement);
      const editable = el.matches('input,textarea,[contenteditable]');
      if (!classification.hardBlocked || (editable && !parentScope.hardBlocked && el.getAttribute('contenteditable') !== 'true')) {
        for (const attr of attributes) {
          const source = el.getAttribute(attr);
          if (source === null) continue;
          const translated = chromeAttribute(el,attr,source);
          if (translated !== source) {el.setAttribute(attr,translated);state.translated++;}
        }
      }
      // Inputs' values are never touched. Only named chrome inputs get translated placeholders.
      const chromeInput = el.matches('input,textarea,[contenteditable]') &&
        !parentScope.hardBlocked &&
        (el.closest('.settings-modal-container, [data-testid="agent-input-box"]') ||
         el.matches('[data-testid="history-search-input"], [data-testid="project-selector-search"]'));
      if ((!protectedNode && classification.allowed) || chromeInput) {
        for (const attr of attributes) {
          const source = el.getAttribute(attr);
          if (source === null) continue;
          const translated = translate(source, el);
          if (source !== translated) { el.setAttribute(attr, translated); state.translated++; }
        }
      }
    }
  }
  function enqueue(node) {
    if (stopped || !node || !node.isConnected || pending.has(node)) return;
    pending.add(node);
    if (!scheduled) { scheduled = true; win.requestAnimationFrame(flush); }
  }
  function flush() {
    scheduled = false;
    if (stopped) return;
    const start = win.performance.now();
    scopeCache = new WeakMap();
    state.slices++;
    while ((jobs.length || pending.size) && win.performance.now() - start < 4) {
      if (!jobs.length) {
        const node = pending.values().next().value;
        pending.delete(node);
        // Detached nodes can be discarded without traversing their subtree.
        if (!node.isConnected) continue;
        jobs.push({ root: node, first: true, walker: doc.createTreeWalker(node, 1 | 4) });
      }
      const job = jobs[jobs.length - 1];
      const node = job.first ? (job.first = false, job.root) : job.walker.nextNode();
      if (!node) { jobs.pop(); continue; }
      try { handle(node); } catch { state.errors++; }
    }
    state.pending = pending.size + jobs.length;
    if (state.pending) { scheduled = true; win.requestAnimationFrame(flush); }
    else if (!ready && state.translated > 0) { ready = true; onReady({version: state.version, translated: state.translated}); }
  }
  const observer = new win.MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData' && selfWrites.has(r.target)) {
        selfWrites.delete(r.target);
        if (r.target.nodeValue === originals.get(r.target)?.translated) continue;
      }
      if (r.type === 'childList') r.addedNodes.forEach(enqueue);
      else enqueue(r.target);
    }
  });
  function start() {
    if (stopped) return;
    observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: [...attributes, 'class','role','contenteditable','data-testid','data-cascade-id','data-project-name','data-project-label','data-model-label'] });
    enqueue(doc.documentElement);
  }
  function stop() { stopped = true; observer.disconnect(); pending.clear(); jobs.length = 0; state.pending = 0; }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once:true}); else start();
  win.addEventListener('pagehide', stop, {once:true});
  return state;
}
