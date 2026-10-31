// Usage: electron tests/phase5-benchmark.cjs --target=<app.asar or source dir>
//   --output=<unique run directory> [--duration-ms=6000] [--label=baseline]
//   [--candidate-trial | --production-expansion-trial]
// This invokes the target's unchanged main.js and instruments its real window.
// Startup excludes native Electron process creation and is not a cold-disk claim.
const { app } = require('electron');
const fs = require('node:fs');
const originalFs = require('original-fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const argument = (name, fallback) => process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3) || fallback;
const target = path.resolve(argument('target',path.join(__dirname,'..')));
const output = path.resolve(argument('output',path.join(__dirname,'../.runtime/phase5-benchmark')));
const durationMs = Number(argument('duration-ms','6000'));
const candidateTrial = process.argv.includes('--candidate-trial');
const productionExpansionTrial = process.argv.includes('--production-expansion-trial');
const candidateOrder = argument('candidate-order','5,10').split(',').map(Number);
assert.ok(durationMs>=1000 && durationMs<=60000);
assert.ok(!(candidateTrial&&productionExpansionTrial),'Choose only one expansion trial mode');
assert.deepEqual(candidateOrder.slice().sort((a,b)=>a-b),[5,10]);
assert.ok(!fs.existsSync(path.join(output,'benchmark.json')), 'Use a unique output directory to preserve previous measurements');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
if (!process.argv.includes('--offline')) process.argv.push('--offline');
const evidence = {
  schemaVersion:1, status:'running', startedAt:new Date().toISOString(), label:argument('label','baseline'), target, candidateTrial, productionExpansionTrial,
  methodology:{
    execution:'External diagnostic Electron entry invokes the unchanged target main.js; production BrowserWindow, renderer, assets and catalog execute from that target.',
    startup:'Timer starts immediately before require(target/main.js), ends after the production initialization signal and two actual atlas render calls. Native Electron process creation is excluded. Fresh Chromium userData; OS file cache is uncontrolled, so this is not a cold-disk benchmark.',
    frames:'One sample per real atlas StarRenderer.render() or active ExplorationController.render() invocation. Inter-frame timing is main-thread frame pacing, not GPU execution time or compositor presentation timing. Synchronous frame submission duration is recorded separately. No spare RAF is counted.',
    visibility:'Normal production background throttling remains unchanged. Every measured frame must be visible and document-focused. Foreground native keyboard input drives flight.',
    memory:'Electron app.getAppMetrics memory fields are KiB working sets/private bytes, separately by process. Sum is a working-set sum and may double-count shared pages. Renderer performance.memory is a Chromium estimate, not total app memory.',
    workload:'Current real catalog and default resolved-distance filtering. No synthetic expanded catalog. Fixed 1600×900 production outer window, actual viewport/framebuffer recorded. Each scenario has 1200ms untimed warmup. All screenshots and source hashing are deferred until after every performance and memory sample; screenshots recreate each measured scenario endpoint.',
    expansion:'Baseline evidence only; no expansion is selected by this harness.'
  },
  process:{executable:process.execPath,versions:process.versions,hostAppIsPackaged:app.isPackaged},
  hardware:{hostname:os.hostname(),platform:os.platform(),release:os.release(),architecture:os.arch(),logicalCPUs:os.cpus().length,cpuModels:[...new Set(os.cpus().map(cpu=>cpu.model))],totalMemoryBytes:os.totalmem()},
  startup:{}, scenarios:[], messages:[], memory:[], cancelledNetworkRequests:[]
};
let start,finished=false,testing=false;
const write=()=>fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(evidence,null,2));
const finish=error=>{
  if(finished)return;finished=true;clearTimeout(timeout);
  evidence.status=error?'failed':'passed';evidence.finishedAt=new Date().toISOString();
  if(error)evidence.error=error.stack||String(error);
  write();console.log(JSON.stringify({status:evidence.status,label:evidence.label,file:path.join(output,'benchmark.json'),error:evidence.error}));
  app.exit(error?1:0);
};
const timeout=setTimeout(()=>finish(new Error('Benchmark exceeded five minutes')),300000);
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const memory=async(win,stage)=>evidence.memory.push({stage,at:new Date().toISOString(),appMetrics:app.getAppMetrics(),mainProcessMemoryBytes:process.memoryUsage(),renderer:await win.webContents.executeJavaScript('window.__phase5Benchmark.conditions().jsHeap')});

app.on('browser-window-created',(_event,win)=>{
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{
    evidence.cancelledNetworkRequests.push({url:details.url,resourceType:details.resourceType});callback({cancel:true});
  });
  win.webContents.on('render-process-gone',(_event,details)=>finish(new Error(`Renderer exited: ${JSON.stringify(details)}`)));
  win.webContents.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{if(isMainFrame)finish(new Error(`Main load failed: ${code} ${description} ${url}`));});
  win.webContents.on('console-message',(_event,level,message,line,source)=>{
    evidence.messages.push({level,message,line,source});
    if(message==='3D Star Map Explorer initialized successfully'&&!testing){
      testing=true;evidence.startup.productionInitializedMs=performance.now()-start;
      run(win).catch(finish);
    }
  });
});

async function run(win){
  win.show();win.focus();win.webContents.focus();
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'phase5-benchmark-renderer.js'),'utf8'));
  await win.webContents.executeJavaScript('window.__phase5Benchmark.rendered().then(()=>window.__phase5Benchmark.rendered()).then(()=>true)');
  evidence.startup.readyAndTwoRenderedFramesMs=performance.now()-start;
  evidence.startup.documentPerformance=await win.webContents.executeJavaScript('({timeOrigin:performance.timeOrigin,now:performance.now(),navigation:performance.getEntriesByType("navigation").map(e=>e.toJSON())})');
  evidence.targetVersion=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version;
  evidence.gpu=await app.getGPUInfo('complete');evidence.gpuFeatures=app.getGPUFeatureStatus();
  evidence.initial=await win.webContents.executeJavaScript('window.__phase5Benchmark.conditions()');
  assert.equal(evidence.initial.fullCatalogCount,117735);
  assert.equal(evidence.initial.renderedPointCount,107860);
  assert.equal(evidence.initial.documentHidden,false);
  await memory(win,'ready');write();
  if(candidateTrial){
    await runCandidateTrial(win);
  }else if(productionExpansionTrial){
    await runProductionExpansionTrial(win);
  }else{
  for(const scenario of ['atlas-cinematic-idle','atlas-cinematic-flight','atlas-scientific-idle','atlas-scientific-flight','solar-idle','nearby-idle']){
    win.focus();win.webContents.focus();
    await win.webContents.executeJavaScript(`window.__phase5Benchmark.prepare(${JSON.stringify(scenario)})`);
    await pause(1200);
    const flying=scenario.includes('-flight');
    if(flying)win.webContents.sendInputEvent({type:'keyDown',keyCode:'W'});
    try{
      const result=await win.webContents.executeJavaScript(`window.__phase5Benchmark.sample(${JSON.stringify(scenario)},${durationMs})`);
      result.nativeWindow={focused:win.isFocused(),visible:win.isVisible(),minimized:win.isMinimized(),bounds:win.getBounds(),contentBounds:win.getContentBounds()};
      assert.ok(result.nativeWindow.focused&&!result.nativeWindow.minimized,'Native benchmark window must stay foreground');
      evidence.scenarios.push(result);
    }finally{if(flying)win.webContents.sendInputEvent({type:'keyUp',keyCode:'W'});}
    await memory(win,scenario);write();
    console.log(JSON.stringify({scenario,framesPerSecond:evidence.scenarios.at(-1).framesPerSecond,p95Ms:evidence.scenarios.at(-1).frameIntervalsMs.p95}));
  }
  evidence.stage='interactions';write();
  win.focus();win.webContents.focus();
  assert.equal(await win.webContents.executeJavaScript('!document.hidden && document.hasFocus()'),true,'Interaction timing requires foreground');
  evidence.interactions=await win.webContents.executeJavaScript('window.__phase5Benchmark.interactions()');
  await memory(win,'after-interactions');
  }
  evidence.stage='screenshots-after-all-memory';write();
  assert.deepEqual(evidence.messages.filter(message=>message.level>=3),[],'Production app must not log errors during benchmark');
  evidence.screenshotsPerformedAfterAllMemorySamples=true;
  for(const result of evidence.scenarios){
    win.focus();win.webContents.focus();
    evidence.stage=`screenshot:${result.scenario}`;write();
    if(candidateTrial){
      await win.webContents.executeJavaScript(result.candidateRadiusPc ? `window.__phase5Candidates.install(${result.candidateRadiusPc})` : 'window.__phase5Candidates.restore()');
    }else if(productionExpansionTrial){
      await win.webContents.executeJavaScript(`window.__phase5Benchmark.setProductionNearbyCollection(${JSON.stringify(result.nearbyCollection)})`);
    }
    await win.webContents.executeJavaScript(`window.__phase5Benchmark.prepare(${JSON.stringify(result.scenario)})`);
    await win.webContents.executeJavaScript(`window.__phase5Benchmark.restoreCamera(${JSON.stringify(result.after)})`);
    await win.webContents.executeJavaScript('window.__phase5Benchmark.rendered().then(()=>window.__phase5Benchmark.rendered()).then(()=>true)');
    const screenshot=path.join(output,`${result.scenario}.png`);fs.writeFileSync(screenshot,(await win.webContents.capturePage()).toPNG());
    result.screenshot=path.basename(screenshot);
  }
  // Reading the full source/catalog/archive creates large external Buffers.
  // Hash only after ALL performance and memory samples, never before them.
  evidence.hashingPerformedAfterAllMemorySamples=true;
  evidence.stage='hashes-after-all-memory';
  evidence.targetHashes={};
  for(const relative of ['main.js','script.js','modules/StarRenderer.js','modules/ExplorationController.js','stars.json','data/pipeline/runtime-metadata.json','data/pipeline/manifest.json']){
    const file=path.join(target,relative);evidence.targetHashes[relative]={bytes:fs.statSync(file).size,sha256:hash(file)};
  }
  if(target.endsWith('.asar'))evidence.targetArchive={bytes:originalFs.statSync(target).size,sha256:crypto.createHash('sha256').update(originalFs.readFileSync(target)).digest('hex')};
  evidence.stage='complete';
  finish();
}

async function runProductionExpansionTrial(win){
  evidence.methodology.expansion='Actual production nearby-collection selector: highlights (13 objects), then 5pc (57 objects). No candidate module or in-memory replacement data is injected. The target production app provides all objects, filtering and rendering.';
  evidence.methodology.productionMemory='Fresh process/profile. Capture unchanged startup and ready memory, then actual 13-object reference idle/orbit followed by actual 57-object idle/orbit, with memory immediately after each frame scenario. No source-coordinate hashing, screenshots or full acceptance suite before all memory samples. No forced garbage collection. Within-process working-set deltas are paired by idle/orbit; OS working-set and garbage-collection variation remain possible.';
  evidence.productionCollectionChanges=[];
  // Select highlights while the app is still in atlas mode, before the first
  // nearby geometry/list construction, so the 13-object reference is not
  // preceded by a 57-object rendering workload.
  for(const [key,expectedCount] of [['highlights',13],['5pc',57]]){
    win.focus();win.webContents.focus();
    evidence.productionCollectionChanges.push(await win.webContents.executeJavaScript(`window.__phase5Benchmark.setProductionNearbyCollection(${JSON.stringify(key)})`));
    for(const orbit of [false,true]){
      await win.webContents.executeJavaScript('window.__phase5Benchmark.prepare("nearby-idle")');
      await pause(1200);
      const scenario=`nearby-production-${key}-${expectedCount}-${orbit?'orbit':'idle'}`;
      evidence.stage=scenario;write();
      const center=await win.webContents.executeJavaScript('(()=>{const canvas=window.galaxyMap.explorer.canvas,r=canvas.getBoundingClientRect();for(const [fx,fy]of[[.4,.75],[.35,.65],[.5,.5],[.3,.8]]){const point={x:Math.round(r.left+r.width*fx),y:Math.round(r.top+r.height*fy)};if(document.elementFromPoint(point.x,point.y)===canvas)return point;}throw new Error("No uncovered canvas point for native orbit");})()');
      if(orbit){win.webContents.sendInputEvent({type:'mouseMove',...center});win.webContents.sendInputEvent({type:'mouseDown',...center,button:'left',clickCount:1});}
      let result;
      try{
        const sample=win.webContents.executeJavaScript(`window.__phase5Benchmark.sample(${JSON.stringify(scenario)},${durationMs})`);
        if(orbit){
          const steps=Math.max(10,Math.round(durationMs/100));
          for(let i=1;i<=steps;i++){
            await pause(durationMs/steps);
            win.webContents.sendInputEvent({type:'mouseMove',x:center.x+Math.round(140*i/steps),y:center.y+Math.round(40*Math.sin(Math.PI*i/steps)),button:'left'});
          }
        }
        result=await sample;
      }finally{if(orbit)win.webContents.sendInputEvent({type:'mouseUp',x:center.x+140,y:center.y,button:'left',clickCount:1});}
      assert.equal(result.before.renderedPointCount,expectedCount);
      assert.equal(result.after.renderedPointCount,expectedCount);
      result.nearbyCollection=key;
      result.nativeWindow={focused:win.isFocused(),visible:win.isVisible(),minimized:win.isMinimized(),bounds:win.getBounds(),contentBounds:win.getContentBounds()};
      assert.ok(result.nativeWindow.focused&&!result.nativeWindow.minimized,'Production expansion window must stay foreground');
      if(orbit){
        const quaternionChange=Math.max(...result.after.cameraQuaternion.map((v,i)=>Math.abs(v-result.before.cameraQuaternion[i])));
        const targetDistance=Math.hypot(...result.after.cameraTarget.map((v,i)=>v-result.before.cameraTarget[i]));
        assert.ok(result.cameraDistance>0.001&&quaternionChange>0.00001&&targetDistance<0.000001,'Native left drag must rotate around a fixed target');
        result.nativeOrbit={cameraDistance:result.cameraDistance,quaternionComponentChange:quaternionChange,targetDistance,dragPixelsX:140,dragArchPixelsY:40,inputFrequencyHz:10};
      }
      evidence.scenarios.push(result);
      await memory(win,scenario);write();
      console.log(JSON.stringify({scenario,framesPerSecond:result.framesPerSecond,p95Ms:result.frameIntervalsMs.p95}));
    }
  }
  evidence.productionExpansionScope='Rendering, real native orbit, actual collection-change handler, object counts, startup and process memory. Separate packaged acceptance verifies scientific identity, labels, filtering, measurements and keyboard navigation.';
}

async function runCandidateTrial(win){
  evidence.methodology.expansion='Diagnostic in-memory candidate comparison only, after unchanged baseline: existing 13-object nearby view, retained 5 pc subset (57 objects), retained 10 pc subset (279 objects). Production source and installed payload are unchanged.';
  evidence.methodology.candidateMemory='Candidate observer and source-coordinate reference hash are initialized BEFORE the 13-object reference memory sample, with the same observer retained for all views. Each candidate view is installed without full validation; all subsequent coordinate hashes and full validations occur AFTER every candidate memory sample. No forced garbage collection. Compare within-process working-set deltas, not this diagnostic prototype with a final release.';
  evidence.candidateOrder=candidateOrder;
  evidence.candidateConstruction=[];
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'phase5-candidate-renderer.js'),'utf8'));
  evidence.validationReference=await win.webContents.executeJavaScript('window.__phase5Candidates.initializeValidationReference()');
  await win.webContents.executeJavaScript('window.__phase5Benchmark.prepare("nearby-idle")');
  await pause(1200);
  await memory(win,'candidate-reference-13');
  for(const radius of [0,...candidateOrder]){
    win.focus();win.webContents.focus();
    if(radius) evidence.candidateConstruction.push(await win.webContents.executeJavaScript(`window.__phase5Candidates.install(${radius},{validate:false})`));
    const expectedCount=radius===0?13:radius===5?57:279;
    for(const orbit of [false,true]){
      await win.webContents.executeJavaScript('window.__phase5Benchmark.prepare("nearby-idle")');
      await pause(1200);
      const scenario=`nearby-${radius?`${radius}pc-${expectedCount}`:'reference-13'}-${orbit?'orbit':'idle'}`;
      evidence.stage=scenario;write();
      const center=await win.webContents.executeJavaScript('(()=>{const canvas=window.galaxyMap.explorer.canvas,r=canvas.getBoundingClientRect();for(const [fx,fy]of[[.4,.75],[.35,.65],[.5,.5],[.3,.8]]){const point={x:Math.round(r.left+r.width*fx),y:Math.round(r.top+r.height*fy)};if(document.elementFromPoint(point.x,point.y)===canvas)return point;}throw new Error("No uncovered canvas point for native orbit");})()');
      if(orbit){win.webContents.sendInputEvent({type:'mouseMove',...center});win.webContents.sendInputEvent({type:'mouseDown',...center,button:'left',clickCount:1});}
      let result;
      try{
        const sample=win.webContents.executeJavaScript(`window.__phase5Benchmark.sample(${JSON.stringify(scenario)},${durationMs})`);
        if(orbit){
          const steps=Math.max(10,Math.round(durationMs/100));
          for(let i=1;i<=steps;i++){
            await pause(durationMs/steps);
            win.webContents.sendInputEvent({type:'mouseMove',x:center.x+Math.round(140*i/steps),y:center.y+Math.round(40*Math.sin(Math.PI*i/steps)),button:'left'});
          }
        }
        result=await sample;
      }finally{if(orbit)win.webContents.sendInputEvent({type:'mouseUp',x:center.x+140,y:center.y,button:'left',clickCount:1});}
      assert.equal(result.before.renderedPointCount,expectedCount);
      result.candidateRadiusPc=radius;
      result.nativeWindow={focused:win.isFocused(),visible:win.isVisible(),minimized:win.isMinimized(),bounds:win.getBounds(),contentBounds:win.getContentBounds()};
      assert.ok(result.nativeWindow.focused&&!result.nativeWindow.minimized,'Candidate window must stay foreground');
      if(orbit){
        const quaternionChange=Math.max(...result.after.cameraQuaternion.map((v,i)=>Math.abs(v-result.before.cameraQuaternion[i])));
        const targetDistance=Math.hypot(...result.after.cameraTarget.map((v,i)=>v-result.before.cameraTarget[i]));
        assert.ok(result.cameraDistance>0.001&&quaternionChange>0.00001&&targetDistance<0.000001,'Native left drag must rotate around a fixed target');
        result.nativeOrbit={cameraDistance:result.cameraDistance,quaternionComponentChange:quaternionChange,targetDistance,dragPixelsX:140,dragArchPixelsY:40,inputFrequencyHz:10};
      }
      evidence.scenarios.push(result);
      await memory(win,scenario);write();
      console.log(JSON.stringify({scenario,framesPerSecond:result.framesPerSecond,p95Ms:result.frameIntervalsMs.p95}));
    }
  }
  evidence.stage='candidate-validation-after-all-memory';write();
  evidence.candidateValidation=[];
  for(const radius of candidateOrder){
    win.focus();win.webContents.focus();
    await win.webContents.executeJavaScript(`window.__phase5Candidates.install(${radius},{validate:false})`);
    evidence.candidateValidation.push({radiusPc:radius,validation:await win.webContents.executeJavaScript('window.__phase5Candidates.validate()'),interactions:await win.webContents.executeJavaScript('window.__phase5Candidates.interactions()')});
  }
}

// All listeners, profile isolation and offline settings precede production main.
// The production module itself constructs the BrowserWindow and loads index.html.
start=performance.now();
require(path.join(target,'main.js'));
