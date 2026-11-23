const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const target=path.resolve(arg('target',path.join(__dirname,'..'))),output=path.resolve(arg('output',path.join(__dirname,'../.runtime/inertia-'+Date.now())));
assert(!fs.existsSync(path.join(output,'inspection-inertia.json')),'Use a fresh evidence directory');fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));process.argv.push('--offline');
const record={status:'running',target,startedAt:new Date().toISOString(),scope:'Focused native drag / inspection / resume regression using actual application and OrbitControls. No mock camera or forced garbage collection.',requests:[],messages:[]};
let started=false,finished=false;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timer=setTimeout(()=>finish(Error('Inertia diagnostic exceeded 60 seconds')),60000);
function finish(error){if(finished)return;finished=true;clearTimeout(timer);record.status=error?'failed':'passed';record.finishedAt=new Date().toISOString();if(error)record.error=error.stack||String(error);fs.writeFileSync(path.join(output,'inspection-inertia.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({status:record.status,output,error:record.error}));app.exit(error?1:0);}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
app.on('browser-window-created',(_event,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,cb)=>{record.requests.push(d.url);cb({cancel:true});});
  win.webContents.on('console-message',(_e,level,message)=>{record.messages.push({level,message});if(!started&&message==='3D Star Map Explorer initialized successfully'){started=true;run(win).catch(finish);}});
  win.webContents.on('render-process-gone',(_e,d)=>finish(Error('Renderer exited: '+JSON.stringify(d))));
});
async function run(win){
  win.show();win.focus();win.webContents.focus();win.setContentSize(1400,900);
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'inspection-inertia-runtime.js'),'utf8'));
  let done=false,result,error;win.webContents.executeJavaScript('window.__verifyInspectionInertia()').then(r=>{result=r;done=true;},e=>{error=e;done=true;});
  while(!done){const request=await win.webContents.executeJavaScript('window.__inertiaRequest||null');if(request){assert.equal(request.kind,'drag-and-open');for(const event of request.events){win.webContents.sendInputEvent(event);await delay(5);}await win.webContents.executeJavaScript('window.__inertiaOpenAfterDrag()');await win.webContents.executeJavaScript('window.__inertiaRequest=null');}await delay(10);}
  record.result=result||await win.webContents.executeJavaScript('window.__inertiaRecords');
  fs.writeFileSync(path.join(output,'final.png'),(await win.webContents.capturePage()).toPNG());
  assert.deepEqual(record.requests,[]);if(error)throw error;assert.deepEqual(record.messages.filter(m=>m.level>=3),[]);finish();
}
require(path.join(target,'main.js'));
