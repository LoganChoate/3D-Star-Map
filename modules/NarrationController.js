/**
 * One owner for object narration. A local voice is a prerequisite, not proof
 * that a packaged build produces sound offline; that is an acceptance check.
 * This class never starts speech in response to selection or voiceschanged.
 */
export class NarrationController {
    constructor({synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, visibilitySource = globalThis.document} = {}) {
        this.synth = synth;
        this.Utterance = Utterance;
        this.visibilitySource = visibilitySource;
        this.contentId = null;
        this.text = '';
        this.rate = 0.9;
        this.volume = 1;
        this.voiceURI = '';
        this.status = 'idle';
        this.message = 'Select an object to hear its description.';
        this.errorCode = null;
        this.boundaryIndex = null;
        this.boundaryLength = 0;
        this.started = false;
        this.disposed = false;
        this.generation = 0;
        this.utterance = null;
        this.listeners = new Set();
        this.voices = [];
        this.voiceCount = 0;
        this.voiceReadFailed = false;
        // Speech ownership covers the atlas and tours as well as the inspector.
        // Hiding any of those views stops audio; returning never resumes it.
        this._visibilityListener = () => { if (this.visibilitySource?.hidden === true) this.stop(); };
        visibilitySource?.addEventListener?.('visibilitychange', this._visibilityListener);
        this._voiceListener = () => this._refreshVoices();
        if (synth?.addEventListener) {
            synth.addEventListener('voiceschanged', this._voiceListener);
        } else if (synth) {
            this._previousVoiceListener = synth.onvoiceschanged;
            this._voiceListener = event => {
                try { this._previousVoiceListener?.call(synth, event); }
                finally { this._refreshVoices(); }
            };
            synth.onvoiceschanged = this._voiceListener;
        }
        this._refreshVoices(false);
    }

    _assertActive() {
        if (this.disposed) throw new Error('Narration has been disposed.');
    }

    _hasSpeech() {
        return !!this.synth && typeof this.Utterance === 'function' &&
            ['getVoices', 'speak', 'cancel', 'pause', 'resume'].every(name => typeof this.synth[name] === 'function');
    }

    _activePlayback() { return this.status === 'speaking' || this.status === 'paused'; }

    _availability() {
        if (!this.text) return ['idle', 'No narration text is available for this object.'];
        if (!this._hasSpeech()) return ['unavailable', 'Speech is unavailable in this app. The full transcript remains available.'];
        if (this.voiceReadFailed) return ['unavailable', 'System voices could not be read. The full transcript remains available.'];
        if (!this.voices.length && !this.voiceCount) return ['loading-voices', 'Waiting for system voices. You can read the transcript or press Play to check again.'];
        if (!this.voices.length) return ['unavailable', 'No local voice is available. Network voices are not used; the full transcript remains available.'];
        return ['ready', 'Ready. Press Play to hear this object.'];
    }

    _refreshVoices(notify = true) {
        if (this.disposed) return;
        const oldVoice = this.voiceURI;
        let voices = [];
        this.voiceReadFailed = false;
        try { voices = this._hasSpeech() ? Array.from(this.synth.getVoices() || []) : []; }
        catch { this.voiceReadFailed = true; }
        this.voiceCount = voices.length;
        const seen = new Set();
        this.voices = voices.filter(voice => {
            // Reject truthy strings and unspecified locality as well as remote voices.
            if (voice?.localService !== true || typeof voice.voiceURI !== 'string' || !voice.voiceURI || seen.has(voice.voiceURI)) return false;
            seen.add(voice.voiceURI);
            return true;
        });
        const chosen = this.voices.find(voice => voice.voiceURI === oldVoice) ||
            this.voices.find(voice => /^en(?:-|$)/i.test(voice.lang) && voice.default) ||
            this.voices.find(voice => /^en(?:-|$)/i.test(voice.lang)) ||
            this.voices.find(voice => voice.default) || this.voices[0];
        this.voiceURI = chosen?.voiceURI || '';
        if (this._activePlayback() && oldVoice !== this.voiceURI) {
            if (!this._cancel()) { if (notify) this._notify(); return; }
            [this.status, this.message] = this._availability();
            if (this.status === 'ready') this.message = 'The available voice changed. Press Play to restart.';
        } else if (!this._activePlayback() && ['idle', 'ready', 'loading-voices', 'unavailable'].includes(this.status)) {
            [this.status, this.message] = this._availability();
        }
        if (notify) this._notify();
    }

    getVoices() {
        return this.voices.map(voice => ({voiceURI:voice.voiceURI, name:voice.name, lang:voice.lang, default:!!voice.default, localService:true}));
    }

    snapshot() {
        const available = this._hasSpeech() && this.voices.length > 0 && !this.disposed;
        return {
            status:this.status, contentId:this.contentId, text:this.text, message:this.message,
            errorCode:this.errorCode, boundaryIndex:this.boundaryIndex, boundaryLength:this.boundaryLength,
            started:this.started, rate:this.rate, volume:this.volume, voiceURI:this.voiceURI,
            voices:this.getVoices(), available,
            canPlay:!this.disposed && !!this.text && !this._activePlayback(),
            canPause:this.status === 'speaking', canResume:this.status === 'paused',
            canStop:this._activePlayback()
        };
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new TypeError('A narration listener must be a function.');
        this._assertActive();
        this.listeners.add(listener);
        listener(this.snapshot());
        return () => this.listeners.delete(listener);
    }

    _notify() {
        for (const listener of [...this.listeners]) {
            // A failing view must not prevent cancellation or notify other views.
            try { listener(this.snapshot()); } catch (error) { console.error('Narration view update failed', error); }
        }
    }

    _cancel() {
        // Invalidate BEFORE cancel: implementations may synchronously fire end/error.
        this.generation++;
        this.utterance = null;
        this.boundaryIndex = null;
        this.boundaryLength = 0;
        this.started = false;
        this.errorCode = null;
        try { this.synth?.cancel?.(); }
        catch {
            this.status = 'error';
            this.errorCode = 'cancel-failed';
            this.message = 'Narration could not be stopped. New speech was not started.';
            return false;
        }
        return true;
    }

    setContent({id, text} = {}) {
        this._assertActive();
        if (typeof id !== 'string' || !id.trim() || typeof text !== 'string') throw new TypeError('Narration requires a stable object ID and text.');
        if (id === this.contentId && text.trim() === this.text) return this.snapshot();
        const cancelled = this._cancel();
        this.contentId = id;
        this.text = text.trim();
        if (cancelled) [this.status, this.message] = this._availability();
        this._notify();
        return this.snapshot();
    }

    play() {
        this._assertActive();
        // A tour can arrive after the app was hidden. Its delayed arrival must
        // not enqueue new speech while no visible playback control is available.
        if (this.visibilitySource?.hidden === true) { this.stop(); return false; }
        this._refreshVoices(false);
        const [status, message] = this._availability();
        if (status !== 'ready') {
            if (!this._cancel()) { this._notify(); return false; }
            this.status = status;
            this.message = message;
            this._notify();
            return false;
        }
        if (!this._cancel()) { this._notify(); return false; }
        const generation = this.generation, id = this.contentId;
        let utterance;
        try {
            utterance = new this.Utterance(this.text);
            this.utterance = utterance;
            utterance.voice = this.voices.find(voice => voice.voiceURI === this.voiceURI);
            utterance.lang = utterance.voice.lang;
            utterance.rate = this.rate;
            utterance.volume = this.volume;
            utterance.pitch = 1;
            const current = () => !this.disposed && this.generation === generation && this.contentId === id && this.utterance === utterance;
            utterance.onstart = () => {
                if (!current()) return;
                this.started = true;
                this.message = this.status === 'paused' ? 'Narration paused.' : 'Reading this object.';
                this._notify();
            };
            utterance.onboundary = event => {
                if (!current() || this.status !== 'speaking' || (event.name && event.name !== 'word')) return;
                const index = event.charIndex;
                if (!Number.isInteger(index) || index < 0 || index >= this.text.length) return;
                const reported = event.charLength;
                const length = Number.isInteger(reported) && reported > 0 ? reported : (this.text.slice(index).match(/^\S+/)?.[0].length || 0);
                this.boundaryIndex = index;
                this.boundaryLength = Math.min(length, this.text.length - index);
                this._notify();
            };
            utterance.onend = () => {
                if (!current()) return;
                this.utterance = null;
                this.status = 'ended';
                this.message = 'Narration finished.';
                this.boundaryIndex = null;
                this.boundaryLength = 0;
                this._notify();
            };
            utterance.onerror = event => {
                if (!current()) return;
                this._fail(typeof event.error === 'string' ? event.error : 'speech-failed');
            };
            // Reset an engine left paused by a previous utterance before enqueueing.
            this.synth.resume();
            this.status = 'speaking';
            this.message = 'Starting narration…';
            this.synth.speak(utterance);
            this._notify();
            return this.status !== 'error';
        } catch {
            this._fail('speech-failed');
            return false;
        }
    }

    _fail(code) {
        this._cancel();
        this.status = 'error';
        this.errorCode = String(code).slice(0, 80);
        this.message = 'Narration could not play. The transcript remains available; press Play to retry.';
        this._notify();
    }

    pause() {
        if (this.disposed || this.status !== 'speaking') return false;
        const utterance = this.utterance, generation = this.generation;
        try { this.synth.pause(); }
        catch { this._fail('pause-failed'); return false; }
        if (this.utterance !== utterance || this.generation !== generation) return false;
        this.status = 'paused';
        this.message = 'Narration paused.';
        this._notify();
        return true;
    }

    resume() {
        if (this.disposed || this.status !== 'paused') return false;
        const utterance = this.utterance, generation = this.generation;
        try { this.synth.resume(); }
        catch { this._fail('resume-failed'); return false; }
        if (this.utterance !== utterance || this.generation !== generation) return false;
        this.status = 'speaking';
        this.message = 'Reading this object.';
        this._notify();
        return true;
    }

    stop() {
        if (this.disposed) return false;
        const cancelled = this._cancel();
        if (cancelled) {
            [this.status, this.message] = this._availability();
            if (this.status === 'ready') { this.status = 'stopped'; this.message = 'Narration stopped. Press Play to restart.'; }
        }
        this._notify();
        return cancelled;
    }

    _settingChanged() {
        if (this._activePlayback()) {
            if (this._cancel()) {
                this.status = 'stopped';
                this.message = 'Narration setting changed. Press Play to restart with the new setting.';
            }
        }
        this._notify();
    }

    setRate(rate) {
        this._assertActive();
        if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new RangeError('Narration speed must be between 0.5 and 2.');
        if (rate !== this.rate) { this.rate = rate; this._settingChanged(); }
        return this.snapshot();
    }

    setVolume(volume) {
        this._assertActive();
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError('Narration volume must be between 0 and 1.');
        if (volume !== this.volume) { this.volume = volume; this._settingChanged(); }
        return this.snapshot();
    }

    setVoice(uri) {
        this._assertActive();
        if (typeof uri !== 'string' || !this.voices.some(voice => voice.voiceURI === uri)) throw new RangeError('Choose an available local voice.');
        if (uri !== this.voiceURI) { this.voiceURI = uri; this._settingChanged(); }
        return this.snapshot();
    }

    dispose() {
        if (this.disposed) return;
        this._cancel();
        this.disposed = true;
        this.visibilitySource?.removeEventListener?.('visibilitychange', this._visibilityListener);
        if (this.synth?.removeEventListener) this.synth.removeEventListener('voiceschanged', this._voiceListener);
        else if (this.synth?.onvoiceschanged === this._voiceListener) this.synth.onvoiceschanged = this._previousVoiceListener || null;
        this.status = 'disposed';
        this.message = 'Narration closed.';
        this._notify();
        this.listeners.clear();
    }
}
