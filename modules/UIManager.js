import * as THREE from '../vendor/three/build/three.module.js';
import { StarLookup } from '../utils/StarLookup.js';
import { appToEquatorial } from '../utils/CatalogCoordinates.js';
import { catalogQualityLabel, catalogIdentifierLabel, hasUnresolvedDistance } from '../utils/CatalogMetadata.js';

export class UIManager {
    constructor(starRenderer, routeManager, tourController, errorHandler) {
        this.starRenderer = starRenderer;
        this.routeManager = routeManager;
        this.tourController = tourController;
        this.errorHandler = errorHandler;
        
        // DOM elements
        this.elements = {};
        
        // Interaction state
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.isDragging = false;
        this.pointerDownPosition = new THREE.Vector2();
        
        // Data references
        this.fullStarData = null;
        this.activeStarData = null;
        this.starDetails = null;
        this.lookup = null;
        this.activeStarIds = new Set();
        
        // UI state
        this.selectedStar = null;
        this.originalNarrationText = '';
        this.narration = null;
        this.dossierFor = null;
        this.onInspectObject = null;
        
        // Search state
        this.autocompleteVisible = false;
        
        this.setupRaycaster();
    }

    setupRaycaster() {
        this.raycaster.params.Points.threshold = 0.5;
    }

    async initialize() {
        try {
            await this.initializeElements();
            this.setupEventListeners();
            this.setupCustomEventListeners();
            return true;
        } catch (error) {
            this.errorHandler.showError(
                'Failed to initialize user interface',
                error
            );
            return false;
        }
    }

    async initializeElements() {
        // Define required and optional elements
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
            routeButtonsContainer: 'route-buttons-container',
            bloomToggle: 'bloom-toggle',
            bloomStrength: 'bloom-strength',
            bloomStrengthValue: 'bloom-strength-value',
            visualPresetSelect: 'visual-preset',
            routeArrowsToggle: 'route-arrows-toggle',
            screenshotButton: 'screenshot-button',
            spectralLegend: 'spectral-legend'
        };

        // Check required elements
        const missingElements = [];
        for (const [varName, elementId] of Object.entries(requiredElements)) {
            const element = document.getElementById(elementId);
            if (!element) {
                missingElements.push(elementId);
            }
            this.elements[varName] = element;
        }

        // Check optional elements (warn but don't fail)
        for (const [varName, elementId] of Object.entries(optionalElements)) {
            const element = document.getElementById(elementId);
            if (!element) {
                this.errorHandler.showWarning(`Optional UI element "${elementId}" not found - some features may be disabled`);
            }
            this.elements[varName] = element;
        }

        // Fail if critical elements are missing
        if (missingElements.length > 0) {
            throw new Error(`Critical UI elements missing: ${missingElements.join(', ')}`);
        }

        return true;
    }

    setupEventListeners() {
        // Canvas interaction events
        this.elements.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this), false);
        this.elements.canvas.addEventListener('pointermove', this.onPointerMove.bind(this), false);
        this.elements.canvas.addEventListener('pointerup', this.onPointerUp.bind(this), false);

        // Window events
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Control buttons
        if (document.getElementById('resetViewButton')) {
            document.getElementById('resetViewButton').addEventListener('click', this.resetScene.bind(this));
        }
        if (document.getElementById('snapToSolButton')) {
            document.getElementById('snapToSolButton').addEventListener('click', this.snapToSol.bind(this));
        }
        if (document.getElementById('toggle-fly-mode-button')) {
            document.getElementById('toggle-fly-mode-button').addEventListener('click', this.toggleControlMode.bind(this));
        }

        // Search and filters
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', this.handleAutocomplete.bind(this));
            this.elements.searchInput.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.searchByName(this.elements.searchInput.value, {inspect:true});
                }
            });
        }
        if (document.getElementById('clear-search-button')) {
            document.getElementById('clear-search-button').addEventListener('click', this.clearSearch.bind(this));
        }

        // Filter checkboxes
        document.querySelectorAll('.filter-checkbox').forEach(cb => 
            cb.addEventListener('change', this.applyFilters.bind(this))
        );

        // Sliders
        if (this.elements.distanceSlider) {
            this.elements.distanceSlider.addEventListener('input', this.onDistanceSliderChange.bind(this));
        }
        if (this.elements.sizeSlider) {
            this.elements.sizeSlider.addEventListener('input', this.onSizeSliderChange.bind(this));
        }

        // Narration
        if (this.elements.narrateButton) {
            this.elements.narrateButton.addEventListener('click', this.handleNarration.bind(this));
        }

        // Tour controls
        if (this.elements.stellarTourButton) {
            this.elements.stellarTourButton.addEventListener('click', this.toggleStellarTour.bind(this));
        }

        // Route planner
        if (this.elements.toggleRoutePlannerButton) {
            this.elements.toggleRoutePlannerButton.addEventListener('click', this.toggleRoutePlanner.bind(this));
        }
        if (this.elements.setStartButton) {
            this.elements.setStartButton.addEventListener('click', this.setRouteStart.bind(this));
        }
        if (this.elements.setEndButton) {
            this.elements.setEndButton.addEventListener('click', this.setRouteEnd.bind(this));
        }
        if (this.elements.calculateRouteButton) {
            this.elements.calculateRouteButton.addEventListener('click', this.calculateRoute.bind(this));
        }
        if (this.elements.findMinJumpButton) {
            this.elements.findMinJumpButton.addEventListener('click', this.findMinimumJumpRange.bind(this));
        }

        // Route navigation
        if (this.elements.jumpToStartButton) {
            this.elements.jumpToStartButton.addEventListener('click', () => this.jumpToRoutePoint('start'));
        }
        if (this.elements.nextJumpButton) {
            this.elements.nextJumpButton.addEventListener('click', this.handleNextJump.bind(this));
        }
        if (this.elements.jumpToEndButton) {
            this.elements.jumpToEndButton.addEventListener('click', () => this.jumpToRoutePoint('end'));
        }
        if (this.elements.followRouteButton) {
            this.elements.followRouteButton.addEventListener('click', this.toggleFollowRoute.bind(this));
        }

        // Visual controls
        if (this.elements.bloomToggle) {
            this.elements.bloomToggle.addEventListener('change', this.updateBloomSettings.bind(this));
        }
        if (this.elements.bloomStrength) {
            this.elements.bloomStrength.addEventListener('input', this.updateBloomSettings.bind(this));
        }
        if (this.elements.visualPresetSelect) {
            this.elements.visualPresetSelect.addEventListener('change', this.applyVisualPreset.bind(this));
        }
        if (this.elements.screenshotButton) {
            this.elements.screenshotButton.addEventListener('click', this.saveScreenshot.bind(this));
        }

        // Constellation dropdown
        if (this.elements.constellationSelect) {
            this.elements.constellationSelect.addEventListener('change', this.viewSelectedConstellation.bind(this));
        }

        // Click outside autocomplete to hide it
        document.addEventListener('click', (e) => {
            if (this.elements.autocompleteContainer && 
                !this.elements.autocompleteContainer.contains(e.target) && 
                e.target !== this.elements.searchInput) {
                this.elements.autocompleteContainer.classList.add('hidden');
                this.autocompleteVisible = false;
            }
        });
    }

    setupCustomEventListeners() {
        // Listen for events from other modules
        window.addEventListener('routePlannerUpdate', this.onRoutePlannerUpdate.bind(this));
        window.addEventListener('stellarTourUpdate', this.onStellarTourUpdate.bind(this));
        window.addEventListener('starSelection', this.onStarSelection.bind(this));
    }

    setData(fullStarData, activeStarData, starDetails) {
        this.fullStarData = fullStarData;
        this.starDetails = starDetails;
        this.lookup = new StarLookup(fullStarData, starDetails);
        this.setActiveStarData(activeStarData);
    }

    setNarration(narration, dossierFor) {
        this.unsubscribeNarration?.();
        this.narration = narration;
        this.dossierFor = dossierFor;
        const panel = document.getElementById('selection-info');
        if (panel && !this.elements.inspectObjectButton) {
            const button = document.createElement('button');
            button.id = 'inspect-selected-object';
            button.type = 'button';
            button.className = 'custom-button';
            button.textContent = 'Open information and narration';
            button.addEventListener('click', () => this.inspectSelectedObject());
            panel.append(button);
            this.elements.inspectObjectButton = button;
        }
        if (this.elements.starDescriptionContainer && !this.elements.narrationStatus) {
            const status = document.createElement('p');
            status.id = 'atlas-narration-status';
            status.setAttribute('role','status');
            this.elements.starDescriptionContainer.append(status);
            this.elements.narrationStatus = status;
        }
        this.unsubscribeNarration = narration.subscribe(state => {
            const matches = state.contentId === this.selectedStar?.id;
            const active = matches && ['speaking','paused'].includes(state.status);
            if (this.elements.narrateButton) this.elements.narrateButton.textContent = active ? 'Stop narration' : 'Narrate';
            if (this.elements.narrationStatus) this.elements.narrationStatus.textContent = matches ? state.message : '';
            // The common transcript is rendered as text, including any markup-like
            // catalog strings. Word boundaries never become HTML in this view.
            if (matches && this.elements.starDescription && this.elements.starDescription.textContent !== state.text) this.elements.starDescription.textContent = state.text;
        });
        if (this.selectedStar) this.showHeroStar(this.selectedStar);
        this.updateUI();
    }

    canInspectObject() {
        return typeof this.onInspectObject === 'function' && !this.routeManager?.isActive() && !this.tourController?.isActive();
    }

    inspectSelectedObject() {
        if (!this.selectedStar || !this.canInspectObject()) return false;
        this.onInspectObject(this.selectedStar);
        return true;
    }

    setActiveStarData(activeStarData) {
        // Keep the exact same ordering as the newly built Points geometry.
        this.activeStarData = activeStarData || [];
        this.activeStarIds = new Set(this.activeStarData.map(star => star.id));
        this.tourController?.setActiveStarData(this.activeStarData);
        if (this.selectedStar && !this.activeStarIds.has(this.selectedStar.id)) {
            this.deselectStar();
        } else if (this.selectedStar) {
            this.selectedStar = this.lookup?.byId.get(this.selectedStar.id) || this.selectedStar;
        }
        this.updateUI();
    }

    // Event handlers
    onPointerDown(event) {
        this.pointerDownPosition.set(event.clientX, event.clientY);
        this.isDragging = false;
    }

    onPointerMove(event) {
        if (event.buttons !== 1) return;

        // If the mouse has moved more than a small threshold, classify it as a drag
        if (this.pointerDownPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
            this.isDragging = true;
        }
    }

    onPointerUp(event) {
        if (this.isDragging) {
            this.isDragging = false;
            return;
        }

        // Pointer coordinates are relative to the canvas, including its title
        // bar offset and any responsive layout changes.
        if (event.button !== undefined && event.button !== 0) return;
        const rect = this.elements.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) return;
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.starRenderer.camera);

        if (this.starRenderer.starsMesh) {
            const intersects = this.raycaster.intersectObject(this.starRenderer.starsMesh);

            if (intersects.length > 0) {
                const index = intersects[0].index;
                if (index !== undefined && this.activeStarData && this.activeStarData[index]) {
                    const star = this.activeStarData[index];
                    const shouldFrame = !(this.routeManager && this.routeManager.isActive());
                    this.selectStar(star, { focusCamera: shouldFrame, inspect:true });
                }
            } else {
                this.deselectStar();
            }
        }
    }

    onWindowResize() {
        this.starRenderer.onWindowResize();
    }

    selectStar(star, options = {}) {
        if (!star) return false;
        star = this.lookup?.byId.get(star.id);
        if (!star) return false;
        if (!this.activeStarIds.has(star.id)) {
            this.deselectStar();
            this.showSearchMessage(`${this.lookup.label(star)} is hidden by the current filters. Adjust the filters to select it.`);
            return false;
        }

        const { focusCamera = false, suppressEvent = false, eventSource = 'UIManager', inspect = false } = options;
        const shouldInspect = inspect && this.canInspectObject();
        this.selectedStar = star;
        if (this.routeManager?.routePlanner) this.routeManager.routePlanner.currentSelection = star;
        this.showSearchMessage('');
        this.starRenderer.updateSelectionHighlight(star);
        this.updateInfoPanel(star);
        this.updateUI();

        if (focusCamera && !shouldInspect) {
            this.starRenderer.frameObjectInView(star);
        }

        if (!suppressEvent) {
            window.dispatchEvent(new CustomEvent('starSelection', {
                detail: { type: 'selected', star: star, source: eventSource }
            }));
        }
        if (shouldInspect) this.inspectSelectedObject();
        return true;
    }

    deselectStar(options = {}) {
        const { suppressEvent = false, eventSource = 'UIManager' } = options;

        this.selectedStar = null;
        if (this.routeManager?.routePlanner) this.routeManager.routePlanner.currentSelection = null;
        this.starRenderer.updateSelectionHighlight(null);
        this.hideInfoPanel();
        this.updateUI();

        if (!suppressEvent) {
            window.dispatchEvent(new CustomEvent('starSelection', {
                detail: { type: 'deselected', star: null, source: eventSource }
            }));
        }
    }

    updateInfoPanel(star) {
        if (!star) return;

        const elements = {
            'star-name': this.lookup?.label(star) || star.name,
            'star-dist': hasUnresolvedDistance(star) ? 'Unresolved (catalog placeholder)' : star.id==='sol' ? '0 pc (defined origin)' : `${star.dist.toFixed(2)} pc`,
            'star-mag': star.mag.toFixed(2),
            'star-spect': star.spect || 'Not supplied',
            'star-coords': `X:${star.x.toFixed(1)}, Y:${star.y.toFixed(1)}, Z:${star.z.toFixed(1)} pc`,
            'star-identifiers': catalogIdentifierLabel(star),
            'star-quality': catalogQualityLabel(star),
            'star-equatorial': `Source axes X, Y, Z: ${appToEquatorial([star.x,star.y,star.z]).map(value=>value.toFixed(6)).join(', ')} pc`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                if (id === 'star-name') element.dataset.starId = star.id;
            }
        });

        this.showHeroStar(star);
    }

    hideInfoPanel() {
        this.originalNarrationText = '';
        if (this.elements.starDescription) this.elements.starDescription.textContent = '';
        this.elements.routeButtonsContainer?.classList.add('hidden');
        if (this.elements.narrateButton) this.elements.narrateButton.textContent = '▶ Narrate';
        this.narration?.stop();
        if (this.elements.narrationStatus) this.elements.narrationStatus.textContent = '';
        for (const id of ['star-name', 'star-dist', 'star-mag', 'star-spect', 'star-coords','star-identifiers','star-quality','star-equatorial']) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = 'N/A';
                if (id === 'star-name') delete element.dataset.starId;
            }
        }
        if (this.elements.starDescriptionContainer) {
            this.elements.starDescriptionContainer.classList.add('hidden');
        }
    }

    showHeroStar(star) {
        // Handle route planner buttons
        if (this.routeManager?.isActive()) {
            this.elements.routeButtonsContainer?.classList.remove('hidden');
        } else {
            this.elements.routeButtonsContainer?.classList.add('hidden');
        }

        const dossier = this.dossierFor?.(star);
        const description = dossier ? dossier.narrationText : this.lookup?.describe(star)?.description || '';
        this.originalNarrationText = description;
        if (this.elements.starDescription) this.elements.starDescription.textContent = description;
        this.elements.starDescriptionContainer?.classList.toggle('hidden', !description);
        if (this.narration && dossier) this.narration.setContent({id:star.id,text:description});
    }

    showSearchMessage(message) {
        const element = document.getElementById('search-not-found');
        if (element) {
            element.textContent = message;
            element.style.display = message ? 'block' : 'none';
        }
    }

    renderSearchMatches(matches) {
        const container = this.elements.autocompleteContainer;
        if (!container) return;
        container.replaceChildren();
        for (const star of matches) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'suggestion-item';
            button.style.display = 'block';
            button.style.width = '100%';
            button.style.textAlign = 'left';
            button.dataset.starId = star.id;
            const hidden = !this.activeStarIds.has(star.id);
            button.textContent = this.lookup.label(star) + (hidden ? ' · hidden by filters' : '');
            button.onclick = () => {
                this.elements.searchInput.value = star.name;
                container.classList.add('hidden');
                this.autocompleteVisible = false;
                this.searchById(star.id, {inspect:true});
            };
            container.appendChild(button);
        }
        this.autocompleteVisible = matches.length > 0;
        container.classList.toggle('hidden', !this.autocompleteVisible);
    }

    handleAutocomplete() {
        this.showSearchMessage('');
        this.renderSearchMatches(this.lookup?.search(this.elements.searchInput.value) || []);
    }

    searchById(id, {inspect = false} = {}) {
        const star = this.lookup?.byId.get(id);
        if (!star) {
            this.deselectStar();
            this.showSearchMessage('Star not found.');
            return false;
        }
        return this.selectStar(star, { focusCamera: true, inspect });
    }

    searchByName(name, {inspect = false} = {}) {
        const matches = this.lookup?.find(name) || [];
        if (matches.length === 1) {
            this.renderSearchMatches([]);
            return this.searchById(matches[0].id, {inspect});
        }
        this.deselectStar();
        if (matches.length > 1) {
            this.renderSearchMatches(matches);
            this.showSearchMessage('Multiple catalog objects share this name. Choose an entry by its catalog ID.');
        } else {
            this.renderSearchMatches([]);
            this.showSearchMessage('Star not found.');
        }
        return false;
    }

    clearSearch() {
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        this.renderSearchMatches([]);
        this.showSearchMessage('');
    }

    handleNarration() {
        if (!this.narration || !this.selectedStar || !this.dossierFor) return false;
        const state = this.narration.snapshot();
        if (state.contentId === this.selectedStar.id && ['speaking','paused'].includes(state.status)) {
            return this.narration.stop();
        }
        // A manual replay takes ownership from an automated tour.
        this.tourController?.interrupt();
        const text = this.dossierFor(this.selectedStar).narrationText;
        this.originalNarrationText = text;
        this.narration.setContent({id:this.selectedStar.id,text});
        return this.narration.play();
    }

    // Control mode toggle
    toggleControlMode() {
        const mode = this.starRenderer.toggleControlMode();
        const button = document.getElementById('toggle-fly-mode-button');
        
        if (button) {
            if (mode === 'fly') {
                button.textContent = 'Orbit Mode';
                button.classList.add('active-mode');
            } else {
                button.textContent = 'Fly Mode';
                button.classList.remove('active-mode');
            }
        }
        
        // Interrupt route planner when switching modes
        if (this.routeManager.isActive()) {
            // Could interrupt route following here if needed
        }
    }

    // Scene controls
    resetScene() {
        this.deselectStar();
        
        // Reset filters
        document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
        if (this.elements.distanceSlider) {
            this.elements.distanceSlider.value = this.elements.distanceSlider.max;
        }
        
        // Reset visual presets
        if (this.elements.visualPresetSelect) {
            this.elements.visualPresetSelect.selectedIndex = 0;
        }
        
        // Apply filters to refresh the view
        this.applyFilters();
        
        // Reset camera position
        this.starRenderer.camera.position.copy(new THREE.Vector3(0, 20, 100));
        this.starRenderer.controls.target.set(0, 0, 0);
        this.starRenderer.controls.update();
    }

    snapToSol() {
        if (!this.fullStarData) return;
        
        const sol = this.lookup?.byId.get('sol');
        if (sol) {
            this.selectStar(sol, { focusCamera: true });
        }
    }

    // Tour controls
    toggleStellarTour() {
        const isActive = this.tourController.toggle();
        
        if (this.elements.stellarTourButton) {
            if (isActive) {
                this.elements.stellarTourButton.textContent = 'Stop Tour';
                this.elements.stellarTourButton.classList.add('active-mode');
            } else {
                this.elements.stellarTourButton.textContent = 'Stellar Tour';
                this.elements.stellarTourButton.classList.remove('active-mode');
            }
        }
    }

    // Route planner controls
    toggleRoutePlanner() {
        const isActive = this.routeManager.toggleActive();
        
        if (this.elements.toggleRoutePlannerButton && this.elements.routePlannerContainer) {
            if (isActive) {
                this.elements.toggleRoutePlannerButton.textContent = 'Exit Planner';
                this.elements.toggleRoutePlannerButton.classList.add('active-mode');
                this.elements.routePlannerContainer.classList.remove('hidden');
                
                // Show route buttons if a star is selected
                if (this.selectedStar && this.elements.routeButtonsContainer) {
                    this.elements.routeButtonsContainer.classList.remove('hidden');
                }
            } else {
                this.elements.toggleRoutePlannerButton.textContent = 'Plan Route';
                this.elements.toggleRoutePlannerButton.classList.remove('active-mode');
                this.elements.routePlannerContainer.classList.add('hidden');
                if (this.elements.routeButtonsContainer) {
                    this.elements.routeButtonsContainer.classList.add('hidden');
                }
            }
        }
    }

    setRouteStart() {
        if (this.selectedStar) {
            this.routeManager.setRouteStart(this.selectedStar);
        }
    }

    setRouteEnd() {
        if (this.selectedStar) {
            this.routeManager.setRouteEnd(this.selectedStar);
        }
    }

    async calculateRoute() {
        if (!this.elements.maxJumpRangeInput) return;
        
        const maxJump = parseFloat(this.elements.maxJumpRangeInput.value);
        
        // Disable buttons during calculation
        if (this.elements.calculateRouteButton) this.elements.calculateRouteButton.disabled = true;
        if (this.elements.findMinJumpButton) this.elements.findMinJumpButton.disabled = true;
        if (this.elements.routeCalculatingMessage) {
            this.elements.routeCalculatingMessage.textContent = 'Calculating Route...';
            this.elements.routeCalculatingMessage.classList.remove('hidden');
        }
        
        try {
            await this.routeManager.calculateRoute(maxJump);
        } finally {
            // Re-enable buttons
            if (this.elements.calculateRouteButton) this.elements.calculateRouteButton.disabled = false;
            if (this.elements.findMinJumpButton) this.elements.findMinJumpButton.disabled = false;
            if (this.elements.routeCalculatingMessage) {
                this.elements.routeCalculatingMessage.classList.add('hidden');
            }
        }
    }

    async findMinimumJumpRange() {
        const activeRoute = this.routeManager.getActiveRoute();
        if (!activeRoute || !activeRoute.startStar || !activeRoute.endStar) {
            this.errorHandler.showError("Please select a start and end star for the route.");
            return;
        }

        // Disable buttons during calculation
        if (this.elements.calculateRouteButton) this.elements.calculateRouteButton.disabled = true;
        if (this.elements.findMinJumpButton) this.elements.findMinJumpButton.disabled = true;
        if (this.elements.routeCalculatingMessage) {
            this.elements.routeCalculatingMessage.textContent = 'Calculating Min. Jump...';
            this.elements.routeCalculatingMessage.classList.remove('hidden');
        }

        try {
            const minJump = await this.routeManager.findMinimumJumpRange(activeRoute.startStar, activeRoute.endStar);
            if (minJump && this.elements.maxJumpRangeInput) {
                this.elements.maxJumpRangeInput.value = minJump.toFixed(2);
            }
        } finally {
            // Re-enable buttons
            if (this.elements.calculateRouteButton) this.elements.calculateRouteButton.disabled = false;
            if (this.elements.findMinJumpButton) this.elements.findMinJumpButton.disabled = false;
            if (this.elements.routeCalculatingMessage) {
                this.elements.routeCalculatingMessage.classList.add('hidden');
            }
        }
    }

    jumpToRoutePoint(point) {
        this.routeManager.jumpToRoutePoint(point);
    }

    handleNextJump() {
        this.routeManager.handleNextJump();
    }

    toggleFollowRoute() {
        this.routeManager.toggleFollowRoute();
        // Button text will be updated via event listener
    }

    // Filter and visual controls
    applyFilters() {
        // This will be called by the main application to apply filters
        window.dispatchEvent(new CustomEvent('filtersChanged'));
    }

    onDistanceSliderChange() {
        if (this.elements.distanceSlider && this.elements.distanceValue) {
            this.elements.distanceValue.textContent = this.elements.distanceSlider.value;
        }
        this.applyFilters();
    }

    onSizeSliderChange() {
        if (this.elements.sizeSlider && this.elements.sizeValue) {
            this.elements.sizeValue.textContent = this.elements.sizeSlider.value;
        }
        this.applyFilters();
    }

    updateBloomSettings() {
        window.dispatchEvent(new CustomEvent('bloomSettingsChanged'));
    }

    applyVisualPreset() {
        window.dispatchEvent(new CustomEvent('visualPresetChanged'));
    }

    viewSelectedConstellation() {
        if (this.elements.constellationSelect) {
            const selectedConstellation = this.elements.constellationSelect.value;
            if (selectedConstellation) {
                this.starRenderer.drawConstellationLines(selectedConstellation);
            }
        }
    }

    saveScreenshot() {
        if (this.starRenderer.renderer) {
            const canvas = this.starRenderer.renderer.domElement;
            const link = document.createElement('a');
            link.download = `star-map-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    }

    updateUI() {
        if (this.elements.inspectObjectButton) this.elements.inspectObjectButton.disabled = !this.selectedStar || !this.canInspectObject();
        // Update star count display
        if (this.elements.starCountDisplay && this.activeStarData) {
            this.elements.starCountDisplay.textContent = this.activeStarData.length.toLocaleString();
        }
    }

    populateConstellationDropdown() {
        if (!this.elements.constellationSelect) {
            console.warn('Constellation select element not found');
            return;
        }

        // Clear existing options except the first placeholder
        while (this.elements.constellationSelect.children.length > 1) {
            this.elements.constellationSelect.removeChild(this.elements.constellationSelect.lastChild);
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
            this.elements.constellationSelect.appendChild(option);
        });

        console.log(`Populated constellation dropdown with ${constellationNames.length} constellations`);
    }

    // Event handlers for module events
    onRoutePlannerUpdate(event) {
        this.updateUI();
        const { activeRoute, currentJumpIndex, isFollowingRoute } = event.detail;
        
        // Update route UI elements
        if (this.elements.routeStartStar && activeRoute) {
            this.elements.routeStartStar.textContent = activeRoute.startStar ? this.lookup.label(activeRoute.startStar) : 'Not set';
        }
        if (this.elements.routeEndStar && activeRoute) {
            this.elements.routeEndStar.textContent = activeRoute.endStar ? this.lookup.label(activeRoute.endStar) : 'Not set';
        }
        if (this.elements.routeProgressDisplay) {
            this.elements.routeProgressDisplay.textContent = `Jump ${currentJumpIndex + 1}`;
        }
        if (this.elements.followRouteButton) {
            this.elements.followRouteButton.textContent = isFollowingRoute ? 'Stop Follow' : 'Follow Route';
        }
    }

    onStellarTourUpdate(event) {
        this.updateUI();
        const { type, state } = event.detail;
        
        if (this.elements.stellarTourButton) {
            if (state.active) {
                this.elements.stellarTourButton.textContent = 'Stop Tour';
                this.elements.stellarTourButton.classList.add('active-mode');
            } else {
                this.elements.stellarTourButton.textContent = 'Stellar Tour';
                this.elements.stellarTourButton.classList.remove('active-mode');
            }
        }
    }

    onStarSelection(event) {
        const { type, star } = event.detail;
        
        const source = event.detail?.source;
        if (source === 'UIManager') {
            return;
        }

        if (type === 'selected' && star) {
            const focusCamera = source !== 'UIManager' && source !== 'TourController';
            this.selectStar(star, { focusCamera, suppressEvent: true, eventSource: source });
        } else if (type === 'deselected') {
            this.deselectStar({ suppressEvent: true, eventSource: source });
        }
    }

    dispose() {
        this.unsubscribeNarration?.();
        this.unsubscribeNarration = null;
        // Remove event listeners and clean up
        window.removeEventListener('resize', this.onWindowResize.bind(this));
        
        // Clear selected star
        this.selectedStar = null;
        
        // Clear UI state
        this.originalNarrationText = '';
        this.autocompleteVisible = false;
    }
}
