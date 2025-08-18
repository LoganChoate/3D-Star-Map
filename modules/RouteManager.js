import * as THREE from '../vendor/three/build/three.module.js';
import { Line2 } from '../vendor/three/examples/jsm/lines/Line2.js';
import { LineGeometry } from '../vendor/three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from '../vendor/three/examples/jsm/lines/LineMaterial.js';

class PriorityQueue {
    constructor() {
        this.elements = [];
    }

    enqueue(element, priority) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.elements.shift()?.element;
    }

    isEmpty() {
        return this.elements.length === 0;
    }
}

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
        
        // Arrow texture cache
        this.arrowTexture = null;
    }

    setData(fullStarData, starOctree) {
        this.fullStarData = fullStarData;
        this.starOctree = starOctree;
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
            activeRoute.startStar = star;
            this.updateRoutePlannerUI();
            return true;
        }
        return false;
    }

    setRouteEnd(star) {
        const activeRoute = this.getActiveRoute();
        if (activeRoute && star) {
            activeRoute.endStar = star;
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

        if (!maxJump || maxJump <= 0) {
            this.errorHandler.showError("Please specify a valid maximum jump distance.");
            return null;
        }

        console.log(`Calculating route from ${activeRoute.startStar.name} to ${activeRoute.endStar.name} with max jump of ${maxJump} pc.`);
        
        // Start visual feedback
        this.startSearchBubbleAnimation(activeRoute.startStar, activeRoute.endStar, maxJump);
        
        try {
            // Small delay to allow UI updates
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const result = this.findPathAStar(activeRoute.startStar, activeRoute.endStar, maxJump);
            
            if (result && result.path) {
                activeRoute.calculatedRoute = result.path;
                
                if (result.stranded) {
                    this.errorHandler.showWarning(
                        `Route partially calculated. Could only reach ${result.path[result.path.length - 1].name} with the given jump range.`
                    );
                } else {
                    console.log(`Route found with ${result.path.length} jumps.`);
                }
                
                this.drawRouteLine(activeRoute);
                this.updateRouteDisplay();
                return result;
            } else {
                this.errorHandler.showError("No route found between the selected stars.");
                return null;
            }
        } finally {
            this.stopSearchBubbleAnimation();
        }
    }

    async findMinimumJumpRange(startStar, endStar) {
        if (!startStar || !endStar) {
            this.errorHandler.showError("Please select both start and end stars.");
            return null;
        }

        console.log(`Finding minimum jump range from ${startStar.name} to ${endStar.name}`);
        
        this.startSearchBubbleAnimation(startStar, endStar, 1);
        
        try {
            let minJump = 1;
            let maxJump = 100;
            let foundRange = null;

            while (minJump <= maxJump) {
                const testJump = (minJump + maxJump) / 2;
                
                await new Promise(resolve => setTimeout(resolve, 50)); // Visual feedback
                
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
            this.stopSearchBubbleAnimation();
        }
    }

    findPathAStar(startNode, endNode, maxJump) {
        try {
            // Validate inputs
            if (!startNode || !endNode) {
                throw new Error('Start and end nodes are required for pathfinding');
            }

            if (!startNode.name || !endNode.name) {
                throw new Error('Invalid node data: missing name property');
            }

            if (typeof maxJump !== 'number' || maxJump <= 0) {
                throw new Error('Maximum jump distance must be a positive number');
            }

            if (!this.fullStarData || this.fullStarData.length === 0) {
                throw new Error('No star data available for pathfinding');
            }

            if (!this.starOctree) {
                throw new Error('Spatial index (Octree) not initialized');
            }

            // Performance timeout for large searches
            const startTime = Date.now();
            const MAX_EXECUTION_TIME = 10000; // 10 seconds

            const openSet = new PriorityQueue();
            const cameFrom = new Map();
            const gScore = new Map();
            const fScore = new Map();

            const nodeMap = new Map(this.fullStarData.map(node => [node.name, node]));
            
            // Verify start and end nodes exist in the dataset
            if (!nodeMap.has(startNode.name)) {
                throw new Error(`Start node "${startNode.name}" not found in star data`);
            }
            if (!nodeMap.has(endNode.name)) {
                throw new Error(`End node "${endNode.name}" not found in star data`);
            }
            
            this.fullStarData.forEach(node => {
                gScore.set(node.name, Infinity);
                fScore.set(node.name, Infinity);
            });

            gScore.set(startNode.name, 0);
            fScore.set(startNode.name, this.heuristic(startNode, endNode));
            openSet.enqueue(startNode, fScore.get(startNode.name));

            let iterations = 0;
            const MAX_ITERATIONS = 50000; // Prevent infinite loops

            while (!openSet.isEmpty()) {
                // Check for timeout and iteration limits
                iterations++;
                if (iterations > MAX_ITERATIONS) {
                    throw new Error('Pathfinding exceeded maximum iterations limit');
                }

                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    throw new Error('Pathfinding timed out - try reducing search area or max jump distance');
                }

                const current = openSet.dequeue();
                if (!current) break; // Safety check

                if (current.name === endNode.name) {
                    // Path found, reconstruct it
                    const totalPath = [current];
                    let temp = current;
                    while (cameFrom.has(temp.name)) {
                        temp = cameFrom.get(temp.name);
                        totalPath.unshift(temp);
                    }
                    console.log(`A* pathfinding completed in ${iterations} iterations, ${Date.now() - startTime}ms`);
                    return { path: totalPath, stranded: false };
                }

                // Use the Octree to find neighbors efficiently
                let neighbors;
                try {
                    neighbors = this.starOctree.query(current, maxJump).filter(n => n.name !== current.name);
                } catch (octreeError) {
                    throw new Error(`Octree query failed: ${octreeError.message}`);
                }

                for (const neighbor of neighbors) {
                    if (!neighbor || !neighbor.name) continue; // Skip invalid neighbors

                    const tentativeGScore = gScore.get(current.name) + this.distance(current, neighbor);
                    if (tentativeGScore < gScore.get(neighbor.name)) {
                        cameFrom.set(neighbor.name, current);
                        gScore.set(neighbor.name, tentativeGScore);
                        fScore.set(neighbor.name, tentativeGScore + this.heuristic(neighbor, endNode));
                        openSet.enqueue(neighbor, fScore.get(neighbor.name));
                    }
                }
            }

            // --- Handle stranded case: No complete path found ---
            // Find the node we reached that is closest to the end destination.
            let closestNode = startNode;
            let minHeuristic = this.heuristic(startNode, endNode);

            for (const [nodeName, score] of gScore.entries()) {
                if (score !== Infinity) { // If the node was reached
                    const reachableNode = nodeMap.get(nodeName);
                    if (reachableNode) {
                        const h = this.heuristic(reachableNode, endNode);
                        if (h < minHeuristic) {
                            minHeuristic = h;
                            closestNode = reachableNode;
                        }
                    }
                }
            }

            // Reconstruct the path to this "closest" node.
            const partialPath = [closestNode];
            let temp = closestNode;
            while (cameFrom.has(temp.name)) {
                temp = cameFrom.get(temp.name);
                partialPath.unshift(temp);
            }

            console.log(`A* pathfinding completed (stranded) in ${iterations} iterations, ${Date.now() - startTime}ms`);
            
            // If the path is just the start node, we couldn't go anywhere.
            return partialPath.length > 1 ? { path: partialPath, stranded: true } : null;
            
        } catch (error) {
            this.errorHandler.showError(
                `Route calculation failed: ${error.message}`,
                error
            );
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

    clearRoute(routeIndex = null) {
        const index = routeIndex !== null ? routeIndex : this.routePlanner.activeRouteIndex;
        const route = this.routePlanner.routes[index];
        
        if (route) {
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
}