import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

let scene, camera, renderer, stars, controls, flyControls, activeControls, raycaster, mouse;
let fullStarData = [];
let activeStarData = [];
let selectionHighlight = null;
let constellationLinesGroup = null;
let initialCameraPosition = new THREE.Vector3(0, 20, 100);
let isDragging = false;
const clock = new THREE.Clock();
const pointerDownPosition = new THREE.Vector2();
let stellarTour = {
    active: false,
    timer: null,
    targetStar: null,
    state: 'idle' // 'idle', 'traveling', 'orbiting'
};
let routePlanner = {
    active: false,
    startStar: null,
    endStar: null,
    currentSelection: null,
    routeLine: null
};
let animationFrameId;
let maxDistWithGarbage, maxDistWithoutGarbage;

let originalNarrationText = ''; // Holds the clean text for the current selection

// Constants for star sizing
const SOL_ABSOLUTE_MAGNITUDE = 4.83; // Absolute magnitude of the Sun
const BASE_STAR_RADIUS = 1.0; // Base radius for the THREE.SphereGeometry
const GLOBAL_VISUAL_SCALE = 0.5; // Aggressively reduced scale for clarity in dense core
let loadingIndicator, canvas, starCountDisplay, constellationSelect, searchInput, autocompleteContainer, distanceSlider, distanceValue, sizeSlider, sizeValue, narrateButton, starDescriptionContainer, starDescription, stellarTourButton, toggleRoutePlannerButton, routePlannerContainer, setStartButton, setEndButton, routeStartStar, routeEndStar, maxJumpRangeInput, calculateRouteButton, routeButtonsContainer;

function init() {
    // Assign DOM elements once the document is ready
    loadingIndicator = document.getElementById('loading-indicator');
    canvas = document.getElementById('renderCanvas');
    starCountDisplay = document.getElementById('star-count-display');
    constellationSelect = document.getElementById('constellation-select');
    searchInput = document.getElementById('search-input');
    autocompleteContainer = document.getElementById('autocomplete-suggestions');
    distanceSlider = document.getElementById('distance-slider');
    distanceValue = document.getElementById('distance-value');
    sizeSlider = document.getElementById('size-slider');
    sizeValue = document.getElementById('size-value');
    narrateButton = document.getElementById('narrate-button');
    starDescriptionContainer = document.getElementById('star-description-container');
    starDescription = document.getElementById('star-description');
    stellarTourButton = document.getElementById('stellar-tour-button');
    toggleRoutePlannerButton = document.getElementById('toggle-route-planner-button');
    routePlannerContainer = document.getElementById('route-planner-container');
    setStartButton = document.getElementById('set-start-button');
    setEndButton = document.getElementById('set-end-button');
    routeStartStar = document.getElementById('route-start-star');
    routeEndStar = document.getElementById('route-end-star');
    maxJumpRangeInput = document.getElementById('max-jump-range');
    calculateRouteButton = document.getElementById('calculate-route-button');
    routeButtonsContainer = document.getElementById('route-buttons-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    const canvasContainer = document.getElementById('canvasContainer');
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 400000); 
    // Initial camera position will be set after data is loaded to provide an overview.

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 2000; // Default, will be updated dynamically after data load
    controls.target.set(0, 0, 0);

    flyControls = new FlyControls(camera, renderer.domElement);
    flyControls.movementSpeed = 150; // parsecs per second
    flyControls.rollSpeed = Math.PI / 3; // Increased for faster mouse turning
    flyControls.autoForward = false;
    flyControls.dragToLook = true; // Use mouse drag to look, similar to OrbitControls
    flyControls.enabled = false;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    raycaster.params.Points.threshold = 0.5;

    constellationLinesGroup = new THREE.Group();
    scene.add(constellationLinesGroup);

    // Create a single, reusable highlight object as a 2D ring that always faces the camera.
    const highlightGeometry = new THREE.RingGeometry(0.95, 1.0, 32); // A thin ring
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00, side: THREE.DoubleSide });
    selectionHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    
    // This callback ensures the ring always faces the camera (billboarding)
    selectionHighlight.onBeforeRender = function(renderer, scene, camera) {
        this.quaternion.copy(camera.quaternion);
    };

    selectionHighlight.visible = false;
    scene.add(selectionHighlight);

    // Inject CSS for word highlighting to avoid needing to edit style.css directly
    const style = document.createElement('style');
    style.innerHTML = `
        .highlight-word {
            background-color: rgba(0, 255, 0, 0.4);
            padding: 0 2px;
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);

    loadAndPrepareStarData();

    window.addEventListener('resize', onWindowResize, false);
    canvas.addEventListener('pointerdown', onPointerDown, false);
    canvas.addEventListener('pointermove', onPointerMove, false);
    canvas.addEventListener('pointerup', onPointerUp, false);
    document.getElementById('resetViewButton').addEventListener('click', resetScene);
    document.getElementById('snapToSolButton').addEventListener('click', snapToSol);
    document.getElementById('toggle-fly-mode-button').addEventListener('click', toggleControlMode);
    toggleRoutePlannerButton.addEventListener('click', toggleRoutePlanner);
    setStartButton.addEventListener('click', setRouteStart);
    setEndButton.addEventListener('click', setRouteEnd);
    calculateRouteButton.addEventListener('click', calculateRoute);
    stellarTourButton.addEventListener('click', toggleStellarTour);
    document.getElementById('search-button').addEventListener('click', () => searchByName(searchInput.value));
    document.getElementById('clear-search-button').addEventListener('click', clearSearch);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', applyFilters));
    constellationSelect.addEventListener('change', viewSelectedConstellation);
    document.getElementById('clear-constellation-button').addEventListener('click', clearConstellationView);
    searchInput.addEventListener('input', handleAutocomplete);
    sizeSlider.addEventListener('input', applyFilters);
    narrateButton.addEventListener('click', handleNarration);
    distanceSlider.addEventListener('input', applyFilters);
    document.addEventListener('click', (e) => {
        if (!autocompleteContainer.contains(e.target) && e.target !== searchInput) {
            autocompleteContainer.classList.add('hidden');
        }
    });
    
    activeControls = controls; // Start with OrbitControls

    animate();
}

async function loadAndPrepareStarData() {
    loadingIndicator.style.display = 'block';
    try {
        const response = await fetch('stars.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawData = await response.json();

        // Step 1: Initial parsing of raw data into a workable format.
        let initialData = rawData.map(star => ({
            name: star.name,
            proper: star.proper,
            dist: parseFloat(star.dist),
            mag: parseFloat(star.mag),
            ci: parseFloat(star.ci) || 0,
            x: parseFloat(star.x),
            y: parseFloat(star.y),
            z: parseFloat(star.z),
            spect: star.spect,
        })).filter(s => !isNaN(s.dist));

        // Step 2: Reposition "Garbage Sphere" Stars
        const originalMaxDist = initialData.reduce((max, star) => Math.max(max, star.dist), 0);
        const starsWithoutGarbage = initialData.filter(star => star.dist < originalMaxDist);
        const maxRealDist = starsWithoutGarbage.reduce((max, star) => Math.max(max, star.dist), 0);
        const newShellDistance = Math.ceil(maxRealDist / 100) * 100;

        initialData.forEach(star => {
            if (star.dist === originalMaxDist) {
                const positionVector = new THREE.Vector3(star.x, star.y, star.z);
                if (positionVector.lengthSq() > 0) {
                    positionVector.normalize().multiplyScalar(newShellDistance);
                    star.x = positionVector.x;
                    star.y = positionVector.y;
                    star.z = positionVector.z;
                    star.dist = newShellDistance;
                }
            }
        });

        // Step 3: Now that all distances are finalized, calculate magnitudes and visual scales.
        const processedData = initialData.map(star => {
            let absoluteMagnitude;
            if (star.dist > 0) {
                absoluteMagnitude = star.mag - 5 * (Math.log10(star.dist) - 1);
            } else {
                absoluteMagnitude = star.mag;
            }

            const magnitudeDifference = SOL_ABSOLUTE_MAGNITUDE - absoluteMagnitude;
            const relativeRadiusScale = Math.max(0.2, 1 + magnitudeDifference * 0.25);

            return {
                ...star,
                absoluteMagnitude: absoluteMagnitude,
                relativeRadiusScale: relativeRadiusScale
            };
        });

        fullStarData = processedData; // Commit the processed data

        // Initialize UI elements that depend on the full dataset
        maxDistWithGarbage = Math.ceil(fullStarData.reduce((max, star) => Math.max(max, star.dist), 0));
        // The new "without garbage" distance is our previously calculated maxRealDist
        maxDistWithoutGarbage = Math.ceil(maxRealDist);

        distanceSlider.max = maxDistWithGarbage;
        distanceSlider.value = maxDistWithGarbage;

        // Set up the size slider based on the calculated relativeRadiusScale
        const minSize = fullStarData.reduce((min, star) => Math.min(min, star.relativeRadiusScale), Infinity);
        const maxSize = fullStarData.reduce((max, star) => Math.max(max, star.relativeRadiusScale), 0);
        sizeSlider.min = minSize;
        sizeSlider.max = Math.ceil(maxSize);
        sizeSlider.step = 0.1;
        sizeSlider.value = sizeSlider.max;

        populateConstellationDropdown();
        applyFilters(); // This will perform the initial geometry creation
        updateUI();

        // --- Set initial camera to the calculated overview position ---
        const box = new THREE.Box3();
        const points = fullStarData.map(s => new THREE.Vector3(s.x, s.y, s.z));
        if (points.length > 0) {
            box.setFromPoints(points);
            const center = new THREE.Vector3();
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            
            const fov = camera.fov * (Math.PI / 180);
            let cameraDist = sphere.radius / Math.tan(fov / 2);
            cameraDist *= 1.1; // Add a 10% buffer so it's not edge-to-edge.
            
            const overviewPosition = new THREE.Vector3(sphere.center.x, sphere.center.y, sphere.center.z + cameraDist);
            camera.position.copy(overviewPosition);
            controls.target.copy(sphere.center);
        }
        // --- End of initial camera setup ---

        // Update camera and controls to fit the new, smaller scene
        const newMaxDistance = 2000;
        // Ensure the camera's far plane can see beyond the max zoom distance
        camera.far = newMaxDistance * 1.1;
        controls.maxDistance = newMaxDistance;
        camera.updateProjectionMatrix(); // This is crucial after changing camera.far
    } catch (error) {
        console.error("Failed to load or process star data:", error);
        loadingIndicator.textContent = "Error loading data.";
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function applyFilters() {
    interruptTour();
    const properNameFilter = document.getElementById('proper-name-filter').checked;
    const garbageSphereFilter = document.getElementById('garbage-sphere-filter').checked;
    const spectralClassCheckboxes = document.querySelectorAll('.filter-checkbox[value]:checked');
    const selectedClasses = Array.from(spectralClassCheckboxes).map(cb => cb.value);
    
    if (garbageSphereFilter) {
        distanceSlider.max = maxDistWithoutGarbage;
    } else {
        distanceSlider.max = maxDistWithGarbage;
    }

    const maxDistance = distanceSlider.value;
    distanceValue.textContent = `${maxDistance} pc`;

    const maxSize = sizeSlider.value;
    sizeValue.textContent = `< ${parseFloat(maxSize).toFixed(1)}`;

    let tempStarData = [...fullStarData];

    if (properNameFilter) {
        tempStarData = tempStarData.filter(star => star.proper && star.proper.trim() !== '');
    }

    if (garbageSphereFilter) {
        tempStarData = tempStarData.filter(star => star.dist < maxDistWithGarbage);
    }

    if (selectedClasses.length > 0) {
        tempStarData = tempStarData.filter(star => {
            return selectedClasses.some(sc => star.spect && star.spect.toUpperCase().startsWith(sc));
        });
    }

    tempStarData = tempStarData.filter(star => star.dist <= maxDistance);
    tempStarData = tempStarData.filter(star => star.relativeRadiusScale <= maxSize);

    activeStarData = tempStarData;

    createStarGeometry(activeStarData);
    updateUI();
}

function createStarGeometry(data) {
    // If a previous group of stars exists, remove it and dispose of its contents
    if (stars) { // stars is an InstancedMesh
        scene.remove(stars);
        if (stars.geometry) stars.geometry.dispose();
        if (stars.material) stars.material.dispose();
    }
    
    if (data.length === 0) {
        stars = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 0); // Empty mesh
        scene.add(stars);
        return;
    }

    // Revert to InstancedMesh for high performance with thousands of objects.
    const sphereGeometry = new THREE.SphereGeometry(BASE_STAR_RADIUS, 8, 8);
    const material = new THREE.MeshBasicMaterial(); // The renderer will automatically use instanceColor if available
    stars = new THREE.InstancedMesh(sphereGeometry, material, data.length);
    stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    data.forEach((star, i) => {
        // Set position and scale
        const scale = star.relativeRadiusScale * GLOBAL_VISUAL_SCALE;
        matrix.compose(
            new THREE.Vector3(star.x, star.y, star.z),
            new THREE.Quaternion(),
            new THREE.Vector3(scale, scale, scale)
        );
        stars.setMatrixAt(i, matrix);

        // Set color
        const starColor = getRGBfromCI(star.ci);
        stars.setColorAt(i, color.setRGB(starColor.r, starColor.g, starColor.b));
    });

    stars.instanceMatrix.needsUpdate = true;
    if (stars.instanceColor) stars.instanceColor.needsUpdate = true;

    scene.add(stars);
}

function drawConstellationLines(constellationName) {
    while(constellationLinesGroup.children.length > 0){ 
        const line = constellationLinesGroup.children[0];
        constellationLinesGroup.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    }

    const constellationData = getConstellationData();
    const lines = constellationData[constellationName];
    if (!lines) return;

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x0055AA,
        transparent: true,
        opacity: 0.6
    });
    
    const starMap = new Map(fullStarData.map(star => [star.proper?.toLowerCase(), star]));

    lines.forEach(linePair => {
        const star1 = starMap.get(linePair[0].toLowerCase());
        const star2 = starMap.get(linePair[1].toLowerCase());

        if (star1 && star2) {
            const points = [new THREE.Vector3(star1.x, star1.y, star1.z), new THREE.Vector3(star2.x, star2.y, star2.z)];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            constellationLinesGroup.add(line);
        }
    });
}

function resetScene() {
    interruptTour();
    interruptRoutePlanner();
    // Calculate the bounding sphere of the entire dataset to frame it perfectly.
    const box = new THREE.Box3();
    const points = fullStarData.map(s => new THREE.Vector3(s.x, s.y, s.z));
    
    if (points.length > 0) {
        box.setFromPoints(points);
        const center = new THREE.Vector3();
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        
        const fov = camera.fov * (Math.PI / 180);
        // Calculate the distance needed to fit the sphere's radius in the view.
        let cameraDist = sphere.radius / Math.tan(fov / 2);
        cameraDist *= 1.1; // Add a 10% buffer so it's not edge-to-edge.
        
        // Position the camera along the Z-axis for a consistent overview.
        const targetPosition = new THREE.Vector3(sphere.center.x, sphere.center.y, sphere.center.z + cameraDist);
        animateCameraTo(sphere.center, targetPosition, null);
    } else {
        // Fallback if no data is loaded
        camera.position.copy(initialCameraPosition);
        controls.target.set(0, 0, 0);
        controls.update();
    }
    
    updateSelectionHighlight(null);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
    distanceSlider.value = distanceSlider.max;
    sizeSlider.value = sizeSlider.max;
    clearConstellationView();
    applyFilters();
    clearSearch();
}

function snapToSol() {
    interruptRoutePlanner();
    const sol = fullStarData.find(star => star.name === 'Sol');
    if (sol) {
        frameObjectInView(sol);
    }
}

function toggleControlMode() {
    interruptTour();
    interruptRoutePlanner();
    const button = document.getElementById('toggle-fly-mode-button');
    if (activeControls === controls) {
        // Switching to Fly Mode
        controls.enabled = false;
        flyControls.enabled = true;
        activeControls = flyControls;
        button.textContent = 'Orbit Mode';
        button.classList.add('active-mode');
    } else {
        // Switching to Orbit Mode
        flyControls.enabled = false;
        controls.enabled = true;
        // Set a sensible target for orbit controls based on the current view
        const newTarget = new THREE.Vector3();
        camera.getWorldDirection(newTarget).multiplyScalar(100).add(camera.position);
        controls.target.copy(newTarget);
        activeControls = controls;
        button.textContent = 'Fly Mode';
        button.classList.remove('active-mode');
    }
}

function updateUI() {
    starCountDisplay.textContent = `${activeStarData.length} / ${fullStarData.length} stars`;
}

function searchByName(name) {
    interruptTour();
    interruptRoutePlanner();
    const searchTerm = name.trim().toLowerCase();
    if (!searchTerm) return;
    
    const foundStar = fullStarData.find(star => star.name && star.name.toLowerCase() === searchTerm);

    if (foundStar) {
        frameObjectInView(foundStar);
    } else {
        const notFoundMsg = document.getElementById('search-not-found');
        notFoundMsg.style.display = 'block';
        setTimeout(() => { notFoundMsg.style.display = 'none'; }, 2000);
    }
}

function handleAutocomplete() {
    const value = searchInput.value.toLowerCase();
    autocompleteContainer.innerHTML = '';
    if (value.length === 0) {
        autocompleteContainer.classList.add('hidden');
        return;
    }

    const suggestions = fullStarData
        .filter(star => star.name && star.name.toLowerCase().startsWith(value))
        .slice(0, 5);
    
    if (suggestions.length > 0) {
        autocompleteContainer.style.width = `${searchInput.offsetWidth}px`;
        suggestions.forEach(star => {
            const div = document.createElement('div');
            div.textContent = star.name;
            div.className = 'suggestion-item';
            div.onclick = () => {
                searchInput.value = star.name;
                autocompleteContainer.classList.add('hidden');
                searchByName(star.name);
            };
            autocompleteContainer.appendChild(div);
        });
        autocompleteContainer.classList.remove('hidden');
    } else {
        autocompleteContainer.classList.add('hidden');
    }
}

function clearSearch() {
    searchInput.value = '';
    autocompleteContainer.classList.add('hidden');
}

function onPointerDown(event) {
    interruptTour();
    isDragging = false;
    pointerDownPosition.set(event.clientX, event.clientY);
}

function onPointerMove(event) {
    // If the primary mouse button is not pressed, do nothing.
    if (event.buttons !== 1) return;

    // If the mouse has moved more than a small threshold, we classify it as a drag.
    if (pointerDownPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
        isDragging = true;
    }
}

function onPointerUp(event) {
    // If the action was a drag, do not proceed with selection.
    if (isDragging) return;

    // Otherwise, it was a click. Perform the raycasting to select a star.
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(stars);

    if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        const data = activeStarData[instanceId];
        if (routePlanner.active) {
            // In route planner mode, just select the star, don't fly to it.
            routePlanner.currentSelection = data;
            updateInfoPanel(data);
            updateSelectionHighlight(data);
        } else {
            frameObjectInView(data);
        }
    }
}

function frameObjectInView(star, onCompleteCallback = null) {
    if (!star) return;

    const target = new THREE.Vector3(star.x, star.y, star.z);

    // Calculate the visual radius of the highlight ring to frame it in the view
    const highlightRadius = (star.relativeRadiusScale * GLOBAL_VISUAL_SCALE) * 1.5 + 0.5;

    // Calculate the distance needed for the highlight to nearly fill the view (based on vertical FOV)
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = highlightRadius / Math.tan(fov / 2);

    // Add a small buffer so it doesn't touch the very edge and feels comfortable
    const finalDistance = cameraDistance * 1.2;

    // Determine the new camera position while maintaining the current viewing angle relative to the new target
    const direction = new THREE.Vector3();
    direction.subVectors(camera.position, target).normalize();

    // If the camera is already on top of the star, provide a default direction
    if (direction.lengthSq() < 0.0001) {
        direction.set(0, 0.5, 1).normalize();
    }

    const newPosition = target.clone().add(direction.multiplyScalar(finalDistance));

    animateCameraTo(target, newPosition, onCompleteCallback);
    updateInfoPanel(star);
    updateSelectionHighlight(star);
}

function updateSelectionHighlight(star) {
    if (star) {
        selectionHighlight.position.set(star.x, star.y, star.z);
        const highlightScale = (star.relativeRadiusScale * GLOBAL_VISUAL_SCALE) * 1.5 + 0.5;
        selectionHighlight.scale.set(highlightScale, highlightScale, highlightScale);
        selectionHighlight.visible = true;
    } else {
        selectionHighlight.visible = false;
    }
}

function updateInfoPanel(data) {
    document.getElementById('star-name').textContent = data.name;
    document.getElementById('star-dist').textContent = `${data.dist.toFixed(2)} pc`;
    document.getElementById('star-mag').textContent = data.mag.toFixed(2);
    document.getElementById('star-spect').textContent = data.spect;
    document.getElementById('star-coords').textContent = `X:${data.x.toFixed(1)}, Y:${data.y.toFixed(1)}, Z:${data.z.toFixed(1)}`;

    // Handle route planner buttons
    if (routePlanner.active) {
        routeButtonsContainer.classList.remove('hidden');
    } else {
        routeButtonsContainer.classList.add('hidden');
    }

    // Handle detailed description
    const starDetails = getStarDetails();
    const starKey = data.proper?.toLowerCase() || data.name?.toLowerCase();
    if (starKey && starDetails[starKey]) {
        originalNarrationText = starDetails[starKey].description;
        starDescription.textContent = originalNarrationText;
        starDescriptionContainer.classList.remove('hidden');
    } else {
        originalNarrationText = '';
        starDescription.textContent = originalNarrationText;
        starDescriptionContainer.classList.add('hidden');
    }

    // Reset narrator state when a new star is selected
    speechSynthesis.cancel();
    narrateButton.textContent = '▶ Narrate';
}

function handleNarration() {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel(); // Stop the current speech. The 'onend' event will handle cleanup.
    } else {
        const text = originalNarrationText;
        if (text) {
            const utterance = new SpeechSynthesisUtterance(text);

            utterance.onboundary = (event) => {
                if (event.name === 'word') {
                    const wordStart = event.charIndex;
                    let wordEnd = text.indexOf(' ', wordStart);
                    if (wordEnd === -1) wordEnd = text.length;

                    const before = text.substring(0, wordStart);
                    const word = text.substring(wordStart, wordEnd);
                    const after = text.substring(wordEnd);

                    starDescription.innerHTML = `${before}<span class="highlight-word">${word}</span>${after}`;
                    
                    const highlightSpan = starDescription.querySelector('.highlight-word');
                    if (highlightSpan) {
                        highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            };

            utterance.onend = () => {
                narrateButton.textContent = '▶ Narrate';
                starDescription.textContent = originalNarrationText; // Restore original text
            };

            speechSynthesis.speak(utterance);
            narrateButton.textContent = '■ Stop';
        }
    }
}

function populateConstellationDropdown() {
    const data = getConstellationData();
    for (const name in data) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        constellationSelect.appendChild(option);
    }
}

function viewSelectedConstellation() {
    interruptTour();
    interruptRoutePlanner();
    const selectedValue = constellationSelect.value;
    if (!selectedValue) {
        clearConstellationView();
        return;
    }
    viewConstellation(selectedValue);
}

function viewConstellation(name) {
    const constellationData = getConstellationData();
    const lines = constellationData[name];
    if (!lines) return;

    const starMap = new Map(fullStarData.map(star => [star.proper?.toLowerCase(), star]));
    const constellationStars = [];
    const requiredStarNames = new Set();
    lines.forEach(pair => {
        requiredStarNames.add(pair[0].toLowerCase());
        requiredStarNames.add(pair[1].toLowerCase());
    });

    requiredStarNames.forEach(starName => {
        if (starMap.has(starName)) {
            constellationStars.push(starMap.get(starName));
        }
    });

    if (constellationStars.length === 0) return;

    const box = new THREE.Box3();
    const points = constellationStars.map(s => new THREE.Vector3(s.x, s.y, s.z));
    box.setFromPoints(points);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraDist *= 1.2; 
    
    const targetPosition = new THREE.Vector3(center.x, center.y, center.z + cameraDist);
    animateCameraTo(center, targetPosition, null);
    drawConstellationLines(name);
}

function clearConstellationView() {
    constellationSelect.value = "";
    while(constellationLinesGroup.children.length > 0){ 
        const line = constellationLinesGroup.children[0];
        constellationLinesGroup.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    }
}

function onWindowResize() {
    const canvasContainer = document.getElementById('canvasContainer');
    if (camera && renderer && canvasContainer) {
        camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    }
}

function toggleStellarTour() {
    if (stellarTour.active) {
        stopStellarTour();
    } else {
        startStellarTour();
    }
}

function startStellarTour() {
    if (activeStarData.length < 2) {
        alert("Not enough stars visible to start a tour. Please adjust filters.");
        return;
    }
    stellarTour.active = true;
    stellarTour.state = 'traveling';
    stellarTourButton.textContent = 'Stop Tour';
    stellarTourButton.classList.add('active-mode');
    selectNextTourStar();
}

function stopStellarTour() {
    stellarTour.active = false;
    stellarTour.state = 'idle';
    clearTimeout(stellarTour.timer);
    stellarTour.timer = null;
    stellarTour.targetStar = null;
    speechSynthesis.cancel(); // Stop any active narration
    
    stellarTourButton.textContent = 'Stellar Tour';
    stellarTourButton.classList.remove('active-mode');
    
    animation.onComplete = null; // Cancel any pending tour steps
    if (!animation.active) {
        activeControls.enabled = true; // Re-enable controls if no animation is running
    }
}

function selectNextTourStar() {
    if (!stellarTour.active) return;

    stellarTour.state = 'traveling';

    let nextStar;
    do {
        const randomIndex = Math.floor(Math.random() * activeStarData.length);
        nextStar = activeStarData[randomIndex];
    } while (activeStarData.length > 1 && nextStar === stellarTour.targetStar);
    
    stellarTour.targetStar = nextStar;

    const onTourStepComplete = () => {
        if (!stellarTour.active) return;

        stellarTour.state = 'orbiting';
        const hasDetails = starDescription.textContent.length > 0;

        if (hasDetails) {
            handleTourNarration();
        } else {
            stellarTour.timer = setTimeout(selectNextTourStar, 10000);
        }
    };
    initiateTourFlight(nextStar, onTourStepComplete);
}

function handleTourNarration() {
    if (!stellarTour.active) return;
    const text = starDescription.textContent;
    const utterance = new SpeechSynthesisUtterance(text);
    // When narration ends, wait 1 second, then move to the next star.
    utterance.onend = () => {
        if (stellarTour.active) {
            stellarTour.timer = setTimeout(selectNextTourStar, 1000); 
        }
    };
    speechSynthesis.speak(utterance);
}

function initiateTourFlight(star, onTravelComplete) {
    if (!star) return;

    const target = new THREE.Vector3(star.x, star.y, star.z);

    // --- Calculate final camera position (logic from frameObjectInView) ---
    const highlightRadius = (star.relativeRadiusScale * GLOBAL_VISUAL_SCALE) * 1.5 + 0.5;
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = highlightRadius / Math.tan(fov / 2);
    const finalDistance = cameraDistance * 1.2;
    // Use a fixed direction for tour flights for a consistent, cinematic feel.
    const direction = new THREE.Vector3(0, 0.3, 1).normalize(); 
    const finalPosition = target.clone().add(direction.multiplyScalar(finalDistance));
    // --- End of calculation ---

    // --- Animation Step 1: Rotate to face the target ---
    const onRotationComplete = () => {
        // Add a small delay between rotation and travel for a more deliberate feel.
        setTimeout(() => {
            if (!stellarTour.active) return; // Check if tour was cancelled during the pause
            // --- Animation Step 2: Fly to the final position ---
            animateCameraTo(target, finalPosition, onTravelComplete);
        }, 500); // 500ms pause
    };
    
    // Animate only the target (lookAt point), keeping camera position fixed.
    animateCameraTo(target, camera.position, onRotationComplete); 
    
    // Update the info panel and highlight as soon as the rotation begins.
    updateInfoPanel(star);
    updateSelectionHighlight(star);
}

function interruptRoutePlanner() {
    if (routePlanner.active) {
        toggleRoutePlanner();
    }
}

function toggleRoutePlanner() {
    interruptTour();
    routePlanner.active = !routePlanner.active;

    if (routePlanner.active) {
        toggleRoutePlannerButton.textContent = 'Exit Planner';
        toggleRoutePlannerButton.classList.add('active-mode');
        routePlannerContainer.classList.remove('hidden');
        // When entering planner, if a star is selected, show its buttons
        if (selectionHighlight.visible) {
            routeButtonsContainer.classList.remove('hidden');
        }
    } else {
        // Reset and hide everything
        toggleRoutePlannerButton.textContent = 'Plan Route';
        toggleRoutePlannerButton.classList.remove('active-mode');
        routePlannerContainer.classList.add('hidden');
        routeButtonsContainer.classList.add('hidden');
        routePlanner.startStar = null;
        routePlanner.endStar = null;
        routePlanner.currentSelection = null;
        updateRoutePlannerUI();
        // Potentially clear route line here later
    }
}

function setRouteStart() {
    if (routePlanner.currentSelection) {
        routePlanner.startStar = routePlanner.currentSelection;
        updateRoutePlannerUI();
    }
}

function setRouteEnd() {
    if (routePlanner.currentSelection) {
        routePlanner.endStar = routePlanner.currentSelection;
        updateRoutePlannerUI();
    }
}

function updateRoutePlannerUI() {
    routeStartStar.textContent = routePlanner.startStar ? routePlanner.startStar.name : 'None';
    routeEndStar.textContent = routePlanner.endStar ? routePlanner.endStar.name : 'None';
}

function calculateRoute() {
    if (!routePlanner.startStar || !routePlanner.endStar) {
        alert("Please select a start and end star for the route.");
        return;
    }
    const maxJump = parseFloat(maxJumpRangeInput.value);
    if (isNaN(maxJump) || maxJump <= 0) {
        alert("Please enter a valid maximum jump range.");
        return;
    }

    console.log(`Calculating route from ${routePlanner.startStar.name} to ${routePlanner.endStar.name} with max jump of ${maxJump} pc.`);
    // A* algorithm will be called here in the future.
    const result = findPathAStar(routePlanner.startStar, routePlanner.endStar, activeStarData, maxJump);

    if (result && result.path && result.path.length > 1) {
        console.log("Route found:", result.path.map(p => p.name).join(" -> "));
        drawRouteLine(result.path);
        if (result.stranded) {
            alert("Dead End! Could not reach the destination. Showing the closest possible route.");
        }
    } else {
        alert("No route could be found with the specified maximum jump range.");
        drawRouteLine(null); // Clear any existing line
    }
}

// --- A* Pathfinding Implementation ---

class PriorityQueue {
    constructor() {
        this.elements = [];
    }
    enqueue(element, priority) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }
    dequeue() {
        return this.elements.shift().element;
    }
    isEmpty() {
        return this.elements.length === 0;
    }
}

function findPathAStar(startNode, endNode, allNodes, maxJump) {
    const openSet = new PriorityQueue();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const nodeMap = new Map(allNodes.map(node => [node.name, node]));
    
    allNodes.forEach(node => {
        gScore.set(node.name, Infinity);
        fScore.set(node.name, Infinity);
    });

    gScore.set(startNode.name, 0);
    fScore.set(startNode.name, heuristic(startNode, endNode));
    openSet.enqueue(startNode, fScore.get(startNode.name));

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue();

        if (current.name === endNode.name) {
            // Path found, reconstruct it
            const totalPath = [current];
            let temp = current;
            while (cameFrom.has(temp.name)) {
                temp = cameFrom.get(temp.name);
                totalPath.unshift(temp);
            }
            return { path: totalPath, stranded: false };
        }

        // Find neighbors within maxJump range
        // NOTE: This is a performance bottleneck on large datasets. A spatial index (e.g., Octree) would be a future optimization.
        const neighbors = allNodes.filter(node => {
            if (node.name === current.name) return false;
            const dist = distance(current, node);
            return dist <= maxJump;
        });

        for (const neighbor of neighbors) {
            const tentativeGScore = gScore.get(current.name) + distance(current, neighbor);
            if (tentativeGScore < gScore.get(neighbor.name)) {
                cameFrom.set(neighbor.name, current);
                gScore.set(neighbor.name, tentativeGScore);
                fScore.set(neighbor.name, tentativeGScore + heuristic(neighbor, endNode));
                openSet.enqueue(neighbor, fScore.get(neighbor.name));
            }
        }
    }

    // --- Handle stranded case: No complete path found ---
    // Find the node we reached that is closest to the end destination.
    let closestNode = startNode;
    let minHeuristic = heuristic(startNode, endNode);

    for (const [nodeName, score] of gScore.entries()) {
        if (score !== Infinity) { // If the node was reached
            const reachableNode = nodeMap.get(nodeName);
            const h = heuristic(reachableNode, endNode);
            if (h < minHeuristic) {
                minHeuristic = h;
                closestNode = reachableNode;
            }
        }
    }

    // Reconstruct the path to this "closest" node.
    const partialPath = [closestNode];
    let temp = closestNode;
    while (cameFrom.has(temp.name)) {
        temp = cameFrom.get(temp.name);
        partialPath.unshift(temp);
    }

    // If the path is just the start node, we couldn't go anywhere.
    return partialPath.length > 1 ? { path: partialPath, stranded: true } : null;
}

function distance(nodeA, nodeB) {
    return Math.sqrt(Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2) + Math.pow(nodeA.z - nodeB.z, 2));
}

function heuristic(nodeA, nodeB) {
    // Euclidean distance is a perfect heuristic for this 3D space
    return distance(nodeA, nodeB);
}

function drawRouteLine(path) {
    // Clear previous route line
    if (routePlanner.routeLine) {
        scene.remove(routePlanner.routeLine);
        routePlanner.routeLine.geometry.dispose();
        routePlanner.routeLine.material.dispose();
        routePlanner.routeLine = null;
    }

    if (!path || path.length < 2) return;

    const points = path.map(star => new THREE.Vector3(star.x, star.y, star.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xFFD700, linewidth: 2 }); // A bright gold color
    routePlanner.routeLine = new THREE.Line(geometry, material);
    scene.add(routePlanner.routeLine);
}

function interruptTour() {
    if (stellarTour.active) {
        stopStellarTour();
    }
}

let animation = { active: false, onComplete: null };
function animateCameraTo(target, position, onCompleteCallback = null) {
    animation.active = true;
    animation.startPosition = camera.position.clone();
    animation.endPosition = position || target.clone().add(new THREE.Vector3(0, 20, 50));
    animation.startTarget = controls.target.clone();
    animation.endTarget = target;
    animation.alpha = 0;
    animation.onComplete = onCompleteCallback; // Use the passed callback, or null if none is provided
    activeControls.enabled = false;
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (animation.active) {
        animation.alpha += 0.02;
        if (animation.alpha >= 1) {
            animation.alpha = 1;
            animation.active = false;
            // Only re-enable user controls if the tour isn't active.
            // The tour manages its own control state.
            if (!stellarTour.active) {
                activeControls.enabled = true;
            }
            if (animation.onComplete) {
                animation.onComplete();
                animation.onComplete = null; // Ensure it only runs once
            }
        }
        camera.position.lerpVectors(animation.startPosition, animation.endPosition, animation.alpha);
        controls.target.lerpVectors(animation.startTarget, animation.endTarget, animation.alpha);
    } else if (stellarTour.active && stellarTour.state === 'orbiting' && stellarTour.targetStar) {
        // Perform the orbit logic when the tour is paused at a star
        const targetPosition = new THREE.Vector3(stellarTour.targetStar.x, stellarTour.targetStar.y, stellarTour.targetStar.z);
        const orbitSpeed = 0.1; // radians per second
        const orbitAxis = new THREE.Vector3(0, 1, 0); // Simple orbit around the Y axis

        const offset = new THREE.Vector3().subVectors(camera.position, targetPosition);
        offset.applyAxisAngle(orbitAxis, orbitSpeed * delta);
        camera.position.copy(targetPosition).add(offset);
        camera.lookAt(targetPosition);
    } else {
        // Only update user controls if not animating or orbiting
        if (activeControls === flyControls) {
            flyControls.update(delta);
        } else {
            controls.update(); // OrbitControls
        }
    }

    renderer.render(scene, camera);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getRGBfromCI(ci) {
    if (ci < 0.0) return { r: 0.67, g: 0.85, b: 1.0 }; 
    if (ci < 0.3) return { r: 1.0, g: 1.0, b: 1.0 }; 
    if (ci < 0.6) return { r: 1.0, g: 1.0, b: 0.8 }; 
    if (ci < 0.9) return { r: 1.0, g: 0.9, b: 0.5 }; 
    if (ci < 1.4) return { r: 1.0, g: 0.7, b: 0.4 }; 
    return { r: 1.0, g: 0.5, b: 0.5 }; 
}

init();