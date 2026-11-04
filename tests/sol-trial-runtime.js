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
    const pausedRasterLimits={maximumChannelStep:1,maximumChangedPixelFraction:0.0001,alphaMustMatch:true,meaning:'At most one 8-bit RGB code value in no more than 0.01% of pixels; exact animation, camera and canvas state is required separately.'};
    const pausedRasterDifference=(a,b)=>{
        check(a.width===b.width&&a.height===b.height&&a.values.length===b.values.length,'Paused pixel comparison dimensions must match');
        let changedPixels=0,absoluteChannelDifference=0,maxAbsoluteChannelDifference=0,maxAlphaDifference=0;
        for(let i=0;i<a.values.length;i+=4){
            const r=Math.abs(a.values[i]-b.values[i]),g=Math.abs(a.values[i+1]-b.values[i+1]),blue=Math.abs(a.values[i+2]-b.values[i+2]);
            if(r+g+blue)changedPixels++;
            absoluteChannelDifference+=r+g+blue;maxAbsoluteChannelDifference=Math.max(maxAbsoluteChannelDifference,r,g,blue);
            maxAlphaDifference=Math.max(maxAlphaDifference,Math.abs(a.values[i+3]-b.values[i+3]));
        }
        const pixelCount=a.width*a.height;
        return {pixelCount,changedPixels,changedPixelFraction:changedPixels/pixelCount,absoluteChannelDifference,meanAbsoluteChannelDifference:absoluteChannelDifference/(pixelCount*3),maxAbsoluteChannelDifference,maxAlphaDifference};
    };
    const pausedRasterStable=metrics=>metrics.maxAbsoluteChannelDifference<=pausedRasterLimits.maximumChannelStep&&metrics.changedPixelFraction<=pausedRasterLimits.maximumChangedPixelFraction&&metrics.maxAlphaDifference===0;
    // Exercise the bound with actual pixel arrays: sparse one-code-value
    // rounding is permitted, while brighter changes or wider motion fail.
    const rasterFixture={width:100,height:100,values:new Uint8Array(100*100*4)};
    const changedFixture={...rasterFixture,values:rasterFixture.values.slice()};
    changedFixture.values[0]=1;const oneStep=pausedRasterDifference(rasterFixture,changedFixture);
    changedFixture.values[0]=2;const largerStep=pausedRasterDifference(rasterFixture,changedFixture);
    changedFixture.values[0]=1;changedFixture.values[4]=1;const widerChange=pausedRasterDifference(rasterFixture,changedFixture);
    check(pausedRasterStable(oneStep)&&!pausedRasterStable(largerStep)&&!pausedRasterStable(widerChange),'Paused raster guard must accept sparse rounding and reject larger or widespread changes');
    checks.pausedRasterGuard={oneStepAccepted:true,largerStepRejected:true,widerChangeRejected:true,oneStep,largerStep,widerChange,limits:pausedRasterLimits};
    const renderState=()=>({elapsed:trial.elapsed,flowTime:trial.snapshot().activity.flowTime,activity:trial.snapshot().activity,surfaceTime:trial.surfaceUniforms.uTime.value,haloTime:trial.haloUniforms.uTime.value,paused:trial.paused,speed:trial.speed,camera:trial.camera.position.toArray(),quaternion:trial.camera.quaternion.toArray(),projection:trial.camera.projectionMatrix.toArray(),target:trial.controls.target.toArray(),autoRotate:trial.controls.autoRotate,canvas:{width:trial.canvas.width,height:trial.canvas.height,bounds:trial.canvas.getBoundingClientRect().toJSON(),pixelRatio:trial.renderer.getPixelRatio()},hidden:document.hidden,focused:document.hasFocus(),frameCount:trial.frameCount,programs:trial.renderer.info.programs?.map(program=>({id:program.id,usedTimes:program.usedTimes,runnable:program.diagnostics?.runnable}))});
    const stableRenderComparison=(beforePixels,afterPixels,before,after,controlChanges)=>{
        const {frameCount:beforeFrameCount,...stableBefore}=before,{frameCount:afterFrameCount,...stableAfter}=after;
        return {before,after,beforePixels:summary(beforePixels),afterPixels:summary(afterPixels),controlChanges,stateUnchanged:JSON.stringify(stableBefore)===JSON.stringify(stableAfter),...pausedRasterDifference(beforePixels,afterPixels),limits:pausedRasterLimits};
    };
    const renderRemainedStable=comparison=>comparison.stateUnchanged&&comparison.controlChanges===0&&!comparison.before.hidden&&comparison.before.focused&&pausedRasterStable(comparison);
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
    check(initial.activity&&!initial.activity.enabled&&el('sol-trial-eruption').disabled,'Scientific mode must suppress the enlarged ultraviolet-inspired plasma structures');
    check(/^[a-f0-9]{64}$/.test(initial.appearance.sha256),'Appearance bytes must be hashed for provenance');
    check(/695,700/.test(el('sol-trial-facts').textContent)&&/5,772/.test(el('sol-trial-facts').textContent),'Nominal reference radius and temperature must be shown');
    check(/unknown/i.test(el('sol-trial-facts').textContent)&&/not live solar observations/.test(el('sol-trial-motion-note').textContent),'Unknown activity and illustrative motion must be explicit');
    check(el('sol-trial').querySelectorAll('a[href^="https:"]').length>=2,'Sun reference sources must remain accessible');
    checks.loadedIllustration=initial;
    checks.performance=[await cadence('scientific-whole-disc')];
    el('sol-trial-pause').click();check(trial.paused,'Pause button must stop activity');
    el('sol-trial-reset').click();await frames();
    const scientific=pixels(),pausedTime=trial.elapsed,surfacePauseBefore=renderState();let surfaceControlChanges=0;
    const observeSurfaceControls=()=>{surfaceControlChanges++;};trial.controls.addEventListener('change',observeSurfaceControls);
    await frames(12);const paused=pixels(),surfacePauseAfter=renderState();trial.controls.removeEventListener('change',observeSurfaceControls);
    const pausedSurfaceComparison=stableRenderComparison(scientific,paused,surfacePauseBefore,surfacePauseAfter,surfaceControlChanges);
    checks.pausedSurface={elapsed:pausedTime,pixels:summary(paused),comparison:pausedSurfaceComparison};
    check(trial.paused&&trial.elapsed===pausedTime&&renderRemainedStable(pausedSurfaceComparison),`Paused surface must retain exact state with only bounded raster rounding: ${JSON.stringify(pausedSurfaceComparison)}`);
    checks.pausedSurface.stablePixels=true;
    el('sol-trial-artistic').click();await frames();const artistic=pixels();
    check(scientific.hash!==artistic.hash,'Scientific/artistic control must alter actual shader pixels');
    check(artistic.meanBrightRgb[0]/artistic.meanBrightRgb[2]>scientific.meanBrightRgb[0]/scientific.meanBrightRgb[2]*1.2,'Artistic mode must visibly differ in color, not only change its label');
    check(el('sol-trial-artistic').getAttribute('aria-pressed')==='true'&&/not a visible-light or ultraviolet observation/i.test(el('sol-trial-mode-note').textContent),'Artistic state and interpretation must be disclosed');
    checks.appearanceComparison={scientific:summary(scientific),artistic:summary(artistic),difference:difference(scientific,artistic)};
    if(nativeBridge)await request({kind:'screenshot',name:'sol-artistic-whole'});
    // Compare the same fixed surface with/without actual plasma meshes. Only
    // pixels beyond the projected photosphere count as evidence of an arch.
    const activity=trial.appearance.activity;
    const activityStart=trial.snapshot().activity;
    check(activityStart.enabled&&activityStart.loopCount===activity.loops.length&&activityStart.depthTest&&!activityStart.depthWrite,'Artistic arches must use real depth-tested geometry');
    el('sol-trial-eruption').click();await frames();
    check(trial.paused&&trial.snapshot().activity.opacity>0,'Show an eruption must reveal an event while respecting pause');
    const eventStartTime=trial.elapsed,flowAtPause=trial.snapshot().activity.flowTime;
    const eventPaused=pixels(),pauseBefore=renderState();let controlChanges=0;
    const observeControls=()=>{controlChanges++;};trial.controls.addEventListener('change',observeControls);
    await frames(8);const eventPausedAfter=pixels(),pauseAfter=renderState();trial.controls.removeEventListener('change',observeControls);
    const pausedPlasmaComparison=stableRenderComparison(eventPaused,eventPausedAfter,pauseBefore,pauseAfter,controlChanges);
    checks.pausedPlasmaComparison=pausedPlasmaComparison;
    check(trial.snapshot().activity.flowTime===flowAtPause&&renderRemainedStable(pausedPlasmaComparison),`Paused plasma must retain exact state with only bounded raster rounding: ${JSON.stringify(pausedPlasmaComparison)}`);
    const stages=[];
    for(const fraction of [0.20,0.58,0.92]) {
        trial.elapsed=activity.eruptionStartSeconds+activity.eruptionDurationSeconds*fraction;trial.updateTime();await frames();
        const stagePixels=pixels();stages.push({fraction,state:trial.snapshot().activity,pixels:summary(stagePixels)});
        if(nativeBridge)await request({kind:'screenshot',name:fraction===0.20?'sol-eruption-rising':fraction===0.58?'sol-eruption-expanding':'sol-eruption-fading'});
    }
    check(stages[1].state.eruptionApex.some((value,index)=>Math.abs(value-stages[0].state.eruptionApex[index])>0.1),'Ejection geometry must rise and expand above the surface');
    check(stages[2].state.opacity<stages[1].state.opacity&&stages[0].pixels.hash!==stages[1].pixels.hash,'Eruption must visibly evolve and fade');
    trial.elapsed=activity.eruptionStartSeconds+activity.eruptionDurationSeconds*0.58;trial.updateTime();await frames();
    const withPlasma=pixels();trial.plasma.group.visible=false;const withoutPlasma=pixels();trial.plasma.group.visible=true;
    const discRadius=withPlasma.height/(2*Math.tan(trial.camera.fov*Math.PI/360)*Math.sqrt(trial.camera.position.lengthSq()-1));
    let outsideChangedPixels=0;
    for(let y=0;y<withPlasma.height;y++)for(let x=0;x<withPlasma.width;x++){
        if(Math.hypot(x-withPlasma.width/2,y-withPlasma.height/2)<=discRadius+2)continue;
        const offset=(y*withPlasma.width+x)*4;
        const change=Math.abs(withPlasma.values[offset]-withoutPlasma.values[offset])+Math.abs(withPlasma.values[offset+1]-withoutPlasma.values[offset+1])+Math.abs(withPlasma.values[offset+2]-withoutPlasma.values[offset+2]);
        if(change>3)outsideChangedPixels++;
    }
    check(outsideChangedPixels>30,'Actual plasma meshes must produce visible pixels outside the stellar disc');
    // The central arch is hidden by the opaque star when viewed from behind.
    // A camera-facing overlay or disabled depth test would fail this comparison.
    const oldCamera=trial.camera.position.clone();trial.camera.position.set(0,0,-oldCamera.length());trial.controls.update();
    const priorVisible=trial.plasma.meshes.map(mesh=>mesh.visible);
    trial.plasma.meshes.forEach((mesh,index)=>{mesh.visible=index===0;});
    const hiddenBehind=pixels();trial.plasma.group.visible=false;const noBehind=pixels();
    check(hiddenBehind.hash===noBehind.hash,'The opaque photosphere must fully occlude the central far-side arch');
    trial.camera.position.copy(oldCamera);trial.controls.update();trial.plasma.meshes.forEach((mesh,index)=>{mesh.visible=priorVisible[index];});trial.plasma.group.visible=true;
    trial.setPaused(false);checks.performance.push(await cadence('artistic-whole-disc-eruption'));trial.setPaused(true);
    trial.elapsed=activity.eruptionStartSeconds+activity.eruptionDurationSeconds+0.1;trial.updateTime();
    check(!trial.plasma.eruption.visible&&trial.snapshot().activity.opacity===0,'An eruption must disappear when its finite event ends');
    el('sol-trial-reset').click();await frames();
    check(trial.elapsed===0&&trial.snapshot().activity.phase==='Quiet activity'&&trial.snapshot().activity.opacity===0,'Reset must restore quiet activity and the exact event start');
    checks.plasmaActivity={eventStartTime,pauseStable:true,stages,outsideChangedPixels,farSideOcclusion:true,finiteEvent:true,reset:true};
    el('sol-trial-scientific').click();await frames();
    check(!trial.plasma.group.visible&&el('sol-trial-eruption').disabled,'Changing back to scientific must hide all interpretive plasma meshes');
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
    // Compare the shipped cellular pace with the prior 1x pace over identical
    // illustration seconds. A spot-free central crop isolates convection from
    // spot animation, limb glow, plasma and camera/surface rotation.
    const savedConvectionView={camera:trial.camera.position.clone(),elapsed:trial.elapsed,rotation:trial.surfaceUniforms.uRotationRate.value,multiplier:trial.surfaceUniforms.uConvectionSpeedMultiplier.value};
    trial.setPaused(true);trial.surfaceUniforms.uRotationRate.value=0;
    trial.camera.position.set(0,0,1.13);trial.controls.update();
    const fixedConvectionCamera=trial.camera.position.toArray();
    const cropDifference=(a,b)=>{
        check(a.width===b.width&&a.height===b.height,'Convection sample dimensions must match');
        const left=Math.floor(a.width*0.2),right=Math.ceil(a.width*0.8),bottom=Math.floor(a.height*0.2),top=Math.ceil(a.height*0.8);
        let absolute=0,changedPixels=0;
        for(let y=bottom;y<top;y++)for(let x=left;x<right;x++){
            const i=(y*a.width+x)*4,d=Math.abs(a.values[i]-b.values[i])+Math.abs(a.values[i+1]-b.values[i+1])+Math.abs(a.values[i+2]-b.values[i+2]);
            absolute+=d;if(d>3)changedPixels++;
        }
        return {changedPixels,meanAbsoluteChannelDifference:absolute/((right-left)*(top-bottom)*3),crop:{left,bottom,width:right-left,height:top-bottom}};
    };
    const convectionSequences=[];
    try {
        for(const [name,multiplier] of [['prior-pace',1],['configured-pace',savedConvectionView.multiplier]]){
            trial.surfaceUniforms.uConvectionSpeedMultiplier.value=multiplier;
            let first,previous;const adjacentChanges=[],sampleHashes=[];
            for(const elapsed of [0,0.25,0.5,0.75,1]){
                trial.elapsed=elapsed;trial.updateTime();const sample=pixels();
                if(!first)first=sample;
                if(previous)adjacentChanges.push(cropDifference(previous,sample));
                previous=sample;sampleHashes.push({elapsed,hash:sample.hash});
                if(nativeBridge&&name==='configured-pace'&&(elapsed===0||elapsed===1))await request({kind:'screenshot',name:elapsed===0?'sol-convection-start':'sol-convection-one-second'});
            }
            convectionSequences.push({name,multiplier,sampleHashes,adjacentChanges,startToEnd:cropDifference(first,previous),meanAdjacentChannelDifference:adjacentChanges.reduce((sum,item)=>sum+item.meanAbsoluteChannelDifference,0)/adjacentChanges.length,unchangedClocks:{surface:trial.surfaceUniforms.uTime.value,halo:trial.haloUniforms.uTime.value,plasma:trial.snapshot().activity}});
        }
        const [prior,current]=convectionSequences;
        check(prior.sampleHashes[0].hash===current.sampleHashes[0].hash,'Cellular pace must preserve the exact initial surface');
        check(current.startToEnd.changedPixels>100,'Configured convection must visibly change the spot-free surface crop');
        const changeRatio=current.meanAdjacentChannelDifference/prior.meanAdjacentChannelDifference;
        check(Number.isFinite(changeRatio)&&changeRatio>1.5,'Configured convection must produce more pronounced short-interval surface changes than the prior pace');
        check(JSON.stringify(prior.unchangedClocks)===JSON.stringify(current.unchangedClocks),'Changing cellular pace must preserve the spot/halo/plasma clock and eruption state');
        check(fixedConvectionCamera.every((value,index)=>value===trial.camera.position.toArray()[index]),'Convection comparison camera must stay fixed');
        checks.convectionPace={durationSeconds:1,sampleStepSeconds:0.25,rotationDisabled:true,camera:fixedConvectionCamera,changeRatio,sequences:convectionSequences,method:'Actual RGB pixel changes in the central 60% width/height of a spot-free Artistic surface close-up. Identical deterministic illustration times compare configured cellular pace with a temporary 1x uniform. This measures visible temporal change, not fluid velocity or calibrated solar time.'};
    } finally {
        trial.surfaceUniforms.uConvectionSpeedMultiplier.value=savedConvectionView.multiplier;
        trial.surfaceUniforms.uRotationRate.value=savedConvectionView.rotation;
        trial.elapsed=savedConvectionView.elapsed;trial.updateTime();trial.camera.position.copy(savedConvectionView.camera);trial.controls.update();trial.setPaused(false);
    }
    const speed=el('sol-trial-speed');speed.value='0';speed.dispatchEvent(new Event('input',{bubbles:true}));const stoppedAt=trial.elapsed,stoppedPixels=pixels(),zeroSpeedBefore=renderState();let zeroSpeedControlChanges=0;
    const observeZeroSpeedControls=()=>{zeroSpeedControlChanges++;};trial.controls.addEventListener('change',observeZeroSpeedControls);
    await frames(15);const stoppedAfterPixels=pixels(),zeroSpeedAfter=renderState();trial.controls.removeEventListener('change',observeZeroSpeedControls);
    const zeroSpeedComparison=stableRenderComparison(stoppedPixels,stoppedAfterPixels,zeroSpeedBefore,zeroSpeedAfter,zeroSpeedControlChanges);
    checks.zeroSpeedComparison=zeroSpeedComparison;
    check(trial.speed===0&&trial.elapsed===stoppedAt&&renderRemainedStable(zeroSpeedComparison),`Zero illustration speed must retain exact state with only bounded raster rounding: ${JSON.stringify(zeroSpeedComparison)}`);
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
    check(trial.lastRelease.geometries===initial.activity.geometryCount+2&&trial.lastRelease.materials===initial.activity.materialCount+2&&trial.lastRelease.contextLossRequested,'The surface, halo, and every plasma mesh/material must be disposed');
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
            {name:'invalid-shader-parameter',response:()=>new Response(JSON.stringify({...validAppearance,surface:{...validAppearance.surface,granulationScale:0}})),message:/parameters/},
            {name:'invalid-convection-pace',response:()=>new Response(JSON.stringify({...validAppearance,surface:{...validAppearance.surface,convectionSpeedMultiplier:0}})),message:/parameters/},
            {name:'invalid-eruption-timing',response:()=>new Response(JSON.stringify({...validAppearance,activity:{...validAppearance.activity,periodSeconds:0}})),message:/timing/}
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
