import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { measureDistance, formatDistance } from '../utils/ExplorationMath.js';
import { catalogQualityLabel, catalogIdentifierLabel } from '../utils/CatalogMetadata.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalized = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const COLORS = {sol:'#ffd58a','solar:mercury':'#c8bcb0','solar:venus':'#edcd8d','solar:earth':'#7fbcff','solar:moon':'#d4dce8','solar:mars':'#f49b7f','solar:jupiter':'#e7c39b','solar:saturn':'#ead5a3','solar:uranus':'#a6e2e4','solar:neptune':'#779dff'};

/** Local, fixed-epoch exploration with separate, explicit coordinate spaces. */
export class ExplorationController {
    constructor({ mount = document.getElementById('exploration-root'), onModeChange = () => {} } = {}) {
        this.mount = mount;
        this.onModeChange = onModeChange;
        this.currentMode = 'atlas';
        this.selectedObject = null;
        this.measurement = { from:null, to:null, result:null };
        this.objects = [];
        this.labels = [];
        this.pointerStart = null;
        this.disposed = false;
        this._resize = () => this.resize();
    }

    async initialize(fullStarData) {
        if (!this.mount) throw new Error('Exploration mount is missing');
        const response = await fetch('data/exploration-catalog.json');
        if (!response.ok) throw new Error(`Exploration catalog unavailable (${response.status})`);
        this.catalog = await response.json();
        const starIndex = new Map(fullStarData.map(star => [star.id,star]));
        this.solarObjects = this.catalog.solar.objects.map(body => ({...body,space:'solar',position:body.position.slice()}));
        this.nearbyObjects = this.catalog.nearby.objects.map(entry => {
            const source = starIndex.get(entry.id);
            if (!source) throw new Error(`Curated star ${entry.id} is missing from the local catalog`);
            return {...source,...entry,space:'nearby',kind:'Star',position:[source.x,source.y,source.z],catalogName:source.name};
        });
        if (!this.nearbyObjects.some(body => body.id === 'sol')) {
            const sun = this.solarObjects.find(body => body.id === 'sol');
            this.nearbyObjects.unshift({...sun,space:'nearby',position:[0,0,0],description:'The Sun is the origin of this nearby-star view. Other positions are from the bundled HYG catalog.'});
        }
        for (const group of [this.solarObjects,this.nearbyObjects]) {
            if (new Set(group.map(body=>body.id)).size !== group.length) throw new Error('Duplicate exploration identity');
            for (const body of group) {
                if (!body.id || body.position.length !== 3 || !body.position.every(Number.isFinite)) throw new Error(`Invalid exploration coordinates: ${body.id}`);
            }
        }
        this.allObjects = [...this.solarObjects,...this.nearbyObjects.filter(body=>body.id!=='sol')];
        this.renderShell();
        this.createScene();
        this.bindEvents();
        window.addEventListener('resize',this._resize);
        this.setMode('atlas');
        this.render();
        return true;
    }

    renderShell() {
        this.mount.innerHTML = `
          <nav class="ex-mode-bar" aria-label="Explore space">
            <button id="ex-mode-atlas" data-ex-mode="atlas" aria-pressed="true">Star atlas</button>
            <button id="ex-mode-solar" data-ex-mode="solar" aria-pressed="false">Solar System</button>
            <button id="ex-mode-nearby" data-ex-mode="nearby" aria-pressed="false">Nearby stars</button>
          </nav>
          <section id="ex-workspace" class="ex-workspace" hidden aria-label="Solar System and nearby-star explorer">
            <aside class="ex-sidebar">
              <div class="ex-section-heading"><span class="ex-eyebrow">EXPLORE YOUR NEIGHBORHOOD</span><h2 id="ex-sidebar-title">Solar System</h2></div>
              <label for="ex-search" class="ex-field-label">Find an object</label>
              <div class="ex-search-row"><input id="ex-search" type="search" autocomplete="off" placeholder="Earth, Moon, Sirius…"><button id="ex-search-go" aria-label="Search objects">↵</button></div>
              <div id="ex-search-results" class="ex-search-results" aria-live="polite"></div>
              <div class="ex-list-header"><h3>Objects in this view</h3><span id="ex-object-count"></span></div>
              <div id="ex-object-list" class="ex-object-list"></div>
              <section id="ex-object-info" class="ex-object-info" aria-label="Object information" aria-live="polite"></section>
              <section class="ex-measure-panel" aria-label="Measure a distance">
                <h3>Measure a distance</h3><p class="ex-muted">Straight-line separation in this view.</p>
                <label class="ex-field-label" for="ex-measure-from">From</label><select id="ex-measure-from"></select>
                <label class="ex-field-label" for="ex-measure-to">To</label><select id="ex-measure-to"></select>
                <div id="ex-distance" class="ex-distance" role="status"><strong id="ex-distance-primary">Choose two objects</strong><span id="ex-distance-secondary"></span></div>
                <button id="ex-measure-clear" class="ex-text-button">Clear measurement</button>
              </section>
            </aside>
            <div id="ex-stage" class="ex-stage">
              <canvas id="ex-canvas" tabindex="0" aria-label="3D exploration view. Drag to orbit, wheel to zoom, arrows to pan, plus and minus to zoom, Home to frame all."></canvas>
              <div id="ex-labels" class="ex-labels"></div>
              <div class="ex-stage-heading"><span id="ex-view-title" class="ex-eyebrow"></span><h2 id="ex-view-subtitle"></h2><p id="ex-epoch"></p></div>
              <div id="ex-presets" class="ex-presets" aria-label="View presets"></div>
              <div class="ex-zoom-tools" aria-label="Camera controls"><button id="ex-zoom-in" aria-label="Zoom in">+</button><button id="ex-zoom-out" aria-label="Zoom out">−</button><button id="ex-home" aria-label="Frame all objects">⌂</button></div>
              <div class="ex-stage-footer"><p id="ex-scale-note"></p><p class="ex-keyboard-hint">Drag to orbit · Scroll to zoom · Right-drag or arrows to pan · + / − zoom · Home reset</p></div>
            </div>
          </section>`;
        this.elements = Object.fromEntries([...this.mount.querySelectorAll('[id]')].map(element=>[element.id,element]));
    }

    createScene() {
        this.canvas = this.elements['ex-canvas'];
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#07111e');
        this.camera = new THREE.PerspectiveCamera(45,1,0.000001,2000);
        this.renderer = new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
        this.controls = new OrbitControls(this.camera,this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.screenSpacePanning = true;
        this.controls.zoomSpeed = 0.8;
        this.sceneGroup = new THREE.Group();
        this.scene.add(this.sceneGroup);
        this.guideGroup = new THREE.Group();
        this.scene.add(this.guideGroup);
    }

    bindEvents() {
        this.mount.querySelectorAll('[data-ex-mode]').forEach(button=>button.addEventListener('click',()=>this.setMode(button.dataset.exMode)));
        this.elements['ex-search'].addEventListener('input',()=>this.search(this.elements['ex-search'].value));
        this.elements['ex-search'].addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();this.search(this.elements['ex-search'].value,true);}});
        this.elements['ex-search-go'].addEventListener('click',()=>this.search(this.elements['ex-search'].value,true));
        this.elements['ex-measure-from'].addEventListener('change',event=>this.setMeasurementEndpoint('from',event.target.value));
        this.elements['ex-measure-to'].addEventListener('change',event=>this.setMeasurementEndpoint('to',event.target.value));
        this.elements['ex-measure-clear'].addEventListener('click',()=>this.clearMeasurement());
        this.elements['ex-zoom-in'].addEventListener('click',()=>this.zoom(0.8));
        this.elements['ex-zoom-out'].addEventListener('click',()=>this.zoom(1.25));
        this.elements['ex-home'].addEventListener('click',()=>this.setPreset('all'));
        this.canvas.addEventListener('keydown',event=>this.handleKey(event));
        this.canvas.addEventListener('pointerdown',event=>{this.pointerStart={x:event.clientX,y:event.clientY};this.canvas.focus({preventScroll:true});});
        this.canvas.addEventListener('pointerup',event=>{
            if (!this.pointerStart || event.button!==0) return;
            const moved=Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y);
            this.pointerStart=null;
            if(moved<5) this.pickAt(event.clientX,event.clientY);
        });
    }

    setMode(mode) {
        if(!['atlas','solar','nearby'].includes(mode)) throw new Error('Unknown exploration view');
        const changed=this.currentMode!==mode;
        this.currentMode=mode;
        if(changed){this.selectedObject=null;this.clearMeasurement();}
        this.elements['ex-workspace'].hidden=mode==='atlas';
        document.body.classList.toggle('exploration-active',mode!=='atlas');
        this.mount.querySelectorAll('[data-ex-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.exMode===mode)));
        this.controls.enabled=mode!=='atlas';
        if(mode!=='atlas') {
            this.objects=mode==='solar'?this.solarObjects:this.nearbyObjects;
            if(changed || !this.points) {
                this.buildGeometry();
                this.renderCatalog();
                this.renderInfo();
                this.renderPresets();
                this.elements['ex-search-results'].replaceChildren();
                this.elements['ex-search'].value='';
                this.resize();
                this.setPreset('all');
            }
            this.resize();
        }
        this.onModeChange(mode);
        return mode;
    }

    worldPosition(body) {
        // Rotate the ecliptic basis rigidly to y-up; lengths remain unchanged.
        return body.space==='solar'?new THREE.Vector3(body.position[0],body.position[2],-body.position[1]):new THREE.Vector3(...body.position);
    }

    buildGeometry() {
        this.disposeGroup(this.sceneGroup);
        this.disposeGroup(this.guideGroup);
        const positions=[],colors=[],sizes=[];
        this.objects.forEach(body=>{
            positions.push(...this.worldPosition(body).toArray());
            const color=new THREE.Color(COLORS[body.id] || '#c3dcff');colors.push(color.r,color.g,color.b);
            sizes.push(body.id==='sol'?13:9);
        });
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        geometry.setAttribute('markerSize',new THREE.Float32BufferAttribute(sizes,1));
        const material=new THREE.ShaderMaterial({
            uniforms:{pixelRatio:{value:this.renderer.getPixelRatio()}},
            vertexShader:'attribute float markerSize; attribute vec3 color; varying vec3 vColor; uniform float pixelRatio; void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=p.z<0.0?markerSize*pixelRatio:0.0;}',
            fragmentShader:'varying vec3 vColor; void main(){float r=length(gl_PointCoord-vec2(0.5));if(r>0.5)discard;float alpha=1.0-smoothstep(0.34,0.5,r);gl_FragColor=vec4(vColor,alpha);}',
            transparent:true,depthWrite:false
        });
        this.points=new THREE.Points(geometry,material);this.points.frustumCulled=false;this.sceneGroup.add(this.points);
        if(this.currentMode==='solar') {
            for(const radius of [1,5,10,20,30]) {
                const vertices=[];
                for(let i=0;i<160;i++){const angle=i/160*Math.PI*2;vertices.push(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));}
                const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.LineBasicMaterial({color:'#31516b',transparent:true,opacity:0.4}));
                this.guideGroup.add(line);
            }
        }
        this.elements['ex-labels'].replaceChildren();
        this.labels=this.objects.map(body=>{
            const label=document.createElement('button');label.className='ex-point-label';label.textContent=body.name;label.dataset.objectId=body.id;label.setAttribute('aria-label',`Select ${body.name}`);
            label.addEventListener('click',()=>this.selectObject(body.id,{focus:false}));this.elements['ex-labels'].append(label);
            return {body,element:label};
        });
    }

    renderCatalog() {
        this.elements['ex-sidebar-title'].textContent=this.currentMode==='solar'?'Solar System':'Nearby stars';
        this.elements['ex-object-count'].textContent=String(this.objects.length);
        this.elements['ex-object-list'].innerHTML=this.objects.map(body=>`<button class="ex-object-row" data-object-id="${escape(body.id)}"><span class="ex-object-dot" style="background:${COLORS[body.id] || '#c3dcff'}"></span><span>${escape(body.name)}</span><small>${escape(body.kind || 'Star')}</small></button>`).join('');
        this.elements['ex-object-list'].querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>this.selectObject(button.dataset.objectId)));
        const options='<option value="">Choose an object…</option>'+this.objects.map(body=>`<option value="${escape(body.id)}">${escape(body.name)}</option>`).join('');
        this.elements['ex-measure-from'].innerHTML=options;this.elements['ex-measure-to'].innerHTML=options;
        this.elements['ex-view-title'].textContent=this.currentMode==='solar'?'SOLAR SYSTEM':'THE SOLAR NEIGHBORHOOD';
        this.elements['ex-view-subtitle'].textContent=this.currentMode==='solar'?'A reference moment, to scale':'Our nearest stellar neighbors';
        this.elements['ex-epoch'].textContent=this.currentMode==='solar'?this.catalog.solar.epochLabel:'HYG v4.2 · epoch/equinox J2000.0 · Retained positions, not a live sky';
        this.elements['ex-scale-note'].textContent=this.currentMode==='solar'?'Positions and distances use AU. Markers are enlarged to 9–17 pixels, not physical sizes. Rings: 1, 5, 10, 20 and 30 AU from the Sun; these are distance guides, not orbits.':'Positions and distances use parsecs. Markers are enlarged to 9–17 pixels, not physical sizes. Separations are calculated from the retained coordinates.';
    }

    renderPresets() {
        const presets=this.currentMode==='solar'?[['all','Full Solar System'],['inner','Inner planets'],['earth-moon','Earth & Moon']]:[['all','All nearby stars'],['sun','Around the Sun']];
        this.elements['ex-presets'].innerHTML=presets.map(([id,label])=>`<button data-preset="${id}">${label}</button>`).join('');
        this.elements['ex-presets'].querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>this.setPreset(button.dataset.preset)));
    }

    search(query,selectExact=false) {
        const key=normalized(query);
        const results=this.elements['ex-search-results'];results.replaceChildren();
        if(!key)return [];
        const matches=this.allObjects.filter(body=>normalized(body.name).includes(key)||normalized(body.id)===key||(body.catalogName&&normalized(body.catalogName).includes(key)));
        const exact=matches.filter(body=>normalized(body.name)===key||normalized(body.id)===key||normalized(body.catalogName)===key);
        if(selectExact && exact.length===1) {this.selectObject(exact[0].id);return exact;}
        if(!matches.length) {results.textContent='No match in the curated collection. Use Star atlas for the full catalog.';return [];}
        matches.slice(0,12).forEach(body=>{
            const button=document.createElement('button');button.dataset.searchObjectId=body.id;button.textContent=`${body.name} · ${body.space==='solar'?'Solar System':'Nearby stars'}`;
            button.addEventListener('click',()=>this.selectObject(body.id));results.append(button);
        });
        return matches;
    }

    selectObject(id,{focus=true}={}) {
        let body=this.objects.find(object=>object.id===id) || this.allObjects.find(object=>object.id===id);
        if(!body) return false;
        if(this.currentMode!==body.space){this.setMode(body.space);body=this.objects.find(object=>object.id===id);}
        this.selectedObject=body;
        this.elements['ex-search-results'].replaceChildren();
        this.elements['ex-object-list'].querySelectorAll('[data-object-id]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.objectId===id)));
        const size=this.points.geometry.getAttribute('markerSize');this.objects.forEach((object,i)=>size.setX(i,object.id===id?17:(object.id==='sol'?13:9)));size.needsUpdate=true;
        this.renderInfo();
        if(focus)this.focusObject(body);
        return true;
    }

    clearSelection() {
        this.selectedObject=null;this.renderInfo();
        this.elements['ex-object-list'].querySelectorAll('[data-object-id]').forEach(button=>button.setAttribute('aria-pressed','false'));
        if(this.points){const size=this.points.geometry.getAttribute('markerSize');this.objects.forEach((body,i)=>size.setX(i,body.id==='sol'?13:9));size.needsUpdate=true;}
    }

    renderInfo() {
        const panel=this.elements['ex-object-info'];
        const body=this.selectedObject;
        if(!body){panel.innerHTML='<span class="ex-eyebrow">OBJECT DETAILS</span><h3>Choose a destination</h3><p class="ex-muted">Select a marker, choose an object above, or search across both collections.</p>';return;}
        const origin=body.space==='solar'?this.solarObjects.find(object=>object.id==='sol'):this.nearbyObjects.find(object=>object.id==='sol');
        const distance=formatDistance(measureDistance(origin,body,body.space));
        const rawSources=body.sources?.length?body.sources:(body.space==='solar'?this.catalog.solar.sources:this.catalog.nearby.sources)||[];
        const sources=rawSources.filter(source=>{try{return new URL(source.url).protocol==='https:';}catch{return false;}});
        const radius=Number.isFinite(body.radiusKm)?`<dt>${escape(body.radiusDefinition || 'Physical radius')}</dt><dd>${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(body.radiusKm)} km</dd>`:'';
        const stellar=body.space==='nearby'&&body.id!=='sol'?`${body.spectralType?`<dt>Spectral type</dt><dd>${escape(body.spectralType)}</dd>`:''}${Number.isFinite(body.apparentMagnitude)?`<dt>Apparent magnitude</dt><dd>${escape(body.apparentMagnitude)}</dd>`:''}${Number.isFinite(body.distancePc)?`<dt>Catalog distance</dt><dd>${escape(body.distancePc)} pc</dd>`:''}`:'';
        panel.innerHTML=`<span class="ex-eyebrow">${escape(body.kind || 'Star')}</span><h3 id="ex-object-name" data-object-id="${escape(body.id)}">${escape(body.name)}</h3><p class="ex-description">${escape(body.description || 'Position from the bundled star catalog.')}</p><dl><dt>Catalog identity</dt><dd>${escape(body.id)}</dd>${radius}${stellar}<dt>Coordinate separation from Sun</dt><dd>${escape(distance.primary)}<small>${escape(distance.secondary)}</small></dd><dt>Reference</dt><dd>${escape(body.space==='solar'?this.catalog.solar.epochLabel:'Bundled HYG catalog positions')}</dd></dl><div class="ex-selection-actions"><button id="ex-focus-selected">Focus view</button><button id="ex-measure-selected">Measure from here</button></div><details class="ex-provenance"><summary>Coordinates & sources</summary><p>${escape(body.space==='solar'?this.catalog.solar.frame:(this.catalog.nearby.frame || 'HYG heliocentric catalog frame, rotated by the atlas renderer'))}</p><p class="ex-coordinates">${body.position.map(value=>Number(value).toPrecision(9)).join(' · ')} ${body.space==='solar'?'AU':'pc'}</p>${sources.map(source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label || 'Data source')} ↗</a>`).join('')}</details>`;
        if(body.space==='nearby' && body.catalogMetadata) {
            const quality=document.createElement('p');quality.id='ex-catalog-quality';quality.className='ex-muted';quality.textContent=catalogQualityLabel(body);
            panel.querySelector('.ex-description').after(quality);
            const identifiers=document.createElement('p');identifiers.id='ex-catalog-identifiers';identifiers.textContent=catalogIdentifierLabel(body);
            panel.querySelector('.ex-provenance').append(identifiers);
        }
        this.elements['ex-focus-selected']=panel.querySelector('#ex-focus-selected');this.elements['ex-measure-selected']=panel.querySelector('#ex-measure-selected');
        this.elements['ex-focus-selected'].addEventListener('click',()=>this.focusObject(body));
        this.elements['ex-measure-selected'].addEventListener('click',()=>this.setMeasurementEndpoint('from',body.id));
    }

    focusObject(body=this.selectedObject) {
        if(!body)return;
        const target=this.worldPosition(body);
        const radius=body.space==='nearby'?0.8:(['solar:earth','solar:moon'].includes(body.id)?0.008:(body.id==='sol'?2:0.2));
        this.placeCamera(target,radius);
    }

    setPreset(preset) {
        if(this.currentMode==='atlas')return false;
        this.currentPreset=preset;
        if(this.currentMode==='solar' && preset==='earth-moon') {
            const earth=this.objects.find(body=>body.id==='solar:earth'),moon=this.objects.find(body=>body.id==='solar:moon');
            if(!earth||!moon)throw new Error('Earth–Moon preset requires both catalog objects');
            const center=this.worldPosition(earth).add(this.worldPosition(moon)).multiplyScalar(0.5);
            this.placeCamera(center,this.worldPosition(earth).distanceTo(this.worldPosition(moon))*3.4);
        } else if(this.currentMode==='solar' && preset==='inner') {
            this.placeCamera(new THREE.Vector3(),5.2);
        } else if(this.currentMode==='nearby' && preset==='sun') {
            this.placeCamera(new THREE.Vector3(),4.5);
        } else {
            const box=new THREE.Box3().setFromPoints(this.objects.map(body=>this.worldPosition(body)));
            const center=box.getCenter(new THREE.Vector3());const radius=box.getBoundingSphere(new THREE.Sphere()).radius;
            const verticalHalfFov=THREE.MathUtils.degToRad(this.camera.fov/2);
            const horizontalHalfFov=Math.atan(Math.tan(verticalHalfFov)*this.camera.aspect);
            const fit=Math.max(radius,0.001)/Math.sin(Math.min(verticalHalfFov,horizontalHalfFov))*1.18;
            this.placeCamera(center,fit);
        }
        this.elements['ex-presets'].querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===preset)));
        return true;
    }

    placeCamera(target,distance) {
        this.controls.minDistance=this.currentMode==='solar'?0.000001:0.0001;
        this.controls.maxDistance=this.currentMode==='solar'?1000:1000;
        this.controls.target.copy(target);
        this.camera.position.copy(target).add(new THREE.Vector3(0,0.9,1).normalize().multiplyScalar(Math.max(distance,this.controls.minDistance*2)));
        this.camera.lookAt(target);this.controls.update();this.updateClipping();this.updateLabels();
    }

    setMeasurementEndpoint(which,id) {
        if(!['from','to'].includes(which))throw new Error('Unknown measurement endpoint');
        const object=id?this.objects.find(body=>body.id===id):null;
        if(id&&!object)throw new Error('Distance endpoints must belong to the current view');
        this.measurement[which]=object;
        this.elements[`ex-measure-${which}`].value=object?.id || '';
        this.updateMeasurement();
        return this.measurement.result;
    }

    clearMeasurement() {
        this.measurement={from:null,to:null,result:null};
        if(!this.elements)return;
        this.elements['ex-measure-from'].value='';this.elements['ex-measure-to'].value='';this.updateMeasurement();
    }

    updateMeasurement() {
        if(this.measurementLine){this.scene.remove(this.measurementLine);this.measurementLine.geometry.dispose();this.measurementLine.material.dispose();this.measurementLine=null;}
        const {from,to}=this.measurement;
        if(from&&to) {
            this.measurement.result=measureDistance(from,to,this.currentMode);
            const display=formatDistance(this.measurement.result);this.elements['ex-distance-primary'].textContent=display.primary;this.elements['ex-distance-secondary'].textContent=display.secondary;
            this.measurementLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.worldPosition(from),this.worldPosition(to)]),new THREE.LineBasicMaterial({color:'#8de2ca',transparent:true,opacity:0.85}));
            this.scene.add(this.measurementLine);
        } else {
            this.measurement.result=null;this.elements['ex-distance-primary'].textContent=from||to?'Choose the other object':'Choose two objects';this.elements['ex-distance-secondary'].textContent='';
        }
    }

    pickAt(clientX,clientY) {
        if(this.currentMode==='atlas')return false;
        const rect=this.canvas.getBoundingClientRect();let chosen=null;let best=18;
        this.camera.updateMatrixWorld();
        for(const body of this.objects) {
            const projected=this.worldPosition(body).project(this.camera);
            if(projected.z < -1 || projected.z > 1)continue;
            const x=rect.left+(projected.x+1)*rect.width/2,y=rect.top+(1-projected.y)*rect.height/2;
            const distance=Math.hypot(clientX-x,clientY-y);
            if(distance<best){best=distance;chosen=body;}
        }
        if(chosen){this.selectObject(chosen.id,{focus:false});return chosen.id;}
        this.clearSelection();return false;
    }

    zoom(factor) {
        const offset=this.camera.position.clone().sub(this.controls.target);
        const distance=THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance*1.01,this.controls.maxDistance*0.99);
        this.camera.position.copy(this.controls.target).add(offset.setLength(distance));this.controls.update();this.updateClipping();
    }

    handleKey(event) {
        if(event.altKey||event.ctrlKey||event.metaKey)return;
        if(event.key==='Home'){event.preventDefault();this.setPreset('all');return;}
        if(event.key==='Escape'){event.preventDefault();this.clearSelection();return;}
        if(['+','=','-','_'].includes(event.key)){event.preventDefault();this.zoom(['+','='].includes(event.key)?0.8:1.25);return;}
        const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
        if(!direction)return;
        event.preventDefault();this.camera.updateMatrixWorld();
        const step=this.camera.position.distanceTo(this.controls.target)*(event.shiftKey?0.12:0.035);
        const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
        const movement=right.multiplyScalar(direction[0]*step).add(up.multiplyScalar(direction[1]*step));
        this.camera.position.add(movement);this.controls.target.add(movement);this.controls.update();
    }

    updateClipping() {
        const distance=this.camera.position.distanceTo(this.controls.target);
        this.camera.near=Math.max(distance/100000,1e-10);this.camera.far=Math.max(distance*100,100);
        this.camera.updateProjectionMatrix();
    }

    updateLabels() {
        const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
        this.camera.updateMatrixWorld();const occupied=[];
        const sorted=this.labels.slice().sort((a,b)=>Number(b.body.id===this.selectedObject?.id)-Number(a.body.id===this.selectedObject?.id));
        for(const {body,element} of sorted) {
            const projected=this.worldPosition(body).project(this.camera);
            const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
            const visible=projected.z>=-1&&projected.z<=1&&x>0&&x<width-100&&y>85&&y<height-72&&!occupied.some(point=>Math.hypot(point.x-x,point.y-y)<36);
            element.hidden=!visible; if(!visible)continue;
            occupied.push({x,y});element.style.transform=`translate(${x+11}px,${y-10}px)`;element.classList.toggle('selected',body.id===this.selectedObject?.id);
        }
    }

    resize() {
        if(this.currentMode==='atlas'||!this.renderer)return;
        const rect=this.elements['ex-stage'].getBoundingClientRect();
        if(rect.width<=0||rect.height<=0)return;
        this.renderer.setSize(rect.width,rect.height,false);this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();this.updateLabels();
    }

    render() {
        if(this.disposed)return;
        this.frame=requestAnimationFrame(()=>this.render());
        if(this.currentMode==='atlas')return;
        this.controls.update();this.updateClipping();this.updateLabels();this.renderer.render(this.scene,this.camera);
    }

    disposeGroup(group) {
        while(group.children.length){const item=group.children[0];group.remove(item);item.geometry?.dispose();if(Array.isArray(item.material))item.material.forEach(material=>material.dispose());else item.material?.dispose();}
    }

    dispose() {
        this.disposed=true;cancelAnimationFrame(this.frame);window.removeEventListener('resize',this._resize);
        this.controls?.dispose();this.disposeGroup(this.sceneGroup);this.disposeGroup(this.guideGroup);this.renderer?.dispose();this.mount?.replaceChildren();document.body.classList.remove('exploration-active');
    }
}
