// External acceptance host. The target's real main/renderer/assets execute unchanged;
// the diagnostic runtime is injected from this checkout, not added to the payload.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const target=path.resolve(arg('target',path.join(__dirname,'..')));
const output=path.resolve(arg('output',path.join(__dirname,'../.runtime/unified-'+Date.now())));
assert(!fs.existsSync(path.join(output,'unified-inspection.json')),'Use a fresh evidence directory');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));process.argv.push('--offline');
const record={status:'running',target,startedAt:new Date().toISOString(),scope:'Real application functional review checkpoint; not final performance, long-run memory or audible offline narration acceptance.',method:'External Electron invokes actual target main.js; tests inject only diagnostics and native input. Application-session HTTP/HTTPS/WS/WSS requests are cancelled; the machine network is unchanged. Local system speech is outside Electron network interception.',messages:[],requests:[],screenshots:{},host:{versions:process.versions,executable:process.execPath}};
let started=false,finished=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const timer=setTimeout(()=>finish(new Error('Unified inspection test exceeded three minutes')),180000);
function finish(error){if(finished)return;finished=true;clearTimeout(timer);record.status=error?'failed':'passed';record.finishedAt=new Date().toISOString();if(error)record.error=error.stack||String(error);fs.writeFileSync(path.join(output,'unified-inspection.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({status:record.status,file:path.join(output,'unified-inspection.json'),error:record.error}));app.exit(error?1:0);}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
app.on('browser-window-created',(_e,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>{record.requests.push({url:d.url,type:d.resourceType});cb({cancel:true});});
  win.webContents.on('render-process-gone',(_e,d)=>finish(new Error('Renderer exited: '+JSON.stringify(d))));
  win.webContents.on('console-message',(_e,level,message)=>{record.messages.push({level,message});if(!started&&message==='3D Star Map Explorer initialized successfully'){started=true;run(win).catch(async error=>{try{const file=path.join(output,'failure.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());record.failureScreenshot=file;record.failureState=await win.webContents.executeJavaScript('({inspector:window.galaxyMap?.inspector?.snapshot(),focused:document.activeElement?.id,progress:window.__unifiedProgress,partial:window.__unifiedPartial})');}catch{}finish(error);});}});
});
async function run(win){
  win.show();win.focus();win.webContents.focus();win.setContentSize(1400,900);
  record.targetVersion=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version;
  await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'earth-inspection-runtime.js'),'utf8'));
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'unified-inspection-runtime.js'),'utf8'));
  let done=false,result,problem;
  win.webContents.executeJavaScript('window.__verifyUnifiedInspection()').then(r=>{result=r;done=true;},e=>{problem=e;done=true;});
  while(!done){
    const request=await win.webContents.executeJavaScript('window.__unifiedRequest || null');
    if(request){
      if(request.kind==='input'){for(const event of request.events){win.webContents.sendInputEvent(event);await delay(25);}}
      else if(request.kind==='resize'){assert(request.width>=400&&request.width<=4000&&request.height>=400&&request.height<=4000);win.setContentSize(request.width,request.height);await delay(100);}
      else if(request.kind==='screenshot'){assert.match(request.name,/^[a-z-]+$/);const file=path.join(output,request.name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());record.screenshots[request.name]=file;}
      else if(request.kind==='media'){if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:request.reduce?'reduce':'no-preference'}]});}
      else if(request.kind==='visibility'){
        assert(request.durationMs>=100&&request.durationMs<=1000,'Visibility diagnostic must remain bounded');
        const sample=()=>win.webContents.executeJavaScript('({hidden:document.hidden,visual:window.galaxyMap.inspector.activeTrial?.snapshot(),narration:window.galaxyMap.narration.snapshot()})');
        let hiddenStart,hiddenEnd;
        try{win.hide();await delay(100);hiddenStart=await sample();await delay(request.durationMs);hiddenEnd=await sample();}
        finally{win.show();win.focus();win.webContents.focus();}
        await win.webContents.executeJavaScript('window.__unifiedHostResult='+JSON.stringify({hiddenStart,hiddenEnd}));
      }
      else throw new Error('Unexpected native test request');
      await win.webContents.executeJavaScript('window.__unifiedRequest=null');
    }
    await delay(25);
  }
  if(problem)throw problem;
  record.result=result;
  record.remoteResources=await win.webContents.executeJavaScript("performance.getEntriesByType('resource').filter(e=>/^(https?|wss?):/.test(e.name)).map(e=>e.name)");
  assert.deepEqual(record.requests,[],'App dependencies must stay local');
  assert.deepEqual(record.remoteResources,[],'App must not load remote resources');
  assert.deepEqual(record.messages.filter(m=>m.level>=3),[],'App must not log renderer errors');
  record.finalMemory=app.getAppMetrics();
  if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();
  finish();
}
require(path.join(target,'main.js'));
