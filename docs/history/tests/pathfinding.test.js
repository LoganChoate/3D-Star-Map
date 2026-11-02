// Tests for A* pathfinding algorithm and RouteManager
const runner = require('./test-runner.js');

// Mock Three.js for Node.js environment
global.THREE = {
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
        normalize() { 
            const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
            if (len > 0) { this.x /= len; this.y /= len; this.z /= len; }
            return this;
        }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    },
    Color: class { constructor() {} },
    Scene: class { constructor() { this.children = []; } add() {} remove() {} },
    Mesh: class { constructor() {} },
    SphereGeometry: class { constructor() {} },
    MeshBasicMaterial: class { constructor() {} },
    CanvasTexture: class { constructor() {} },
    PlaneGeometry: class { constructor() {} }
};

// Import Octree classes from main script
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

// Priority Queue implementation from RouteManager
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

// Mock RouteManager with minimal pathfinding logic
class MockRouteManager {
    constructor() {
        this.fullStarData = null;
        this.starOctree = null;
    }

    setData(fullStarData, starOctree) {
        this.fullStarData = fullStarData;
        this.starOctree = starOctree;
    }

    distance(nodeA, nodeB) {
        return Math.sqrt(Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2) + Math.pow(nodeA.z - nodeB.z, 2));
    }

    heuristic(nodeA, nodeB) {
        return this.distance(nodeA, nodeB);
    }

    findPathAStar(startNode, endNode, maxJump) {
        // Simplified version for testing
        const openSet = new PriorityQueue();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const nodeMap = new Map(this.fullStarData.map(node => [node.name, node]));
        
        this.fullStarData.forEach(node => {
            gScore.set(node.name, Infinity);
            fScore.set(node.name, Infinity);
        });

        gScore.set(startNode.name, 0);
        fScore.set(startNode.name, this.heuristic(startNode, endNode));
        openSet.enqueue(startNode, fScore.get(startNode.name));

        let iterations = 0;
        const MAX_ITERATIONS = 1000; // Lower for tests

        while (!openSet.isEmpty() && iterations < MAX_ITERATIONS) {
            iterations++;
            const current = openSet.dequeue();
            if (!current) break;

            if (current.name === endNode.name) {
                // Path found, reconstruct it
                const totalPath = [current];
                let temp = current;
                while (cameFrom.has(temp.name)) {
                    temp = cameFrom.get(temp.name);
                    totalPath.unshift(temp);
                }
                return { path: totalPath, stranded: false };
            }

            // Use the Octree to find neighbors efficiently
            const neighbors = this.starOctree.query(current, maxJump).filter(n => n.name !== current.name);

            for (const neighbor of neighbors) {
                if (!neighbor || !neighbor.name) continue;

                const tentativeGScore = gScore.get(current.name) + this.distance(current, neighbor);
                if (tentativeGScore < gScore.get(neighbor.name)) {
                    cameFrom.set(neighbor.name, current);
                    gScore.set(neighbor.name, tentativeGScore);
                    fScore.set(neighbor.name, tentativeGScore + this.heuristic(neighbor, endNode));
                    openSet.enqueue(neighbor, fScore.get(neighbor.name));
                }
            }
        }

        return null; // No path found
    }
}

// Test data
function createTestStars() {
    return [
        { name: 'Star A', x: 0, y: 0, z: 0 },
        { name: 'Star B', x: 5, y: 0, z: 0 },
        { name: 'Star C', x: 10, y: 0, z: 0 },
        { name: 'Star D', x: 0, y: 5, z: 0 },
        { name: 'Star E', x: 5, y: 5, z: 0 },
        { name: 'Star F', x: 10, y: 5, z: 0 },
        { name: 'Isolated', x: 100, y: 100, z: 100 }
    ];
}

function createTestOctree(stars) {
    const bounds = new Box3D(50, 50, 50, 60, 60, 60);
    const octree = new Octree(bounds);
    stars.forEach(star => octree.insert(star));
    return octree;
}

// Tests
describe('A* Pathfinding Algorithm', () => {
    test('PriorityQueue basic operations', () => {
        const pq = new PriorityQueue();
        assert(pq.isEmpty(), 'Queue should start empty');

        pq.enqueue('low', 1);
        pq.enqueue('high', 3);
        pq.enqueue('medium', 2);

        assertEqual(pq.dequeue(), 'low', 'Should dequeue lowest priority first');
        assertEqual(pq.dequeue(), 'medium', 'Should dequeue medium priority second');
        assertEqual(pq.dequeue(), 'high', 'Should dequeue highest priority last');
        assert(pq.isEmpty(), 'Queue should be empty after dequeuing all elements');
    });

    test('Distance calculation', () => {
        const routeManager = new MockRouteManager();
        const starA = { x: 0, y: 0, z: 0 };
        const starB = { x: 3, y: 4, z: 0 };
        
        const distance = routeManager.distance(starA, starB);
        assertEqual(distance, 5, 'Distance should be 5 (3-4-5 triangle)');
    });

    test('Pathfinding with direct connection', () => {
        const stars = createTestStars();
        const octree = createTestOctree(stars);
        const routeManager = new MockRouteManager();
        routeManager.setData(stars, octree);

        const result = routeManager.findPathAStar(stars[0], stars[1], 10); // Star A to Star B

        assert(result !== null, 'Should find a path');
        assert(result.path.length >= 2, 'Path should have at least 2 stars');
        assertEqual(result.path[0].name, 'Star A', 'Path should start at Star A');
        assertEqual(result.path[result.path.length - 1].name, 'Star B', 'Path should end at Star B');
        assert(!result.stranded, 'Should not be stranded for direct connection');
    });

    test('Pathfinding with multiple hops', () => {
        const stars = createTestStars();
        const octree = createTestOctree(stars);
        const routeManager = new MockRouteManager();
        routeManager.setData(stars, octree);

        const result = routeManager.findPathAStar(stars[0], stars[2], 6); // Star A to Star C, max jump 6

        assert(result !== null, 'Should find a path');
        assert(result.path.length >= 2, 'Path should have at least 2 stars');
        assertEqual(result.path[0].name, 'Star A', 'Path should start at Star A');
        assertEqual(result.path[result.path.length - 1].name, 'Star C', 'Path should end at Star C');
    });

    test('Pathfinding with insufficient range', () => {
        const stars = createTestStars();
        const octree = createTestOctree(stars);
        const routeManager = new MockRouteManager();
        routeManager.setData(stars, octree);

        const result = routeManager.findPathAStar(stars[0], stars[6], 5); // Star A to Isolated, max jump 5

        // Should either return null or a stranded path
        if (result !== null) {
            assert(result.stranded, 'Should be stranded when destination is unreachable');
        }
    });

    test('Heuristic function properties', () => {
        const routeManager = new MockRouteManager();
        const starA = { x: 0, y: 0, z: 0 };
        const starB = { x: 3, y: 4, z: 0 };
        const starC = { x: 6, y: 8, z: 0 };

        const hAB = routeManager.heuristic(starA, starB);
        const hBC = routeManager.heuristic(starB, starC);
        const hAC = routeManager.heuristic(starA, starC);

        // Heuristic should be consistent (triangle inequality)
        assert(hAC <= hAB + hBC, 'Heuristic should satisfy triangle inequality');
        
        // Heuristic should be symmetric
        const hBA = routeManager.heuristic(starB, starA);
        assertEqual(hAB, hBA, 'Heuristic should be symmetric');
    });

    test('Empty star data handling', () => {
        const routeManager = new MockRouteManager();
        routeManager.setData([], new Octree(new Box3D(0, 0, 0, 10, 10, 10)));

        const starA = { name: 'Star A', x: 0, y: 0, z: 0 };
        const starB = { name: 'Star B', x: 5, y: 0, z: 0 };

        const result = routeManager.findPathAStar(starA, starB, 10);
        assertEqual(result, null, 'Should return null for empty star data');
    });

    test('Self-pathfinding (same start and end)', () => {
        const stars = createTestStars();
        const octree = createTestOctree(stars);
        const routeManager = new MockRouteManager();
        routeManager.setData(stars, octree);

        const result = routeManager.findPathAStar(stars[0], stars[0], 10); // Star A to Star A

        assert(result !== null, 'Should find a path to self');
        assertEqual(result.path.length, 1, 'Path to self should have length 1');
        assertEqual(result.path[0].name, 'Star A', 'Path should contain only the start star');
    });
});

runner.run();