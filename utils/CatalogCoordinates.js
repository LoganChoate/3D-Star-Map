// HYG's equatorial axes are X=RA 0h, Y=RA 6h, Z=north pole.
// The atlas applies a rigid, right-handed rotation to make celestial north Y-up.
// These functions do not propagate epoch, apply proper motion, or mix frames.
function finiteVector(position) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
        throw new TypeError('Coordinates must be an array of three finite numbers');
    }
    return position;
}

export function equatorialToApp(position) {
    const [x, y, z] = finiteVector(position);
    return [x, z, -y];
}

export function appToEquatorial(position) {
    const [x, y, z] = finiteVector(position);
    return [x, -z, y];
}

export function sphericalToEquatorial({raHours, decDegrees, distancePc} = {}) {
    if (![raHours, decDegrees, distancePc].every(Number.isFinite)) {
        throw new TypeError('RA, declination and distance must be finite numbers');
    }
    if (raHours < 0 || raHours >= 24) throw new RangeError('RA must be in [0, 24) hours');
    if (decDegrees < -90 || decDegrees > 90) throw new RangeError('Declination must be in [-90, 90] degrees');
    if (distancePc < 0) throw new RangeError('Distance must be nonnegative parsecs');
    const alpha = raHours * Math.PI / 12;
    const delta = decDegrees * Math.PI / 180;
    const radiusInPlane = distancePc * Math.cos(delta);
    const vector = [radiusInPlane * Math.cos(alpha), radiusInPlane * Math.sin(alpha), distancePc * Math.sin(delta)];
    return finiteVector(vector);
}
