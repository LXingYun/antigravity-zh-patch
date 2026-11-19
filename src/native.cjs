'use strict';
const dictionary = require('./ag-zh-dictionary.json');
function translate(label) {
  if (typeof label !== 'string') return label;
  if (Object.hasOwn(dictionary, label)) return dictionary[label];
  const agents = label.match(/^(\d+) agents? running$/);
  return agents ? `${agents[1]} 个智能体正在运行` : label;
}
function localizeMenu(menu) {
  for (const item of menu?.items || []) {
    // WSL children are user-owned distribution names, even when they match a UI word.
    const originalLabel=item.__agZhSourceLabel || item.label;
    const translated = translate(item.label);
    if (translated !== item.label) {
      item.__agZhSourceLabel = item.label;
      item.label = translated;
    }
    if (item.submenu && originalLabel !== 'Connect to WSL') localizeMenu(item.submenu);
  }
  return menu;
}
// Fixed id/label pairs observed in the 2.26.0 and 2.33.0 frontends. Positional IDs and
// dynamic project/group/distribution names deliberately stay untouched.
const copyMenuLabels = ['Conversation Name', 'Conversation ID', 'Workspace Name', 'Worktree Name', 'Project Name'];
const splitMenuLabels = ['Split Right', 'Split Down', 'Replace with New', 'Remove from Split'];
const contextLabels = {
  copy: 'Copy', cut: 'Cut', paste: 'Paste', 'select-all': 'Select All',
  'copy-selection': 'Copy', 'copy-link': 'Copy Link', 'add-folder': 'Open Folder',
  'group-new': 'New Group', 'group-remove': 'Remove from Group', 'move-to-group': 'Move to Group',
  rename: 'Rename', split: 'Split', share: 'Share', stop: 'Stop', archive: 'Archive',
  delete: ['Delete', 'Delete Permanently'],
  pin: ['Pin', 'Unpin'],
  'mark-read': ['Mark Read', 'Mark Unread'],
  restore: 'Restore',
  fork: 'Fork',
  'view-debug': 'View Debug',
  telemetry: 'Telemetry',
  'copy-0': copyMenuLabels, 'copy-1': copyMenuLabels, 'copy-2': copyMenuLabels, 'copy-3': copyMenuLabels,
  'split-0': splitMenuLabels, 'split-1': splitMenuLabels, 'split-2': splitMenuLabels, 'split-3': splitMenuLabels,
  'link-context-menu-open-in': 'Open In',
  'link-context-menu-open-settings': ['Settings', 'Link Settings'],
  'open-in-builtin-browser': ['Open in Built-in Browser', 'Built-in Browser', 'Built-in Browser (Default)'],
  'open-in-preview': ['Open in Side Panel', 'Side Panel', 'Side Panel (Default)'],
  'open-in-browser': ['Open in External Browser', 'External Browser', 'External Browser (Default)'],
  'open-in-new-tab': ['Open in New Tab', 'New Tab', 'New Tab (Default)']
};
function translateContextItem(item) {
  const label = item.label ?? '';
  if (!Object.hasOwn(contextLabels, item.id)) return label;
  const expected = contextLabels[item.id];
  const matched = Array.isArray(expected) ? expected.includes(label) : expected === label;
  return matched ? translate(label) : label;
}
module.exports = {translate, localizeMenu,translateContextItem};
