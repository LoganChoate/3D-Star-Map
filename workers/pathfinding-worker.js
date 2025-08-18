// Web Worker for A* pathfinding calculations
// This runs in a separate thread to prevent UI blocking

// Priority Queue implementation optimized for Web Worker
class PriorityQueue {
    constructor() {
        this.elements = [];
    }

    enqueue(element, priority) {
        const item = { element, priority };
        this.elements.push(item);
        this.bubbleUp(this.elements.length - 1);
    }

    dequeue() {
        if (this.elements.length === 0) return undefined;
        
        const min = this.elements[0];
        const end = this.elements.pop();
        
        if (this.elements.length > 0) {
            this.elements[0] = end;
            this.sinkDown(0);
        }
        
        return min.element;
    }

    bubbleUp(index) {
        const element = this.elements[index];
        
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.elements[parentIndex];
            
            if (element.priority >= parent.priority) break;
            
            this.elements[index] = parent;
            index = parentIndex;
        }
        
        this.elements[index] = element;
    }

    sinkDown(index) {
        const length = this.elements.length;
        const element = this.elements[index];
        
        while (true) {
            const leftChildIndex = 2 * index + 1;
            const rightChildIndex = 2 * index + 2;
            let smallest = index;
            
            if (leftChildIndex < length && 
                this.elements[leftChildIndex].priority < this.elements[smallest].priority) {
                smallest = leftChildIndex;
            }
            
            if (rightChildIndex < length && 
                this.elements[rightChildIndex].priority < this.elements[smallest].priority) {
                smallest = rightChildIndex;
            }
            
            if (smallest === index) break;
            
            this.elements[index] = this.elements[smallest];
            index = smallest;
        }
        
        this.elements[index] = element;
    }

    isEmpty() {
        return this.elements.length === 0;
    }

    size() {
        return this.elements.length;
    }
}

// Octree implementation for spatial queries (copied from main thread)
class Box3D {
    constructor(x, y, z, w, h, d) {
        this.x = x; this.y = y; this.z = z;
        this.w = w; this.h = h; this.d = d;
    }

    contains(point) {
        return (
            point.x >= this.x - this.w && point.x <= this.x + this.w &&
            point.y >= this.y - this.h && point.y <= this.y + this.h &&
            point.z >= this.z - this.d && point.z <= this.z + this.d
        );
    }

    intersects(sphere) {
        const dx = Math.max(0, Math.max(this.x - this.w - sphere.x, sphere.x - (this.x + this.w)));
        const dy = Math.max(0, Math.max(this.y - this.h - sphere.y, sphere.y - (this.y + this.h)));
        const dz = Math.max(0, Math.max(this.z - this.d - sphere.z, sphere.z - (this.z + this.d)));
        return (dx * dx + dy * dy + dz * dz) <= (sphere.radius * sphere.radius);
    }
}

class Sphere3D {
    constructor(x, y, z, radius) {
        this.x = x; this.y = y; this.z = z; this.radius = radius;
    }

    contains(point) {
        const dx = this.x - point.x;
        const dy = this.y - point.y;
        const dz = this.z - point.z;
        return (dx * dx + dy * dy + dz * dz) <= (this.radius * this.radius);
    }
}

class Octree {
    constructor(boundary, capacity = 10) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }

    insert(point) {
        if (!this.boundary.contains(point)) return false;

        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) this.subdivide();

        return (
            this.northeast.insert(point) || this.northwest.insert(point) ||
            this.southeast.insert(point) || this.southwest.insert(point) ||
            this.topNortheast.insert(point) || this.topNorthwest.insert(point) ||
            this.topSoutheast.insert(point) || this.topSouthwest.insert(point)
        );
    }

    subdivide() {
        const x = this.boundary.x, y = this.boundary.y, z = this.boundary.z;
        const w = this.boundary.w / 2, h = this.boundary.h / 2, d = this.boundary.d / 2;

        this.northeast = new Octree(new Box3D(x + w, y - h, z - d, w, h, d), this.capacity);
        this.northwest = new Octree(new Box3D(x - w, y - h, z - d, w, h, d), this.capacity);
        this.southeast = new Octree(new Box3D(x + w, y + h, z - d, w, h, d), this.capacity);
        this.southwest = new Octree(new Box3D(x - w, y + h, z - d, w, h, d), this.capacity);
        this.topNortheast = new Octree(new Box3D(x + w, y - h, z + d, w, h, d), this.capacity);
        this.topNorthwest = new Octree(new Box3D(x - w, y - h, z + d, w, h, d), this.capacity);
        this.topSoutheast = new Octree(new Box3D(x + w, y + h, z + d, w, h, d), this.capacity);
        this.topSouthwest = new Octree(new Box3D(x - w, y + h, z + d, w, h, d), this.capacity);

        this.divided = true;
    }

    query(center, radius, found = []) {
        const range = new Sphere3D(center.x, center.y, center.z, radius);
        
        if (!this.boundary.intersects(range)) return found;

        for (const point of this.points) {
            if (range.contains(point)) found.push(point);
        }

        if (this.divided) {
            this.northeast.query(center, radius, found);
            this.northwest.query(center, radius, found);
            this.southeast.query(center, radius, found);
            this.southwest.query(center, radius, found);
            this.topNortheast.query(center, radius, found);
            this.topNorthwest.query(center, radius, found);
            this.topSoutheast.query(center, radius, found);
            this.topSouthwest.query(center, radius, found);
        }

        return found;
    }
}

// A* Pathfinding implementation optimized for Web Worker
class PathfindingEngine {
    constructor() {
        this.starData = null;
        this.octree = null;
        this.performanceMetrics = {
            totalCalculations: 0,
            totalTime: 0,
            averageTime: 0,
            lastCalculationTime: 0
        };
    }

    setData(starData, octreeData) {
        this.starData = starData;
        
        // Rebuild octree from serialized data
        this.octree = this.rebuildOctree(octreeData);
        
        return {
            success: true,
            starCount: starData.length,
            message: `Loaded ${starData.length} stars for pathfinding`
        };
    }

    rebuildOctree(octreeData) {
        // Create new octree with same bounds
        const octree = new Octree(
            new Box3D(
                octreeData.boundary.x, octreeData.boundary.y, octreeData.boundary.z,
                octreeData.boundary.w, octreeData.boundary.h, octreeData.boundary.d
            ),
            octreeData.capacity || 10
        );

        // Insert all stars
        this.starData.forEach(star => octree.insert(star));
        
        return octree;
    }

    distance(nodeA, nodeB) {
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dz = nodeA.z - nodeB.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    heuristic(nodeA, nodeB) {
        return this.distance(nodeA, nodeB);
    }

    findPathAStar(startNode, endNode, maxJump, options = {}) {
        const startTime = performance.now();
        
        try {
            const result = this.calculatePath(startNode, endNode, maxJump, options);
            
            const calculationTime = performance.now() - startTime;
            this.updatePerformanceMetrics(calculationTime);
            
            return {
                success: true,
                ...result,
                performanceMetrics: {
                    calculationTime,
                    ...this.performanceMetrics
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                calculationTime: performance.now() - startTime
            };
        }
    }

    calculatePath(startNode, endNode, maxJump, options) {
        const {
            maxIterations = 50000,
            timeLimit = 30000, // 30 seconds
            progressCallback = null
        } = options;

        const openSet = new PriorityQueue();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        const visited = new Set();

        // Initialize scores
        const nodeMap = new Map(this.starData.map(node => [node.name, node]));
        
        this.starData.forEach(node => {
            gScore.set(node.name, Infinity);
            fScore.set(node.name, Infinity);
        });

        gScore.set(startNode.name, 0);
        fScore.set(startNode.name, this.heuristic(startNode, endNode));
        openSet.enqueue(startNode, fScore.get(startNode.name));

        let iterations = 0;
        const algorithmStartTime = performance.now();

        while (!openSet.isEmpty() && iterations < maxIterations) {
            iterations++;

            // Check time limit
            if (performance.now() - algorithmStartTime > timeLimit) {
                throw new Error(`Pathfinding timed out after ${timeLimit}ms`);
            }

            // Progress reporting
            if (progressCallback && iterations % 1000 === 0) {
                progressCallback({
                    iterations,
                    openSetSize: openSet.size(),
                    visitedCount: visited.size,
                    timeElapsed: performance.now() - algorithmStartTime
                });
            }

            const current = openSet.dequeue();
            if (!current || visited.has(current.name)) continue;

            visited.add(current.name);

            // Check if we reached the destination
            if (current.name === endNode.name) {
                return this.reconstructPath(cameFrom, current, startNode, endNode, iterations);
            }

            // Find neighbors using optimized octree query
            const neighbors = this.octree.query(current, maxJump)
                .filter(neighbor => 
                    neighbor.name !== current.name && 
                    !visited.has(neighbor.name)
                );

            for (const neighbor of neighbors) {
                const tentativeGScore = gScore.get(current.name) + this.distance(current, neighbor);

                if (tentativeGScore < gScore.get(neighbor.name)) {
                    cameFrom.set(neighbor.name, current);
                    gScore.set(neighbor.name, tentativeGScore);
                    const newFScore = tentativeGScore + this.heuristic(neighbor, endNode);
                    fScore.set(neighbor.name, newFScore);
                    
                    openSet.enqueue(neighbor, newFScore);
                }
            }
        }

        // No path found - check if we can get close
        const closestNode = this.findClosestReachableNode(endNode, gScore, maxJump);
        if (closestNode && closestNode.name !== startNode.name) {
            return {
                path: this.reconstructPath(cameFrom, closestNode, startNode, endNode, iterations).path,
                stranded: true,
                targetReached: false,
                closestDistance: this.distance(closestNode, endNode),
                iterations,
                reason: 'Destination unreachable, found closest possible point'
            };
        }

        throw new Error(`No path found after ${iterations} iterations`);
    }

    reconstructPath(cameFrom, current, startNode, endNode, iterations) {
        const path = [current];
        let temp = current;
        
        while (cameFrom.has(temp.name)) {
            temp = cameFrom.get(temp.name);
            path.unshift(temp);
        }

        const totalDistance = this.calculatePathDistance(path);
        
        return {
            path,
            stranded: false,
            targetReached: true,
            totalDistance,
            jumps: path.length - 1,
            iterations,
            efficiency: path.length / iterations
        };
    }

    findClosestReachableNode(targetNode, gScore, maxJump) {
        let closestNode = null;
        let closestDistance = Infinity;

        for (const [nodeName, score] of gScore.entries()) {
            if (score === Infinity) continue;

            const node = this.starData.find(s => s.name === nodeName);
            if (!node) continue;

            const distanceToTarget = this.distance(node, targetNode);
            if (distanceToTarget < closestDistance) {
                closestDistance = distanceToTarget;
                closestNode = node;
            }
        }

        return closestNode;
    }

    calculatePathDistance(path) {
        let totalDistance = 0;
        for (let i = 1; i < path.length; i++) {
            totalDistance += this.distance(path[i - 1], path[i]);
        }
        return totalDistance;
    }

    updatePerformanceMetrics(calculationTime) {
        this.performanceMetrics.totalCalculations++;
        this.performanceMetrics.totalTime += calculationTime;
        this.performanceMetrics.lastCalculationTime = calculationTime;
        this.performanceMetrics.averageTime = 
            this.performanceMetrics.totalTime / this.performanceMetrics.totalCalculations;
    }

    getPerformanceReport() {
        return {
            ...this.performanceMetrics,
            dataLoaded: this.starData ? this.starData.length : 0,
            octreeBuilt: !!this.octree
        };
    }
}

// Web Worker message handling
const pathfindingEngine = new PathfindingEngine();

self.onmessage = function(event) {
    const { type, data, id } = event.data;

    try {
        let result;

        switch (type) {
            case 'setData':
                result = pathfindingEngine.setData(data.starData, data.octreeData);
                break;

            case 'findPath':
                const progressCallback = (progress) => {
                    self.postMessage({
                        type: 'progress',
                        id,
                        data: progress
                    });
                };

                result = pathfindingEngine.findPathAStar(
                    data.startNode,
                    data.endNode,
                    data.maxJump,
                    { ...data.options, progressCallback }
                );
                break;

            case 'getPerformanceReport':
                result = pathfindingEngine.getPerformanceReport();
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }

        self.postMessage({
            type: 'result',
            id,
            data: result
        });

    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
};

// Handle worker termination
self.onclose = function() {
    // Cleanup if needed
    console.log('Pathfinding worker terminated');
};