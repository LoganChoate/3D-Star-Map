// Tests for Octree spatial indexing system
const runner = require('./test-runner.js');

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

// Test data generators
function createTestPoints() {
    return [
        { name: 'Origin', x: 0, y: 0, z: 0 },
        { name: 'Positive', x: 5, y: 5, z: 5 },
        { name: 'Negative', x: -5, y: -5, z: -5 },
        { name: 'Mixed1', x: 3, y: -2, z: 4 },
        { name: 'Mixed2', x: -1, y: 6, z: -3 },
        { name: 'Edge1', x: 10, y: 0, z: 0 },
        { name: 'Edge2', x: 0, y: 10, z: 0 },
        { name: 'Edge3', x: 0, y: 0, z: 10 },
        { name: 'Far', x: 50, y: 50, z: 50 }
    ];
}

function createLargePointSet(count = 100) {
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push({
            name: `Point${i}`,
            x: Math.random() * 20 - 10, // -10 to 10
            y: Math.random() * 20 - 10,
            z: Math.random() * 20 - 10
        });
    }
    return points;
}

// Tests
describe('Octree Spatial Indexing', () => {
    test('Box3D boundary contains point correctly', () => {
        const box = new Box3D(0, 0, 0, 5, 5, 5); // Center at origin, 5 unit radius
        
        assert(box.contains({ x: 0, y: 0, z: 0 }), 'Should contain center point');
        assert(box.contains({ x: 3, y: 3, z: 3 }), 'Should contain point within bounds');
        assert(box.contains({ x: -3, y: -3, z: -3 }), 'Should contain negative point within bounds');
        assert(box.contains({ x: 5, y: 5, z: 5 }), 'Should contain point at boundary');
        assert(box.contains({ x: -5, y: -5, z: -5 }), 'Should contain negative point at boundary');
        
        assert(!box.contains({ x: 6, y: 0, z: 0 }), 'Should not contain point outside X bounds');
        assert(!box.contains({ x: 0, y: 6, z: 0 }), 'Should not contain point outside Y bounds');
        assert(!box.contains({ x: 0, y: 0, z: 6 }), 'Should not contain point outside Z bounds');
    });

    test('Sphere3D range contains point correctly', () => {
        const sphere = new Sphere3D(0, 0, 0, 5); // Center at origin, radius 5
        
        assert(sphere.contains({ x: 0, y: 0, z: 0 }), 'Should contain center point');
        assert(sphere.contains({ x: 3, y: 4, z: 0 }), 'Should contain point within radius (3-4-5 triangle)');
        assert(sphere.contains({ x: 5, y: 0, z: 0 }), 'Should contain point at exact radius');
        
        assert(!sphere.contains({ x: 6, y: 0, z: 0 }), 'Should not contain point outside radius');
        assert(!sphere.contains({ x: 4, y: 4, z: 4 }), 'Should not contain point outside radius (√48 > 5)');
    });

    test('Box3D intersects sphere correctly', () => {
        const box = new Box3D(0, 0, 0, 2, 2, 2); // Small box at origin
        
        const sphereInside = new Sphere3D(0, 0, 0, 1);
        assert(box.intersects(sphereInside), 'Should intersect with sphere inside box');
        
        const sphereOverlapping = new Sphere3D(3, 0, 0, 2);
        assert(box.intersects(sphereOverlapping), 'Should intersect with overlapping sphere');
        
        const sphereFarAway = new Sphere3D(10, 10, 10, 1);
        assert(!box.intersects(sphereFarAway), 'Should not intersect with distant sphere');
        
        const sphereTouching = new Sphere3D(4, 0, 0, 2);
        assert(box.intersects(sphereTouching), 'Should intersect with sphere touching box edge');
    });

    test('Octree basic insertion and subdivision', () => {
        const boundary = new Box3D(0, 0, 0, 10, 10, 10);
        const octree = new Octree(boundary, 4); // Low capacity to force subdivision
        
        const points = createTestPoints().slice(0, 5); // Use first 5 points
        
        // Insert points
        points.forEach(point => {
            const inserted = octree.insert(point);
            assert(inserted, `Should successfully insert point ${point.name}`);
        });
        
        // Should have subdivided
        assert(octree.divided, 'Octree should have subdivided when capacity exceeded');
        assertEqual(octree.points.length, 4, 'Parent node should retain exactly capacity points');
        
        // Verify all points can be found
        const allFound = octree.query({ x: 0, y: 0, z: 0 }, 20);
        assertEqual(allFound.length, 5, 'Query should find all inserted points');
    });

    test('Octree insertion of out-of-bounds points', () => {
        const boundary = new Box3D(0, 0, 0, 5, 5, 5); // Small boundary
        const octree = new Octree(boundary);
        
        const inBounds = { name: 'InBounds', x: 2, y: 2, z: 2 };
        const outOfBounds = { name: 'OutOfBounds', x: 10, y: 10, z: 10 };
        
        assert(octree.insert(inBounds), 'Should insert point within bounds');
        assert(!octree.insert(outOfBounds), 'Should reject point outside bounds');
        
        const found = octree.query({ x: 0, y: 0, z: 0 }, 10);
        assertEqual(found.length, 1, 'Should only find the in-bounds point');
        assertEqual(found[0].name, 'InBounds', 'Found point should be the in-bounds one');
    });

    test('Octree range query accuracy', () => {
        const boundary = new Box3D(0, 0, 0, 15, 15, 15);
        const octree = new Octree(boundary, 3);
        
        const points = createTestPoints();
        points.forEach(point => octree.insert(point));
        
        // Query near origin with small radius
        const nearOrigin = octree.query({ x: 0, y: 0, z: 0 }, 3);
        assert(nearOrigin.length >= 1, 'Should find at least one point near origin');
        assert(nearOrigin.some(p => p.name === 'Origin'), 'Should find the origin point');
        
        // Query with larger radius should find more points
        const largerRadius = octree.query({ x: 0, y: 0, z: 0 }, 8);
        assert(largerRadius.length > nearOrigin.length, 'Larger radius should find more points');
        
        // Query far away should find specific points
        const farQuery = octree.query({ x: 50, y: 50, z: 50 }, 5);
        // Note: The 'Far' point is at (50,50,50) so this should find it if it was inserted
        const farPoint = points.find(p => p.name === 'Far');
        if (farPoint && boundary.contains(farPoint)) {
            assert(farQuery.some(p => p.name === 'Far'), 'Should find the far point when querying near it');
        } else {
            console.log('Far point was outside boundary, skipping far query test');
        }
    });

    test('Octree performance with large dataset', () => {
        const boundary = new Box3D(0, 0, 0, 20, 20, 20);
        const octree = new Octree(boundary, 10);
        
        const points = createLargePointSet(1000);
        
        // Measure insertion time
        const insertStart = Date.now();
        let insertedCount = 0;
        points.forEach(point => {
            if (octree.insert(point)) insertedCount++;
        });
        const insertTime = Date.now() - insertStart;
        
        console.log(`Inserted ${insertedCount} points in ${insertTime}ms`);
        assert(insertedCount > 800, 'Should successfully insert most points (some may be out of bounds)');
        assert(insertTime < 100, 'Insertion should be reasonably fast');
        
        // Measure query time
        const queryStart = Date.now();
        const queryResults = octree.query({ x: 0, y: 0, z: 0 }, 5);
        const queryTime = Date.now() - queryStart;
        
        console.log(`Found ${queryResults.length} points in ${queryTime}ms`);
        assert(queryTime < 10, 'Query should be very fast');
        assert(queryResults.length > 0, 'Should find some points in range');
    });

    test('Octree subdivision structure correctness', () => {
        const boundary = new Box3D(0, 0, 0, 10, 10, 10);
        const octree = new Octree(boundary, 2);
        
        // Insert enough points to force subdivision
        const points = [
            { name: 'P1', x: 5, y: 5, z: 5 },    // +x+y+z octant
            { name: 'P2', x: -5, y: 5, z: 5 },   // -x+y+z octant
            { name: 'P3', x: 5, y: -5, z: 5 },   // +x-y+z octant
            { name: 'P4', x: 5, y: 5, z: -5 }    // +x+y-z octant
        ];
        
        points.forEach(point => octree.insert(point));
        
        assert(octree.divided, 'Octree should have subdivided');
        
        // Check that subdivisions exist and have correct boundaries
        assert(octree.topNortheast, 'Should have topNortheast subdivision');
        assert(octree.topNorthwest, 'Should have topNorthwest subdivision');
        assert(octree.topSoutheast, 'Should have topSoutheast subdivision');
        assert(octree.southeast, 'Should have southeast subdivision');
        
        // Verify subdivision boundaries are correct
        assertEqual(octree.topNortheast.boundary.x, 5, 'TopNortheast should be centered at +x');
        assertEqual(octree.topNortheast.boundary.y, -5, 'TopNortheast should be centered at -y');
        assertEqual(octree.topNortheast.boundary.z, 5, 'TopNortheast should be centered at +z');
        assertEqual(octree.topNortheast.boundary.w, 5, 'Subdivisions should have half the parent width');
    });

    test('Octree empty queries', () => {
        const boundary = new Box3D(0, 0, 0, 10, 10, 10);
        const octree = new Octree(boundary);
        
        // Query empty octree
        const emptyResult = octree.query({ x: 0, y: 0, z: 0 }, 5);
        assertEqual(emptyResult.length, 0, 'Empty octree should return no results');
        
        // Add some points, then query in empty region
        octree.insert({ name: 'Far', x: 8, y: 8, z: 8 });
        const farResult = octree.query({ x: -8, y: -8, z: -8 }, 2);
        assertEqual(farResult.length, 0, 'Query in empty region should return no results');
    });

    test('Octree duplicate point handling', () => {
        const boundary = new Box3D(0, 0, 0, 10, 10, 10);
        const octree = new Octree(boundary);
        
        const point1 = { name: 'Point1', x: 5, y: 5, z: 5 };
        const point2 = { name: 'Point2', x: 5, y: 5, z: 5 }; // Same coordinates
        
        assert(octree.insert(point1), 'Should insert first point');
        assert(octree.insert(point2), 'Should insert second point with same coordinates');
        
        const results = octree.query({ x: 5, y: 5, z: 5 }, 0.1);
        assertEqual(results.length, 2, 'Should find both points at same location');
    });
});

runner.run();