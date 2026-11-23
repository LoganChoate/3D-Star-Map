// Drive the actual candidate/installed executable through an ephemeral loopback
// debugger. The product main/renderer stays unchanged; only test observation and
// native input are injected. The outer wrapper can supply OS-enforced egress
// isolation for this exact executable, not for all Windows services or helpers.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const arg=(key,fallback)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const exe=path.resolve(arg('exe','')),out=path.resolve(arg('output','')),captureExe=path.resolve(arg('capture',path.join(__dirname,'../.runtime/phase6-audio-tools/phase6-audio-capture.exe')));
assert(arg('exe')&&arg('output'),'Specify exact --exe and fresh --output');assert(fs.existsSync(exe)&&fs.existsSync(captureExe));
const appAsar=path.join(path.dirname(exe),'resources','app.asar');
const sha256File=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert(fs.existsSync(appAsar),'Packaged application archive missing beside the tested executable');
assert(!fs.existsSync(out),'Use a fresh evidence directory');fs.mkdirSync(out,{recursive:true});
const record={status:'running',startedAt:new Date().toISOString(),exe,exeSha256:sha256File(exe),appAsarPath:appAsar,appAsarSha256Before:sha256File(appAsar),events:[],segments:[],scope:'Actual executable, actual WebSpeech local voice, native buttons, process-tree-only WASAPI. No microphone or other-process recording. Exact-executable OS egress proof is separate.',limits:['Digital speaker-output samples do not confirm physical speaker volume or user listening quality.','No synthetic speech adapter or replacement narration text is used.','Exact-executable firewall isolation does not globally isolate Windows services or helpers with other executable paths. Local voices and loaded SAPI/MSTTS modules support the tested speech path, not every hypothetical external dependency.']};
record.captureExePath=captureExe;record.captureExeSha256Before=sha256File(captureExe);
const delay=ms=>new Promise(r=>setTimeout(r,ms));let appProcess,recorder,socket,port,id=0,pending=new Map(),recorded=false;
const save=()=>fs.writeFileSync(path.join(out,'audio-host.json'),JSON.stringify(record,null,2));
async function until(fn,message,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await delay(80);}throw Error(message);}
async function command(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method));},12000);pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function click(elementId){const point=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(elementId)});if(!e||e.disabled)throw Error('Control unavailable');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
function assertRecorderAlive(stage){assert(recorder?.pid&&!record.captureProcess.error&&recorder.exitCode===null&&recorder.signalCode===null&&!record.captureProcess.exitedAtUnixMs&&!record.captureProcess.completion,`Recorder is not active at ${stage}`);return {unixMs:Date.now(),pid:recorder.pid,alive:true};}
async function segment(name,durationMs){const recorderAtStart=assertRecorderAlive(name+' start'),startUnixMs=Date.now();await delay(durationMs);const endUnixMs=Date.now(),recorderAtEnd=assertRecorderAlive(name+' end');const state=await evaluate('window.galaxyMap.narration.snapshot()');record.segments.push({name,startUnixMs,endUnixMs,state,recorderAtStart,recorderAtEnd});save();}
async function finishRecorder(){
 assertRecorderAlive('requested completion');record.captureProcess.stopRequestedUnixMs=Date.now();fs.writeFileSync(path.join(out,'stop-capture'),'stop');
 await until(()=>{assert(!record.captureProcess.error,record.captureProcess.error);return record.captureProcess.closedAtUnixMs;},'Recorder did not close cleanly after requested stop',5000);
 const capture=record.captureProcess;
 assert(capture.exitCode===0&&capture.signal===null,'Recorder must exit successfully without a signal');
 assert(capture.completion?.status==='complete','Recorder did not report successful completion');
 assert(capture.exitedAtUnixMs>=capture.stopRequestedUnixMs&&capture.completionObservedAtUnixMs>=capture.stopRequestedUnixMs,'Recorder completed before requested stop');
 const metadata=JSON.parse(fs.readFileSync(path.join(out,'narration.wav.json'),'utf8'));
 assert(metadata.stopRequested===true&&metadata.stopReason==='requested-stop','Recorder stopped for a reason other than the requested stop');
 assert(metadata.endedUnixMs>=record.segments.at(-1).endUnixMs&&metadata.endedUnixMs>=capture.stopRequestedUnixMs,'Recording ended before final observation or stop request');
 assert(metadata.frames===capture.completion.frames&&metadata.packets.length===capture.completion.packets,'Recorder completion does not match saved metadata');
 capture.metadataSummary={originUnixMs:metadata.originUnixMs,endedUnixMs:metadata.endedUnixMs,frames:metadata.frames,stopReason:metadata.stopReason};
}
async function main(){
 port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 // This is the interactive app under test. Hiding its initial Windows window
 // also hides its document, which correctly prevents manual narration playback.
 // Only the recorder and other background helper processes use windowsHide.
 appProcess=cp.spawn(exe,['--offline','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(out,'profile')}`],{env,windowsHide:false,stdio:['ignore','pipe','pipe']});
 record.pid=appProcess.pid;record.debugPort=port;record.stderr='';appProcess.stderr.on('data',b=>{record.stderr+=b.toString();});appProcess.on('error',e=>{record.launchError=e.message;});
 appProcess.on('exit',(code,signal)=>{record.appExit={code,signal,unixMs:Date.now()};});appProcess.on('close',()=>{record.appClosedAtUnixMs=Date.now();});
 const target=await until(async()=>{assert(!record.launchError,record.launchError);assert(!record.appExit,'Application exited before debugger became ready: '+JSON.stringify(record.appExit));try{return (await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.url.startsWith('file:'));}catch{return null;}},'Application debugger did not become ready');
 assert(new URL(target.webSocketDebuggerUrl).hostname==='127.0.0.1','Debugger must use loopback');record.debuggerUrl=target.webSocketDebuggerUrl;record.loadedUrl=target.url;
 const listeners=cp.execFileSync('netstat.exe',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(v=>v[0]==='TCP'&&v[1]?.endsWith(':'+port)&&v[3]==='LISTENING');
 assert(listeners.length>0&&listeners.every(v=>['127.0.0.1:'+port,'[::1]:'+port].includes(v[1])&&Number(v[4])===appProcess.pid),'Debugger must bind only loopback on the launched app process');record.debugListeners=listeners.map(v=>({address:v[1],pid:Number(v[4])}));
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const h=pending.get(r.id);pending.delete(r.id);if(h)r.error?h.reject(Error(JSON.stringify(r.error))):h.resolve(r.result);}else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')record.events.push({type:'consoleError',data:r.params.args});});
 await command('Runtime.enable');await command('Page.enable');await command('Page.bringToFront');
 await until(()=>evaluate('!!window.galaxyMap?.inspector'), 'Actual application did not initialize',30000);
 await command('Page.bringToFront');
 record.preflightVisibility=await evaluate('({hidden:document.hidden,visibilityState:document.visibilityState,focused:document.hasFocus()})');
 try{record.window=await command('Browser.getWindowForTarget',{targetId:target.id});}catch(e){record.windowInspectionError=e.message;}
 save();console.log(JSON.stringify({status:'waiting-for-visible-app',pid:appProcess.pid,visibility:record.preflightVisibility,window:record.window}));
 await until(()=>evaluate('!document.hidden&&document.hasFocus()'),'Actual application window did not become visible and focused',45000);
 const selection=await evaluate(`(async()=>{const g=window.galaxyMap;const body=g.explorer.nearbyObjects.find(b=>/^sirius$/i.test(b.name));if(!body)throw Error('Sirius catalog record missing');await g.inspectObject(body);return {id:body.id,transcript:g.narration.snapshot().text,voices:g.narration.getVoices(),hidden:document.hidden};})()`);
 assert(!selection.hidden,'Audio controls require the actual app window visible');assert(selection.voices.length>0&&selection.voices.every(v=>v.localService===true));record.selection=selection;
 await evaluate(`(()=>{window.__phase6SpeechEvents=[];window.__phase6SpeechUnsubscribe=window.galaxyMap.narration.subscribe(s=>window.__phase6SpeechEvents.push({unixMs:Date.now(),status:s.status,started:s.started,contentId:s.contentId,boundaryIndex:s.boundaryIndex,errorCode:s.errorCode}));return true;})()`);
 const wav=path.join(out,'narration.wav'),stop=path.join(out,'stop-capture');recorder=cp.spawn(captureExe,[String(appProcess.pid),wav,stop,'90'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 record.captureProcess={pid:recorder.pid};record.captureLog='';let stdoutBuffer='';
 recorder.on('error',e=>{record.captureProcess.error=e.message;});
 recorder.on('exit',(code,signal)=>{Object.assign(record.captureProcess,{exitCode:code,signal,exitedAtUnixMs:Date.now()});});
 recorder.on('close',(code,signal)=>{Object.assign(record.captureProcess,{exitCode:code,signal,closedAtUnixMs:Date.now()});});
 recorder.stdout.on('data',b=>{record.captureLog+=b.toString();stdoutBuffer+=b.toString();let newline;while((newline=stdoutBuffer.indexOf('\n'))>=0){const line=stdoutBuffer.slice(0,newline).trim();stdoutBuffer=stdoutBuffer.slice(newline+1);try{const message=JSON.parse(line);if(message.status==='recording'){recorded=true;record.captureProcess.started=message;record.captureProcess.startedObservedAtUnixMs=Date.now();}if(message.status==='complete'){record.captureProcess.completion=message;record.captureProcess.completionObservedAtUnixMs=Date.now();}}catch{record.captureProcess.outputParseError=line;}}});
 recorder.stderr.on('data',b=>{record.captureLog+=b.toString();});
 await until(()=>{assertRecorderAlive('capture startup');return recorded;},'Process-only audio capture did not start');
 await segment('before-play-silence',1800);await click('inspection-narration-play');await until(()=>evaluate('window.galaxyMap.narration.snapshot().started'),'Narration did not emit a real start');await segment('playing',6000);
 record.events.push({type:'pause-click',unixMs:Date.now()});await click('inspection-narration-pause');await until(()=>evaluate('window.galaxyMap.narration.snapshot().status==="paused"'),'Narration did not pause');await delay(650);await segment('paused-silence',1800);
 record.events.push({type:'resume-click',unixMs:Date.now()});await click('inspection-narration-resume');await until(()=>evaluate('window.galaxyMap.narration.snapshot().status==="speaking"'),'Narration did not resume');await segment('resumed-playing',5000);
 record.events.push({type:'stop-click',unixMs:Date.now()});await click('inspection-narration-stop');await delay(650);await segment('stopped-silence',1800);
 try{record.loadedSpeechModules=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',`@(Get-Process -Id ${appProcess.pid} | Select-Object -ExpandProperty Modules | Where-Object { $_.ModuleName -match '^(sapi(?:_onecore)?|MSTTS[^.]*)\\.dll$' } | Select-Object ModuleName,FileName) | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));}catch(e){record.moduleInspectionError=e.message;}
 assert(!await evaluate('window.galaxyMap.narration.snapshot().started'),'Stop must clear speech ownership');
 record.speechEvents=await evaluate('window.__phase6SpeechEvents');record.finalState=await evaluate('window.galaxyMap.narration.snapshot()');
 await finishRecorder();
 // The Electron launcher can have the same hash across product versions. Bind
 // this capture to its packaged source content and reject a changed archive.
 record.appAsarSha256=sha256File(appAsar);record.appAsarHashedAfterCaptureAt=new Date().toISOString();record.appAsarUnchanged=record.appAsarSha256===record.appAsarSha256Before;
 record.captureExeSha256=sha256File(captureExe);record.captureExeUnchanged=record.captureExeSha256===record.captureExeSha256Before;
 assert(record.appAsarUnchanged,'Application archive changed during the audio capture');assert(record.captureExeUnchanged,'Capture helper changed during the audio capture');record.status='captured';
}
(async()=>{try{await main();}catch(e){record.status='failed';record.error=e.stack||String(e);}finally{
 if(recorder?.pid&&!record.captureProcess.closedAtUnixMs){if(!record.captureProcess.stopRequestedUnixMs)record.captureProcess.cleanupStopRequestedUnixMs=Date.now();fs.writeFileSync(path.join(out,'stop-capture'),'stop');await Promise.race([new Promise(r=>{if(record.captureProcess.closedAtUnixMs)r();else recorder.once('close',r);}),delay(4000)]);}
 if(recorder?.pid&&recorder.exitCode===null&&recorder.signalCode===null){record.captureProcess.forcedTermination=true;recorder.kill();}
 if(socket?.readyState===WebSocket.OPEN){try{await evaluate('window.galaxyMap.narration.stop(); window.__phase6SpeechUnsubscribe?.(); true');await command('Browser.close');}catch{}socket.close();}
 if(appProcess){await Promise.race([new Promise(r=>{if(appProcess.exitCode!==null)r();else appProcess.once('exit',r);}),delay(4000)]);if(appProcess.exitCode===null)appProcess.kill();}
 record.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:record.status,output:out,error:record.error}));if(record.status==='failed')process.exitCode=1;
}})();
