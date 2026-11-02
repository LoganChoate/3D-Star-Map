// Acceptance against the actual app, exported GLB, controls and WebGL draw.
// Run from a diagnostic host that optionally services __explorationVerification.
export async function verifyMoonAssetTrial({nativeBridge=false}={}) {
    const {explorer,moonTrial:trial} = window.galaxyMap;
    const check = (value,message) => { if (!value) throw new Error(message); };
    const el = id => document.getElementById(id);
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const frames = async (count=3) => { for (let i=0;i<count;i++) await frame(); };
    const checks = {};
    const sourceBefore = JSON.stringify(explorer.solarObjects.map(body => ({id:body.id,position:body.position,radiusKm:body.radiusKm})));
    const originalMode = explorer.currentMode;
    const originalViewport = {width:window.innerWidth,height:window.innerHeight};
    const request = async value => {
        window.__explorationVerification = value;
        const deadline = performance.now()+10000;
        while (window.__explorationVerification && performance.now()<deadline) await frame();
        check(!window.__explorationVerification,'Moon native input/capture timed out');
        await frames();
    };
    const pixels = async () => {
        await frame();
        const gl = trial.renderer.getContext();
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const values = new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,values);
        let hash = 2166136261, bright = 0, opaque = 0;
        for(let i=0;i<values.length;i+=16) {
            hash = Math.imul(hash ^ values[i],16777619) >>> 0;
            hash = Math.imul(hash ^ values[i+1],16777619) >>> 0;
            if (Math.max(values[i],values[i+1],values[i+2])>45) bright++;
            if (values[i+3]===255) opaque++;
        }
        check(opaque>0 && bright>20,'The actual Moon WebGL canvas must contain rendered illuminated surface pixels');
        return {hash,brightSamples:bright,width,height};
    };
    check(trial && !trial.isOpen,'Moon trial must exist and initially be closed');
    el('ex-mode-solar').click(); await frames();
    const moonRow = [...document.querySelectorAll('#ex-object-list [data-object-id]')].find(row => row.dataset.objectId==='solar:moon');
    check(moonRow,'Actual Solar System list must contain the Moon');
    moonRow.click(); await frames();
    check(explorer.selectedObject?.id==='solar:moon','The actual list must select the stable Moon identity');
    const openButton = el('ex-inspect-moon');
    check(openButton,'Moon information must offer the surface-inspection action');
    const mapBefore = {camera:explorer.camera.position.toArray(),target:explorer.controls.target.toArray(),selection:explorer.selectedObject.id,mode:explorer.currentMode};
    openButton.click();
    check(await trial.ready,'The actual exported Moon must load successfully');
    await frames();
    const initial = trial.snapshot();
    check(initial.status==='ready' && initial.objectId==='solar:moon','The inspection view must retain the selected identity');
    check(/^[a-f0-9]{64}$/.test(initial.asset?.sha256) && initial.asset.bytes>0,'Actual rendered GLB bytes must pass the manifest integrity check and be recorded in evidence');
    check(initial.geometry.meshes>0 && initial.geometry.triangles>0 && initial.renderer.triangles>0,'The exported mesh must reach an actual WebGL draw');
    check(initial.geometry.maximumRadius>initial.geometry.minimumRadius,'Actual exported geometry must contain non-flat radial relief');
    check(initial.renderer.textures>0,'The exported color texture must be loaded by the renderer');
    check(initial.textures.some(texture=>texture.role==='color') && initial.textures.some(texture=>texture.role==='normal'),'The actual exported material must retain both color and fine relief shading maps');
    check(initial.textures.every(texture=>Math.max(texture.width,texture.height)<=initial.renderer.maxTextureSize),'This device must display the documented working maps without an implicit maximum-size reduction');
    check(/1.*scale/i.test(el('moon-trial-facts').textContent) && /1,737.4/.test(el('moon-trial-facts').textContent),'The view must expose physical height scale and source mean radius');
    check(/not a live lunar phase/i.test(el('moon-trial-motion-note').textContent),'Inspection motion must not be misrepresented as a current phase');
    check(el('moon-trial').querySelectorAll('a[href^="https:"]').length>0,'The view must retain actual source links');
    checks.loadedAsset = initial;
    const lit = await pixels();
    const light = el('moon-trial-light');
    light.value='105'; light.dispatchEvent(new Event('input',{bubbles:true}));
    await frames();
    const changedLight = await pixels();
    check(lit.hash!==changedLight.hash,'Changing the actual light control must change rendered surface pixels');
    checks.realLighting = {before:lit,after:changedLight,azimuth:trial.snapshot().lightAzimuth};
    el('moon-trial-home').click(); await frames();
    const distance = Math.hypot(...trial.snapshot().camera);
    el('moon-trial-canvas').focus();
    el('moon-trial-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true})); await frames();
    check(Math.hypot(...trial.snapshot().camera)<distance,'Actual keyboard handler must zoom the 3D camera');
    const beforeTurntable = trial.snapshot().camera;
    el('moon-trial-turntable').click(); await frames(20);
    const afterTurntable = trial.snapshot().camera;
    check(afterTurntable.some((value,index)=>Math.abs(value-beforeTurntable[index])>0.001),'Turntable control must animate the inspection camera');
    el('moon-trial-turntable').click();
    const beforeSweep = trial.snapshot().lightAzimuth;
    el('moon-trial-sweep').click(); await frames(20);
    check(trial.snapshot().lightAzimuth!==beforeSweep,'Light sweep must update the actual scene light over time');
    el('moon-trial-sweep').click();
    checks.interactiveCameraAndLighting = {keyboardZoom:true,turntable:true,sweep:true};
    if (nativeBridge) {
        el('moon-trial-home').click(); light.value='-30';light.dispatchEvent(new Event('input',{bubbles:true}));await frames();
        const rect=el('moon-trial-canvas').getBoundingClientRect();
        const start={x:Math.round(rect.left+rect.width*0.5),y:Math.round(rect.top+rect.height*0.45)};
        const beforeWheel=Math.hypot(...trial.snapshot().camera);
        await request({kind:'input',events:[{type:'mouseMove',...start},{type:'mouseWheel',...start,deltaY:120,deltaX:0}]});
        check(Math.hypot(...trial.snapshot().camera)<beforeWheel,'Native wheel input must zoom the actual Moon camera');
        const before=trial.snapshot().camera;
        await request({kind:'input',events:[{type:'mouseMove',...start},{type:'mouseDown',...start,button:'left',clickCount:1},{type:'mouseMove',x:start.x+90,y:start.y+30,button:'left'},{type:'mouseUp',x:start.x+90,y:start.y+30,button:'left',clickCount:1}]});
        check(trial.snapshot().camera.some((value,index)=>Math.abs(value-before[index])>0.01),'Native drag must orbit the actual Moon view');
        el('moon-trial-home').click(); await frames();
        await request({kind:'screenshot',name:'moon-asset-nearside'});
        await request({kind:'resize',width:760,height:900});
        el('moon-trial-home').click();await frames();
        const narrow=el('moon-trial-canvas').getBoundingClientRect();
        const panel=el('moon-trial').querySelector('.moon-trial-panel').getBoundingClientRect();
        const exitButton=el('moon-trial-close').getBoundingClientRect();
        check(narrow.width>200 && narrow.height>200,'Narrow viewport must keep a usable Moon canvas');
        check(panel.top>=narrow.bottom-1 && panel.bottom<=window.innerHeight+1,'Narrow view must place a scrollable information panel below the canvas');
        check(exitButton.left>=0 && exitButton.right<=window.innerWidth,'Return to map must remain visible at a narrow width');
        await request({kind:'screenshot',name:'moon-asset-narrow'});
        await request({kind:'resize',...originalViewport});
        checks.nativeInspection={orbit:true,wheelZoom:true,narrowCanvas:{width:narrow.width,height:narrow.height}};
    }
    el('moon-trial-close').click(); await frames();
    check(!trial.isOpen && !el('moon-trial'),'Return to map must remove the inspection view');
    check(trial.snapshot().renderer===null && trial.snapshot().lastRelease.geometries>0 && trial.snapshot().lastRelease.textures>0,'Close must release owned render resources');
    const mapAfter={camera:explorer.camera.position.toArray(),target:explorer.controls.target.toArray(),selection:explorer.selectedObject.id,mode:explorer.currentMode};
    const sameVector=(before,after)=>before.every((value,index)=>Math.abs(value-after[index])<=1e-10*Math.max(1,Math.abs(value)));
    check(sameVector(mapBefore.camera,mapAfter.camera) && sameVector(mapBefore.target,mapAfter.target) && mapBefore.selection===mapAfter.selection && mapBefore.mode===mapAfter.mode,'Closing the view must preserve map camera, target, mode and identity');
    checks.mapReturn={preserved:true,before:mapBefore,after:mapAfter,resourceDisposalRequested:trial.snapshot().lastRelease};
    const loadsBeforeCancel=trial.completedLoads;
    el('ex-inspect-moon').click(); const pending=trial.ready;
    el('moon-trial-close').click();
    await pending;await frames();
    check(!trial.isOpen && !el('moon-trial') && trial.completedLoads===loadsBeforeCancel && trial.snapshot().renderer===null,'Closing during load must not reopen or retain a late scene');
    checks.closeDuringLoad=true;
    // Close after the real parser starts, while its embedded images decode.
    // Observe the visible loading message; do not substitute the loader.
    const discardedBefore=trial.discardedLoads;
    let cancelledDuringDecode=false;
    el('ex-inspect-moon').click();
    const decoding=trial.ready;
    const observer=new MutationObserver(()=>{
        if(trial.loadingStage==='decoding'){
            cancelledDuringDecode=true;
            observer.disconnect();
            el('moon-trial-close').click();
        }
    });
    observer.observe(el('moon-trial-message'),{childList:true});
    await decoding;observer.disconnect();await frames();
    check(cancelledDuringDecode && trial.discardedLoads===discardedBefore+1,'The actual asynchronous decoder must finish after closure and discard its late scene');
    check(!trial.isOpen && !el('moon-trial') && trial.snapshot().renderer===null && trial.snapshot().lastDiscardedRelease.geometries>0 && trial.snapshot().lastDiscardedRelease.textures>0,'Late decoded geometry and textures must receive disposal requests without creating a renderer');
    checks.closeDuringDecode={discardedLoads:trial.discardedLoads,resourceDisposalRequested:trial.snapshot().lastDiscardedRelease};
    const reopenResources=[];
    for(let i=0;i<2;i++) {
        el('ex-inspect-moon').click();check(await trial.ready,'Repeated actual asset load must succeed');await frames();
        reopenResources.push(trial.snapshot().renderer);
        el('moon-trial-close').click();await frames();
    }
    check(reopenResources[0].textures===reopenResources[1].textures && reopenResources[0].geometries===reopenResources[1].geometries,'Repeated visits must have stable current-view resource counts');
    checks.repeatedVisits={visits:2,currentViewResources:reopenResources,limit:'Counts and disposal requests are not a measurement of freed VRAM or long-term process memory.'};
    check(JSON.stringify(explorer.solarObjects.map(body=>({id:body.id,position:body.position,radiusKm:body.radiusKm})))===sourceBefore,'The inspection view must not alter source coordinates or radii');
    checks.catalogUnchanged=true;
    if(originalMode!=='solar')el('ex-mode-'+originalMode).click();
    return {status:'passed',checks};
}
