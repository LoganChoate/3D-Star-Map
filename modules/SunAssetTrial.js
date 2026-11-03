import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { SolarPlasmaActivity, validateSolarActivity } from './SolarPlasmaActivity.js';

const APPEARANCE_URL = new URL('../assets/sol/appearance.json', import.meta.url);
const safeSource = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const positive = value => Number.isFinite(value) && value > 0;
const vertexShader = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main() {
  vLocalPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;
const noiseShader = `
vec3 hash3(vec3 p) {
  p=fract(p*vec3(0.1031,0.1030,0.0973));
  p+=dot(p,p.yxz+33.33);
  return fract((p.xxy+p.yxx)*p.zyx);
}
float noise3(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i).x,hash3(i+vec3(1,0,0)).x,f.x),mix(hash3(i+vec3(0,1,0)).x,hash3(i+vec3(1,1,0)).x,f.x),f.y),
    mix(mix(hash3(i+vec3(0,0,1)).x,hash3(i+vec3(1,0,1)).x,f.x),mix(hash3(i+vec3(0,1,1)).x,hash3(i+vec3(1,1,1)).x,f.x),f.y),f.z);
}
vec3 rotateY(vec3 p,float a) { float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z); }
`;
const surfaceShader = `
uniform float uTime, uEvolutionRate, uRotationRate, uScale, uContrast, uLimb, uExposure, uUmbra, uPenumbra, uArtistic, uSpotScale, uFilaments;
uniform vec3 uColor;
uniform vec4 uSpots[8];
uniform int uSpotCount;
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseShader}
vec3 cells(vec3 p,float t) {
  vec3 base=floor(p),f=fract(p);float first=10.0,second=10.0,variation=0.5;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
    vec3 b=vec3(float(x),float(y),float(z));
    vec3 random=hash3(base+b);
    vec3 point=0.5+0.34*sin(6.2831853*random+t*(0.65+random));
    float d=length(b+point-f);
    if(d<first){second=first;first=d;variation=random.x;}else{second=min(second,d);}
  }
  // Bright cell interiors separated by darker lanes. Cell points evolve;
  // this is not merely a rotating pre-baked image.
  return vec3(second-first,first,variation);
}
void main() {
  vec3 p=rotateY(normalize(vLocalPosition),-uTime*uRotationRate);
  float t=uTime*uEvolutionRate;
  // Continuously advected coordinates bend cell boundaries and transport
  // internal variation. The visible artistic cells are explicitly enlarged.
  vec3 warp=sin(p.yzx*27.0+sin(p.zxy*16.0+t*0.22)+vec3(t*0.19,-t*0.16,t*0.13));
  vec3 fine=p*uScale+warp*0.72;
  vec3 eddies=vec3(noise3(fine*0.82+vec3(t*0.14,0.0,0.0)),noise3(fine*0.82+vec3(13.2,t*0.12,7.8)),noise3(fine*0.82+vec3(4.1,19.7,-t*0.11)))-0.5;
  fine+=eddies*0.95;
  float footprint=length(fwidth(fine));
  float resolved=1.0-smoothstep(0.35,1.1,footprint);
  float granule=0.57;
  if(resolved>0.005){
    vec3 cell=cells(fine,t);
    float lane=smoothstep(0.012+footprint*0.06,0.24+footprint*0.06,cell.x);
    float interior=0.73+0.24*cell.z+0.36*(1.0-smoothstep(0.0,1.0,cell.y));
    float texture=(noise3(fine*3.8+vec3(t*0.21))-0.5)*0.16;
    granule=mix(0.57,lane*interior+texture,resolved);
  }
  float broad=noise3(p*24.0+vec3(t*0.31,-t*0.24,t*0.18));
  float finer=noise3(p*81.0+vec3(-t*0.43,t*0.18,t*0.29));
  // Broad modulation is a restrained illustrative variation, not a measured
  // brightness map. Artistic mode deliberately makes it more legible.
  float brightness=1.0+uContrast*(granule-0.57)*1.8;
  brightness+=(broad-0.5)*mix(0.035,0.12,uArtistic)+(finer-0.5)*mix(0.018,0.06,uArtistic);
  for(int i=0;i<8;i++) {
    if(i>=uSpotCount)break;
    vec4 spot=uSpots[i];
    float radius=spot.w*uSpotScale*(0.96+0.04*sin(t*0.7+float(i)));
    float distance=length(p-spot.xyz)/(2.0*sin(radius*0.5));
    if(distance<1.32){
      vec3 east=normalize(cross(vec3(0.0,1.0,0.0),spot.xyz));
      vec3 north=normalize(cross(spot.xyz,east));
      vec3 delta=p-spot.xyz;
      float angle=atan(dot(delta,north),dot(delta,east));
      float spotNoise=noise3(delta*(9.0/radius)+vec3(t*0.10));
      float radial=distance+0.10*sin(angle*7.0+float(i))+0.06*sin(angle*13.0-float(i)*1.3)+0.11*(spotNoise-0.5);
      float filamentAngle=angle*uFilaments+distance*9.0+2.1*sin(angle*9.0+distance*3.0+t*0.13)+3.3*spotNoise;
      float angularFootprint=fwidth(filamentAngle);
      float secondaryAngle=angle*floor(uFilaments*1.73+0.5)+distance*14.0+spotNoise*5.0;
      float rawThreads=0.5+0.32*sin(filamentAngle)+0.18*sin(secondaryAngle);
      float threads=mix(0.5,rawThreads,1.0-smoothstep(1.0,3.5,angularFootprint));
      float penumbra=1.0-smoothstep(0.78,1.15,radial);
      float umbra=1.0-smoothstep(0.30,0.50,radial);
      float penumbralLight=uPenumbra*(0.65+0.65*threads)*(0.88+0.24*spotNoise);
      float umbralLight=uUmbra*(0.82+0.25*spotNoise);
      // Sunspots replace the granular brightness field: large polygonal
      // convection lanes must not show through the dark umbra.
      brightness=mix(brightness,penumbralLight,penumbra);
      brightness=mix(brightness,umbralLight,umbra);
    }
  }
  float mu=max(0.0,dot(normalize(vWorldNormal),normalize(cameraPosition-vWorldPosition)));
  float limb=1.0-uLimb*(1.0-mu);
  vec3 color=uColor*max(0.03,brightness)*limb*uExposure;
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const haloShader = `
uniform float uTime, uEvolutionRate, uGlow, uRadius, uArtistic;
uniform vec3 uColor;
varying vec3 vWorldPosition;
${noiseShader}
void main() {
  vec3 ray=normalize(vWorldPosition-cameraPosition);
  vec3 closest=cameraPosition-ray*dot(cameraPosition,ray);
  float impact=length(closest);
  // Ray impact keeps the halo outside the photosphere at every orbit angle.
  // The emissive shell is an artistic display glow, not a solved corona.
  float outside=max(0.0,impact-1.0);
  float edge=1.0-smoothstep(uRadius-0.035,uRadius,impact);
  float t=uTime*uEvolutionRate;
  float wisps=noise3(normalize(closest+vec3(0.00001))*31.0+vec3(t*0.9,-t*0.5,t*0.4));
  float glow=uGlow*exp(-outside*mix(38.0,17.0,uArtistic))*edge;
  glow*=mix(1.0,0.55+0.9*wisps,uArtistic);
  glow*=smoothstep(0.997,1.004,impact);
  gl_FragColor=vec4(uColor*glow,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Live procedural Sun illustration, with shared Blender appearance parameters. */
export class SunAssetTrial {
    constructor({mount=document.body,onOpen=()=>{},onClose=()=>{}}={}) {
        this.mount=mount;this.onOpen=onOpen;this.onClose=onClose;
        this.isOpen=false;this.status='closed';this.ready=Promise.resolve(false);
        this.generation=0;this.completedLoads=0;this.cancelledLoads=0;this.disposed=false;
        this.lastRelease=null;
    }
    open(body) {
        if(this.disposed)throw new Error('The Sun inspector has been disposed.');
        if(body?.id!=='sol')throw new Error('This stellar study is available for Sol.');
        if(this.isOpen)return this.ready;
        this.startedAt=performance.now();this.body=body;this.isOpen=true;this.status='loading';
        const generation=++this.generation;
        this.abort=new AbortController();this.returnFocus=document.activeElement;
        this.inertElements=[...this.mount.children].map(element=>[element,element.inert]);
        this.inertElements.forEach(([element])=>{element.inert=true;});
        this.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
        this.buildShell();this.onOpen(body);
        this.ready=this.load(generation,this.abort.signal);
        return this.ready;
    }
    buildShell() {
        const element=this.element=document.createElement('section');
        element.id='sol-trial';element.className='sol-trial';element.setAttribute('role','dialog');
        element.setAttribute('aria-modal','true');element.setAttribute('aria-labelledby','sol-trial-title');
        element.innerHTML=`<header class="sol-trial-header"><div><span class="sol-trial-eyebrow">STELLAR STUDY</span><h2 id="sol-trial-title">Sun <span>· Sol</span></h2></div><button id="sol-trial-close">← Return to map</button></header>
          <div class="sol-trial-layout"><div id="sol-trial-stage" class="sol-trial-stage">
          <canvas id="sol-trial-canvas" tabindex="0" aria-label="Interactive Sun. Drag to orbit, scroll or plus and minus to zoom, Home to reset, Space to pause, Escape to return."></canvas>
          <div id="sol-trial-message" class="sol-trial-message" role="status" aria-live="polite">Preparing the Sun…</div>
          <div class="sol-trial-stage-footer"><p>Drag to orbit · Scroll to zoom · Space to pause</p><p id="sol-trial-motion-note">Generated illustration — activity and motion are not live solar observations or a physical time simulation.</p></div></div>
          <aside class="sol-trial-panel" aria-label="Sun appearance, animation and catalog information">
          <p class="sol-trial-lead">Follow the luminous cells, sunspot filaments, and rising plasma.</p>
          <fieldset class="sol-trial-modes"><legend>Appearance</legend><button id="sol-trial-scientific" aria-pressed="true" disabled>Scientific</button><button id="sol-trial-artistic" aria-pressed="false" disabled>Artistic</button></fieldset>
          <p id="sol-trial-mode-note" class="sol-trial-note"></p>
          <div class="sol-trial-activity"><span id="sol-trial-activity-state">Visible-light surface</span><button id="sol-trial-eruption" disabled>Show an eruption</button></div>
          <div class="sol-trial-controls"><button id="sol-trial-home" disabled>Whole Sun</button><button id="sol-trial-detail" disabled>Surface detail</button><button id="sol-trial-pause" aria-pressed="false" disabled>Pause activity</button><button id="sol-trial-turntable" aria-pressed="false" disabled>Turntable camera</button></div>
          <label for="sol-trial-speed">Illustration speed <output id="sol-trial-speed-value">1×</output></label><input id="sol-trial-speed" type="range" min="0" max="4" step="0.25" value="1" disabled>
          <button id="sol-trial-reset" class="sol-trial-wide" disabled>Reset activity</button><p class="sol-trial-small">Speed changes the demonstration, not solar time. Pause freezes surface activity; you can still orbit.</p>
          <p id="sol-trial-description" class="sol-trial-description"></p><dl id="sol-trial-facts"></dl>
          <details><summary>Sources & what is unknown</summary><div id="sol-trial-sources"></div><p id="sol-trial-unknowns" class="sol-trial-note"></p><p class="sol-trial-note">Surface patterns and spot groups are invented. Brightness is compressed for a display. The edge-darkening approximation is not fitted to an observing wavelength. Artistic mode enlarges cells and sunspots and combines visible-surface and ultraviolet-inspired structures. The loops and ejections illustrate motion, not measured activity or a solved magnetic field.</p><p class="sol-trial-note">Blender and this live view use separate procedural implementations with shared appearance settings.</p></details>
          </aside></div>`;
        this.mount.append(element);
        this.elements=Object.fromEntries([...element.querySelectorAll('[id]')].map(item=>[item.id,item]));
        const listen=(id,type,handler)=>this.elements[id].addEventListener(type,handler,{signal:this.abort.signal});
        listen('sol-trial-close','click',()=>this.close());
        listen('sol-trial-home','click',()=>this.resetView());
        listen('sol-trial-detail','click',()=>this.detailView());
        listen('sol-trial-pause','click',()=>this.setPaused(!this.paused));
        listen('sol-trial-turntable','click',()=>{this.controls.autoRotate=!this.controls.autoRotate;this.elements['sol-trial-turntable'].setAttribute('aria-pressed',String(this.controls.autoRotate));});
        listen('sol-trial-scientific','click',()=>this.setMode('scientific'));
        listen('sol-trial-artistic','click',()=>this.setMode('artistic'));
        listen('sol-trial-speed','input',event=>this.setSpeed(Number(event.target.value)));
        listen('sol-trial-reset','click',()=>{this.elapsed=0;this.updateTime();});
        listen('sol-trial-eruption','click',()=>{
            const activity=this.appearance.activity;
            this.elapsed=Math.floor(this.elapsed/activity.periodSeconds)*activity.periodSeconds+activity.eruptionStartSeconds+activity.eruptionDurationSeconds*0.12;
            this.updateTime();
        });
        element.addEventListener('keydown',event=>this.handleKey(event),{signal:this.abort.signal});
        this.elements['sol-trial-close'].focus({preventScroll:true});
    }
    async load(generation,signal) {
        const current=()=>this.isOpen&&this.generation===generation&&!signal.aborted;
        try {
            const response=await fetch(APPEARANCE_URL,{signal});
            if(!response.ok)throw new Error(`Sun appearance information is unavailable (${response.status})`);
            const bytes=await response.arrayBuffer();
            const appearance=JSON.parse(new TextDecoder().decode(bytes));
            this.validateAppearance(appearance);
            const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
            if(!current()){this.cancelledLoads++;return false;}
            this.appearance=appearance;this.appearanceInfo={bytes:bytes.byteLength,sha256};
            this.elapsed=0;this.speed=appearance.time.defaultSpeed;this.paused=appearance.time.defaultPaused;
            this.mode='scientific';this.frameCount=0;this.frameSamples=[];
            this.createScene();this.renderFacts();this.setMode(this.mode);this.setPaused(this.paused);this.setSpeed(this.speed);
            const compileStart=performance.now();
            this.renderer.compile(this.scene,this.camera);
            this.compileMs=performance.now()-compileStart;
            this.renderer.render(this.scene,this.camera);
            this.firstRenderedFrameMs=performance.now()-this.startedAt;
            this.status='ready';this.completedLoads++;
            this.elements['sol-trial-message'].hidden=true;
            this.element.querySelectorAll('button:disabled,input:disabled').forEach(control=>{control.disabled=false;});
            this.elements['sol-trial-eruption'].disabled=!appearance.modes[this.mode].activityVisible;
            this.canvas.focus({preventScroll:true});
            this.previousFrameTime=performance.now();this.animate(this.previousFrameTime);
            return true;
        } catch(error) {
            if(!current()){this.cancelledLoads++;return false;}
            this.releaseScene();this.status='error';
            this.elements['sol-trial-message'].textContent=`The Sun study could not be opened. ${String(error.message||error)}. Return to the map and try again.`;
            return false;
        }
    }
    validateAppearance(value) {
        if(value.schemaVersion!==1||value.body?.id!=='sol'||value.geometry?.radiusUnits!==1||value.body.meanRadiusKm!==695700)throw new Error('Sun appearance identity or physical scale is incompatible');
        if(positive(this.body.radiusKm)&&Math.abs(this.body.radiusKm-value.body.meanRadiusKm)>0.001)throw new Error('Sun radius differs from the catalog');
        if(!positive(value.surface?.granulationScale)||!Number.isFinite(value.surface.evolutionRate)||!Number.isFinite(value.surface.rotationRadiansPerSecond))throw new Error('Sun surface parameters are invalid');
        if(!positive(value.surface.artisticGranulationScale)||!positive(value.surface.penumbraFilaments)||!positive(value.surface.spotArtisticRadiusMultiplier))throw new Error('Sun surface detail parameters are invalid');
        if(!Array.isArray(value.surface.spots)||value.surface.spots.length>8||value.surface.spots.some(spot=>![spot.longitudeDeg,spot.latitudeDeg,spot.radiusRadians].every(Number.isFinite)||spot.radiusRadians<=0))throw new Error('Sun demonstration spots are invalid');
        validateSolarActivity(value.activity,value.surface.spots);
        for(const name of ['scientific','artistic']) {
            const mode=value.modes?.[name];
            if(!mode||!/^#[0-9a-f]{6}$/i.test(mode.colorSrgb)||![mode.exposure,mode.granulationContrast,mode.limbDarkeningCoefficient,mode.umbraBrightness,mode.penumbraBrightness,mode.glowStrength,mode.glowRadius].every(Number.isFinite)||mode.limbDarkeningCoefficient<0||mode.limbDarkeningCoefficient>1||mode.glowRadius<=1||typeof mode.activityVisible!=='boolean')throw new Error('Sun appearance mode is invalid');
        }
        if(!value.time||![value.time.defaultSpeed,value.time.minimumSpeed,value.time.maximumSpeed].every(Number.isFinite)||value.time.minimumSpeed<0||value.time.maximumSpeed<value.time.minimumSpeed||value.time.defaultSpeed<value.time.minimumSpeed||value.time.defaultSpeed>value.time.maximumSpeed)throw new Error('Sun illustration speed is invalid');
    }
    createScene() {
        const appearance=this.appearance;
        this.canvas=this.elements['sol-trial-canvas'];this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#03060b');
        this.camera=new THREE.PerspectiveCamera(38,1,0.002,50);
        this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
        const spots=Array.from({length:8},()=>new THREE.Vector4(0,0,1,0.01));
        appearance.surface.spots.forEach((spot,index)=>{const lon=THREE.MathUtils.degToRad(spot.longitudeDeg),lat=THREE.MathUtils.degToRad(spot.latitudeDeg);spots[index].set(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat),spot.radiusRadians);});
        this.surfaceUniforms={uTime:{value:0},uEvolutionRate:{value:appearance.surface.evolutionRate},uRotationRate:{value:appearance.surface.rotationRadiansPerSecond},uScale:{value:appearance.surface.granulationScale},uContrast:{value:0},uLimb:{value:0},uExposure:{value:1},uUmbra:{value:0},uPenumbra:{value:0},uArtistic:{value:0},uSpotScale:{value:1},uFilaments:{value:appearance.surface.penumbraFilaments},uColor:{value:new THREE.Color()},uSpots:{value:spots},uSpotCount:{value:appearance.surface.spots.length}};
        this.surface=new THREE.Mesh(new THREE.SphereGeometry(1,128,64),new THREE.ShaderMaterial({uniforms:this.surfaceUniforms,vertexShader,fragmentShader:surfaceShader}));
        this.surface.name='Illustrative photosphere';this.scene.add(this.surface);
        const outerRadius=Math.max(appearance.modes.scientific.glowRadius,appearance.modes.artistic.glowRadius);
        this.haloUniforms={uTime:{value:0},uEvolutionRate:{value:appearance.surface.evolutionRate},uGlow:{value:0},uRadius:{value:outerRadius},uArtistic:{value:0},uColor:{value:new THREE.Color()}};
        this.halo=new THREE.Mesh(new THREE.SphereGeometry(outerRadius,96,48),new THREE.ShaderMaterial({uniforms:this.haloUniforms,vertexShader,fragmentShader:haloShader,side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
        this.halo.name='Illustrative display glow';this.scene.add(this.halo);
        this.plasma=new SolarPlasmaActivity(appearance);this.scene.add(this.plasma.group);
        this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=0.08;this.controls.enablePan=false;
        this.controls.minDistance=1.035;this.controls.maxDistance=16;this.controls.autoRotateSpeed=0.7;
        this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.elements['sol-trial-stage']);
        this.resize();this.resetView();
    }
    setMode(name) {
        if(!this.appearance||!this.surfaceUniforms||!['scientific','artistic'].includes(name))return;
        this.mode=name;const mode=this.appearance.modes[name],u=this.surfaceUniforms,h=this.haloUniforms;
        u.uColor.value.set(mode.colorSrgb);u.uContrast.value=mode.granulationContrast;u.uLimb.value=mode.limbDarkeningCoefficient;u.uExposure.value=mode.exposure;
        u.uUmbra.value=mode.umbraBrightness;u.uPenumbra.value=mode.penumbraBrightness;u.uArtistic.value=name==='artistic'?1:0;
        u.uScale.value=name==='artistic'?this.appearance.surface.artisticGranulationScale:this.appearance.surface.granulationScale;
        u.uSpotScale.value=name==='artistic'?this.appearance.surface.spotArtisticRadiusMultiplier:1;
        h.uColor.value.set(mode.colorSrgb);h.uGlow.value=mode.glowStrength;h.uRadius.value=mode.glowRadius;h.uArtistic.value=u.uArtistic.value;
        this.elements['sol-trial-scientific'].setAttribute('aria-pressed',String(name==='scientific'));
        this.elements['sol-trial-artistic'].setAttribute('aria-pressed',String(name==='artistic'));
        this.elements['sol-trial-mode-note'].textContent=mode.description;
        this.element.dataset.appearance=name;
        this.elements['sol-trial-eruption'].disabled=!mode.activityVisible;
        this.elements['sol-trial-eruption'].title=mode.activityVisible?'Jump to the start of an illustrative eruption. Pause and speed still apply.':'Switch to Artistic to explore illustrative plasma eruptions.';
        this.updateTime();
    }
    setPaused(value) {
        this.paused=!!value;this.elements['sol-trial-pause'].textContent=this.paused?'Resume activity':'Pause activity';
        this.elements['sol-trial-pause'].setAttribute('aria-pressed',String(this.paused));
    }
    setSpeed(value) {
        if(!this.appearance||!Number.isFinite(value))return;
        this.speed=THREE.MathUtils.clamp(value,this.appearance.time.minimumSpeed,this.appearance.time.maximumSpeed);
        this.elements['sol-trial-speed'].value=String(this.speed);this.elements['sol-trial-speed-value'].value=`${this.speed}×`;
    }
    renderFacts() {
        const appearance=this.appearance,body=this.body;
        this.elements['sol-trial-description'].textContent='The Sun is the star at the center of our Solar System. Rising hot gas and sinking cooler gas form the photosphere’s bright granules and darker lanes. Sunspots are cooler, magnetically active regions. The patterns shown here are generated illustrations.';
        const facts=[['Catalog identity','sol'],['Nominal radius',`${appearance.body.meanRadiusKm.toLocaleString('en-US')} km`],['Nominal effective temperature',`${appearance.body.nominalEffectiveTemperatureK.toLocaleString('en-US')} K`],['Spectral classification',body.spectralType||'G2 V · reference classification'],['Surface activity','Generated illustration'],['Coordinate reference',body.space==='solar'?'Retained J2000 historical snapshot':'Retained catalog Sun origin'],['Current active-region measurements','Unknown · not supplied']];
        if(Number.isFinite(body.apparentMagnitude))facts.push(['Catalog apparent magnitude',String(body.apparentMagnitude)]);
        for(const [name,value] of facts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;this.elements['sol-trial-facts'].append(dt,dd);}
        for(const source of appearance.sources||[])if(safeSource(source.url)){const p=document.createElement('p'),a=document.createElement('a');a.href=source.url;a.textContent=source.label||'Source';a.target='_blank';a.rel='noopener noreferrer';p.append(a);this.elements['sol-trial-sources'].append(p);}
        this.elements['sol-trial-unknowns'].textContent=`Unknown: ${(appearance.unknowns||[]).join('; ')}.`;
        const slider=this.elements['sol-trial-speed'];slider.min=String(appearance.time.minimumSpeed);slider.max=String(appearance.time.maximumSpeed);
    }
    resize() {
        if(!this.renderer||!this.element?.isConnected)return;
        const bounds=this.elements['sol-trial-stage'].getBoundingClientRect();const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
        this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
    }
    stopCameraMotion() {
        this.controls.autoRotate=false;const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
        this.elements['sol-trial-turntable'].setAttribute('aria-pressed','false');
    }
    resetView() {
        if(!this.controls)return;this.stopCameraMotion();
        const vertical=THREE.MathUtils.degToRad(this.camera.fov/2),horizontal=Math.atan(Math.tan(vertical)*this.camera.aspect);
        this.camera.position.set(0,0,1.22/Math.sin(Math.min(vertical,horizontal)));this.controls.target.set(0,0,0);this.controls.update();
    }
    detailView() {
        if(!this.controls)return;this.stopCameraMotion();
        // Aim at the first illustrative active region so its filamentary
        // penumbra is available without hunting around the whole sphere.
        const spot=this.appearance.surface.spots[0],lon=THREE.MathUtils.degToRad(spot?.longitudeDeg||0)+this.elapsed*this.appearance.surface.rotationRadiansPerSecond,lat=THREE.MathUtils.degToRad(spot?.latitudeDeg||0);
        this.camera.position.set(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat)).multiplyScalar(1.13);
        this.controls.target.set(0,0,0);this.controls.update();
    }
    updateTime() {
        if(this.surfaceUniforms)this.surfaceUniforms.uTime.value=this.elapsed;
        if(this.haloUniforms)this.haloUniforms.uTime.value=this.elapsed;
        if(this.plasma){
            const visible=this.appearance.modes[this.mode].activityVisible;
            this.plasma.update(this.elapsed,visible);
            const text=visible?this.plasma.phase:'Visible-light surface · plasma illustration hidden';
            if(this.elements['sol-trial-activity-state'].textContent!==text)this.elements['sol-trial-activity-state'].textContent=text;
        }
    }
    animate(now) {
        if(!this.isOpen||this.status!=='ready')return;
        const delta=Math.min(Math.max(0,(now-this.previousFrameTime)/1000),0.1);this.previousFrameTime=now;
        if(!this.paused)this.elapsed+=delta*this.speed;this.updateTime();this.controls.update(delta);
        const start=performance.now();this.renderer.render(this.scene,this.camera);const end=performance.now();
        this.frameSamples.push({start,end,hidden:document.hidden,focused:document.hasFocus()});if(this.frameSamples.length>1600)this.frameSamples.shift();
        this.frameCount++;this.animationFrame=requestAnimationFrame(time=>this.animate(time));
    }
    handleKey(event) {
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();return;}
        if(event.key==='Tab') {
            const available=[...this.element.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,a[href],canvas')].filter(element=>element.getClientRects().length);
            const first=available[0],last=available.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;
        }
        if(event.target!==this.canvas||!this.controls)return;
        if(event.key==='Home'){event.preventDefault();this.resetView();}
        else if(event.code==='Space'||event.key===' '){event.preventDefault();this.setPaused(!this.paused);}
        else if(['+','=','-','_'].includes(event.key)){event.preventDefault();const offset=this.camera.position.clone().sub(this.controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*(['+','='].includes(event.key)?0.85:1/0.85),this.controls.minDistance,this.controls.maxDistance));this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
    }
    snapshot() {
        return {status:this.status,isOpen:this.isOpen,objectId:this.isOpen?this.body?.id:null,mode:this.mode||null,elapsed:this.elapsed||0,speed:this.speed,paused:this.paused,rotationRadians:(this.elapsed||0)*(this.appearance?.surface.rotationRadiansPerSecond||0),camera:this.camera?.position.toArray()||null,turntable:!!this.controls?.autoRotate,frameCount:this.frameCount||0,completedLoads:this.completedLoads,cancelledLoads:this.cancelledLoads,appearance:this.appearanceInfo?{...this.appearanceInfo}:null,firstRenderedFrameMs:this.firstRenderedFrameMs,compileMs:this.compileMs,geometry:this.surface?{radius:1,vertices:this.surface.geometry.getAttribute('position').count,triangles:this.surface.geometry.index.count/3}:null,activity:this.plasma?.snapshot()||null,renderer:this.renderer?{textures:this.renderer.info.memory.textures,geometries:this.renderer.info.memory.geometries,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,programs:this.renderer.info.programs?.length}:null,lastRelease:this.lastRelease};
    }
    releaseScene() {
        cancelAnimationFrame(this.animationFrame);this.resizeObserver?.disconnect();this.controls?.dispose();
        let geometries=0,materials=0;for(const mesh of [this.surface,this.halo])if(mesh){mesh.geometry.dispose();mesh.material.dispose();geometries++;materials++;}
        if(this.plasma){const released=this.plasma.dispose();geometries+=released.geometries;materials+=released.materials;this.plasma=null;}
        if(this.renderer){this.renderer.renderLists.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
        if(geometries)this.lastRelease={geometries,materials,textures:0,contextLossRequested:true};
        this.scene?.clear();this.scene=this.camera=this.renderer=this.controls=this.canvas=this.surface=this.halo=this.resizeObserver=null;
        this.surfaceUniforms=this.haloUniforms=this.appearance=null;this.frameSamples=[];this.appearanceInfo=null;
    }
    close() {
        if(!this.isOpen)return;this.isOpen=false;this.generation++;this.abort.abort();this.releaseScene();
        this.element.remove();this.element=this.elements=null;this.inertElements.forEach(([element,previous])=>{element.inert=previous;});this.inertElements=[];
        document.body.style.overflow=this.previousOverflow;this.status='closed';this.onClose(this.body);
        if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});this.returnFocus=null;
    }
    dispose(){this.close();this.disposed=true;}
}
