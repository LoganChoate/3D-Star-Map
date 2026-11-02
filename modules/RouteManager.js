import * as THREE from '../vendor/three/build/three.module.js';
import { Line2 } from '../vendor/three/examples/jsm/lines/Line2.js';
import { LineGeometry } from '../vendor/three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from '../vendor/three/examples/jsm/lines/LineMaterial.js';
import { buildStarIndex, requireStarId } from '../utils/StarIdentity.js';
import { findRoute } from '../utils/Pathfinding.js';
import { hasUnresolvedDistance } from '../utils/CatalogMetadata.js';

export class RouteManager {
    constructor(starRenderer, errorHandler) {
        this.starRenderer = starRenderer;
        this.errorHandler = errorHandler;
        
        // Route planning state
        this.routePlanner = {
            active: false,
            routes: [
                { startStar: null, endStar: null, calculatedRoute: null, routeLine: null, routeArrows: null },
                { startStar: null, endStar: null, calculatedRoute: null, routeLine: null, routeArrows: null },
                { startStar: null, endStar: null, calculatedRoute: null, routeLine: null, routeArrows: null }
            ],
            activeRouteIndex: 0,
            currentSelection: null,
            currentJumpIndex: 0,
            isFollowingRoute: false
        };

        // Search bubble for visual feedback
        this.searchBubble = null;
        
        // Data references (will be set externally)
        this.fullStarData = null;
        this.starOctree = null;
        this.starIndex = new Map();
        this.dataVersion = 0;
        
        // Arrow texture cache
        this.arrowTexture = null;
        
        // Web Worker for pathfinding
        this.pathfindingWorker = null;
        this.workerMessageId = 0;
        this.workerDataMessageId = null;
        this.pendingRequests = new Map();
        this.workerInitialized = false;
        
        // Performance monitoring
        this.performanceMetrics = {
            totalCalculations: 0,
            workerCalculations: 0,
            fallbackCalculations: 0,
            averageWorkerTime: 0,
            averageFallbackTime: 0
        };
        
        this.initializeWorker();
    }

    setData(fullStarData, starOctree) {
        const index = buildStarIndex(fullStarData);
        if (this.fullStarData) this.clearAllRoutes();
        this.fullStarData = fullStarData;
        this.starIndex = index;
        this.dataVersion++;
        this.starOctree = starOctree;
        
        // Send data to worker if available
        if (this.pathfindingWorker && this.workerInitialized) {
            this.sendDataToWorker();
        }
    }

    initializeWorker() {
        try {
            this.pathfindingWorker = new Worker(new URL('../workers/pathfinding-worker.js', import.meta.url), { type: 'module' });
            
            this.pathfindingWorker.onmessage = (event) => {
                this.handleWorkerMessage(event.data);
            };
            
            this.pathfindingWorker.onerror = error => this.disableWorker(error);
            
            // Messages are ordered: setData is queued before any route request.
            this.workerInitialized = true;
            console.log('Pathfinding worker initialized successfully');
            
        } catch (error) {
            console.warn('Failed to initialize pathfinding worker:', error);
            this.pathfindingWorker = null;
        }
    }

    disableWorker(error) {
        console.warn('Pathfinding worker unavailable:', error);
        this.errorHandler?.showWarning('Pathfinding worker unavailable, using fallback mode');
        this.pendingRequests.forEach(request => {
            clearTimeout(request.timer);
            request.reject(error instanceof Error ? error : new Error('Pathfinding worker failed'));
        });
        this.pendingRequests.clear();
        this.pathfindingWorker?.terminate();
        this.pathfindingWorker = null;
        this.workerInitialized = false;
        this.workerDataMessageId = null;
    }

    sendDataToWorker() {
        if (!this.pathfindingWorker || !this.fullStarData || !this.starOctree) return;
        
        try {
            // Serialize octree data for worker
            const octreeData = {
                boundary: {
                    x: this.starOctree.boundary.x,
                    y: this.starOctree.boundary.y,
                    z: this.starOctree.boundary.z,
                    w: this.starOctree.boundary.w,
                    h: this.starOctree.boundary.h,
                    d: this.starOctree.boundary.d
                },
                capacity: this.starOctree.capacity
            };
            
            this.workerDataMessageId = this.getNextMessageId();
            this.pathfindingWorker.postMessage({
                type: 'setData',
                data: {
                    starData: this.fullStarData,
                    octreeData: octreeData
                },
                id: this.workerDataMessageId
            });
            
        } catch (error) {
            this.disableWorker(error);
        }
    }

    handleWorkerMessage(message) {
        const { type, id, data, error } = message;
        if (id === this.workerDataMessageId) {
            if (type === 'error') this.disableWorker(new Error(`Pathfinding catalog rejected: ${error?.message || 'unknown error'}`));
            else if (type === 'result') this.workerDataMessageId = null;
            return;
        }
        
        if (type === 'progress') {
            this.handlePathfindingProgress(data);
            return;
        }
        
        const request = this.pendingRequests.get(id);
        if (!request) return;
        
        this.pendingRequests.delete(id);
        clearTimeout(request.timer);
        if (request.dataVersion !== this.dataVersion) {
            request.reject(new Error('Catalog changed during route calculation'));
            return;
        }
        if (type === 'error') {
            console.warn('Worker pathfinding error:', error);
            request.reject(new Error(error.message || 'Worker pathfinding failed'));
        } else if (type === 'result') {
            try {
                if (data?.success === false) throw new Error(data.error || 'Worker pathfinding failed');
                const result = data?.path ? { ...data, path: data.path.map(star => {
                    const canonical = this.starIndex.get(requireStarId(star));
                    if (!canonical) throw new Error('Worker returned unknown star ID');
                    return canonical;
                }) } : data;
                request.resolve(result);
            } catch (error) { request.reject(error); }
        }
    }

    handlePathfindingProgress(progress) {
        // Update search bubble or progress indicators
        console.log(`Pathfinding progress: ${progress.iterations} iterations, ${Math.round(progress.timeElapsed)}ms`);
    }

    getNextMessageId() {
        return ++this.workerMessageId;
    }

    getActiveRoute() {
        return this.routePlanner.routes[this.routePlanner.activeRouteIndex];
    }

    setActiveRoute(index) {
        if (index >= 0 && index < this.routePlanner.routes.length) {
            this.routePlanner.activeRouteIndex = index;
            this.updateRouteDisplay();
            return true;
        }
        return false;
    }

    setRouteStart(star) {
        const activeRoute = this.getActiveRoute();
        if (activeRoute && star) {
            const canonical = this.starIndex.get(requireStarId(star));
            if (!canonical) throw new Error('Route start ID is not in the catalog');
            if (hasUnresolvedDistance(canonical)) {
                this.errorHandler?.showWarning('This catalog entry has an unresolved distance and cannot be used as a route endpoint.');
                return false;
            }
            this.clearRoutePath(activeRoute);
            activeRoute.startStar = canonical;
            this.updateRoutePlannerUI();
            return true;
        }
        return false;
    }

    setRouteEnd(star) {
        const activeRoute = this.getActiveRoute();
        if (activeRoute && star) {
            const canonical = this.starIndex.get(requireStarId(star));
            if (!canonical) throw new Error('Route end ID is not in the catalog');
            if (hasUnresolvedDistance(canonical)) {
                this.errorHandler?.showWarning('This catalog entry has an unresolved distance and cannot be used as a route endpoint.');
                return false;
            }
            this.clearRoutePath(activeRoute);
            activeRoute.endStar = canonical;
            this.updateRoutePlannerUI();
            return true;
        }
        return false;
    }

    async calculateRoute(maxJump) {
        const activeRoute = this.getActiveRoute();
        if (!activeRoute || !activeRoute.startStar || !activeRoute.endStar) {
            this.errorHandler.showError("Please select a start and end star for the route.");
            return null;
        }

        if (!Number.isFinite(maxJump) || maxJump <= 0) {
            this.errorHandler.showError("Please specify a valid maximum jump distance.");
            return null;
        }

        const startStar = activeRoute.startStar;
        const endStar = activeRoute.endStar;
        const version = this.dataVersion;
        const revision = activeRoute.revision = (activeRoute.revision || 0) + 1;
        console.log(`Calculating route from ${activeRoute.startStar.name} to ${activeRoute.endStar.name} with max jump of ${maxJump} pc.`);
        
        // Start visual feedback
        this.startSearchBubbleAnimation(activeRoute.startStar, activeRoute.endStar, maxJump);
        const searchBubble = this.searchBubble;
        
        try {
            const startTime = performance.now();
            let result;
            
            // Try Web Worker first, fallback to main thread if unavailable
            if (this.pathfindingWorker && this.workerInitialized) {
                try {
                    result = await this.calculateRouteWithWorker(startStar, endStar, maxJump);
                    this.performanceMetrics.workerCalculations++;
                    this.performanceMetrics.averageWorkerTime = 
                        (this.performanceMetrics.averageWorkerTime + (performance.now() - startTime)) / 2;
                } catch (error) {
                    console.warn('Worker pathfinding failed, using fallback:', error);
                    result = this.findPathAStar(startStar, endStar, maxJump);
                    this.performanceMetrics.fallbackCalculations++;
                }
            } else {
                result = this.findPathAStar(startStar, endStar, maxJump);
                this.performanceMetrics.fallbackCalculations++;
                this.performanceMetrics.averageFallbackTime = 
                    (this.performanceMetrics.averageFallbackTime + (performance.now() - startTime)) / 2;
            }
            
            this.performanceMetrics.totalCalculations++;
            if (version !== this.dataVersion || revision !== activeRoute.revision ||
                activeRoute.startStar?.id !== startStar.id || activeRoute.endStar?.id !== endStar.id) {
                this.errorHandler?.showWarning('Route endpoints changed; discarded the earlier calculation.');
                return null;
            }
            if (result && result.path) {
                activeRoute.calculatedRoute = result.path;
                
                if (result.stranded) {
                    this.errorHandler.showWarning(
                        `Route partially calculated. Could only reach ${result.path[result.path.length - 1].name} with the given jump range.`
                    );
                } else {
                    console.log(`Route found with ${result.path.length} jumps in ${Math.round(performance.now() - startTime)}ms`);
                }
                
                this.drawRouteLine(activeRoute);
                this.updateRouteDisplay();
                return result;
            } else {
                this.errorHandler.showError("No route found between the selected stars.");
                return null;
            }
        } finally {
            if (this.searchBubble === searchBubble) this.stopSearchBubbleAnimation();
        }
    }

    async calculateRouteWithWorker(startStar, endStar, maxJump) {
        return new Promise((resolve, reject) => {
            const messageId = this.getNextMessageId();
            
            if (!this.pathfindingWorker) return reject(new Error('Pathfinding worker unavailable'));
            const request = { resolve, reject, dataVersion: this.dataVersion, timer: null };
            this.pendingRequests.set(messageId, request);
            // A synchronous structured-clone/posting failure must not leak a request.
            try { this.pathfindingWorker.postMessage({
                type: 'findPath',
                data: {
                    startNode: startStar,
                    endNode: endStar,
                    maxJump: maxJump,
                    options: {
                        maxIterations: 50000,
                        timeLimit: 30000
                    }
                },
                id: messageId
            }); } catch (error) {
                this.pendingRequests.delete(messageId);
                reject(error);
                return;
            }
            
            // Set timeout to prevent hanging
            request.timer = setTimeout(() => {
                if (this.pendingRequests.has(messageId)) {
                    this.pendingRequests.delete(messageId);
                    reject(new Error('Worker pathfinding timeout'));
                }
            }, 35000);
        });
    }

    async findMinimumJumpRange(startStar, endStar) {
        if (!startStar || !endStar) {
            this.errorHandler.showError("Please select both start and end stars.");
            return null;
        }

        // The UI applies this asynchronous result to its current route. Preserve
        // that context so an edited/switched route cannot receive an old range.
        const route = this.getActiveRoute();
        const version = this.dataVersion;
        const revision = route?.revision;
        const startId = route?.startStar?.id;
        const endId = route?.endStar?.id;
        const isCurrent = () => version === this.dataVersion && this.getActiveRoute() === route &&
            route?.revision === revision && route?.startStar?.id === startId && route?.endStar?.id === endId;
        console.log(`Finding minimum jump range from ${startStar.name} to ${endStar.name}`);
        
        this.startSearchBubbleAnimation(startStar, endStar, 1);
        const searchBubble = this.searchBubble;
        
        try {
            let minJump = 1;
            let maxJump = 100;
            let foundRange = null;

            while (minJump <= maxJump) {
                const testJump = (minJump + maxJump) / 2;
                
                await new Promise(resolve => setTimeout(resolve, 50)); // Visual feedback
                if (!isCurrent()) {
                    this.errorHandler?.showWarning('Route endpoints changed; discarded the earlier jump range.');
                    return null;
                }
                
                const result = this.findPathAStar(startStar, endStar, testJump);
                
                if (result && result.path && !result.stranded) {
                    foundRange = testJump;
                    maxJump = testJump - 0.1;
                } else {
                    minJump = testJump + 0.1;
                }
                
                if (Math.abs(maxJump - minJump) < 0.1) break;
            }

            if (foundRange) {
                console.log(`Minimum jump range found: ${foundRange.toFixed(2)} pc`);
                return foundRange;
            } else {
                this.errorHandler.showError("No route possible between these stars.");
                return null;
            }
        } finally {
            if (this.searchBubble === searchBubble) this.stopSearchBubbleAnimation();
        }
    }

    findPathAStar(startNode, endNode, maxJump) {
        try {
            return findRoute(this.fullStarData, this.starOctree, startNode, endNode, maxJump, {}, this.starIndex);
        } catch (error) {
            this.errorHandler?.showError(`Route calculation failed: ${error.message}`, error);
            return null;
        }
    }

    distance(nodeA, nodeB) {
        return Math.sqrt(Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2) + Math.pow(nodeA.z - nodeB.z, 2));
    }

    heuristic(nodeA, nodeB) {
        // Euclidean distance is a perfect heuristic for this 3D space
        return this.distance(nodeA, nodeB);
    }

    drawRouteLine(route) {
        if (!route) return;

        // Remove existing route line
        if (route.routeLine) {
            this.starRenderer.scene.remove(route.routeLine);
            route.routeLine.geometry.dispose();
            route.routeLine.material.dispose();
            route.routeLine = null;
        }

        // Remove existing arrows
        if (route.routeArrows) {
            route.routeArrows.forEach(arrow => {
                this.starRenderer.scene.remove(arrow);
                arrow.geometry.dispose();
                arrow.material.dispose();
            });
            route.routeArrows = [];
        }

        if (!route.calculatedRoute || route.calculatedRoute.length < 2) return;

        // Create line geometry
        const positions = [];
        route.calculatedRoute.forEach(star => {
            positions.push(star.x, star.y, star.z);
        });

        const lineGeometry = new LineGeometry();
        lineGeometry.setPositions(positions);

        const lineMaterial = new LineMaterial({
            color: 0x00ff88,
            linewidth: 0.01,
            transparent: true,
            opacity: 0.8
        });

        lineMaterial.resolution.set(
            this.starRenderer.renderer.domElement.width,
            this.starRenderer.renderer.domElement.height
        );

        route.routeLine = new Line2(lineGeometry, lineMaterial);
        this.starRenderer.scene.add(route.routeLine);

        // Add route arrows
        this.addRouteArrows(route);

        console.log(`Route line drawn with ${route.calculatedRoute.length} waypoints`);
    }

    addRouteArrows(route) {
        if (!route.calculatedRoute || route.calculatedRoute.length < 2) return;

        route.routeArrows = [];
        
        for (let i = 0; i < route.calculatedRoute.length - 1; i++) {
            const start = route.calculatedRoute[i];
            const end = route.calculatedRoute[i + 1];

            // Calculate midpoint and direction
            const midpoint = new THREE.Vector3(
                (start.x + end.x) / 2,
                (start.y + end.y) / 2,
                (start.z + end.z) / 2
            );

            const direction = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z).normalize();

            // Create arrow geometry
            const arrowGeometry = new THREE.PlaneGeometry(0.5, 0.5);
            const arrowMaterial = new THREE.MeshBasicMaterial({
                map: this.getArrowTexture(),
                transparent: true,
                opacity: 0.8,
                color: 0x00ff88
            });

            const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
            arrow.position.copy(midpoint);
            arrow.lookAt(midpoint.clone().add(direction));

            route.routeArrows.push(arrow);
            this.starRenderer.scene.add(arrow);
        }
    }

    getArrowTexture() {
        if (!this.arrowTexture) {
            this.arrowTexture = this.createArrowTexture();
        }
        return this.arrowTexture;
    }

    createArrowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw arrow shape
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(32, 16);
        ctx.lineTo(48, 32);
        ctx.lineTo(40, 32);
        ctx.lineTo(40, 48);
        ctx.lineTo(24, 48);
        ctx.lineTo(24, 32);
        ctx.lineTo(16, 32);
        ctx.closePath();
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    startSearchBubbleAnimation(startNode, endNode, maxJump) {
        this.stopSearchBubbleAnimation();

        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x7DF9FF,
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });

        this.searchBubble = new THREE.Mesh(geometry, material);
        this.searchBubble.position.set(startNode.x, startNode.y, startNode.z);
        this.starRenderer.scene.add(this.searchBubble);

        // Animate the bubble
        const animate = () => {
            if (!this.searchBubble) return;

            this.searchBubble.scale.setScalar(Math.sin(Date.now() * 0.005) * 0.5 + 1.5);
            this.searchBubble.rotation.y += 0.02;
            
            requestAnimationFrame(animate);
        };
        animate();
    }

    stopSearchBubbleAnimation() {
        if (this.searchBubble) {
            this.starRenderer.scene.remove(this.searchBubble);
            this.searchBubble.geometry.dispose();
            this.searchBubble.material.dispose();
            this.searchBubble = null;
        }
    }

    jumpToRoutePoint(point) {
        const activeRoute = this.getActiveRoute();
        if (!activeRoute || !activeRoute.calculatedRoute) return;

        let targetStar = null;
        
        if (point === 'start') {
            targetStar = activeRoute.calculatedRoute[0];
            this.routePlanner.currentJumpIndex = 0;
        } else if (point === 'end') {
            targetStar = activeRoute.calculatedRoute[activeRoute.calculatedRoute.length - 1];
            this.routePlanner.currentJumpIndex = activeRoute.calculatedRoute.length - 1;
        }

        if (targetStar) {
            this.starRenderer.frameObjectInView(targetStar);
            this.updateRouteDisplay();
        }
    }

    handleNextJump() {
        const activeRoute = this.getActiveRoute();
        if (!activeRoute || !activeRoute.calculatedRoute) return;

        if (this.routePlanner.currentJumpIndex < activeRoute.calculatedRoute.length - 1) {
            this.routePlanner.currentJumpIndex++;
            const nextStar = activeRoute.calculatedRoute[this.routePlanner.currentJumpIndex];
            this.starRenderer.frameObjectInView(nextStar);
            this.updateRouteDisplay();
        }
    }

    toggleFollowRoute() {
        if (this.routePlanner.isFollowingRoute) {
            this.stopFollowRoute();
        } else {
            this.followRoute();
        }
    }

    followRoute() {
        const activeRoute = this.getActiveRoute();
        if (!activeRoute || !activeRoute.calculatedRoute || activeRoute.calculatedRoute.length < 2) return;

        this.routePlanner.isFollowingRoute = true;
        this.routePlanner.currentJumpIndex = 0;
        
        const followNextJump = () => {
            if (!this.routePlanner.isFollowingRoute) return;
            
            const currentStar = activeRoute.calculatedRoute[this.routePlanner.currentJumpIndex];
            this.starRenderer.frameObjectInView(currentStar, () => {
                if (this.routePlanner.currentJumpIndex < activeRoute.calculatedRoute.length - 1) {
                    this.routePlanner.currentJumpIndex++;
                    setTimeout(followNextJump, 3000); // 3 second pause at each star
                } else {
                    this.stopFollowRoute();
                }
            });
            this.updateRouteDisplay();
        };

        followNextJump();
    }

    stopFollowRoute() {
        this.routePlanner.isFollowingRoute = false;
    }

    clearRoutePath(route) {
        route.revision = (route.revision || 0) + 1;
        route.calculatedRoute = null;
        this.drawRouteLine(route);
        this.stopFollowRoute();
        this.stopSearchBubbleAnimation();
    }

    clearRoute(routeIndex = null) {
        const index = routeIndex !== null ? routeIndex : this.routePlanner.activeRouteIndex;
        const route = this.routePlanner.routes[index];
        
        if (route) {
            route.revision = (route.revision || 0) + 1;
            if (index === this.routePlanner.activeRouteIndex) {
                this.stopFollowRoute();
                this.stopSearchBubbleAnimation();
            }
            // Clear route line
            if (route.routeLine) {
                this.starRenderer.scene.remove(route.routeLine);
                route.routeLine.geometry.dispose();
                route.routeLine.material.dispose();
                route.routeLine = null;
            }

            // Clear arrows
            if (route.routeArrows) {
                route.routeArrows.forEach(arrow => {
                    this.starRenderer.scene.remove(arrow);
                    arrow.geometry.dispose();
                    arrow.material.dispose();
                });
                route.routeArrows = [];
            }

            // Reset route data
            route.startStar = null;
            route.endStar = null;
            route.calculatedRoute = null;
        }
    }

    clearAllRoutes() {
        for (let i = 0; i < this.routePlanner.routes.length; i++) {
            this.clearRoute(i);
        }
        this.routePlanner.currentJumpIndex = 0;
        this.stopFollowRoute();
    }

    updateRouteDisplay() {
        // Show/hide route lines based on route planner state
        this.routePlanner.routes.forEach(route => {
            if (route.routeLine) {
                route.routeLine.visible = this.routePlanner.active;
            }
            if (route.routeArrows) {
                route.routeArrows.forEach(arrow => {
                    arrow.visible = this.routePlanner.active;
                });
            }
        });
    }

    updateRoutePlannerUI() {
        // This will be implemented by the UIManager
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('routePlannerUpdate', {
            detail: {
                activeRoute: this.getActiveRoute(),
                currentJumpIndex: this.routePlanner.currentJumpIndex,
                isFollowingRoute: this.routePlanner.isFollowingRoute
            }
        }));
    }

    toggleActive() {
        this.routePlanner.active = !this.routePlanner.active;
        this.updateRouteDisplay();
        
        if (!this.routePlanner.active) {
            this.stopFollowRoute();
        }
        
        return this.routePlanner.active;
    }

    isActive() {
        return this.routePlanner.active;
    }

    dispose() {
        this.clearAllRoutes();
        this.stopSearchBubbleAnimation();
        
        if (this.arrowTexture) {
            this.arrowTexture.dispose();
            this.arrowTexture = null;
        }
    }

    // Performance monitoring and optimization methods
    getPerformanceReport() {
        const workerPercentage = this.performanceMetrics.totalCalculations > 0 
            ? (this.performanceMetrics.workerCalculations / this.performanceMetrics.totalCalculations * 100).toFixed(1)
            : 0;

        return {
            totalCalculations: this.performanceMetrics.totalCalculations,
            workerCalculations: this.performanceMetrics.workerCalculations,
            fallbackCalculations: this.performanceMetrics.fallbackCalculations,
            workerUsagePercentage: workerPercentage,
            averageWorkerTime: Math.round(this.performanceMetrics.averageWorkerTime),
            averageFallbackTime: Math.round(this.performanceMetrics.averageFallbackTime),
            workerAvailable: !!this.pathfindingWorker,
            workerInitialized: this.workerInitialized,
            pendingRequests: this.pendingRequests.size
        };
    }

    async benchmarkPathfinding(testCases = 5) {
        if (!this.fullStarData || this.fullStarData.length < 10) {
            console.warn('Insufficient star data for benchmarking');
            return null;
        }

        console.log(`Starting pathfinding benchmark with ${testCases} test cases...`);
        
        const results = {
            workerResults: [],
            fallbackResults: [],
            workerAverage: 0,
            fallbackAverage: 0,
            workerFaster: 0
        };

        // Generate random test cases
        const testRoutes = [];
        for (let i = 0; i < testCases; i++) {
            const startIdx = Math.floor(Math.random() * this.fullStarData.length);
            const endIdx = Math.floor(Math.random() * this.fullStarData.length);
            const maxJump = 10 + Math.random() * 20; // 10-30 parsecs
            
            testRoutes.push({
                start: this.fullStarData[startIdx],
                end: this.fullStarData[endIdx],
                maxJump
            });
        }

        // Test worker performance
        if (this.pathfindingWorker && this.workerInitialized) {
            for (const route of testRoutes) {
                try {
                    const startTime = performance.now();
                    await this.calculateRouteWithWorker(route.start, route.end, route.maxJump);
                    const workerTime = performance.now() - startTime;
                    results.workerResults.push(workerTime);
                } catch (error) {
                    console.warn('Worker benchmark test failed:', error);
                    results.workerResults.push(null);
                }
            }
        }

        // Test fallback performance
        for (const route of testRoutes) {
            try {
                const startTime = performance.now();
                this.findPathAStar(route.start, route.end, route.maxJump);
                const fallbackTime = performance.now() - startTime;
                results.fallbackResults.push(fallbackTime);
            } catch (error) {
                console.warn('Fallback benchmark test failed:', error);
                results.fallbackResults.push(null);
            }
        }

        // Calculate averages
        const validWorkerResults = results.workerResults.filter(r => r !== null);
        const validFallbackResults = results.fallbackResults.filter(r => r !== null);
        
        if (validWorkerResults.length > 0) {
            results.workerAverage = validWorkerResults.reduce((a, b) => a + b, 0) / validWorkerResults.length;
        }
        
        if (validFallbackResults.length > 0) {
            results.fallbackAverage = validFallbackResults.reduce((a, b) => a + b, 0) / validFallbackResults.length;
        }

        // Count cases where worker was faster
        for (let i = 0; i < testCases; i++) {
            if (results.workerResults[i] && results.fallbackResults[i] && 
                results.workerResults[i] < results.fallbackResults[i]) {
                results.workerFaster++;
            }
        }

        console.log('Pathfinding benchmark results:', results);
        return results;
    }

    optimizeForDataset() {
        if (!this.fullStarData || !this.starOctree) return;

        // Analyze dataset characteristics
        const datasetStats = {
            starCount: this.fullStarData.length,
            averageDistance: this.calculateAverageStarDistance(),
            densityMetrics: this.analyzeSpatialDensity()
        };

        console.log('Dataset analysis:', datasetStats);

        // Adjust worker settings based on dataset size
        if (datasetStats.starCount > 50000) {
            console.log('Large dataset detected, optimizing for performance...');
            // Could adjust octree capacity, worker timeout, etc.
        }

        return datasetStats;
    }

    calculateAverageStarDistance() {
        if (this.fullStarData.length < 2) return 0;

        let totalDistance = 0;
        let pairCount = 0;
        const sampleSize = Math.min(1000, this.fullStarData.length);

        for (let i = 0; i < sampleSize && pairCount < 5000; i++) {
            for (let j = i + 1; j < sampleSize && pairCount < 5000; j++) {
                totalDistance += this.distance(this.fullStarData[i], this.fullStarData[j]);
                pairCount++;
            }
        }

        return pairCount > 0 ? totalDistance / pairCount : 0;
    }

    analyzeSpatialDensity() {
        // Simple spatial density analysis
        const bounds = {
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: Infinity, maxZ: -Infinity
        };

        this.fullStarData.forEach(star => {
            bounds.minX = Math.min(bounds.minX, star.x);
            bounds.maxX = Math.max(bounds.maxX, star.x);
            bounds.minY = Math.min(bounds.minY, star.y);
            bounds.maxY = Math.max(bounds.maxY, star.y);
            bounds.minZ = Math.min(bounds.minZ, star.z);
            bounds.maxZ = Math.max(bounds.maxZ, star.z);
        });

        const volume = (bounds.maxX - bounds.minX) * 
                      (bounds.maxY - bounds.minY) * 
                      (bounds.maxZ - bounds.minZ);
        
        return {
            volume,
            density: this.fullStarData.length / volume,
            bounds
        };
    }

    // Cleanup and resource management
    dispose() {
        // Clean up Web Worker
        if (this.pathfindingWorker) {
            // Cancel any pending requests
            this.pendingRequests.forEach((request, id) => {
                clearTimeout(request.timer);
                request.reject(new Error('RouteManager disposed'));
            });
            this.pendingRequests.clear();

            this.pathfindingWorker.terminate();
            this.pathfindingWorker = null;
            this.workerInitialized = false;
        }

        // Clear route visualization
        this.clearAllRoutes();

        // Clean up search bubble
        if (this.searchBubble) {
            this.starRenderer.scene.remove(this.searchBubble);
            this.searchBubble = null;
        }

        console.log('RouteManager disposed successfully');
    }
}
