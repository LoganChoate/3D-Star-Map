// Octree implementation for spatial queries
export class Octree {
    constructor(boundary, capacity = 10, depth = 0) {
        this.boundary = boundary;
        if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Octree capacity must be a positive integer");
        this.capacity = capacity;
        this.depth = depth;
        this.points = [];
        this.divided = false;
    }

    insert(point) {
        if (![point.x, point.y, point.z].every(Number.isFinite) || !this.boundary.contains(point)) {
            return false;
        }

        // Coincident objects retain distinct identities; bounded depth keeps an overflow bucket.
        if (this.points.length < this.capacity || this.depth >= 32) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        return (
            this.northeast.insert(point) ||
            this.northwest.insert(point) ||
            this.southeast.insert(point) ||
            this.southwest.insert(point) ||
            this.topNortheast.insert(point) ||
            this.topNorthwest.insert(point) ||
            this.topSoutheast.insert(point) ||
            this.topSouthwest.insert(point)
        );
    }

    subdivide() {
        const x = this.boundary.x;
        const y = this.boundary.y;
        const z = this.boundary.z;
        const w = this.boundary.w / 2;
        const h = this.boundary.h / 2;
        const d = this.boundary.d / 2;

        this.northeast = new Octree(new Box3D(x + w, y - h, z - d, w, h, d), this.capacity, this.depth + 1);
        this.northwest = new Octree(new Box3D(x - w, y - h, z - d, w, h, d), this.capacity, this.depth + 1);
        this.southeast = new Octree(new Box3D(x + w, y + h, z - d, w, h, d), this.capacity, this.depth + 1);
        this.southwest = new Octree(new Box3D(x - w, y + h, z - d, w, h, d), this.capacity, this.depth + 1);
        this.topNortheast = new Octree(new Box3D(x + w, y - h, z + d, w, h, d), this.capacity, this.depth + 1);
        this.topNorthwest = new Octree(new Box3D(x - w, y - h, z + d, w, h, d), this.capacity, this.depth + 1);
        this.topSoutheast = new Octree(new Box3D(x + w, y + h, z + d, w, h, d), this.capacity, this.depth + 1);
        this.topSouthwest = new Octree(new Box3D(x - w, y + h, z + d, w, h, d), this.capacity, this.depth + 1);

        this.divided = true;
    }

    query(center, radius, found = []) {
        const range = new Sphere3D(center.x, center.y, center.z, radius);

        if (!this.boundary.intersects(range)) {
            return found;
        }

        for (const point of this.points) {
            if (range.contains(point)) {
                found.push(point);
            }
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

export class Box3D {
    constructor(x, y, z, w, h, d) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        this.h = h;
        this.d = d;
    }

    contains(point) {
        return (
            point.x >= this.x - this.w &&
            point.x <= this.x + this.w &&
            point.y >= this.y - this.h &&
            point.y <= this.y + this.h &&
            point.z >= this.z - this.d &&
            point.z <= this.z + this.d
        );
    }

    intersects(sphere) {
        const dx = Math.max(0, Math.max(this.x - this.w - sphere.x, sphere.x - (this.x + this.w)));
        const dy = Math.max(0, Math.max(this.y - this.h - sphere.y, sphere.y - (this.y + this.h)));
        const dz = Math.max(0, Math.max(this.z - this.d - sphere.z, sphere.z - (this.z + this.d)));
        return (dx * dx + dy * dy + dz * dz) <= (sphere.radius * sphere.radius);
    }
}

export class Sphere3D {
    constructor(x, y, z, radius) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.radius = radius;
    }

    contains(point) {
        const dx = this.x - point.x;
        const dy = this.y - point.y;
        const dz = this.z - point.z;
        return (dx * dx + dy * dy + dz * dz) <= (this.radius * this.radius);
    }
}

