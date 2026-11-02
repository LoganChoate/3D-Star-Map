import { buildStarIndex } from './StarIdentity.js';

// Normalize only case, Unicode compatibility and whitespace. Punctuation and
// component suffixes are significant; no guessed astronomical aliases.
export function normalizeStarName(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export class StarLookup {
    constructor(stars, details = {}) {
        this.stars = stars;
        this.byId = buildStarIndex(stars);
        this.byName = new Map();
        this.details = new Map();
        for (const star of stars) {
            const name = normalizeStarName(star.name);
            const matches = this.byName.get(name) || [];
            matches.push(star);
            this.byName.set(name, matches);
        }
        for (const [key, entry] of Object.entries(details || {})) {
            const normalized = normalizeStarName(key);
            const matches = this.details.get(normalized) || [];
            matches.push(entry);
            this.details.set(normalized, matches);
        }
    }

    find(query) {
        const key = normalizeStarName(query);
        if (!key) return [];
        const byId = this.byId.get(key);
        return byId ? [byId] : (this.byName.get(key) || []).slice();
    }

    search(query, limit = 10) {
        const key = normalizeStarName(query);
        if (!key) return [];
        const exact = this.find(key);
        if (exact.length) return exact.slice(0, limit);
        return this.stars.filter(star => normalizeStarName(star.name).includes(key) ||
            normalizeStarName(star.id).includes(key)).slice(0, limit);
    }

    describe(star) {
        const canonical = star && this.byId.get(star.id);
        if (!canonical) return null;
        const idEntries = this.details.get(normalizeStarName(canonical.id));
        if (idEntries?.length === 1) return idEntries[0];
        const name = normalizeStarName(canonical.name);
        // Name-only prose cannot identify which member of a duplicate-name
        // pair it describes. Leave it unassigned until explicit ID evidence exists.
        if (this.byName.get(name)?.length !== 1) return null;
        const entries = this.details.get(name);
        return entries?.length === 1 ? entries[0] : null;
    }

    label(star) {
        if (!star) return '';
        if (this.byName.get(normalizeStarName(star.name))?.length > 1) {
            const distance = Number.isFinite(star.dist) ? ` · ${star.dist.toFixed(2)} pc` : '';
            return `${star.name} · ${star.id}${distance}`;
        }
        return star.name;
    }
}
