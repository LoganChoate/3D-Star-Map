// Production controller checks with an injected speech adapter. These prove
// state/cancellation behavior, not audible output, voice quality or offline audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const cases = [];
const local = {voiceURI:'local-en', name:'Local English', lang:'en-US', localService:true, default:true};
const second = {voiceURI:'local-en-2', name:'Second local English', lang:'en-GB', localService:true};
const remote = {voiceURI:'remote-en', name:'Remote English', lang:'en-US', localService:false, default:true};
class FakeUtterance { constructor(text) { this.text = text; } }
class FakeSynth {
    constructor(voices = [remote, local]) {
        this.voices = voices; this.listeners = new Set(); this.spoken = [];
        this.cancelCalls = 0; this.pauseCalls = 0; this.resumeCalls = 0;
        this.active = null; this.synchronousCancelEvent = false;
    }
    getVoices() { if (this.failVoices) throw new Error('Voice service unavailable'); return this.voices; }
    addEventListener(name, fn) { assert.equal(name, 'voiceschanged'); this.listeners.add(fn); }
    removeEventListener(name, fn) { assert.equal(name, 'voiceschanged'); this.listeners.delete(fn); }
    voicesChanged(voices) { this.voices = voices; [...this.listeners].forEach(fn => fn()); }
    cancel() {
        this.cancelCalls++;
        if (this.failCancel) throw new Error('Cannot cancel');
        const old = this.active; this.active = null;
        if (this.synchronousCancelEvent) old?.onerror?.({error:'canceled'});
    }
    speak(utterance) {
        if (this.failSpeak) throw new Error('Cannot speak');
        assert.equal(this.active, null, 'Previous utterance must be cancelled before speak');
        this.active = utterance; this.spoken.push(utterance);
    }
    pause() { this.pauseCalls++; if (this.failPause) throw new Error('Cannot pause'); }
    resume() { this.resumeCalls++; if (this.failResume) throw new Error('Cannot resume'); }
}

async function main() {
    const {NarrationController} = await import(pathToFileURL(path.join(root, 'modules/NarrationController.js')).href);
    const {TourController} = await import(pathToFileURL(path.join(root, 'modules/TourController.js')).href);
    const {UIManager} = await import(pathToFileURL(path.join(root, 'modules/UIManager.js')).href);
    const make = voices => {
        const synth = new FakeSynth(voices);
        const controller = new NarrationController({synth, Utterance:FakeUtterance});
        return {synth, controller};
    };
    const test = (name, fn) => {
        try { fn(); cases.push({name,status:'passed'}); }
        catch (error) { cases.push({name,status:'failed',error:error.stack}); }
    };
    test('Selection and late voice availability never start narration', () => {
        const {synth,controller:c} = make([]);
        c.setContent({id:'sol',text:'The Sun is a star.'});
        assert.equal(c.snapshot().status,'loading-voices');
        assert.equal(c.play(),false);
        assert.equal(synth.spoken.length,0);
        synth.voicesChanged([remote,local]);
        assert.equal(c.snapshot().status,'ready');
        assert.equal(synth.spoken.length,0);
        assert.equal(c.play(),true);
        assert.equal(synth.spoken.length,1);
        assert.equal(synth.spoken[0].voice,local);
        c.dispose();
    });
    test('Remote and unspecified voices cannot be selected or used as fallback', () => {
        const {synth,controller:c} = make([remote,{...local,voiceURI:'unspecified',localService:undefined},{...local,voiceURI:'truthy',localService:'true'}]);
        c.setContent({id:'hyg:1',text:'Source information.'});
        assert.equal(c.snapshot().status,'unavailable');
        assert.equal(c.play(),false);
        assert.throws(()=>c.setVoice(remote.voiceURI),RangeError);
        assert.deepEqual(c.getVoices(),[]);
        assert.equal(synth.spoken.length,0);
        c.dispose();
    });
    test('Start, pause, resume and Stop have distinct behavior and Stop does not restart', () => {
        const {synth,controller:c} = make();
        c.setContent({id:'sol',text:'The Sun is a star.'});
        c.play();
        const utterance=synth.active;
        assert.equal(c.snapshot().message,'Starting narration…');
        utterance.onstart();
        assert.equal(c.snapshot().started,true);
        assert.equal(c.pause(),true);
        assert.equal(c.snapshot().status,'paused');
        // A delayed start callback must not unpause the interface.
        utterance.onstart();
        assert.equal(c.snapshot().status,'paused');
        assert.equal(c.resume(),true);
        assert.equal(c.snapshot().status,'speaking');
        assert.equal(c.stop(),true);
        assert.equal(c.snapshot().status,'stopped');
        assert.equal(synth.spoken.length,1);
        assert.equal(synth.active,null);
        assert.equal(c.resume(),false);
        assert.equal(c.pause(),false);
        c.dispose();
    });
    test('Changing stable identity cancels old audio and rejects late callbacks', () => {
        const {synth,controller:c} = make();
        c.setContent({id:'hyg:100',text:'Duplicate name first record.'});
        c.play();
        const first=synth.active;
        c.setContent({id:'hyg:101',text:'Duplicate name second record.'});
        assert.equal(synth.active,null);
        c.play();
        const secondUtterance=synth.active;
        first.onstart(); first.onboundary({name:'word',charIndex:3,charLength:7});
        first.onend(); first.onerror({error:'interrupted'});
        assert.equal(c.snapshot().contentId,'hyg:101');
        assert.equal(c.snapshot().status,'speaking');
        assert.equal(c.snapshot().started,false);
        assert.equal(c.snapshot().boundaryIndex,null);
        secondUtterance.onstart();
        secondUtterance.onend();
        assert.equal(c.snapshot().status,'ended');
        c.dispose();
    });
    test('Repeated Play cancels its predecessor and synchronous cancel callbacks stay stale', () => {
        const {synth,controller:c} = make(); synth.synchronousCancelEvent=true;
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const first=synth.active;
        assert.equal(c.play(),true);
        assert.notEqual(synth.active,first);
        assert.equal(c.snapshot().status,'speaking');
        first.onend();
        assert.equal(c.snapshot().status,'speaking');
        assert.equal(c.snapshot().errorCode,null);
        c.dispose();
    });
    test('Identical content refresh does not interrupt playback; changed text does', () => {
        const {synth,controller:c} = make();
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const utterance=synth.active, cancellations=synth.cancelCalls;
        c.setContent({id:'sol',text:'  The Sun.  '});
        assert.equal(synth.active,utterance);
        assert.equal(synth.cancelCalls,cancellations);
        c.setContent({id:'sol',text:'Corrected source description.'});
        assert.equal(synth.active,null);
        assert.equal(c.snapshot().status,'ready');
        assert.equal(synth.spoken.length,1);
        c.dispose();
    });
    test('Boundary positions are bounded UTF-16 indices and ignore malformed events', () => {
        const {synth,controller:c} = make();
        c.setContent({id:'fixture',text:'Sun <script>never markup</script>.'}); c.play();
        const utterance=synth.active;
        utterance.onboundary({name:'word',charIndex:4});
        assert.equal(c.snapshot().boundaryIndex,4);
        assert.equal(c.snapshot().boundaryLength,13);
        for (const charIndex of [-1,NaN,Infinity,1.1,1000,'2']) utterance.onboundary({name:'word',charIndex});
        utterance.onboundary({name:'sentence',charIndex:0});
        assert.equal(c.snapshot().boundaryIndex,4);
        utterance.onboundary({name:'word',charIndex:4,charLength:1000});
        assert.equal(c.snapshot().boundaryLength,c.snapshot().text.length-4);
        c.pause(); utterance.onboundary({name:'word',charIndex:0,charLength:3});
        assert.equal(c.snapshot().boundaryIndex,4);
        c.stop(); assert.equal(c.snapshot().boundaryIndex,null);
        c.dispose();
    });
    test('Unavailable or failing speech APIs preserve the transcript', () => {
        const c = new NarrationController({synth:null,Utterance:undefined});
        c.setContent({id:'sol',text:'Readable transcript.'});
        assert.equal(c.snapshot().status,'unavailable');
        assert.equal(c.play(),false);
        assert.equal(c.snapshot().text,'Readable transcript.');
        c.dispose();
        const {synth,controller:d}=make(); synth.failVoices=true;
        d.setContent({id:'sol',text:'Readable transcript.'});
        assert.equal(d.play(),false);
        assert.equal(d.snapshot().status,'unavailable');
        assert.equal(synth.spoken.length,0);
        d.dispose();
    });
    test('Empty content cannot start speech and bad inputs do not alter active content', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'empty',text:'   '});
        assert.equal(c.play(),false);
        assert.equal(c.snapshot().status,'idle');
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const active=synth.active;
        for (const input of [{id:'',text:'A'},{id:123,text:'A'},{id:'moon',text:null},undefined]) assert.throws(()=>c.setContent(input),TypeError);
        assert.equal(synth.active,active);
        assert.equal(c.snapshot().contentId,'sol');
        c.dispose();
    });
    test('Validated settings apply to the next manual playback, with no implicit audio', () => {
        const {synth,controller:c}=make([local,second]);
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        c.setRate(1.25);
        assert.equal(c.snapshot().status,'stopped');
        c.setVolume(0.4); c.setVoice(second.voiceURI);
        assert.equal(synth.spoken.length,1);
        for (const value of [NaN,Infinity,0,2.1,'1']) assert.throws(()=>c.setRate(value),RangeError);
        for (const value of [NaN,Infinity,-0.1,1.1,'1']) assert.throws(()=>c.setVolume(value),RangeError);
        assert.throws(()=>c.setVoice(remote.voiceURI),RangeError);
        c.play();
        assert.equal(synth.active.rate,1.25); assert.equal(synth.active.volume,0.4);
        assert.equal(synth.active.voice,second); assert.equal(synth.active.lang,'en-GB');
        c.setVolume(0); assert.equal(c.snapshot().volume,0);
        assert.equal(c.snapshot().status,'stopped');
        c.dispose();
    });
    test('Voice disappearance stops playback and never switches to a remote voice', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const old=synth.active;
        synth.voicesChanged([remote]);
        assert.equal(c.snapshot().status,'unavailable');
        assert.equal(synth.active,null);
        old.onend();
        assert.equal(c.snapshot().status,'unavailable');
        synth.voicesChanged([second]);
        assert.equal(c.snapshot().status,'ready');
        assert.equal(synth.spoken.length,1);
        c.dispose();
    });
    test('Unrelated voice-list changes do not interrupt the selected local voice', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const active=synth.active;
        synth.voicesChanged([second,local,remote]);
        assert.equal(synth.active,active);
        assert.equal(c.snapshot().voiceURI,local.voiceURI);
        const snapshot=c.snapshot(); snapshot.voices[0].voiceURI='mutated';
        assert.equal(c.getVoices()[0].voiceURI,second.voiceURI);
        c.dispose();
    });
    test('Speech errors clear highlighting and require manual retry', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const old=synth.active;
        old.onboundary({charIndex:0,charLength:3});
        old.onerror({error:'audio-busy'});
        assert.equal(c.snapshot().status,'error');
        assert.equal(c.snapshot().errorCode,'audio-busy');
        assert.equal(c.snapshot().boundaryIndex,null);
        old.onend(); assert.equal(c.snapshot().status,'error');
        assert.equal(synth.spoken.length,1);
        assert.equal(c.play(),true);
        c.dispose();
    });
    test('Synchronous adapter failures are visible and cannot enqueue overlapping speech', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'sol',text:'The Sun.'});
        synth.failSpeak=true;
        assert.equal(c.play(),false); assert.equal(c.snapshot().status,'error');
        synth.failSpeak=false; c.play(); synth.failCancel=true;
        assert.equal(c.play(),false);
        assert.equal(c.snapshot().errorCode,'cancel-failed');
        assert.equal(synth.spoken.length,1);
        synth.failCancel=false; c.stop(); c.play(); synth.failPause=true;
        assert.equal(c.pause(),false); assert.equal(c.snapshot().errorCode,'pause-failed');
        synth.failPause=false; c.play(); c.pause(); synth.failResume=true;
        assert.equal(c.resume(),false); assert.equal(c.snapshot().errorCode,'resume-failed');
        c.dispose();
    });
    test('Dispose cancels speech, removes listeners and rejects stale callbacks', () => {
        const {synth,controller:c}=make();
        const observed=[];
        const unsubscribe=c.subscribe(snapshot=>observed.push(snapshot.status));
        assert.equal(observed.length,1);
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        const utterance=synth.active;
        c.dispose();
        assert.equal(synth.active,null); assert.equal(synth.listeners.size,0);
        assert.equal(observed.at(-1),'disposed');
        const count=observed.length;
        utterance.onstart(); utterance.onboundary({charIndex:1}); utterance.onend();
        synth.voicesChanged([second]);
        assert.equal(observed.length,count);
        assert.equal(c.snapshot().status,'disposed');
        assert.throws(()=>c.play(),/disposed/);
        assert.throws(()=>c.setContent({id:'other',text:'Other'}),/disposed/);
        assert.equal(c.stop(),false);
        c.dispose(); unsubscribe();
    });
    test('Synchronous completion during pause and synchronous speech error cannot resurrect playback', () => {
        const {synth,controller:c}=make();
        c.setContent({id:'sol',text:'The Sun.'}); c.play();
        synth.pause=()=>synth.active.onend();
        assert.equal(c.pause(),false);
        assert.equal(c.snapshot().status,'ended');
        synth.speak=utterance=>utterance.onerror({error:'synthesis-failed'});
        assert.equal(c.play(),false);
        assert.equal(c.snapshot().status,'error');
        c.dispose();
    });
    const withTour = fn => {
        const previous = {window:global.window,gsap:global.gsap,CustomEvent:global.CustomEvent,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
        const timers=new Map(), events=[], flights=[]; let nextTimer=1;
        global.window={gsap:{killTweensOf(){}},dispatchEvent:event=>events.push(event)};
        global.gsap=global.window.gsap;
        global.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
        global.setTimeout=fn=>{const id=nextTimer++;timers.set(id,fn);return id;};
        global.clearTimeout=id=>timers.delete(id);
        const {synth,controller}=make();
        const renderer={camera:{position:{}},controls:{target:{}},activeControls:{enabled:true},
            frameObjectInView:(star,done)=>flights.push({star,done}),updateSelectionHighlight(){}};
        const tour=new TourController(renderer,{showError:message=>{throw Error(message);},showWarning(){}});
        tour.setData([{id:'hyg:1',name:'Example'}],{example:{description:'Legacy unverified essay must never be spoken.'}});
        tour.setNarration(controller,star=>({narrationText:`Verified catalog summary for ${star.id}.`}));
        try { fn({tour,synth,controller,timers,events,flights}); }
        finally {
            tour.dispose();controller.dispose();
            for(const [key,value]of Object.entries(previous)){if(value===undefined)delete global[key];else global[key]=value;}
        }
    };
    test('Production tour ignores stopped/replaced flights and uses the shared verified transcript', () => withTour(({tour,synth,controller,timers,events,flights}) => {
        tour.start(); const oldFlight=flights[0];
        tour.stop(); oldFlight.done();
        assert.equal(synth.spoken.length,0);
        assert.equal(events.filter(event=>event.type==='starSelection').length,0);
        tour.start(); oldFlight.done();
        assert.equal(synth.spoken.length,0);
        flights[1].done();
        assert.equal(synth.spoken.length,1);
        assert.equal(synth.spoken[0].text,'Verified catalog summary for hyg:1.');
        const utterance=synth.active;
        controller.stop();
        assert.equal(tour.getState().state,'paused');
        utterance.onend();
        assert.equal(timers.size,0);
    }));
    test('Production tour advancement belongs to the matching visit and leaves new owners alone', () => withTour(({tour,synth,controller,timers,flights}) => {
        tour.start(); flights[0].done();
        synth.active.onend();
        assert.equal(tour.getState().state,'waiting');
        assert.equal(timers.size,1);
        const staleAdvance=[...timers.values()][0];
        tour.selectNextTourStar();
        assert.equal(flights.length,2);
        staleAdvance();
        assert.equal(flights.length,2);
        flights[1].done();
        controller.setContent({id:'solar:moon',text:'Moon transcript.'});
        assert.equal(tour.getState().state,'paused');
        controller.play(); synth.active.onend();
        assert.equal(timers.size,0);
        assert.equal(flights.length,2);
    }));
    test('Production atlas inspection preserves map framing and respects route/tour selection', () => withTour(() => {
        let routeActive=false,tourActive=false;
        const frames=[],inspections=[];
        const renderer={frameObjectInView:star=>frames.push(star.id),updateSelectionHighlight(){}};
        const routes={isActive:()=>routeActive,routePlanner:{}};
        const ui=new UIManager(renderer,routes,{isActive:()=>tourActive},{});
        const first=Object.freeze({id:'hyg:1',name:'Duplicate'}),secondRecord=Object.freeze({id:'hyg:2',name:'Duplicate'});
        ui.lookup={byId:new Map([[first.id,first],[secondRecord.id,secondRecord]])};
        ui.activeStarIds=new Set([first.id,secondRecord.id]);
        ui.showSearchMessage=()=>{};ui.updateInfoPanel=()=>{};ui.updateUI=()=>{};
        ui.onInspectObject=star=>inspections.push(star.id);
        assert.equal(ui.selectStar(first,{inspect:true,focusCamera:true}),true);
        assert.deepEqual(inspections,['hyg:1']);assert.deepEqual(frames,[]);
        assert.equal(ui.searchById(secondRecord.id),true);
        assert.deepEqual(frames,['hyg:2']);assert.deepEqual(inspections,['hyg:1']);
        routeActive=true;ui.selectStar(first,{inspect:true});
        assert.equal(ui.inspectSelectedObject(),false);
        routeActive=false;tourActive=true;ui.selectStar(first,{inspect:true});
        assert.deepEqual(inspections,['hyg:1']);
        tourActive=false;assert.equal(ui.inspectSelectedObject(),true);
        assert.deepEqual(inspections,['hyg:1','hyg:1']);
        assert.equal(routes.routePlanner.currentSelection,first);
    }));
    test('Production atlas Narrate uses the dossier and its Stop action does not replay', () => withTour(({synth,controller}) => {
        let interruptions=0;
        const ui=new UIManager({},null,{interrupt:()=>interruptions++},{});
        ui.selectedStar={id:'hyg:2',name:'Example'};
        ui.narration=controller;
        ui.dossierFor=()=>({narrationText:'Verified catalog transcript.'});
        ui.originalNarrationText='Old unverified prose.';
        assert.equal(ui.handleNarration(),true);
        assert.equal(synth.active.text,'Verified catalog transcript.');
        assert.equal(interruptions,1);
        assert.equal(ui.handleNarration(),true);
        assert.equal(controller.snapshot().status,'stopped');
        assert.equal(synth.spoken.length,1);
        assert.equal(interruptions,1);
    }));
    const result={status:cases.every(c=>c.status==='passed')?'passed':'failed',cases,limits:['Injected adapter checks do not verify audible narration, installed local voice availability, voice quality or network-blocked playback.']};
    const output=path.join(root,'.runtime','narration-controller-results.json');
    fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(result,null,2));
    for(const item of cases)console.log(`${item.status.toUpperCase()}: ${item.name}`);
    console.log(JSON.stringify({status:result.status,cases:cases.length,evidence:output}));
    if(result.status!=='passed'){for(const item of cases.filter(c=>c.status==='failed'))console.error(item.error);process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
