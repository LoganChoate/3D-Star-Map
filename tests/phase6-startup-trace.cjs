// Diagnostic comparison of startup stages for any actual app source/app.asar.
// This observer is not an acceptance run and does not alter production files.
const {app,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const target=path.resolve(arg('target',path.join(__dirname,'..'))),output=path.resolve(arg('output',path.join(__dirname,'../.runtime/startup-trace-'+Date.now())));
assert(!fs.existsSync(path.join(output,'startup-trace.json')),'Use a fresh output directory');fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));process.argv.push('--offline');
const result={status:'running',target,startedAt:new Date().toISOString(),scope:'Startup causality observer, not a replacement acceptance measurement. Wrappers add diagnostic overhead. Same actual main, data and modules; session preload only.',messages:[],requests:[],host:{versions:process.versions,executable:process.execPath}};
let begin,finished=false,started=false;
const timer=setTimeout(()=>finish(Error('Startup observer exceeded forty-five seconds')),45000);
function finish(error){if(finished)return;finished=true;clearTimeout(timer);result.status=error?'failed':'passed';if(error)result.error=error.stack||String(error);result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'startup-trace.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,file:path.join(output,'startup-trace.json'),startup:result.startup,error:result.error}));app.exit(error?1:0);}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
// Registered before production main's app.whenReady callback creates its window.
app.whenReady().then(()=>{const existing=session.defaultSession.getPreloads();session.defaultSession.setPreloads([...existing,path.join(__dirname,'phase6-startup-preload.cjs')]);});
app.on('browser-window-created',(_event,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>{result.requests.push(d.url);cb({cancel:true});});
  win.webContents.on('preload-error',(_e,file,error)=>finish(Error('Observer preload failed '+file+': '+String(error))));
  win.webContents.on('render-process-gone',(_e,detail)=>finish(Error('Renderer exited '+JSON.stringify(detail))));
  win.webContents.on('console-message',(_e,level,message)=>{
    result.messages.push({atHostMs:performance.now()-begin,level,message});
    if(message==='3D Star Map Explorer initialized successfully'&&!started){started=true;result.startup={productionInitializedMs:performance.now()-begin};run(win).catch(finish);}
  });
});
async function run(win){
  win.show();win.focus();win.webContents.focus();
  await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const r=window.galaxyMap.renderer,original=r.render;let count=0;const timer=setTimeout(()=>{r.render=original;reject(Error('No two actual atlas renders'));},5000);r.render=function(...args){const value=original.apply(this,args);if(++count===2){clearTimeout(timer);r.render=original;resolve(true);}return value;};})`);
  result.startup.readyAndTwoRenderedFramesMs=performance.now()-begin;
  result.targetVersion=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version;
  result.trace=await win.webContents.executeJavaScript('window.__phase6StartupTrace?.finish()');
  assert(result.trace,'Startup observer did not install');assert.equal(result.trace.hooks['speech.getVoices'],'installed','Native getVoices hook is required for this diagnosis');
  result.state=await win.webContents.executeJavaScript('({viewport:{width:innerWidth,height:innerHeight},hidden:document.hidden,focused:document.hasFocus(),voicesKnown:window.galaxyMap.narration?.snapshot().voices.length??null})');
  const speech=result.trace.calls.filter(c=>c.kind.startsWith('speech.'));
  result.speechSummary={calls:speech,totalSynchronousMs:speech.reduce((sum,c)=>sum+c.duration,0),maxSynchronousMs:Math.max(0,...speech.map(c=>c.duration)),note:'Getter and getVoices timings can nest; totals are diagnostic, not an additive critical-path attribution.'};
  result.largestCalls=result.trace.calls.slice().sort((a,b)=>b.duration-a.duration).slice(0,15);finish();
}
begin=performance.now();require(path.join(target,'main.js'));
