import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, stars, controls, raycaster, mouse;
let fullStarData = [];
let activeStarData = [];
let selectionHighlight = null;
let constellationLinesGroup = null;
let initialCameraPosition = new THREE.Vector3(0, 20, 100);
let isDragging = false;
const pointerDownPosition = new THREE.Vector2();
let animationFrameId;
let maxDistWithGarbage, maxDistWithoutGarbage;

// Constants for star sizing
const SOL_ABSOLUTE_MAGNITUDE = 4.83; // Absolute magnitude of the Sun
const BASE_STAR_RADIUS = 1.0; // Base radius for the THREE.SphereGeometry
const GLOBAL_VISUAL_SCALE = 0.5; // Aggressively reduced scale for clarity in dense core

const loadingIndicator = document.getElementById('loading-indicator');
const canvas = document.getElementById('renderCanvas');
const starCountDisplay = document.getElementById('star-count-display');
const constellationSelect = document.getElementById('constellation-select');
const searchInput = document.getElementById('search-input');
const autocompleteContainer = document.getElementById('autocomplete-suggestions');
const distanceSlider = document.getElementById('distance-slider');
const distanceValue = document.getElementById('distance-value');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    const canvasContainer = document.getElementById('canvasContainer');
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 400000); 
    camera.position.copy(initialCameraPosition); // Use the closer, predefined initial position for the demo
    camera.lookAt(scene.position);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 400000; // Allow zooming out to see the whole dataset
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    raycaster.params.Points.threshold = 0.5;

    constellationLinesGroup = new THREE.Group();
    scene.add(constellationLinesGroup);

    // Create a single, reusable highlight object as a 2D ring that always faces the camera.
    const highlightGeometry = new THREE.RingGeometry(0.95, 1.0, 32); // A thin ring
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0x00FFFF, side: THREE.DoubleSide });
    selectionHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    
    // This callback ensures the ring always faces the camera (billboarding)
    selectionHighlight.onBeforeRender = function(renderer, scene, camera) {
        this.quaternion.copy(camera.quaternion);
    };

    selectionHighlight.visible = false;
    scene.add(selectionHighlight);

    loadAndPrepareStarData();

    window.addEventListener('resize', onWindowResize, false);
    canvas.addEventListener('pointerdown', onPointerDown, false);
    canvas.addEventListener('pointermove', onPointerMove, false);
    canvas.addEventListener('pointerup', onPointerUp, false);
    document.getElementById('resetViewButton').addEventListener('click', resetScene);
    document.getElementById('snapToSolButton').addEventListener('click', snapToSol);
    document.getElementById('search-button').addEventListener('click', () => searchByName(searchInput.value));
    document.getElementById('clear-search-button').addEventListener('click', clearSearch);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', applyFilters));
    constellationSelect.addEventListener('change', viewSelectedConstellation);
    document.getElementById('clear-constellation-button').addEventListener('click', clearConstellationView);
    searchInput.addEventListener('input', handleAutocomplete);
    distanceSlider.addEventListener('input', applyFilters);
    document.addEventListener('click', (e) => {
        if (!autocompleteContainer.contains(e.target) && e.target !== searchInput) {
            autocompleteContainer.classList.add('hidden');
        }
    });
    
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

        const processedData = rawData.map(star => {
            const dist = parseFloat(star.dist);
            const mag = parseFloat(star.mag);

            let absoluteMagnitude;
            if (dist > 0) {
                absoluteMagnitude = mag - 5 * (Math.log10(dist) - 1);
            } else {
                absoluteMagnitude = mag; // Fallback for stars with 0 distance (like Sol)
            }

            // A more robust method for visual scaling based on established astronomical practice.
            // We use the difference in absolute magnitude (a logarithmic scale) from Sol.
            // This avoids the extreme values of raw luminosity and prevents the "nesting" issue.
            const magnitudeDifference = SOL_ABSOLUTE_MAGNITUDE - absoluteMagnitude;

            // We scale the radius based on this difference. The 0.25 is a tunable factor
            // that controls how much larger brighter stars appear.
            const relativeRadiusScale = Math.max(0.2, 1 + magnitudeDifference * 0.25);

            // By explicitly defining the new object, we ensure all properties are correctly typed and present,
            // avoiding subtle bugs that can arise from using the spread operator (...) on the raw data.
            return {
                name: star.name,
                proper: star.proper,
                dist: dist,
                mag: mag,
                ci: parseFloat(star.ci) || 0,
                x: parseFloat(star.x),
                y: parseFloat(star.y),
                z: parseFloat(star.z),
                spect: star.spect,
                absoluteMagnitude: absoluteMagnitude,
                relativeRadiusScale: relativeRadiusScale
            };
        }).filter(s => !isNaN(s.dist)); // Ensure we only have stars with valid distances

        // Now that scaling is fixed, we can use the full dataset
        fullStarData = processedData;

        // Initialize UI elements that depend on the full dataset
        maxDistWithGarbage = Math.ceil(fullStarData.reduce((max, star) => Math.max(max, star.dist), 0));
        const starsWithoutGarbage = fullStarData.filter(star => star.dist < maxDistWithGarbage);
        maxDistWithoutGarbage = Math.ceil(starsWithoutGarbage.reduce((max, star) => Math.max(max, star.dist), 0) / 1000) * 1000;

        distanceSlider.max = maxDistWithGarbage;
        distanceSlider.value = maxDistWithGarbage;

        populateConstellationDropdown();
        applyFilters(); // This will perform the initial geometry creation
        updateUI();
    } catch (error) {
        console.error("Failed to load or process star data:", error);
        loadingIndicator.textContent = "Error loading data.";
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function applyFilters() {
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
    camera.position.copy(initialCameraPosition);
    controls.target.set(0, 0, 0);
    controls.update();
    
    updateSelectionHighlight(null);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
    distanceSlider.value = distanceSlider.max;
    clearConstellationView();
    applyFilters();
    clearSearch();
}

function snapToSol() {
    const sol = fullStarData.find(star => star.name === 'Sol');
    if (sol) {
        animateCameraTo(new THREE.Vector3(sol.x, sol.y, sol.z));
        updateInfoPanel(sol);
        updateSelectionHighlight(sol);
    }
}

function updateUI() {
    starCountDisplay.textContent = `${activeStarData.length} / ${fullStarData.length} stars`;
}

function searchByName(name) {
    const searchTerm = name.trim().toLowerCase();
    if (!searchTerm) return;
    
    const foundStar = fullStarData.find(star => star.name && star.name.toLowerCase() === searchTerm);

    if (foundStar) {
        updateSelectionHighlight(foundStar);
        animateCameraTo(new THREE.Vector3(foundStar.x, foundStar.y, foundStar.z));
        updateInfoPanel(foundStar);
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
        updateSelectionHighlight(data);
        updateInfoPanel(data);
        animateCameraTo(new THREE.Vector3(data.x, data.y, data.z));
    }
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
    animateCameraTo(center, targetPosition);
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

let animation = { active: false };
function animateCameraTo(target, position) {
    animation.active = true;
    animation.startPosition = camera.position.clone();
    animation.endPosition = position || target.clone().add(new THREE.Vector3(0, 20, 50));
    animation.startTarget = controls.target.clone();
    animation.endTarget = target;
    animation.alpha = 0;
    controls.enabled = false;
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (animation.active) {
        animation.alpha += 0.02;
        if (animation.alpha >= 1) {
            animation.alpha = 1;
            animation.active = false;
            controls.enabled = true;
        }
        camera.position.lerpVectors(animation.startPosition, animation.endPosition, animation.alpha);
        controls.target.lerpVectors(animation.startTarget, animation.endTarget, animation.alpha);
    }

    controls.update();
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