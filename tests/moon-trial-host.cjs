// Diagnostic host for the real app and Moon GLB; no substituted scene or loader.
// Usage: electron tests/moon-trial-host.cjs [--target=source-or-app.asar]
//   [--output=unique-evidence-directory]
const {app}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const argument=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const target=path.resolve(argument('target',path.join(__dirname,'..')));
const output=path.resolve(argument('output',path.join(__dirname,'../.runtime/phase6',`moon-${runId}`)));
assert.ok(!fs.existsSync(path.join(output,'moon-trial.json')),'Use a fresh evidence directory');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
if(!process.argv.includes('--offline'))process.argv.push('--offline');
const evidence={
    schemaVersion:1,runId,status:'running',target,startedAt:new Date().toISOString(),
    scope:'Diagnostic Electron invokes the actual target main.js and actual local Moon GLB, with native input, source catalog checks, WebGL pixels and disposal checks. This does not establish installed-launch behavior or a performance budget.',
    network:'Application session offline emulation and cancellation of HTTP/HTTPS/WS/WSS requests; machine network remains unchanged.',
    host:{executable:process.execPath,versions:process.versions,isPackaged:app.isPackaged},
    messages:[],cancelledNetworkRequests:[],screenshots:{},checks:{}
};
let finished=false,testing=false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const finish=error=>{
    if(finished)return;
    finished=true;clearTimeout(timeout);
    evidence.status=error?'failed':'passed';evidence.finishedAt=new Date().toISOString();
    if(error)evidence.error=error.stack||String(error);
    fs.writeFileSync(path.join(output,'moon-trial.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({status:evidence.status,file:path.join(output,'moon-trial.json'),error:evidence.error}));
    app.exit(error?1:0);
};
const timeout=setTimeout(()=>finish(new Error('Moon trial exceeded 120 seconds')),120000);
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
app.on('browser-window-created',(_event,win)=>{
    win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{
        evidence.cancelledNetworkRequests.push({url:details.url,resourceType:details.resourceType});callback({cancel:true});
    });
    win.webContents.on('render-process-gone',(_event,details)=>finish(new Error(`Renderer exited: ${JSON.stringify(details)}`)));
    win.webContents.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)finish(new Error(`Main document failed: ${code} ${description} ${url}`));});
    win.webContents.on('console-message',(_event,level,message,line,source)=>{
        evidence.messages.push({level,message,line,source});
        if(message==='3D Star Map Explorer initialized successfully'&&!testing){
            testing=true;
            run(win).catch(async error=>{
                try{
                    const file=path.join(output,'moon-trial-failure.png');
                    fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());
                    evidence.failureScreenshot=file;
                    evidence.failureState=await win.webContents.executeJavaScript('({trial:window.galaxyMap?.moonTrial?.snapshot(),message:document.getElementById("moon-trial-message")?.textContent})');
                }catch{}
                finish(error);
            });
        }
    });
});
async function run(win){
    win.show();win.focus();win.webContents.focus();
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
    let done=false,result,problem;
    const runtime=win.webContents.executeJavaScript("import('./tests/moon-trial-runtime.js').then(module=>module.verifyMoonAssetTrial({nativeBridge:true}))");
    runtime.then(value=>{result=value;done=true;},error=>{problem=error;done=true;});
    while(!done){
        const request=await win.webContents.executeJavaScript('window.__explorationVerification || null');
        if(request){
            if(request.kind==='input'){
                for(const event of request.events){win.webContents.sendInputEvent(event);await pause(30);}
            }else if(request.kind==='resize'){
                assert.ok(Number.isInteger(request.width)&&request.width>=400&&request.width<=4000);
                assert.ok(Number.isInteger(request.height)&&request.height>=400&&request.height<=4000);
                win.setContentSize(request.width,request.height);await pause(100);
            }else if(request.kind==='screenshot'){
                assert.match(request.name,/^[a-z-]+$/);
                const file=path.join(output,`${request.name}.png`);
                fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());
                evidence.screenshots[request.name]=file;
            }else throw new Error('Unexpected Moon inspection test request');
            await win.webContents.executeJavaScript('window.__explorationVerification=null');
        }
        await pause(30);
    }
    if(problem)throw problem;
    evidence.checks=result;
    evidence.remoteResources=await win.webContents.executeJavaScript("performance.getEntriesByType('resource').filter(entry=>/^(https?|wss?):/.test(entry.name)).map(entry=>entry.name)");
    assert.deepEqual(evidence.cancelledNetworkRequests,[],'Actual Moon inspection must not attempt remote dependencies');
    assert.deepEqual(evidence.remoteResources,[],'Actual Moon inspection must use local resources');
    assert.deepEqual(evidence.messages.filter(message=>message.level>=3),[],'Actual app must not produce renderer errors');
    finish();
}
require(path.join(target,'main.js'));
