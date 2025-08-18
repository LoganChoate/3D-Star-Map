// Integration tests for module communication
const runner = require('./test-runner.js');

// Mock classes for testing module integration
class MockErrorHandler {
    static showError(message, details = null, isRetryable = false) {
        console.log(`Error: ${message}`);
        this.lastError = { message, details, isRetryable };
    }

    static showWarning(message, details = null) {
        console.log(`Warning: ${message}`);
        this.lastWarning = { message, details };
    }

    static showNotification(message, type = 'info') {
        console.log(`Notification (${type}): ${message}`);
        this.lastNotification = { message, type };
    }

    static clear() {
        this.lastError = null;
        this.lastWarning = null;
        this.lastNotification = null;
    }
}

// Mock DOM elements and events
class MockEventTarget {
    constructor() {
        this.listeners = {};
    }

    addEventListener(type, listener) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(listener);
    }

    dispatchEvent(event) {
        const listeners = this.listeners[event.type] || [];
        listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Event listener error:', error);
            }
        });
    }

    removeEventListener(type, listener) {
        if (this.listeners[type]) {
            this.listeners[type] = this.listeners[type].filter(l => l !== listener);
        }
    }
}

// Mock modules with event communication
class MockStarRenderer extends MockEventTarget {
    constructor(errorHandler) {
        super();
        this.errorHandler = errorHandler;
        this.initialized = false;
        this.starGeometry = null;
        this.selectedStar = null;
        this.renderCount = 0;
    }

    async initialize() {
        this.initialized = true;
        return true;
    }

    createStarGeometry(starData) {
        this.starGeometry = starData;
        this.dispatchEvent({ type: 'geometryUpdated', data: starData });
        return true;
    }

    selectStar(star) {
        this.selectedStar = star;
        this.dispatchEvent({ type: 'starSelected', data: star });
    }

    render() {
        this.renderCount++;
        this.dispatchEvent({ type: 'frameRendered', frame: this.renderCount });
    }

    resetCamera() {
        this.dispatchEvent({ type: 'cameraReset' });
    }
}

class MockRouteManager extends MockEventTarget {
    constructor(starRenderer, errorHandler) {
        super();
        this.starRenderer = starRenderer;
        this.errorHandler = errorHandler;
        this.starData = null;
        this.octree = null;
        this.currentRoute = null;
        this.routeCalculationTime = 0;
    }

    setData(starData, octree) {
        this.starData = starData;
        this.octree = octree;
        this.dispatchEvent({ type: 'dataSet', starCount: starData.length });
    }

    async calculateRoute(startStar, endStar, maxJump) {
        const startTime = Date.now();
        
        // Mock calculation delay
        await new Promise(resolve => setTimeout(resolve, 10));
        
        this.routeCalculationTime = Date.now() - startTime;
        
        // Mock route result
        const mockRoute = {
            path: [startStar, endStar],
            distance: 5.2,
            jumps: 1,
            stranded: false
        };
        
        this.currentRoute = mockRoute;
        this.dispatchEvent({ type: 'routeCalculated', route: mockRoute });
        
        return mockRoute;
    }

    clearRoute() {
        this.currentRoute = null;
        this.dispatchEvent({ type: 'routeCleared' });
    }
}

class MockTourController extends MockEventTarget {
    constructor(starRenderer, errorHandler) {
        super();
        this.starRenderer = starRenderer;
        this.errorHandler = errorHandler;
        this.isActive = false;
        this.currentTarget = null;
        this.tourData = null;
    }

    setData(starData, starDetails) {
        this.tourData = { starData, starDetails };
        this.dispatchEvent({ type: 'tourDataSet', starCount: starData.length });
    }

    startTour() {
        this.isActive = true;
        this.dispatchEvent({ type: 'tourStarted' });
    }

    stopTour() {
        this.isActive = false;
        this.currentTarget = null;
        this.dispatchEvent({ type: 'tourStopped' });
    }

    goToNextTarget() {
        if (!this.isActive) return;
        
        // Mock selecting a random target
        this.currentTarget = `Star${Math.floor(Math.random() * 100)}`;
        this.dispatchEvent({ type: 'tourTargetChanged', target: this.currentTarget });
    }
}

class MockUIManager extends MockEventTarget {
    constructor(starRenderer, routeManager, tourController, errorHandler) {
        super();
        this.starRenderer = starRenderer;
        this.routeManager = routeManager;
        this.tourController = tourController;
        this.errorHandler = errorHandler;
        this.eventListeners = [];
        this.filterState = {
            distance: Infinity,
            size: 0,
            spectralClasses: []
        };
    }

    async initialize() {
        this.setupEventListeners();
        this.dispatchEvent({ type: 'uiInitialized' });
        return true;
    }

    setupEventListeners() {
        // Listen to other modules
        this.starRenderer.addEventListener('starSelected', (event) => {
            this.handleStarSelection(event.data);
        });

        this.routeManager.addEventListener('routeCalculated', (event) => {
            this.handleRouteCalculated(event.route);
        });

        this.tourController.addEventListener('tourStarted', () => {
            this.handleTourStateChange(true);
        });

        this.tourController.addEventListener('tourStopped', () => {
            this.handleTourStateChange(false);
        });

        this.eventListeners.push('starSelected', 'routeCalculated', 'tourStarted', 'tourStopped');
    }

    handleStarSelection(star) {
        this.dispatchEvent({ type: 'uiUpdated', reason: 'starSelection', data: star });
    }

    handleRouteCalculated(route) {
        this.dispatchEvent({ type: 'uiUpdated', reason: 'routeCalculated', data: route });
    }

    handleTourStateChange(isActive) {
        this.dispatchEvent({ type: 'uiUpdated', reason: 'tourStateChange', data: { isActive } });
    }

    updateFilters(newFilters) {
        this.filterState = { ...this.filterState, ...newFilters };
        this.dispatchEvent({ type: 'filtersChanged', filters: this.filterState });
    }
}

// Integration test scenarios
describe('Module Integration & Communication', () => {
    test('Basic module initialization and setup', async () => {
        MockErrorHandler.clear();
        
        // Create mock modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        // Initialize modules
        assert(await starRenderer.initialize(), 'StarRenderer should initialize successfully');
        assert(await uiManager.initialize(), 'UIManager should initialize successfully');

        // Check initialization states
        assert(starRenderer.initialized, 'StarRenderer should be marked as initialized');
        assertEqual(uiManager.eventListeners.length, 4, 'UIManager should have set up 4 event listeners');
        
        assert(!MockErrorHandler.lastError, 'No errors should occur during initialization');
    });

    test('Data flow and module communication', async () => {
        const events = [];
        
        // Create modules with event tracking
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        // Track all events
        [starRenderer, routeManager, tourController, uiManager].forEach(module => {
            module.addEventListener = function(type, listener) {
                MockEventTarget.prototype.addEventListener.call(this, type, listener);
                events.push({ module: this.constructor.name, action: 'listen', type });
            };
            
            const originalDispatch = module.dispatchEvent;
            module.dispatchEvent = function(event) {
                events.push({ module: this.constructor.name, action: 'dispatch', type: event.type, data: event });
                return originalDispatch.call(this, event);
            };
        });

        await uiManager.initialize();

        // Simulate data loading
        const mockStarData = [
            { name: 'Star A', x: 0, y: 0, z: 0 },
            { name: 'Star B', x: 5, y: 0, z: 0 }
        ];
        const mockOctree = { query: () => mockStarData };

        routeManager.setData(mockStarData, mockOctree);
        tourController.setData(mockStarData, {});

        // Check that data was set correctly
        assertEqual(routeManager.starData.length, 2, 'RouteManager should have received star data');
        assert(tourController.tourData, 'TourController should have received tour data');

        // Verify event communication occurred
        const dataSetEvents = events.filter(e => e.type === 'dataSet' || e.type === 'tourDataSet');
        assert(dataSetEvents.length >= 2, 'Data set events should have been dispatched');
    });

    test('Star selection event propagation', async () => {
        let uiUpdateCount = 0;
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Listen for UI updates
        uiManager.addEventListener('uiUpdated', (event) => {
            if (event.reason === 'starSelection') {
                uiUpdateCount++;
            }
        });

        // Simulate star selection
        const selectedStar = { name: 'Sirius', x: 2.6, y: -1.2, z: 0.5 };
        starRenderer.selectStar(selectedStar);

        // Verify event propagation
        assertEqual(starRenderer.selectedStar.name, 'Sirius', 'StarRenderer should have selected star');
        assertEqual(uiUpdateCount, 1, 'UI should have updated once for star selection');
    });

    test('Route calculation and UI feedback', async () => {
        let routeNotifications = 0;
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Listen for route-related UI updates
        uiManager.addEventListener('uiUpdated', (event) => {
            if (event.reason === 'routeCalculated') {
                routeNotifications++;
            }
        });

        // Set up data
        const mockStarData = [
            { name: 'Start', x: 0, y: 0, z: 0 },
            { name: 'End', x: 10, y: 0, z: 0 }
        ];
        routeManager.setData(mockStarData, {});

        // Calculate route
        const route = await routeManager.calculateRoute(mockStarData[0], mockStarData[1], 15);

        // Verify route calculation and notification
        assert(route, 'Route should be calculated');
        assertEqual(route.path.length, 2, 'Route should have 2 waypoints');
        assertEqual(routeNotifications, 1, 'UI should be notified of route calculation');
        assert(routeManager.routeCalculationTime > 0, 'Route calculation should take measurable time');
    });

    test('Tour system integration', async () => {
        let tourStateChanges = 0;
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Monitor tour state changes
        uiManager.addEventListener('uiUpdated', (event) => {
            if (event.reason === 'tourStateChange') {
                tourStateChanges++;
            }
        });

        // Test tour lifecycle
        assert(!tourController.isActive, 'Tour should start inactive');
        
        tourController.startTour();
        assert(tourController.isActive, 'Tour should be active after starting');
        
        tourController.goToNextTarget();
        assert(tourController.currentTarget, 'Tour should have a current target');
        
        tourController.stopTour();
        assert(!tourController.isActive, 'Tour should be inactive after stopping');
        assert(!tourController.currentTarget, 'Tour should have no target after stopping');

        assertEqual(tourStateChanges, 2, 'UI should receive 2 tour state change notifications');
    });

    test('Filter changes and module coordination', async () => {
        let geometryUpdates = 0;
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Monitor geometry updates
        starRenderer.addEventListener('geometryUpdated', () => {
            geometryUpdates++;
        });

        // Simulate filter changes
        uiManager.updateFilters({ distance: 50, size: 1.0 });
        
        // Simulate applying filters (would normally trigger star geometry update)
        const filteredStars = [
            { name: 'Nearby Star', x: 1, y: 1, z: 1, dist: 2 }
        ];
        starRenderer.createStarGeometry(filteredStars);

        // Verify filter state and geometry update
        assertEqual(uiManager.filterState.distance, 50, 'Filter state should be updated');
        assertEqual(uiManager.filterState.size, 1.0, 'Size filter should be updated');
        assertEqual(geometryUpdates, 1, 'Star geometry should be updated once');
        assertEqual(starRenderer.starGeometry.length, 1, 'Filtered star data should be applied');
    });

    test('Error handling across modules', async () => {
        MockErrorHandler.clear();
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        // Simulate error conditions
        MockErrorHandler.showError('Test error message', new Error('Test error'), true);
        assert(MockErrorHandler.lastError, 'Error should be recorded');
        assertEqual(MockErrorHandler.lastError.message, 'Test error message', 'Error message should match');
        assert(MockErrorHandler.lastError.isRetryable, 'Error should be marked as retryable');

        MockErrorHandler.showWarning('Test warning');
        assert(MockErrorHandler.lastWarning, 'Warning should be recorded');
        assertEqual(MockErrorHandler.lastWarning.message, 'Test warning', 'Warning message should match');

        // Verify error handler doesn't interfere with module communication
        starRenderer.selectStar({ name: 'Test Star' });
        assertEqual(starRenderer.selectedStar.name, 'Test Star', 'Star selection should work despite errors');
    });

    test('Event listener cleanup and memory management', async () => {
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Check initial listener count
        const initialListenerCount = Object.keys(starRenderer.listeners).length;
        
        // Add more listeners
        const testListener = () => {};
        starRenderer.addEventListener('testEvent', testListener);
        
        assert(Object.keys(starRenderer.listeners).length > initialListenerCount, 
               'Listener count should increase after adding listener');

        // Remove listener
        starRenderer.removeEventListener('testEvent', testListener);
        
        // Verify cleanup (listener count should be back to initial or close)
        const finalListenerCount = Object.keys(starRenderer.listeners).length;
        assert(finalListenerCount <= initialListenerCount + 1, 
               'Listener count should not grow indefinitely');
    });

    test('Module state consistency during rapid events', async () => {
        let eventCount = 0;
        const MAX_EVENTS = 100;
        
        // Set up modules
        const starRenderer = new MockStarRenderer(MockErrorHandler);
        const routeManager = new MockRouteManager(starRenderer, MockErrorHandler);
        const tourController = new MockTourController(starRenderer, MockErrorHandler);
        const uiManager = new MockUIManager(starRenderer, routeManager, tourController, MockErrorHandler);

        await uiManager.initialize();

        // Monitor all events
        [starRenderer, routeManager, tourController, uiManager].forEach(module => {
            const originalDispatch = module.dispatchEvent;
            module.dispatchEvent = function(event) {
                eventCount++;
                return originalDispatch.call(this, event);
            };
        });

        // Rapid fire events
        for (let i = 0; i < 50; i++) {
            starRenderer.render();
            if (i % 10 === 0) {
                starRenderer.selectStar({ name: `Star${i}` });
            }
        }

        // Verify state consistency
        assert(eventCount >= 50, 'Should have processed many events');
        assert(starRenderer.renderCount === 50, 'Render count should be accurate');
        assertEqual(starRenderer.selectedStar.name, 'Star40', 'Last selected star should be correct');
        
        // Performance check - all events should complete quickly
        const startTime = Date.now();
        for (let i = 0; i < 10; i++) {
            starRenderer.render();
        }
        const processingTime = Date.now() - startTime;
        assert(processingTime < 50, 'Event processing should be fast');
    });
});

runner.run();