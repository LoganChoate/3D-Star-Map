// Modular 3D Star Map Explorer
import * as THREE from './vendor/three/build/three.module.js';
import { StarRenderer } from './modules/StarRenderer.js';
import { RouteManager } from './modules/RouteManager.js';
import { TourController } from './modules/TourController.js';
import { UIManager } from './modules/UIManager.js';

// Import external data modules
import { getConstellationData } from './constellations.js';
import { starDetails } from './star_details.js';

// Global data
let fullStarData = [];
let activeStarData = [];
let starOctree = null;

// Module instances
let starRenderer = null;
let routeManager = null;
let tourController = null;
let uiManager = null;

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
const spectralClasses = ['O','B','A','F','G','K','M'];

// Octree implementation for spatial queries
class Octree {
    constructor(boundary, capacity = 10) {
        this.boundary = boundary;
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }

    insert(point) {
        if (!this.boundary.contains(point)) {
            return false;
        }

        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        }

        if (!this.divided) {
            this.subdivide();
        }

        return (
            this.northeast.insert(point) ||
            this.northwest.insert(point) ||
            this.southeast.insert(point) ||
            this.southwest.insert(point) ||
            this.topNortheast.insert(point) ||
            this.topNorthwest.insert(point) ||
            this.topSoutheast.insert(point) ||
            this.topSouthwest.insert(point)
        );
    }

    subdivide() {
        const x = this.boundary.x;
        const y = this.boundary.y;
        const z = this.boundary.z;
        const w = this.boundary.w / 2;
        const h = this.boundary.h / 2;
        const d = this.boundary.d / 2;

        this.northeast = new Octree(new Box3D(x + w, y - h, z - d, w, h, d), this.capacity);
        this.northwest = new Octree(new Box3D(x - w, y - h, z - d, w, h, d), this.capacity);
        this.southeast = new Octree(new Box3D(x + w, y + h, z - d, w, h, d), this.capacity);
        this.southwest = new Octree(new Box3D(x - w, y + h, z - d, w, h, d), this.capacity);
        this.topNortheast = new Octree(new Box3D(x + w, y - h, z + d, w, h, d), this.capacity);
        this.topNorthwest = new Octree(new Box3D(x - w, y - h, z + d, w, h, d), this.capacity);
        this.topSoutheast = new Octree(new Box3D(x + w, y + h, z + d, w, h, d), this.capacity);
        this.topSouthwest = new Octree(new Box3D(x - w, y + h, z + d, w, h, d), this.capacity);

        this.divided = true;
    }

    query(center, radius, found = []) {
        const range = new Sphere3D(center.x, center.y, center.z, radius);
        
        if (!this.boundary.intersects(range)) {
            return found;
        }

        for (const point of this.points) {
            if (range.contains(point)) {
                found.push(point);
            }
        }

        if (this.divided) {
            this.northeast.query(center, radius, found);
            this.northwest.query(center, radius, found);
            this.southeast.query(center, radius, found);
            this.southwest.query(center, radius, found);
            this.topNortheast.query(center, radius, found);
            this.topNorthwest.query(center, radius, found);
            this.topSoutheast.query(center, radius, found);
            this.topSouthwest.query(center, radius, found);
        }

        return found;
    }
}

class Box3D {
    constructor(x, y, z, w, h, d) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        this.h = h;
        this.d = d;
    }

    contains(point) {
        return (
            point.x >= this.x - this.w &&
            point.x <= this.x + this.w &&
            point.y >= this.y - this.h &&
            point.y <= this.y + this.h &&
            point.z >= this.z - this.d &&
            point.z <= this.z + this.d
        );
    }

    intersects(sphere) {
        const dx = Math.max(0, Math.max(this.x - this.w - sphere.x, sphere.x - (this.x + this.w)));
        const dy = Math.max(0, Math.max(this.y - this.h - sphere.y, sphere.y - (this.y + this.h)));
        const dz = Math.max(0, Math.max(this.z - this.d - sphere.z, sphere.z - (this.z + this.d)));
        return (dx * dx + dy * dy + dz * dz) <= (sphere.radius * sphere.radius);
    }
}

class Sphere3D {
    constructor(x, y, z, radius) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.radius = radius;
    }

    contains(point) {
        const dx = this.x - point.x;
        const dy = this.y - point.y;
        const dz = this.z - point.z;
        return (dx * dx + dy * dy + dz * dz) <= (this.radius * this.radius);
    }
}

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
        routeManager = new RouteManager(starRenderer, ErrorHandler);
        tourController = new TourController(starRenderer, ErrorHandler);
        uiManager = new UIManager(starRenderer, routeManager, tourController, ErrorHandler);

        // Initialize star renderer
        if (!await starRenderer.initialize()) {
            throw new Error('Failed to initialize 3D renderer');
        }

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

        // Start animation loop
        animate();

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

        loadingIndicator.textContent = 'Processing star data...';

        // Step 1: Initial parsing of raw data into a workable format.
        let initialData = rawData.map(star => ({
            name: star.name,
            x: star.x,
            y: star.y,
            z: star.z,
            dist: star.dist,
            mag: star.mag,
            spect: star.spect,
            ci: star.ci || 0.65,
            relativeRadiusScale: calculateStarRadius(star.mag)
        }));

        console.log(`Loaded ${initialData.length} stars`);

        fullStarData = initialData;
        
        loadingIndicator.textContent = 'Building spatial index...';

        // Build octree for spatial queries
        const sceneBounds = calculateSceneBounds(fullStarData);
        starOctree = new Octree(sceneBounds);
        fullStarData.forEach(star => starOctree.insert(star));
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
        }

        loadingIndicator.style.display = 'none';
        console.log('Star data loaded and processed successfully');
        return true;

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

    return new Box3D(centerX, centerY, centerZ, width, height, depth);
}

function setupCustomEventListeners() {
    // Listen for filter changes
    window.addEventListener('filtersChanged', applyFilters);
    
    // Listen for bloom settings changes
    window.addEventListener('bloomSettingsChanged', updateBloomSettings);
    
    // Listen for visual preset changes
    window.addEventListener('visualPresetChanged', applyVisualPreset);
}

function applyFilters() {
    if (!fullStarData || fullStarData.length === 0) return;

    // Get filter values from UI
    const distanceSlider = document.getElementById('distance-slider');
    const sizeSlider = document.getElementById('size-slider');
    const maxDistance = distanceSlider ? parseFloat(distanceSlider.value) : Infinity;
    const minSize = sizeSlider ? parseFloat(sizeSlider.value) : 0;

    // Get checked spectral classes
    const checkedSpectralClasses = Array.from(document.querySelectorAll('.filter-checkbox:checked'))
        .map(cb => cb.value);

    // Apply filters
    activeStarData = fullStarData.filter(star => {
        // Distance filter
        if (star.dist > maxDistance) return false;

        // Size filter
        if (star.relativeRadiusScale < minSize) return false;

        // Spectral class filter
        if (checkedSpectralClasses.length > 0) {
            const spectralClass = star.spect ? star.spect[0] : 'G';
            if (!checkedSpectralClasses.includes(spectralClass)) return false;
        }

        return true;
    });

    // Update star geometry
    starRenderer.createStarGeometry(activeStarData);

    // Update UI
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

    // Load and apply visual preset
    fetch('visual_presets.json')
        .then(response => response.json())
        .then(presets => {
            const preset = presets.presets[selectedPreset];
            if (preset) {
                // Apply the preset values to the UI and renderer
                console.log(`Applied visual preset: ${selectedPreset}`);
            }
        })
        .catch(error => {
            console.warn('Could not load visual presets:', error);
        });
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
    switch(s) {
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
    
    if (starRenderer) {
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