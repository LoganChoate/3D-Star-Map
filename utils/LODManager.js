// Level of Detail (LOD) Manager for 3D Star Map Explorer
// Optimizes rendering performance through distance-based culling and detail reduction

import * as THREE from '../vendor/three/build/three.module.js';

export class LODManager {
    constructor(camera, errorHandler) {
        this.camera = camera;
        this.errorHandler = errorHandler;
        
        // LOD configuration
        this.config = {
            // Distance thresholds in parsecs
            nearDistance: 50,
            mediumDistance: 200,
            farDistance: 500,
            cullingDistance: 1000,
            
            // Detail levels
            levels: {
                high: {
                    maxStars: Infinity,
                    minMagnitude: -30,
                    showNames: true,
                    showSpectralColors: true,
                    starSizeMultiplier: 1.0,
                    animationEnabled: true
                },
                medium: {
                    maxStars: 50000,
                    minMagnitude: -2,
                    showNames: false,
                    showSpectralColors: true,
                    starSizeMultiplier: 0.7,
                    animationEnabled: false
                },
                low: {
                    maxStars: 10000,
                    minMagnitude: 0,
                    showNames: false,
                    showSpectralColors: false,
                    starSizeMultiplier: 0.5,
                    animationEnabled: false
                },
                minimal: {
                    maxStars: 2000,
                    minMagnitude: 2,
                    showNames: false,
                    showSpectralColors: false,
                    starSizeMultiplier: 0.3,
                    animationEnabled: false
                }
            }
        };
        
        // Current state
        this.currentLOD = 'high';
        this.lastUpdateTime = 0;
        this.updateInterval = 500; // Update every 500ms
        this.enabled = true;
        
        // Performance monitoring
        this.stats = {
            totalStars: 0,
            visibleStars: 0,
            culledStars: 0,
            lodLevel: 'high',
            lastUpdate: 0,
            updateCount: 0
        };
        
        // Event system
        this.listeners = new Map();
        
        // Spatial partitioning for efficient culling
        this.spatialGrid = new Map();
        this.gridSize = 100; // parsecs per grid cell
        
        console.log('LOD Manager initialized');
    }

    // Initialize LOD system with star data
    initialize(starData) {
        if (!starData || starData.length === 0) {
            this.errorHandler?.showWarning('No star data provided to LOD Manager');
            return false;
        }

        this.stats.totalStars = starData.length;
        this.buildSpatialGrid(starData);
        
        console.log(`LOD Manager initialized with ${starData.length} stars`);
        return true;
    }

    // Build spatial grid for efficient culling
    buildSpatialGrid(starData) {
        this.spatialGrid.clear();
        
        starData.forEach(star => {
            const gridX = Math.floor(star.x / this.gridSize);
            const gridY = Math.floor(star.y / this.gridSize);
            const gridZ = Math.floor(star.z / this.gridSize);
            const gridKey = `${gridX},${gridY},${gridZ}`;
            
            if (!this.spatialGrid.has(gridKey)) {
                this.spatialGrid.set(gridKey, []);
            }
            this.spatialGrid.get(gridKey).push(star);
        });
        
        console.log(`Built spatial grid with ${this.spatialGrid.size} cells`);
    }

    // Main LOD update function
    update() {
        if (!this.enabled) return null;
        
        const currentTime = performance.now();
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return null; // Skip update if too soon
        }
        
        this.lastUpdateTime = currentTime;
        this.stats.updateCount++;
        
        // Determine appropriate LOD level based on camera position and performance
        const newLOD = this.calculateOptimalLOD();
        
        if (newLOD !== this.currentLOD) {
            console.log(`LOD level changed: ${this.currentLOD} → ${newLOD}`);
            this.currentLOD = newLOD;
            this.emitEvent('lodChanged', { level: newLOD, config: this.config.levels[newLOD] });
        }
        
        return {
            lodLevel: this.currentLOD,
            config: this.config.levels[this.currentLOD],
            stats: this.getStats()
        };
    }

    // Calculate optimal LOD based on various factors
    calculateOptimalLOD() {
        const cameraPosition = this.camera.position;
        const distanceFromOrigin = cameraPosition.length();
        
        // Performance-based LOD adjustment
        const fps = this.getEstimatedFPS();
        const performanceModifier = this.getPerformanceModifier(fps);
        
        // Base LOD on camera distance
        let baseLOD;
        if (distanceFromOrigin < this.config.nearDistance) {
            baseLOD = 'high';
        } else if (distanceFromOrigin < this.config.mediumDistance) {
            baseLOD = 'medium';
        } else if (distanceFromOrigin < this.config.farDistance) {
            baseLOD = 'low';
        } else {
            baseLOD = 'minimal';
        }
        
        // Adjust based on performance
        return this.adjustLODForPerformance(baseLOD, performanceModifier);
    }

    getPerformanceModifier(fps) {
        if (fps > 50) return 1.0; // High performance
        if (fps > 30) return 0.8; // Medium performance
        if (fps > 20) return 0.6; // Low performance
        return 0.4; // Very low performance
    }

    adjustLODForPerformance(baseLOD, performanceModifier) {
        const lodLevels = ['minimal', 'low', 'medium', 'high'];
        const baseIndex = lodLevels.indexOf(baseLOD);
        
        if (performanceModifier < 0.7) {
            // Reduce LOD for better performance
            const newIndex = Math.max(0, baseIndex - 1);
            return lodLevels[newIndex];
        } else if (performanceModifier > 0.9 && baseIndex < lodLevels.length - 1) {
            // Increase LOD for better quality
            const newIndex = Math.min(lodLevels.length - 1, baseIndex + 1);
            return lodLevels[newIndex];
        }
        
        return baseLOD;
    }

    // Frustum and distance culling
    performCulling(starData, frustum = null) {
        if (!this.enabled || !starData) return starData;
        
        const startTime = performance.now();
        const cameraPosition = this.camera.position;
        const currentConfig = this.config.levels[this.currentLOD];
        
        // Create frustum if not provided
        if (!frustum) {
            frustum = new THREE.Frustum();
            const matrix = new THREE.Matrix4().multiplyMatrices(
                this.camera.projectionMatrix,
                this.camera.matrixWorldInverse
            );
            frustum.setFromProjectionMatrix(matrix);
        }
        
        let visibleStars = [];
        let culledCount = 0;
        
        // Use spatial grid for efficient culling
        const visibleGridCells = this.getVisibleGridCells(cameraPosition, frustum);
        
        for (const gridKey of visibleGridCells) {
            const gridStars = this.spatialGrid.get(gridKey) || [];
            
            for (const star of gridStars) {
                // Distance culling
                const distance = cameraPosition.distanceTo(new THREE.Vector3(star.x, star.y, star.z));
                
                if (distance > this.config.cullingDistance) {
                    culledCount++;
                    continue;
                }
                
                // Magnitude culling based on LOD
                if (star.mag > currentConfig.minMagnitude) {
                    culledCount++;
                    continue;
                }
                
                // Frustum culling
                const starPosition = new THREE.Vector3(star.x, star.y, star.z);
                if (!frustum.containsPoint(starPosition)) {
                    culledCount++;
                    continue;
                }
                
                visibleStars.push({
                    ...star,
                    distance,
                    lodLevel: this.currentLOD
                });
                
                // Limit total stars based on LOD
                if (visibleStars.length >= currentConfig.maxStars) {
                    break;
                }
            }
            
            if (visibleStars.length >= currentConfig.maxStars) {
                break;
            }
        }
        
        // Sort by importance (magnitude, then distance)
        visibleStars.sort((a, b) => {
            if (Math.abs(a.mag - b.mag) > 0.5) {
                return a.mag - b.mag; // Brighter stars first
            }
            return a.distance - b.distance; // Closer stars first
        });
        
        // Apply final count limit
        if (visibleStars.length > currentConfig.maxStars) {
            culledCount += visibleStars.length - currentConfig.maxStars;
            visibleStars = visibleStars.slice(0, currentConfig.maxStars);
        }
        
        // Update statistics
        this.stats.visibleStars = visibleStars.length;
        this.stats.culledStars = culledCount;
        this.stats.lodLevel = this.currentLOD;
        this.stats.lastUpdate = performance.now();
        
        const cullingTime = performance.now() - startTime;
        if (cullingTime > 10) {
            console.warn(`LOD culling took ${cullingTime.toFixed(2)}ms for ${starData.length} stars`);
        }
        
        return visibleStars;
    }

    // Get visible grid cells based on camera frustum
    getVisibleGridCells(cameraPosition, frustum) {
        const visibleCells = new Set();
        
        // Estimate visible range based on camera position and frustum
        const range = Math.min(this.config.cullingDistance, this.config.farDistance * 2);
        const gridRange = Math.ceil(range / this.gridSize);
        
        const cameraCellX = Math.floor(cameraPosition.x / this.gridSize);
        const cameraCellY = Math.floor(cameraPosition.y / this.gridSize);
        const cameraCellZ = Math.floor(cameraPosition.z / this.gridSize);
        
        // Check cells in a cube around the camera
        for (let x = cameraCellX - gridRange; x <= cameraCellX + gridRange; x++) {
            for (let y = cameraCellY - gridRange; y <= cameraCellY + gridRange; y++) {
                for (let z = cameraCellZ - gridRange; z <= cameraCellZ + gridRange; z++) {
                    const gridKey = `${x},${y},${z}`;
                    
                    // Basic distance check
                    const cellCenter = new THREE.Vector3(
                        x * this.gridSize + this.gridSize / 2,
                        y * this.gridSize + this.gridSize / 2,
                        z * this.gridSize + this.gridSize / 2
                    );
                    
                    const distance = cameraPosition.distanceTo(cellCenter);
                    if (distance < range && this.spatialGrid.has(gridKey)) {
                        visibleCells.add(gridKey);
                    }
                }
            }
        }
        
        return visibleCells;
    }

    // Adaptive quality adjustment based on performance
    adaptiveQualityAdjustment(targetFPS = 30) {
        const currentFPS = this.getEstimatedFPS();
        
        if (currentFPS < targetFPS * 0.8) {
            // Performance is poor, reduce quality
            this.reduceQuality();
        } else if (currentFPS > targetFPS * 1.2) {
            // Performance is good, try to increase quality
            this.increaseQuality();
        }
    }

    reduceQuality() {
        const lodLevels = ['high', 'medium', 'low', 'minimal'];
        const currentIndex = lodLevels.indexOf(this.currentLOD);
        
        if (currentIndex < lodLevels.length - 1) {
            this.currentLOD = lodLevels[currentIndex + 1];
            console.log(`Quality reduced to ${this.currentLOD} for better performance`);
            this.emitEvent('qualityReduced', { level: this.currentLOD });
        }
    }

    increaseQuality() {
        const lodLevels = ['high', 'medium', 'low', 'minimal'];
        const currentIndex = lodLevels.indexOf(this.currentLOD);
        
        if (currentIndex > 0) {
            this.currentLOD = lodLevels[currentIndex - 1];
            console.log(`Quality increased to ${this.currentLOD}`);
            this.emitEvent('qualityIncreased', { level: this.currentLOD });
        }
    }

    // Get estimated FPS (simplified)
    getEstimatedFPS() {
        // This would ideally get data from PerformanceMonitor
        // For now, return a placeholder value
        return 60; // Will be integrated with PerformanceMonitor
    }

    // Configuration management
    setLODConfig(level, config) {
        if (this.config.levels[level]) {
            this.config.levels[level] = { ...this.config.levels[level], ...config };
            console.log(`LOD config updated for level: ${level}`);
            return true;
        }
        return false;
    }

    setDistanceThresholds(thresholds) {
        this.config = { ...this.config, ...thresholds };
        console.log('LOD distance thresholds updated');
    }

    // Force specific LOD level
    forceLODLevel(level) {
        if (this.config.levels[level]) {
            this.currentLOD = level;
            this.enabled = false; // Disable automatic updates
            console.log(`LOD level forced to: ${level}`);
            return true;
        }
        return false;
    }

    // Re-enable automatic LOD
    enableAutoLOD() {
        this.enabled = true;
        console.log('Automatic LOD enabled');
    }

    // Event system
    addEventListener(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
    }

    removeEventListener(eventType, callback) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).delete(callback);
        }
    }

    emitEvent(eventType, data) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('LOD Manager event listener error:', error);
                }
            });
        }
    }

    // Statistics and debugging
    getStats() {
        const cullingRatio = this.stats.totalStars > 0 
            ? (this.stats.culledStars / this.stats.totalStars * 100).toFixed(1)
            : 0;
        
        return {
            ...this.stats,
            cullingRatio: parseFloat(cullingRatio),
            gridCells: this.spatialGrid.size,
            updateInterval: this.updateInterval,
            enabled: this.enabled
        };
    }

    getDetailedReport() {
        return {
            config: this.config,
            currentLOD: this.currentLOD,
            stats: this.getStats(),
            performance: {
                enabled: this.enabled,
                lastUpdateTime: this.lastUpdateTime,
                updateInterval: this.updateInterval
            }
        };
    }

    // Debug visualization (for development)
    createDebugVisualization(scene) {
        if (!scene) return null;

        const debugGroup = new THREE.Group();
        debugGroup.name = 'LOD_Debug';
        
        // Visualize grid cells with stars
        this.spatialGrid.forEach((stars, gridKey) => {
            const [x, y, z] = gridKey.split(',').map(Number);
            
            // Create a wireframe box for each grid cell
            const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
            const material = new THREE.MeshBasicMaterial({
                color: stars.length > 100 ? 0xff0000 : stars.length > 50 ? 0xffff00 : 0x00ff00,
                wireframe: true,
                transparent: true,
                opacity: 0.3
            });
            
            const box = new THREE.Mesh(geometry, material);
            box.position.set(
                x * this.gridSize + this.gridSize / 2,
                y * this.gridSize + this.gridSize / 2,
                z * this.gridSize + this.gridSize / 2
            );
            
            debugGroup.add(box);
        });
        
        scene.add(debugGroup);
        return debugGroup;
    }

    // Cleanup
    dispose() {
        this.enabled = false;
        this.spatialGrid.clear();
        this.listeners.clear();
        console.log('LOD Manager disposed');
    }
}

// Utility function to integrate with existing star filtering
export function applyLODToStarData(starData, lodManager, camera) {
    if (!lodManager || !lodManager.enabled) {
        return starData;
    }
    
    // Update LOD system
    const lodResult = lodManager.update();
    
    if (lodResult) {
        // Perform culling
        return lodManager.performCulling(starData);
    }
    
    return starData;
}