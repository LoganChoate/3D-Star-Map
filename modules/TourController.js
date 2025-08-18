export class TourController {
    constructor(starRenderer, errorHandler) {
        this.starRenderer = starRenderer;
        this.errorHandler = errorHandler;
        
        // Tour state
        this.stellarTour = {
            active: false,
            state: 'stopped', // 'stopped', 'traveling', 'paused', 'narrating'
            currentStar: null,
            visitedStars: [],
            pauseDuration: 8000, // 8 seconds at each star
            currentTimeout: null
        };
        
        // Data references (will be set externally)
        this.fullStarData = null;
        this.starDetails = null;
        
        // Narration state
        this.originalNarrationText = '';
        this.currentUtterance = null;
        
        // UI elements (will be set externally)
        this.starDescription = null;
        this.starDescriptionContainer = null;
    }

    setData(fullStarData, starDetails) {
        this.fullStarData = fullStarData;
        this.starDetails = starDetails;
    }

    setUIElements(starDescription, starDescriptionContainer) {
        this.starDescription = starDescription;
        this.starDescriptionContainer = starDescriptionContainer;
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
        this.stellarTour.active = false;
        this.stellarTour.state = 'stopped';
        this.stellarTour.currentStar = null;

        // Cancel any pending timeouts
        if (this.stellarTour.currentTimeout) {
            clearTimeout(this.stellarTour.currentTimeout);
            this.stellarTour.currentTimeout = null;
        }

        // Stop any active speech synthesis
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

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
        if (this.stellarTour.state === 'traveling' || this.stellarTour.state === 'narrating') {
            this.stellarTour.state = 'paused';
            
            if (this.stellarTour.currentTimeout) {
                clearTimeout(this.stellarTour.currentTimeout);
                this.stellarTour.currentTimeout = null;
            }
            
            if (speechSynthesis.speaking) {
                speechSynthesis.pause();
            }
            
            this.dispatchTourEvent('paused');
        }
    }

    resume() {
        if (this.stellarTour.state === 'paused') {
            this.stellarTour.state = 'traveling';
            
            if (speechSynthesis.paused) {
                speechSynthesis.resume();
            } else {
                this.selectNextTourStar();
            }
            
            this.dispatchTourEvent('resumed');
        }
    }

    selectNextTourStar() {
        if (!this.stellarTour.active || !this.fullStarData) return;

        // Filter out already visited stars and get stars with descriptions
        const availableStars = this.fullStarData.filter(star => {
            const hasDescription = this.starDetails && this.starDetails[star.name];
            const notVisited = !this.stellarTour.visitedStars.includes(star.name);
            return hasDescription && notVisited;
        });

        if (availableStars.length === 0) {
            // Reset visited stars if we've seen them all
            this.stellarTour.visitedStars = [];
            const starsWithDescriptions = this.fullStarData.filter(star => 
                this.starDetails && this.starDetails[star.name]
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
        this.stellarTour.visitedStars.push(selectedStar.name);
        
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

        // Frame the star in view with animation
        this.starRenderer.frameObjectInView(star, () => {
            // Update selection highlight
            this.starRenderer.updateSelectionHighlight(star);
            
            // Dispatch star selection event
            this.dispatchStarEvent('selected', star);
            
            if (onTravelComplete) onTravelComplete();
        });
    }

    handleTourArrival() {
        if (!this.stellarTour.active || !this.stellarTour.currentStar) return;

        this.stellarTour.state = 'narrating';
        
        // Start narration if available
        if (this.handleTourNarration()) {
            // Narration will handle the next step
        } else {
            // No narration available, just pause
            this.stellarTour.currentTimeout = setTimeout(() => {
                if (this.stellarTour.active) {
                    this.selectNextTourStar();
                }
            }, this.stellarTour.pauseDuration);
        }
    }

    handleTourNarration() {
        if (!this.stellarTour.currentStar || !this.starDetails) return false;

        const starKey = this.stellarTour.currentStar.name;
        const starInfo = this.starDetails[starKey];
        
        if (!starInfo || !starInfo.description) return false;

        const text = starInfo.description;
        this.originalNarrationText = text;

        // Update UI
        if (this.starDescription && this.starDescriptionContainer) {
            this.starDescription.textContent = text;
            this.starDescriptionContainer.classList.remove('hidden');
        }

        // Start speech synthesis
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Implement karaoke-style word highlighting
        utterance.onboundary = (event) => {
            if (event.name === 'word' && this.starDescription) {
                const wordStart = event.charIndex;
                let wordEnd = text.indexOf(' ', wordStart);
                if (wordEnd === -1) wordEnd = text.length;

                const before = text.substring(0, wordStart);
                const word = text.substring(wordStart, wordEnd);
                const after = text.substring(wordEnd);

                this.starDescription.innerHTML = `${before}<span class="highlight-word">${word}</span>${after}`;

                const highlightSpan = this.starDescription.querySelector('.highlight-word');
                if (highlightSpan) {
                    highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        };

        utterance.onend = () => {
            if (this.starDescription) {
                this.starDescription.textContent = this.originalNarrationText;
            }
            
            // Continue tour after narration
            if (this.stellarTour.active) {
                this.stellarTour.currentTimeout = setTimeout(() => {
                    if (this.stellarTour.active) {
                        this.selectNextTourStar();
                    }
                }, 2000); // 2 second pause after narration
            }
        };

        utterance.onerror = (event) => {
            console.error('Tour narration error:', event.error);
            if (this.starDescription) {
                this.starDescription.textContent = this.originalNarrationText;
            }
            
            // Continue tour despite narration error
            if (this.stellarTour.active) {
                this.stellarTour.currentTimeout = setTimeout(() => {
                    if (this.stellarTour.active) {
                        this.selectNextTourStar();
                    }
                }, this.stellarTour.pauseDuration);
            }
        };

        this.currentUtterance = utterance;
        speechSynthesis.speak(utterance);
        
        console.log(`Tour: narrating ${this.stellarTour.currentStar.name}`);
        return true;
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
                star: star
            }
        }));
    }

    dispose() {
        this.stop();
        
        if (this.currentUtterance) {
            speechSynthesis.cancel();
            this.currentUtterance = null;
        }
        
        this.originalNarrationText = '';
    }
}