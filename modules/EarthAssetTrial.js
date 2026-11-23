import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';

const MANIFEST_URL = new URL('../assets/earth/runtime-manifest.json', import.meta.url);
const APPEARANCE_URL = new URL('../assets/earth/appearance.json', import.meta.url);
const radians = THREE.MathUtils.degToRad;
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const direction = (lon,lat) => new THREE.Vector3(Math.cos(radians(lat))*Math.cos(radians(lon)),Math.cos(radians(lat))*Math.sin(radians(lon)),Math.sin(radians(lat)));
const finite = (value,lo,hi) => Number.isFinite(value) && value >= lo && value <= hi;
const safeSource = value => {try{return new URL(value).protocol==='https:';}catch{return false;}};

const vertexShader = `
varying vec2 vUv;
varying vec3 vLocalPosition, vWorldPosition, vWorldNormal;
void main(){
  vUv=uv;vLocalPosition=position;
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorldPosition=world.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*world;
}`;

const surfaceShader = `
uniform sampler2D uDay, uNight;
uniform vec3 uSun;
uniform float uEnergy, uExposure, uNightIntensity;
varying vec2 vUv;
varying vec3 vWorldPosition,vWorldNormal;
void main(){
  vec3 normal=normalize(vWorldNormal),view=normalize(cameraPosition-vWorldPosition);
  float daylight=dot(normal,uSun);
  vec3 albedo=texture2D(uDay,vUv).rgb;
  float night=dot(texture2D(uNight,vUv).rgb,vec3(0.2126,0.7152,0.0722));
  float gate=1.0-smoothstep(-0.10,0.05,daylight);
  vec3 illumination=albedo*max(0.0,daylight)*uEnergy/3.14159265;
  // A broad restrained surface highlight approximates the proof's roughness.
  // No water mask or physically calibrated ocean reflectance is implied.
  vec3 halfway=normalize(view+uSun);
  illumination+=vec3(0.022)*pow(max(0.0,dot(normal,halfway)),12.0)*max(0.0,daylight)*uEnergy;
  vec3 emission=vec3(1.0,0.57,0.20)*pow(max(0.0,night),2.1)*gate*uNightIntensity;
  gl_FragColor=vec4((illumination+emission)*uExposure,1.0);
  #include <colorspace_fragment>
}`;

const cloudShader = `
uniform sampler2D uCloud;
uniform vec3 uSun;
uniform float uTime,uEvolutionRate,uWarp,uOpacity,uEnergy,uExposure;
varying vec2 vUv;
varying vec3 vLocalPosition,vWorldNormal;
vec3 hash4(vec4 p){
  p=fract(p*vec4(0.1031,0.1030,0.0973,0.1099));
  p+=dot(p,p.wzxy+33.33);
  return fract((p.xxy+p.yzz)*p.zyw);
}
vec3 noiseSlice(vec3 p,float w){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash4(vec4(i,w)),hash4(vec4(i+vec3(1,0,0),w)),f.x),mix(hash4(vec4(i+vec3(0,1,0),w)),hash4(vec4(i+vec3(1,1,0),w)),f.x),f.y),
    mix(mix(hash4(vec4(i+vec3(0,0,1),w)),hash4(vec4(i+vec3(1,0,1),w)),f.x),mix(hash4(vec4(i+vec3(0,1,1),w)),hash4(vec4(i+vec3(1,1,1),w)),f.x),f.y),f.z);
}
vec3 noise4(vec3 p,float t){float w=floor(t),f=fract(t);f=f*f*(3.0-2.0*f);return mix(noiseSlice(p,w),noiseSlice(p,w+1.0),f);}
void main(){
  // Object-space coordinates stay continuous across the longitude seam.
  // Three octaves, 0.55 roughness and a changing fourth coordinate retain
  // the proof's small evolving deformation without pretending to simulate wind.
  vec3 p=(normalize(vLocalPosition)*0.5+0.5)*7.5;
  float t=uTime*uEvolutionRate;
  vec3 n=(noise4(p,t)+0.55*noise4(p*2.0,t*2.0)+0.3025*noise4(p*4.0,t*4.0))/1.8525;
  vec2 warped=vUv+(n.xy-0.5)*uWarp;
  float cloud=dot(texture2D(uCloud,warped).rgb,vec3(0.2126,0.7152,0.0722));
  float alpha=clamp(pow(max(0.0,cloud),1.28)*(0.82+0.18*n.x)*uOpacity,0.0,1.0);
  float diffuse=max(0.0,dot(normalize(vWorldNormal),uSun))*uEnergy/3.14159265;
  gl_FragColor=vec4(vec3(0.97,0.98,1.0)*diffuse*uExposure,alpha);
  #include <colorspace_fragment>
}`;

const atmosphereShader = `
uniform vec3 uSun;
uniform float uStrength,uExposure;
varying vec3 vWorldPosition,vWorldNormal;
void main(){
  vec3 normal=normalize(vWorldNormal),view=normalize(cameraPosition-vWorldPosition);
  float rim=pow(1.0-abs(dot(normal,view)),3.5);
  float daylight=smoothstep(-0.25,0.35,dot(normal,uSun));
  gl_FragColor=vec4(vec3(0.07,0.30,0.85)*1.1*uExposure,rim*daylight*uStrength);
  #include <colorspace_fragment>
}`;

/** Same geographic convention and tessellation as the approved Blender proof. */
function globeGeometry(segments=192,rings=96){
    const positions=[],normals=[],uv=[],indices=[];
    for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
        const p=direction(-180+360*i/segments,-90+180*j/rings);
        positions.push(p.x,p.y,p.z);normals.push(p.x,p.y,p.z);uv.push(i/segments,j/rings);
    }
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
        const a=j*(segments+1)+i,b=a+1,c=b+segments+1,d=a+segments+1;
        indices.push(a,b,c,a,c,d);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}

function releaseTextures(resources){
    for(const resource of resources){resource.texture.dispose();resource.bitmap.close();}
    return resources.length;
}

/** Animated Earth visualization using exact packed maps from its approved proof. */
export class EarthAssetTrial {
    constructor({mount=document.body,onOpen=()=>{},onClose=()=>{},embedded=false,controlsMount=null,onRequestClose=null}={}){
        Object.assign(this,{mount,onOpen,onClose,embedded,controlsMount,onRequestClose});
        this.isOpen=false;this.status='closed';this.ready=Promise.resolve(false);this.generation=0;
        this.completedLoads=0;this.cancelledLoads=0;this.suspended=false;this.disposed=false;
        this.resources=[];this.lastRelease=null;this.animationFrame=null;
    }

    open(body){
        if(this.disposed)throw Error('The Earth inspector has been disposed.');
        if(body?.id!=='solar:earth')throw Error('This close-up is available only for Earth.');
        if(this.isOpen)return this.ready;
        this.startedAt=performance.now();this.body=body;this.isOpen=true;this.status='loading';this.error=null;
        const generation=++this.generation;this.abort=new AbortController();
        if(!this.embedded){
            this.returnFocus=document.activeElement;
            this.inertElements=[...this.mount.children].map(e=>[e,e.inert]);this.inertElements.forEach(([e])=>e.inert=true);
            this.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
        }
        this.buildShell();this.onOpen(body);this.ready=this.load(generation,this.abort.signal);return this.ready;
    }

    buildShell(){
        this.element=document.createElement('section');this.element.id='earth-trial';this.element.className=`earth-trial${this.embedded?' inspection-embedded':''}`;
        if(!this.embedded){this.element.setAttribute('role','dialog');this.element.setAttribute('aria-modal','true');this.element.setAttribute('aria-labelledby','earth-trial-title');}
        this.element.innerHTML=`<header class="earth-trial-header"><h2 id="earth-trial-title">Earth</h2><button id="earth-trial-close">Return to map</button></header>
          <div class="earth-trial-layout"><div id="earth-trial-stage" class="earth-trial-stage">
            <canvas id="earth-trial-canvas" tabindex="0" aria-label="Animated Earth close-up. Drag to orbit, scroll or plus and minus to zoom, Space to pause all motion, Home to reset, Escape to return."></canvas>
            <div id="earth-trial-message" class="earth-trial-message" role="status" aria-live="polite">Loading Earth’s surface, clouds and atmosphere…</div>
            <div class="earth-trial-stage-footer"><p>Drag to orbit · Scroll to zoom · Space to pause</p><p>Historical NASA imagery · Illustrative motion, not live weather</p></div>
          </div><aside class="earth-trial-panel" aria-label="Earth appearance and motion controls">
            <p class="earth-trial-lead">Explore the approved Earth: layered clouds, a thin atmosphere and night-side city lights.</p>
            <fieldset class="earth-trial-modes"><legend>Appearance</legend><button id="earth-trial-scientific" aria-pressed="true" disabled>Scientific</button><button id="earth-trial-artistic" aria-pressed="false" disabled>Artistic</button></fieldset>
            <p id="earth-trial-mode-note" class="earth-trial-note"></p>
            <div class="earth-trial-controls"><button id="earth-trial-pause" aria-pressed="false" disabled>Pause motion</button><button id="earth-trial-home" disabled>Reset view</button><button id="earth-trial-turntable" aria-pressed="true" disabled>Automatic camera</button><button id="earth-trial-rotation" aria-pressed="true" disabled>Globe rotation</button></div>
            <label for="earth-trial-speed">Illustration speed <output id="earth-trial-speed-value">1×</output></label><input id="earth-trial-speed" type="range" min="0" max="2" step="0.1" value="1" disabled>
            <p class="earth-trial-note">At 1×, the globe turns once in two minutes. Cloud drift and changing shapes are illustrations. Pause stops animation and automatic camera movement; you can still explore by hand.</p>
            <details><summary>Imagery and visual limits</summary><div id="earth-trial-sources"></div><p class="earth-trial-note">The maps span different years. Cloud brightness is used for visual coverage, not measured cloud height or optical depth. This is a layered illustration, not a weather or atmosphere simulation. The view is independent of the catalog’s historical position.</p></details>
          </aside></div>`;
        this.mount.append(this.element);this.elements=Object.fromEntries([...this.element.querySelectorAll('[id]')].map(e=>[e.id,e]));
        this.panel=this.element.querySelector('.earth-trial-panel');if(this.embedded&&this.controlsMount)this.controlsMount.append(this.panel);
        const listen=(id,type,fn)=>this.elements[id].addEventListener(type,fn,{signal:this.abort.signal});
        listen('earth-trial-close','click',()=>this.close());listen('earth-trial-home','click',()=>this.resetView());
        listen('earth-trial-scientific','click',()=>this.setMode('scientific'));listen('earth-trial-artistic','click',()=>this.setMode('artistic'));
        listen('earth-trial-pause','click',()=>this.setPaused(!this.paused));listen('earth-trial-turntable','click',()=>this.setOrbitEnabled(!this.orbitEnabled));
        listen('earth-trial-rotation','click',()=>this.setRotationEnabled(!this.rotationEnabled));listen('earth-trial-speed','input',e=>this.setSpeed(Number(e.target.value)));
        // Embedded keyboard events are forwarded once by UnifiedInspector.
        if(!this.embedded)this.element.addEventListener('keydown',e=>this.handleKey(e),{signal:this.abort.signal});
        if(!this.embedded)this.elements['earth-trial-close'].focus({preventScroll:true});
    }

    validate(manifest,appearance){
        if(manifest.schemaVersion!==1||manifest.bodyId!=='solar:earth'||appearance.schemaVersion!==1||appearance.body!=='Earth'||appearance.geometry?.normalizedRadius!==1)throw Error('Earth appearance identity is incompatible.');
        if(!Array.isArray(manifest.textures)||manifest.textures.length!==3)throw Error('Earth texture manifest is incomplete.');
        const roles=new Set();
        for(const item of manifest.textures){
            if(!['day-surface','night-lights','clouds'].includes(item.role)||roles.has(item.role)||!new RegExp(`^${item.role}\\.(png|jpg)$`).test(item.file)||!/^image\/(png|jpeg)$/.test(item.mime)||!['srgb','linear'].includes(item.colorSpace)||!Number.isInteger(item.bytes)||!finite(item.bytes,1,32*1024*1024)||!Number.isInteger(item.width)||!Number.isInteger(item.height)||!finite(item.width,1,8192)||!finite(item.height,1,8192)||!/^([a-f0-9]{64})$/.test(item.sha256))throw Error('Earth texture entry is invalid.');
            roles.add(item.role);
        }
        const animation=appearance.animation;
        if(!animation||!finite(animation.rotationDegreesPerSecond,0,20)||!finite(animation.cloudDriftDegreesPerSecond,0,10)||!finite(animation.cloudEvolutionRate,0,1)||!finite(animation.cloudUvWarp,0,0.05))throw Error('Earth motion settings are invalid.');
        for(const name of ['scientific','artistic']){
            const m=appearance.modes?.[name];
            if(!m||!finite(m.cloudRadius,1,1.1)||!finite(m.atmosphereRadius,1,1.1)||m.atmosphereRadius<=m.cloudRadius||!finite(m.cloudOpacity,0,1)||!finite(m.atmosphereStrength,0,1)||!finite(m.nightIntensity,0,5))throw Error('Earth presentation settings are invalid.');
        }
        const runtime=manifest.runtime;
        if(!runtime||runtime.defaultMode!=='scientific'||typeof runtime.defaultPaused!=='boolean'||typeof runtime.defaultOrbit!=='boolean'||!finite(runtime.minSpeed,0,0)||!finite(runtime.maxSpeed,0.1,4)||!finite(runtime.defaultSpeed,runtime.minSpeed,runtime.maxSpeed)||!finite(runtime.orbitDegreesPerSecond,-20,20)||!finite(runtime.cameraLongitudeDeg,-180,180)||!finite(runtime.cameraLatitudeDeg,-85,85)||!finite(runtime.sunLongitudeDeg,-180,180)||!finite(runtime.sunLatitudeDeg,-90,90)||!finite(runtime.verticalFovDeg,15,60)||!finite(runtime.sunEnergy,0.1,5)||!finite(runtime.exposure,0.1,2))throw Error('Earth view settings are invalid.');
        if(manifest.geometry?.segments!==192||manifest.geometry?.rings!==96)throw Error('Earth geographic mesh is incompatible.');
    }

    async load(generation,signal){
        const current=()=>this.isOpen&&generation===this.generation&&!signal.aborted;
        let acquired=[];
        const read=async url=>{const response=await fetch(url,{signal});if(!response.ok)throw Error(`Earth data could not be read (${response.status}).`);return response.arrayBuffer();};
        try{
            const [manifestBytes,appearanceBytes]=await Promise.all([read(MANIFEST_URL),read(APPEARANCE_URL)]);
            if(!current()){this.cancelledLoads++;return false;}
            const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)),appearance=JSON.parse(new TextDecoder().decode(appearanceBytes));
            this.validate(manifest,appearance);
            if(await sha256(appearanceBytes)!==manifest.appearanceSha256)throw Error('Earth settings do not match the approved runtime manifest.');
            const outcomes=await Promise.allSettled(manifest.textures.map(async spec=>{
                const bytes=await read(new URL(spec.file,MANIFEST_URL));
                if(bytes.byteLength!==spec.bytes||await sha256(bytes)!==spec.sha256)throw Error(`Earth ${spec.role} texture is incomplete or changed.`);
                // Flip once at decode: ImageBitmap ignores Texture.flipY.
                const bitmap=await createImageBitmap(new Blob([bytes],{type:spec.mime}),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
                if(!current()||bitmap.width!==spec.width||bitmap.height!==spec.height){bitmap.close();throw Error('Earth image dimensions changed or loading was cancelled.');}
                const texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=spec.colorSpace==='srgb'?THREE.SRGBColorSpace:THREE.NoColorSpace;
                texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
                return {spec,texture,bitmap};
            }));
            acquired=outcomes.filter(v=>v.status==='fulfilled').map(v=>v.value);
            const failed=outcomes.find(v=>v.status==='rejected');if(failed)throw failed.reason;
            const manifestInfo={sha256:await sha256(manifestBytes),bytes:manifestBytes.byteLength,appearanceSha256:manifest.appearanceSha256,textures:manifest.textures.map(t=>({role:t.role,sha256:t.sha256,bytes:t.bytes,width:t.width,height:t.height}))};
            if(!current()){this.cancelledLoads++;return false;}
            // All awaited work stays local. An older cancelled load must never
            // publish resources into, or release resources from, a reopened view.
            this.manifest=manifest;this.appearance=appearance;this.resources=acquired;acquired=[];this.manifestInfo=manifestInfo;
            Object.assign(this,{elapsed:0,rotationOffset:0,heldSurfaceRotation:0,rotationEnabled:true,mode:'scientific',paused:manifest.runtime.defaultPaused,speed:manifest.runtime.defaultSpeed,orbitEnabled:false,frameCount:0,frameSamples:[],shaderError:null});
            this.createScene();this.setMode('scientific');this.setSpeed(this.speed);this.setPaused(this.paused);this.setOrbitEnabled(manifest.runtime.defaultOrbit);this.renderSources();
            const start=performance.now();this.renderer.compile(this.scene,this.camera);this.compileMs=performance.now()-start;
            if(this.shaderError)throw Error(this.shaderError);
            this.renderer.render(this.scene,this.camera);this.firstRenderedFrameMs=performance.now()-this.startedAt;
            this.status='ready';this.completedLoads++;this.elements['earth-trial-message'].hidden=true;
            Object.values(this.elements).filter(e=>e.matches('button:disabled,input:disabled')).forEach(e=>e.disabled=false);
            if(!this.embedded&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)this.reduceMotion();
            this.previousFrameTime=performance.now();this.animate(this.previousFrameTime);return true;
        }catch(error){
            if(!current()){this.cancelledLoads++;return false;}
            this.releaseScene();this.status='error';this.error=String(error.message||error);
            this.elements['earth-trial-message'].textContent=`Earth could not be opened. ${this.error} The catalog information remains available.`;return false;
        }finally{
            if(acquired.length){const count=releaseTextures(acquired);this.lastDiscardedRelease={textures:count,imageBitmaps:count};}
        }
    }

    createScene(){
        const r=this.manifest.runtime;
        this.canvas=this.elements['earth-trial-canvas'];this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x000000);
        this.camera=new THREE.PerspectiveCamera(r.verticalFovDeg,1,0.005,50);this.camera.up.set(0,0,1);
        this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
        this.renderer.debug.onShaderError=()=>{this.shaderError='Earth graphics shaders could not be compiled.';};
        const maps=Object.fromEntries(this.resources.map(item=>[item.spec.role,item.texture]));
        const anisotropy=Math.min(this.renderer.capabilities.getMaxAnisotropy(),8);for(const texture of Object.values(maps))texture.anisotropy=anisotropy;
        const sunlight=direction(r.sunLongitudeDeg,r.sunLatitudeDeg),common={uSun:{value:sunlight},uExposure:{value:r.exposure}};
        this.surfaceUniforms={...common,uDay:{value:maps['day-surface']},uNight:{value:maps['night-lights']},uEnergy:{value:r.sunEnergy},uNightIntensity:{value:1}};
        this.cloudUniforms={...common,uCloud:{value:maps.clouds},uTime:{value:0},uEvolutionRate:{value:this.appearance.animation.cloudEvolutionRate},uWarp:{value:this.appearance.animation.cloudUvWarp},uOpacity:{value:1},uEnergy:{value:r.sunEnergy}};
        this.atmosphereUniforms={...common,uStrength:{value:0}};
        this.geometry=globeGeometry();
        this.surface=new THREE.Mesh(this.geometry,new THREE.ShaderMaterial({uniforms:this.surfaceUniforms,vertexShader,fragmentShader:surfaceShader}));this.surface.name='earth-surface';this.scene.add(this.surface);
        this.clouds=new THREE.Mesh(this.geometry,new THREE.ShaderMaterial({uniforms:this.cloudUniforms,vertexShader,fragmentShader:cloudShader,transparent:true,depthWrite:false,side:THREE.FrontSide}));this.clouds.name='earth-clouds';this.clouds.renderOrder=1;this.surface.add(this.clouds);
        this.atmosphere=new THREE.Mesh(this.geometry,new THREE.ShaderMaterial({uniforms:this.atmosphereUniforms,vertexShader,fragmentShader:atmosphereShader,transparent:true,depthWrite:false,side:THREE.FrontSide}));this.atmosphere.name='earth-atmosphere';this.atmosphere.renderOrder=2;this.scene.add(this.atmosphere);
        this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enablePan=false;this.controls.enableDamping=true;this.controls.dampingFactor=0.08;
        this.controls.minDistance=1.07;this.controls.maxDistance=16;
        this.controls.addEventListener('start',()=>this.setOrbitEnabled(false));
        this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.elements['earth-trial-stage']);this.resize();this.resetView();
    }

    renderSources(){
        for(const source of this.manifest.textures){
            const p=document.createElement('p'),a=document.createElement('a');
            a.textContent=`${source.role==='day-surface'?'Surface':source.role==='clouds'?'Clouds':'Night lights'} · ${source.epoch}`;
            if(safeSource(source.sourcePage)){a.href=source.sourcePage;a.target='_blank';a.rel='noopener noreferrer';}
            const credit=document.createElement('span');credit.textContent=source.credit;p.append(a,credit);this.elements['earth-trial-sources'].append(p);
        }
    }

    setMode(name){
        if(!this.surface||!['scientific','artistic'].includes(name))return;
        this.mode=name;const m=this.appearance.modes[name];
        this.clouds.scale.setScalar(m.cloudRadius);this.atmosphere.scale.setScalar(m.atmosphereRadius);
        this.cloudUniforms.uOpacity.value=m.cloudOpacity;this.atmosphereUniforms.uStrength.value=m.atmosphereStrength;this.surfaceUniforms.uNightIntensity.value=m.nightIntensity;
        this.element.dataset.appearance=name;
        this.elements['earth-trial-scientific'].setAttribute('aria-pressed',String(name==='scientific'));this.elements['earth-trial-artistic'].setAttribute('aria-pressed',String(name==='artistic'));
        this.elements['earth-trial-mode-note'].textContent=name==='scientific'?'Restrained cloud height, atmospheric rim and night lights. Historical maps and animated motion remain an illustration.':'More visible cloud layers, atmosphere and city lights, using the same NASA imagery and approved animation rates.';
    }

    syncOrbit(){
        if(!this.controls)return;
        this.controls.autoRotate=!!this.orbitEnabled&&!this.paused&&!this.suspended&&this.speed>0;
        this.controls.autoRotateSpeed=-this.manifest.runtime.orbitDegreesPerSecond/6*this.speed;
    }
    flushDamping(){if(this.controls){const damping=this.controls.enableDamping,orbit=this.controls.autoRotate;this.controls.autoRotate=false;this.controls.enableDamping=false;this.controls.update(0);this.controls.enableDamping=damping;this.controls.autoRotate=orbit;}}
    setPaused(value){
        this.paused=!!value;this.syncOrbit();if(this.paused)this.flushDamping();
        if(this.elements){this.elements['earth-trial-pause'].textContent=this.paused?'Resume motion':'Pause motion';this.elements['earth-trial-pause'].setAttribute('aria-pressed',String(this.paused));}
    }
    setSpeed(value){
        if(!this.manifest||!Number.isFinite(value))return;this.speed=THREE.MathUtils.clamp(value,this.manifest.runtime.minSpeed,this.manifest.runtime.maxSpeed);
        this.elements['earth-trial-speed'].value=String(this.speed);this.elements['earth-trial-speed-value'].value=`${this.speed}×`;this.syncOrbit();if(this.speed===0)this.flushDamping();
    }
    setRotationEnabled(value){
        if(!this.surface)return;const enabled=!!value;if(enabled===this.rotationEnabled)return;
        if(enabled)this.rotationOffset=this.heldSurfaceRotation-this.elapsed*radians(this.appearance.animation.rotationDegreesPerSecond);
        else this.heldSurfaceRotation=this.surface.rotation.z;
        this.rotationEnabled=enabled;this.elements['earth-trial-rotation'].setAttribute('aria-pressed',String(enabled));this.updateTime();
    }
    setOrbitEnabled(value){
        this.orbitEnabled=!!value;this.syncOrbit();if(!this.orbitEnabled)this.flushDamping();
        this.elements?.['earth-trial-turntable']?.setAttribute('aria-pressed',String(this.orbitEnabled));
    }
    setSuspended(value){
        this.suspended=!!value;cancelAnimationFrame(this.animationFrame);this.animationFrame=null;this.previousFrameTime=performance.now();this.syncOrbit();
        if(this.suspended)this.flushDamping();
        else if(this.isOpen&&this.status==='ready')this.animate(this.previousFrameTime);
    }
    reduceMotion(){this.setPaused(true);this.setOrbitEnabled(false);if(this.controls)this.controls.enableDamping=false;}
    resetView(){
        if(!this.controls)return;this.setOrbitEnabled(false);this.elapsed=0;this.rotationOffset=0;this.heldSurfaceRotation=0;this.updateTime();
        const half=radians(this.camera.fov/2),horizontal=Math.atan(Math.tan(half)*this.camera.aspect);
        this.camera.position.copy(direction(this.manifest.runtime.cameraLongitudeDeg,this.manifest.runtime.cameraLatitudeDeg)).multiplyScalar(1.18/Math.sin(Math.min(half,horizontal)));
        this.controls.target.set(0,0,0);this.controls.update(0);
    }
    resize(){
        if(!this.renderer||!this.element?.isConnected)return;const rect=this.elements['earth-trial-stage'].getBoundingClientRect();
        this.camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height);this.camera.updateProjectionMatrix();this.renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
    }
    updateTime(){
        if(!this.surface)return;
        this.surface.rotation.z=this.rotationEnabled?this.elapsed*radians(this.appearance.animation.rotationDegreesPerSecond)+this.rotationOffset:this.heldSurfaceRotation;
        this.clouds.rotation.z=this.elapsed*radians(this.appearance.animation.cloudDriftDegreesPerSecond);this.cloudUniforms.uTime.value=this.elapsed;
    }
    animate(now){
        if(!this.isOpen||this.status!=='ready'||this.suspended)return;
        const delta=Math.min(Math.max(0,(now-this.previousFrameTime)/1000),0.1);this.previousFrameTime=now;
        if(!this.paused)this.elapsed+=delta*this.speed;this.updateTime();this.controls.update(delta);
        const start=performance.now();this.renderer.render(this.scene,this.camera);const end=performance.now();
        this.frameSamples.push({start,end,hidden:document.hidden,focused:document.hasFocus()});if(this.frameSamples.length>1600)this.frameSamples.shift();
        this.frameCount++;this.animationFrame=requestAnimationFrame(t=>this.animate(t));
    }
    handleKey(event){
        if(!this.embedded&&event.key==='Escape'){event.preventDefault();this.close();return;}
        if(!this.embedded&&event.key==='Tab'){
            const elements=[...this.element.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,a[href],canvas')].filter(e=>e.getClientRects().length);
            const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;
        }
        if(event.target!==this.canvas||!this.controls)return;
        if(event.key==='Home'){event.preventDefault();this.resetView();}
        else if(event.code==='Space'||event.key===' '){event.preventDefault();this.setPaused(!this.paused);}
        else if(['+','=','-','_'].includes(event.key)){
            event.preventDefault();this.setOrbitEnabled(false);const offset=this.camera.position.clone().sub(this.controls.target);
            offset.setLength(THREE.MathUtils.clamp(offset.length()*(['+','='].includes(event.key)?0.85:1/0.85),this.controls.minDistance,this.controls.maxDistance));this.camera.position.copy(this.controls.target).add(offset);this.controls.update(0);
        }
    }
    snapshot(){
        const rotation=this.surface?.rotation.z??0,rate=radians(this.appearance?.animation.rotationDegreesPerSecond??0);
        return {status:this.status,isOpen:this.isOpen,objectId:this.isOpen?this.body?.id:null,mode:this.mode??null,elapsed:this.elapsed??0,cloudTime:this.elapsed??0,surfaceTime:rate?rotation/rate:0,
            paused:this.paused,speed:this.speed,suspended:this.suspended,rotationEnabled:this.rotationEnabled,rotationRadians:rotation,cloudDriftRadians:this.clouds?.rotation.z??0,
            turntable:!!this.orbitEnabled,orbitMoving:!!this.controls?.autoRotate,camera:this.camera?.position.toArray()??null,target:this.controls?.target.toArray()??null,
            frameCount:this.frameCount??0,completedLoads:this.completedLoads,cancelledLoads:this.cancelledLoads,error:this.error,manifest:this.manifestInfo??null,
            firstRenderedFrameMs:this.firstRenderedFrameMs,compileMs:this.compileMs,
            geometry:this.geometry?{vertices:this.geometry.getAttribute('position').count,triangles:this.geometry.index.count/3,coordinateConvention:'north +Z; Greenwich +X; east90 +Y'}:null,
            renderer:this.renderer?{textures:this.renderer.info.memory.textures,geometries:this.renderer.info.memory.geometries,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,programs:this.renderer.info.programs?.length}:null,
            lastRelease:this.lastRelease,lastDiscardedRelease:this.lastDiscardedRelease??null};
    }
    releaseScene(){
        cancelAnimationFrame(this.animationFrame);this.animationFrame=null;this.resizeObserver?.disconnect();this.controls?.dispose();
        const materials=[this.surface,this.clouds,this.atmosphere].filter(Boolean).map(m=>m.material),geometries=this.geometry?1:0;
        for(const material of materials)material.dispose();this.geometry?.dispose();const textures=releaseTextures(this.resources);this.resources=[];
        if(this.renderer){this.renderer.renderLists.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
        if(geometries||textures)this.lastRelease={geometries,materials:materials.length,textures,imageBitmaps:textures,contextLossRequested:!!this.renderer};
        this.scene?.clear();this.scene=this.camera=this.renderer=this.controls=this.canvas=this.surface=this.clouds=this.atmosphere=this.geometry=this.resizeObserver=null;
        this.surfaceUniforms=this.cloudUniforms=this.atmosphereUniforms=this.manifest=this.appearance=null;this.frameSamples=[];
    }
    close({fromHost=false}={}){
        if(this.isOpen&&this.embedded&&!fromHost&&this.onRequestClose){this.onRequestClose();return;}
        if(!this.isOpen)return;this.isOpen=false;this.generation++;this.abort.abort();this.releaseScene();this.element.remove();this.panel?.remove();
        this.element=this.panel=this.elements=null;this.inertElements?.forEach(([e,previous])=>e.inert=previous);this.inertElements=[];
        if(!this.embedded)document.body.style.overflow=this.previousOverflow;this.status='closed';this.onClose(this.body);if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});this.returnFocus=null;
    }
    dispose(){this.close({fromHost:true});this.disposed=true;}
}
