import {workspacePackages} from '/Users/williamcory/smithers/scripts/workspace-packages.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const out=path.join(root,'factory/reports/testing-campaign/packages-local-runner');
fs.mkdirSync(out,{recursive:true});
const priority=['@smthrs/std','@smthrs/memory','@smthrs/registry','@smthrs/integrations','@smthrs/migrate','@smthrs/build','@smthrs/build-cli','@smthrs/targets','@smthrs/cli'];
const packages=workspacePackages().filter(p=>p.dir.startsWith('packages/')&&fs.existsSync(path.join(p.dir,'vitest.config.ts'))&&!['@smthrs/flow','@smthrs/canonical'].includes(p.name)).sort((a,b)=>{
const order=n=>priority.includes(n)?priority.indexOf(n):priority.length;
return order(a.name)-order(b.name)||a.name.localeCompare(b.name);
});
const results=fs.existsSync(path.join(out,'results.json'))?JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8')):[];
for(const p of packages){
if(results.some(r=>r.name===p.name))continue;
const slug=p.name.replace(/[^a-z0-9-]/gi,'_');
const dir=path.join(out,slug); fs.mkdirSync(dir,{recursive:true});
const log=fs.openSync(path.join(dir,'run.log'),'w');
const args=[path.join(root,p.dir,'node_modules/vitest/vitest.mjs'),'run','--maxWorkers=1','--coverage','--coverage.reporter=text','--coverage.reporter=json-summary','--coverage.reportsDirectory='+path.join(dir,'coverage')];
const startedAt=new Date().toISOString();
console.log('START',p.name,startedAt);
const child=spawn(process.execPath,args,{cwd:path.join(root,p.dir),env:{...process.env,PATH:path.join(root,'factory/reports/testing-campaign/toolchain')+path.delimiter+process.env.PATH},stdio:['ignore',log,log],detached:true});
let timedOut=false;
const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM')}catch{};setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},5000).unref()},20*60*1000);
const result=await new Promise(resolve=>{child.once('error',error=>resolve({error:String(error)}));child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});
clearTimeout(timer);fs.closeSync(log);
let total;try{total=JSON.parse(fs.readFileSync(path.join(dir,'coverage/coverage-summary.json'),'utf8')).total}catch{}
const receipt={...p,manifest:undefined,manifestPath:undefined,startedAt,finishedAt:new Date().toISOString(),command:[process.execPath,...args],...result,timedOut,total};
results.push(receipt);fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
console.log('DONE',p.name,JSON.stringify({result,timedOut,total}));
}
console.log('BASELINE_COMPLETE',results.length);
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
