// Acceptance against the shipped nearby explorer. All changes use real controls;
// this module never replaces the collection or calls its construction helper.
export async function verifyNearbyExpansion({nativeBridge=false}={}) {
    const {renderer,explorer:e,ui}=window.galaxyMap;
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const el=id=>document.getElementById(id);
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    const coordinateBytes=()=>new Float64Array(renderer.fullStarData.flatMap(star=>[star.x,star.y,star.z])).buffer;
    const beforeCoordinates=await hash(coordinateBytes());
    const sourceIndex=ui.lookup.byId;
    const checks={};
    const request=async value=>{
        window.__explorationVerification=value;
        const deadline=performance.now()+8000;
        while(window.__explorationVerification && performance.now()<deadline)await frame();
        check(!window.__explorationVerification,'Nearby native input/capture timed out');
        await frame();
    };
    const selectCollection=async key=>{
        const selector=el('ex-nearby-collection');
        check(selector,'Nearby collection selector must exist');
        selector.value=key;
        check(selector.value===key,'Collection selector must offer '+key);
        selector.dispatchEvent(new Event('change',{bubbles:true}));
        await frame();
        check(e.currentMode==='nearby','Collection change must stay in the nearby view');
    };
    const chooseRow=async id=>{
        const row=[...document.querySelectorAll('#ex-object-list [data-object-id]')].find(button=>button.dataset.objectId===id);
        check(row,'Actual object list must contain '+id);
        row.click();await frame();
        check(e.selectedObject?.id===id && el('ex-object-name')?.dataset.objectId===id,'Object-row click must retain selected identity '+id);
        return row.textContent.trim();
    };
    const measure=async(from,to)=>{
        for(const [which,id] of [['from',from],['to',to]]) {
            const selector=el('ex-measure-'+which);selector.value=id;
            check(selector.value===id,'Actual measurement selector must offer '+id);
            selector.dispatchEvent(new Event('change',{bubbles:true}));
        }
        await frame();
        check(e.measurement.from?.id===from && e.measurement.to?.id===to,'Measurement controls must preserve endpoint identities');
        check(e.measurement.result && e.measurementLine && e.scene.children.includes(e.measurementLine),'Measurement controls must draw a live separation line');
        return e.measurement.result;
    };
    const checkCleared=()=>{
        check(e.selectedObject===null && !el('ex-object-name'),'Collection changes must clear the previous selected object and details');
        check(e.measurement.from===null && e.measurement.to===null && e.measurement.result===null && !e.measurementLine,'Collection changes must clear prior endpoints and measurement geometry');
        check(el('ex-measure-from').value==='' && el('ex-measure-to').value==='','Collection changes must clear both visible measurement choices');
    };
    const inspectVisibleLabels=()=>{
        const visible=[...document.querySelectorAll('#ex-labels [data-object-id]')].filter(label=>!label.hidden).map(label=>({id:label.dataset.objectId,element:label,rect:label.getBoundingClientRect()}));
        check(visible.length>1,'Expanded frame must retain multiple readable labels');
        let comparedPairs=0;
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++) {
            const a=visible[i],b=visible[j];
            const overlapWidth=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left);
            const overlapHeight=Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top);
            check(overlapWidth<=0.5 || overlapHeight<=0.5,`Visible label boxes must not overlap: ${a.id} and ${b.id}`);
            comparedPairs++;
        }
        const selected=visible.find(label=>label.id===e.selectedObject?.id);
        if(selected)check(selected.element.classList.contains('selected'),'A visible selected label must retain its selection styling and priority');
        return {visibleLabels:visible.length,comparedPairs,overlapToleranceCssPx:0.5,overlappingPairs:0,selectedId:e.selectedObject?.id || null,selectedLabelVisible:!!selected};
    };
    const showCollectionControls=async()=>{
        const selected=e.selectedObject,from=e.measurement.from,to=e.measurement.to;
        const sidebar=document.querySelector('.ex-sidebar');sidebar.scrollTop=0;
        el('ex-search').value='';await frame();
        check(e.selectedObject===selected && e.measurement.from===from && e.measurement.to===to,'Screenshot framing must preserve the real selection and measurement');
        const bounds=sidebar.getBoundingClientRect(),selector=el('ex-nearby-collection').getBoundingClientRect();
        check(selector.top>=bounds.top && selector.bottom<=bounds.bottom,'Nearby collection control must be visible in the screenshot');
    };
    check(e.currentMode==='atlas','Nearby expansion acceptance starts in the atlas');
    el('ex-mode-nearby').click();await frame();
    check(el('ex-nearby-collection')?.value==='highlights','The established Highlights collection must remain the default');
    check(e.objects.length===13 && e.points.geometry.getAttribute('position').count===13,'Default nearby view must retain its Sun and twelve highlights');
    const highlights=new Map(e.objects.map(body=>[body.id,{name:body.name,description:body.description}]));
    checks.defaultCollection={key:'highlights',objects:e.objects.length,ids:[...highlights.keys()]};

    await selectCollection('5pc');
    checkCleared();
    check(e.objects.length===57,'The bounded five-parsec view must contain exactly 56 catalog stars and the Sun');
    const selectionNote=el('ex-nearby-selection-note')?.textContent || '';
    check(/catalog/i.test(selectionNote) && /5/.test(selectionNote) && /not.*complete|incomplete/i.test(selectionNote),'Visible collection note must disclose the catalog-distance bound and incomplete source selection');
    const expanded=e.objects.slice(),stars=expanded.filter(body=>body.id!=='sol');
    check(new Set(expanded.map(body=>body.id)).size===57,'Expanded nearby identities must be unique');
    const membershipHash=await hash(new TextEncoder().encode(JSON.stringify(stars.map(body=>body.id))));
    check(membershipHash==='af1bea70d0acecbc8c1c065f7abbecdc269bb5b7a91a28507ce8fc985ec320c2','Expanded membership and ordering must match the independently inventoried HYG subset');
    const geometry=e.points.geometry.getAttribute('position');
    check(geometry.count===57 && e.labels.length===57,'Every expanded identity needs its actual point and label');
    check(document.querySelectorAll('#ex-object-list [data-object-id]').length===57,'The expanded list must offer every displayed object');
    const sun=expanded.find(body=>body.id==='sol');
    check(sun && sun.position.every(value=>value===0),'The canonical Sun must remain the exact nearby origin');
    for(let i=0;i<expanded.length;i++) {
        const body=expanded[i];
        check(body.position.every((value,axis)=>Math.fround(value)===geometry.array[i*3+axis]),'Rendered positions must retain source coordinates at GPU Float32 precision');
        if(body.id==='sol')continue;
        const source=sourceIndex.get(body.id);
        check(source && source.dist>0 && source.dist<=5,'Every added star must satisfy the documented retained catalog-distance cutoff');
        check(body.catalogMetadata===source.catalogMetadata && body.catalogMetadata.quality.distanceStatus==='catalog-distance','The collection must retain verified source metadata and exclude unresolved-distance placeholders');
        check(body.position.every((value,axis)=>value===[source.x,source.y,source.z][axis]),'The expanded view must preserve exact retained Cartesian coordinates');
        check(body.distancePc===source.dist && body.spectralType===source.spect && body.apparentMagnitude===source.mag,'Expanded details must preserve catalog distance, spectral type and magnitude');
        const curated=highlights.get(body.id);
        if(curated)check(body.name===curated.name && body.description===curated.description,'Existing highlight names and descriptions must be retained');
    }
    for(const which of ['from','to']) {
        const options=[...el('ex-measure-'+which).options].filter(option=>option.value);
        check(options.length===57 && new Set(options.map(option=>option.value)).size===57,'Each expanded measurement choice must have one distinct stable ID');
    }
    checks.expandedCollection={key:'5pc',objects:57,stars:56,addedObjects:expanded.filter(body=>!highlights.has(body.id)).length,idListSha256:membershipHash,selectionNote,coordinateAndMetadataPreservation:true};

    const added=stars.find(body=>!highlights.has(body.id));
    check(added,'Expanded view must expose an object outside Highlights');
    const addedLabel=await chooseRow(added.id);
    check(el('ex-catalog-identifiers')?.textContent.includes(added.id),'New-object details must expose its retained stable identity');
    check(/uncertainty not supplied/i.test(el('ex-catalog-quality')?.textContent || ''),'New-object details must disclose unavailable source uncertainty');
    check(document.querySelectorAll('#ex-object-info a[href^="https:"]').length>0,'New-object details must link to the retained scientific source');
    check(el('ex-object-info').textContent.includes(String(added.distancePc)),'New-object details must show its original catalog distance');
    checks.addedObject={id:added.id,label:addedLabel,identifiers:el('ex-catalog-identifiers').textContent,quality:el('ex-catalog-quality').textContent,catalogDistancePc:added.distancePc};

    // The two real 61 Cyg source rows have the same display name. Search through
    // the existing input and Enter handler, then click each distinct result.
    const duplicateIds=['hyg:103879','hyg:103883'];
    const duplicateResults=[];
    for(const id of duplicateIds) {
        const previous=e.selectedObject?.id;
        el('ex-search').value='61 Cyg';
        el('ex-search').dispatchEvent(new Event('input',{bubbles:true}));
        el('ex-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await frame();
        check(e.selectedObject?.id===previous,'Ambiguous Enter search must not silently choose one component');
        const buttons=[...document.querySelectorAll('#ex-search-results [data-search-object-id]')];
        check(JSON.stringify(buttons.map(button=>button.dataset.searchObjectId).sort())===JSON.stringify(duplicateIds),'Search must expose both 61 Cyg identities');
        const captions=buttons.map(button=>button.textContent.trim());
        check(new Set(captions).size===2,'Duplicate-name search results must have visibly distinct captions');
        buttons.find(button=>button.dataset.searchObjectId===id).click();await frame();
        check(e.selectedObject?.id===id && el('ex-object-name').dataset.objectId===id,'Clicking a duplicate-name search result must select its exact source ID');
        duplicateResults.push({id,captions,selectedPanelId:el('ex-object-name').dataset.objectId});
    }
    const rowCaptions=duplicateIds.map(id=>[...document.querySelectorAll('#ex-object-list [data-object-id]')].find(row=>row.dataset.objectId===id).textContent.trim());
    const optionCaptions=duplicateIds.map(id=>[...el('ex-measure-from').options].find(option=>option.value===id).textContent.trim());
    const accessibleLabels=duplicateIds.map(id=>[...document.querySelectorAll('#ex-labels [data-object-id]')].find(label=>label.dataset.objectId===id)?.getAttribute('aria-label'));
    check(new Set(rowCaptions).size===2 && new Set(optionCaptions).size===2 && accessibleLabels.every(Boolean) && new Set(accessibleLabels).size===2,'List, measurement and accessible marker labels must distinguish duplicate names');
    checks.duplicateNames={results:duplicateResults,rowCaptions,optionCaptions,accessibleLabels};

    const farthest=stars.reduce((best,body)=>!best || body.distancePc>best.distancePc?body:best,null);
    const separation=await measure('sol',farthest.id);
    const sourceFarthest=sourceIndex.get(farthest.id);
    const expectedPc=Math.hypot(sourceFarthest.x,sourceFarthest.y,sourceFarthest.z);
    check(separation.space==='nearby' && Math.abs(separation.pc-expectedPc)<1e-12,'Expanded measurement must use retained Cartesian separation, independently of rounded catalog distance');
    checks.distance={from:'sol',to:farthest.id,catalogDistancePc:farthest.distancePc,expectedCartesianPc:expectedPc,actualPc:separation.pc,visiblePrimary:el('ex-distance-primary').textContent};
    await chooseRow(added.id);

    if(nativeBridge) {
        const originalViewport={width:innerWidth,height:innerHeight};
        try {
            // Focus via the real added-object row, then clear selection through
            // native Escape and click its actual projected marker location.
            await chooseRow(added.id);
            e.canvas.focus();
            await request({kind:'input',events:[{type:'keyDown',keyCode:'Escape'},{type:'keyUp',keyCode:'Escape'}]});
            check(e.selectedObject===null,'Native Escape must clear the expanded selection');
            e.camera.updateMatrixWorld();
            const projected=e.worldPosition(added).project(e.camera),rect=e.canvas.getBoundingClientRect();
            check(Math.abs(projected.x)<1 && Math.abs(projected.y)<1 && projected.z>=-1 && projected.z<=1,'The newly added target marker must be visible before native picking');
            const point={x:Math.round(rect.left+(projected.x+1)*rect.width/2),y:Math.round(rect.top+(1-projected.y)*rect.height/2)};
            await request({kind:'input',events:[{type:'mouseMove',...point},{type:'mouseDown',...point,button:'left',clickCount:1},{type:'mouseUp',...point,button:'left',clickCount:1}]});
            check(e.selectedObject?.id===added.id && el('ex-object-name')?.dataset.objectId===added.id,'Native picking must identify the actual newly added star');
            checks.nativePicking={id:added.id,point,actualSelectedId:e.selectedObject.id};
            await frame();
            const focusedLabel=[...document.querySelectorAll('#ex-labels [data-object-id]')].find(label=>label.dataset.objectId===added.id);
            check(focusedLabel && !focusedLabel.hidden && focusedLabel.classList.contains('selected'),'The centered selected star must retain its visible priority label');
            document.querySelector('#ex-presets [data-preset="all"]').click();await frame();
            await showCollectionControls();
            checks.wideLabelLayout=inspectVisibleLabels();
            await request({kind:'screenshot',name:'nearby-expanded'});
            await request({kind:'resize',width:900,height:900});
            document.querySelector('#ex-presets [data-preset="all"]').click();await frame();
            check(innerWidth===900 && innerHeight===900 && e.camera.aspect<1,'Expanded framing regression must use the real narrow application viewport');
            e.camera.updateMatrixWorld();
            const projections=e.objects.map(body=>({id:body.id,point:e.worldPosition(body).project(e.camera)}));
            check(projections.every(({point})=>[point.x,point.y,point.z].every(Number.isFinite) && Math.abs(point.x)<=1 && Math.abs(point.y)<=1 && point.z>=-1 && point.z<=1),'All 57 expanded markers must fit the narrow frame-all view');
            checks.narrowFraming={viewport:{width:innerWidth,height:innerHeight},objectsInsideClip:projections.length};
            await showCollectionControls();
            checks.narrowLabelLayout=inspectVisibleLabels();
            await request({kind:'screenshot',name:'nearby-expanded-narrow'});
        } finally {
            await request({kind:'resize',...originalViewport});
            document.querySelector('#ex-presets [data-preset="all"]').click();await frame();
        }
    }

    // Switching away from an added object must not leave its stale ID in a
    // details panel, measurement selector, search result or measurement line.
    await selectCollection('highlights');
    checkCleared();
    check(e.objects.length===13 && e.points.geometry.getAttribute('position').count===13,'Returning to Highlights must restore its original population');
    check(![...document.querySelectorAll('#ex-object-list [data-object-id]')].some(row=>row.dataset.objectId===added.id),'An added object must leave the actual Highlights list');
    check(![...el('ex-measure-to').options].some(option=>option.value===added.id),'An added object must leave the actual Highlights measurement choices');
    check(!document.querySelector('#ex-search-results [data-search-object-id]'),'Collection change must clear stale visible search results');
    el('ex-search').value=added.id;
    el('ex-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await frame();
    check(e.selectedObject===null && !document.querySelector('#ex-search-results [data-search-object-id]'),'An added ID must not remain selectable through Highlights cross-view search');
    await chooseRow('hyg:70666');
    await measure('sol','hyg:70666');
    await selectCollection('5pc');checkCleared();
    check(e.objects.length===57,'Returning to the expanded collection must restore the same population');
    el('ex-mode-solar').click();await frame();
    check(e.currentMode==='solar' && e.objects.length===10,'Solar System must retain its ten reference bodies');
    el('ex-mode-nearby').click();await frame();
    check(el('ex-nearby-collection').value==='5pc' && e.objects.length===57,'Mode changes must preserve the chosen nearby collection');
    await selectCollection('highlights');
    el('ex-mode-atlas').click();await frame();
    check(e.currentMode==='atlas' && renderer.starsMesh.geometry.getAttribute('position').count===ui.activeStarData.length,'Returning to the atlas must preserve its real filtered population');
    check(await hash(coordinateBytes())===beforeCoordinates,'Collection, selection and measurement controls must not change any full-catalog coordinate');
    checks.transitions={addedSelectionAndMeasurementCleared:true,highlightsRestored:13,expandedRestored:57,solarBodies:10,atlasRestored:true,allAtlasCoordinatesUnchanged:true,finalCollection:'highlights',finalMode:'atlas'};
    return checks;
}
