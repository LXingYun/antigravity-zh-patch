#!/usr/bin/env node
import path from 'node:path';
import { defaultApp, install, restore, status } from './installer.js';
const args=process.argv.slice(2), command=args.shift()||'check';
let app=defaultApp,launch=true;
try {
  while(args.length) {
    const arg=args.shift();
    if(arg==='--app') {if(!args[0])throw Error('--app 缺少路径');app=path.resolve(args.shift());}
    else if(arg==='--no-launch')launch=false;
    else throw Error('未知参数：'+arg);
  }
  let result;
  if(command==='install')result=await install(app,{launch});
  else if(command==='restore')result=await restore(app);
  else if(['status','check'].includes(command))result=await status(app);
  else throw Error('用法：node src/cli.js [check|install|status|restore] [--app 路径] [--no-launch]');
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  console.error('未完成：'+error.message);
  if(error.stderr)console.error(String(error.stderr).trim());
  process.exitCode=1;
}
