// Acceptance against the real packaged explorer, with Chromium keyboard/mouse
// input dispatched by offline-runtime.cjs and screenshots of the actual scene.
export async function verifyExploration() {
    const e = window.galaxyMap.explorer;
    const checks = {};
    const check = (value, message) => { if (!value) throw new Error(message); };
    const el = id => document.getElementById(id);
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const request = async value => {
        window.__explorationVerification = value;
        const deadline = performance.now() + 8000;
        while (window.__explorationVerification && performance.now() < deadline) await frame();
        check(!window.__explorationVerification, 'Exploration input/capture timed out');
        await frame();
    };
    const input = events => request({kind:'input',events});
    const key = async keyCode => {e.canvas.focus();await input([{type:'keyDown',keyCode},{type:'keyUp',keyCode}]);};
    const snapshot = name => request({kind:'screenshot',name});
    const search = async query => {
        el('ex-search').value=query;
        el('ex-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await frame();
    };
    const measure = async (from,to) => {
        for (const [which,id] of [['from',from],['to',to]]) {
            el(`ex-measure-${which}`).value=id;
            el(`ex-measure-${which}`).dispatchEvent(new Event('change',{bubbles:true}));
        }
        await frame();
        check(e.measurement.result && e.measurementLine && e.scene.children.includes(e.measurementLine), 'Distance selectors must create a visible measurement line');
        return e.measurement.result;
    };
    const preset = async id => {document.querySelector(`#ex-presets [data-preset="${id}"]`).click();await frame();};
    check(e && e.currentMode==='atlas', 'Explorer must coexist with original atlas');
    el('ex-mode-solar').click();await frame();
    check(e.currentMode==='solar' && !el('ex-workspace').hidden, 'Solar System button must open the real scene');
    check(e.objects.length===10, 'Solar System must contain Sun, eight planets and Moon');
    check(e.objects.filter(body=>body.id.startsWith('solar:') && body.id!=='solar:moon').length===8, 'Exactly eight planets are required');
    check(e.points.geometry.getAttribute('position').count===10, 'All Solar bodies must have actual rendered vertices');
    check(!window.galaxyMap.renderer.activeControls.enabled, 'Hidden atlas controls must be disabled');
    check(/2000/.test(el('ex-epoch').textContent) && /not current/.test(el('ex-epoch').textContent), 'Historical snapshot must be explicit in the visible view');
    check(/enlarged/.test(el('ex-scale-note').textContent) && /not physical/.test(el('ex-scale-note').textContent), 'Marker exaggeration must be explicit');
    checks.objects={solar:e.objects.map(body=>({id:body.id,name:body.name})),epoch:el('ex-epoch').textContent};
    await snapshot('solar-overview');

    // Resize the real application window so horizontal field of view becomes
    // the limiting dimension, then exercise the existing frame-all control.
    const originalViewport={width:window.innerWidth,height:window.innerHeight};
    const wideRange=e.camera.position.distanceTo(e.controls.target);
    await request({kind:'resize',width:900,height:900});
    check(window.innerWidth===900 && window.innerHeight===900,'Native resize must produce the requested content viewport');
    await preset('all');
    const narrowRect=e.canvas.getBoundingClientRect();
    const narrowRange=e.camera.position.distanceTo(e.controls.target);
    check(narrowRect.width<narrowRect.height && e.camera.aspect<1,'Regression must exercise a stage narrower than its height');
    check(narrowRange>wideRange,'Frame all must allow more distance when the horizontal view narrows');
    const narrowProjection=e.objects.map(body=>({id:body.id,point:e.worldPosition(body).project(e.camera)}));
    check(narrowProjection.every(({point})=>[point.x,point.y,point.z].every(Number.isFinite) && Math.abs(point.x)<=1 && Math.abs(point.y)<=1 && point.z>=-1 && point.z<=1),'Every Solar System marker must remain within the narrow view clip bounds');
    checks.narrowFraming={viewport:{width:window.innerWidth,height:window.innerHeight},canvas:{width:narrowRect.width,height:narrowRect.height},cameraRangeAU:narrowRange,wideCameraRangeAU:wideRange,objectsInsideClip:narrowProjection.length,maxAbsX:Math.max(...narrowProjection.map(({point})=>Math.abs(point.x))),maxAbsY:Math.max(...narrowProjection.map(({point})=>Math.abs(point.y)))};
    await snapshot('narrow-overview');
    await request({kind:'resize',...originalViewport});
    check(window.innerWidth===originalViewport.width && window.innerHeight===originalViewport.height,'Original content viewport must be restored');
    await preset('all');

    // The actual search handler must find every body and expose its identity,
    // finite physical radius, retained coordinates and traceable HTTPS sources.
    for (const body of e.solarObjects) {
        await search(`  ${body.name.toUpperCase()}  `);
        check(e.selectedObject?.id===body.id,'Search must resolve '+body.name);
        check(el('ex-object-name').dataset.objectId===body.id,'Panel identity must match '+body.name);
        check(el('ex-object-info').textContent.includes('km'), 'Physical radius must be available');
        check(document.querySelectorAll('#ex-object-info a[href^="https:"]').length>0, 'Object must expose primary source links');
    }
    await search('Earth');
    el('ex-measure-selected').click();
    check(e.measurement.from.id==='solar:earth','Measure from here must use the selected object');
    const earthMoon=await measure('solar:earth','solar:moon');
    check(Math.abs(earthMoon.km-402448.6399082198)<0.01,'Earth–Moon measurement must match retained JPL snapshot');
    check(el('ex-distance-secondary').textContent==='402,449 km','User must see rounded Earth–Moon kilometres');
    await preset('earth-moon');
    const closeRange=e.camera.position.distanceTo(e.controls.target);
    check(closeRange<0.02 && closeRange>0.002,'Earth–Moon preset must use a genuine local scale');
    checks.earthMoon={...earthMoon,label:el('ex-distance-secondary').textContent,cameraRangeAU:closeRange};
    // Bring the existing sidebar measurement into the screenshot without
    // changing scene data or hiding relevant UI.
    el('ex-distance').scrollIntoView({block:'end'});await frame();
    await snapshot('earth-moon');

    // A native click on Earth's actual projected marker validates picking,
    // including the sidebar/header canvas offsets and OrbitControls capture.
    const earth=e.objects.find(body=>body.id==='solar:earth');
    const projected=e.worldPosition(earth).project(e.camera);
    const rect=e.canvas.getBoundingClientRect();
    const point={x:Math.round(rect.left+(projected.x+1)*rect.width/2),y:Math.round(rect.top+(1-projected.y)*rect.height/2)};
    check(projected.z>=-1 && projected.z<=1,'Earth marker must be visible');
    e.clearSelection();
    await input([{type:'mouseMove',...point},{type:'mouseDown',...point,button:'left',clickCount:1},{type:'mouseUp',...point,button:'left',clickCount:1}]);
    check(e.selectedObject?.id==='solar:earth','Native marker click must select Earth');
    checks.nativePicking={selectedId:e.selectedObject.id,canvasLeft:rect.left,canvasTop:rect.top};
    // Real OrbitControls wheel + drag, and actual keyboard event dispatch.
    const center={x:Math.round(rect.left+rect.width*0.55),y:Math.round(rect.top+rect.height*0.7)};
    const beforeWheel=e.camera.position.distanceTo(e.controls.target);
    let receivedWheel=null;
    e.canvas.addEventListener('wheel',event=>{receivedWheel=event.deltaY;},{once:true});
    // Electron wheel input uses the platform direction; Chromium's DOM wheel
    // delta has the opposite sign. Verify the delivered event as well as motion.
    await input([{type:'mouseMove',...center},{type:'mouseWheel',...center,deltaY:120,deltaX:0}]);
    check(receivedWheel<0,'Native wheel input must deliver an upward DOM wheel event');
    check(e.camera.position.distanceTo(e.controls.target)<beforeWheel,`Native wheel must zoom in (${beforeWheel} -> ${e.camera.position.distanceTo(e.controls.target)}, delta ${receivedWheel})`);
    const beforeDrag=e.camera.position.clone();
    await input([{type:'mouseDown',...center,button:'left',clickCount:1},{type:'mouseMove',x:center.x+65,y:center.y+18,button:'left'},{type:'mouseUp',x:center.x+65,y:center.y+18,button:'left',clickCount:1}]);
    check(e.camera.position.distanceTo(beforeDrag)>1e-5,'Native drag must orbit');
    const beforePan=e.controls.target.clone();await key('Right');
    check(e.controls.target.distanceTo(beforePan)>1e-6,'Arrow key must pan the actual camera target');
    const normalPanDistance=e.controls.target.distanceTo(beforePan);
    const beforeShiftPan=e.controls.target.clone();
    let deliveredShift=false;
    const observeShift=event=>{if(event.key==='ArrowRight')deliveredShift=event.shiftKey;};
    e.canvas.addEventListener('keydown',observeShift);
    e.canvas.focus();
    await input([{type:'keyDown',keyCode:'Shift'},{type:'keyDown',keyCode:'Right',modifiers:['shift']},{type:'keyUp',keyCode:'Right',modifiers:['shift']},{type:'keyUp',keyCode:'Shift'}]);
    e.canvas.removeEventListener('keydown',observeShift);
    const shiftPanDistance=e.controls.target.distanceTo(beforeShiftPan);
    const shiftPanRatio=shiftPanDistance/normalPanDistance;
    check(deliveredShift,'Native Shift-arrow input must reach the canvas with Shift held');
    check(shiftPanRatio>3 && shiftPanRatio<4,'Shift-arrow must pan substantially farther than the ordinary arrow at the same navigation scale');
    const beforePlus=e.camera.position.distanceTo(e.controls.target);await key('=');
    check(e.camera.position.distanceTo(e.controls.target)<beforePlus,'Keyboard plus/equal must zoom');
    await key('Home');
    check(e.currentPreset==='all' && e.camera.position.distanceTo(e.controls.target)>30,'Home must return from Moon scale to full Solar System');
    const fullRange=e.camera.position.distanceTo(e.controls.target);
    await preset('inner');
    check(e.camera.position.distanceTo(e.controls.target)<fullRange/5,'Inner-planet preset must change navigation scale');
    const sunEarth=await measure('sol','solar:earth');
    check(Math.abs(sunEarth.au-0.983327678869056)<1e-12,'Sun–Earth separation must retain real AU scale');
    checks.navigation={wheelZoom:true,receivedWheelDelta:receivedWheel,pointerOrbit:true,keyboardPan:true,keyboardZoom:true,homeFrameAll:true,fullRangeAU:fullRange,innerRangeAU:e.camera.position.distanceTo(e.controls.target)};
    checks.navigation.shiftPan={nativeShiftDelivered:deliveredShift,normalDistanceAU:normalPanDistance,shiftDistanceAU:shiftPanDistance,ratio:shiftPanRatio};
    checks.sunEarth={...sunEarth,label:el('ex-distance-primary').textContent};

    await search('  sIrIuS  ');
    check(e.currentMode==='nearby' && e.selectedObject?.id==='hyg:32263','Search must cross from Solar System to exact nearby Sirius');
    check(e.objects.length===13,'Nearby view must contain Sun plus twelve curated HYG stars');
    check(!e.measurement.result && !e.measurementLine,'Changing coordinate frames must clear old measurement');
    check(el('ex-distance-primary').textContent==='Choose two objects','Old distance label must be cleared');
    check(/parsecs/.test(el('ex-scale-note').textContent),'Nearby view must declare parsec units');
    const proxima=e.objects.find(body=>/proxima/i.test(body.name));
    check(proxima,'Curated set must include Proxima Centauri');
    await search(proxima.name);
    check(e.selectedObject.id===proxima.id,'Proxima search must preserve stable catalog identity');
    const sunProxima=await measure('sol',proxima.id);
    check(Math.abs(sunProxima.pc-1.2957566504008382)<1e-12,'Sun–Proxima must use retained Cartesian coordinates');
    check(Math.abs(sunProxima.ly-4.22619295497118)<1e-11,'Nearby distance must convert correctly to light-years');
    await preset('all');
    check([...e.points.geometry.attributes.position.array].every(Number.isFinite),'Nearby rendered coordinates must remain finite');
    checks.nearby={objects:e.objects.length,proximaId:proxima.id,measurement:sunProxima,label:el('ex-distance-secondary').textContent};
    el('ex-distance').scrollIntoView({block:'end'});await frame();await snapshot('nearby-stars');

    // Marker size must remain bounded at every navigation scale and source
    // geometry must remain tied to the original independent catalog objects.
    const sizes=Array.from(e.points.geometry.getAttribute('markerSize').array);
    check(sizes.every(size=>size>=9 && size<=17),'Markers must stay bounded in CSS pixels');
    check(e.renderer.getContext().getError()===0,'Exploration WebGL must finish without an error');
    await key('Escape');check(!e.selectedObject,'Escape must clear selected object');
    el('ex-mode-atlas').click();await frame();
    check(e.currentMode==='atlas' && el('ex-workspace').hidden && window.galaxyMap.renderer.activeControls.enabled,'Returning to atlas must restore its controls');
    check(window.galaxyMap.renderer.fullStarData.length===117735,'Original atlas catalog must be preserved');
    // Hold real flight keys while leaving the atlas, release them in another
    // view, then return. Disabled FlyControls otherwise miss those releases.
    const atlas=window.galaxyMap.renderer;
    const wasFlying=atlas.activeControls===atlas.flyControls;
    if(!wasFlying)el('toggle-fly-mode-button').click();
    const beforeFlight=atlas.camera.position.clone();
    await input([{type:'keyDown',keyCode:'W'},{type:'keyDown',keyCode:'Right'}]);
    check(atlas.flyControls.moveState.forward===1 && atlas.flyControls.moveState.yawRight===1,'Native held keys must activate actual flight movement and rotation');
    check(atlas.camera.position.distanceTo(beforeFlight)>0,'Held flight input must move the actual atlas camera');
    el('ex-mode-solar').click();await frame();
    await input([{type:'keyUp',keyCode:'W'},{type:'keyUp',keyCode:'Right'}]);
    check(Object.values(atlas.flyControls.moveState).every(value=>value===0),'Leaving the atlas must clear held flight keys');
    check(atlas.flyControls.moveVector.lengthSq()===0 && atlas.flyControls.rotationVector.lengthSq()===0 && atlas.flyControls.status===0,'Suspended flight movement, rotation and drag must all be neutral');
    const suspendedPosition=atlas.camera.position.clone();
    const suspendedRotation=atlas.camera.quaternion.clone();
    const resumeStarted=performance.now();
    el('ex-mode-atlas').click();
    check(atlas.clock.oldTime>=resumeStarted,'Returning to the atlas must discard time spent in the other view before flight resumes');
    await frame();await frame();
    check(atlas.activeControls===atlas.flyControls && atlas.flyControls.enabled,'Returning to atlas must preserve Fly mode');
    check(atlas.camera.position.distanceTo(suspendedPosition)<1e-10 && atlas.camera.quaternion.angleTo(suspendedRotation)<1e-7,'Released keys must not cause flight drift when returning to atlas');
    const beforeNewFlight=atlas.camera.position.clone();
    await input([{type:'keyDown',keyCode:'W'}]);
    await input([{type:'keyUp',keyCode:'W'}]);
    check(atlas.camera.position.distanceTo(beforeNewFlight)>0,'Fresh flight input must still work after the view switch');
    if(!wasFlying)el('toggle-fly-mode-button').click();
    checks.flightModeSwitch={heldMovementAndRotationCleared:true,returnWithoutDrift:true,pausedTimeDiscarded:true,freshInputWorks:true};
    checks.scaleHonesty={minMarkerCssPixels:Math.min(...sizes),maxMarkerCssPixels:Math.max(...sizes),atlasRestored:true,remoteAssetsRequired:false};
    return checks;
}
