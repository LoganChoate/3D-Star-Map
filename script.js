// Modular 3D Star Map Explorer
import * as THREE from './vendor/three/build/three.module.js';
import { StarRenderer } from './modules/StarRenderer.js';
import { RouteManager } from './modules/RouteManager.js';
import { TourController } from './modules/TourController.js';
import { UIManager } from './modules/UIManager.js';
import { Octree, Box3D } from './utils/SpatialIndex.js';
import { filterStars } from './utils/StarFilters.js';
import { buildStarIndex } from './utils/StarIdentity.js';
import { ExplorationController } from './modules/ExplorationController.js';

// Import external data modules
import { getConstellationData } from './constellations.js';
import { starDetails } from './star_details.js';

// Global data
let fullStarData = [];
let activeStarData = [];
let starOctree = null;
let hasGarbageSphere = false;
let garbageSphereDistance = null;
let maxDistanceWithGarbage = 0;
let maxDistanceWithoutGarbage = 0;

const GARBAGE_SPHERE_EPSILON = 1e-3;

// Module instances
let starRenderer = null;
let routeManager = null;
let tourController = null;
let uiManager = null;
let explorer = null;

// DEBUG: Expose to window
window.starRenderer = null;

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

// Constants for star calculations
const SOL_ABSOLUTE_MAGNITUDE = 4.83;
const BASE_STAR_RADIUS = 1.0;
const GLOBAL_VISUAL_SCALE = 0.5;
const spectralClasses = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

// Main initialization function
async function init() {
    try {
        console.log('Initializing 3D Star Map Explorer...');

        // Get canvas element
        const canvas = document.getElementById('renderCanvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }

        // Initialize modules
        starRenderer = new StarRenderer(canvas, ErrorHandler);
        window.starRenderer = starRenderer; // DEBUG: Expose instance
        routeManager = new RouteManager(starRenderer, ErrorHandler);
        tourController = new TourController(starRenderer, ErrorHandler);
        uiManager = new UIManager(starRenderer, routeManager, tourController, ErrorHandler);

        // Initialize star renderer
        if (!await starRenderer.initialize()) {
            throw new Error('Failed to initialize 3D renderer');
        }

        await starRenderer.loadVisualPresets();

        // Initialize UI manager
        if (!await uiManager.initialize()) {
            throw new Error('Failed to initialize UI manager');
        }

        // Load and prepare star data
        if (!await loadAndPrepareStarData()) {
            throw new Error('Failed to load star data');
        }

        // Set up module data references
        routeManager.setData(fullStarData, starOctree);
        tourController.setData(fullStarData, starDetails);
        uiManager.setData(fullStarData, activeStarData, starDetails);

        // Set up UI references for tour controller
        tourController.setUIElements(
            uiManager.elements.starDescription,
            uiManager.elements.starDescriptionContainer
        );

        // Set up event listeners for custom events
        setupCustomEventListeners();

        // Populate constellation dropdown
        uiManager.populateConstellationDropdown();

        // Apply initial filters
        applyFilters();

        // Build spectral legend
        buildSpectralLegend();

        explorer = new ExplorationController({
            mount: document.getElementById('exploration-root'),
            onModeChange: mode => {
                if (mode !== 'atlas') {
                    if (tourController.isActive()) tourController.stop();
                    routeManager.stopFollowRoute();
                    window.gsap?.killTweensOf(starRenderer.camera.position);
                    window.gsap?.killTweensOf(starRenderer.controls.target);
                    window.speechSynthesis?.cancel();
                    // Disabled FlyControls ignore key releases, so discard held
                    // input before another view takes over the keyboard.
                    const flight = starRenderer.flyControls;
                    for (const key of Object.keys(flight.moveState)) flight.moveState[key] = 0;
                    flight.status = 0;
                    flight.movementSpeedMultiplier = 1;
                    flight.updateMovementVector();
                    flight.updateRotationVector();
                } else {
                    // The atlas render loop pauses while exploration is open.
                    starRenderer.clock.getDelta();
                }
                starRenderer.activeControls.enabled = mode === 'atlas';
                if (mode === 'atlas') requestAnimationFrame(() => starRenderer.onWindowResize());
            }
        });
        await explorer.initialize(fullStarData);

        // Start animation loop
        animate();

        window.galaxyMap = Object.freeze({ renderer: starRenderer, ui: uiManager, routes: routeManager, tour: tourController, explorer });
        console.log('3D Star Map Explorer initialized successfully');

    } catch (error) {
        ErrorHandler.showError('Failed to initialize application', error);
        console.error('Initialization failed:', error);
    }
}

async function loadAndPrepareStarData() {
    const loadingIndicator = document.getElementById('loading-indicator');
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

        buildStarIndex(rawData); // Reject missing or duplicate catalog identities before rendering.
        loadingIndicator.textContent = 'Processing star data...';



        const garbageSphereToggle = document.getElementById('garbage-sphere-filter');



        // Step 1: Initial parsing of raw data into a workable format.

        const initialData = rawData.map(star => {

            const numericDist = Number(star.dist);

            const numericMag = Number(star.mag);

            const numericCI = Number(star.ci);

            const numericX = Number(star.x);

            const numericY = Number(star.y);

            const numericZ = Number(star.z);

            const safeMag = Number.isFinite(numericMag) ? numericMag : 0;

            return {

                id: star.id,
                proper: star.proper,
                name: star.name,

                x: Number.isFinite(numericX) ? numericX : 0,

                y: Number.isFinite(numericY) ? numericY : 0,

                z: Number.isFinite(numericZ) ? numericZ : 0,

                dist: Number.isFinite(numericDist) ? numericDist : 0,

                mag: safeMag,

                spect: star.spect,

                ci: Number.isFinite(numericCI) ? numericCI : 0.65,

                relativeRadiusScale: Math.min(10, Math.max(0.1, calculateStarRadius(safeMag)))

            };

        });



        console.log(`Loaded ${initialData.length} stars`);



        const maxDistance = initialData.reduce((max, star) => Math.max(max, star.dist || 0), 0);

        hasGarbageSphere = maxDistance > 0 && initialData.some(star => Math.abs((star.dist || 0) - maxDistance) < GARBAGE_SPHERE_EPSILON);

        garbageSphereDistance = hasGarbageSphere ? maxDistance : null;



        const processedData = initialData.map(star => {

            const isGarbage = hasGarbageSphere && Math.abs((star.dist || 0) - maxDistance) < GARBAGE_SPHERE_EPSILON;

            return { ...star, isGarbageSphere: isGarbage };

        });



        maxDistanceWithGarbage = Math.ceil(maxDistance);

        const maxRealDistance = processedData

            .filter(star => !star.isGarbageSphere)

            .reduce((max, star) => Math.max(max, star.dist || 0), 0);

        maxDistanceWithoutGarbage = Math.ceil(maxRealDistance || maxDistance);



        fullStarData = processedData;

        starRenderer.setFullStarData(fullStarData);



        loadingIndicator.textContent = 'Building spatial index...';



        // Build octree for spatial queries

        const sceneBounds = calculateSceneBounds(fullStarData);

        starOctree = new Octree(sceneBounds);

        fullStarData.forEach(star => {
            if (!starOctree.insert(star)) throw new Error(`Could not index star ${star.id}`);
        });

        console.log("Octree built successfully.");



        // Set up size slider based on calculated relativeRadiusScale

        const sizeSlider = document.getElementById('size-slider');

        if (sizeSlider) {

            const minSize = fullStarData.reduce((min, star) => Math.min(min, star.relativeRadiusScale), Infinity);

            const maxSize = fullStarData.reduce((max, star) => Math.max(max, star.relativeRadiusScale), 0);

            sizeSlider.min = minSize;

            sizeSlider.max = Math.ceil(maxSize);

            sizeSlider.step = 0.1;

            sizeSlider.value = sizeSlider.max;

            const sizeValue = document.getElementById('size-value');

            if (sizeValue) {

                sizeValue.textContent = sizeSlider.value;

            }

        }



        const distanceSlider = document.getElementById('distance-slider');

        if (distanceSlider) {

            const stepWithGarbage = Math.max(0.1, Math.ceil(maxDistanceWithGarbage / 500));

            const stepWithoutGarbage = Math.max(0.1, Math.ceil((maxDistanceWithoutGarbage || maxDistanceWithGarbage) / 500));

            distanceSlider.dataset.maxWithGarbage = String(maxDistanceWithGarbage);

            distanceSlider.dataset.maxWithoutGarbage = String(maxDistanceWithoutGarbage);

            distanceSlider.dataset.stepWithGarbage = String(stepWithGarbage);

            distanceSlider.dataset.stepWithoutGarbage = String(stepWithoutGarbage);

            distanceSlider.min = 0;



            const includeGarbageSphere = garbageSphereToggle ? garbageSphereToggle.checked : true;

            updateDistanceSliderRange(includeGarbageSphere, { snapToMax: true });

        }

        // Pass full star data to renderer
        if (starRenderer) {
            starRenderer.setFullStarData(fullStarData);
        }

        applyFilters();




        loadingIndicator.style.display = 'none';
        console.log('Star data loaded and processed successfully');
        return true;

    } catch (error) {

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

function calculateStarRadius(magnitude) {
    // Calculate star radius based on magnitude
    const radiusScale = Math.pow(10, -(magnitude - SOL_ABSOLUTE_MAGNITUDE) / 2.5);
    return Math.max(0.1, Math.min(10, radiusScale * BASE_STAR_RADIUS));
}

function calculateSceneBounds(starData) {
    const bounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity
    };

    starData.forEach(star => {
        bounds.minX = Math.min(bounds.minX, star.x);
        bounds.maxX = Math.max(bounds.maxX, star.x);
        bounds.minY = Math.min(bounds.minY, star.y);
        bounds.maxY = Math.max(bounds.maxY, star.y);
        bounds.minZ = Math.min(bounds.minZ, star.z);
        bounds.maxZ = Math.max(bounds.maxZ, star.z);
    });

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const width = (bounds.maxX - bounds.minX) / 2;
    const height = (bounds.maxY - bounds.minY) / 2;
    const depth = (bounds.maxZ - bounds.minZ) / 2;

    // Center +/- half-width can round inward at catalog extrema. Pad only the
    // spatial index boundary (never star coordinates) so every record is kept.
    const padding = Math.max(1, ...Object.values(bounds).map(Math.abs)) * Number.EPSILON * 8;
    return new Box3D(centerX, centerY, centerZ, width + padding, height + padding, depth + padding);
}

function setupCustomEventListeners() {
    // Listen for filter changes
    window.addEventListener('filtersChanged', applyFilters);

    // Listen for bloom settings changes
    window.addEventListener('bloomSettingsChanged', updateBloomSettings);

    // Listen for visual preset changes
    window.addEventListener('visualPresetChanged', applyVisualPreset);
}


function updateDistanceSliderRange(includeGarbageSphere, options = {}) {
    const distanceSlider = document.getElementById('distance-slider');
    if (!distanceSlider) return;

    const distanceValue = document.getElementById('distance-value');
    const { snapToMax = false } = options;

    const maxWithGarbage = parseFloat(distanceSlider.dataset.maxWithGarbage || distanceSlider.max || 0);
    const maxWithoutGarbage = parseFloat(distanceSlider.dataset.maxWithoutGarbage || maxWithGarbage || 0);
    const stepWithGarbage = parseFloat(distanceSlider.dataset.stepWithGarbage || distanceSlider.step || 1);
    const stepWithoutGarbage = parseFloat(distanceSlider.dataset.stepWithoutGarbage || distanceSlider.step || 1);

    const useGarbage = includeGarbageSphere || !hasGarbageSphere;
    const targetMax = useGarbage ? maxWithGarbage : maxWithoutGarbage;
    const targetStep = useGarbage ? stepWithGarbage : stepWithoutGarbage;

    if (targetMax > 0) {
        distanceSlider.max = targetMax;
    }
    if (targetStep > 0) {
        distanceSlider.step = targetStep;
    }
    distanceSlider.min = 0;

    const sliderValue = parseFloat(distanceSlider.value);
    if (snapToMax || (!Number.isNaN(sliderValue) && sliderValue > targetMax)) {
        distanceSlider.value = targetMax;
    } else if (Number.isNaN(sliderValue)) {
        distanceSlider.value = targetMax;
    }

    if (distanceValue) {
        distanceValue.textContent = distanceSlider.value;
    }
}

function applyFilters() {
    if (!fullStarData || fullStarData.length === 0) return;

    const garbageSphereToggle = document.getElementById('garbage-sphere-filter');
    const includeGarbageSphere = garbageSphereToggle ? garbageSphereToggle.checked : true;

    updateDistanceSliderRange(includeGarbageSphere);

    const distanceSlider = document.getElementById('distance-slider');
    const sizeSlider = document.getElementById('size-slider');
    const maxDistance = distanceSlider ? parseFloat(distanceSlider.value) : Infinity;
    const maxSize = sizeSlider ? parseFloat(sizeSlider.value) : Infinity;

    const spectralCheckboxes = document.querySelectorAll('.filter-checkbox[name^="spectral-"]:checked');
    const checkedSpectralClasses = Array.from(spectralCheckboxes)
        .map(cb => cb.value)
        .filter(Boolean);

    activeStarData = filterStars(fullStarData, {
        includeGarbageSphere, maxDistance, maxSize,
        spectralClasses: checkedSpectralClasses,
        properNamesOnly: !!document.getElementById('proper-name-filter')?.checked
    });

    starRenderer.createStarGeometry(activeStarData);
    uiManager.setActiveStarData(activeStarData);
    uiManager.updateUI();

    console.log(`Filtered to ${activeStarData.length} stars`);
}

function updateBloomSettings() {
    const bloomToggle = document.getElementById('bloom-toggle');
    const bloomStrength = document.getElementById('bloom-strength');

    if (starRenderer.starBloomPass && bloomToggle && bloomStrength) {
        starRenderer.starBloomPass.enabled = bloomToggle.checked;
        starRenderer.starBloomPass.strength = parseFloat(bloomStrength.value);
    }
}

function applyVisualPreset() {
    const visualPresetSelect = document.getElementById('visual-preset');
    if (!visualPresetSelect) return;

    const selectedPreset = visualPresetSelect.value;
    if (!selectedPreset) return;

    if (!starRenderer.setVisualPreset(selectedPreset)) return;
    // Scientific removes decorative bloom, twinkle and pulse; both modes keep
    // the same catalog coordinates and bounded visual marker diameters.
    const bloomToggle = document.getElementById('bloom-toggle');
    const bloomStrength = document.getElementById('bloom-strength');
    const bloomStrengthValue = document.getElementById('bloom-strength-value');
    if (bloomToggle) bloomToggle.checked = selectedPreset === 'cinematic';
    if (bloomStrength && selectedPreset === 'cinematic') {
        bloomStrength.value = Math.max(0.6, Number(bloomStrength.value) || 0.6);
        if (bloomStrengthValue) bloomStrengthValue.textContent = Number(bloomStrength.value).toFixed(2);
    }
    updateBloomSettings();
    console.log(`Applied visual preset: ${selectedPreset}`);
}

function buildSpectralLegend() {
    const container = document.getElementById('spectral-legend');
    if (!container || !fullStarData) return;

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
        swatch.style.width = '12px';
        swatch.style.height = '12px';
        swatch.style.backgroundColor = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
        swatch.style.borderRadius = '2px';
        const label = document.createElement('span');
        label.textContent = `Class ${s}`;
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
    switch (s) {
        case 'O': return -0.2;
        case 'B': return -0.1;
        case 'A': return 0.0;
        case 'F': return 0.3;
        case 'G': return 0.65;
        case 'K': return 1.0;
        case 'M': return 1.4;
        default: return 0.65;
    }
}

function getRGBfromCI(ci) {
    // Convert color index to RGB (from StarRenderer, but needed here for legend)
    const clampedCI = Math.max(-0.5, Math.min(2.0, ci || 0.65));

    let r, g, b;
    if (clampedCI < 0.0) {
        r = 0.7 + 0.3 * (clampedCI + 0.5) / 0.5;
        g = 0.8 + 0.2 * (clampedCI + 0.5) / 0.5;
        b = 1.0;
    } else if (clampedCI < 0.5) {
        r = 0.7 + 0.3 * clampedCI / 0.5;
        g = 0.8 + 0.2 * clampedCI / 0.5;
        b = 1.0 - 0.2 * clampedCI / 0.5;
    } else if (clampedCI < 1.0) {
        r = 1.0;
        g = 1.0 - 0.3 * (clampedCI - 0.5) / 0.5;
        b = 0.8 - 0.4 * (clampedCI - 0.5) / 0.5;
    } else {
        r = 1.0 - 0.2 * (clampedCI - 1.0) / 1.0;
        g = 0.7 - 0.3 * (clampedCI - 1.0) / 1.0;
        b = 0.4 - 0.2 * (clampedCI - 1.0) / 1.0;
    }

    return { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) };
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (starRenderer && (!explorer || explorer.currentMode === 'atlas')) {
        starRenderer.render();
    }
}

// Utility functions
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Make functions available globally for backward compatibility
window.handleNarration = () => uiManager?.handleNarration();
window.populateConstellationDropdown = () => uiManager?.populateConstellationDropdown();
window.getConstellationData = getConstellationData;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for module use
export {
    ErrorHandler,
    fullStarData,
    activeStarData,
    starOctree,
    starRenderer,
    routeManager,
    tourController,
    uiManager
};

