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
    const translated = translate(item.label);
    if (translated !== item.label) {
      item.__agZhSourceLabel = item.label;
      item.label = translated;
    }
    if (item.submenu) localizeMenu(item.submenu);
  }
  return menu;
}
module.exports = {translate, localizeMenu};
