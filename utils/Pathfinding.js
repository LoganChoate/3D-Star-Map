import { buildStarIndex, requireStarId } from './StarIdentity.js';
import { PathfindingPriorityQueue } from './BinaryHeap.js';

export function starDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// The worker and main-thread fallback execute this exact production algorithm.
export function findRoute(stars, octree, startNode, endNode, maxJump, options = {}, knownIndex = null) {
    if (!Number.isFinite(maxJump) || maxJump <= 0) throw new Error('Maximum jump distance must be finite and positive');
    if (!octree || typeof octree.query !== 'function') throw new Error('Spatial index is not initialized');
    const index = knownIndex || buildStarIndex(stars);
    const start = index.get(requireStarId(startNode));
    const end = index.get(requireStarId(endNode));
    if (!start || !end) throw new Error('Route endpoint ID is not in the catalog');
    const maxIterations = options.maxIterations ?? 50000;
    const timeLimit = options.timeLimit ?? 10000;
    if (!Number.isInteger(maxIterations) || maxIterations <= 0 || !Number.isFinite(timeLimit) || timeLimit <= 0) {
        throw new Error('Pathfinding limits must be positive');
    }
    const startTime = performance.now();
    const open = new PathfindingPriorityQueue();
    const cameFrom = new Map();
    const scores = new Map([[start.id, 0]]);
    const visited = new Set();
    open.enqueue(start, starDistance(start, end));
    let closest = start;
    let closestDistance = starDistance(start, end);
    let iterations = 0;
    const reconstruct = (current, stranded) => {
        const path = [current];
        while (cameFrom.has(current.id)) {
            current = cameFrom.get(current.id);
            path.unshift(current);
        }
        return { path, stranded, targetReached: !stranded, totalDistance: scores.get(path[path.length - 1].id), jumps: path.length - 1, iterations };
    };
    while (!open.isEmpty()) {
        if (++iterations > maxIterations) throw new Error('Pathfinding exceeded maximum iterations');
        if (performance.now() - startTime > timeLimit) throw new Error('Pathfinding timed out');
        const current = open.dequeue();
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.id === end.id) return reconstruct(current, false);
        for (const candidate of octree.query(current, maxJump)) {
            const neighbor = index.get(requireStarId(candidate));
            if (!neighbor) throw new Error('Spatial index contains an unknown star ID');
            if (visited.has(neighbor.id)) continue;
            const distance = starDistance(current, neighbor);
            if (!Number.isFinite(distance)) throw new Error('Route contains invalid coordinates');
            // Guard index boundary rounding; a rendered route never exceeds its jump limit.
            if (distance > maxJump) continue;
            const tentative = scores.get(current.id) + distance;
            if (tentative < (scores.get(neighbor.id) ?? Infinity)) {
                cameFrom.set(neighbor.id, current);
                scores.set(neighbor.id, tentative);
                const remaining = starDistance(neighbor, end);
                open.enqueue(neighbor, tentative + remaining);
                if (remaining < closestDistance) {
                    closest = neighbor;
                    closestDistance = remaining;
                }
            }
        }
        if (options.progressCallback && iterations % 1000 === 0) {
            options.progressCallback({ iterations, openSetSize: open.getSize(), visitedCount: visited.size, timeElapsed: performance.now() - startTime });
        }
    }
    return closest.id === start.id ? null : reconstruct(closest, true);
}
