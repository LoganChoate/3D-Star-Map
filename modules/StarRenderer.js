import * as THREE from '../vendor/three/build/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { FlyControls } from '../vendor/three/examples/jsm/controls/FlyControls.js';
import { EffectComposer } from '../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { AdditiveBlendShader } from '../AdditiveBlendShader.js';
import { Line2 } from '../vendor/three/examples/jsm/lines/Line2.js';
import { LineGeometry } from '../vendor/three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from '../vendor/three/examples/jsm/lines/LineMaterial.js';

export class StarRenderer {
    constructor(canvas, errorHandler) {
        this.canvas = canvas;
        this.errorHandler = errorHandler;
        
        // Core Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.flyControls = null;
        this.activeControls = null;
        
        // Rendering objects
        this.starsMesh = null;
        this.starsBloomMesh = null;
        this.starScene = null;
        this.starRenderTarget = null;
        this.starComposer = null;
        this.starRenderPass = null;
        this.starBloomPass = null;
        this.composer = null;
        this.renderPass = null;
        this.blendPass = null;
        
        // Materials and shaders
        this.starShaderMaterial = null;
        this.useStarShader = true;
        
        // Visual state
        this.selectionHighlight = null;
        this.constellationLinesGroup = null;
        
        // Constants
        this.SOL_ABSOLUTE_MAGNITUDE = 4.83;
        this.BASE_STAR_RADIUS = 1.0;
        this.GLOBAL_VISUAL_SCALE = 0.5;
        
        // Clock for animations
        this.clock = new THREE.Clock();
    }

    async initialize() {
        try {
            await this.initializeScene();
            await this.initializeControls();
            await this.initializePostProcessing();
            return true;
        } catch (error) {
            this.errorHandler.showError(
                'Failed to initialize 3D graphics. Your browser may not support WebGL.',
                error
            );
            this.showFallbackContent();
            return false;
        }
    }

    async initializeScene() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);
        
        const canvasContainer = document.getElementById('canvasContainer');
        if (!canvasContainer) {
            throw new Error('Canvas container element not found');
        }

        if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) {
            throw new Error('Canvas container has invalid dimensions');
        }

        this.camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 400000);
        
        // Initialize WebGL renderer with error detection
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        // Check WebGL support
        const testContext = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!testContext) {
            throw new Error('WebGL not supported by this browser');
        }

        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: false // Better performance
        });
        
        // Verify renderer was created successfully
        if (!this.renderer.getContext()) {
            throw new Error('Failed to initialize WebGL context');
        }

        this.renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
        
        // Initialize constellation lines group
        this.constellationLinesGroup = new THREE.Group();
        this.scene.add(this.constellationLinesGroup);

        // --- Star-only scene for per-star bloom ---
        this.starScene = new THREE.Scene();
        
        console.log('Three.js scene initialized successfully');
    }

    async initializeControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 2000;
        this.controls.target.set(0, 0, 0);

        this.flyControls = new FlyControls(this.camera, this.renderer.domElement);
        this.flyControls.movementSpeed = 150;
        this.flyControls.rollSpeed = Math.PI / 3;
        this.flyControls.autoForward = false;
        this.flyControls.dragToLook = true;
        this.flyControls.enabled = false;

        this.activeControls = this.controls;
    }

    async initializePostProcessing() {
        try {
            // Main composer (no bloom, just the scene)
            this.composer = new EffectComposer(this.renderer);
            this.renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(this.renderPass);

            // Star composer (for star-only bloom)
            this.starRenderTarget = new THREE.WebGLRenderTarget(this.renderer.domElement.width, this.renderer.domElement.height);
            this.starComposer = new EffectComposer(this.renderer, this.starRenderTarget);
            this.starRenderPass = new RenderPass(this.starScene, this.camera);
            this.starComposer.addPass(this.starRenderPass);

            this.starBloomPass = new UnrealBloomPass(new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height), 0.6, 0.4, 0.85);
            this.starComposer.addPass(this.starBloomPass);

            // Blend pass to combine normal scene + bloomed stars
            this.blendPass = new ShaderPass(AdditiveBlendShader);
            this.blendPass.uniforms['tBase'].value = this.renderPass.renderTarget.texture;
            this.blendPass.uniforms['tAdd'].value = this.starComposer.renderTarget.texture;
            this.blendPass.needsSwap = true;
            this.composer.addPass(this.blendPass);
        } catch (error) {
            console.error('EffectComposer failed to initialize:', error);
            this.composer = null;
            this.starComposer = null;
        }
    }

    createStarGeometry(data) {
        console.log('[createStarGeometry] called with data.length:', data.length, data.slice(0, 3));
        
        // Remove previous stars from both scenes
        if (this.starsMesh) {
            this.scene.remove(this.starsMesh);
            this.starsMesh.geometry.dispose();
            this.starsMesh = null;
        }
        if (this.starsBloomMesh) {
            this.starScene.remove(this.starsBloomMesh);
            this.starsBloomMesh.geometry.dispose();
            this.starsBloomMesh = null;
        }

        if (data.length === 0) {
            console.warn('No star data to render');
            return;
        }

        const positions = new Float32Array(data.length * 3);
        const colors = new Float32Array(data.length * 3);
        const sizes = new Float32Array(data.length);
        const starParams = new Float32Array(data.length * 4); // CI, twinkle, pulse, halo

        data.forEach((star, i) => {
            positions[i * 3] = star.x;
            positions[i * 3 + 1] = star.y;
            positions[i * 3 + 2] = star.z;

            const color = this.getRGBfromCI(star.ci);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = star.relativeRadiusScale * this.GLOBAL_VISUAL_SCALE;

            // Get visual parameters for this star
            const params = this.getStarVisualParams(star);
            starParams[i * 4] = star.ci || 0;
            starParams[i * 4 + 1] = params.twinkle;
            starParams[i * 4 + 2] = params.pulse;
            starParams[i * 4 + 3] = params.halo;
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('starParams', new THREE.BufferAttribute(starParams, 4));

        // Create shader material if supported
        if (this.useStarShader) {
            this.starShaderMaterial = this.createStarShaderMaterial();
        }

        const material = this.useStarShader && this.starShaderMaterial ? 
            this.starShaderMaterial : 
            new THREE.PointsMaterial({
                size: 2,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.8
            });

        // Create main star mesh
        this.starsMesh = new THREE.Points(geometry, material);
        this.scene.add(this.starsMesh);

        // Create bloom-only version for star scene
        const bloomGeometry = geometry.clone();
        const bloomMaterial = material.clone ? material.clone() : material;
        this.starsBloomMesh = new THREE.Points(bloomGeometry, bloomMaterial);
        this.starScene.add(this.starsBloomMesh);

        console.log(`Created star geometry with ${data.length} stars`);
    }

    createStarShaderMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                pointTexture: { value: null }
            },
            vertexShader: `
                attribute float size;
                attribute vec4 starParams; // CI, twinkle, pulse, halo
                varying vec3 vColor;
                varying vec4 vStarParams;
                uniform float time;
                
                void main() {
                    vColor = color;
                    vStarParams = starParams;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Apply pulsing effect
                    float pulse = 1.0 + starParams.z * sin(time * 2.0 + position.x * 10.0) * 0.3;
                    
                    gl_PointSize = size * pulse * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying vec4 vStarParams;
                uniform float time;
                
                void main() {
                    // Create circular star shape
                    vec2 center = gl_PointCoord - 0.5;
                    float dist = length(center);
                    
                    if (dist > 0.5) discard;
                    
                    // Apply twinkling effect
                    float twinkle = 1.0 + vStarParams.y * sin(time * 5.0 + gl_FragCoord.x * 0.1) * 0.4;
                    
                    // Apply halo effect
                    float halo = 1.0 - smoothstep(0.0, 0.5, dist);
                    halo = pow(halo, 2.0 - vStarParams.w);
                    
                    // Amplify colors for bloom effect
                    vec3 finalColor = vColor * twinkle * halo * 3.0;
                    
                    gl_FragColor = vec4(finalColor, halo);
                }
            `,
            transparent: true,
            vertexColors: true
        });
    }

    getStarVisualParams(star) {
        const spect = (star.spect || '').toUpperCase();
        const spectral = spect.length > 0 ? spect[0] : 'G';
        const lumClass = spect.length > 1 ? spect.slice(1) : 'V';
        
        const defaultParams = { twinkle: 0.02, pulse: 0.8, halo: 0.35 };
        
        try {
            const response = await fetch('visual_presets.json');
            if (response.ok) {
                const presets = await response.json();
                return presets.grid[spectral]?.[lumClass] || defaultParams;
            }
        } catch (error) {
            console.warn('Could not load visual presets:', error);
        }
        
        return defaultParams;
    }

    updateSelectionHighlight(star) {
        if (this.selectionHighlight) {
            this.scene.remove(this.selectionHighlight);
            this.selectionHighlight.geometry.dispose();
            this.selectionHighlight.material.dispose();
            this.selectionHighlight = null;
        }

        if (star) {
            const geometry = new THREE.RingGeometry(3, 5, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0x7DF9FF,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            
            this.selectionHighlight = new THREE.Mesh(geometry, material);
            this.selectionHighlight.position.set(star.x, star.y, star.z);
            this.selectionHighlight.lookAt(this.camera.position);
            this.selectionHighlight.visible = true;
            
            this.scene.add(this.selectionHighlight);
        }
    }

    drawConstellationLines(constellationName) {
        // Clear existing lines
        this.constellationLinesGroup.clear();

        if (!constellationName) return;

        const constellations = getConstellationData();
        const lines = constellations[constellationName];
        if (!lines) return;

        lines.forEach(([star1Name, star2Name]) => {
            const star1 = fullStarData.find(s => s.name === star1Name);
            const star2 = fullStarData.find(s => s.name === star2Name);

            if (star1 && star2) {
                const points = [
                    new THREE.Vector3(star1.x, star1.y, star1.z),
                    new THREE.Vector3(star2.x, star2.y, star2.z)
                ];

                const geometry = new LineGeometry();
                geometry.setPositions([
                    star1.x, star1.y, star1.z,
                    star2.x, star2.y, star2.z
                ]);

                const material = new LineMaterial({
                    color: 0x7DF9FF,
                    linewidth: 0.005,
                    transparent: true,
                    opacity: 0.7
                });

                material.resolution.set(this.renderer.domElement.width, this.renderer.domElement.height);

                const line = new Line2(geometry, material);
                this.constellationLinesGroup.add(line);
            }
        });
    }

    getRGBfromCI(ci) {
        // Convert color index to RGB
        const clampedCI = Math.max(-0.5, Math.min(2.0, ci || 0.65));
        
        let r, g, b;
        if (clampedCI < 0.0) {
            r = 0.7 + 0.3 * (clampedCI + 0.5) / 0.5;
            g = 0.8 + 0.2 * (clampedCI + 0.5) / 0.5;
            b = 1.0;
        } else if (clampedCI < 0.5) {
            r = 0.7 + 0.3 * clampedCI / 0.5;
            g = 0.8 + 0.2 * clampedCI / 0.5;
            b = 1.0 - 0.2 * clampedCI / 0.5;
        } else if (clampedCI < 1.0) {
            r = 1.0;
            g = 1.0 - 0.3 * (clampedCI - 0.5) / 0.5;
            b = 0.8 - 0.4 * (clampedCI - 0.5) / 0.5;
        } else {
            r = 1.0 - 0.2 * (clampedCI - 1.0) / 1.0;
            g = 0.7 - 0.3 * (clampedCI - 1.0) / 1.0;
            b = 0.4 - 0.2 * (clampedCI - 1.0) / 1.0;
        }

        return { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) };
    }

    frameObjectInView(star, onCompleteCallback = null) {
        if (!star) return;

        const target = new THREE.Vector3(star.x, star.y, star.z);
        const highlightRadius = (star.relativeRadiusScale * this.GLOBAL_VISUAL_SCALE) * 1.5 + 0.5;
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = highlightRadius / Math.tan(fov / 2) * 3;

        const direction = new THREE.Vector3().subVectors(this.camera.position, target).normalize();
        const newPosition = target.clone().add(direction.multiplyScalar(distance));

        this.animateCameraTo(target, newPosition, onCompleteCallback);
    }

    animateCameraTo(target, position, onCompleteCallback = null) {
        if (!target || !position) return;

        // Disable controls during animation
        this.activeControls.enabled = false;

        gsap.to(this.camera.position, {
            x: position.x,
            y: position.y,
            z: position.z,
            duration: 1.5,
            ease: "power2.inOut"
        });

        gsap.to(this.controls.target, {
            x: target.x,
            y: target.y,
            z: target.z,
            duration: 1.5,
            ease: "power2.inOut",
            onComplete: () => {
                this.activeControls.enabled = true;
                if (onCompleteCallback) onCompleteCallback();
            }
        });
    }

    toggleControlMode() {
        if (this.activeControls === this.controls) {
            // Switching to Fly Mode
            this.controls.enabled = false;
            this.flyControls.enabled = true;
            this.activeControls = this.flyControls;
            return 'fly';
        } else {
            // Switching to Orbit Mode
            this.flyControls.enabled = false;
            this.controls.enabled = true;
            this.activeControls = this.controls;
            return 'orbit';
        }
    }

    onWindowResize() {
        const canvasContainer = document.getElementById('canvasContainer');
        if (this.camera && this.renderer && canvasContainer) {
            this.camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
            
            if (this.composer) {
                this.composer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
            }
            if (this.starComposer) {
                this.starComposer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
            }
        }
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;

        // Update controls
        if (this.activeControls && this.activeControls.enabled) {
            if (this.activeControls === this.flyControls) {
                this.activeControls.update(this.clock.getDelta());
            } else {
                this.activeControls.update();
            }
        }

        // Update shader time
        if (this.starShaderMaterial && this.starShaderMaterial.uniforms.time) {
            this.starShaderMaterial.uniforms.time.value = this.clock.getElapsedTime();
        }

        // Update selection highlight to face camera
        if (this.selectionHighlight && this.selectionHighlight.visible) {
            this.selectionHighlight.lookAt(this.camera.position);
        }

        // Render with or without post-processing
        if (this.composer && this.starComposer) {
            this.composer.render();
            this.starComposer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    showFallbackContent() {
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    color: #7DF9FF;
                    text-align: center;
                    padding: 20px;
                ">
                    <h2>3D Graphics Not Available</h2>
                    <p>Your browser doesn't support WebGL, which is required for the 3D star map.</p>
                    <p>Please try using a modern browser like Chrome, Firefox, or Edge.</p>
                    <button onclick="location.reload()" style="
                        background: #7DF9FF;
                        color: #000;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 16px;
                    ">Try Again</button>
                </div>
            `;
        }
    }

    dispose() {
        // Clean up resources
        if (this.starsMesh) {
            this.scene.remove(this.starsMesh);
            this.starsMesh.geometry.dispose();
            this.starsMesh.material.dispose();
        }
        
        if (this.starsBloomMesh) {
            this.starScene.remove(this.starsBloomMesh);
            this.starsBloomMesh.geometry.dispose();
            this.starsBloomMesh.material.dispose();
        }

        if (this.selectionHighlight) {
            this.scene.remove(this.selectionHighlight);
            this.selectionHighlight.geometry.dispose();
            this.selectionHighlight.material.dispose();
        }

        this.constellationLinesGroup.clear();

        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}