// Summarize immutable ready/full records without rerunning or reclassifying them.
// node tests/phase6-acceptance-summary.cjs --startup=<dir1>,<dir2>,<dir3>
//   --full=<full-dir> --output=<new-summary.json> [--criteria=<plan.json>]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const root=path.resolve(__dirname,'..'),planPath=path.resolve(arg('criteria',path.join(root,'docs/phase6-acceptance-plan.json')));
assert(arg('startup')&&arg('full')&&arg('output'),'Specify three startup directories, full directory and output');
const output=path.resolve(arg('output'));assert(!fs.existsSync(output),'Use a fresh output record');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),plan=read(planPath),readyPaths=arg('startup').split(',').map(p=>path.join(path.resolve(p),'acceptance.json')),fullPath=path.join(path.resolve(arg('full')),'acceptance.json');
assert.equal(readyPaths.length,plan.conditions.freshStartupProcesses);assert.equal(new Set(readyPaths).size,readyPaths.length,'Startup records must be distinct');
const ready=readyPaths.map(read),full=read(fullPath),checks=[];
const median=values=>{const a=values.slice().sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
const check=(name,passed,detail)=>checks.push({name,passed:!!passed,detail});
for(const [i,record] of [...ready,full].entries()){
  check(`record-${i+1}-passed`,record.status==='passed',{status:record.status,error:record.error??null});
  check(`record-${i+1}-version`,record.targetVersion===plan.candidateVersion,{actual:record.targetVersion,expected:plan.candidateVersion});
  check(`record-${i+1}-criteria`,JSON.stringify(record.plan.limits)===JSON.stringify(plan.limits)&&JSON.stringify(record.plan.conditions)===JSON.stringify(plan.conditions),'Measurements must use the predeclared limits and conditions');
  check(`record-${i+1}-same-target`,record.target===full.target,{actual:record.target,fullTarget:full.target});
  check(`record-${i+1}-same-archive`,/^[a-f0-9]{64}$/.test(full.archiveSha256||'')&&record.archiveSha256===full.archiveSha256,{actual:record.archiveSha256??null,fullArchive:full.archiveSha256??null});
  check(`record-${i+1}-same-electron`,!!full.host?.versions?.electron&&record.host?.versions?.electron===full.host.versions.electron,{actual:record.host?.versions?.electron??null,fullElectron:full.host?.versions?.electron??null});
  check(`record-${i+1}-hashes-after-measurements`,record.hashingPerformedAfterAllTimingAndMemorySamples===true,'Archive/source hashing must follow the recorded timing and memory samples');
}
check('three-fresh-ready-processes',ready.every(r=>r.mode==='ready')&&new Set(ready.map(r=>r.startedAt)).size===ready.length,ready.map(r=>r.startedAt));
const startup=ready.map(r=>r.startup.readyAndTwoRenderedFramesMs),startupMedian=median(startup),startupMax=Math.max(...startup);
check('startup-median',startupMedian<=plan.limits.startup.medianMs,{actualMs:startupMedian,limitMs:plan.limits.startup.medianMs});
check('startup-maximum',startupMax<=plan.limits.startup.maxMs,{actualMs:startupMax,limitMs:plan.limits.startup.maxMs});
check('six-distinct-sustained-modes',full.scenarios.length===6&&new Set(full.scenarios.map(s=>s.kind+':'+s.mode)).size===6,full.scenarios.map(s=>s.kind+':'+s.mode));
check('measured-mixed-cycles',full.cycles.length===plan.limits.navigation.cycles,{actual:full.cycles.length,required:plan.limits.navigation.cycles});
check('full-unmeasured-warmup-quartet',full.warmup.length===4&&new Set(full.warmup.map(c=>c.kind)).size===4,full.warmup.map(c=>c.kind));
const fingerprint=file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
const summary={schemaVersion:1,status:checks.every(c=>c.passed)?'passed':'failed',recordedAt:new Date().toISOString(),candidateVersion:plan.candidateVersion,criteria:fingerprint(planPath),checks,sourceRecords:{ready:readyPaths.map(fingerprint),full:fingerprint(fullPath)},startup:{samplesMs:startup,medianMs:startupMedian,maxMs:startupMax,baselineMedianMs:plan.baseline.readyMedianMs,medianChangeMs:startupMedian-plan.baseline.readyMedianMs,readyWorkingSetMiB:ready.map(r=>r.memory.find(m=>m.stage==='ready')?.workingSetMiB),method:full.methodology.startup},firstAndRepeatLoads:full.loads.map(l=>({kind:l.kind,visit:l.visit,loadReadyMs:l.loadReadyMs,usableTwoFramesMs:l.usableTwoFramesMs})),sustained:full.scenarios.map(s=>({kind:s.kind,mode:s.mode,requestedDurationMs:s.requestedDurationMs,observedFrameSpanMs:s.observedFrameSpanMs,frames:s.frames,p95Ms:s.frameIntervalsMs.p95,p99Ms:s.frameIntervalsMs.p99,maxMs:s.frameIntervalsMs.max,framesPerSecond:s.framesPerSecond,intervalsOver33_333ms:s.intervalsOver33_333ms,intervalsOver50ms:s.intervalsOver50ms,hiddenFrames:s.hiddenFrames,unfocusedFrames:s.unfocusedFrames,viewport:s.before.conditions.viewport,drawingBuffer:s.before.conditions.drawingBuffer})),navigation:{cycles:full.cycles.length,warmup:full.warmup.map(c=>c.kind),loadTrend:full.loadTrend,finalResources:full.finalResources},memoryTrend:full.memoryTrend,memoryPeaks:full.memoryPeaks,remoteRequests:full.remoteRequests.length,remoteResources:full.remoteResources?.length??null,targetHashes:full.targetHashes,archiveSha256:full.archiveSha256??null,limits:['This summary covers measured application behavior. Installed-executable launch, regression checks and actual audible/offline speech need their separate records.','Working sets can double-count shared pages; private bytes and JS heap are separate estimates, not VRAM.','Frame intervals are real render-call cadence, not GPU execution or compositor presentation.','Screenshots and source hashes were deferred until after performance and memory measurements.']};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({status:summary.status,output,failedChecks:checks.filter(c=>!c.passed).map(c=>c.name)}));if(summary.status!=='passed')process.exitCode=1;
