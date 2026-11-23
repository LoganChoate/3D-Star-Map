// A presentation-only projection of retained catalog fields. Never invent
// physical parameters or reuse unaudited name-keyed prose as spoken fact.
const UNAVAILABLE = 'Not available in the loaded catalog';
const LY_PER_PC = 3.2615637771674337;
const number = (value, unit = '', digits = 4) => Number.isFinite(value)
    ? `${new Intl.NumberFormat('en-US', {maximumFractionDigits: digits}).format(value)}${unit ? ` ${unit}` : ''}` : UNAVAILABLE;
const text = value => typeof value === 'string' && value.trim() ? value.trim() : UNAVAILABLE;
const field = (label, value) => ({label, value});
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function createInspectionDossier(input, {catalog = null, canonicalStar = null} = {}) {
    if (!input || typeof input.id !== 'string' || !input.id.trim()) throw new TypeError('Inspection requires a stable object ID');
    const solar = catalog?.solar?.objects?.find(object => object.id === input.id);
    const body = solar || input;
    const isSolar = !!solar || input.space === 'solar' || input.id.startsWith('solar:') || input.id === 'sol';
    const star = canonicalStar?.id === input.id ? canonicalStar : input;
    const metadata = star.catalogMetadata;
    const retainedDistance = star.dist ?? star.distancePc;
    const unresolved = !isSolar && (metadata?.quality?.distanceStatus === 'missing-or-dubious-parallax' || retainedDistance >= 100000);
    const title = text(body.name || star.name || input.id);
    const kind = text(body.kind || (isSolar && input.id !== 'sol' ? null : 'Star'));
    const spectral = text(star.spect || star.spectralType);
    const distance = isSolar ? (vector(body.position) ? Math.hypot(...body.position) : input.id === 'sol' ? 0 : null) : retainedDistance;
    const position = isSolar ? body.position : [star.x,star.y,star.z];
    const coordinates = unresolved ? 'Unresolved distance; stored position is a placeholder' : vector(position) ? position.map(n => number(n,'',9)).join(' · ') : UNAVAILABLE;
    const epoch = isSolar ? catalog?.solar?.epochLabel : catalog?.nearby?.epochLabel || 'J2000.0; no proper-motion propagation';
    const frame = isSolar ? catalog?.solar?.frame : 'HYG heliocentric J2000 axes remapped for the app: [X, Z, -Y]';
    const ids = metadata?.identifiers || {};
    const identifiers = Object.entries(ids).filter(([,v]) => v !== null && v !== undefined && v !== '').map(([key,value]) => field(key.toUpperCase(),String(value)));
    const quality = isSolar ? 'Retained historical body-center snapshot; no current ephemeris implied.' : unresolved
        ? 'Distance unresolved: missing or dubious parallax. Do not interpret the placeholder as a measured distance.'
        : 'Retained HYG catalog values; uncertainty is not supplied and accuracy is not certified.';
    const summaryParts = [`${title} is listed as ${kind.toLowerCase()} in the loaded catalog.`];
    if (input.id === 'sol') summaryParts.push('The Sun defines the origin of the Solar System and nearby-star views.');
    else if (unresolved) summaryParts.push('Its distance is unresolved in this catalog, so no physical distance is asserted.');
    else if (Number.isFinite(distance)) summaryParts.push(isSolar
        ? `At the retained historical snapshot, its center is ${number(distance,'astronomical units')} from the Sun.`
        : `Its retained catalog distance is ${number(distance,'parsecs')}, approximately ${number(distance*LY_PER_PC,'light-years')}.`);
    if (!isSolar && spectral !== UNAVAILABLE) summaryParts.push(`The catalog spectral classification is ${spectral}.`);
    if (Number.isFinite(body.radiusKm)) summaryParts.push(`Its ${body.radiusDefinition || 'catalog radius'} is ${number(body.radiusKm,'kilometers',1)}.`);
    if (!isSolar) summaryParts.push('Measurement uncertainty and current surface activity are not available in the loaded catalog.');
    else summaryParts.push('Map positions are historical, not live.');
    const visualKind = input.id === 'sol' ? 'sun' : input.id === 'solar:moon' ? 'moon' : input.id === 'solar:earth' ? 'earth' : null;
    const visualNote = input.id === 'solar:earth' ? 'Historical NASA map composites with illustrative cloud evolution, accelerated globe rotation and a review camera. This is not live weather or the current orientation of Earth.'
        : visualKind ? 'Inspection appearance and motion do not represent a live observation.'
        : 'Detailed visual unavailable. This is a catalog information view; no surface appearance is inferred.';
    const rawSources = [...(body.sources || []),...(isSolar ? catalog?.solar?.sources || [] : catalog?.nearby?.sources || [{label:'HYG catalog documentation',url:'https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md'}])];
    const sources = [...new Map(rawSources.filter(source => {try{return new URL(source.url).protocol === 'https:';}catch{return false;}}).map(source=>[source.url,{label:source.label || 'Source',url:source.url}])).values()];
    return {
        id:input.id,title,kind,visualKind,visualNote,summary:summaryParts.join(' '),narrationText:summaryParts.join(' '),sources,
        groups:[
            {title:'Identity',fields:[field('Catalog ID',input.id),field('Object type',kind),field('Catalog name',text(star.catalogName || body.name)),...identifiers]},
            {title:'Physical and observed properties',fields:[field(body.radiusDefinition || 'Physical radius',number(body.radiusKm,'km',1)),field('Spectral classification',spectral),field('Apparent magnitude',number(star.mag ?? star.apparentMagnitude,'mag')),field('Color index B−V',number(star.ci,'mag')),field('Effective temperature',UNAVAILABLE),field('Mass',UNAVAILABLE),field('Current surface activity',UNAVAILABLE)]},
            {title:'Position and distance',fields:[field(isSolar ? 'Body-center separation from Sun (derived)' : 'Retained catalog distance',unresolved ? 'Unresolved; placeholder excluded' : number(distance,isSolar ? 'AU' : 'pc')),field('Distance in light-years (converted)',isSolar ? UNAVAILABLE : unresolved ? 'Unresolved; placeholder excluded' : number(Number.isFinite(distance)?distance*LY_PER_PC:null,'ly')),field(`Coordinates (${isSolar?'AU':'pc'})`,coordinates),field('Coordinate frame',text(frame)),field('Epoch',text(epoch))]},
            {title:'Sources and limitations',fields:[field('Quality',quality),field('Catalog quality flags',metadata?.quality?.flags?.join('; ') || UNAVAILABLE),field('Measurement uncertainty',UNAVAILABLE),field('Description basis','Summary of the loaded catalog; legacy descriptive essays are not used as verified narration.'),field('Appearance',visualNote)]}
        ]
    };
}
