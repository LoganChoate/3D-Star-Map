import { buildStarIndex } from '../utils/StarIdentity.js';
import { findRoute } from '../utils/Pathfinding.js';
import { Box3D, Octree } from '../utils/SpatialIndex.js';

// The module worker executes the same production algorithm and spatial index as
// the fallback. Structured-clone identities are resolved back to the catalog.
let stars = null;
let index = null;
let octree = null;
let calculations = 0;
let totalTime = 0;
self.onmessage = function(event) {
    const { type, data, id } = event.data;
    try {
        let result;
        if (type === 'setData') {
            const nextIndex = buildStarIndex(data.starData);
            const b = data.octreeData.boundary;
            if (![b.x, b.y, b.z, b.w, b.h, b.d].every(Number.isFinite) || b.w < 0 || b.h < 0 || b.d < 0) {
                throw new Error('Invalid spatial index bounds');
            }
            const nextOctree = new Octree(new Box3D(b.x, b.y, b.z, b.w, b.h, b.d), data.octreeData.capacity || 10);
            for (const star of data.starData) {
                if (!nextOctree.insert(star)) throw new Error(`Star ${star.id} has invalid or out-of-bounds coordinates`);
            }
            stars = data.starData;
            index = nextIndex;
            octree = nextOctree;
            result = { success: true, starCount: stars.length };
        } else if (type === 'findPath') {
            if (!stars || !octree) throw new Error('Pathfinding catalog is not initialized');
            const start = performance.now();
            const options = { ...data.options, progressCallback: progress => self.postMessage({type:'progress', id, data:progress}) };
            result = findRoute(stars, octree, data.startNode, data.endNode, data.maxJump, options, index);
            calculations++;
            totalTime += performance.now() - start;
        } else if (type === 'getPerformanceReport') {
            result = {totalCalculations:calculations, totalTime, averageTime:calculations ? totalTime/calculations : 0, dataLoaded:stars?.length || 0, octreeBuilt:!!octree};
        } else {
            throw new Error(`Unknown message type: ${type}`);
        }
        self.postMessage({ type:'result', id, data:result });
    } catch (error) {
        self.postMessage({ type:'error', id, error:{message:error.message} });
    }
};
