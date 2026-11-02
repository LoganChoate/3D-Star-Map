// Run against the actual packaged application after its catalog and metadata
// load. These scenarios use production UI handlers and the shipped files.
export async function verifyScientificPipeline() {
    const {renderer,ui,routes,explorer,catalogAudit}=window.galaxyMap;
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const el=id=>document.getElementById(id);
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    const stars=renderer.fullStarData;
    const results={};
    check(explorer.currentMode==='atlas','Scientific acceptance starts in the original atlas');
    check(stars.length===117735 && catalogAudit?.records===117735,'All 117,735 runtime objects require scientific metadata');
    check(stars.every(star=>star.catalogMetadata?.id===star.id),'Every sidecar identity must match its actual runtime object');
    check(new Set(stars.map(star=>star.catalogMetadata.id)).size===stars.length,'Runtime scientific metadata identities must remain unique');
    check(stars.every(star=>star.catalogMetadata.uncertainty===null),'Unavailable source uncertainty must remain null for every object');
    check(catalogAudit.manifest.source.version==='4.2' && catalogAudit.manifest.source.versionVerification.status==='verified-byte-match','Runtime must expose the independently verified HYG v4.2 source');
    const unresolved=stars.filter(star=>star.dist>=100000 && star.id!=='sol');
    check(unresolved.length===9875 && catalogAudit.unresolvedDistances===9875,'Exactly 9,875 retained records carry the HYG distance sentinel');
    check(stars.every(star=>star.isGarbageSphere===(star.id!=='sol' && star.dist>=100000)),'Quality visibility flag must use the source threshold, not the catalog maximum');
    const farthest=stars.filter(star=>star.id!=='sol' && star.dist<100000).reduce((best,star)=>!best||star.dist>best.dist?star:best,null);
    check(farthest && !farthest.isGarbageSphere && farthest.catalogMetadata.quality.distanceStatus==='catalog-distance','A legitimate farthest catalog distance must not be marked unresolved');
    const summary=el('catalog-quality-summary').textContent;
    check(/9,875/.test(summary) && /J2000/.test(summary) && /parsecs/.test(summary),'Visible summary must expose the actual unresolved count, reference and unit');

    // Independently compare the actual shipped catalog with runtime coordinates.
    // Retaining byte fingerprints before/after view/filter changes also detects
    // display logic accidentally rescaling or rewriting astronomical positions.
    const response=await fetch('stars.json');
    check(response.ok,'The immutable catalog must be bundled and readable');
    const sourceBytes=await response.arrayBuffer();
    const sourceDigest=await hash(sourceBytes);
    check(sourceDigest===catalogAudit.manifest.runtimeCatalog.sha256,'Shipped catalog bytes must match the loaded scientific manifest');
    const source=JSON.parse(new TextDecoder().decode(sourceBytes));
    check(source.length===stars.length && source.every((row,index)=>row.id===stars[index].id && ['x','y','z'].every(key=>row[key]===stars[index][key])),'Display coordinates and order must exactly retain the shipped catalog');
    const coordinateBytes=()=>new Float64Array(stars.flatMap(star=>[star.x,star.y,star.z])).buffer;
    const beforeCoordinates=await hash(coordinateBytes());
    results.catalog={records:stars.length,metadataRecords:catalogAudit.records,sourceVersion:'4.2',sourceVerifiedByBytes:true,unresolvedDistances:unresolved.length,unknownUncertainties:stars.length,catalogSha256:sourceDigest,farthestRetained:{id:farthest.id,distancePc:farthest.dist,unresolved:false}};

    const toggle=el('garbage-sphere-filter'),named=el('proper-name-filter'),distance=el('distance-slider'),size=el('size-slider');
    check(!toggle.checked,'Unresolved-distance entries must be hidden by default');
    named.checked=false;
    document.querySelectorAll('.filter-checkbox[name^="spectral-"]').forEach(box=>{box.checked=false;});
    size.value=size.max;
    distance.value=distance.max;
    named.dispatchEvent(new Event('change',{bubbles:true}));
    await frame();
    const defaultCount=ui.activeStarData.length;
    check(defaultCount===107860 && ui.activeStarData.every(star=>!star.isGarbageSphere),'The ordinary atlas view must include all 107,860 non-sentinel records and exclude unresolved placeholders');
    check(ui.activeStarData.some(star=>star.id===farthest.id),'The farthest legitimate catalog record must remain reachable at the default full distance range');
    check(renderer.starsMesh.geometry.getAttribute('position').count===defaultCount,'Default rendered geometry must agree with the active catalog');
    const initialCamera=renderer.camera.position.clone(),initialTarget=renderer.controls.target.clone();
    const sirius=stars.find(star=>star.id==='hyg:32263');
    check(sirius,'The exact source identity for Sirius must exist');
    el('search-input').value=' Sirius ';
    el('search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,1650));
    check(ui.selectedStar?.id===sirius.id,'Actual search must select Sirius with its scientific metadata');
    const siriusIds=el('star-identifiers').textContent,siriusQuality=el('star-quality').textContent,siriusAxes=el('star-equatorial').textContent;
    check(/HIP 32349\b/.test(siriusIds) && /HD 48915\b/.test(siriusIds) && /HR 2491\b/.test(siriusIds),'Sirius panel must show its retained HIP, HD and HR cross-identifications');
    check(/uncertainty not supplied/i.test(siriusQuality),'A normal catalog distance must not imply known uncertainty');
    check(siriusAxes==='Source axes X, Y, Z: -0.494323, 2.476731, -0.758485 pc','Sirius source axes must show the inverse rotation at retained precision');
    check(!/unresolved/i.test(el('star-dist').textContent),'Sirius has a retained usable distance value');
    results.siriusPanel={id:sirius.id,identifiers:siriusIds,quality:siriusQuality,sourceCoordinates:siriusAxes};

    toggle.checked=true;
    toggle.dispatchEvent(new Event('change',{bubbles:true}));
    await frame();
    distance.value=distance.max;
    distance.dispatchEvent(new Event('input',{bubbles:true}));
    await frame();
    check(ui.activeStarData.filter(star=>star.isGarbageSphere).length===9875,'Show unresolved must expose all retained sentinel entries at full range');
    const expandedCount=ui.activeStarData.length;
    check(expandedCount===117735,'Explicit unresolved inclusion at full range must show the complete retained catalog');
    const sentinel=unresolved[0];
    check(ui.selectStar({id:sentinel.id},{focusCamera:false}) && ui.selectedStar?.id===sentinel.id,'Selecting an exact unresolved source ID must use its canonical catalog object');
    check(el('star-name').dataset.starId===sentinel.id,'Unresolved object panel must retain exact identity');
    const unresolvedLabel=el('star-dist').textContent,unresolvedQuality=el('star-quality').textContent;
    check(/unresolved/i.test(unresolvedLabel) && !/100[,.]?000/.test(unresolvedLabel),'Placeholder distance must display as unresolved, not as a measured 100,000 pc');
    check(/placeholder/i.test(unresolvedQuality) && /uncertainty not supplied/i.test(unresolvedQuality),'Unresolved panel must explain placeholder position and absent uncertainty');
    const previousStart=routes.getActiveRoute().startStar,previousEnd=routes.getActiveRoute().endStar;
    check(routes.setRouteStart(sentinel)===false && routes.setRouteEnd(sentinel)===false,'Unresolved catalog positions must be rejected as route endpoints');
    check(routes.getActiveRoute().startStar===previousStart && routes.getActiveRoute().endStar===previousEnd,'Rejected unresolved endpoints must preserve the previous route');
    const routeWarning=document.querySelector('.app-notification.warning');
    check(routeWarning && /unresolved distance/.test(routeWarning.textContent),'Rejecting a placeholder endpoint must explain why');
    routeWarning.querySelector('button').click();
    results.routeQuality={unresolvedEndpointsRejected:true,previousEndpointsPreserved:true,reasonShown:true};

    toggle.checked=false;
    toggle.dispatchEvent(new Event('change',{bubbles:true}));
    await frame();
    check(!ui.selectedStar && !routes.routePlanner.currentSelection,'Hiding unresolved entries must clear the selected placeholder and route selection');
    for(const id of ['star-name','star-dist','star-identifiers','star-quality','star-equatorial'])check(el(id).textContent==='N/A',`Hiding an unresolved selection must clear ${id}`);
    distance.value=distance.max;
    distance.dispatchEvent(new Event('input',{bubbles:true}));
    await frame();
    check(ui.activeStarData.length===defaultCount && ui.activeStarData.every(star=>!star.isGarbageSphere),'Hiding unresolved entries must restore the original ordinary view count');
    check(renderer.starsMesh.geometry.getAttribute('position').count===defaultCount,'Rendered geometry must restore with the scientific filter');
    check(ui.searchById(sentinel.id)===false && !ui.selectedStar,'A hidden unresolved source ID must not bypass the visibility filter');
    results.distancePolicy={defaultVisible:defaultCount,includingUnresolved:expandedCount,sentinelSelectedId:sentinel.id,sentinelDistanceLabel:unresolvedLabel,sentinelQualityLabel:unresolvedQuality,hiddenSelectionCleared:true,restoredVisible:ui.activeStarData.length,hiddenLookupRejected:true};

    // The curated nearby view reuses the same stable metadata, while retaining
    // the established coordinate-based scientific measurement.
    el('ex-mode-nearby').click();await frame();
    el('ex-search').value='Proxima Centauri';
    el('ex-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await frame();
    check(explorer.selectedObject?.id==='hyg:70666','Nearby search must preserve Proxima identity');
    const nearbyQuality=el('ex-catalog-quality')?.textContent,nearbyIdentifiers=el('ex-catalog-identifiers')?.textContent;
    check(nearbyQuality && /uncertainty not supplied/i.test(nearbyQuality),'Nearby panel must expose the same unknown measurement uncertainty');
    check(nearbyIdentifiers && /HIP 70890\b/.test(nearbyIdentifiers) && /Gl 551\b/.test(nearbyIdentifiers),'Nearby panel must retain Proxima cross-identifications');
    for(const [which,id] of [['from','sol'],['to','hyg:70666']]) {
        el(`ex-measure-${which}`).value=id;
        el(`ex-measure-${which}`).dispatchEvent(new Event('change',{bubbles:true}));
    }
    await frame();
    check(Math.abs(explorer.measurement.result?.pc-1.2957566504008382)<1e-12 && el('ex-distance-secondary').textContent==='4.2262 light-years','Adding quality metadata must preserve actual Sun–Proxima coordinate separation');
    results.nearbyPanel={id:explorer.selectedObject.id,identifiers:nearbyIdentifiers,quality:nearbyQuality,coordinateSeparationPc:explorer.measurement.result.pc,distanceLabel:el('ex-distance-secondary').textContent};
    el('ex-mode-atlas').click();await frame();
    check(!toggle.checked && ui.activeStarData.length===defaultCount,'Returning from nearby exploration must preserve the default quality filter');
    ui.selectStar({id:sirius.id},{focusCamera:false});
    const provenance=document.querySelector('#selection-info .catalog-provenance');
    check(provenance,'The source/quality disclosure must be present');
    if(!provenance.open)provenance.querySelector('summary').click();
    el('selection-info').scrollIntoView({block:'center'});
    renderer.camera.position.copy(initialCamera);renderer.controls.target.copy(initialTarget);renderer.controls.update();
    await frame();
    const afterCoordinates=await hash(coordinateBytes());
    check(beforeCoordinates===afterCoordinates,'Quality panels, filters and view changes must not mutate any catalog coordinate bytes');
    check(!document.querySelector('.app-notification.error'),'Scientific metadata journeys must not produce an application error');
    results.preservation={coordinateSha256Before:beforeCoordinates,coordinateSha256After:afterCoordinates,allCoordinatesUnchanged:true,finalView:'atlas',finalSelection:sirius.id,qualityPanelVisible:true};
    return results;
}
