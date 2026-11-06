import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const read=(name)=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
function version(program,args){
  const r=spawnSync(program,args,{encoding:'utf8',windowsHide:true});
  return r.status===0?r.stdout.trim():'NOT_FOUND_OR_NOT_RUN';
}
const pkg=read('package.json');
const packages={};
for(const [name,expected] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
  let installed=null;
  try{installed=read('node_modules/'+name+'/package.json').version;}catch{}
  packages[name]={expected,installed,match:installed===expected};
}
let vendor='MISSING';
try{
  const manifest=read('public/vendor/opencv/manifest.json');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(new URL('public/vendor/opencv/'+manifest.file,root))).digest('hex');
  vendor=hash===manifest.sha256?'PASS':'HASH_MISMATCH';
}catch{}
let lockSha256=null;
try{lockSha256=crypto.createHash('sha256').update(fs.readFileSync(new URL('package-lock.json',root))).digest('hex');}catch{}
const report={checkedAt:new Date().toISOString(),os:os.platform(),arch:os.arch(),node:process.version,nodePath:process.execPath,node24:process.versions.node.split('.')[0]==='24',npm:os.platform()==='win32'?version('cmd.exe',['/d','/s','/c','npm.cmd --version']):version('npm',['--version']),git:version('git',['--version']),lockSha256,packages,opencv:vendor,manualChecks:['Open the target browser and run the synthetic-image test.','Camera permission, actual gloves, lighting and latency require a person and real hardware.'],scope:'Read-only environment inventory. No installation or system configuration changes.'};
console.log(JSON.stringify(report,null,2));
