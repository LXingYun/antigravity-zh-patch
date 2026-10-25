import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { exists, treeManifest, shaFile } from '../platform.js';

// Paths are data in an environment variable, never interpolated into PowerShell code.
export function powershell(script, input={}) {
  // A caller running PowerShell 7 may otherwise leak its incompatible PSModulePath into Windows PowerShell 5.1.
  const prefix = "$ErrorActionPreference='Stop'; $env:PSModulePath=Join-Path $PSHOME 'Modules'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $data=$env:AG_ZH_INPUT|ConvertFrom-Json; function LongPath([string]$p) { if($p.StartsWith('\\\\?\\')){return $p}; $p=[IO.Path]::GetFullPath($p); if($p.StartsWith('\\\\')){return '\\\\?\\UNC\\'+$p.Substring(2)}; return '\\\\?\\'+$p }; ";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',prefix+script],{
    encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,
    env:{...process.env,AG_ZH_INPUT:JSON.stringify(input)},stdio:['ignore','pipe','pipe']
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Windows 检查失败：'+result.stderr.trim());
  return result.stdout.trim();
}
export const normalizeApp = app => path.resolve(app).replace(/[\\/]+$/,'').toLowerCase();
export const layout = {archive:'resources/app.asar',marker:'resources/ag-zh-patch.json'};
export const stateRoot = path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Antigravity zh-CN');
export function discoverApp() {
  const candidates=JSON.parse(powershell(`
    $items=@(); $default=Join-Path $env:LOCALAPPDATA 'Programs\\antigravity';
    if(Test-Path -LiteralPath (Join-Path $default 'Antigravity.exe')){$items+=$default}
    foreach($key in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')) {
      Get-ItemProperty -Path $key -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match '^Antigravity( \\d|$)'} | ForEach-Object {
        if($_.DisplayIcon){$exe=($_.DisplayIcon -replace ',\\d+$','').Trim('"');if(Test-Path -LiteralPath $exe){$items+=Split-Path -LiteralPath $exe}}
      }
    }
    ConvertTo-Json -InputObject @($items|Sort-Object -Unique) -Compress
  `));
  const unique=[...new Map(candidates.map(p=>[normalizeApp(p),p])).values()];
  if(unique.length>1)throw Error('发现多个 Antigravity 安装，请用 --app 明确指定：'+unique.join(', '));
  return unique[0]||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Programs/antigravity');
}
export function executableInfo(app) {
  return JSON.parse(powershell(`
    $exe=Join-Path $data.app 'Antigravity.exe';$v=(Get-Item -LiteralPath $exe).VersionInfo;
    $s=Get-AuthenticodeSignature -LiteralPath $exe;
    [pscustomobject]@{version=$v.FileVersion;product=$v.ProductName;signature=$s.Status.ToString();signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress
  `,{app}));
}
export function readPe(bytes) {
  if(bytes.length<64||bytes.toString('ascii',0,2)!=='MZ')throw Error('无效 PE 文件');
  const offset=bytes.readUInt32LE(0x3c);
  if(offset+26>bytes.length||bytes.toString('ascii',offset,offset+4)!=='PE\0\0')throw Error('无效 PE 头');
  return {machine:bytes.readUInt16LE(offset+4)};
}
export function readFuses(bytes) {
  const sentinel=Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const start=bytes.indexOf(sentinel);
  if(start<0||bytes.indexOf(sentinel,start+1)!==-1||start+34>bytes.length)throw Error('Electron fuse wire 缺失或不唯一');
  const version=bytes[start+32],count=bytes[start+33];
  if(version!==1||count!==9||start+34+count>bytes.length)throw Error('未知 Electron fuse schema');
  const values=bytes.subarray(start+34,start+34+count).toString('ascii');
  if(!/^[01]{9}$/.test(values))throw Error('异常 Electron fuse 状态');
  return {version,count,values};
}
export async function assertPlainTree(app) {
  // Check ancestors too: an install root reached through a junction is not a separate trusted installation.
  powershell(`
    $cursor=Get-Item -LiteralPath (LongPath $data.app) -Force;
    while($null -ne $cursor){if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '安装路径包含 reparse point'};$cursor=$cursor.Parent}
    $links=@(Get-ChildItem -LiteralPath (LongPath $data.app) -Recurse -Force -Attributes ReparsePoint);
    if($links.Count){throw '安装目录包含 reparse point'}
  `,{app});
}
export function processes(app) {
  const rows=JSON.parse(powershell(`
    $root=[IO.Path]::GetFullPath($data.app).TrimEnd('\\')+'\\';
    $all=@(Get-CimInstance Win32_Process);
    $unreadable=@($all|Where-Object {$_.Name -eq 'Antigravity.exe' -and !$_.ExecutablePath});
    if($unreadable.Count){throw '无法确认 Antigravity 进程路径，请正常退出或使用同一用户运行'}
    $owned=@($all|Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)});
    $ids=@($owned.ProcessId); do {$previous=$ids.Count;$ids+=@($all|Where-Object {$_.ParentProcessId -in $ids}|ForEach-Object {$_.ProcessId});$ids=@($ids|Sort-Object -Unique)}while($ids.Count -gt $previous);
    ConvertTo-Json -InputObject @($all|Where-Object {$_.ProcessId -in $ids}|ForEach-Object {[pscustomobject]@{pid=$_.ProcessId;parentPid=$_.ParentProcessId;path=$_.ExecutablePath;created=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress
  `,{app}));
  return rows;
}
export function requireStopped(app) {
  if(processes(app).length)throw Error('请先正常退出 Antigravity，再运行此命令。工具不会强制结束你的任务。');
}
export function metadata(root) {
  const result=JSON.parse(powershell(`
    $root=(LongPath $data.root).TrimEnd('\\');$result=@{};
    foreach($file in @(Get-Item -LiteralPath $root -Force)+@(Get-ChildItem -LiteralPath $root -Recurse -Force)) {
      if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '不支持 reparse point'}
      $relative=$file.FullName.Substring($root.Length).TrimStart('\\').Replace('\\','/');
      $acl=Get-Acl -LiteralPath $file.FullName;
      $sddl=$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access);
      # Set-Acl can add the AI bookkeeping bit. Preserve/compare actual ACEs and protection, not that historical bit.
      $sddl=$sddl -replace '^D:([A-Z]*)',('D:'+$(if($acl.AreAccessRulesProtected){'P'}else{''}));
      $result[$relative]=@{attributes=[int]$file.Attributes;dacl=$sddl};
    };ConvertTo-Json -InputObject $result -Depth 5 -Compress
  `,{root}));
  // Windows may reorder allow-only ACEs while applying inheritance. Their
  // order cannot affect access; keep every flag/SID/right, and never reorder
  // an ACL containing a deny or a conditional/object-specific ACE.
  for(const entry of Object.values(result)) {
    if(/^D:P?(?:\(A;[^()]*\))+$/.test(entry.dacl)) {
      const start=entry.dacl.indexOf('(');
      entry.dacl=entry.dacl.slice(0,start)+entry.dacl.match(/\(A;[^()]*\)/g).sort().join('');
    }
  }
  return result;
}
export async function manifest(app) {
  const content=await treeManifest(app),security=metadata(app),result={};
  // Include the root DACL as well as every child. POSIX modes are not Windows ACLs.
  result['.']={directory:true,attributes:security[''].attributes,dacl:security[''].dacl};
  for(const key of Object.keys(content).sort()) {
    const {mode,...entry}=content[key];
    result[key]={...entry,attributes:security[key].attributes,dacl:security[key].dacl};
  }
  return result;
}
export async function verifyManifest(app,expected) {
  const actual=await manifest(app);
  for(const key of new Set([...Object.keys(expected),...Object.keys(actual)]))
    if(JSON.stringify(actual[key])!==JSON.stringify(expected[key]))throw Error('完整应用校验失败：'+key);
}
export function preserveMetadata(from,to) {
  powershell(`
    $from=LongPath $data.from;$to=LongPath $data.to;
    $item=Get-Item -LiteralPath $from -Force;
    Set-Acl -LiteralPath $to -AclObject (Get-Acl -LiteralPath $from);
    [IO.File]::SetAttributes($to,$item.Attributes)
  `,{from,to});
}
export async function copyApp(from,to,{isolateParent=false}={}) {
  if(await exists(to))throw Error('目标已存在，拒绝覆盖：'+to);
  await assertPlainTree(from);
  if(isolateParent) {
    // Only caller-owned, empty staging containers may have their ACL adjusted.
    // Mirror the source parent so an unprotected copied root inherits the same
    // ACEs; protecting this container keeps its own parent's unrelated ACEs out.
    const parent=path.dirname(to);
    await fs.mkdir(parent,{recursive:true});await assertPlainTree(parent);
    if((await fs.readdir(parent)).length)throw Error('备份暂存容器必须为空');
    powershell(`
      $acl=Get-Acl -LiteralPath (LongPath $data.sourceParent);
      $acl.SetAccessRuleProtection($true,$true);
      Set-Acl -LiteralPath (LongPath $data.parent) -AclObject $acl;
    `,{sourceParent:path.dirname(from),parent});
  }
  await fs.cp(from,to,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
  powershell(`
    $source=(LongPath $data.from).TrimEnd('\\');$target=LongPath $data.to;
    foreach($file in @(Get-Item -LiteralPath $source -Force)+@(Get-ChildItem -LiteralPath $source -Recurse -Force)) {
      $relative=$file.FullName.Substring($source.Length).TrimStart('\\');$dest=if($relative){$target+'\\'+$relative}else{$target};
      Set-Acl -LiteralPath $dest -AclObject (Get-Acl -LiteralPath $file.FullName);
      [IO.File]::SetAttributes($dest,$file.Attributes)
    }
  `,{from,to});
}
export async function verifyDistribution(app,adapter,{patched=false}={}) {
  for(const [rel,expected] of Object.entries(adapter.distribution)) {
    if(patched&&rel===layout.archive)continue;
    if(await shaFile(path.join(app,rel))!==expected)throw Error('官方分发文件指纹不匹配：'+rel);
  }
  const tree=await treeManifest(app);
  for(const [rel,entry] of Object.entries(tree)) {
    if(entry.link)throw Error('分发文件不能是链接：'+rel);
    if(entry.directory)continue;
    if(rel===layout.marker&&patched)continue;
    if(!(rel in adapter.distribution)) {
      if(!adapter.optionalFiles?.[rel]||entry.sha256!==adapter.optionalFiles[rel])throw Error('发现未知或更改的安装文件：'+rel);
    }
  }
}
export async function launch(app) {
  const child=spawn(path.join(app,'Antigravity.exe'),[],{cwd:app,detached:true,stdio:'ignore',windowsHide:false});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();return child.pid;
}
