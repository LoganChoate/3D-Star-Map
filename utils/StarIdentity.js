// Identity belongs to a source record, never to its display label or array index.
export function requireStarId(star) {
    if (!star || typeof star.id !== 'string' || !star.id.trim()) {
        throw new Error('Star data is missing a stable string id');
    }
    return star.id;
}

export function buildStarIndex(stars) {
    if (!Array.isArray(stars)) throw new Error('Star data must be an array');
    const index = new Map();
    for (const star of stars) {
        const id = requireStarId(star);
        if (index.has(id)) throw new Error(`Duplicate star id: ${id}`);
        index.set(id, star);
    }
    return index;
}
