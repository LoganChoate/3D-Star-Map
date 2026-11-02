import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const MANIFEST_URL = new URL('../assets/moon/manifest.json', import.meta.url);
const MODEL_URL = new URL('../assets/moon/moon.glb', import.meta.url);
const finitePositive = value => Number.isFinite(value) && value > 0;
const safeSource = url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

// A portable asset must carry its own buffers and images. In particular, a
// successful local GLB fetch must not silently introduce a CDN dependency.
function inspectGlb(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength) throw new Error('The Moon asset is not a complete glTF 2 binary.');
    const length = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > view.byteLength) throw new Error('The Moon asset has an invalid scene description.');
    const description = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
    for (const resource of [...(description.buffers || []), ...(description.images || [])]) {
        if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('The Moon asset requires an external image or buffer.');
    }
    const supported = new Set(['KHR_materials_unlit', 'KHR_materials_emissive_strength', 'KHR_texture_transform']);
    if ((description.extensionsRequired || []).some(name => !supported.has(name))) throw new Error('The Moon asset requires an unsupported decoder or material extension.');
    return description;
}

function releaseObject(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
    root?.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
    });
    for (const texture of textures) {
        if (texture.image?.close) images.add(texture.image);
        texture.dispose();
    }
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const image of images) image.close();
    return { geometries:geometries.size, materials:materials.size, textures:textures.size, imageBitmaps:images.size };
}

/** A bounded, object-centered inspection of the actual exported Moon asset. */
export class MoonAssetTrial {
    constructor({ mount = document.body, onOpen = () => {}, onClose = () => {} } = {}) {
        this.mount = mount;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.isOpen = false;
        this.ready = Promise.resolve(false);
        this.status = 'closed';
        this.generation = 0;
        this.completedLoads = 0;
        this.discardedLoads = 0;
        this.lastRelease = null;
        this.lastDiscardedRelease = null;
        this.disposed = false;
    }

    open(body) {
        if (this.disposed) throw new Error('The Moon inspector has been disposed.');
        if (body?.id !== 'solar:moon') throw new Error('This surface study is available for the Moon.');
        if (this.isOpen) return this.ready;
        this.isOpen = true;
        this.status = 'loading';
        this.loadingStage = 'reading';
        this.body = body;
        this.generation++;
        this.abort = new AbortController();
        this.returnFocus = document.activeElement;
        this.inertElements = [...this.mount.children].map(element => [element,element.inert]);
        this.inertElements.forEach(([element]) => { element.inert = true; });
        this.previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        this.buildShell();
        this.onOpen(body);
        const generation = this.generation;
        this.ready = this.load(generation, this.abort.signal);
        return this.ready;
    }

    buildShell() {
        this.element = document.createElement('section');
        this.element.id = 'moon-trial';
        this.element.className = 'moon-trial';
        this.element.setAttribute('role','dialog');
        this.element.setAttribute('aria-modal','true');
        this.element.setAttribute('aria-labelledby','moon-trial-title');
        this.element.innerHTML = `
          <header class="moon-trial-header"><div><span class="moon-trial-eyebrow">SURFACE STUDY</span><h2 id="moon-trial-title">Moon</h2></div><button id="moon-trial-close">← Return to map</button></header>
          <div class="moon-trial-layout"><div id="moon-trial-stage" class="moon-trial-stage">
            <canvas id="moon-trial-canvas" tabindex="0" aria-label="Interactive Moon surface. Drag to orbit, wheel or plus and minus to zoom, Home to reset, Escape to return to the map."></canvas>
            <div id="moon-trial-message" class="moon-trial-message" role="status" aria-live="polite">Loading the Moon surface…</div>
            <div class="moon-trial-stage-footer"><p>Drag to orbit · Scroll to zoom · Home to reset</p><p id="moon-trial-motion-note">Inspection view — lighting and camera motion are demonstrations, not a live lunar phase or orbital simulation.</p></div>
          </div><aside class="moon-trial-panel" aria-label="Moon appearance and inspection controls">
            <p class="moon-trial-lead">Explore the surface from any angle. Move the light to reveal the terrain.</p>
            <div class="moon-trial-controls"><button id="moon-trial-home" disabled>Reset view</button><button id="moon-trial-turntable" aria-pressed="false" disabled>Turntable camera</button></div>
            <label for="moon-trial-light">Inspection light <output id="moon-trial-light-value">−30°</output></label><input id="moon-trial-light" type="range" min="-180" max="180" step="1" value="-30" disabled>
            <button id="moon-trial-sweep" aria-pressed="false" disabled>Sweep light</button>
            <dl id="moon-trial-facts"></dl>
            <p id="moon-trial-processing" class="moon-trial-note"></p>
            <details><summary>Source maps & appearance</summary><p class="moon-trial-note">A detail map adds fine surface shading; it does not change the Moon’s outline or cast shadows from small ridges. This view uses smaller working maps, while the full NASA source maps are retained in the project.</p><div id="moon-trial-sources"></div><p class="moon-trial-note">Surface appearance and inspection lighting are separate from the map’s retained historical body-center position.</p></details>
          </aside></div>`;
        this.mount.append(this.element);
        this.elements = Object.fromEntries([...this.element.querySelectorAll('[id]')].map(element => [element.id,element]));
        const options = {signal:this.abort.signal};
        this.elements['moon-trial-close'].addEventListener('click', () => this.close(), options);
        this.elements['moon-trial-home'].addEventListener('click', () => this.resetView(), options);
        this.elements['moon-trial-turntable'].addEventListener('click', () => {
            this.controls.autoRotate = !this.controls.autoRotate;
            this.elements['moon-trial-turntable'].setAttribute('aria-pressed',String(this.controls.autoRotate));
        }, options);
        this.elements['moon-trial-sweep'].addEventListener('click', () => {
            this.sweep = !this.sweep;
            this.elements['moon-trial-sweep'].setAttribute('aria-pressed',String(this.sweep));
        }, options);
        this.elements['moon-trial-light'].addEventListener('input', event => {
            this.sweep = false;
            this.elements['moon-trial-sweep'].setAttribute('aria-pressed','false');
            this.lightAzimuth = Number(event.target.value);
            this.updateLight();
        }, options);
        this.element.addEventListener('keydown', event => this.handleKey(event), options);
        this.elements['moon-trial-close'].focus({preventScroll:true});
    }

    async load(generation, signal) {
        let loadedRoot = null;
        const current = () => this.isOpen && this.generation === generation && !signal.aborted;
        try {
            const response = await fetch(MANIFEST_URL, {signal});
            if (!response.ok) throw new Error(`Moon source information is unavailable (${response.status}).`);
            const manifest = await response.json();
            if (manifest.schemaVersion !== 1 || manifest.body?.id !== 'solar:moon' || !finitePositive(manifest.body.meanRadiusKm) || !finitePositive(manifest.geometry?.radiusUnits) || manifest.geometry.reliefScale !== 1) throw new Error('Moon source information has incompatible identity, scale or relief units.');
            if (!finitePositive(this.body.radiusKm) || Math.abs(manifest.body.meanRadiusKm - this.body.radiusKm) > 0.001) throw new Error('The asset radius does not match the selected Moon catalog record.');
            if (!current()) return false;
            const assetResponse = await fetch(MODEL_URL, {signal});
            if (!assetResponse.ok) throw new Error(`Moon geometry is unavailable (${assetResponse.status}).`);
            const buffer = await assetResponse.arrayBuffer();
            if (!current()) return false;
            inspectGlb(buffer);
            if (Number.isInteger(manifest.asset?.bytes) && manifest.asset.bytes !== buffer.byteLength) throw new Error('Moon asset size does not match its source record.');
            let actualHash = null;
            if (manifest.asset?.sha256) {
                actualHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(value => value.toString(16).padStart(2,'0')).join('');
                if (actualHash !== manifest.asset.sha256.toLowerCase()) throw new Error('Moon asset integrity check failed.');
            }
            if (!current()) return false;
            const loader = new GLTFLoader();
            this.loadingStage = 'decoding';
            this.elements['moon-trial-message'].textContent = 'Preparing the Moon surface…';
            const gltf = await loader.parseAsync(buffer, new URL('.',MODEL_URL).href);
            loadedRoot = gltf.scene;
            if (!current()) {
                this.lastDiscardedRelease = releaseObject(loadedRoot);
                loadedRoot = null;
                this.discardedLoads++;
                return false;
            }
            this.manifest = manifest;
            this.assetInfo = {sha256:actualHash,bytes:buffer.byteLength};
            this.model = loadedRoot;
            loadedRoot = null;
            this.inspectModel();
            this.createScene();
            this.renderFacts();
            this.status = 'ready';
            this.loadingStage = null;
            this.completedLoads++;
            this.elements['moon-trial-message'].hidden = true;
            this.element.querySelectorAll('button:disabled,input:disabled').forEach(control => { control.disabled = false; });
            this.elements['moon-trial-canvas'].focus({preventScroll:true});
            this.previousFrameTime = performance.now();
            this.animate(this.previousFrameTime);
            return true;
        } catch (error) {
            if (loadedRoot) releaseObject(loadedRoot);
            if (!current()) return false;
            this.releaseScene();
            this.status = 'error';
            this.loadingStage = null;
            const message = this.elements['moon-trial-message'];
            message.hidden = false;
            const reason = error.message === 'Failed to fetch' ? 'The local surface files could not be read' : String(error.message || error).replace(/[.\s]+$/,'');
            message.textContent = `The Moon surface could not be opened. ${reason}. Return to the map and try again.`;
            return false;
        }
    }

    inspectModel() {
        const root = this.model, vertex = new THREE.Vector3();
        root.updateMatrixWorld(true);
        let vertices = 0, triangles = 0, meshes = 0, minimumRadius = Infinity, maximumRadius = 0;
        const textures = new Map();
        root.traverse(object => {
            if (!object.isMesh) return;
            meshes++;
            const geometry = object.geometry, positions = geometry.getAttribute('position');
            if (!positions || !geometry.getAttribute('normal')) throw new Error('Moon geometry lacks positions or surface normals.');
            vertices += positions.count;
            triangles += (geometry.index?.count || positions.count) / 3;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                for (const [role,texture] of [['color',material?.map],['normal',material?.normalMap]]) {
                    if (texture && !textures.has(texture)) textures.set(texture,{role,width:texture.image.width,height:texture.image.height,colorSpace:texture.colorSpace});
                }
            }
            for (let index=0; index<positions.count; index++) {
                vertex.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
                const radius = vertex.length();
                if (!Number.isFinite(radius)) throw new Error('Moon geometry contains invalid coordinates.');
                minimumRadius = Math.min(minimumRadius,radius);
                maximumRadius = Math.max(maximumRadius,radius);
            }
        });
        const expectedRadius = this.manifest.geometry.radiusUnits;
        if (!meshes || minimumRadius < expectedRadius*0.9 || maximumRadius > expectedRadius*1.1) throw new Error('The Moon geometry is not centered at its documented physical scale.');
        if (Number.isInteger(this.manifest.asset?.triangles) && triangles !== this.manifest.asset.triangles) throw new Error('Moon triangle count does not match its export record.');
        this.geometryInfo = {meshes,vertices,triangles,minimumRadius,maximumRadius,radiusUnits:expectedRadius};
        this.textureInfo = [...textures.values()];
        this.radius = maximumRadius;
    }

    createScene() {
        this.canvas = this.elements['moon-trial-canvas'];
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#05080d');
        this.scene.add(this.model);
        this.camera = new THREE.PerspectiveCamera(38,1,this.radius*0.005,this.radius*60);
        this.renderer = new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.controls = new OrbitControls(this.camera,this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = this.radius*1.08;
        this.controls.maxDistance = this.radius*18;
        this.controls.autoRotateSpeed = 0.7;
        this.keyLight = new THREE.DirectionalLight(0xffffff,3);
        this.scene.add(this.keyLight);
        this.scene.add(new THREE.AmbientLight(0xffffff,0.035));
        this.lightAzimuth = -30;
        this.sweep = false;
        this.updateLight();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.elements['moon-trial-stage']);
        this.resize();
        this.resetView();
        this.frameCount = 0;
    }

    renderFacts() {
        const manifest = this.manifest;
        const facts = [
            ['Catalog identity',manifest.body.id],
            ['Mean radius',`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(manifest.body.meanRadiusKm)} km`],
            ['Relief','Physical height · 1× scale'],
            ['Lighting','Adjustable inspection light'],
        ];
        const color = manifest.textures?.color;
        if (color?.width && color?.height) facts.push(['Displayed color map',`${color.width.toLocaleString()} × ${color.height.toLocaleString()} pixels`]);
        for (const [name,value] of facts) {
            const term = document.createElement('dt'), description = document.createElement('dd');
            term.textContent = name; description.textContent = value;
            this.elements['moon-trial-facts'].append(term,description);
        }
        this.elements['moon-trial-processing'].textContent = manifest.processingNote || 'Observation-derived NASA color and height maps. Color processing and polar fill are documented in the source information; this is not a raw measurement image.';
        for (const source of manifest.sources || []) {
            const block = document.createElement('p');
            if (safeSource(source.url)) {
                const anchor = document.createElement('a');
                anchor.href = source.url; anchor.textContent = source.label || 'NASA source';
                anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; block.append(anchor);
            }
            for (const value of [source.credit,source.processing].filter(Boolean)) {
                const note = document.createElement('span'); note.textContent = value; block.append(note);
            }
            this.elements['moon-trial-sources'].append(block);
        }
    }

    resize() {
        if (!this.renderer || !this.element?.isConnected) return;
        const bounds = this.elements['moon-trial-stage'].getBoundingClientRect();
        const width = Math.max(1,bounds.width), height = Math.max(1,bounds.height);
        this.camera.aspect = width/height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width,height,false);
    }

    resetView() {
        if (!this.controls) return;
        // Flush residual orbit damping before setting the exact home view.
        // Otherwise a reset during a drag/turntable continues to drift.
        this.controls.autoRotate = false;
        const damping = this.controls.enableDamping;
        this.controls.enableDamping = false;
        this.controls.update();
        const vertical = THREE.MathUtils.degToRad(this.camera.fov/2), horizontal = Math.atan(Math.tan(vertical)*this.camera.aspect);
        this.camera.position.set(0,0,this.radius/Math.sin(Math.min(vertical,horizontal))*1.12);
        this.controls.target.set(0,0,0);
        this.elements['moon-trial-turntable'].setAttribute('aria-pressed','false');
        this.controls.update();
        this.controls.enableDamping = damping;
    }

    updateLight() {
        if (!this.keyLight) return;
        const azimuth = THREE.MathUtils.degToRad(this.lightAzimuth), elevation = THREE.MathUtils.degToRad(20);
        this.keyLight.position.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)).multiplyScalar(this.radius*8);
        this.elements['moon-trial-light'].value = String(Math.round(this.lightAzimuth));
        this.elements['moon-trial-light-value'].value = `${Math.round(this.lightAzimuth)}°`;
    }

    animate(now) {
        if (!this.isOpen || this.status !== 'ready') return;
        const delta = Math.min((now-this.previousFrameTime)/1000,0.1);
        this.previousFrameTime = now;
        if (this.sweep) {
            this.lightAzimuth = ((this.lightAzimuth + delta*12 + 180)%360)-180;
            this.updateLight();
        }
        this.controls.update(delta);
        this.renderer.render(this.scene,this.camera);
        this.frameCount++;
        this.animationFrame = requestAnimationFrame(time => this.animate(time));
    }

    handleKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
        if (event.key === 'Tab') {
            const focusable = [...this.element.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,a[href],canvas')].filter(element => element.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            return;
        }
        if (event.target !== this.canvas || !this.controls) return;
        if (event.key === 'Home') { event.preventDefault(); this.resetView(); }
        else if (['+','=','-','_'].includes(event.key)) {
            event.preventDefault();
            const factor = ['+','='].includes(event.key) ? 0.85 : 1/0.85;
            const offset = this.camera.position.clone().sub(this.controls.target);
            offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance,this.controls.maxDistance));
            this.camera.position.copy(this.controls.target).add(offset);
            this.controls.update();
        }
    }

    snapshot() {
        return {
            status:this.status, isOpen:this.isOpen, objectId:this.isOpen ? this.body?.id : null,
            loadingStage:this.loadingStage || null,
            completedLoads:this.completedLoads, discardedLoads:this.discardedLoads,
            geometry:this.geometryInfo ? {...this.geometryInfo} : null,
            asset:this.assetInfo ? {...this.assetInfo} : null,
            textures:this.textureInfo?.map(texture => ({...texture})) || [],
            frameCount:this.frameCount || 0,
            camera:this.camera?.position.toArray() || null,
            lightAzimuth:this.lightAzimuth ?? null,
            turntable:!!this.controls?.autoRotate, sweep:!!this.sweep,
            renderer:this.renderer ? {textures:this.renderer.info.memory.textures,geometries:this.renderer.info.memory.geometries,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,maxTextureSize:this.renderer.capabilities.maxTextureSize} : null,
            lastRelease:this.lastRelease,
            lastDiscardedRelease:this.lastDiscardedRelease,
        };
    }

    releaseScene() {
        cancelAnimationFrame(this.animationFrame);
        this.resizeObserver?.disconnect();
        this.controls?.dispose();
        if (this.model) this.lastRelease = releaseObject(this.model);
        if (this.renderer) {
            this.renderer.renderLists.dispose();
            this.renderer.dispose();
            this.renderer.forceContextLoss();
        }
        this.scene?.clear();
        this.model = this.scene = this.camera = this.controls = this.keyLight = this.renderer = this.canvas = this.resizeObserver = null;
        this.manifest = null;
        this.geometryInfo = null;
        this.assetInfo = null;
        this.textureInfo = null;
        this.sweep = false;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.generation++;
        this.abort.abort();
        this.releaseScene();
        this.element.remove();
        this.element = this.elements = null;
        this.inertElements.forEach(([element,previous]) => { element.inert = previous; });
        this.inertElements = [];
        document.body.style.overflow = this.previousOverflow;
        this.status = 'closed';
        this.loadingStage = null;
        this.onClose(this.body);
        if (this.returnFocus?.isConnected) this.returnFocus.focus({preventScroll:true});
        this.returnFocus = null;
    }

    dispose() {
        this.close();
        this.disposed = true;
    }
}
