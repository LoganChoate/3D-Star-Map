// Diagnostic-only, in-memory candidate trials. Inject after the three unchanged
// baseline runs and phase5-benchmark-renderer.js. No production files are edited.
(() => {
  const { renderer: atlas, explorer, ui } = window.galaxyMap;
  const benchmark = window.__phase5Benchmark;
  const check = (value, message) => { if (!value) throw new Error(message); };
  check(benchmark?.rendered, 'The render-call benchmark observer must be attached first');
  const original = {
    nearbyObjects: explorer.nearbyObjects,
    allObjects: explorer.allObjects,
    sun: explorer.nearbyObjects.find(body => body.id === 'sol'),
    curated: new Map(explorer.nearbyObjects.filter(body => body.id !== 'sol').map(body => [body.id, body]))
  };
  const expected = {
    5: { stars: 56, idHash: 'af1bea70d0acecbc8c1c065f7abbecdc269bb5b7a91a28507ce8fc985ec320c2' },
    10: { stars: 278, idHash: 'b9196fbb14c702367d572caa1a62051688af55c18b502149c1a6d0a257041eab' }
  };
  const sourceIndex = ui.lookup.byId;
  check(sourceIndex instanceof Map && sourceIndex.size === atlas.fullStarData.length, 'Reuse the installed lookup index without allocating a second full-catalog map');
  const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  const idHash = ids => sha256(new TextEncoder().encode(JSON.stringify(ids)));
  const coordinateHash = () => {
    const values = new Float64Array(atlas.fullStarData.length * 3);
    atlas.fullStarData.forEach((star, i) => values.set([star.x, star.y, star.z], i * 3));
    return sha256(values.buffer);
  };
  let sourceCoordinateHash = null;
  let radiusPc = null;
  let selectedSources = [];

  async function initializeValidationReference() {
    if (sourceCoordinateHash === null) sourceCoordinateHash = await coordinateHash();
    return { records: atlas.fullStarData.length, sourceCoordinatesFloat64Sha256: sourceCoordinateHash };
  }

  const twoRendered = async () => {
    await benchmark.rendered();
    return benchmark.rendered();
  };
  const duplicateCaptions = elements => {
    const names = new Map();
    elements.forEach(element => {
      const text = element.textContent.trim();
      const id = element.dataset.objectId || element.dataset.searchObjectId || element.value;
      if (!id) return;
      if (!names.has(text)) names.set(text, []);
      names.get(text).push(id);
    });
    return [...names].filter(([, ids]) => ids.length > 1).map(([caption, ids]) => ({ caption, ids }));
  };

  async function validate() {
    check(expected[radiusPc], 'Install a supported candidate before validating it');
    check(explorer.currentMode === 'nearby', 'Candidate validation requires its nearby view');
    const stars = explorer.nearbyObjects.filter(body => body.id !== 'sol');
    const ids = stars.map(body => body.id);
    check(stars.length === expected[radiusPc].stars, 'Candidate star count must match the independent source inventory');
    check(new Set(explorer.nearbyObjects.map(body => body.id)).size === stars.length + 1, 'Candidate identities must be unique');
    const actualIdHash = await idHash(ids);
    check(actualIdHash === expected[radiusPc].idHash, 'Candidate membership and order must match the independent source inventory');
    check(explorer.nearbyObjects[0] === original.sun, 'Reuse the existing canonical Sun and its metadata without mutation');
    check(original.sun.position.every(value => value === 0), 'Canonical Sun remains the exact origin');
    check(explorer.allObjects.length === explorer.solarObjects.length + stars.length, 'Cross-view search must contain every candidate star');
    const geometry = explorer.points.geometry.getAttribute('position');
    check(geometry.count === stars.length + 1, 'Every candidate identity needs one rendered vertex');
    check(explorer.labels.length === geometry.count, 'Production label collection must contain each candidate');
    for (let i = 0; i < explorer.nearbyObjects.length; i++) {
      const body = explorer.nearbyObjects[i];
      check(body.position.every((value, axis) => Math.fround(value) === geometry.array[i * 3 + axis]), 'Rendered vertex must preserve source position at Float32 precision');
      if (body.id === 'sol') continue;
      const source = sourceIndex.get(body.id);
      check(body !== source && body.position.every((value, axis) => Object.is(value, [source.x, source.y, source.z][axis])), 'Candidate must copy exact source coordinates without mutating the atlas object');
      check(body.catalogMetadata === source.catalogMetadata, 'Candidate must retain verified source metadata by identity');
      check(body.distancePc === source.dist && body.spectralType === source.spect && body.apparentMagnitude === source.mag, 'Candidate panel fields must use original source values');
      const curated = original.curated.get(body.id);
      if (curated) check(body.name === curated.name && body.description === curated.description, 'Existing curated names and descriptions must be preserved');
    }
    for (const which of ['from', 'to']) {
      const values = [...document.getElementById(`ex-measure-${which}`).options].map(option => option.value).filter(Boolean);
      check(values.length === stars.length + 1 && new Set(values).size === values.length, 'Every measurement choice must have a distinct stable ID');
    }
    const actualCoordinateHash = await coordinateHash();
    check(actualCoordinateHash === sourceCoordinateHash, 'The complete installed atlas coordinates must remain unchanged');
    const points = explorer.nearbyObjects.map(body => explorer.worldPosition(body).project(explorer.camera));
    const insideClip = points.filter(point => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1).length;
    return {
      radiusPc, selectionField: 'HYG catalog dist; 0 < dist <= radiusPc; catalog-distance quality',
      stars: stars.length, displayObjects: stars.length + 1, idListSha256: actualIdHash,
      sourceCoordinatesFloat64Sha256: actualCoordinateHash, allAtlasCoordinatesUnchanged: true,
      canonicalSunObjectReused: true, curatedDescriptionsPreserved: original.curated.size,
      labels: explorer.labels.length, pointsInsideCurrentClip: insideClip,
      sourceQualityFlags: stars.reduce((counts, body) => { body.catalogMetadata.quality.flags.forEach(flag => counts[flag] = (counts[flag] || 0) + 1); return counts; }, {}),
      duplicateListCaptions: duplicateCaptions([...document.querySelectorAll('#ex-object-list button')]),
      duplicateMeasurementCaptions: duplicateCaptions([...document.getElementById('ex-measure-from').options]),
      limitation: 'Diagnostic candidate only. Repeated-name captions in the unmodified UI may be ambiguous; stable ID values remain distinct. This is a retained HYG subset, not a complete census.'
    };
  }

  async function install(radius, options = {}) {
    check(Object.hasOwn(expected, radius), 'Only the independently inventoried 5 pc and 10 pc candidates are supported');
    check(atlas.fullStarData.length === 117735, 'Trial requires the unchanged accepted full catalog');
    if (sourceCoordinateHash === null) await initializeValidationReference();
    const preparationStart = performance.now();
    radiusPc = Number(radius);
    selectedSources = atlas.fullStarData.filter(star => star.id !== 'sol' && star.dist > 0 && star.dist <= radiusPc && star.catalogMetadata?.quality.distanceStatus === 'catalog-distance');
    selectedSources.sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const candidateStars = selectedSources.map(source => {
      const curated = original.curated.get(source.id);
      return {
        ...source, ...(curated || {}), space: 'nearby', kind: 'Star',
        position: [source.x, source.y, source.z], catalogName: source.name,
        distancePc: source.dist, spectralType: source.spect, apparentMagnitude: source.mag,
        catalogMetadata: source.catalogMetadata,
        description: curated?.description || 'Retained HYG v4.2 catalog entry at epoch/equinox J2000.0. This subset is not a complete census or a current-position prediction.'
      };
    });
    const preparationMs = performance.now() - preparationStart;
    const constructionStart = performance.now();
    explorer.setMode('atlas');
    explorer.nearbyObjects = [original.sun, ...candidateStars];
    explorer.allObjects = [...explorer.solarObjects, ...candidateStars];
    explorer.setMode('nearby');
    explorer.canvas.focus();
    const synchronousConstructionMs = performance.now() - constructionStart;
    const renderedAt = await twoRendered();
    // Memory trials capture their snapshot before allocating validation buffers.
    // Initialize the reference before measuring the original 13-object view,
    // then explicitly validate after the 13/57/279-object memory observations.
    let result = { radiusPc, stars: candidateStars.length, displayObjects: candidateStars.length + 1, validationDeferred: options.validate === false };
    if (options.validate !== false) {
      result = { ...result, ...await validate() };
      check(result.pointsInsideCurrentClip === result.displayObjects, 'Production frame-all must include every candidate marker');
    }
    return {
      ...result, preparationMs, synchronousConstructionMs,
      nextTwoCompletedRenderCallsMs: renderedAt - constructionStart,
      timingScope: 'Candidate filtering/copy preparation and actual existing view construction; hashing and validation occur outside the timed construction interval. Existing full atlas remains loaded.'
    };
  }

  async function action(name, perform, assertion) {
    const start = performance.now();
    perform();
    const dispatchMs = performance.now() - start;
    const renderedAt = await twoRendered();
    return { name, synchronousDispatchMs: dispatchMs, nextTwoCompletedRenderCallsMs: renderedAt - start, result: assertion() };
  }

  async function interactions() {
    check(expected[radiusPc], 'Install a candidate before exercising it');
    explorer.setMode('nearby');
    const outcomes = { selections: [], duplicateSearch: null, measurement: null, modeChanges: [] };
    for (const source of [selectedSources.find(star => !original.curated.has(star.id)), selectedSources.at(-1)]) {
      check(source, 'Candidate must contain additional stars');
      outcomes.selections.push(await action(`select:${source.id}`, () => explorer.selectObject(source.id), () => {
        check(explorer.selectedObject?.id === source.id && document.getElementById('ex-object-name').dataset.objectId === source.id, 'Selected detail identity must match the requested new star');
        check(document.getElementById('ex-catalog-identifiers').textContent.includes(source.id), 'Selected source panel must retain its stable ID');
        return { id: source.id, name: explorer.selectedObject.name };
      }));
    }
    const beforeSearch = explorer.selectedObject.id;
    let matches;
    outcomes.duplicateSearch = await action('search:61 Cyg', () => { matches = explorer.search('61 Cyg', true); }, () => {
      const ids = matches.map(body => body.id).sort();
      check(JSON.stringify(ids) === JSON.stringify(['hyg:103879', 'hyg:103883']), '61 Cyg must return both distinct catalog identities');
      check(explorer.selectedObject.id === beforeSearch, 'Ambiguous exact name must not silently select one component');
      const buttons = [...document.querySelectorAll('#ex-search-results button')];
      check(buttons.length === 2 && new Set(buttons.map(button => button.dataset.searchObjectId)).size === 2, 'Ambiguous search must offer both stable identity values');
      return { ids, previousSelectionPreserved: true, duplicateVisibleCaptions: duplicateCaptions(buttons) };
    });
    for (const id of ['hyg:103879', 'hyg:103883']) {
      outcomes.selections.push(await action(`select:duplicate:${id}`, () => explorer.selectObject(id, { focus: false }), () => {
        check(explorer.selectedObject.id === id && document.getElementById('ex-object-name').dataset.objectId === id, 'Duplicate-name components must remain individually selectable');
        return { id, name: explorer.selectedObject.name };
      }));
    }
    const farthest = selectedSources.at(-1);
    outcomes.measurement = await action(`measure:sol-to-${farthest.id}`, () => {
      for (const [which, id] of [['from', 'sol'], ['to', farthest.id]]) {
        const element = document.getElementById(`ex-measure-${which}`);
        element.value = id;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, () => {
      const result = explorer.measurement.result;
      const expectedPc = Math.hypot(farthest.x, farthest.y, farthest.z);
      check(explorer.measurement.from.id === 'sol' && explorer.measurement.to.id === farthest.id, 'Measurement endpoints must retain selected IDs');
      check(result && result.space === 'nearby' && Math.abs(result.pc - expectedPc) < 1e-12 && explorer.measurementLine, 'Production measurement must match the exact retained Cartesian separation');
      return { from: 'sol', to: farthest.id, measuredPc: result.pc, catalogDistancePc: farthest.dist, expectedCoordinateSeparationPc: expectedPc };
    });
    for (const mode of ['solar', 'nearby', 'atlas', 'nearby']) {
      outcomes.modeChanges.push(await action(`mode:${mode}`, () => document.getElementById(`ex-mode-${mode}`).click(), () => {
        check(explorer.currentMode === mode, 'Existing mode button must activate requested view');
        const expectedCount = mode === 'solar' ? 10 : expected[radiusPc].stars + 1;
        if (mode !== 'atlas') check(explorer.points.geometry.getAttribute('position').count === expectedCount, 'Mode switch must build the right identity population');
        if (mode === 'nearby') check(explorer.measurement.result === null, 'Cross-mode switch must clear prior measurement');
        return { mode, count: mode === 'atlas' ? atlas.starsMesh.geometry.getAttribute('position').count : explorer.objects.length };
      }));
    }
    explorer.setPreset('all');
    explorer.canvas.focus();
    await twoRendered();
    outcomes.finalValidation = await validate();
    return outcomes;
  }

  async function restore() {
    explorer.setMode('atlas');
    explorer.nearbyObjects = original.nearbyObjects;
    explorer.allObjects = original.allObjects;
    explorer.setMode('nearby');
    explorer.canvas.focus();
    await twoRendered();
    check(explorer.objects.length === 13 && explorer.nearbyObjects === original.nearbyObjects, 'Original curated view must be restored');
    check(sourceCoordinateHash === null || await coordinateHash() === sourceCoordinateHash, 'Trial must leave full atlas coordinates unchanged');
    radiusPc = null;
    selectedSources = [];
    return { restored: true, objects: 13, allAtlasCoordinatesUnchanged: true };
  }

  window.__phase5Candidates = { initializeValidationReference, install, validate, interactions, restore };
})();
