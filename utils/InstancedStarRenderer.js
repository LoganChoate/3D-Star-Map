// Optimized instanced star rendering system for high-performance visualization
// Uses typed arrays and efficient buffer management for massive star datasets

import * as THREE from '../vendor/three/build/three.module.js';

export class InstancedStarRenderer {
    constructor(maxStars = 200000) {
        this.maxStars = maxStars;
        this.currentStarCount = 0;
        
        // Instanced mesh and geometry
        this.instancedMesh = null;
        this.baseGeometry = null;
        this.material = null;
        
        // Instanced attributes as typed arrays for performance
        this.instancedAttributes = {
            position: null,      // Vec3 - star position
            scale: null,         // Float - star size
            color: null,         // Vec3 - star color
            animation: null,     // Vec4 - animation parameters (twinkle, pulse, halo, time)
            metadata: null       // Vec4 - magnitude, CI, selection state, distance
        };
        
        // Buffer management
        this.bufferNeedsUpdate = {
            position: false,
            scale: false,
            color: false,
            animation: false,
            metadata: false
        };
        
        // Performance tracking
        this.renderStats = {
            lastUpdateTime: 0,
            updateCount: 0,
            renderTime: 0,
            bufferUpdateTime: 0
        };
        
        // Optimization settings
        this.optimizations = {
            frustumCulling: true,
            lodEnabled: true,
            dynamicBatching: true,
            partialUpdates: true,
            updateBatchSize: 10000 // Update this many stars per frame
        };
        
        this.initialize();
    }

    initialize() {
        this.createBaseGeometry();
        this.createMaterial();
        this.createInstancedAttributes();
        this.createInstancedMesh();
        
        console.log(`InstancedStarRenderer initialized for ${this.maxStars} stars`);
    }

    createBaseGeometry() {
        // Simple point geometry - instancing handles positioning
        this.baseGeometry = new THREE.SphereGeometry(1, 8, 6);
        
        // Optimize geometry for performance
        this.baseGeometry.computeBoundingSphere();
        this.baseGeometry.computeBoundingBox();
    }

    createMaterial() {
        // Advanced star material with instanced attribute support
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                globalScale: { value: 1.0 },
                selectedStarId: { value: -1 },
                bloomThreshold: { value: 0.8 },
                cameraPosition: { value: new THREE.Vector3() }
            },
            
            vertexShader: `
                // Instanced attributes
                attribute vec3 instancePosition;
                attribute float instanceScale;
                attribute vec3 instanceColor;
                attribute vec4 instanceAnimation; // twinkle, pulse, halo, timeOffset
                attribute vec4 instanceMetadata; // magnitude, CI, selected, distance
                
                // Uniforms
                uniform float time;
                uniform float globalScale;
                uniform vec3 cameraPosition;
                
                // Varyings to fragment shader
                varying vec3 vColor;
                varying float vTwinkle;
                varying float vPulse;
                varying float vHalo;
                varying float vDistance;
                varying float vSelected;
                
                void main() {
                    // Base position from geometry + instanced position
                    vec3 worldPosition = position * instanceScale * globalScale + instancePosition;
                    
                    // Animation calculations
                    float animTime = time + instanceAnimation.w;
                    vTwinkle = instanceAnimation.x * (0.8 + 0.2 * sin(animTime * 3.0));
                    vPulse = instanceAnimation.y * (0.9 + 0.1 * sin(animTime * 2.0));
                    vHalo = instanceAnimation.z;
                    
                    // Pass data to fragment shader
                    vColor = instanceColor;
                    vDistance = instanceMetadata.w;
                    vSelected = instanceMetadata.z;
                    
                    // Standard transform
                    vec4 mvPosition = modelViewMatrix * vec4(worldPosition, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Point size based on distance and scale
                    float distanceScale = 1.0 / (1.0 + vDistance * 0.001);
                    gl_PointSize = instanceScale * globalScale * distanceScale * 100.0;
                }
            `,
            
            fragmentShader: `
                uniform float time;
                uniform float selectedStarId;
                uniform float bloomThreshold;
                
                varying vec3 vColor;
                varying float vTwinkle;
                varying float vPulse;
                varying float vHalo;
                varying float vDistance;
                varying float vSelected;
                
                void main() {
                    // Circular point shape
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    if (dist > 0.5) discard;
                    
                    // Base color with animation effects
                    vec3 color = vColor;
                    
                    // Apply twinkle effect
                    color *= (1.0 + vTwinkle * 0.3);
                    
                    // Apply pulse effect
                    float pulse = 1.0 + vPulse * 0.2 * sin(time * 4.0);
                    color *= pulse;
                    
                    // Halo effect for bright stars
                    if (vHalo > 0.5) {
                        float haloIntensity = 1.0 - dist * 2.0;
                        color += vec3(0.2, 0.2, 0.4) * haloIntensity * vHalo;
                    }
                    
                    // Selection highlight
                    if (vSelected > 0.5) {
                        color += vec3(0.3, 0.3, 0.0) * (0.8 + 0.2 * sin(time * 6.0));
                    }
                    
                    // Fade edges for smooth appearance
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: false
        });
    }

    createInstancedAttributes() {
        // Initialize typed arrays for maximum performance
        this.instancedAttributes.position = new Float32Array(this.maxStars * 3);
        this.instancedAttributes.scale = new Float32Array(this.maxStars);
        this.instancedAttributes.color = new Float32Array(this.maxStars * 3);
        this.instancedAttributes.animation = new Float32Array(this.maxStars * 4);
        this.instancedAttributes.metadata = new Float32Array(this.maxStars * 4);
        
        console.log(`Allocated ${this.calculateMemoryUsage()}MB for star instance data`);
    }

    createInstancedMesh() {
        this.instancedMesh = new THREE.InstancedMesh(
            this.baseGeometry,
            this.material,
            this.maxStars
        );
        
        // Set up instanced attributes
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        // Add custom attributes
        this.instancedMesh.geometry.setAttribute(
            'instancePosition',
            new THREE.InstancedBufferAttribute(this.instancedAttributes.position, 3).setUsage(THREE.DynamicDrawUsage)
        );
        
        this.instancedMesh.geometry.setAttribute(
            'instanceScale',
            new THREE.InstancedBufferAttribute(this.instancedAttributes.scale, 1).setUsage(THREE.DynamicDrawUsage)
        );
        
        this.instancedMesh.geometry.setAttribute(
            'instanceColor',
            new THREE.InstancedBufferAttribute(this.instancedAttributes.color, 3).setUsage(THREE.DynamicDrawUsage)
        );
        
        this.instancedMesh.geometry.setAttribute(
            'instanceAnimation',
            new THREE.InstancedBufferAttribute(this.instancedAttributes.animation, 4).setUsage(THREE.DynamicDrawUsage)
        );
        
        this.instancedMesh.geometry.setAttribute(
            'instanceMetadata',
            new THREE.InstancedBufferAttribute(this.instancedAttributes.metadata, 4).setUsage(THREE.DynamicDrawUsage)
        );
        
        // Frustum culling optimization
        this.instancedMesh.frustumCulled = this.optimizations.frustumCulling;
        
        // Set initial count to 0
        this.instancedMesh.count = 0;
    }

    // Update star data efficiently using batch processing
    updateStarData(starData, forceFullUpdate = false) {
        const startTime = performance.now();
        
        if (!starData || starData.length === 0) {
            this.instancedMesh.count = 0;
            return;
        }
        
        const newStarCount = Math.min(starData.length, this.maxStars);
        const shouldFullUpdate = forceFullUpdate || newStarCount !== this.currentStarCount;
        
        if (shouldFullUpdate) {
            this.performFullUpdate(starData, newStarCount);
        } else if (this.optimizations.partialUpdates) {
            this.performPartialUpdate(starData, newStarCount);
        }
        
        this.currentStarCount = newStarCount;
        this.instancedMesh.count = this.currentStarCount;
        
        // Update buffers that need it
        this.updateBuffers();
        
        // Performance tracking
        this.renderStats.lastUpdateTime = performance.now() - startTime;
        this.renderStats.updateCount++;
        
        if (this.renderStats.lastUpdateTime > 10) {
            console.warn(`Star data update took ${this.renderStats.lastUpdateTime.toFixed(2)}ms for ${newStarCount} stars`);
        }
    }

    performFullUpdate(starData, starCount) {
        // Update all stars in batches for better performance
        const batchSize = this.optimizations.updateBatchSize;
        
        for (let i = 0; i < starCount; i += batchSize) {
            const endIndex = Math.min(i + batchSize, starCount);
            this.updateStarBatch(starData, i, endIndex);
        }
        
        // Mark all buffers for update
        Object.keys(this.bufferNeedsUpdate).forEach(key => {
            this.bufferNeedsUpdate[key] = true;
        });
    }

    performPartialUpdate(starData, starCount) {
        // Update only changed stars (this would require change detection)
        // For now, perform a full update but could be optimized
        this.performFullUpdate(starData, starCount);
    }

    updateStarBatch(starData, startIndex, endIndex) {
        for (let i = startIndex; i < endIndex; i++) {
            const star = starData[i];
            if (!star) continue;
            
            // Position
            const posOffset = i * 3;
            this.instancedAttributes.position[posOffset] = star.x;
            this.instancedAttributes.position[posOffset + 1] = star.y;
            this.instancedAttributes.position[posOffset + 2] = star.z;
            
            // Scale based on magnitude
            this.instancedAttributes.scale[i] = this.calculateStarScale(star.mag);
            
            // Color based on spectral class/CI
            const color = this.calculateStarColor(star.ci || 0.65);
            const colorOffset = i * 3;
            this.instancedAttributes.color[colorOffset] = color.r;
            this.instancedAttributes.color[colorOffset + 1] = color.g;
            this.instancedAttributes.color[colorOffset + 2] = color.b;
            
            // Animation parameters
            const animOffset = i * 4;
            this.instancedAttributes.animation[animOffset] = this.calculateTwinkle(star);
            this.instancedAttributes.animation[animOffset + 1] = this.calculatePulse(star);
            this.instancedAttributes.animation[animOffset + 2] = this.calculateHalo(star);
            this.instancedAttributes.animation[animOffset + 3] = Math.random() * Math.PI * 2; // Time offset
            
            // Metadata
            const metaOffset = i * 4;
            this.instancedAttributes.metadata[metaOffset] = star.mag;
            this.instancedAttributes.metadata[metaOffset + 1] = star.ci || 0.65;
            this.instancedAttributes.metadata[metaOffset + 2] = star.selected ? 1.0 : 0.0;
            this.instancedAttributes.metadata[metaOffset + 3] = star.distance || star.dist || 0;
        }
    }

    updateBuffers() {
        const startTime = performance.now();
        
        Object.keys(this.bufferNeedsUpdate).forEach(attributeName => {
            if (this.bufferNeedsUpdate[attributeName]) {
                const attribute = this.instancedMesh.geometry.getAttribute(`instance${attributeName.charAt(0).toUpperCase() + attributeName.slice(1)}`);
                if (attribute) {
                    attribute.needsUpdate = true;
                    this.bufferNeedsUpdate[attributeName] = false;
                }
            }
        });
        
        this.renderStats.bufferUpdateTime = performance.now() - startTime;
    }

    // Star property calculations
    calculateStarScale(magnitude) {
        // Convert magnitude to scale (brighter = larger)
        const baseMagnitude = 4.83; // Sun's absolute magnitude
        const scale = Math.pow(10, -(magnitude - baseMagnitude) / 2.5);
        return Math.max(0.1, Math.min(5.0, scale * 0.5));
    }

    calculateStarColor(ci) {
        // Convert color index to RGB
        const clampedCI = Math.max(-0.5, Math.min(2.0, ci));
        
        let r, g, b;
        
        if (clampedCI < 0.0) {
            // Blue stars
            r = 0.7 + 0.3 * (clampedCI + 0.5) / 0.5;
            g = 0.8 + 0.2 * (clampedCI + 0.5) / 0.5;
            b = 1.0;
        } else if (clampedCI < 0.5) {
            // Blue-white to white stars
            r = 0.7 + 0.3 * clampedCI / 0.5;
            g = 0.8 + 0.2 * clampedCI / 0.5;
            b = 1.0 - 0.2 * clampedCI / 0.5;
        } else if (clampedCI < 1.0) {
            // White to yellow stars
            r = 1.0;
            g = 1.0 - 0.3 * (clampedCI - 0.5) / 0.5;
            b = 0.8 - 0.4 * (clampedCI - 0.5) / 0.5;
        } else {
            // Orange to red stars
            r = 1.0 - 0.2 * (clampedCI - 1.0) / 1.0;
            g = 0.7 - 0.3 * (clampedCI - 1.0) / 1.0;
            b = 0.4 - 0.2 * (clampedCI - 1.0) / 1.0;
        }
        
        return {
            r: Math.max(0, Math.min(1, r * 2.0)), // Amplify for bloom effect
            g: Math.max(0, Math.min(1, g * 2.0)),
            b: Math.max(0, Math.min(1, b * 2.0))
        };
    }

    calculateTwinkle(star) {
        // Brighter stars twinkle more
        return Math.max(0, 1.0 - star.mag / 10.0);
    }

    calculatePulse(star) {
        // Variable stars or special cases could pulse
        return star.variableType ? 0.8 : 0.2;
    }

    calculateHalo(star) {
        // Very bright stars get halos
        return star.mag < 1.0 ? 0.8 : 0.0;
    }

    // Rendering and animation
    render(renderer, scene, camera) {
        const startTime = performance.now();
        
        // Update uniforms
        this.material.uniforms.time.value = performance.now() * 0.001;
        this.material.uniforms.cameraPosition.value.copy(camera.position);
        
        // Render the instanced mesh
        if (this.instancedMesh.count > 0) {
            renderer.render(scene, camera);
        }
        
        this.renderStats.renderTime = performance.now() - startTime;
    }

    // Selection handling
    updateSelection(selectedStarIndex) {
        if (selectedStarIndex >= 0 && selectedStarIndex < this.currentStarCount) {
            // Reset all selections
            for (let i = 0; i < this.currentStarCount; i++) {
                this.instancedAttributes.metadata[i * 4 + 2] = 0.0;
            }
            
            // Set new selection
            this.instancedAttributes.metadata[selectedStarIndex * 4 + 2] = 1.0;
            this.bufferNeedsUpdate.metadata = true;
        }
    }

    // Performance optimization controls
    setOptimization(key, value) {
        if (this.optimizations.hasOwnProperty(key)) {
            this.optimizations[key] = value;
            console.log(`Optimization ${key} set to ${value}`);
            
            if (key === 'frustumCulling' && this.instancedMesh) {
                this.instancedMesh.frustumCulled = value;
            }
        }
    }

    // Performance monitoring
    getPerformanceStats() {
        const memoryUsage = this.calculateMemoryUsage();
        
        return {
            maxStars: this.maxStars,
            currentStars: this.currentStarCount,
            memoryUsageMB: memoryUsage,
            lastUpdateTime: this.renderStats.lastUpdateTime,
            averageUpdateTime: this.renderStats.updateCount > 0 
                ? this.renderStats.bufferUpdateTime / this.renderStats.updateCount 
                : 0,
            renderTime: this.renderStats.renderTime,
            updateCount: this.renderStats.updateCount,
            optimizations: this.optimizations
        };
    }

    calculateMemoryUsage() {
        const floatSize = 4; // bytes
        const totalFloats = this.maxStars * (3 + 1 + 3 + 4 + 4); // position + scale + color + animation + metadata
        return (totalFloats * floatSize) / (1024 * 1024); // MB
    }

    // Resource management
    dispose() {
        if (this.baseGeometry) {
            this.baseGeometry.dispose();
        }
        
        if (this.material) {
            this.material.dispose();
        }
        
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
        }
        
        // Clear typed arrays
        Object.keys(this.instancedAttributes).forEach(key => {
            this.instancedAttributes[key] = null;
        });
        
        console.log('InstancedStarRenderer disposed');
    }

    // Utility methods
    getMesh() {
        return this.instancedMesh;
    }

    getStarCount() {
        return this.currentStarCount;
    }

    setGlobalScale(scale) {
        this.material.uniforms.globalScale.value = scale;
    }
}