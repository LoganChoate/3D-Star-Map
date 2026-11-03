import * as THREE from '../vendor/three/build/three.module.js';

const TAU = Math.PI * 2;
const direction = (longitude, latitude) => {
    const lon = THREE.MathUtils.degToRad(longitude), lat = THREE.MathUtils.degToRad(latitude);
    return new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat));
};

// The vertex positions encode tube parameters. The shader bends each strand
// into a genuinely three-dimensional arch; the photosphere depth buffer hides
// strands on the far side. No downloaded movie or camera-facing sprite is used.
function filamentGeometry() {
    const along = 64, around = 6, strands = 5, positions = [], indices = [];
    for (let strand = 0; strand < strands; strand++) {
        const offset = positions.length / 3;
        for (let i = 0; i <= along; i++) for (let j = 0; j <= around; j++) positions.push(i / along, j / around * TAU, strand);
        for (let i = 0; i < along; i++) for (let j = 0; j < around; j++) {
            const a = offset + i * (around + 1) + j, b = a + around + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
}

const vertexShader = `
uniform vec3 uAnchor, uTangent, uBinormal;
uniform float uTime, uHeight, uSpan, uProgress, uEruption;
varying float vAlong, vStrand;
varying vec3 vNormal, vView;
vec3 path(float q, float strand) {
    float s=sin(q), c=cos(q);
    float widening=1.0+uEruption*uProgress*1.9;
    float angle=c*uSpan*0.5*widening;
    vec3 radial=uAnchor*cos(angle)+uTangent*sin(angle);
    float lift=uEruption*uHeight*uProgress*uProgress*0.25;
    float height=uHeight*mix(1.0,0.35+0.4*uProgress,uEruption);
    float thread=(strand-2.0)*0.0045;
    float wave=(sin(q*11.0+strand*1.7-uTime*0.45)+0.45*sin(q*23.0-strand+uTime*0.22))*0.0025*s;
    return radial*(1.001+lift+height*s*(0.86+strand*0.035))
        +uBinormal*(thread*s*(1.0+uProgress*uEruption*4.0)+wave);
}
void main() {
    float q=position.x*3.14159265, strand=position.z;
    vec3 center=path(q,strand);
    vec3 tangent=normalize(path(q+0.001,strand)-path(q-0.001,strand));
    vec3 normal=normalize(cross(tangent,uBinormal));
    float radius=(0.0006+0.00085*sin(q))*(1.0+uEruption*uProgress*1.1);
    vec3 tubeNormal=cos(position.y)*normal+sin(position.y)*uBinormal;
    vec3 p=center+radius*tubeNormal;
    vAlong=position.x;vStrand=strand;
    vec4 viewPosition=modelViewMatrix*vec4(p,1.0);
    vNormal=normalize(normalMatrix*tubeNormal);vView=normalize(-viewPosition.xyz);
    gl_Position=projectionMatrix*viewPosition;
}`;
const fragmentShader = `
uniform float uTime, uFlow, uOpacity, uProgress, uEruption;
varying float vAlong, vStrand;
varying vec3 vNormal, vView;
void main() {
    float travelling=vAlong*34.0-uTime*uFlow*4.0+vStrand*1.9;
    float flow=0.18+0.82*pow(0.5+0.5*sin(travelling),3.0);
    float filaments=0.65+0.22*sin(vAlong*83.0+vStrand*4.2)+0.13*sin(vAlong*139.0-vStrand*1.9+uTime*0.25);
    float ends=smoothstep(0.0,0.055,vAlong)*(1.0-smoothstep(0.945,1.0,vAlong));
    float softEdge=smoothstep(0.05,0.75,abs(dot(normalize(vNormal),normalize(vView))));
    float light=uOpacity*flow*filaments*ends*softEdge*0.8;
    vec3 amber=mix(vec3(1.0,0.16,0.008),vec3(1.0,0.42,0.07),flow*0.5);
    gl_FragColor=vec4(amber*0.72,light);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

export function validateSolarActivity(value, spots) {
    const finite = Number.isFinite;
    if (!value || ![value.periodSeconds, value.eruptionStartSeconds, value.eruptionDurationSeconds, value.flowSpeed].every(finite)
        || value.periodSeconds <= 0 || value.eruptionStartSeconds < 0 || value.eruptionDurationSeconds <= 0
        || value.eruptionStartSeconds + value.eruptionDurationSeconds > value.periodSeconds || value.flowSpeed < 0) throw new Error('Sun activity timing is invalid');
    const shape = item => item && [item.height, item.spanRadians, item.angleDeg].every(finite) && item.height > 0 && item.height <= 1 && item.spanRadians > 0 && item.spanRadians < 0.6;
    if (!Array.isArray(value.loops) || value.loops.length > 8 || value.loops.some(loop => !shape(loop) || !Number.isInteger(loop.spotIndex) || !spots[loop.spotIndex])) throw new Error('Sun plasma anchors are invalid');
    if (!shape(value.eruption) || ![value.eruption.longitudeDeg, value.eruption.latitudeDeg].every(finite)) throw new Error('Sun eruption parameters are invalid');
}

/** Illustrative magnetic arches and an eruption, all driven by one asset clock. */
export class SolarPlasmaActivity {
    constructor(appearance) {
        this.appearance = appearance;this.config = appearance.activity;
        this.group = new THREE.Group();this.group.name = 'Illustrative plasma activity';
        this.meshes = [];this.enabled = false;this.elapsed = 0;
        for (const [index, loop] of this.config.loops.entries()) {
            const spot = appearance.surface.spots[loop.spotIndex];
            this.createArch({...loop, longitudeDeg:spot.longitudeDeg, latitudeDeg:spot.latitudeDeg}, `Anchored prominence ${index + 1}`, false);
        }
        this.eruption = this.createArch(this.config.eruption, 'Illustrative mass ejection', true);
        this.update(0, false);
    }
    createArch(config, name, eruption) {
        const anchor = direction(config.longitudeDeg, config.latitudeDeg);
        const east = new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(config.longitudeDeg)), 0, -Math.sin(THREE.MathUtils.degToRad(config.longitudeDeg)));
        const north = new THREE.Vector3().crossVectors(anchor, east);
        const angle = THREE.MathUtils.degToRad(config.angleDeg);
        const tangent = east.multiplyScalar(Math.cos(angle)).addScaledVector(north, Math.sin(angle)).normalize();
        const binormal = new THREE.Vector3().crossVectors(anchor, tangent).normalize();
        const uniforms = {uAnchor:{value:anchor}, uTangent:{value:tangent}, uBinormal:{value:binormal}, uTime:{value:0},
            uHeight:{value:config.height},uSpan:{value:config.spanRadians},uProgress:{value:0},uEruption:{value:eruption ? 1 : 0},
            uFlow:{value:this.config.flowSpeed},uOpacity:{value:1}};
        const material = new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
        const mesh = new THREE.Mesh(filamentGeometry(),material);
        mesh.name = name;mesh.frustumCulled = false;mesh.renderOrder = 2;
        this.group.add(mesh);this.meshes.push(mesh);return mesh;
    }
    update(elapsed, enabled) {
        this.elapsed = elapsed;this.enabled = !!enabled;this.group.visible = this.enabled;
        this.group.rotation.y = elapsed * this.appearance.surface.rotationRadiansPerSecond;
        const cycle = ((elapsed % this.config.periodSeconds) + this.config.periodSeconds) % this.config.periodSeconds;
        const raw = (cycle - this.config.eruptionStartSeconds) / this.config.eruptionDurationSeconds;
        this.progress = THREE.MathUtils.clamp(raw,0,1);
        this.opacity = raw > 0 && raw < 1 ? Math.pow(Math.sin(Math.PI * raw),0.8) : 0;
        this.phase = raw <= 0 || raw >= 1 ? 'Quiet activity' : raw < 0.18 ? 'Active region brightening' : raw < 0.44 ? 'Plasma rising' : raw < 0.76 ? 'Ejecta expanding' : 'Ejection fading';
        for (const mesh of this.meshes) mesh.material.uniforms.uTime.value = elapsed;
        this.eruption.material.uniforms.uProgress.value = this.progress;
        this.eruption.material.uniforms.uOpacity.value = this.opacity;
        this.eruption.visible = this.opacity > 0;
    }
    snapshot() {
        const u = this.eruption.material.uniforms, p = this.progress;
        const radius = 1.001 + this.config.eruption.height * (0.35 + 0.4 * p + 0.25 * p * p);
        const apex = u.uAnchor.value.clone().multiplyScalar(radius).applyAxisAngle(new THREE.Vector3(0,1,0),this.group.rotation.y);
        return {enabled:this.enabled,phase:this.phase,progress:p,opacity:this.opacity,flowTime:this.elapsed,rotationRadians:this.group.rotation.y,
            loopCount:this.config.loops.length,geometryCount:this.meshes.length,materialCount:this.meshes.length,eruptionApex:apex.toArray(),
            anchors:this.meshes.slice(0,-1).map(mesh=>mesh.material.uniforms.uAnchor.value.clone().applyAxisAngle(new THREE.Vector3(0,1,0),this.group.rotation.y).toArray()),
            depthTest:this.meshes.every(mesh=>mesh.material.depthTest),depthWrite:this.meshes.some(mesh=>mesh.material.depthWrite),
            triangles:this.meshes.reduce((sum,mesh)=>sum+mesh.geometry.index.count/3,0)};
    }
    dispose() {
        const result={geometries:this.meshes.length,materials:this.meshes.length};
        for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();}
        this.group.clear();this.meshes=[];return result;
    }
}
