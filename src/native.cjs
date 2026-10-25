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
// Fixed id/label pairs observed in the 2.26.0 frontend. Positional IDs and
// dynamic project/group/distribution names deliberately stay untouched.
const contextLabels={copy:'Copy',cut:'Cut',paste:'Paste','select-all':'Select All',
  'copy-selection':'Copy','copy-link':'Copy Link','add-folder':'Open Folder',
  'group-new':'New Group','group-remove':'Remove from Group','move-to-group':'Move to Group',
  rename:'Rename',split:'Split',share:'Share',stop:'Stop',archive:'Archive',delete:'Delete'};
function translateContextItem(item) {
  const label=item.label??'';
  return Object.hasOwn(contextLabels,item.id)&&contextLabels[item.id]===label?translate(label):label;
}
module.exports = {translate, localizeMenu,translateContextItem};
