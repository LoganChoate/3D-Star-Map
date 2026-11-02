import { buildStarIndex } from './StarIdentity.js';

export const DISTANCE_SENTINEL_PC = 100000;
export const hasUnresolvedDistance = star => star?.catalogMetadata?.quality?.distanceStatus === 'missing-or-dubious-parallax';

export async function sha256Bytes(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}

export async function verifyCatalogBytes(bytes,expected,label) {
    if(!/^[a-f0-9]{64}$/.test(expected || '') || await sha256Bytes(bytes)!==expected) {
        throw new Error(`${label} does not match the scientific catalog manifest`);
    }
}

// Attach sidecar data by source identity, never array index or display name.
// Validation finishes before mutation, so incomplete metadata cannot partially
// change the catalog's quality policy.
export function attachCatalogMetadata(stars,payload,manifest) {
    if(payload?.schemaVersion!==1 || manifest?.schemaVersion!==1 || !Array.isArray(payload.records)) throw new Error('Unsupported scientific catalog schema');
    if(manifest.source?.dataset!=='HYG Database' || manifest.source?.version!=='4.2' || manifest.source?.versionVerification?.status!=='verified-byte-match') throw new Error('Scientific catalog source is not the verified HYG snapshot');
    if(manifest.coordinates?.epoch!=='J2000.0' || manifest.coordinates?.equinox!=='J2000.0' || manifest.coordinates?.units?.position!=='pc' || JSON.stringify(manifest.coordinates?.appAxisMap)!==JSON.stringify(['X','Z','-Y'])) throw new Error('Unsupported catalog coordinate conventions');
    const index=buildStarIndex(stars),metadataIndex=buildStarIndex(payload.records);
    if(index.size!==metadataIndex.size || manifest.runtimeCatalog?.records!==index.size) throw new Error('Scientific metadata does not cover the runtime catalog');
    for(const star of stars) {
        const metadata=metadataIndex.get(star.id);
        if(!metadata || !Array.isArray(metadata.quality?.flags) || metadata.uncertainty!==null) throw new Error(`Missing or invalid scientific metadata for ${star.id}`);
        if(!['x','y','z','dist','mag','ci'].every(key=>Number.isFinite(star[key])) || star.dist<0) throw new Error(`Invalid numeric catalog values for ${star.id}`);
        const expected=star.id==='sol'?'origin':star.dist>=DISTANCE_SENTINEL_PC?'missing-or-dubious-parallax':'catalog-distance';
        if(metadata.quality.distanceStatus!==expected) throw new Error(`Distance quality disagrees with source convention for ${star.id}`);
        if(star.id!=='sol' && star.id!==`hyg:${metadata.sourceId}`) throw new Error(`Source identity mismatch for ${star.id}`);
        if(star.id==='sol' && metadata.sourceId!==null) throw new Error('The canonical Sun must remain a defined origin, not an observational source row');
        if(!metadata.identifiers || typeof metadata.identifiers!=='object') throw new Error(`Missing cross-identifications for ${star.id}`);
    }
    for(const star of stars)star.catalogMetadata=metadataIndex.get(star.id);
    return {records:index.size,unresolvedDistances:stars.filter(hasUnresolvedDistance).length,manifest};
}

export function catalogQualityLabel(star) {
    if(star?.id==='sol')return 'Defined origin; canonical Sun metadata';
    const quality=star?.catalogMetadata?.quality;
    if(!quality)return 'Source quality not available';
    const labels=[];
    if(hasUnresolvedDistance(star))labels.push('Distance unresolved: missing or dubious parallax; position is a placeholder');
    else labels.push('Retained catalog position; accuracy is not certified');
    if(quality.flags.includes('spherical-cartesian-mismatch'))labels.push('RA/Dec and Cartesian fields disagree beyond the rounding diagnostic');
    labels.push('Measurement uncertainty not supplied by HYG');
    return labels.join('. ');
}

export function catalogIdentifierLabel(star) {
    const ids=star?.catalogMetadata?.identifiers;
    if(!ids)return star.id;
    return [star.id,...['hip','hd','hr'].filter(key=>ids[key]!==null && ids[key]!==undefined && ids[key]!=='').map(key=>`${key.toUpperCase()} ${ids[key]}`),ids.gl || null].filter(Boolean).join(' · ');
}
