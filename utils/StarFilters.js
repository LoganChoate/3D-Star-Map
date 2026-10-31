// The production filter used by the application and its regression checks.
// Preserve input order and object identity: geometry indices refer to this list.
export function filterStars(stars, {
    includeGarbageSphere = false,
    maxDistance = Infinity,
    maxSize = Infinity,
    spectralClasses = [],
    properNamesOnly = false
} = {}) {
    const allowedClasses = new Set(spectralClasses.map(value => String(value).toUpperCase()));
    return stars.filter(star => {
        if (!includeGarbageSphere && star.isGarbageSphere) return false;
        if (star.dist > maxDistance || star.relativeRadiusScale > maxSize) return false;
        if (properNamesOnly && !(typeof star.proper === 'string' && star.proper.trim())) return false;
        const spectralClass = String(star.spect || 'G').charAt(0).toUpperCase();
        if (allowedClasses.size && !allowedClasses.has(spectralClass)) return false;
        return true;
    });
}
