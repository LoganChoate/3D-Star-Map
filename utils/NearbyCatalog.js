// These collections reuse the verified, fixed-epoch HYG catalog already loaded
// by the atlas. They do not add source rows or claim a complete stellar census.
export const NEARBY_COLLECTIONS = Object.freeze({
    highlights: Object.freeze({
        label: 'Highlights',
        radiusPc: null,
        selectionNote: 'Twelve curated stars and the Sun. A selection from retained HYG v4.2 records, not a complete census.'
    }),
    '5pc': Object.freeze({
        label: 'Within 5 pc',
        radiusPc: 5,
        selectionNote: 'Retained HYG v4.2 stars with catalog distance greater than zero and at most 5 pc, plus the Sun. Only entries with catalog distances are included. Five source rows within this radius are absent from the legacy atlas because their color index is missing. This is not a complete census; positions remain at epoch/equinox J2000.0 and uncertainties are unknown.'
    })
});

const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const requireIdentity = body => {
    if (!body || typeof body.id !== 'string' || !body.id.trim()) throw new Error('Nearby objects require stable string IDs');
    if (body.id !== 'sol' && !/^hyg:\d+$/.test(body.id)) throw new Error(`Unsupported nearby catalog identity: ${body.id}`);
    return body.id;
};
const requirePosition = body => {
    if (!Array.isArray(body.position) || body.position.length !== 3 || !body.position.every(Number.isFinite)) throw new Error(`Nearby object needs three finite coordinates: ${body.id}`);
};
const requireMetadata = source => {
    const metadata = source.catalogMetadata;
    if (!metadata || metadata.id !== source.id || !metadata.quality || !Array.isArray(metadata.quality.flags) || metadata.uncertainty !== null) throw new Error(`Nearby source metadata is missing or invalid: ${source.id}`);
    if (`hyg:${metadata.sourceId}` !== source.id) throw new Error(`Nearby source identity disagrees with metadata: ${source.id}`);
};

// Display names remain untouched so the existing name/ID search keeps its
// semantics. Captions distinguish repeated names on lists, labels and selectors.
function withDisplayLabels(objects) {
    const counts = new Map();
    for (const body of objects) counts.set(normalize(body.name), (counts.get(normalize(body.name)) || 0) + 1);
    const labelled = objects.map(body => ({
        ...body,
        displayLabel: counts.get(normalize(body.name)) > 1 ? `${body.name} · ${body.id === 'sol' ? 'sol' : `HYG ${body.id.slice(4)}`}` : body.name
    }));
    // A source name can itself contain an ID-looking suffix. Resolve any such
    // caption collision using all involved stable IDs without changing names.
    const captions = new Map();
    for (const body of labelled) captions.set(normalize(body.displayLabel), (captions.get(normalize(body.displayLabel)) || 0) + 1);
    return labelled.map(body => captions.get(normalize(body.displayLabel)) > 1 ? { ...body, displayLabel: `${body.displayLabel} [${body.id}]` } : body);
}

export const nearbyDisplayLabel = body => body?.displayLabel || body?.name || body?.id || '';

export function buildNearbyCollection(fullStarData, curatedNearbyObjects, collection = 'highlights') {
    if (!Object.hasOwn(NEARBY_COLLECTIONS, collection)) throw new Error(`Unknown nearby collection: ${collection}`);
    if (!Array.isArray(fullStarData) || !Array.isArray(curatedNearbyObjects)) throw new Error('Nearby collections require catalog and curated arrays');
    const curatedById = new Map();
    for (const body of curatedNearbyObjects) {
        const id = requireIdentity(body);
        if (curatedById.has(id)) throw new Error(`Duplicate nearby identity: ${id}`);
        requirePosition(body);
        if (typeof body.name !== 'string' || !body.name.trim()) throw new Error(`Nearby object needs a display name: ${id}`);
        if (id !== 'sol') requireMetadata(body);
        curatedById.set(id, body);
    }
    const sun = curatedById.get('sol');
    if (!sun || !sun.position.every(value => value === 0)) throw new Error('Nearby collection requires the canonical Sun at the exact origin');

    let objects;
    if (collection === 'highlights') {
        // Startup retains its small curated collection: no second full-catalog
        // map, set or scan is needed after the atlas has verified identities.
        objects = curatedNearbyObjects.map(body => ({ ...body, position: body.position.slice() }));
    } else {
        const selected = [];
        const selectedIds = new Set(['sol']);
        for (const source of fullStarData) {
            if (source?.id === 'sol' || !Number.isFinite(source?.dist) || source.dist <= 0 || source.dist > 5) continue;
            if (!source.catalogMetadata?.quality) throw new Error(`Nearby source metadata is missing: ${source.id}`);
            if (source.catalogMetadata.quality.distanceStatus !== 'catalog-distance') continue;
            const id = requireIdentity(source);
            if (selectedIds.has(id)) throw new Error(`Duplicate nearby identity: ${id}`);
            selectedIds.add(id);
            requireMetadata(source);
            if (![source.x, source.y, source.z, source.mag].every(Number.isFinite)) throw new Error(`Nearby source has nonfinite coordinates or magnitude: ${id}`);
            if (typeof source.name !== 'string' || !source.name.trim()) throw new Error(`Nearby source needs a display name: ${id}`);
            const curated = curatedById.get(id);
            selected.push({
                ...source, ...(curated || {}),
                id, space: 'nearby', kind: 'Star',
                position: [source.x, source.y, source.z],
                catalogName: source.name,
                catalogMetadata: source.catalogMetadata,
                distancePc: source.dist,
                spectralType: source.spect,
                apparentMagnitude: source.mag,
                description: curated?.description || 'Retained HYG v4.2 catalog entry at epoch/equinox J2000.0. No proper-motion propagation is applied; measurement uncertainty is not supplied.'
            });
        }
        selected.sort((a, b) => a.distancePc - b.distancePc || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        objects = [{ ...sun, position: sun.position.slice() }, ...selected];
    }
    const definition = NEARBY_COLLECTIONS[collection];
    return {
        collection,
        label: definition.label,
        radiusPc: definition.radiusPc,
        selectionNote: definition.selectionNote,
        objects: withDisplayLabels(objects),
        starCount: objects.length - 1
    };
}
