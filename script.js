import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, stars, controls, raycaster, mouse;
let fullStarData = [];
let activeStarData = [];
let searchHighlight = null;
let constellationLinesGroup = null;
let initialCameraPosition = new THREE.Vector3(0, 20, 100);
let animationFrameId;

const loadingIndicator = document.getElementById('loading-indicator');
const canvas = document.getElementById('renderCanvas');
const starCountDisplay = document.getElementById('star-count-display');
const constellationSelect = document.getElementById('constellation-select');
const searchInput = document.getElementById('search-input');
const autocompleteContainer = document.getElementById('autocomplete-suggestions');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);

    const canvasContainer = document.getElementById('canvasContainer');
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 110000);
    camera.position.copy(initialCameraPosition);
    camera.lookAt(scene.position);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100000; // Allow zooming out to see the whole dataset
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    raycaster.params.Points.threshold = 0.5;

    constellationLinesGroup = new THREE.Group();
    scene.add(constellationLinesGroup);

    loadAndPrepareStarData();

    window.addEventListener('resize', onWindowResize, false);
    canvas.addEventListener('click', onStarClick, false);
    document.getElementById('resetViewButton').addEventListener('click', resetScene);
    document.getElementById('snapToSolButton').addEventListener('click', snapToSol);
    document.getElementById('search-button').addEventListener('click', () => searchByName(searchInput.value));
    document.getElementById('clear-search-button').addEventListener('click', clearSearch);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', applyFilters));
    constellationSelect.addEventListener('change', viewSelectedConstellation);
    document.getElementById('clear-constellation-button').addEventListener('click', clearConstellationView);
    searchInput.addEventListener('input', handleAutocomplete);
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
        const response = await fetch('./stars.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const embeddedStarData = await response.json();

        const mappedData = embeddedStarData.map(star => ({
            ...star,
            dist: parseFloat(star.dist),
            mag: parseFloat(star.mag),
            spect: star.spect || 'N/A',
            ci: parseFloat(star.ci) || 0,
            x: parseFloat(star.x),
            y: parseFloat(star.y),
            z: parseFloat(star.z)
        }));
        
        fullStarData = mappedData.filter(star => 
            !isNaN(star.dist) &&
            !isNaN(star.mag) &&
            !isNaN(star.ci) &&
            !isNaN(star.x) &&
            !isNaN(star.y) &&
            !isNaN(star.z)
        );
        
        populateConstellationDropdown();
        applyFilters();

    } catch (error) {
        console.error("Failed to load or process star data:", error);
        loadingIndicator.textContent = "Error loading data.";
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function applyFilters() {
    const filterCheckboxes = document.querySelectorAll('.filter-checkbox:checked');
    let selectedClasses = Array.from(filterCheckboxes).map(cb => cb.value);

    if (selectedClasses.length === 0) {
        activeStarData = [...fullStarData];
    } else {
        activeStarData = fullStarData.filter(star => {
            return selectedClasses.some(sc => star.spect && star.spect.toUpperCase().startsWith(sc));
        });
    }
    
    createStarGeometry(activeStarData);
    updateUI();
}

function createStarGeometry(data) {
    if (stars) {
        scene.remove(stars);
        stars.geometry.dispose();
        stars.material.dispose();
    }
    
    const starGeometry = new THREE.BufferGeometry();
    if (data.length === 0) {
        stars = new THREE.Points(starGeometry, new THREE.PointsMaterial());
        scene.add(stars);
        return;
    }

    const positions = [];
    const colors = [];
    const sizes = [];

    data.forEach(star => {
        positions.push(star.x, star.y, star.z);
        const color = getRGBfromCI(star.ci);
        colors.push(color.r, color.g, color.b);
        const size = 2.5 - (star.mag / 2.5);
        sizes.push(Math.max(size, 0.5));
    });

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const starMaterial = new THREE.PointsMaterial({
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9
    });

    stars = new THREE.Points(starGeometry, starMaterial);
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
    
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
    clearConstellationView();
    applyFilters();
    clearSearch();
}

function snapToSol() {
    const sol = fullStarData.find(star => star.name === 'Sol');
    if (sol) {
        animateCameraTo(new THREE.Vector3(sol.x, sol.y, sol.z));
        updateInfoPanel(sol);
    }
}

function updateUI() {
    starCountDisplay.textContent = `${activeStarData.length} / ${fullStarData.length} stars`;
}

function searchByName(name) {
    clearSearch();
    const searchTerm = name.trim().toLowerCase();
    if (!searchTerm) return;
    
    const foundStar = fullStarData.find(star => star.name && star.name.toLowerCase() === searchTerm);

    if (foundStar) {
        const highlightMaterial = new THREE.PointsMaterial({ color: 0x00FFFF, size: 20, sizeAttenuation: true });
        const highlightGeometry = new THREE.BufferGeometry();
        highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute([foundStar.x, foundStar.y, foundStar.z], 3));
        searchHighlight = new THREE.Points(highlightGeometry, highlightMaterial);
        scene.add(searchHighlight);

        const targetPosition = new THREE.Vector3(foundStar.x, foundStar.y, foundStar.z);
        animateCameraTo(targetPosition);
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
    if (searchHighlight) {
        scene.remove(searchHighlight);
        searchHighlight.geometry.dispose();
        searchHighlight.material.dispose();
        searchHighlight = null;
    }
    searchInput.value = '';
    autocompleteContainer.classList.add('hidden');
}

function onStarClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(stars);

    if (intersects.length > 0) {
        const index = intersects[0].index;
        const data = activeStarData[index];
        updateInfoPanel(data);
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
