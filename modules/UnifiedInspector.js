import { MoonAssetTrial } from './MoonAssetTrial.js';
import { SunAssetTrial } from './SunAssetTrial.js';
import { EarthAssetTrial } from './EarthAssetTrial.js';

const text = value => value == null || value === '' ? 'Unknown · not supplied' : String(value);
const safeSource = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const focusable = root => [...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]')]
    .filter(element => !element.closest('[hidden]') && element.getClientRects().length);

/** One modal lifecycle for appearance, retained catalog records and local narration. */
export class UnifiedInspector {
    constructor({mount = document.body, onOpen = () => {}, onClose = () => {}, narration = null} = {}) {
        Object.assign(this,{mount,onOpen,onClose,narration});
        this.isOpen = false;
        this.status = 'closed';
        this.ready = Promise.resolve(false);
        this.generation = 0;
        this.disposed = false;
        this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const options = {embedded:true,onRequestClose:() => this.close()};
        this.moonTrial = new MoonAssetTrial(options);
        this.sunTrial = new SunAssetTrial(options);
        this.earthTrial = new EarthAssetTrial(options);
    }

    open(body, dossier) {
        if (this.disposed) throw new Error('The close-up viewer has been disposed.');
        if (!body?.id || dossier?.id !== body.id) throw new Error('The inspection record does not match the selected body.');
        const wasOpen = this.isOpen;
        const generation = ++this.generation;
        this.narration?.stop();
        this.activeTrial?.close({fromHost:true});
        this.activeTrial = null;
        this.body = body;
        this.dossier = dossier;
        this.error = null;
        if (!wasOpen) {
            this.isOpen = true;
            this.returnFocus = document.activeElement;
            this.returnFocusId = this.returnFocus?.id;
            this.inertElements = [...this.mount.children].map(element => [element,element.inert]);
            this.inertElements.forEach(([element]) => { element.inert = true; });
            this.previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            this.abort = new AbortController();
            this.buildShell();
            this.onOpen(body);
        }
        this.visualKind = body.id === 'sol' && dossier.visualKind === 'sun' ? 'sun'
            : body.id === 'solar:moon' && dossier.visualKind === 'moon' ? 'moon'
            : body.id === 'solar:earth' && dossier.visualKind === 'earth' ? 'earth' : null;
        this.element.dataset.bodyId = body.id;
        this.element.dataset.visual = this.visualKind || 'information';
        this.elements['inspection-toggle-info'].hidden = !this.visualKind;
        this.setInfoVisible(true);
        this.renderDossier();
        this.elements['inspection-visual'].replaceChildren();
        this.elements['inspection-controls'].replaceChildren();
        this.elements['inspection-controls'].className = 'inspection-controls';
        this.elements['inspection-retry'].hidden = true;
        this.elements['inspection-status'].textContent = '';
        this.narration?.setContent({id:body.id,text:dossier.narrationText || ''});
        this.elements['inspection-close'].focus({preventScroll:true});
        if (!this.visualKind) {
            this.status = 'ready';
            const placeholder = document.createElement('div');
            placeholder.id = 'inspection-information-only';
            placeholder.className = 'inspection-information-only';
            const eyebrow = document.createElement('p'), title = document.createElement('h2'), note = document.createElement('p');
            eyebrow.className = 'inspection-eyebrow';
            eyebrow.textContent = 'CATALOG EXPLORATION';
            title.textContent = 'No reviewed close-up appearance';
            note.textContent = dossier.visualNote || 'A reviewed close-up asset is not available for this object. Explore its retained catalog information alongside this view.';
            placeholder.append(eyebrow,title,note);
            this.elements['inspection-visual'].append(placeholder);
            this.ready = Promise.resolve(true);
        } else {
            this.status = 'loading';
            const trial = this.activeTrial = {sun:this.sunTrial,moon:this.moonTrial,earth:this.earthTrial}[this.visualKind];
            trial.mount = this.elements['inspection-visual'];
            trial.controlsMount = this.elements['inspection-controls'];
            trial.controlsMount.classList.add({sun:'sol-trial',moon:'moon-trial',earth:'earth-trial'}[this.visualKind]);
            trial.setSuspended(document.hidden);
            this.ready = this.loadVisual(trial,body,generation);
        }
        return this.ready;
    }

    async loadVisual(trial, body, generation) {
        let result = false, loadError = null;
        try { result = await trial.open(body); }
        catch (error) { loadError = String(error.message || error); }
        if (!this.isOpen || generation !== this.generation) return false;
        this.error = loadError;
        this.status = result ? 'ready' : 'error';
        if (result) {
            if (this.motionPreference.matches) trial.reduceMotion();
            trial.setSuspended(document.hidden);
        } else {
            this.error ||= 'The close-up could not be loaded. The catalog record remains available.';
            this.elements['inspection-status'].textContent = this.error;
            this.elements['inspection-retry'].hidden = false;
        }
        return result;
    }

    buildShell() {
        const element = this.element = document.createElement('section');
        element.id = 'unified-inspector';
        element.className = 'inspection';
        element.tabIndex = -1;
        element.setAttribute('role','dialog');
        element.setAttribute('aria-modal','true');
        element.setAttribute('aria-labelledby','inspection-title');
        element.innerHTML = `<header class="inspection-header"><div><p id="inspection-kind" class="inspection-eyebrow"></p><h1 id="inspection-title"></h1></div><div class="inspection-header-actions"><button id="inspection-toggle-info" aria-controls="inspection-pane" aria-expanded="true">Hide details</button><button id="inspection-close">← Return to map</button></div></header>
          <div class="inspection-layout"><div id="inspection-visual" class="inspection-visual"></div>
          <aside id="inspection-pane" class="inspection-pane" aria-label="Appearance, catalog information and narration">
            <p id="inspection-visual-note" class="inspection-note"></p><p id="inspection-motion-note" class="inspection-note" hidden>Reduced motion is on. Activity starts paused; you can enable motion with the controls.</p>
            <div id="inspection-controls" class="inspection-controls"></div>
            <p id="inspection-status" class="inspection-note" role="status" aria-live="polite"></p><button id="inspection-retry" hidden>Retry close-up</button>
            <section class="inspection-about" aria-labelledby="inspection-about-title"><h2 id="inspection-about-title">About this object</h2><p id="inspection-summary"></p></section>
            <section id="inspection-narration" class="inspection-narration" aria-labelledby="inspection-narration-title"><h2 id="inspection-narration-title">Listen to the description</h2>
              <p id="inspection-narration-status" class="inspection-note" role="status" aria-live="polite"></p>
              <div class="inspection-buttons"><button id="inspection-narration-play">Play</button><button id="inspection-narration-pause">Pause</button><button id="inspection-narration-resume">Resume</button><button id="inspection-narration-stop">Stop</button></div>
              <label for="inspection-narration-voice">Local voice</label><select id="inspection-narration-voice" aria-label="Local narration voice"></select>
              <label for="inspection-narration-rate">Reading speed <output id="inspection-narration-rate-value">1×</output></label><input id="inspection-narration-rate" type="range" min="0.5" max="2" step="0.1" value="1">
              <label for="inspection-narration-volume">Volume <output id="inspection-narration-volume-value">100%</output></label><input id="inspection-narration-volume" type="range" min="0" max="1" step="0.1" value="1">
              <details><summary>Reading text</summary><p id="inspection-narration-text"></p></details>
            </section>
            <section id="inspection-catalog" aria-label="Retained catalog information"></section>
            <section class="inspection-sources" aria-labelledby="inspection-sources-title"><h2 id="inspection-sources-title">Catalog sources</h2><div id="inspection-sources"></div><p class="inspection-note">Source links open online references. The retained information and approved close-ups remain available offline.</p></section>
          </aside></div>`;
        this.mount.append(element);
        this.elements = Object.fromEntries([...element.querySelectorAll('[id]')].map(item => [item.id,item]));
        const options = {signal:this.abort.signal};
        const listen = (id,type,handler) => this.elements[id].addEventListener(type,handler,options);
        listen('inspection-close','click',() => this.close());
        listen('inspection-toggle-info','click',() => this.setInfoVisible(this.elements['inspection-pane'].hidden));
        listen('inspection-retry','click',() => this.open(this.body,this.dossier));
        for (const action of ['play','pause','resume','stop']) listen(`inspection-narration-${action}`,'click',() => this.narration?.[action]());
        listen('inspection-narration-voice','change',event => this.narration?.setVoice(event.target.value));
        listen('inspection-narration-rate','input',event => this.narration?.setRate(Number(event.target.value)));
        listen('inspection-narration-volume','input',event => this.narration?.setVolume(Number(event.target.value)));
        // A disabled focused control may send focus to <body> without focusin.
        // Own modal keys at document capture scope for the entire open lifetime.
        document.addEventListener('keydown',event => this.handleKey(event),{...options,capture:true});
        document.addEventListener('focusin',event => {
            if (this.isOpen && !element.contains(event.target)) this.elements['inspection-close'].focus({preventScroll:true});
        },options);
        document.addEventListener('visibilitychange',() => {
            this.activeTrial?.setSuspended(document.hidden);
            // NarrationController owns stop-on-hide across inspector, atlas and tours.
        },options);
        const motionChanged = () => {
            this.elements['inspection-motion-note'].hidden = !this.motionPreference.matches;
            if (this.motionPreference.matches) this.activeTrial?.reduceMotion();
        };
        this.motionPreference.addEventListener('change',motionChanged,options);
        motionChanged();
        this.unsubscribeNarration = this.narration?.subscribe(state => this.renderNarration(state));
        if (!this.narration) this.renderNarration({status:'unavailable',voices:[],text:'',message:'Local narration is unavailable. The description remains readable.'});
    }

    renderDossier() {
        const dossier = this.dossier;
        this.elements['inspection-title'].textContent = text(dossier.title);
        this.elements['inspection-kind'].textContent = `${text(dossier.kind)} · ${dossier.id}`;
        this.elements['inspection-summary'].textContent = text(dossier.summary);
        this.elements['inspection-visual-note'].textContent = dossier.visualNote || '';
        const catalog = this.elements['inspection-catalog'];
        catalog.replaceChildren();
        for (const group of dossier.groups || []) {
            const section = document.createElement('section'), heading = document.createElement('h2'), list = document.createElement('dl');
            heading.textContent = text(group.title);
            for (const field of group.fields || []) {
                const label = document.createElement('dt'), value = document.createElement('dd');
                label.textContent = text(field.label); value.textContent = text(field.value); list.append(label,value);
            }
            section.append(heading,list);catalog.append(section);
        }
        const sources = this.elements['inspection-sources'];
        sources.replaceChildren();
        for (const source of dossier.sources || []) {
            const row = document.createElement('p');
            if (safeSource(source.url)) {
                const link = document.createElement('a');
                link.href = source.url;link.target = '_blank';link.rel = 'noopener noreferrer';link.textContent = text(source.label);
                row.append(link);
            } else row.textContent = text(source.label);
            sources.append(row);
        }
        if (!sources.childElementCount) sources.textContent = 'Unknown · no source reference supplied.';
    }

    setInfoVisible(visible) {
        this.elements['inspection-pane'].hidden = !visible;
        this.element.dataset.details = visible ? 'visible' : 'hidden';
        this.elements['inspection-toggle-info'].setAttribute('aria-expanded',String(visible));
        this.elements['inspection-toggle-info'].textContent = visible ? 'Hide details' : 'Show details';
    }

    renderNarration(state) {
        if (!this.elements) return;
        const focusedAction = document.activeElement;
        const status = state.status, available = !!state.voices?.length && !!state.text;
        const playing = status === 'speaking', paused = status === 'paused';
        this.elements['inspection-narration'].dataset.state = status;
        this.elements['inspection-narration-status'].textContent = state.message || ({ready:'Ready · uses a voice installed on this computer.',speaking:'Reading…',paused:'Paused.',stopped:'Stopped.',ended:'Reading complete.',unavailable:'An offline voice is not available. The description remains readable.', 'loading-voices':'Looking for an installed offline voice…'}[status] || 'Select Play to listen.');
        this.elements['inspection-narration-play'].disabled = !(state.canPlay ?? (available && !playing && !paused));
        this.elements['inspection-narration-pause'].disabled = !(state.canPause ?? playing);
        this.elements['inspection-narration-resume'].disabled = !(state.canResume ?? paused);
        this.elements['inspection-narration-stop'].disabled = !(state.canStop ?? (playing || paused));
        if (focusedAction?.matches('button[id^="inspection-narration-"]') && focusedAction.disabled) {
            const next = this.elements[`inspection-narration-${playing ? 'pause' : paused ? 'resume' : 'play'}`];
            (next.disabled ? this.elements['inspection-close'] : next).focus({preventScroll:true});
        }
        const voices = this.elements['inspection-narration-voice'];
        const signature = JSON.stringify(state.voices || []);
        if (voices.dataset.signature !== signature) {
            voices.replaceChildren();
            for (const voice of state.voices || []) {
                const option = document.createElement('option');option.value = voice.voiceURI;option.textContent = `${voice.name} · ${voice.lang}`;voices.append(option);
            }
            if (!voices.childElementCount) { const option = document.createElement('option');option.textContent = 'No offline voice available';voices.append(option); }
            voices.dataset.signature = signature;
        }
        voices.disabled = !state.voices?.length;
        if (state.voiceURI) voices.value = state.voiceURI;
        const rate = state.rate ?? 1, volume = state.volume ?? 1;
        this.elements['inspection-narration-rate'].value = String(rate);
        this.elements['inspection-narration-rate-value'].value = `${rate}×`;
        this.elements['inspection-narration-volume'].value = String(volume);
        this.elements['inspection-narration-volume-value'].value = `${Math.round(volume*100)}%`;
        const transcript = this.elements['inspection-narration-text'], narrationText = state.text || '';
        const start = Math.max(0,Math.min(narrationText.length,state.boundaryIndex || 0));
        const end = Math.min(narrationText.length,start + Math.max(0,state.boundaryLength || 0));
        transcript.replaceChildren();
        if ((playing || paused) && end > start) {
            const highlight = document.createElement('mark');highlight.textContent = narrationText.slice(start,end);
            transcript.append(document.createTextNode(narrationText.slice(0,start)),highlight,document.createTextNode(narrationText.slice(end)));
        } else transcript.textContent = narrationText || 'A reviewed narration has not been supplied for this record.';
    }

    handleKey(event) {
        if (!this.isOpen) return;
        // Keep document-level map shortcuts outside the modal. Native input,
        // select and button defaults still work; canvas keys route to its adapter.
        event.stopImmediatePropagation();
        if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();this.close();return; }
        if (event.key !== 'Tab') { this.activeTrial?.handleKey(event);return; }
        const items = focusable(this.element), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault();this.element.focus();return; }
        const outside = !this.element.contains(document.activeElement);
        if (event.shiftKey && (outside || document.activeElement === first || document.activeElement === this.element)) { event.preventDefault();last.focus(); }
        else if (!event.shiftKey && (outside || document.activeElement === last)) { event.preventDefault();first.focus(); }
    }

    snapshot() {
        return {isOpen:this.isOpen,status:this.status,objectId:this.isOpen ? this.body?.id : null,visualKind:this.isOpen ? this.visualKind : null,
            mode:this.activeTrial?.mode || null,detailsVisible:this.isOpen && !this.elements?.['inspection-pane']?.hidden,reducedMotion:this.motionPreference.matches,hidden:document.hidden,error:this.error,
            visual:this.activeTrial?.snapshot() || null,narration:this.narration?.snapshot() || null};
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.status = 'closed';
        this.generation++;
        this.narration?.stop();
        this.unsubscribeNarration?.();this.unsubscribeNarration = null;
        this.abort.abort();
        this.activeTrial?.close({fromHost:true});this.activeTrial = null;
        this.element.remove();this.element = this.elements = null;
        this.inertElements.forEach(([element,previous]) => { element.inert = previous; });this.inertElements = [];
        document.body.style.overflow = this.previousOverflow;
        this.onClose(this.body);
        const previous = this.returnFocus?.isConnected ? this.returnFocus : document.getElementById(this.returnFocusId || '');
        previous?.focus({preventScroll:true});
        this.returnFocus = null;
    }

    dispose() {
        this.close();this.moonTrial.dispose();this.sunTrial.dispose();this.earthTrial.dispose();this.disposed = true;
    }
}
