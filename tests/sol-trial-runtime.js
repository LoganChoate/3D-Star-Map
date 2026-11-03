// Exercises the production Sun inspector and its actual WebGL shaders.
export async function verifySunAssetTrial({nativeBridge=false}={}) {
    const {explorer,sunTrial:trial}=window.galaxyMap;
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const el=id=>document.getElementById(id);
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const frames=async(count=3)=>{for(let i=0;i<count;i++)await frame();};
    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const checks={};
    const originalMode=explorer.currentMode,originalViewport={width:window.innerWidth,height:window.innerHeight};
    const sourceBefore=JSON.stringify(explorer.solarObjects.map(body=>({id:body.id,position:body.position,radiusKm:body.radiusKm})));
    const request=async value=>{window.__explorationVerification=value;const deadline=performance.now()+10000;while(window.__explorationVerification&&performance.now()<deadline)await frame();check(!window.__explorationVerification,'Sun native input/capture timed out');await frames();};
    const pixels=()=>{
        // Render immediately before readback; this observes the production
        // material rather than relying on a preserved drawing buffer.
        trial.renderer.render(trial.scene,trial.camera);
        const gl=trial.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        const values=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,values);
        let hash=2166136261,bright=0,totalR=0,totalG=0,totalB=0;
        for(let i=0;i<values.length;i+=16){hash=Math.imul(hash^values[i],16777619)>>>0;hash=Math.imul(hash^values[i+1],16777619)>>>0;hash=Math.imul(hash^values[i+2],16777619)>>>0;if(Math.max(values[i],values[i+1],values[i+2])>45){bright++;totalR+=values[i];totalG+=values[i+1];totalB+=values[i+2];}}
        check(bright>30,'The actual Sun canvas must contain a visible luminous surface');
        return {hash,width,height,brightSamples:bright,meanBrightRgb:[totalR/bright,totalG/bright,totalB/bright],values};
    };
    const summary=p=>({hash:p.hash,width:p.width,height:p.height,brightSamples:p.brightSamples,meanBrightRgb:p.meanBrightRgb});
    const difference=(a,b)=>{check(a.values.length===b.values.length,'Pixel comparison dimensions must match');let changed=0,absolute=0;for(let i=0;i<a.values.length;i+=4){const d=Math.abs(a.values[i]-b.values[i])+Math.abs(a.values[i+1]-b.values[i+1])+Math.abs(a.values[i+2]-b.values[i+2]);if(d)changed++;absolute+=d;}return {changedPixels:changed,meanAbsoluteChannelDifference:absolute/(a.width*a.height*3)};};
    const cadence=async(label,milliseconds=1800)=>{
        trial.frameSamples=[];await delay(milliseconds);const samples=trial.frameSamples.slice();
        check(samples.length>20,'Sun cadence measurement needs actual rendered frames');
        check(samples.every(item=>!item.hidden&&item.focused),'Sun cadence measurement must stay visible and focused');
        const intervals=samples.slice(1).map((item,index)=>item.start-samples[index].start),sorted=[...intervals].sort((a,b)=>a-b);
        const submissions=samples.map(item=>item.end-item.start).sort((a,b)=>a-b);
        const q=(values,p)=>values[Math.min(values.length-1,Math.floor(values.length*p))];
        return {label,frames:samples.length,frameSpanMs:samples.at(-1).start-samples[0].start,frameIntervalMs:{median:q(sorted,0.5),p95:q(sorted,0.95),max:sorted.at(-1)},frameSubmissionMs:{median:q(submissions,0.5),p95:q(submissions,0.95)},intervalsOver33ms:intervals.filter(value=>value>1000/30).length,rawIntervalsMs:intervals,renderer:trial.snapshot().renderer,jsHeap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null,method:'Production Sun render-call cadence in a foreground window; not GPU completion or presentation timing. JS heap is a Chromium estimate; render-resource counts are not VRAM bytes.'};
    };
    check(trial&&!trial.isOpen,'Sun inspector must exist and start closed');
    el('ex-mode-solar').click();await frames();
    const row=[...document.querySelectorAll('#ex-object-list [data-object-id]')].find(item=>item.dataset.objectId==='sol');
    check(row,'Actual Solar System list must include Sol');row.click();await frames();
    check(explorer.selectedObject?.id==='sol','Actual list must select the stable Sol identity');
    const open=el('ex-inspect-sol');check(open,'Selected Sol must offer the stellar inspection action');
    const mapBefore={camera:explorer.camera.position.toArray(),target:explorer.controls.target.toArray(),selection:explorer.selectedObject.id,mode:explorer.currentMode};
    open.click();check(await trial.ready,'Actual Sun illustration must load successfully');await frames();
    const initial=trial.snapshot();
    check(initial.status==='ready'&&initial.objectId==='sol'&&initial.mode==='scientific','Sun opens in scientific mode with stable identity');
    check(initial.geometry.radius===1&&initial.geometry.triangles>0&&initial.renderer.triangles>0,'Actual spherical surface must reach a WebGL draw');
    check(initial.renderer.textures===0,'Live procedural Sun must not rely on static image textures');
    check(/^[a-f0-9]{64}$/.test(initial.appearance.sha256),'Appearance bytes must be hashed for provenance');
    check(/695,700/.test(el('sol-trial-facts').textContent)&&/5,772/.test(el('sol-trial-facts').textContent),'Nominal reference radius and temperature must be shown');
    check(/unknown/i.test(el('sol-trial-facts').textContent)&&/not live solar observations/.test(el('sol-trial-motion-note').textContent),'Unknown activity and illustrative motion must be explicit');
    check(el('sol-trial').querySelectorAll('a[href^="https:"]').length>=2,'Sun reference sources must remain accessible');
    checks.loadedIllustration=initial;
    checks.performance=[await cadence('scientific-whole-disc')];
    el('sol-trial-pause').click();check(trial.paused,'Pause button must stop activity');
    el('sol-trial-reset').click();await frames();
    const scientific=pixels(),pausedTime=trial.elapsed;await frames(12);const paused=pixels();
    check(scientific.hash===paused.hash&&trial.elapsed===pausedTime,'Paused surface pixels and activity time must remain stable without camera motion');
    checks.pausedSurface={stablePixels:true,elapsed:pausedTime,pixels:summary(paused)};
    el('sol-trial-artistic').click();await frames();const artistic=pixels();
    check(scientific.hash!==artistic.hash,'Scientific/artistic control must alter actual shader pixels');
    check(artistic.meanBrightRgb[0]/artistic.meanBrightRgb[2]>scientific.meanBrightRgb[0]/scientific.meanBrightRgb[2]*1.2,'Artistic mode must visibly differ in color, not only change its label');
    check(el('sol-trial-artistic').getAttribute('aria-pressed')==='true'&&/artistic choices/i.test(el('sol-trial-mode-note').textContent),'Artistic state and interpretation must be disclosed');
    checks.appearanceComparison={scientific:summary(scientific),artistic:summary(artistic),difference:difference(scientific,artistic)};
    if(nativeBridge)await request({kind:'screenshot',name:'sol-artistic-whole'});
    el('sol-trial-scientific').click();await frames();
    // Independent radial image samples check the visible result of the limb law.
    // The center and near-limb points avoid the known demonstration spot groups.
    const radial=pixels(),distance=trial.camera.position.length();
    const radiusPixels=radial.height/(2*Math.tan(trial.camera.fov*Math.PI/360)*Math.sqrt(distance*distance-1));
    const luminance=(x,y)=>{const offset=(Math.round(y)*radial.width+Math.round(x))*4;return (radial.values[offset]+radial.values[offset+1]+radial.values[offset+2])/3;};
    const center=luminance(radial.width/2,radial.height/2),ring=[];
    for(let i=0;i<12;i++){const angle=i*Math.PI/6;ring.push(luminance(radial.width/2+Math.cos(angle)*radiusPixels*0.92,radial.height/2+Math.sin(angle)*radiusPixels*0.92));}
    const ringMean=ring.reduce((sum,value)=>sum+value,0)/ring.length;
    check(center>ringMean*1.12,'Actual scientific photosphere must darken toward its visible limb');
    checks.limbDarkening={centerMeanRgb:center,nearLimbMeanRgb:ringMean,ringSamples:ring,radiusPixels,method:'Actual rendered pixel samples at 92% of projected sphere radius, not an observational calibration.'};
    if(nativeBridge)await request({kind:'screenshot',name:'sol-scientific-whole'});
    el('sol-trial-detail').click();await frames();
    check(trial.camera.position.length()<1.2,'Surface detail control must reach a view that resolves fine granulation');
    const rotationRate=trial.surfaceUniforms.uRotationRate.value;trial.surfaceUniforms.uRotationRate.value=0;
    el('sol-trial-reset').click();await frames();const beforeEvolution=pixels(),cameraBeforeEvolution=trial.camera.position.toArray();
    el('sol-trial-pause').click();await delay(1400);el('sol-trial-pause').click();await frames();const afterEvolution=pixels();
    const evolutionDifference=difference(beforeEvolution,afterEvolution);
    check(evolutionDifference.changedPixels>100,'Resolved actual surface cells must evolve even when shader rotation is disabled');
    check(cameraBeforeEvolution.every((value,index)=>value===trial.camera.position.toArray()[index]),'Surface evolution must occur with the camera held fixed');
    trial.surfaceUniforms.uRotationRate.value=rotationRate;
    checks.evolutionWithoutRotation={rotationTemporarilyDisabled:true,cameraHeldFixed:true,elapsed:trial.elapsed,...evolutionDifference};
    if(nativeBridge)await request({kind:'screenshot',name:'sol-scientific-detail'});
    el('sol-trial-pause').click();checks.performance.push(await cadence('scientific-surface-detail'));
    el('sol-trial-artistic').click();checks.performance.push(await cadence('artistic-surface-detail'));
    if(nativeBridge)await request({kind:'screenshot',name:'sol-artistic-detail'});
    const speed=el('sol-trial-speed');speed.value='0';speed.dispatchEvent(new Event('input',{bubbles:true}));const stoppedAt=trial.elapsed;await frames(15);
    check(trial.elapsed===stoppedAt,'Zero illustration speed must freeze surface evolution');
    speed.value='4';speed.dispatchEvent(new Event('input',{bubbles:true}));const acceleratedAt=trial.elapsed,timingStart=performance.now();await delay(350);const timingEnd=performance.now();
    const elapsedDelta=trial.elapsed-acceleratedAt;check(elapsedDelta>0.65&&elapsedDelta<(timingEnd-timingStart)/1000*4+0.15,'Speed control must drive the actual activity clock');
    el('sol-trial-pause').click();el('sol-trial-reset').click();await frames();check(trial.elapsed===0,'Reset activity must restore its deterministic start while paused');
    checks.activityControls={pause:true,zeroSpeed:true,reset:true,requestedSpeed:4,activityDelta:elapsedDelta,wallDeltaMs:timingEnd-timingStart};
    speed.value='1';speed.dispatchEvent(new Event('input',{bubbles:true}));el('sol-trial-home').click();await frames();
    const distanceBeforeKey=trial.camera.position.length();el('sol-trial-canvas').focus();el('sol-trial-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true}));await frames();
    check(trial.camera.position.length()<distanceBeforeKey,'Actual keyboard handler must zoom the Sun camera');
    const beforeTurntable=trial.camera.position.toArray();el('sol-trial-turntable').click();await frames(20);
    check(trial.camera.position.toArray().some((value,index)=>Math.abs(value-beforeTurntable[index])>0.001),'Turntable control must move the actual camera');el('sol-trial-home').click();await frames();
    checks.keyboardAndTurntable={zoom:true,turntable:true};
    if(nativeBridge) {
        const rect=el('sol-trial-canvas').getBoundingClientRect(),start={x:Math.round(rect.left+rect.width*0.5),y:Math.round(rect.top+rect.height*0.43)};
        const beforeWheel=trial.camera.position.length();await request({kind:'input',events:[{type:'mouseMove',...start},{type:'mouseWheel',...start,deltaY:120,deltaX:0}]});
        check(trial.camera.position.length()<beforeWheel,'Native wheel must zoom the Sun camera');const beforeDrag=trial.camera.position.toArray();
        await request({kind:'input',events:[{type:'mouseMove',...start},{type:'mouseDown',...start,button:'left',clickCount:1},{type:'mouseMove',x:start.x+110,y:start.y+20,button:'left'},{type:'mouseUp',x:start.x+110,y:start.y+20,button:'left',clickCount:1}]});
        check(trial.camera.position.toArray().some((value,index)=>Math.abs(value-beforeDrag[index])>0.01),'Native drag must orbit the actual Sun');
        el('sol-trial-home').click();await frames();await request({kind:'resize',width:760,height:900});el('sol-trial-home').click();await frames();
        const canvas=el('sol-trial-canvas').getBoundingClientRect(),panel=el('sol-trial').querySelector('.sol-trial-panel').getBoundingClientRect(),exit=el('sol-trial-close').getBoundingClientRect();
        check(canvas.width>200&&canvas.height>200&&panel.top>=canvas.bottom-1&&panel.bottom<=window.innerHeight+1,'Narrow layout must retain usable canvas and stacked scrolling panel');
        check(exit.left>=0&&exit.right<=window.innerWidth,'Return control must stay visible at narrow width');await request({kind:'screenshot',name:'sol-artistic-narrow'});
        await request({kind:'resize',...originalViewport});checks.nativeInspection={wheel:true,orbit:true,narrow:{width:canvas.width,height:canvas.height}};
    }
    el('sol-trial-close').click();await frames();
    check(!trial.isOpen&&!el('sol-trial')&&trial.snapshot().renderer===null,'Close must remove the Sun inspector and release renderer');
    check(trial.lastRelease.geometries===2&&trial.lastRelease.materials===2&&trial.lastRelease.contextLossRequested,'Both actual procedural meshes and shader materials must be disposed');
    const mapAfter={camera:explorer.camera.position.toArray(),target:explorer.controls.target.toArray(),selection:explorer.selectedObject.id,mode:explorer.currentMode};
    const same=(before,after)=>before.every((value,index)=>Math.abs(value-after[index])<=1e-10*Math.max(1,Math.abs(value)));
    check(same(mapBefore.camera,mapAfter.camera)&&same(mapBefore.target,mapAfter.target)&&mapBefore.selection===mapAfter.selection&&mapBefore.mode===mapAfter.mode,'Return must preserve map camera, target, mode and Sol identity');
    checks.mapReturn={preserved:true,before:mapBefore,after:mapAfter,disposal:trial.lastRelease};
    const loadsBefore=trial.completedLoads;el('ex-inspect-sol').click();const pending=trial.ready;el('sol-trial-close').click();await pending;await frames();
    check(!trial.isOpen&&!el('sol-trial')&&trial.completedLoads===loadsBefore&&trial.snapshot().renderer===null,'Closing during appearance load must not create a late renderer');checks.closeDuringLoad=true;
    const visits=[];for(let i=0;i<2;i++){el('ex-inspect-sol').click();check(await trial.ready,'Repeated Sun opening must succeed');await frames();visits.push(trial.snapshot().renderer);el('sol-trial-close').click();await frames();}
    check(visits[0].textures===visits[1].textures&&visits[0].geometries===visits[1].geometries&&visits[0].programs===visits[1].programs,'Repeated Sun visits must use stable current-view resource counts');
    checks.repeatedVisits={visits:2,resources:visits,limit:'Disposal requests and current-view counts are not a measurement of released VRAM or long-term memory.'};
    // A damaged or missing local appearance file must fail visibly and leave
    // the map recoverable. Only these failure cases replace the fetch response;
    // the visual and interaction checks above use the real bundled bytes.
    const originalFetch=window.fetch;
    const appearanceUrl=new URL('../assets/sol/appearance.json',import.meta.url);
    const validAppearance=await originalFetch(appearanceUrl).then(response=>response.json());
    checks.failureRecovery=[];
    try {
        for(const failure of [
            {name:'missing-local-file',response:()=>new Response('',{status:404}),message:/unavailable/},
            {name:'wrong-object-identity',response:()=>new Response(JSON.stringify({...validAppearance,body:{...validAppearance.body,id:'not-sol'}})),message:/identity/},
            {name:'invalid-shader-parameter',response:()=>new Response(JSON.stringify({...validAppearance,surface:{...validAppearance.surface,granulationScale:0}})),message:/parameters/}
        ]) {
            window.fetch=(input,options)=>String(input)===appearanceUrl.href?Promise.resolve(failure.response()):originalFetch(input,options);
            el('ex-inspect-sol').click();check(await trial.ready===false,'Invalid Sun input must not report success');
            check(trial.status==='error'&&failure.message.test(el('sol-trial-message').textContent),'Invalid Sun input must show a useful error');
            check(trial.renderer===null,'Invalid appearance must not leave a live renderer');
            el('sol-trial-close').click();await frames();
            check(!trial.isOpen&&!explorer.suspended,'Error exit must restore the map');
            checks.failureRecovery.push(failure.name);
        }
    } finally {window.fetch=originalFetch;}
    el('ex-inspect-sol').click();check(await trial.ready,'Real bundled appearance must load again after errors');el('sol-trial-close').click();await frames();
    check(JSON.stringify(explorer.solarObjects.map(body=>({id:body.id,position:body.position,radiusKm:body.radiusKm})))===sourceBefore,'Sun rendering must preserve all catalog coordinates and radii');checks.catalogUnchanged=true;
    el('ex-mode-nearby').click();await frames();
    const nearbySol=[...document.querySelectorAll('#ex-object-list [data-object-id]')].find(item=>item.dataset.objectId==='sol');
    check(nearbySol,'Nearby collection must retain the same Sol identity');nearbySol.click();await frames();
    el('ex-inspect-sol').click();check(await trial.ready,'Nearby Sol must open the same Sun inspector');
    check(trial.snapshot().objectId==='sol','Nearby inspection must preserve Sol identity');
    el('sol-trial-close').click();await frames();
    check(explorer.currentMode==='nearby'&&explorer.selectedObject.id==='sol','Return must preserve nearby selection');checks.nearbySolIdentity=true;
    if(originalMode!=='nearby')el('ex-mode-'+originalMode).click();
    return {status:'passed',checks};
}
