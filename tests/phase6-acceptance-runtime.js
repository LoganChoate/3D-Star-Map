// Injected measurement only: calls the real shared inspector and wraps actual
// WebGLRenderer.render invocations. No replacement animation or forced GC.
(() => {
  const {renderer:atlas,explorer,inspector,narration,inspectObject}=window.galaxyMap;
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const watched=new WeakSet(),waiters=[];
  let sample=null,openKind=null,mapBefore=null;
  const kinds=['sun','moon','earth','sirius'];
  const trials={sun:inspector.sunTrial,moon:inspector.moonTrial,earth:inspector.earthTrial};
  const bodies={sun:explorer.solarObjects.find(b=>b.id==='sol'),moon:explorer.solarObjects.find(b=>b.id==='solar:moon'),earth:explorer.solarObjects.find(b=>b.id==='solar:earth'),sirius:explorer.nearbyObjects.find(b=>/^sirius$/i.test(b.name))};
  for(const name of kinds)check(bodies[name],`Missing acceptance object: ${name}`);
  const retainedCatalog=JSON.stringify(kinds.map(name=>bodies[name]));
  const activeRenderer=()=>inspector.isOpen?inspector.activeTrial?.renderer:explorer.currentMode==='atlas'?atlas.renderer:explorer.renderer;
  const percentile=(values,q)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]:null;};
  const stats=values=>({count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,median:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?Math.max(...values):null});
  function watch(object,renderer=object){
    if(!object||watched.has(object))return;watched.add(object);
    const original=object.render;
    object.render=function(...args){
      if(renderer!==activeRenderer())return original.apply(this,args);
      const start=performance.now(),result=original.apply(this,args),end=performance.now();
      if(sample){sample.starts.push(start);sample.submission.push(end-start);if(document.hidden)sample.hidden++;if(!document.hasFocus())sample.unfocused++;if(!sample.motion.length||start-sample.motion.at(-1).at>=1000)sample.motion.push({at:start,state:trialState()});}
      waiters.splice(0).forEach(w=>{clearTimeout(w.timer);w.resolve(end);});
      return result;
    };
  }
  // Atlas post-processing performs multiple WebGL draws in one frame. Observe
  // its outer render method, matching the retained baseline rather than counting
  // individual bloom passes as separate animation frames.
  watch(atlas,atlas.renderer);watch(explorer,explorer.renderer);
  const rendered=()=>new Promise((resolve,reject)=>{
    const waiter={resolve,timer:null};waiter.timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(Error('No actual active renderer call within five seconds'));},5000);waiters.push(waiter);
  });
  const twoFrames=async()=>{await rendered();return rendered();};
  const heap=()=>performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null;
  function mapPose(){const controller=explorer.currentMode==='atlas'?atlas:explorer;return {mode:explorer.currentMode,position:controller.camera.position.toArray(),target:controller.controls.target.toArray(),selected:explorer.selectedObject?.id??null};}
  function conditions(){
    const renderer=activeRenderer(),canvas=renderer?.domElement,gl=renderer?.getContext(),debug=gl?.getExtension('WEBGL_debug_renderer_info'),rect=canvas?.getBoundingClientRect();
    return {kind:openKind,mode:inspector.isOpen?inspector.activeTrial?.mode??'information':explorer.currentMode,viewport:{width:innerWidth,height:innerHeight},canvasCSS:rect?{width:rect.width,height:rect.height}:null,drawingBuffer:canvas?{width:canvas.width,height:canvas.height}:null,devicePixelRatio,rendererPixelRatio:renderer?.getPixelRatio()??null,documentHidden:document.hidden,documentFocused:document.hasFocus(),fullCatalogCount:atlas.fullStarData.length,atlasPointCount:atlas.starsMesh.geometry.getAttribute('position').count,webgl:gl?{version:gl.getParameter(gl.VERSION),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}:null,jsHeap:heap(),threeMemory:renderer?{...renderer.info.memory}:null};
  }
  const trialState=()=>openKind&&trials[openKind]?trials[openKind].snapshot():null;
  const resources=()=>({inspectorOpen:inspector.isOpen,activeKind:inspector.visualKind,closeupCanvases:document.querySelectorAll('#sol-trial-canvas,#moon-trial-canvas,#earth-trial-canvas').length,adapters:Object.fromEntries(Object.entries(trials).map(([name,t])=>[name,{isOpen:t.isOpen,renderer:!!t.renderer,scene:!!t.scene,canvas:!!t.canvas,model:!!t.model,geometry:!!t.geometry,lastRelease:t.lastRelease??null}])),map:{atlas:{...atlas.renderer.info.memory},exploration:{...explorer.renderer.info.memory}},jsHeap:heap()});
  function ensureReleased(){
    const r=resources();check(!r.inspectorOpen&&r.closeupCanvases===0,'Closed inspector must remove all close-up canvases');
    for(const [name,value] of Object.entries(r.adapters))check(!value.isOpen&&!value.renderer&&!value.scene&&!value.canvas&&!value.model&&!value.geometry,`${name} retained a closed renderer or scene resource`);
    return r;
  }
  async function prepareMap(){
    if(inspector.isOpen)await close();document.getElementById('ex-mode-solar').click();await twoFrames();
    explorer.controls.autoRotate=false;return mapPose();
  }
  async function open(kind,{mode='scientific',motion=true}={}){
    check(kinds.includes(kind),'Unknown acceptance body');check(!inspector.isOpen,'Close the previous inspector before timing a new load');
    mapBefore=mapPose();openKind=kind;const start=performance.now();const ready=await inspectObject(bodies[kind]),readyAt=performance.now();
    check(ready&&inspector.status==='ready',`${kind} did not load`);check(inspector.body.id===bodies[kind].id,`${kind} changed catalog identity`);
    check(narration.contentId===bodies[kind].id&&!narration.snapshot().started,`${kind} must retain its own non-autoplay transcript`);
    let usableAt=readyAt;
    if(trials[kind]){watch(trials[kind].renderer);usableAt=await twoFrames();configure(mode,motion);}
    else {check(!inspector.activeTrial&&inspector.visualKind===null,'Other stars must remain information-only');await delay(0);}
    return {kind,id:bodies[kind].id,loadReadyMs:readyAt-start,usableTwoFramesMs:usableAt-start,conditions:conditions(),visual:trialState()};
  }
  function configure(mode,motion=true){
    const trial=trials[openKind];if(!trial)return;
    trial.setMode(mode);
    if(openKind==='moon'){
      if(trial.controls.autoRotate!==motion)document.getElementById('moon-trial-turntable').click();
      if(trial.sweep!==motion)document.getElementById('moon-trial-sweep').click();
    }else {trial.setPaused(!motion);trial.setSpeed(1);if(openKind==='earth'){trial.setRotationEnabled(true);trial.setOrbitEnabled(motion);}}
    check(trial.mode===mode,'Appearance control failed');
  }
  async function close(){
    const before={kind:openKind,visual:trialState(),map:mapBefore};inspector.close();openKind=null;await twoFrames();
    const after=mapPose(),release=ensureReleased();
    check(after.mode===before.map.mode&&after.selected===before.map.selected,'Map mode and selected identity must survive inspection');
    check(after.position.every((v,i)=>Math.abs(v-before.map.position[i])<1e-8)&&after.target.every((v,i)=>Math.abs(v-before.map.target[i])<1e-8),'Map pose changed during inspection');
    check(!narration.snapshot().started,'Close must stop narration');
    if(before.kind!=='sirius')check(release.adapters[before.kind].lastRelease?.geometries>0,`${before.kind} did not report geometry disposal`);
    return {before,after,resources:release};
  }
  async function measure(durationMs){
    check(!sample&&inspector.isOpen&&trials[openKind],'A single live visual must own the measurement');
    const before={conditions:conditions(),visual:trialState()},started=performance.now();sample={starts:[],submission:[],hidden:0,unfocused:0,motion:[]};
    await delay(durationMs);const raw=sample;sample=null;const completed=performance.now(),after={conditions:conditions(),visual:trialState()},intervals=raw.starts.slice(1).map((v,i)=>v-raw.starts[i]);
    check(intervals.length>=120,'Insufficient real rendered frames for sustained sample');
    const animated=openKind==='moon'?raw.motion.some(({state})=>state.camera.some((v,i)=>Math.abs(v-before.visual.camera[i])>.001)||Math.abs(state.lightAzimuth-before.visual.lightAzimuth)>.1):after.visual.elapsed>before.visual.elapsed+1;
    check(animated,'Sustained measurement must exercise actual animated content');
    return {kind:openKind,mode:before.conditions.mode,requestedDurationMs:durationMs,timerElapsedMs:completed-started,observedFrameSpanMs:raw.starts.at(-1)-raw.starts[0],frames:raw.starts.length,frameIntervalsMs:stats(intervals),frameSubmissionMs:stats(raw.submission),framesPerSecond:intervals.length*1000/(raw.starts.at(-1)-raw.starts[0]),intervalsOver33_333ms:intervals.filter(v=>v>1000/30).length,intervalsOver50ms:intervals.filter(v=>v>50).length,hiddenFrames:raw.hidden,unfocusedFrames:raw.unfocused,before,after,raw:{frameStartOffsetsMs:raw.starts.map(v=>v-raw.starts[0]),frameIntervalsMs:intervals,frameSubmissionMs:raw.submission,motionSamples:raw.motion}};
  }
  async function recovery(){
    const originalFetch=window.fetch;let requested=0;
    window.fetch=(url,options)=>String(url).endsWith('/assets/earth/clouds.jpg')?(requested++,Promise.resolve(new Response('',{status:404}))):originalFetch(url,options);
    mapBefore=mapPose();openKind='earth';
    try{await inspectObject(bodies.earth);check(requested===1&&inspector.status==='error'&&!document.getElementById('inspection-retry').hidden,'Missing cloud map must leave a retryable inspector');check(inspector.body.id==='solar:earth'&&narration.contentId==='solar:earth','Missing visual must retain information/transcript');}
    finally{window.fetch=originalFetch;}
    document.getElementById('inspection-retry').click();check(await inspector.ready,'Retry after missing map must load the real asset');watch(trials.earth.renderer);await twoFrames();const retried=trialState();const retryClose=await close();
    let release,held=false,pending;window.fetch=async(url,options)=>{if(String(url).endsWith('/assets/earth/clouds.jpg')&&!held){const r=await originalFetch(url,{...options,signal:undefined});await new Promise(resolve=>{release=resolve;held=true;});return r;}return originalFetch(url,options);};
    try{
      pending=inspectObject(bodies.earth);const until=performance.now()+5000;while(!held&&performance.now()<until)await delay(10);check(held,'Delayed real cloud request was not reached');
      await inspectObject(bodies.sirius);release();await pending;await delay(200);check(inspector.body.id===bodies.sirius.id&&!inspector.activeTrial&&narration.contentId===bodies.sirius.id,'Late Earth load replaced the newer star');
    }finally{window.fetch=originalFetch;release?.();if(pending)await pending;}
    openKind='sirius';mapBefore=mapPose();const cancelledClose=await close();check(JSON.stringify(kinds.map(k=>bodies[k]))===retainedCatalog,'Catalog changed during acceptance');return {missingMapRequests:requested,retried,retryClose,cancelledClose};
  }
  function state(){return {conditions:conditions(),visual:trialState(),resources:resources(),narration:narration.snapshot(),map:mapPose(),activeSample:sample?{frames:sample.starts.length,hidden:sample.hidden,unfocused:sample.unfocused}:null};}
  function validateCatalog(){check(JSON.stringify(kinds.map(k=>bodies[k]))===retainedCatalog,'Catalog changed during acceptance');return true;}
  window.__phase6Acceptance={twoFrames,conditions,heap,prepareMap,open,configure,close,measure,resources,ensureReleased,recovery,state,validateCatalog};
})();true;
