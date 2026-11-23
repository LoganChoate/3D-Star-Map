// Focused regression: actual native drag, immediate inspection, then map resume.
window.__verifyInspectionInertia=async function(){
  const {renderer:atlas,explorer,inspector,inspectObject}=window.galaxyMap;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const frames=async n=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame);};
  const check=(v,m)=>{if(!v)throw Error(m);};
  const records=window.__inertiaRecords=[];
  const body=explorer.nearbyObjects.find(o=>o.id==='hyg:32263');check(body,'Sirius is required');
  const pose=(camera,controls)=>({camera:camera.position.toArray(),target:controls.target.toArray(),quaternion:camera.quaternion.toArray()});
  const difference=(a,b)=>({camera:Math.hypot(...a.camera.map((v,i)=>v-b.camera[i])),target:Math.hypot(...a.target.map((v,i)=>v-b.target[i])),quaternion:Math.max(...a.quaternion.map((v,i)=>Math.abs(v-b.quaternion[i])))});
  const request=async value=>{window.__inertiaRequest=value;const deadline=performance.now()+8000;while(window.__inertiaRequest&&performance.now()<deadline)await delay(5);check(!window.__inertiaRequest,'Native inertia input did not finish');};
  for(const mode of ['solar','atlas']){
    document.getElementById('ex-mode-'+mode).click();await frames(5);
    if(mode==='solar')document.getElementById('ex-home').click();
    else document.getElementById('resetViewButton').click();
    await frames(15);
    const camera=mode==='atlas'?atlas.camera:explorer.camera,controls=mode==='atlas'?atlas.activeControls:explorer.controls,canvas=mode==='atlas'?atlas.canvas:explorer.canvas;
    check(controls.enableDamping===true,'Regression requires the real damped orbit control');
    const initial=pose(camera,controls),rect=canvas.getBoundingClientRect(),start={x:Math.round(rect.left+rect.width*.55),y:Math.round(rect.top+rect.height*.55)};
    const record={mode,initial,dampingFactor:controls.dampingFactor};records.push(record);
    window.__inertiaOpenAfterDrag=async()=>{record.beforeOpen=pose(camera,controls);await inspectObject(body);record.opened=pose(camera,controls);};
    await request({kind:'drag-and-open',events:[{type:'mouseMove',...start},{type:'mouseDown',...start,button:'left',clickCount:1},{type:'mouseMove',x:start.x+110,y:start.y+45,button:'left'},{type:'mouseUp',x:start.x+110,y:start.y+45,button:'left',clickCount:1}]});
    check(inspector.isOpen&&inspector.body.id===body.id,'Inspector must open immediately after native drag');
    record.nativeDragDifference=difference(initial,record.beforeOpen);check(record.nativeDragDifference.camera>0.001,'Native drag must actually move the camera');
    record.entryDifference=difference(record.beforeOpen,record.opened);
    await delay(150);record.held=pose(camera,controls);record.heldDifference=difference(record.opened,record.held);
    document.getElementById('inspection-close').click();record.closed=pose(camera,controls);
    await frames(3);record.afterThreeFrames=pose(camera,controls);record.resumeDifference=difference(record.opened,record.afterThreeFrames);
    await frames(30);record.afterThirtyMoreFrames=pose(camera,controls);record.laterDifference=difference(record.afterThreeFrames,record.afterThirtyMoreFrames);
    const radius=Math.hypot(...record.opened.camera.map((v,i)=>v-record.opened.target[i]));
    record.allowedCameraCorrection=mode==='atlas'?radius*1.1e-6+1e-10:1e-10;
    record.passed=record.entryDifference.camera<1e-10&&record.entryDifference.target===0&&record.entryDifference.quaternion<1e-12&&record.heldDifference.camera===0&&record.heldDifference.target===0&&record.resumeDifference.camera<=record.allowedCameraCorrection&&record.resumeDifference.target===0&&record.laterDifference.camera<1e-8&&record.laterDifference.target===0;
  }
  delete window.__inertiaOpenAfterDrag;
  check(records.every(r=>r.passed),'Map inertia must not resume after inspection: '+JSON.stringify(records.map(r=>({mode:r.mode,passed:r.passed,entry:r.entryDifference,resume:r.resumeDifference,later:r.laterDifference}))));
  return records;
};true;
