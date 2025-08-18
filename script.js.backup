function handleNarration() {
    // Check if we have a selected star with description
    const text = originalNarrationText;
    if (!text) {
        console.warn('No narration text available for selected star');
        return;
    }

    // Stop any existing speech synthesis
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure speech synthesis
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Implement karaoke-style word highlighting
    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const wordStart = event.charIndex;
            let wordEnd = text.indexOf(' ', wordStart);
            if (wordEnd === -1) wordEnd = text.length;

            const before = text.substring(0, wordStart);
            const word = text.substring(wordStart, wordEnd);
            const after = text.substring(wordEnd);

            // Update the description with highlighted word
            starDescription.innerHTML = before + 
                '<span style="background-color: #7DF9FF; color: #000; padding: 0 2px; border-radius: 2px;">' + 
                word + '</span>' + after;

            // Auto-scroll to keep highlighted word visible
            const highlightedElement = starDescription.querySelector('span');
            if (highlightedElement) {
                highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    // Reset text when narration ends
    utterance.onend = () => {
        starDescription.textContent = originalNarrationText;
        narrateButton.textContent = '▶ Narrate';
    };

    // Handle narration errors
    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        starDescription.textContent = originalNarrationText;
        narrateButton.textContent = '▶ Narrate';
    };

    // Update button state and start narration
    narrateButton.textContent = '⏸ Stop';
    speechSynthesis.speak(utterance);
}
import * as THREE from './vendor/three/build/three.module.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { FlyControls } from './vendor/three/examples/jsm/controls/FlyControls.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { AdditiveBlendShader } from './AdditiveBlendShader.js';
import { Line2 } from './vendor/three/examples/jsm/lines/Line2.js';
import { LineGeometry } from './vendor/three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from './vendor/three/examples/jsm/lines/LineMaterial.js';

let scene, camera, renderer, starsMesh, starsBloomMesh, starScene, starRenderTarget, starComposer, starRenderPass, starBloomPass, composer, renderPass, blendPass, controls, flyControls, activeControls, raycaster, mouse;
function populateConstellationDropdown() {
    if (!constellationSelect) {
        console.warn('Constellation select element not found');
        return;
    }

    // Clear existing options except the first placeholder
    while (constellationSelect.children.length > 1) {
        constellationSelect.removeChild(constellationSelect.lastChild);
    }

    // Get constellation data
    const constellations = getConstellationData();
    if (!constellations) {
        console.warn('No constellation data available');
        return;
    }

    // Sort constellation names alphabetically
    const constellationNames = Object.keys(constellations).sort();

    // Populate dropdown with constellation options
    constellationNames.forEach(constellationName => {
        const option = document.createElement('option');
        option.value = constellationName;
        option.textContent = constellationName;
        constellationSelect.appendChild(option);
    });

    console.log(`Populated constellation dropdown with ${constellationNames.length} constellations`);
}
let starShaderMaterial;
let useStarShader = true;
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
    routes: [], // Will hold up to 3 route objects
    maxRoutes: 3, // As per the roadmap
    activeRouteIndex: 0, // The route we are currently editing (0, 1, or 2)
    currentJumpIndex: 0, // The index of the current star in the active route's path
    currentSelection: null, // The star currently selected in the info panel
    routeTour: { active: false, timer: null }, // New state for the route tour
    // Pre-defined colors for the routes for high contrast
    routeColors: [0xFF00FF, 0x00FFFF, 0xFFFF00], // Magenta, Cyan, Yellow
    showArrows: true
};
let starOctree;
let maxDistWithGarbage, maxDistWithoutGarbage;
let routeNavigationContainer, jumpToStartButton, nextJumpButton, jumpToEndButton, routeProgressDisplay, followRouteButton;
let searchBubble;

let originalNarrationText = ''; // Holds the clean text for the current selection
const spectralClasses = ['O','B','A','F','G','K','M'];

// Centralized error handling system
class ErrorHandler {
    static showError(message, details = null, isRetryable = false) {
        console.error('Application Error:', message, details);
        
        // Show user-friendly error notification
        this.showNotification(message, 'error', isRetryable);
        
        // Log to external service in production
        if (window.location.hostname !== 'localhost') {
            this.logError(message, details);
        }
    }

    static showWarning(message, details = null) {
        console.warn('Application Warning:', message, details);
        this.showNotification(message, 'warning');
    }

    static showNotification(message, type = 'info', isRetryable = false) {
        // Remove any existing notifications
        const existingNotification = document.querySelector('.app-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `app-notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ffaa00' : '#4444ff'};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                margin-left: 12px;
                opacity: 0.8;
            ">×</button>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 5000);
        }
    }

    static logError(message, details) {
        // Placeholder for external error logging
        // In production, this could send to Sentry, LogRocket, etc.
        const errorData = {
            message,
            details,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        console.log('Would log to external service:', errorData);
    }

    static safeElementAccess(elementId, operation, fallback = null) {
        try {
            const element = document.getElementById(elementId);
            if (!element) {
                this.showWarning(`UI element "${elementId}" not found`);
                return fallback;
            }
            return operation(element);
        } catch (error) {
            this.showError(`Error accessing element "${elementId}": ${error.message}`, error);
            return fallback;
        }
    }

    static safeFunctionCall(fn, context = null, ...args) {
        try {
            return context ? fn.apply(context, args) : fn(...args);
        } catch (error) {
            this.showError(`Function execution failed: ${error.message}`, error);
            return null;
        }
    }
}

// Constants for star sizing
const SOL_ABSOLUTE_MAGNITUDE = 4.83; // Absolute magnitude of the Sun
const BASE_STAR_RADIUS = 1.0; // Base radius for the THREE.SphereGeometry
const GLOBAL_VISUAL_SCALE = 0.5; 
let loadingIndicator, canvas, starCountDisplay, constellationSelect, searchInput, autocompleteContainer, distanceSlider, distanceValue, sizeSlider, sizeValue, narrateButton, starDescriptionContainer, starDescription, stellarTourButton, toggleRoutePlannerButton, routePlannerContainer, setStartButton, setEndButton, routeStartStar, routeEndStar, maxJumpRangeInput, calculateRouteButton, routeButtonsContainer, findMinJumpButton, routeCalculatingMessage;

function init() {
    // Safely assign DOM elements with error handling
    const requiredElements = {
        loadingIndicator: 'loading-indicator',
        canvas: 'renderCanvas',
        starCountDisplay: 'star-count-display',
        constellationSelect: 'constellation-select',
        searchInput: 'search-input',
        autocompleteContainer: 'autocomplete-suggestions',
        distanceSlider: 'distance-slider',
        distanceValue: 'distance-value',
        sizeSlider: 'size-slider',
        sizeValue: 'size-value',
        narrateButton: 'narrate-button',
        starDescriptionContainer: 'star-description-container',
        starDescription: 'star-description',
        stellarTourButton: 'stellar-tour-button',
        toggleRoutePlannerButton: 'toggle-route-planner-button',
        routePlannerContainer: 'route-planner-container'
    };

    const optionalElements = {
        setStartButton: 'set-start-button',
        setEndButton: 'set-end-button',
        routeStartStar: 'route-start-star',
        routeEndStar: 'route-end-star',
        maxJumpRangeInput: 'max-jump-range',
        calculateRouteButton: 'calculate-route-button',
        findMinJumpButton: 'find-min-jump-button',
        routeCalculatingMessage: 'route-calculating-message',
        routeNavigationContainer: 'route-navigation-container',
        jumpToStartButton: 'jump-to-start-button',
        nextJumpButton: 'next-jump-button',
        jumpToEndButton: 'jump-to-end-button',
        followRouteButton: 'follow-route-button',
        routeProgressDisplay: 'route-progress-display',
        routeButtonsContainer: 'route-buttons-container'
    };

    // Check required elements
    const missingElements = [];
    for (const [varName, elementId] of Object.entries(requiredElements)) {
        const element = document.getElementById(elementId);
        if (!element) {
            missingElements.push(elementId);
        }
        window[varName] = element;
    }

    // Check optional elements (warn but don't fail)
    for (const [varName, elementId] of Object.entries(optionalElements)) {
        const element = document.getElementById(elementId);
        if (!element) {
            ErrorHandler.showWarning(`Optional UI element "${elementId}" not found - some features may be disabled`);
        }
        window[varName] = element;
    }

    // Fail if critical elements are missing
    if (missingElements.length > 0) {
        ErrorHandler.showError(
            `Critical UI elements missing: ${missingElements.join(', ')}. Please refresh the page.`,
            { missingElements },
            true
        );
        return false;
    }

    try {
        // Initialize Three.js scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000011);
        
        const canvasContainer = document.getElementById('canvasContainer');
        if (!canvasContainer) {
            throw new Error('Canvas container element not found');
        }

        if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) {
            throw new Error('Canvas container has invalid dimensions');
        }

        camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 400000);
        
        // Initialize WebGL renderer with error detection
        if (!canvas) {
            throw new Error('Canvas element not found');
        }

        // Check WebGL support
        const testContext = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!testContext) {
            throw new Error('WebGL not supported by this browser');
        }

        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: false // Better performance
        });
        
        // Verify renderer was created successfully
        if (!renderer.getContext()) {
            throw new Error('Failed to initialize WebGL context');
        }

        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
        
        // Log successful initialization
        console.log('Three.js initialized successfully');
        console.log('Canvas container dimensions:', canvasContainer.clientWidth, 'x', canvasContainer.clientHeight);
        console.log('WebGL context:', renderer.getContext());
        console.log('Renderer capabilities:', renderer.capabilities);

    } catch (error) {
        ErrorHandler.showError(
            'Failed to initialize 3D graphics. Your browser may not support WebGL.',
            error
        );
        
        // Show fallback content
        if (canvas && canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    color: #7DF9FF;
                    text-align: center;
                    padding: 20px;
                ">
                    <h2>3D Graphics Not Available</h2>
                    <p>Your browser doesn't support WebGL, which is required for the 3D star map.</p>
                    <p>Please try using a modern browser like Chrome, Firefox, or Edge.</p>
                    <button onclick="location.reload()" style="
                        background: #7DF9FF;
                        color: #000;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 16px;
                    ">Try Again</button>
                </div>
            `;
        }
        return false;
    }


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

    // --- Star-only scene for per-star bloom ---
    starScene = new THREE.Scene();
    starScene.background = new THREE.Color(0x000000);

    // --- Post-processing composers ---
    try {
        // Main composer (no bloom, just the scene)
        composer = new EffectComposer(renderer);
        renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        // Star-only composer (bloom only stars)
        starRenderTarget = new THREE.WebGLRenderTarget(canvasContainer.clientWidth, canvasContainer.clientHeight);
        starComposer = new EffectComposer(renderer, starRenderTarget);
        starRenderPass = new RenderPass(starScene, camera);
        starBloomPass = new UnrealBloomPass(new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight), 0.6, 0.4, 0.85);
        starComposer.addPass(starRenderPass);
        starComposer.addPass(starBloomPass);

        // Additive blend pass to composite star bloom over main scene
        blendPass = new ShaderPass(AdditiveBlendShader);
        blendPass.needsSwap = true;
        composer.addPass(blendPass);
    } catch (error) {
        console.error('EffectComposer failed to initialize:', error);
        composer = null;
        starComposer = null;
    }
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
    findMinJumpButton.addEventListener('click', findMinimumJumpRange);
    jumpToStartButton.addEventListener('click', () => jumpToRoutePoint('start'));
    jumpToEndButton.addEventListener('click', () => jumpToRoutePoint('end'));
    nextJumpButton.addEventListener('click', handleNextJump);
    followRouteButton.addEventListener('click', toggleFollowRoute);
    stellarTourButton.addEventListener('click', toggleStellarTour);
    document.getElementById('clear-search-button').addEventListener('click', clearSearch);
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.addEventListener('change', applyFilters));
    const bloomToggle = document.getElementById('bloom-toggle');
    const bloomStrength = document.getElementById('bloom-strength');
    const bloomStrengthValue = document.getElementById('bloom-strength-value');
    const bloomStrengthContainer = bloomStrength ? bloomStrength.closest('.p-2') : null;
    const visualPresetSelect = document.getElementById('visual-preset');
    const routeArrowsToggle = document.getElementById('route-arrows-toggle');
    const screenshotButton = document.getElementById('screenshot-button');
    if (bloomToggle && bloomStrength && bloomStrengthValue) {
        // Default: bloom off, slider hidden
        bloomToggle.checked = false;
        if (starBloomPass) starBloomPass.enabled = false;
        if (bloomStrengthContainer) bloomStrengthContainer.style.display = 'none';

        bloomToggle.addEventListener('change', () => {
            if (starBloomPass) starBloomPass.enabled = bloomToggle.checked;
            if (bloomStrengthContainer) bloomStrengthContainer.style.display = bloomToggle.checked ? '' : 'none';
        });
        bloomStrength.addEventListener('input', () => {
            const val = parseFloat(bloomStrength.value);
            bloomStrengthValue.textContent = val.toFixed(2);
            if (starBloomPass) starBloomPass.strength = val;
        });
        // Initialize from UI defaults
        if (starBloomPass) {
            starBloomPass.strength = parseFloat(bloomStrength.value);
        }
    }
    if (visualPresetSelect) {
        // Default: scientific preset
        visualPresetSelect.value = 'scientific';
        visualPresetSelect.addEventListener('change', () => applyVisualPreset(visualPresetSelect.value));
        applyVisualPreset('scientific');
    }
    if (routeArrowsToggle) {
        routeArrowsToggle.addEventListener('change', () => {
            routePlanner.showArrows = routeArrowsToggle.checked;
            // Redraw current route for immediate effect
            const activeRoute = getActiveRoute();
            if (activeRoute && activeRoute.path) drawRouteLine(activeRoute);
        });
        routePlanner.showArrows = routeArrowsToggle.checked;
    }
    if (screenshotButton) {
        screenshotButton.addEventListener('click', saveScreenshot);
    }
    constellationSelect.addEventListener('change', viewSelectedConstellation);
    searchInput.addEventListener('input', handleAutocomplete);
    sizeSlider.addEventListener('input', applyFilters);
    narrateButton.addEventListener('click', handleNarration);
    distanceSlider.addEventListener('input', applyFilters);
    document.addEventListener('click', (e) => {
        if (!autocompleteContainer.contains(e.target) && e.target !== searchInput) {
            autocompleteContainer.classList.add('hidden');
        }
    });
    
    createRouteSelectorButtons();
    buildSpectralLegend();

    activeControls = controls; // Start with OrbitControls



    animate();
}

async function loadAndPrepareStarData() {
    if (!loadingIndicator) {
        ErrorHandler.showError('Loading indicator not available - initialization failed');
        return false;
    }

    loadingIndicator.style.display = 'block';
    loadingIndicator.textContent = 'Loading star data...';

    try {
        // Attempt to load star data with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('stars.json', { 
            signal: controller.signal,
            cache: 'default' // Allow browser caching
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to load star data: HTTP ${response.status} ${response.statusText}`);
        }

        loadingIndicator.textContent = 'Parsing star data...';
        
        const rawData = await response.json();
        
        // Validate data structure
        if (!Array.isArray(rawData)) {
            throw new Error('Invalid star data format: expected array');
        }

        if (rawData.length === 0) {
            throw new Error('Star data is empty');
        }

        // Validate first few entries to ensure data integrity
        const sampleEntry = rawData[0];
        const requiredFields = ['name', 'x', 'y', 'z', 'dist', 'mag', 'spect'];
        const missingFields = requiredFields.filter(field => !(field in sampleEntry));
        
        if (missingFields.length > 0) {
            throw new Error(`Star data missing required fields: ${missingFields.join(', ')}`);
        }

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

        // --- Build the Octree for fast spatial queries ---
        console.log("Building Octree for spatial indexing...");
        const sceneBounds = new THREE.Box3().setFromPoints(fullStarData.map(s => new THREE.Vector3(s.x, s.y, s.z)));
        starOctree = new Octree(sceneBounds);
        fullStarData.forEach(star => starOctree.insert(star));
        console.log("Octree built successfully.");

        // Set up the size slider based on the calculated relativeRadiusScale
        const minSize = fullStarData.reduce((min, star) => Math.min(min, star.relativeRadiusScale), Infinity);
        const maxSize = fullStarData.reduce((max, star) => Math.max(max, star.relativeRadiusScale), 0);
        sizeSlider.min = minSize;
        sizeSlider.max = Math.ceil(maxSize);
        sizeSlider.step = 0.1;
        sizeSlider.value = sizeSlider.max;

        populateConstellationDropdown();
        console.log('About to apply filters...');
        applyFilters(); // This will perform the initial geometry creation
        console.log('Filters applied, scene children:', scene.children.length);
        updateUI();

        // --- Set initial camera to the calculated overview position ---
        const box = new THREE.Box3();
        const points = fullStarData.map(s => new THREE.Vector3(s.x, s.y, s.z));
        if (points.length > 0) {
            box.setFromPoints(points);
            const center = new THREE.Vector3();
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            
            console.log('Scene bounds:', box);
            console.log('Scene center:', sphere.center);
            console.log('Scene radius:', sphere.radius);
            
            const fov = camera.fov * (Math.PI / 180);
            let cameraDist = sphere.radius / Math.tan(fov / 2);
            cameraDist *= 1.1; // Add a 10% buffer so it's not edge-to-edge.
            
            const overviewPosition = new THREE.Vector3(sphere.center.x, sphere.center.y, sphere.center.z + cameraDist);
            camera.position.copy(overviewPosition);
            controls.target.copy(sphere.center);
            
            console.log('Camera position:', camera.position);
            console.log('Camera target:', controls.target);
        }
        // --- End of initial camera setup ---

        // Update camera and controls to fit the new, smaller scene
        const newMaxDistance = 2000;
        // Ensure the camera's far plane can see beyond the max zoom distance
        camera.far = newMaxDistance * 1.1;
        controls.maxDistance = newMaxDistance;
        camera.updateProjectionMatrix(); // This is crucial after changing camera.far
        
        console.log('Camera far plane:', camera.far);
        console.log('Camera near plane:', camera.near);
        console.log('Controls max distance:', controls.maxDistance);
    } catch (error) {
        loadingIndicator.style.display = 'none';
        
        // Handle different types of errors with specific messages
        let userMessage = 'Failed to load star data';
        let isRetryable = false;

        if (error.name === 'AbortError') {
            userMessage = 'Star data loading timed out. Please check your internet connection and try again.';
            isRetryable = true;
        } else if (error.message.includes('HTTP')) {
            userMessage = 'Could not download star data. Please check your internet connection.';
            isRetryable = true;
        } else if (error.message.includes('JSON')) {
            userMessage = 'Star data file is corrupted. Please refresh the page.';
            isRetryable = true;
        } else if (error.message.includes('format') || error.message.includes('fields')) {
            userMessage = 'Star data format is invalid. The application may need to be updated.';
        } else {
            userMessage = `Unexpected error loading star data: ${error.message}`;
        }

        ErrorHandler.showError(userMessage, error, isRetryable);
        
        // Show retry button for retryable errors
        if (isRetryable) {
            loadingIndicator.innerHTML = `
                <div style="text-align: center;">
                    <p>Failed to load star data</p>
                    <button onclick="location.reload()" style="
                        background: #7DF9FF;
                        color: #000;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 8px;
                    ">Retry</button>
                </div>
            `;
            loadingIndicator.style.display = 'block';
        }
        
        return false;
    }
}


function createStarGeometry(data) {
    // Remove previous stars from both scenes
    console.log('[createStarGeometry] called with data.length:', data.length, data.slice(0, 3));
    if (starsMesh) {
        scene.remove(starsMesh);
        if (starsMesh.geometry) starsMesh.geometry.dispose();
        if (starsMesh.material) starsMesh.material.dispose();
    }
    if (starsBloomMesh) {
        if (starScene) starScene.remove(starsBloomMesh);
        if (starsBloomMesh.geometry) starsBloomMesh.geometry.dispose();
        if (starsBloomMesh.material) starsBloomMesh.material.dispose();
    }

    if (data.length === 0) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        starsMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(), material, 0);
        starsBloomMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(), material, 0);
        scene.add(starsMesh);
        if (starScene) starScene.add(starsBloomMesh);
        console.log('[createStarGeometry] No data, added empty meshes');
        return;
    }

    const sphereGeometry = new THREE.SphereGeometry(BASE_STAR_RADIUS, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    starsMesh = new THREE.InstancedMesh(sphereGeometry, material, data.length);
    const bloomMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    starsBloomMesh = new THREE.InstancedMesh(sphereGeometry, bloomMaterial, data.length);
    starsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    starsBloomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    data.forEach((star, i) => {
        const scale = star.relativeRadiusScale * GLOBAL_VISUAL_SCALE;
        matrix.compose(
            new THREE.Vector3(star.x, star.y, star.z),
            new THREE.Quaternion(),
            new THREE.Vector3(scale, scale, scale)
        );
        starsMesh.setMatrixAt(i, matrix);
        starsBloomMesh.setMatrixAt(i, matrix);
        const c = getRGBfromCI(star.ci);
        starsMesh.setColorAt(i, color.setRGB(c.r, c.g, c.b));
        starsBloomMesh.setColorAt(i, color.setRGB(c.r, c.g, c.b));
    });
    console.log('[createStarGeometry] starsMesh.count:', starsMesh.count, 'starsBloomMesh.count:', starsBloomMesh.count);
    starsMesh.instanceMatrix.needsUpdate = true;
    starsMesh.instanceColor.needsUpdate = true;
    starsBloomMesh.instanceMatrix.needsUpdate = true;
    starsBloomMesh.instanceColor.needsUpdate = true;
    scene.add(starsMesh);
    if (starScene) starScene.add(starsBloomMesh);
    console.log('[createStarGeometry] Added meshes to scene:', scene.children.includes(starsMesh), starScene && starScene.children.includes(starsBloomMesh));
}

function createStarShaderMaterial() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
        },
        vertexShader: `
            attribute mat4 instanceMatrix;
            attribute float aCI;
            attribute float aTwinkle;
            attribute float aPulse;
            attribute float aHalo;
            varying float vRim;
            varying float vCI;
            varying float vTwinkle;
            varying float vPulse;
            varying float vHalo;
            varying vec3 vNormalVS;
            
            void main() {
                // Transform position and normal with instance and model matrices
                vec3 transformed = position;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
                // Normal in view space
                mat3 normalMat = mat3(modelViewMatrix * instanceMatrix);
                vNormalVS = normalize(normalMat * normal);
                // Rim factor using view-space normal vs camera forward (0,0,1)
                vRim = pow(1.0 - abs(dot(vNormalVS, vec3(0.0, 0.0, 1.0))), 2.0);

                vCI = aCI;
                vTwinkle = aTwinkle;
                vPulse = aPulse;
                vHalo = aHalo;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            precision highp float;
            uniform float uTime;
            varying float vRim;
            varying float vCI;
            varying float vTwinkle;
            varying float vPulse;
            varying float vHalo;

            vec3 colorFromCI(float ci) {
                if (ci < 0.0) return vec3(0.67, 0.85, 1.0);
                if (ci < 0.3) return vec3(1.0, 1.0, 1.0);
                if (ci < 0.6) return vec3(1.0, 1.0, 0.8);
                if (ci < 0.9) return vec3(1.0, 0.9, 0.5);
                if (ci < 1.4) return vec3(1.0, 0.7, 0.4);
                return vec3(1.0, 0.5, 0.5);
            }

            void main() {
                vec3 base = colorFromCI(vCI);
                float pulse = 1.0 + sin(uTime * vPulse) * vTwinkle;
                float rimGlow = vRim * vHalo;
                // Use pulse directly to modulate brightness and add a conservative bloom multiplier.
                vec3 color = base * pulse + base * rimGlow;
                gl_FragColor = vec4(color * 2.5, 1.0);
            }
        `,
    });
    material.transparent = false;
    material.depthWrite = true;
    material.depthTest = true;
    return material;
}

function getStarVisualParams(star) {
    // Archetype presets by spectral class and luminosity class (V, III, I)
    const spect = (star.spect || '').toUpperCase();
    const spectral = spect.length > 0 ? spect[0] : 'G';
    const lumClass = /I{1,3}|V|IV/.exec(spect)?.[0] || 'V';

    // Base table (spectral → defaults)
    const base = {
        'O': { tw: 0.02, pf: 1.2, h: 0.42 },
        'B': { tw: 0.02, pf: 1.1, h: 0.38 },
        'A': { tw: 0.025, pf: 1.0, h: 0.36 },
        'F': { tw: 0.03, pf: 0.9, h: 0.34 },
        'G': { tw: 0.035, pf: 0.8, h: 0.32 },
        'K': { tw: 0.04, pf: 0.7, h: 0.30 },
        'M': { tw: 0.05, pf: 0.6, h: 0.28 }
    }[spectral] || { tw: 0.035, pf: 0.8, h: 0.32 };

    // Luminosity adjustments
    const lumAdj = {
        'I':  { tw: -0.005, pf: -0.1, h: +0.08 }, // supergiants: bigger halo, slower pulse
        'II': { tw: -0.003, pf: -0.05, h: +0.06 },
        'III':{ tw: -0.002, pf: -0.05, h: +0.04 }, // giants
        'IV': { tw: 0.0, pf: 0.0, h: +0.01 },      // subgiants
        'V':  { tw: 0.0, pf: 0.0, h: 0.0 }         // main sequence
    }[lumClass] || { tw: 0.0, pf: 0.0, h: 0.0 };

    // Increased twinkle amplitude for more visibility
    let twinkleAmp = (base.tw + lumAdj.tw) * 4.0;
    let pulseFreq = base.pf + lumAdj.pf;
    // Increased halo factor for more visibility
    let haloFactor = (base.h + lumAdj.h) * 2.0;

    // Scale halo with intrinsic relative visual size
    haloFactor *= Math.min(1.0, star.relativeRadiusScale * 0.5);
    return { twinkleAmp, pulseFreq, haloFactor };
}

function buildSpectralLegend() {
    const container = document.getElementById('spectral-legend');
    if (!container) return;
    container.innerHTML = '';
    const classCounts = spectralClasses.reduce((acc, s) => (acc[s] = 0, acc), {});
    fullStarData.forEach(star => {
        const spect = (star.spect || '').toUpperCase();
        const s = spect.length > 0 ? spect[0] : null;
        if (s && classCounts[s] !== undefined) classCounts[s] += 1;
    });
    spectralClasses.forEach(s => {
        const color = getRGBfromCI(classRepresentativeCI(s));
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between';
        const left = document.createElement('div');
        left.className = 'flex items-center gap-2';
        const swatch = document.createElement('span');
        swatch.style.display = 'inline-block';
        swatch.style.width = '14px';
        swatch.style.height = '14px';
        swatch.style.borderRadius = '50%';
        swatch.style.backgroundColor = `rgb(${Math.round(color.r*255)}, ${Math.round(color.g*255)}, ${Math.round(color.b*255)})`;
        const label = document.createElement('span');
        label.textContent = s;
        left.appendChild(swatch);
        left.appendChild(label);
        const count = document.createElement('span');
        count.textContent = classCounts[s].toLocaleString();
        row.appendChild(left);
        row.appendChild(count);
        container.appendChild(row);
    });
}

function classRepresentativeCI(s) {
    switch(s) {
        case 'O': return -0.2;
        case 'B': return -0.05;
        case 'A': return 0.1;
        case 'F': return 0.35;
        case 'G': return 0.65;
        case 'K': return 1.0;
        case 'M': return 1.4;
        default: return 0.65;
    }
}

function applyVisualPreset(preset) {
    if ((!bloomPass && !starBloomPass) || !starShaderMaterial) return;
    if (preset === 'scientific') {
        if (bloomPass) bloomPass.enabled = false;
        if (starBloomPass) starBloomPass.enabled = false;
        // Optionally reduce twinkle/pulse globally
    } else if (preset === 'cinematic') {
        if (bloomPass) {
            bloomPass.enabled = true;
            bloomPass.strength = Math.max(bloomPass.strength, 0.6);
        }
        if (starBloomPass) {
            starBloomPass.enabled = true;
            starBloomPass.strength = Math.max(starBloomPass.strength, 0.6);
        }
    }
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

    const positions = [];
    const colors = [];
    const color = new THREE.Color(0x0055AA);
    
    const starMap = new Map(fullStarData.map(star => [star.proper?.toLowerCase(), star]));

    lines.forEach(linePair => {
        const star1 = starMap.get(linePair[0].toLowerCase());
        const star2 = starMap.get(linePair[1].toLowerCase());

        if (star1 && star2) {
            positions.push(star1.x, star1.y, star1.z, star2.x, star2.y, star2.z);
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
    });

    if (positions.length > 0) {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        geometry.setColors(colors);
        const mat = new LineMaterial({ color: 0x0055AA, linewidth: 0.002, transparent: true, opacity: 0.6 });
        mat.resolution.set(renderer.domElement.width, renderer.domElement.height);
        const line = new Line2(geometry, mat);
        line.computeLineDistances();
        constellationLinesGroup.add(line);
    }
}

function resetScene() {
    interruptTour();
    interruptRoutePlanner();
    stopFollowRoute();

    // --- Clear all route data as per the roadmap ---
    routePlanner.routes.forEach(route => {
        if (route && route.routeLine) {
            scene.remove(route.routeLine);
            route.routeLine.geometry.dispose();
            route.routeLine.material.dispose();
        }
    });
    routePlanner.routes = [];
    routePlanner.activeRouteIndex = 0;
    updateRoutePlannerUI();
    updateRouteNavigationUI();
    // --- End of route clearing ---

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
    const sol = fullStarData.find(star => star.name === 'Sol' || star.proper === 'Sol');
    if (sol) {
        frameObjectInView(sol);
    } else {
        console.warn('Sol not found in star data');
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
    console.log('[onPointerUp] isDragging:', isDragging, 'event:', event);
    // If the action was a drag, do not proceed with selection.
    if (isDragging) return;

    // Otherwise, it was a click. Perform the raycasting to select a star.
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(starsMesh);

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
    console.log('[frameObjectInView] called with:', star);
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
        showHeroStar(star);
    } else {
        selectionHighlight.visible = false;
        showHeroStar(null);
    }
}

let heroStarGroup = null;
function showHeroStar(star) {
    if (heroStarGroup) {
        scene.remove(heroStarGroup);
        heroStarGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        heroStarGroup = null;
    }
    if (!star) return;
    heroStarGroup = new THREE.Group();
    const pos = new THREE.Vector3(star.x, star.y, star.z);
    // Emissive core
    const coreGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(getRGBfromCI(star.ci).r, getRGBfromCI(star.ci).g, getRGBfromCI(star.ci).b) });
    const core = new THREE.Mesh(coreGeo, coreMat);
    heroStarGroup.add(core);
    // (Corona sprite removed to eliminate distracting white overlay)
    heroStarGroup.position.copy(pos);
    scene.add(heroStarGroup);
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
    // (No nested resetScene function here)
        interruptRoutePlanner();
        stopFollowRoute();

        // --- Clear all route data as per the roadmap ---
        routePlanner.routes.forEach(route => {
            if (route && route.routeLine) {
                scene.remove(route.routeLine);
                route.routeLine.geometry.dispose();
                route.routeLine.material.dispose();
            }
        });
        routePlanner.routes = [];
        routePlanner.activeRouteIndex = 0;
        updateRoutePlannerUI();
        updateRouteNavigationUI();
        // --- End of route clearing ---

        // Remove stars from both scenes
        if (starsMesh) {
            scene.remove(starsMesh);
            if (starsMesh.geometry) starsMesh.geometry.dispose();
            if (starsMesh.material) starsMesh.material.dispose();
            starsMesh = null;
        }
        if (starsBloomMesh) {
            if (starScene) starScene.remove(starsBloomMesh);
            if (starsBloomMesh.geometry) starsBloomMesh.geometry.dispose();
            if (starsBloomMesh.material) starsBloomMesh.material.dispose();
            starsBloomMesh = null;
        }

        // Only reset to overview, do not call this from star selection or snapToSol
        const box = new THREE.Box3();
        const points = fullStarData.map(s => new THREE.Vector3(s.x, s.y, s.z));
        if (points.length > 0) {
            box.setFromPoints(points);
            const center = new THREE.Vector3();
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            const fov = camera.fov * (Math.PI / 180);
            let cameraDist = sphere.radius / Math.tan(fov / 2);
            cameraDist *= 1.1;
            const targetPosition = new THREE.Vector3(sphere.center.x, sphere.center.y, sphere.center.z + cameraDist);
            animateCameraTo(sphere.center, targetPosition, null);
        } else {
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
        if (composer) composer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        if (bloomPass) bloomPass.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        if (starComposer) starComposer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        if (starBloomPass) starBloomPass.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        // Update LineMaterial resolutions for Line2 materials
        constellationLinesGroup.children.forEach(obj => {
            if (obj.material && obj.material.resolution) {
                obj.material.resolution.set(renderer.domElement.width, renderer.domElement.height);
            }
        });
        if (routePlanner && routePlanner.routes) {
            routePlanner.routes.forEach(r => {
                if (r && r.routeLine && r.routeLine.material && r.routeLine.material.resolution) {
                    r.routeLine.material.resolution.set(renderer.domElement.width, renderer.domElement.height);
                }
            });
        }
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

    // Kill any active GSAP animations on the camera and controls
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);

    // Since animations are stopped, re-enable controls immediately.
    activeControls.enabled = true;
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

        if (hasDetails && stellarTour.targetStar.proper) {
            setTimeout(() => {
                if (stellarTour.active) handleTourNarration();
            }, 1000);
        } else {
            stellarTour.timer = setTimeout(selectNextTourStar, 10000);
        }
    };
    initiateTourFlight(nextStar, onTourStepComplete);
}

function handleTourNarration() {
    if (!stellarTour.active) return;
    const text = originalNarrationText;
    if (!text) {
        if (stellarTour.active) {
            stellarTour.timer = setTimeout(selectNextTourStar, 1000);
        }
        return;
    }

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
        starDescription.textContent = originalNarrationText; // Restore original text
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
    stopFollowRoute();
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
        // When entering planner, show all existing route lines
        routePlanner.routes.forEach(route => {
            if (route && route.routeLine) {
                route.routeLine.visible = true;
            }
        });

        if (selectionHighlight.visible) {
            routeButtonsContainer.classList.remove('hidden');
        }
    } else {
        // Reset and hide everything
        toggleRoutePlannerButton.textContent = 'Plan Route';
        toggleRoutePlannerButton.classList.remove('active-mode');
        routePlannerContainer.classList.add('hidden');
        routeButtonsContainer.classList.add('hidden'); 
        routePlanner.currentSelection = null;
        // Hide all route lines when exiting planner mode
        routePlanner.routes.forEach(route => {
            if (route && route.routeLine) {
                route.routeLine.visible = false;
            }
        });
    }
}

function getActiveRoute() {
    return routePlanner.routes[routePlanner.activeRouteIndex];
}

function setRouteStart() {
    if (!routePlanner.currentSelection) return;

    // Find or create the route object for the active index
    let activeRoute = routePlanner.routes[routePlanner.activeRouteIndex];
    if (!activeRoute) { // If the route object doesn't exist, create it
        activeRoute = { startStar: null, endStar: null, path: null, routeLine: null };
        routePlanner.routes[routePlanner.activeRouteIndex] = activeRoute;
    }

    activeRoute.startStar = routePlanner.currentSelection;
    updateRoutePlannerUI();
}

function setRouteEnd() {
    if (!routePlanner.currentSelection) return;

    let activeRoute = routePlanner.routes[routePlanner.activeRouteIndex];
    if (!activeRoute) { // If the route object doesn't exist, create it
        activeRoute = { startStar: null, endStar: null, path: null, routeLine: null };
        routePlanner.routes[routePlanner.activeRouteIndex] = activeRoute;
    }

    activeRoute.endStar = routePlanner.currentSelection;
    updateRoutePlannerUI();
}

function updateRoutePlannerUI() {
    const activeRoute = getActiveRoute();
    if (activeRoute) {
        routeStartStar.textContent = activeRoute.startStar ? activeRoute.startStar.name : 'None';
        routeEndStar.textContent = activeRoute.endStar ? activeRoute.endStar.name : 'None';
    } else {
        routeStartStar.textContent = 'None';
        routeEndStar.textContent = 'None';
    }
    document.getElementById('active-route-display').textContent = routePlanner.activeRouteIndex + 1;
}

function calculateRoute() {
    const activeRoute = getActiveRoute();
    if (!activeRoute || !activeRoute.startStar || !activeRoute.endStar) {
        alert("Please select a start and end star for the route.");
        return;
    }

    const maxJump = parseFloat(maxJumpRangeInput.value);
    if (isNaN(maxJump) || maxJump <= 0) {
        alert("Please enter a valid maximum jump range.");
        return;
    }

    console.log(`Calculating route from ${activeRoute.startStar.name} to ${activeRoute.endStar.name} with max jump of ${maxJump} pc.`);
    
    // --- UI Feedback ---
    calculateRouteButton.disabled = true;
    findMinJumpButton.disabled = true;
    routeCalculatingMessage.textContent = 'Calculating Route...';
    routeCalculatingMessage.classList.remove('hidden');
    drawRouteLine(null); // Clear previous line for this route

    startSearchBubbleAnimation(activeRoute.startStar, activeRoute.endStar, maxJump);

    // Use a timeout to allow the UI to update and the animation to start
    setTimeout(() => {
        const result = findPathAStar(activeRoute.startStar, activeRoute.endStar, maxJump);
        
        stopSearchBubbleAnimation();

        if (result && result.path && result.path.length > 1) {
            console.log("Route found:", result.path.map(p => p.name).join(" -> "));
            activeRoute.path = result.path;
            routePlanner.currentJumpIndex = 0;
            drawRouteLine(activeRoute); // This has its own animation
            if (result.stranded) {
                alert("Dead End! Could not reach the destination. Showing the closest possible route.");
            }
        } else {
            alert("No route could be found with the specified maximum jump range.");
            updateRouteNavigationUI(); // Ensure nav is hidden if route fails
        }

        // --- Final UI Cleanup ---
        calculateRouteButton.disabled = false;
        findMinJumpButton.disabled = false;
        routeCalculatingMessage.classList.add('hidden');
    }, 100); // A small delay is enough
}

function findMinimumJumpRange() {
    const activeRoute = getActiveRoute();
    if (!activeRoute) {
        alert("No active route to calculate. Please set a start and end star.");
        return;
    }

    if (!activeRoute.startStar || !activeRoute.endStar) {
        alert("Please select a start and end star first.");
        return;
    }

    const initialMaxJump = parseFloat(maxJumpRangeInput.value);
    if (isNaN(initialMaxJump) || initialMaxJump <= 0) {
        alert("Please enter a valid starting maximum jump range.");
        return;
    }

    // --- UI Feedback ---
    calculateRouteButton.disabled = true;
    findMinJumpButton.disabled = true;
    routeCalculatingMessage.textContent = 'Calculating Min. Jump...';
    routeCalculatingMessage.classList.remove('hidden'); 
    drawRouteLine(null); // Clear the line for the active route

    // Use an async IIFE (Immediately Invoked Function Expression) to run the logic
    (async () => {
        console.log(`Searching for minimum jump range between ${activeRoute.startStar.name} and ${activeRoute.endStar.name}, starting from ${initialMaxJump} pc.`);
        startSearchBubbleAnimation(activeRoute.startStar, activeRoute.endStar, initialMaxJump);

        let low = 0;
        let high = initialMaxJump;
        let minViableRange = initialMaxJump;
        let bestPath = null;

        const initialResult = findPathAStar(activeRoute.startStar, activeRoute.endStar, high);
        if (!initialResult || initialResult.stranded) {
            alert(`No route possible even with a jump range of ${high} pc.`);
        } else {
            bestPath = initialResult.path;
            while (low <= high) {
                const mid = low + Math.floor((high - low) / 2);
                if (mid === 0) { low = 1; continue; } // Avoid getting stuck at 0

                const result = findPathAStar(activeRoute.startStar, activeRoute.endStar, mid);
                if (result && !result.stranded) {
                    minViableRange = mid;
                    bestPath = result.path;
                    high = mid - 1; // Try an even smaller range
                } else {
                    low = mid + 1; // Range was too small, must try a larger range
                }
                // Yield to the event loop to keep the UI responsive
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        stopSearchBubbleAnimation();
        maxJumpRangeInput.value = minViableRange;
        activeRoute.path = bestPath;
        routePlanner.currentJumpIndex = 0; // Reset jump progress
        drawRouteLine(activeRoute);
        if (bestPath) {
            alert(`Minimum viable jump range is approximately ${minViableRange.toFixed(2)} pc.`);
        }

        // --- Final UI Cleanup ---
        calculateRouteButton.disabled = false;
        findMinJumpButton.disabled = false;
        routeCalculatingMessage.classList.add('hidden');
      })();
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

function findPathAStar(startNode, endNode, maxJump) {
    try {
        // Validate inputs
        if (!startNode || !endNode) {
            throw new Error('Start and end nodes are required for pathfinding');
        }

        if (!startNode.name || !endNode.name) {
            throw new Error('Invalid node data: missing name property');
        }

        if (typeof maxJump !== 'number' || maxJump <= 0) {
            throw new Error('Maximum jump distance must be a positive number');
        }

        if (!fullStarData || fullStarData.length === 0) {
            throw new Error('No star data available for pathfinding');
        }

        if (!starOctree) {
            throw new Error('Spatial index (Octree) not initialized');
        }

        // Performance timeout for large searches
        const startTime = Date.now();
        const MAX_EXECUTION_TIME = 10000; // 10 seconds

        const openSet = new PriorityQueue();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const nodeMap = new Map(fullStarData.map(node => [node.name, node]));
        
        // Verify start and end nodes exist in the dataset
        if (!nodeMap.has(startNode.name)) {
            throw new Error(`Start node "${startNode.name}" not found in star data`);
        }
        if (!nodeMap.has(endNode.name)) {
            throw new Error(`End node "${endNode.name}" not found in star data`);
        }
        
        fullStarData.forEach(node => {
            gScore.set(node.name, Infinity);
            fScore.set(node.name, Infinity);
        });

        gScore.set(startNode.name, 0);
        fScore.set(startNode.name, heuristic(startNode, endNode));
        openSet.enqueue(startNode, fScore.get(startNode.name));

        let iterations = 0;
        const MAX_ITERATIONS = 50000; // Prevent infinite loops

        while (!openSet.isEmpty()) {
            // Check for timeout and iteration limits
            iterations++;
            if (iterations > MAX_ITERATIONS) {
                throw new Error('Pathfinding exceeded maximum iterations limit');
            }

            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                throw new Error('Pathfinding timed out - try reducing search area or max jump distance');
            }

            const current = openSet.dequeue();
            if (!current) break; // Safety check

            if (current.name === endNode.name) {
                // Path found, reconstruct it
                const totalPath = [current];
                let temp = current;
                while (cameFrom.has(temp.name)) {
                    temp = cameFrom.get(temp.name);
                    totalPath.unshift(temp);
                }
                console.log(`A* pathfinding completed in ${iterations} iterations, ${Date.now() - startTime}ms`);
                return { path: totalPath, stranded: false };
            }

            // Use the Octree to find neighbors efficiently
            let neighbors;
            try {
                neighbors = starOctree.query(current, maxJump).filter(n => n.name !== current.name);
            } catch (octreeError) {
                throw new Error(`Octree query failed: ${octreeError.message}`);
            }

            for (const neighbor of neighbors) {
                if (!neighbor || !neighbor.name) continue; // Skip invalid neighbors

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
                if (reachableNode) {
                    const h = heuristic(reachableNode, endNode);
                    if (h < minHeuristic) {
                        minHeuristic = h;
                        closestNode = reachableNode;
                    }
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

        console.log(`A* pathfinding completed (stranded) in ${iterations} iterations, ${Date.now() - startTime}ms`);
        
        // If the path is just the start node, we couldn't go anywhere.
        return partialPath.length > 1 ? { path: partialPath, stranded: true } : null;
        
    } catch (error) {
        ErrorHandler.showError(
            `Route calculation failed: ${error.message}`,
            error
        );
        
        // Re-enable UI elements
        if (calculateRouteButton) calculateRouteButton.disabled = false;
        if (findMinJumpButton) findMinJumpButton.disabled = false;
        if (routeCalculatingMessage) routeCalculatingMessage.classList.add('hidden');
        
        return null;
    }
}

function distance(nodeA, nodeB) {
    return Math.sqrt(Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2) + Math.pow(nodeA.z - nodeB.z, 2));
}

function heuristic(nodeA, nodeB) {
    // Euclidean distance is a perfect heuristic for this 3D space
    return distance(nodeA, nodeB);
}

function drawRouteLine(route) {
    // This function now takes the entire route object.
    // If route is null, it clears the line for the *active* route.
    const routeToClear = route || getActiveRoute();
    if (routeToClear && routeToClear.routeLine) {
        if (routeToClear.routeFlowTween) {
            routeToClear.routeFlowTween.kill();
            routeToClear.routeFlowTween = null;
        }
        scene.remove(routeToClear.routeLine);
        routeToClear.routeLine.geometry.dispose();
        routeToClear.routeLine.material.dispose();
        routeToClear.routeLine = null;
    }

    // If no valid route object with a path is provided, we're done.
    if (!route || !route.path || route.path.length < 2) {
        updateRouteNavigationUI(); // Hide nav if no valid line is drawn
        return;
    }

    const positions = [];
    route.path.forEach(star => positions.push(star.x, star.y, star.z));
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const color = routePlanner.routeColors[routePlanner.routes.indexOf(route)] || 0xFF00FF;
    const material = new LineMaterial({ color, linewidth: 0.003, transparent: true, opacity: 1.0 });
    material.dashed = true;
    material.dashSize = 0.02;
    material.gapSize = 0.01;
    material.dashOffset = 0.0;
    material.resolution.set(renderer.domElement.width, renderer.domElement.height);
    route.routeLine = new Line2(geometry, material);
    route.routeLine.computeLineDistances();
    route.routeLine.scale.set(1, 1, 1);
    scene.add(route.routeLine);
    // Animate dash offset for flow effect
    route.routeFlowTween = gsap.to(route.routeLine.material, { dashOffset: -1.0, duration: 4, ease: "none", repeat: -1 });
    if (routePlanner.showArrows) {
        addRouteArrows(route);
    }
    updateRouteNavigationUI();
}

function addRouteArrows(route) {
    // Remove existing arrows
    if (route.arrowSprites && route.arrowSprites.length) {
        route.arrowSprites.forEach(s => scene.remove(s));
    }
    route.arrowSprites = [];
    const texture = createArrowTexture();
    const mat = new THREE.SpriteMaterial({ map: texture, color: routePlanner.routeColors[routePlanner.routes.indexOf(route)] || 0xFF00FF, transparent: true, opacity: 0.9 });
    // Place arrows along each segment
    for (let i = 0; i < route.path.length - 1; i++) {
        const a = route.path[i];
        const b = route.path[i + 1];
        const pos = new THREE.Vector3().addVectors(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)).multiplyScalar(0.5);
        const sprite = new THREE.Sprite(mat.clone());
        const scale = 2.5; // screen/world dependent; modest size
        sprite.scale.set(scale, scale, 1);
        sprite.position.copy(pos);
        // Orient roughly along segment: face camera but we can rotate UV by angle if using a quad; sprite faces camera so just place
        scene.add(sprite);
        route.arrowSprites.push(sprite);
    }
}

let cachedArrowCanvas = null;
function createArrowTexture() {
    if (cachedArrowCanvas) return new THREE.CanvasTexture(cachedArrowCanvas);
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    // Simple rightward triangle arrow
    ctx.moveTo(20, size/2 - 10);
    ctx.lineTo(size - 20, size/2);
    ctx.lineTo(20, size/2 + 10);
    ctx.closePath();
    ctx.fill();
    cachedArrowCanvas = canvas;
    return new THREE.CanvasTexture(canvas);
}

function createRouteSelectorButtons() {
    const container = document.getElementById('route-selector-buttons');
    container.innerHTML = ''; // Clear any existing buttons
    for (let i = 0; i < routePlanner.maxRoutes; i++) {
        const button = document.createElement('button');
        button.textContent = i + 1;
        button.className = 'custom-button route-selector-btn text-xs px-2 py-1';
        if (i === routePlanner.activeRouteIndex) {
            button.classList.add('active-mode');
        }
        button.onclick = () => setActiveRoute(i);
        container.appendChild(button);
    }
}

function setActiveRoute(index) {
    if (index < 0 || index >= routePlanner.maxRoutes) return;

    routePlanner.activeRouteIndex = index;

    updateRoutePlannerUI();
    createRouteSelectorButtons(); // Redraw buttons to update the 'active' class
    updateRouteNavigationUI();
}

function updateRouteNavigationUI() {
    const activeRoute = getActiveRoute();

    if (routePlanner.active && activeRoute && activeRoute.path && activeRoute.path.length > 1) {
        routeNavigationContainer.classList.remove('hidden');
        routeProgressDisplay.classList.remove('hidden');
        
        jumpToStartButton.disabled = false;
        jumpToEndButton.disabled = false;
        nextJumpButton.disabled = false;

        const totalJumps = activeRoute.path.length - 1;
        const currentLeg = routePlanner.currentJumpIndex;
        routeProgressDisplay.textContent = `Jumps: ${currentLeg} / ${totalJumps}`;

    } else {
        routeNavigationContainer.classList.add('hidden');
        routeProgressDisplay.classList.add('hidden');
        routeProgressDisplay.textContent = '';
    }
}

function jumpToRoutePoint(point) {
    const activeRoute = getActiveRoute();
    if (!activeRoute) return;

    if (point === 'start' && activeRoute.startStar) {
        routePlanner.currentJumpIndex = 0;
        frameObjectInView(activeRoute.startStar);
    } else if (point === 'end' && activeRoute.endStar) {
        routePlanner.currentJumpIndex = activeRoute.path.length - 1;
        frameObjectInView(activeRoute.endStar);
    }
    updateRouteNavigationUI();
}

function handleNextJump() {
    const activeRoute = getActiveRoute();
    if (!activeRoute || !activeRoute.path || activeRoute.path.length < 2) return;

    // Increment the jump index
    routePlanner.currentJumpIndex++;

    // If we've gone past the last star, loop back to the start
    if (routePlanner.currentJumpIndex >= activeRoute.path.length) {
        routePlanner.currentJumpIndex = 0;
    }

    const nextStar = activeRoute.path[routePlanner.currentJumpIndex];
    if (nextStar) {
        frameObjectInView(nextStar);
    }

    updateRouteNavigationUI();
}

function toggleFollowRoute() {
    if (routePlanner.routeTour.active) {
        stopFollowRoute();
    } else {
        followRoute();
    }
}

function followRoute() {
    const activeRoute = getActiveRoute();
    if (!activeRoute || !activeRoute.path || activeRoute.path.length < 2) {
        alert("Please calculate a route first.");
        return;
    }

    routePlanner.routeTour.active = true;
    followRouteButton.textContent = "Stop Following";
    followRouteButton.classList.add('active-mode');

    // Start from the current position
    const nextStar = activeRoute.path[routePlanner.currentJumpIndex];
    if (nextStar) {
        frameObjectInView(nextStar, () => {
            routePlanner.routeTour.timer = setTimeout(handleNextJumpOnTour, 2000);
        });
    }
}

function stopFollowRoute() {
    routePlanner.routeTour.active = false;
    clearTimeout(routePlanner.routeTour.timer);
    followRouteButton.textContent = "Follow Route";
    followRouteButton.classList.remove('active-mode');
}

function handleNextJumpOnTour() {
    if (!routePlanner.routeTour.active) return;

    handleNextJump();
    const activeRoute = getActiveRoute();
    const nextStar = activeRoute.path[routePlanner.currentJumpIndex];

    if (nextStar) {
        frameObjectInView(nextStar, () => {
            // If it's the last star, stop the tour
            if (routePlanner.currentJumpIndex === activeRoute.path.length - 1) {
                stopFollowRoute();
            } else {
                routePlanner.routeTour.timer = setTimeout(handleNextJumpOnTour, 2000);
            }
        });
    }
}

function stopSearchBubbleAnimation() {
    searchBubble.visible = false;
    gsap.killTweensOf(searchBubble.scale);
    gsap.killTweensOf(searchBubble.position);
}

function startSearchBubbleAnimation(startNode, endNode, maxJump) {
    const startVec = new THREE.Vector3(startNode.x, startNode.y, startNode.z);
    const endVec = new THREE.Vector3(endNode.x, endNode.y, endNode.z);

    searchBubble.position.copy(startVec);
    searchBubble.scale.set(0.1, 0.1, 0.1);
    searchBubble.visible = true;

    const distance = startVec.distanceTo(endVec);
    const travelDuration = Math.max(1, distance / 100);

    gsap.to(searchBubble.position, {
        x: endVec.x,
        y: endVec.y,
        z: endVec.z,
        duration: travelDuration,
        ease: "power1.inOut"
    });

    gsap.to(searchBubble.scale, {
        x: maxJump * 0.5,
        y: maxJump * 0.5,
        z: maxJump * 0.5,
        duration: 0.7,
        repeat: -1,
        yoyo: true,
        ease: "power1.inOut"
    });
}

// --- Octree Implementation for fast spatial queries ---

class Octree {
    constructor(boundary, capacity = 8) {
        this.boundary = boundary; // A THREE.Box3
        this.capacity = capacity; // Max number of points before subdividing
        this.points = [];
        this.divided = false;
    }

    subdivide() {
        const { min, max } = this.boundary;
        const halfSize = new THREE.Vector3().subVectors(max, min).multiplyScalar(0.5);

        const childrenBounds = [
            // Bottom half
            new THREE.Box3(min, new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z), new THREE.Vector3(max.x, min.y + halfSize.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z + halfSize.z), new THREE.Vector3(max.x, min.y + halfSize.y, max.z)),
            // Top half
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z), new THREE.Vector3(min.x + halfSize.x, max.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z), new THREE.Vector3(max.x, max.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, max.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z), max)
        ];

        this.children = childrenBounds.map(b => new Octree(b, this.capacity));
        this.divided = true;

        // Move points from this node to its children
        for (const p of this.points) {
            for (const child of this.children) {
                if (child.insert(p)) break;
            }
        }
        this.points = [];
    }

    insert(point) {
        const pointVec = new THREE.Vector3(point.x, point.y, point.z);
        if (!this.boundary.containsPoint(pointVec)) {
            return false;
        }

        if (this.points.length < this.capacity && !this.divided) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        for (const child of this.children) {
            if (child.insert(point)) return true;
        }
    }

    query(center, radius) {
        let found = [];
        const querySphere = new THREE.Sphere(new THREE.Vector3(center.x, center.y, center.z), radius);

        if (!this.boundary.intersectsSphere(querySphere)) {
            return found;
        }

        for (const p of this.points) {
            if (distance(center, p) <= radius) {
                found.push(p);
            }
        }

        if (this.divided) {
            for (const child of this.children) {
                found = found.concat(child.query(center, radius));
            }
        }
        return found;
    }
}

function interruptTour() {
    if (stellarTour.active) {
        stopStellarTour();
    }
}

function animateCameraTo(target, position, onCompleteCallback = null) {
    // Kill any ongoing animations on the camera to prevent conflicts
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);

    const travelDistance = camera.position.distanceTo(position);
    // Calculate a dynamic duration. Min 1s, max 4s.
    // Adjust the divisor (e.g., 500) to change how distance affects speed.
    const duration = Math.max(1, Math.min(4, travelDistance / 500));

    activeControls.enabled = false;

    // Animate the camera's position
    gsap.to(camera.position, {
        x: position.x,
        y: position.y,
        z: position.z,
        duration: duration,
        ease: "power2.inOut"
    });

    // Animate the controls' target (the point the camera looks at)
    gsap.to(controls.target, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: duration,
        ease: "power2.inOut",
        onComplete: () => {
            // Only re-enable user controls if the tour isn't active.
            if (!stellarTour.active) {
                activeControls.enabled = true;
            }
            // Execute the callback if it exists
            if (onCompleteCallback) {
                onCompleteCallback();
            }
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (starShaderMaterial) {
        starShaderMaterial.uniforms.uTime.value += delta;
    }

    // GSAP updates itself automatically.

    if (stellarTour.active && stellarTour.state === 'orbiting' && stellarTour.targetStar) {
        const targetPosition = new THREE.Vector3(stellarTour.targetStar.x, stellarTour.targetStar.y, stellarTour.targetStar.z);
        const orbitSpeed = 0.1;
        const orbitAxis = new THREE.Vector3(0, 1, 0);
        const offset = new THREE.Vector3().subVectors(camera.position, targetPosition);
        offset.applyAxisAngle(orbitAxis, orbitSpeed * delta);
        camera.position.copy(targetPosition).add(offset);
        camera.lookAt(targetPosition);
    } else {
        if (activeControls === flyControls) {
            flyControls.update(delta);
        } else {
            controls.update();
        }
    }

    // --- Two-pass rendering for per-star bloom ---
    if (starComposer && composer) {
        // 1. Render only the stars to starComposer (with bloom)
        starComposer.render();

        // 2. Render the main scene (no bloom)
        composer.render();

        // 3. Composite: Additively blend the starComposer output over the main scene
    // If you want to composite star bloom, use EffectComposer passes or custom shaders.
    // The following lines were removed because globalCompositeOperation is not available on WebGLRenderer.
    // To implement additive blending, use a ShaderPass or custom post-processing.
    } else if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
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

function saveScreenshot() {
    // Render once to ensure latest frame
    if (composer) composer.render(); else renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = dataURL;
    a.download = `3D_Star_Map_${date}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


init();
// End of file: add missing closing brace if needed
