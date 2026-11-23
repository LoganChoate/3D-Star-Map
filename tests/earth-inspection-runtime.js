// Injected diagnostics for the production Earth adapter and shared inspector.
// Real frames, native input and loader failures are exercised; no renderer is mocked.
window.__verifyEarthInspection = async function({inspector,narration,explorer,inspectObject,el,check,frames,delay,until,request,nativeClick,escape,pose,stage}) {
    const earth=explorer.solarObjects.find(body=>body.id==='solar:earth');
    check(earth,'The retained Solar System catalog must contain Earth');
    const retainedBody=JSON.stringify(earth), records={};
    // Preserve completed subchecks if a later native input or graphics assertion fails.
    window.__unifiedPartial.checks.earth=records;
    const snapshotMotion=trial=>{
        const s=trial.snapshot();
        return {elapsed:s.elapsed,surfaceTime:s.surfaceTime,cloudTime:s.cloudTime,rotationRadians:s.rotationRadians,cloudDriftRadians:s.cloudDriftRadians,camera:s.camera,target:s.target,quaternion:trial.camera.quaternion.toArray()};
    };
    const capture=async trial=>{
        await frames(3);
        trial.renderer.render(trial.scene,trial.camera);
        const gl=trial.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        const bytes=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        let illuminated=0,hash=2166136261;
        for(let i=0;i<bytes.length;i+=4){
            if(Math.max(bytes[i],bytes[i+1],bytes[i+2])>45)illuminated++;
            hash=Math.imul(hash^bytes[i],16777619)>>>0;
            hash=Math.imul(hash^bytes[i+1],16777619)>>>0;
            hash=Math.imul(hash^bytes[i+2],16777619)>>>0;
        }
        check(illuminated>1000,'Earth must produce visible geographic/atmospheric pixels');
        return {bytes,width,height,hash,illuminated};
    };
    const summary=({width,height,hash,illuminated})=>({width,height,hash,illuminated});
    const difference=(a,b)=>{
        check(a.width===b.width&&a.height===b.height,'Pixel comparison must retain canvas dimensions');
        let changed=0,changedOver2=0,maxChannelChange=0,maxAlphaChange=0,total=0;
        for(let i=0;i<a.bytes.length;i+=4){
            let largest=0;
            for(let c=0;c<3;c++){const d=Math.abs(a.bytes[i+c]-b.bytes[i+c]);largest=Math.max(largest,d);total+=d;}
            if(largest>0)changed++;
            if(largest>2)changedOver2++;
            maxChannelChange=Math.max(maxChannelChange,largest);
            maxAlphaChange=Math.max(maxAlphaChange,Math.abs(a.bytes[i+3]-b.bytes[i+3]));
        }
        return {changedPixels:changed,changedOver2,changedFraction:changed/(a.width*a.height),maxChannelChange,maxAlphaChange,meanAbsoluteRgbChange:total/(a.width*a.height*3)};
    };
    const released=trial=>{
        const s=trial.snapshot();
        check(!trial.isOpen&&s.renderer===null&&trial.renderer===null,'Earth renderer must be gone after returning to the map');
        check(s.lastRelease?.textures>=3&&s.lastRelease?.materials>=3&&s.lastRelease?.geometries>=1,'Closing Earth must release the actual map textures, materials and geometry');
        return s.lastRelease;
    };

    stage('earth-native-selection');
    el('ex-mode-solar').click();await frames();
    const row=[...document.querySelectorAll('#ex-object-list [data-object-id]')].find(item=>item.dataset.objectId===earth.id);
    await nativeClick(row);check(await inspector.ready,'Native Earth selection must load its actual close-up');
    const trial=inspector.earthTrial, mapBefore=pose();
    check(trial&&inspector.visualKind==='earth'&&inspector.body.id===earth.id,'Only the exact Earth identity receives Earth visuals');
    check(!inspector.sunTrial.isOpen&&!inspector.moonTrial.isOpen,'Earth must not reuse another body renderer');
    check(el('inspection-title').textContent.includes('Earth')&&el('inspection-catalog').textContent.includes('solar:earth'),'Earth catalog identity must stay visible');
    check(/historical|composite/i.test(el('inspection-visual-note').textContent)&&/illustrat/i.test(el('inspection-visual-note').textContent),'Earth provenance and illustration limits must be visible');
    check(narration.snapshot().contentId===earth.id&&!narration.snapshot().started,'Earth selection must set its own transcript without autoplay');
    check(el('inspection-narration-text').textContent.includes('Earth'),'Earth narration must describe the selected body');
    check(el('inspection-sources').querySelector('a[href^="https:"]'),'Earth catalog source links must remain available');
    const first=trial.snapshot();
    check(first.mode==='scientific'&&first.renderer.textures>=3&&first.renderer.triangles>0,'Initial scientific Earth must draw bundled maps on real geometry');
    records.nativeSelection={initial:first,transcript:el('inspection-narration-text').textContent};

    stage('earth-modes');
    await nativeClick(el('earth-trial-pause'));check(trial.paused,'Earth Pause must stop animation');
    await nativeClick(el('earth-trial-home'));await frames(8);
    const scientific=await capture(trial);
    await request({kind:'screenshot',name:'unified-earth-scientific'});
    await nativeClick(el('earth-trial-artistic'));
    const artistic=await capture(trial),modeDifference=difference(scientific,artistic);
    check(trial.mode==='artistic'&&el('earth-trial-artistic').getAttribute('aria-pressed')==='true','Artistic Earth state must match its selected control');
    check(modeDifference.changedOver2>100,'Scientific/artistic choice must change real Earth pixels');
    check(narration.snapshot().contentId===earth.id&&!narration.snapshot().started,'Changing appearance must not change or start narration');
    records.appearance={scientific:summary(scientific),artistic:summary(artistic),difference:modeDifference};
    await request({kind:'screenshot',name:'unified-earth-artistic'});

    stage('earth-cloud-motion');
    trial.setOrbitEnabled(false);trial.setRotationEnabled(false);trial.setPaused(false);
    const cloudA=await capture(trial),cloudStateA=snapshotMotion(trial);
    await delay(700);
    const cloudB=await capture(trial),cloudStateB=snapshotMotion(trial),cloudDifference=difference(cloudA,cloudB);
    check(cloudStateB.elapsed>cloudStateA.elapsed+.2,'Earth animation must advance with the real render clock');
    check(cloudStateB.rotationRadians===cloudStateA.rotationRadians&&JSON.stringify(cloudStateB.camera)===JSON.stringify(cloudStateA.camera),'Cloud-only comparison must hold surface and camera fixed');
    check(cloudDifference.changedOver2>20,'Cloud drift/evolution must visibly change the actual image with globe and camera held still');
    records.cloudMotion={before:cloudStateA,after:cloudStateB,difference:cloudDifference};
    await request({kind:'screenshot',name:'unified-earth-cloud-motion'});

    stage('earth-surface-rotation');
    const cloudMesh=trial.scene.getObjectByName('earth-clouds'),atmosphereMesh=trial.scene.getObjectByName('earth-atmosphere');
    check(cloudMesh&&atmosphereMesh&&trial.scene.getObjectByName('earth-surface'),'Earth needs separate actual surface, cloud and atmosphere meshes');
    const visibility=[cloudMesh.visible,atmosphereMesh.visible];
    try {
        cloudMesh.visible=false;atmosphereMesh.visible=false;trial.setRotationEnabled(true);
        const before=await capture(trial),beforeState=snapshotMotion(trial);await delay(700);
        const after=await capture(trial),afterState=snapshotMotion(trial),surfaceDifference=difference(before,after);
        check(afterState.rotationRadians!==beforeState.rotationRadians&&JSON.stringify(afterState.camera)===JSON.stringify(beforeState.camera),'Body rotation must advance independently of the held camera');
        check(surfaceDifference.changedOver2>100,'Actual geographic surface pixels must rotate with clouds and atmosphere hidden');
        records.surfaceRotation={before:beforeState,after:afterState,difference:surfaceDifference,method:'Only cloud and atmosphere mesh visibility changed temporarily; actual surface shader, maps and render loop retained.'};
    } finally {cloudMesh.visible=visibility[0];atmosphereMesh.visible=visibility[1];}

    stage('earth-passive-camera');
    trial.setOrbitEnabled(true);
    const cameraBefore=trial.snapshot().camera;await delay(700);const cameraAfter=trial.snapshot().camera;
    check(cameraAfter.some((v,i)=>Math.abs(v-cameraBefore[i])>.001),'Passive camera control must move the actual camera');
    records.passiveCamera={before:cameraBefore,after:cameraAfter};

    stage('earth-pause-and-manual-view');
    await nativeClick(el('earth-trial-pause'));await frames(8);
    const pausedBefore=await capture(trial),stateBefore=snapshotMotion(trial);
    records.pause={before:stateBefore,comparisons:[],roundingBudget:'Exact clocks, body rotation, camera pose/quaternion and alpha; at most 1 byte-level RGB change per channel on at most 0.1% of pixels. Larger changes or widespread one-code flicker fail.'};
    // A textured, antialiased framebuffer can round sparse channel samples by one
    // code value. Bound that noise to one thousandth of pixels, while requiring three
    // delayed frames to preserve every actual animation and camera value exactly.
    for(const intervalMs of [350,200,200]){
        await delay(intervalMs);
        const pausedAfter=await capture(trial),stateAfter=snapshotMotion(trial),pauseDifference=difference(pausedBefore,pausedAfter);
        records.pause.comparisons.push({intervalMs,after:stateAfter,difference:pauseDifference});
        check(JSON.stringify(stateBefore)===JSON.stringify(stateAfter),'Pause must retain exact clock, cloud/body state and camera pose');
        check(pauseDifference.maxChannelChange<=1&&pauseDifference.changedFraction<=.001&&pauseDifference.maxAlphaChange===0,'Pause must freeze actual Earth output, including passive camera motion');
    }
    await nativeClick(el('earth-trial-canvas'));
    const distanceBefore=Math.hypot(...trial.snapshot().camera);
    await request({kind:'input',events:[{type:'keyDown',keyCode:'='},{type:'keyUp',keyCode:'='}]});
    check(Math.hypot(...trial.snapshot().camera)<distanceBefore&&trial.paused,'Keyboard zoom must work while Earth stays paused');
    const rect=el('earth-trial-canvas').getBoundingClientRect(),point={x:Math.round(rect.left+rect.width*.5),y:Math.round(rect.top+rect.height*.45)},beforeDrag=trial.snapshot().camera;
    await request({kind:'input',events:[{type:'mouseMove',...point},{type:'mouseDown',...point,button:'left',clickCount:1},{type:'mouseMove',x:point.x+85,y:point.y+30,button:'left'},{type:'mouseUp',x:point.x+85,y:point.y+30,button:'left',clickCount:1}]});
    check(trial.snapshot().camera.some((v,i)=>Math.abs(v-beforeDrag[i])>.01)&&trial.paused,'Manual orbit must work while Earth animation stays paused');
    await request({kind:'input',events:[{type:'keyDown',keyCode:'Home'},{type:'keyUp',keyCode:'Home'}]});
    check(trial.paused&&!trial.snapshot().turntable,'Reset view must preserve pause and stop automatic orbit');
    records.manualViewWhilePaused=true;

    stage('earth-visibility');
    trial.setPaused(false);trial.setOrbitEnabled(true);await frames(8);
    if(narration.snapshot().available){await nativeClick(el('inspection-narration-play'));await until(()=>narration.snapshot().started,'Earth narration must start after explicit Play');}
    const background=await request({kind:'visibility',durationMs:500});
    check(background?.hiddenStart.hidden&&background.hiddenEnd.hidden,'Visibility check must hide the real application window');
    check(background.hiddenStart.visual.elapsed===background.hiddenEnd.visual.elapsed&&JSON.stringify(background.hiddenStart.visual.camera)===JSON.stringify(background.hiddenEnd.visual.camera),'Hidden Earth must stop both animation and camera motion');
    check(!background.hiddenEnd.narration.started&&!narration.snapshot().started,'Backgrounding must stop narration and never auto-resume it');
    const resumeElapsed=trial.snapshot().elapsed;await delay(250);const resumed=trial.snapshot();
    check(!document.hidden&&resumed.elapsed>resumeElapsed&&resumed.elapsed-background.hiddenEnd.visual.elapsed<.6,'Showing the app must resume animation without adding the hidden time');
    records.visibility={...background,resumed};

    stage('earth-layout');
    trial.setPaused(true);trial.resetView();
    const widthBefore=el('earth-trial-canvas').getBoundingClientRect().width;
    await nativeClick(el('inspection-toggle-info'));await delay(150);
    check(!inspector.snapshot().detailsVisible&&el('earth-trial-canvas').getBoundingClientRect().width>widthBefore,'Hide details must expand Earth into the full visual area');
    await request({kind:'screenshot',name:'unified-earth-immersive'});
    await nativeClick(el('inspection-toggle-info'));
    await request({kind:'resize',width:800,height:650});
    const closeRect=el('inspection-close').getBoundingClientRect(),canvasRect=el('earth-trial-canvas').getBoundingClientRect();
    check(closeRect.left>=0&&closeRect.right<=innerWidth&&closeRect.top>=0&&closeRect.bottom<=innerHeight,'Narrow Earth view must retain the return control');
    check(canvasRect.width>200&&canvasRect.height>150&&document.documentElement.scrollWidth<=innerWidth,'Narrow Earth view must retain a usable canvas without page overflow');
    await request({kind:'screenshot',name:'unified-earth-narrow'});
    await escape();records.release=released(trial);
    check(JSON.stringify(pose())===JSON.stringify(mapBefore),'Earth exit must restore the same map camera, selection and mode');
    check(document.activeElement===row,'Earth exit must return keyboard focus to its selected row');
    await request({kind:'resize',width:1400,height:900});
    records.layouts={expanded:true,narrow:true,mapReturn:true};

    stage('earth-missing-texture');
    const originalFetch=window.fetch;
    let failedRequests=0;
    window.fetch=(url,options)=>String(url).endsWith('/assets/earth/clouds.jpg')?(failedRequests++,Promise.resolve(new Response('',{status:404}))):originalFetch(url,options);
    try {
        await inspectObject(earth);check(failedRequests===1,'Missing texture check must intercept the actual Earth cloud request');
        check(inspector.status==='error'&&!el('inspection-retry').hidden,'A missing Earth map must show the shared retry control');
        check(el('inspection-catalog').textContent.includes('solar:earth')&&narration.snapshot().contentId===earth.id,'Earth information and narration must survive a visual-load failure');
        check(trial.renderer===null,'Failed Earth loading must not leave a partially rendered scene');
        await request({kind:'screenshot',name:'unified-earth-missing-map'});
    } finally {window.fetch=originalFetch;}
    await nativeClick(el('inspection-retry'));check(await inspector.ready,'Retry must load the real valid Earth textures');
    await capture(trial);await escape();records.retryRelease=released(trial);records.missingTextureAndRetry=true;

    stage('earth-delayed-superseded-load');
    const sirius=explorer.nearbyObjects.find(body=>/^sirius$/i.test(body.name));
    let release,held=false,pending;
    window.fetch=async(url,options)=>{
        if(String(url).endsWith('/assets/earth/clouds.jpg')&&!held){
            // Deliver a real response after selection changes, even though the
            // request was aborted. This exercises late generation cleanup.
            const response=await originalFetch(url,{...options,signal:undefined});
            await new Promise(resolve=>{release=resolve;held=true;});
            return response;
        }
        return originalFetch(url,options);
    };
    try {
        pending=inspectObject(earth);await until(()=>held,'Real cloud response was not reached for cancellation test');
        await inspectObject(sirius);release();await pending;await delay(150);await frames();
        check(inspector.body.id===sirius.id&&inspector.visualKind===null&&narration.snapshot().contentId===sirius.id,'A late Earth map must not replace the newer star or narration');
        check(trial.renderer===null&&!trial.isOpen&&!el('earth-trial-canvas'),'Superseded Earth loading must leave no scene or canvas behind');
        records.supersededLoad=trial.snapshot();
    } finally {window.fetch=originalFetch;release?.();if(pending)await pending;}
    await escape();

    stage('earth-reduced-motion');
    await request({kind:'media',reduce:true});await inspectObject(earth);check(await inspector.ready,'Earth must load with reduced motion');
    const reduced=trial.snapshot();
    check(inspector.snapshot().reducedMotion&&reduced.paused&&!reduced.turntable,'Reduced motion must pause Earth animation and passive orbit before review');
    const reducedA=await capture(trial);await delay(200);const reducedB=await capture(trial);
    check(difference(reducedA,reducedB).changedOver2===0,'Reduced-motion startup must not show animation changes');
    records.reducedMotion=reduced;
    await escape();await request({kind:'media',reduce:false});
    check(JSON.stringify(earth)===retainedBody,'Earth appearance must not mutate retained catalog values');
    return records;
};true;
