// Distances use catalog coordinates, never marker sizes or camera positions.
// AU: exact IAU 2012 definition. Parsec: (648000/pi) AU. Light-year: the
// distance light travels in one Julian year (365.25 days), using exact c.
export const AU_KM = 149597870.7;
export const AU_PER_PC = 648000 / Math.PI;
export const PC_KM = AU_KM * AU_PER_PC;
export const LY_KM = 299792.458 * 365.25 * 86400;
export const LY_PER_PC = PC_KM / LY_KM;

const spaces = Object.freeze({
    solar: Object.freeze({ unit: 'AU', kmPerUnit: AU_KM }),
    nearby: Object.freeze({ unit: 'pc', kmPerUnit: PC_KM })
});

function positionInSpace(object, space) {
    if (!object || object.space !== space) {
        throw new Error('Distance endpoints must belong to the same coordinate space');
    }
    const position = object.position;
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
        throw new Error('Distance endpoints require three finite numeric coordinates');
    }
    return position;
}

export function measureDistance(from, to, space = from?.space) {
    if (!Object.hasOwn(spaces, space)) throw new Error('Unknown exploration coordinate space');
    const a = positionInSpace(from, space);
    const b = positionInSpace(to, space);
    const nativeDistance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const definition = spaces[space];
    const km = nativeDistance * definition.kmPerUnit;
    if (!Number.isFinite(nativeDistance) || !Number.isFinite(km)) {
        throw new Error('Distance exceeds the supported numeric range');
    }
    return Object.freeze({
        space,
        nativeDistance,
        unit: definition.unit,
        km,
        au: space === 'solar' ? nativeDistance : km / AU_KM,
        pc: space === 'nearby' ? nativeDistance : km / PC_KM,
        ly: km / LY_KM
    });
}

function displayNumber(value, maximumFractionDigits) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Cannot format an invalid distance');
    if (value > 0 && value < 10 ** -maximumFractionDigits) return value.toExponential(3);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

export function formatDistance(measurement) {
    if (!measurement || !Object.hasOwn(spaces, measurement.space)) {
        throw new Error('Cannot format an unknown coordinate space');
    }
    return measurement.space === 'solar'
        ? { primary: `${displayNumber(measurement.au, 6)} AU`, secondary: `${displayNumber(measurement.km, 0)} km` }
        : { primary: `${displayNumber(measurement.pc, 4)} pc`, secondary: `${displayNumber(measurement.ly, 4)} light-years` };
}
