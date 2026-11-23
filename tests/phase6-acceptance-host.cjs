// External host for actual production source or packaged app.asar.
// --mode=ready produces one fresh-process startup sample (run three times).
// --mode=full measures six sustained modes and repeated mixed navigation.
const {app,powerSaveBlocker}=require('electron');
const fs=require('node:fs'),originalFs=require('original-fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const root=path.resolve(__dirname,'..'),target=path.resolve(arg('target',root)),output=path.resolve(arg('output',path.join(root,'.runtime/phase6-acceptance-'+Date.now()))),mode=arg('mode','full');
const planPath=path.resolve(arg('criteria',path.join(root,'docs/phase6-acceptance-plan.json'))),plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const limits=plan.limits;
assert(['ready','full'].includes(mode));assert(limits?.animation?.sampleMs>=30000&&limits.animation.sampleMs<=120000);assert(limits?.navigation?.cycles>=20&&limits.navigation.cycles<=80);
assert(!fs.existsSync(path.join(output,'acceptance.json')),'Use a fresh evidence directory');fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));process.argv.push('--offline');
const evidence={schemaVersion:1,status:'running',mode,target,startedAt:new Date().toISOString(),stage:'starting',planPath,plan,methodology:{execution:'External diagnostic Electron requires the actual target main.js, retaining its production window, renderer, assets and catalog. No production code is replaced.',startup:'Host timer starts immediately before require(main.js), ends after production initialization and two observed real atlas render calls. Native Electron process creation excluded. Each run uses a fresh Chromium profile; OS/GPU caches are uncontrolled. This matches the retained Phase6 baseline timer.',rendering:'Actual active WebGLRenderer.render calls are wrapped. Intervals are main-thread submission cadence, not GPU completion or displayed frame presentation. One-minute samples follow 1.2s warmup. Full canvas dimensions, DPR, hardware, raw intervals, hidden/focus counts are retained. No unrelated RAF is counted.',memory:'No forced garbage collection. app.getAppMetrics memory is KiB per process; summed working sets may double-count shared pages and are not VRAM. Private-byte sums and estimated renderer JS heap are reported separately. Samples are taken at ready, load boundaries, ten-second intervals, each measured visit and after final settling. Screenshots and large file hashes occur only after all measurements.',navigation:'One unmeasured Sun/Moon/Earth/Sirius warmup quartet precedes 24 measured mixed visits. Compare first and last complete quartet after-close settled memory. Actual production inspectObject and close controls are called; native input behavior is covered by the separate functional harness.',network:'Production --offline plus intercepted application HTTP/HTTPS/WS/WSS. This does not block machine networking or establish operating-system speech offline behavior.'},hardware:{platform:os.platform(),release:os.release(),architecture:os.arch(),logicalCPUs:os.cpus().length,cpuModels:[...new Set(os.cpus().map(c=>c.model))],totalMemoryBytes:os.totalmem()},host:{executable:process.execPath,versions:process.versions},startup:{},loads:[],scenarios:[],warmup:[],cycles:[],memory:[],checks:[],messages:[],remoteRequests:[],screenshots:{}};
evidence.displaySleepBlocker={type:'prevent-display-sleep',id:null,active:false,activeAtStart:false,released:false,savedPowerSettingsChanged:false};
evidence.methodology.displaySleep='The diagnostic host temporarily prevents display sleep while measuring. It releases the Electron power request on completion or failure and does not change saved workstation power settings.';
const write=()=>fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(evidence,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const median=values=>{const a=values.slice().sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
const check=(name,passed,detail)=>{evidence.checks.push({name,passed:!!passed,detail});return passed;};
let started=false,finished=false,start,window;
const timer=setTimeout(()=>finish(Error('Acceptance exceeded its bounded fifteen-minute host timeout')),900000);
function startDisplaySleepBlocker(){
  const blocker=evidence.displaySleepBlocker;
  blocker.id=powerSaveBlocker.start(blocker.type);
  blocker.active=blocker.activeAtStart=powerSaveBlocker.isStarted(blocker.id);
  blocker.startedAt=new Date().toISOString();
  assert(blocker.active,'Diagnostic display-sleep blocker did not activate');
}
function releaseDisplaySleepBlocker(){
  const blocker=evidence.displaySleepBlocker;
  if(blocker.id===null||blocker.released)return;
  try{
    if(powerSaveBlocker.isStarted(blocker.id))powerSaveBlocker.stop(blocker.id);
    blocker.active=powerSaveBlocker.isStarted(blocker.id);
    blocker.released=!blocker.active;blocker.releasedAt=new Date().toISOString();
  }catch(error){blocker.releaseError=error.stack||String(error);}
}
function finish(error){
  if(finished)return;finished=true;clearTimeout(timer);releaseDisplaySleepBlocker();
  const blocker=evidence.displaySleepBlocker;
  if(blocker.id!==null&&!blocker.released)error ||= Error('Diagnostic display-sleep blocker did not release: '+(blocker.releaseError||'still active'));
  evidence.status=error||evidence.checks.some(c=>!c.passed)?'failed':'passed';if(error)evidence.error=error.stack||String(error);evidence.finishedAt=new Date().toISOString();write();console.log(JSON.stringify({status:evidence.status,file:path.join(output,'acceptance.json'),failedChecks:evidence.checks.filter(c=>!c.passed).map(c=>c.name),error:evidence.error}));app.exit(evidence.status==='passed'?0:1);
}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
process.once('exit',releaseDisplaySleepBlocker);
app.once('will-quit',()=>{if(!finished)finish(Error('Application quit before acceptance completed'));});
async function evaluate(expression){return window.webContents.executeJavaScript(expression);}
async function call(name,...args){return evaluate(`window.__phase6Acceptance.${name}(...${JSON.stringify(args)})`);}
function foreground(){window.show();window.focus();window.webContents.focus();}
async function memory(stage){
  const appMetrics=app.getAppMetrics(),jsHeap=await call('heap'),sample={stage,at:new Date().toISOString(),appMetrics,mainProcessMemoryBytes:process.memoryUsage(),rendererJSHeap:jsHeap,workingSetMiB:appMetrics.reduce((n,m)=>n+(m.memory?.workingSetSize||0),0)/1024,privateMiB:appMetrics.reduce((n,m)=>n+(m.memory?.privateBytes||0),0)/1024,jsHeapUsedMiB:jsHeap?.usedJSHeapSize/1048576||null};evidence.memory.push(sample);return sample;
}
const stage=value=>{evidence.stage=value;write();console.log(JSON.stringify({stage:value}));};
function stampTarget(){
  // Hashing a large archive allocates host Buffers. It must happen only after
  // startup/performance/memory samples, including in ready-only processes.
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  evidence.targetHashes={};
  for(const relative of ['package.json','main.js','script.js','modules/UnifiedInspector.js','modules/NarrationController.js','modules/EarthAssetTrial.js','modules/SunAssetTrial.js','modules/MoonAssetTrial.js'])evidence.targetHashes[relative]=hash(fs.readFileSync(path.join(target,relative)));
  if(target.endsWith('.asar'))evidence.archiveSha256=hash(originalFs.readFileSync(target));
  evidence.hashingPerformedAfterAllTimingAndMemorySamples=true;
}
app.on('browser-window-created',(_event,win)=>{
  window=win;win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{evidence.remoteRequests.push({url:details.url,resourceType:details.resourceType});callback({cancel:true});});
  win.webContents.on('render-process-gone',(_event,details)=>finish(Error('Renderer exited: '+JSON.stringify(details))));
  win.webContents.on('console-message',(_event,level,message)=>{evidence.messages.push({level,message});if(!started&&message==='3D Star Map Explorer initialized successfully'){started=true;evidence.startup.productionInitializedMs=performance.now()-start;run().catch(async error=>{try{evidence.failureState=await call('state');const file=path.join(output,'failure.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());evidence.failureScreenshot=file;}catch{}finish(error);});}});
});
async function run(){
  foreground();window.setContentSize(1584,835);
  await evaluate(fs.readFileSync(path.join(__dirname,'phase6-acceptance-runtime.js'),'utf8'));await call('twoFrames');evidence.startup.readyAndTwoRenderedFramesMs=performance.now()-start;
  evidence.targetVersion=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version;evidence.initial=await call('conditions');evidence.gpu=await app.getGPUInfo('complete');evidence.gpuFeatures=app.getGPUFeatureStatus();await memory('ready');
  check('ready-within-single-run-limit',evidence.startup.readyAndTwoRenderedFramesMs<=limits.startup.maxMs,{actual:evidence.startup.readyAndTwoRenderedFramesMs,limit:limits.startup.maxMs});
  check('baseline-viewport-and-catalog',evidence.initial.viewport.width===1584&&evidence.initial.viewport.height===835&&evidence.initial.fullCatalogCount===117735&&evidence.initial.atlasPointCount===107860,evidence.initial);
  check('ready-foreground',!evidence.initial.documentHidden&&evidence.initial.documentFocused,evidence.initial);
  if(mode==='ready'){stampTarget();evidence.stage='complete-ready';return finish();}
  await call('prepareMap');
  for(const visit of ['first','repeat'])for(const kind of ['sun','moon','earth']){
    stage(`load:${visit}:${kind}`);foreground();const result=await call('open',kind,{mode:'scientific',motion:true});evidence.loads.push({visit,...result});await memory(`load:${visit}:${kind}:open`);
    const threshold=visit==='first'?limits.loading.firstMs:limits.loading.repeatMs;check(`load:${visit}:${kind}`,result.usableTwoFramesMs<=threshold,{actualMs:result.usableTwoFramesMs,limitMs:threshold});
    await call('close');await delay(500);await memory(`load:${visit}:${kind}:closed`);
  }
  for(const kind of ['sun','moon','earth'])for(const appearance of ['scientific','artistic']){
    stage(`sustained:${kind}:${appearance}`);foreground();await call('open',kind,{mode:appearance,motion:true});await delay(1200);
    let done=false,result,error;const measured=call('measure',limits.animation.sampleMs).then(value=>{result=value;done=true;},problem=>{error=problem;done=true;});
    let tick=0;while(!done){await delay(1000);if(!done&&++tick%10===0){await memory(`sustained:${kind}:${appearance}:${tick}s`);write();}}
    await measured;if(error)throw error;result.nativeWindow={focused:window.isFocused(),visible:window.isVisible(),minimized:window.isMinimized(),bounds:window.getBounds(),contentBounds:window.getContentBounds()};evidence.scenarios.push(result);await memory(`sustained:${kind}:${appearance}:end`);
    check(`sustained:${kind}:${appearance}:foreground`,result.hiddenFrames===0&&result.unfocusedFrames===0&&!result.after.conditions.documentHidden&&result.after.conditions.documentFocused&&result.nativeWindow.focused&&result.nativeWindow.visible&&!result.nativeWindow.minimized,{hidden:result.hiddenFrames,unfocused:result.unfocusedFrames,after:result.after.conditions,native:result.nativeWindow});
    check(`sustained:${kind}:${appearance}:coverage`,result.observedFrameSpanMs>=limits.animation.sampleMs*.95&&result.timerElapsedMs<=limits.animation.sampleMs+5000,{frameSpanMs:result.observedFrameSpanMs,timerMs:result.timerElapsedMs});
    check(`sustained:${kind}:${appearance}:p95`,result.frameIntervalsMs.p95<=limits.animation.p95Ms,{actualMs:result.frameIntervalsMs.p95,limitMs:limits.animation.p95Ms});
    await call('close');await delay(500);await memory(`sustained:${kind}:${appearance}:closed`);write();
  }
  const order=['sun','moon','earth','sirius'];
  for(const kind of order){stage(`warmup:${kind}`);foreground();const load=await call('open',kind,{mode:'artistic',motion:true});const openedMemory=await memory(`warmup:${kind}:open`);await delay(750);const close=await call('close');await delay(500);evidence.warmup.push({kind,load,openedMemory,close,settledMemory:await memory(`warmup:${kind}:closed`)});}
  for(let cycle=0;cycle<limits.navigation.cycles;cycle++){
    const kind=order[cycle%order.length],appearance=Math.floor(cycle/4)%2?'artistic':'scientific';stage(`cycle:${cycle+1}:${kind}`);foreground();
    const load=await call('open',kind,{mode:appearance,motion:true}),openedMemory=await memory(`cycle:${cycle+1}:${kind}:open`);await delay(750);
    if(kind!=='sirius'){await call('configure',appearance==='scientific'?'artistic':'scientific',true);await delay(250);}
    const close=await call('close');await delay(500);const settledMemory=await memory(`cycle:${cycle+1}:${kind}:closed`);evidence.cycles.push({cycle:cycle+1,kind,appearance,load,openedMemory,close,settledMemory});write();
  }
  const early=evidence.cycles.slice(0,4),late=evidence.cycles.slice(-4);evidence.memoryTrend={comparison:'First and last complete post-warmup Sun/Moon/Earth/Sirius quartet, sampled 500ms after close; no forced GC.',earlyCycles:early.map(c=>c.cycle),lateCycles:late.map(c=>c.cycle)};
  for(const [field,limit] of [['workingSetMiB',limits.memory.workingSetGrowthMiB],['privateMiB',limits.memory.privateGrowthMiB],['jsHeapUsedMiB',limits.memory.jsHeapGrowthMiB]]){
    const first=median(early.map(c=>c.settledMemory[field])),last=median(late.map(c=>c.settledMemory[field])),growth=last-first;evidence.memoryTrend[field]={firstMedian:first,lastMedian:last,growth,limit};check(`memory-growth:${field}`,Number.isFinite(growth)&&growth<=limit,evidence.memoryTrend[field]);
  }
  evidence.loadTrend={};for(const kind of ['sun','moon','earth']){const visits=evidence.cycles.filter(c=>c.kind===kind),first=median(visits.slice(0,2).map(c=>c.load.usableTwoFramesMs)),last=median(visits.slice(-2).map(c=>c.load.usableTwoFramesMs)),limit=first*limits.loading.driftRatio+limits.loading.driftAllowanceMs;evidence.loadTrend[kind]={firstTwoMedianMs:first,lastTwoMedianMs:last,limitMs:limit};check(`repeated-load-drift:${kind}`,last<=limit,evidence.loadTrend[kind]);}
  stage('background-resume');foreground();await call('open','earth',{mode:'artistic',motion:true});await delay(500);window.hide();await delay(250);const hiddenBefore=await call('state');await delay(1000);const hiddenAfter=await call('state');foreground();await delay(250);const resumed=await call('state');
  evidence.background={hiddenBefore,hiddenAfter,resumed};check('background-no-animation',hiddenBefore.conditions.documentHidden&&hiddenAfter.conditions.documentHidden&&hiddenBefore.visual.elapsed===hiddenAfter.visual.elapsed&&JSON.stringify(hiddenBefore.visual.camera)===JSON.stringify(hiddenAfter.visual.camera),evidence.background);
  check('background-resume-no-hidden-time-jump',!resumed.conditions.documentHidden&&resumed.visual.elapsed>hiddenAfter.visual.elapsed&&resumed.visual.elapsed-hiddenAfter.visual.elapsed<.6,{hiddenElapsed:hiddenAfter.visual.elapsed,resumedElapsed:resumed.visual.elapsed});await call('close');
  stage('recovery-and-interrupted-load');evidence.recovery=await call('recovery');await memory('after-recovery');await delay(5000);await memory('final-settled');evidence.finalResources=await call('ensureReleased');check('catalog-unchanged',await call('validateCatalog'),null);
  evidence.remoteResources=await evaluate("performance.getEntriesByType('resource').filter(e=>/^(https?|wss?):/.test(e.name)).map(e=>e.name)");check('no-remote-app-resources',evidence.remoteRequests.length===0&&evidence.remoteResources.length===0,{requests:evidence.remoteRequests,resources:evidence.remoteResources});check('no-renderer-errors',evidence.messages.filter(m=>m.level>=3).length===0,evidence.messages.filter(m=>m.level>=3));
  evidence.memoryPeaks={workingSetMiB:Math.max(...evidence.memory.map(m=>m.workingSetMiB)),privateMiB:Math.max(...evidence.memory.map(m=>m.privateMiB)),rendererJSHeapMiB:Math.max(...evidence.memory.map(m=>m.jsHeapUsedMiB||0)),meaning:'Observed sample maxima, not continuous peaks, allocation totals or VRAM.'};
  stage('screenshots-after-all-measurements');for(const kind of ['sun','moon','earth']){foreground();await call('open',kind,{mode:'artistic',motion:true});await delay(150);const file=path.join(output,`${kind}-accepted-preview.png`);fs.writeFileSync(file,(await window.webContents.capturePage()).toPNG());evidence.screenshots[kind]=path.basename(file);await call('close');}
  stampTarget();evidence.stage='complete';finish();
}
// Register before the target schedules its production window. The request exists
// only for this diagnostic process, including its fatal-error and timeout paths.
if(app.isReady())startDisplaySleepBlocker();else app.once('ready',startDisplaySleepBlocker);
start=performance.now();require(path.join(target,'main.js'));
