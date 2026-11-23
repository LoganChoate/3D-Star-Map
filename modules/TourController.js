import { StarLookup } from '../utils/StarLookup.js';

export class TourController {
    constructor(starRenderer, errorHandler) {
        this.starRenderer = starRenderer;
        this.errorHandler = errorHandler;
        
        // Tour state
        this.stellarTour = {
            active: false,
            state: 'stopped', // stopped, traveling, paused, narrating, waiting
            currentStar: null,
            visitedStars: [],
            pauseDuration: 8000, // 8 seconds at each star
            currentTimeout: null
        };
        
        // Data references (will be set externally)
        this.fullStarData = null;
        this.starDetails = null;
        this.lookup = null;
        this.activeStarData = null;
        
        // Narration state
        this.originalNarrationText = '';
        this.narration = null;
        this.dossierFor = null;
        this.visitGeneration = 0;
        this.narrating = null;
        
        // UI elements (will be set externally)
        this.starDescription = null;
        this.starDescriptionContainer = null;
    }

    setData(fullStarData, starDetails) {
        this.fullStarData = fullStarData;
        this.starDetails = starDetails;
        this.lookup = new StarLookup(fullStarData, starDetails);
        if (!this.activeStarData) this.activeStarData = fullStarData;
    }

    setActiveStarData(stars) {
        this.activeStarData = stars;
        if (this.stellarTour.currentStar && !stars.some(star => star.id === this.stellarTour.currentStar.id)) {
            this.interrupt();
        }
    }

    setUIElements(starDescription, starDescriptionContainer) {
        this.starDescription = starDescription;
        this.starDescriptionContainer = starDescriptionContainer;
    }

    setNarration(narration, dossierFor) {
        if (this.stellarTour.active) this.stop();
        this.unsubscribeNarration?.();
        this.narration = narration;
        this.dossierFor = dossierFor;
        this.unsubscribeNarration = narration.subscribe(state => this.onNarrationState(state));
    }

    onNarrationState(state) {
        const expected = this.narrating;
        if (!expected || !this.stellarTour.active || expected.generation !== this.visitGeneration) return;
        if (state.contentId !== expected.id) {
            // Another view took speech ownership. Its completion cannot advance us.
            this.narrating = null;
            this.stellarTour.state = 'paused';
            this.dispatchTourEvent('paused');
            return;
        }
        if (this.starDescription) this.starDescription.textContent = state.text;
        if (state.status === 'ended') {
            this.narrating = null;
            if (this.stellarTour.state !== 'paused') this.scheduleNext(2000, expected);
        } else if (['error','unavailable','loading-voices'].includes(state.status)) {
            this.narrating = null;
            if (this.stellarTour.state !== 'paused') this.scheduleNext(this.stellarTour.pauseDuration, expected);
        } else if (['stopped','ready','idle','disposed'].includes(state.status)) {
            this.narrating = null;
            this.stellarTour.state = 'paused';
            this.dispatchTourEvent('paused');
        }
    }

    clearNextTimeout() {
        if (this.stellarTour.currentTimeout !== null) clearTimeout(this.stellarTour.currentTimeout);
        this.stellarTour.currentTimeout = null;
    }

    scheduleNext(delay, expected = {generation:this.visitGeneration,id:this.stellarTour.currentStar?.id}) {
        this.clearNextTimeout();
        if (!this.stellarTour.active || this.stellarTour.state === 'paused') return;
        this.stellarTour.state = 'waiting';
        const timeout = setTimeout(() => {
            if (this.stellarTour.currentTimeout !== timeout) return;
            this.stellarTour.currentTimeout = null;
            if (this.stellarTour.active && this.stellarTour.state === 'waiting' &&
                this.visitGeneration === expected.generation && this.stellarTour.currentStar?.id === expected.id) this.selectNextTourStar();
        }, delay);
        this.stellarTour.currentTimeout = timeout;
    }

    toggle() {
        if (this.stellarTour.active) {
            this.stop();
        } else {
            this.start();
        }
        return this.stellarTour.active;
    }

    start() {
        if (this.stellarTour.active) return true;
        if (!this.fullStarData || this.fullStarData.length === 0) {
            this.errorHandler.showError('No star data available for tour');
            return false;
        }

        this.stellarTour.active = true;
        this.stellarTour.state = 'traveling';
        this.stellarTour.visitedStars = [];
        
        this.selectNextTourStar();
        this.dispatchTourEvent('started');
        
        console.log('Stellar tour started');
        return true;
    }

    stop() {
        this.visitGeneration++;
        this.narrating = null;
        this.stellarTour.active = false;
        this.stellarTour.state = 'stopped';
        this.stellarTour.currentStar = null;

        // Cancel any pending timeouts
        this.clearNextTimeout();

        // Stop any active speech synthesis
        this.narration?.stop();

        // Kill any active GSAP animations on the camera and controls
        if (window.gsap) {
            gsap.killTweensOf(this.starRenderer.camera.position);
            gsap.killTweensOf(this.starRenderer.controls.target);
        }

        // Re-enable controls
        if (this.starRenderer.activeControls) {
            this.starRenderer.activeControls.enabled = true;
        }

        this.dispatchTourEvent('stopped');
        console.log('Stellar tour stopped');
    }

    pause() {
        if (this.stellarTour.active && this.stellarTour.state !== 'paused') {
            this.pausedFrom = this.stellarTour.state;
            this.stellarTour.state = 'paused';
            this.clearNextTimeout();
            if (this.pausedFrom === 'traveling') {
                this.visitGeneration++;
                window.gsap?.killTweensOf(this.starRenderer.camera.position);
                window.gsap?.killTweensOf(this.starRenderer.controls.target);
            }
            if (this.narration?.snapshot().contentId === this.stellarTour.currentStar?.id) this.narration.pause();
            
            this.dispatchTourEvent('paused');
        }
    }

    resume() {
        if (this.stellarTour.active && this.stellarTour.state === 'paused') {
            this.stellarTour.state = 'traveling';
            const narration = this.narration?.snapshot();
            if (narration?.status === 'paused' && narration.contentId === this.stellarTour.currentStar?.id) {
                this.stellarTour.state = 'narrating';
                this.narration.resume();
            } else if (this.pausedFrom === 'traveling' && this.stellarTour.currentStar) {
                this.initiateTourFlight(this.stellarTour.currentStar, () => this.handleTourArrival());
            } else {
                this.selectNextTourStar();
            }
            
            this.dispatchTourEvent('resumed');
        }
    }

    selectNextTourStar() {
        if (!this.stellarTour.active || !this.fullStarData || this.stellarTour.state === 'paused') return;
        this.clearNextTimeout();
        this.visitGeneration++;
        this.narrating = null;
        this.narration?.stop();
        this.stellarTour.state = 'traveling';

        // Filter out already visited stars and get stars with descriptions
        const availableStars = (this.activeStarData || []).filter(star => {
            const hasDescription = this.lookup?.describe(star)?.description;
            const notVisited = !this.stellarTour.visitedStars.includes(star.id);
            return hasDescription && notVisited;
        });

        if (availableStars.length === 0) {
            // Reset visited stars if we've seen them all
            this.stellarTour.visitedStars = [];
            const starsWithDescriptions = (this.activeStarData || []).filter(star =>
                this.lookup?.describe(star)?.description
            );
            
            if (starsWithDescriptions.length === 0) {
                this.errorHandler.showWarning('No stars with descriptions available for tour');
                this.stop();
                return;
            }
            
            availableStars.push(...starsWithDescriptions);
        }

        // Randomly select a star
        const randomIndex = Math.floor(Math.random() * availableStars.length);
        const selectedStar = availableStars[randomIndex];
        
        this.stellarTour.currentStar = selectedStar;
        this.stellarTour.visitedStars.push(selectedStar.id);
        
        console.log(`Tour: traveling to ${selectedStar.name}`);
        
        // Travel to the selected star
        this.initiateTourFlight(selectedStar, () => {
            if (this.stellarTour.active) {
                this.handleTourArrival();
            }
        });
    }

    initiateTourFlight(star, onTravelComplete) {
        if (!star) {
            if (onTravelComplete) onTravelComplete();
            return;
        }

        const generation = this.visitGeneration;
        // Frame the star in view with animation
        this.starRenderer.frameObjectInView(star, () => {
            if (!this.stellarTour.active || this.stellarTour.state !== 'traveling' ||
                this.visitGeneration !== generation || this.stellarTour.currentStar?.id !== star.id) return;
            // Update selection highlight
            this.starRenderer.updateSelectionHighlight(star);
            
            // Dispatch star selection event
            this.dispatchStarEvent('selected', star);
            
            if (onTravelComplete) onTravelComplete();
        });
    }

    handleTourArrival() {
        if (!this.stellarTour.active || !this.stellarTour.currentStar || this.stellarTour.state !== 'traveling') return;

        this.stellarTour.state = 'narrating';
        
        // Start narration if available
        if (this.handleTourNarration()) {
            // Narration will handle the next step
        } else {
            // No narration available, just pause
            this.scheduleNext(this.stellarTour.pauseDuration);
        }
    }

    handleTourNarration() {
        const star = this.stellarTour.currentStar;
        if (!star || !this.narration || !this.dossierFor) return false;
        const text = this.dossierFor(star).narrationText;
        if (!text) return false;
        this.originalNarrationText = text;
        if (this.starDescription) this.starDescription.textContent = text;
        this.starDescriptionContainer?.classList.remove('hidden');
        this.narration.setContent({id:star.id,text});
        this.narrating = {generation:this.visitGeneration,id:star.id};
        return this.narration.play();
    }

    interrupt() {
        if (this.stellarTour.active) {
            this.stop();
        }
    }

    getCurrentStar() {
        return this.stellarTour.currentStar;
    }

    getState() {
        return {
            active: this.stellarTour.active,
            state: this.stellarTour.state,
            currentStar: this.stellarTour.currentStar,
            visitedCount: this.stellarTour.visitedStars.length
        };
    }

    isActive() {
        return this.stellarTour.active;
    }

    setPauseDuration(duration) {
        if (typeof duration === 'number' && duration > 0) {
            this.stellarTour.pauseDuration = duration;
            return true;
        }
        return false;
    }

    // Utility method to shuffle array for random star selection
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Event dispatching for UI updates
    dispatchTourEvent(eventType, data = null) {
        window.dispatchEvent(new CustomEvent('stellarTourUpdate', {
            detail: {
                type: eventType,
                state: this.getState(),
                data: data
            }
        }));
    }

    dispatchStarEvent(eventType, star) {
        window.dispatchEvent(new CustomEvent('starSelection', {
            detail: {
                type: eventType,
                star: star,
                source: 'TourController'
            }
        }));
    }

    dispose() {
        this.stop();
        
        this.unsubscribeNarration?.();
        this.unsubscribeNarration = null;
        
        this.originalNarrationText = '';
    }
}
