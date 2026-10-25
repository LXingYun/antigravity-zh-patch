import fs from 'node:fs';
const names=['adapter-2.25.0.json','adapter-2.26.0-win32-x64.json'];
const adapters=names.map(name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8')));
export function selectAdapter(platform,arch,version) {
  const adapter=adapters.find(a=>a.platform===platform&&a.arch===arch&&a.version===version);
  if(!adapter)throw Error(`不支持 ${platform}/${arch} ${version}，拒绝使用旧补丁覆盖。`);
  return adapter;
}
