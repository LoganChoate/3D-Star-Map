// Acceptance scenarios executed against the application's actual UI, catalog,
// geometry, raycaster and worker. No replacement application implementations.
import * as THREE from '../vendor/three/build/three.module.js';

export async function verifyInteractions() {
    const { renderer, ui, routes } = window.galaxyMap;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const all = renderer.fullStarData;
    const initialCamera = renderer.camera.position.clone();
    const initialTarget = renderer.controls.target.clone();
    const results = {};
    const ids = all.map(star => star.id);
    check(ids.every(id => typeof id === 'string' && (id === 'sol' || /^hyg:\d+$/.test(id))), 'All runtime records need source-backed IDs');
    check(new Set(ids).size === all.length, 'All runtime IDs must be unique');
    results.catalog = { records: all.length, uniqueIds: new Set(ids).size, solId: all.find(star => star.name === 'Sol').id };
    const named = document.getElementById('proper-name-filter');
    const distance = document.getElementById('distance-slider');
    const size = document.getElementById('size-slider');
    const spectral = [...document.querySelectorAll('.filter-checkbox[name^="spectral-"]')];
    const search = document.getElementById('search-input');
    const resetFilters = async () => {
        named.checked = false;
        distance.value = distance.max;
        size.value = size.max;
        spectral.forEach(box => { box.checked = false; });
        named.dispatchEvent(new Event('change', { bubbles: true }));
        await frame();
    };
    await resetFilters();
    const initialCount = renderer.starsMesh.geometry.getAttribute('position').count;
    search.value = '  sIrIuS  ';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 1650));
    const sirius = all.find(star => star.name === 'Sirius');
    check(ui.selectedStar?.id === sirius.id, 'Mixed-case, padded search must select Sirius');
    check(document.getElementById('star-name').dataset.starId === sirius.id, 'Object panel must expose the selected ID');
    check(ui.originalNarrationText.length > 40 && /sirius/i.test(ui.originalNarrationText), 'Sirius description must be found case-insensitively');
    check(!document.getElementById('star-description-container').classList.contains('hidden'), 'Description must be visible');
    results.description = { id: sirius.id, characters: ui.originalNarrationText.length, normalizedSearch: true };

    // Selecting an object, then excluding it, must clear all stale selection UI.
    distance.value = '1';
    const selectedDistance = Number(distance.value); // Range inputs snap to their configured step.
    check(selectedDistance < sirius.dist, 'Selected distance must exclude Sirius');
    distance.dispatchEvent(new Event('input', { bubbles: true }));
    await frame();
    check(!ui.selectedStar, 'Filtered-out selection must be cleared');
    check(!routes.routePlanner.currentSelection, 'Filtered-out route selection must be cleared');
    check(document.getElementById('star-name').textContent === 'N/A', 'Filtered-out name must not linger');
    check(!ui.originalNarrationText, 'Filtered-out narration must not linger');
    check(renderer.starsMesh.geometry.getAttribute('position').count === ui.activeStarData.length, 'Picking array must track filtered geometry');
    check(ui.activeStarData.every(star => star.dist <= selectedDistance), 'Distance input must actually filter');
    check(ui.searchById(sirius.id) === false && !ui.selectedStar, 'Hidden search result must not select an invisible object');
    check(/hidden/i.test(document.getElementById('search-not-found').textContent), 'Hidden search needs an explicit explanation');
    results.selectionCleared = { maxDistance: selectedDistance, count: ui.activeStarData.length, hiddenSearchRejected: true, panelCleared: true };

    await resetFilters();
    named.checked = true;
    named.dispatchEvent(new Event('change', { bubbles: true }));
    await frame();
    check(ui.activeStarData.length > 0 && ui.activeStarData.length < initialCount, 'Proper-name checkbox must reduce visible catalog');
    check(ui.activeStarData.every(star => typeof star.proper === 'string' && star.proper.trim()), 'Proper-name filter must use catalog proper-name data');
    ui.selectStar(sirius, { focusCamera: false });
    check(ui.selectedStar?.id === sirius.id, 'Visible selection should work after filtering');
    const namedCount = ui.activeStarData.length;
    const mFilter = spectral.find(box => box.value === 'M');
    mFilter.checked = true;
    mFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await frame();
    check(!ui.selectedStar, 'Spectral filtering must also clear excluded selection');
    check(ui.activeStarData.every(star => String(star.spect || 'G').toUpperCase().startsWith('M')), 'Spectral checkbox must update the real geometry data');
    results.namedAndSpectralFilters = { namedCount, mNamedCount: ui.activeStarData.length };

    // Pick from real filtered geometry after projecting visible points. The
    // expected object comes from the same ordered vertices, not the old array.
    mFilter.checked = false;
    mFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await frame();
    renderer.camera.position.set(sirius.x, sirius.y, sirius.z + 20);
    renderer.controls.target.set(sirius.x, sirius.y, sirius.z);
    renderer.camera.lookAt(renderer.controls.target);
    renderer.camera.updateMatrixWorld(true);
    renderer.starsMesh.updateMatrixWorld(true);
    const rect = ui.elements.canvas.getBoundingClientRect();
    const probe = new THREE.Raycaster();
    probe.params.Points.threshold = ui.raycaster.params.Points.threshold;
    let candidate;
    for (const star of ui.activeStarData) {
        const projected = new THREE.Vector3(star.x, star.y, star.z).project(renderer.camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 0.85 || Math.abs(projected.y) > 0.85) continue;
        probe.setFromCamera(new THREE.Vector2(projected.x, projected.y), renderer.camera);
        const hit = probe.intersectObject(renderer.starsMesh)[0];
        if (hit && all[hit.index]?.id !== ui.activeStarData[hit.index].id) {
            candidate = { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2, index: hit.index, id: ui.activeStarData[hit.index].id };
            break;
        }
    }
    check(candidate, 'Need a real projected point whose filtered index differs from the original catalog');
    // The main-process harness sends Chromium mouse input so OrbitControls
    // receives a real active pointer, including native pointer capture.
    window.__verificationPointer = { x: Math.round(candidate.x), y: Math.round(candidate.y) };
    const pointerDeadline = performance.now() + 5000;
    while (window.__verificationPointer && performance.now() < pointerDeadline) await frame();
    check(!window.__verificationPointer, 'Native verification click must finish');
    check(ui.selectedStar?.id === candidate.id, 'Real canvas picking must select the current filtered ID with canvas offset');
    results.filteredPicking = { expectedId: candidate.id, selectedId: ui.selectedStar.id, index: candidate.index, canvasTop: rect.top };
    await new Promise(resolve => setTimeout(resolve, 1650));

    await resetFilters();
    const pair = all.filter(star => star.name === '61 Cyg');
    check(pair.length === 2 && pair[0].id !== pair[1].id, 'Real duplicate display-name pair must remain distinct');
    search.value = '61 Cyg';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(!ui.selectedStar, 'Ambiguous name must not silently choose first star');
    const suggestions = [...document.querySelectorAll('.suggestion-item')];
    check(suggestions.length === 2 && new Set(suggestions.map(button => button.dataset.starId)).size === 2, 'Duplicate suggestions must expose both unique IDs');
    const secondButton = suggestions.find(button => button.dataset.starId === pair[1].id);
    check(secondButton, 'Second duplicate suggestion must be independently selectable');
    secondButton.click();
    check(ui.selectedStar?.id === pair[1].id, 'Second duplicate suggestion must select its exact ID');
    await new Promise(resolve => setTimeout(resolve, 1650));
    results.duplicateSearch = { ids: pair.map(star => star.id), selectedSecond: ui.selectedStar.id, ambiguousNameRequiresChoice: true };

    const maxJump = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y, pair[1].z - pair[0].z) + 0.001;
    const fallback = routes.findPathAStar(pair[0], pair[1], maxJump);
    check(fallback && !fallback.stranded && fallback.path.length === 2, 'Duplicate-name endpoints must form a real two-object fallback route');
    check(fallback.path[0].id === pair[0].id && fallback.path[1].id === pair[1].id, 'Fallback route must retain both endpoint IDs');
    const worker = await routes.calculateRouteWithWorker(pair[0], pair[1], maxJump);
    check(worker && !worker.stranded && worker.path.length === 2, 'Real worker must connect duplicate-name endpoints');
    check(worker.path.every((star, i) => star.id === fallback.path[i].id), 'Worker and fallback must agree on endpoint identities');
    check(worker.path.every(star => all.includes(star)), 'Worker results must resolve to canonical catalog objects');
    results.duplicateRoute = { name: '61 Cyg', ids: worker.path.map(star => star.id), maxJump, workerAndFallbackAgree: true, canonicalObjects: true };

    ui.elements.toggleRoutePlannerButton.click();
    check(routes.routePlanner.active, 'Route planner button must activate the planner');
    ui.selectStar(pair[0], { focusCamera: false });
    ui.elements.setStartButton.click();
    ui.selectStar(pair[1], { focusCamera: false });
    ui.elements.setEndButton.click();
    ui.elements.maxJumpRangeInput.value = String(maxJump);
    ui.elements.calculateRouteButton.click();
    const deadline = performance.now() + 10000;
    while (ui.elements.calculateRouteButton.disabled && performance.now() < deadline) await frame();
    check(!ui.elements.calculateRouteButton.disabled, 'Actual route button must finish');
    const activeRoute = routes.getActiveRoute();
    check(activeRoute.calculatedRoute?.map(star => star.id).join() === pair.map(star => star.id).join(), 'Route buttons must retain the two selected identities');
    check(activeRoute.routeLine && renderer.scene.children.includes(activeRoute.routeLine), 'Calculated route must be displayed in the actual scene');
    results.routePlannerButtons = { ids: activeRoute.calculatedRoute.map(star => star.id), visibleRouteLine: true };
    ui.selectStar(sirius, { focusCamera: false });
    ui.elements.setEndButton.click();
    check(!activeRoute.calculatedRoute && !activeRoute.routeLine, 'Changing an endpoint must remove the old displayed route');
    results.routePlannerButtons.changedEndpointClearsOldPath = true;
    routes.clearAllRoutes();
    ui.elements.toggleRoutePlannerButton.click();
    check(!document.querySelector('.app-notification.error'), 'No application error after interaction checks');
    await resetFilters();
    ui.selectStar(sirius, { focusCamera: false });
    renderer.camera.position.copy(initialCamera);
    renderer.controls.target.copy(initialTarget);
    renderer.controls.update();
    await frame();
    return results;
}
