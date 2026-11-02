// Diagnostic instrumentation only. Injected after the unchanged production app
// announces readiness; no catalog, shader or production render loop is replaced.
(() => {
  const { renderer: atlas, explorer, ui, routes } = window.galaxyMap;
  const initial = { position: atlas.camera.position.clone(), quaternion: atlas.camera.quaternion.clone(), target: atlas.controls.target.clone() };
  let currentSample = null;
  const nextRender = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rendered = () => new Promise((resolve,reject) => {
    const done = time => { clearTimeout(timeout); resolve(time); };
    const timeout = setTimeout(() => {
      const index=nextRender.indexOf(done);if(index>=0)nextRender.splice(index,1);
      reject(new Error(`No actual render call within 5 seconds: mode=${explorer.currentMode}, hidden=${document.hidden}, focused=${document.hasFocus()}`));
    },5000);
    nextRender.push(done);
  });
  const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  };
  const stats = values => ({ count: values.length, mean: values.reduce((a,b)=>a+b,0)/values.length, median: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: values.length ? Math.max(...values) : null });
  const wrap = (object, method, visible) => {
    const original = object[method];
    object[method] = function (...args) {
      if (!visible()) return original.apply(this, args);
      const start = performance.now();
      const result = original.apply(this, args);
      const end = performance.now();
      if (currentSample) {
        currentSample.starts.push(start);
        currentSample.submissionMs.push(end-start);
        if (document.hidden) currentSample.hiddenFrames++;
        if (!document.hasFocus()) currentSample.unfocusedFrames++;
      }
      nextRender.splice(0).forEach(resolve => resolve(end));
      return result;
    };
  };
  wrap(atlas, 'render', () => explorer.currentMode === 'atlas');
  wrap(explorer, 'render', () => explorer.currentMode !== 'atlas');

  function conditions() {
    const isAtlas = explorer.currentMode === 'atlas';
    const controller = isAtlas ? atlas : explorer;
    const canvas = controller.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const gl = controller.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      mode: explorer.currentMode, visualPreset: isAtlas ? atlas.visualMode : null,
      activeControls: isAtlas ? (atlas.activeControls === atlas.flyControls ? 'fly' : 'orbit') : 'orbit',
      fullCatalogCount: atlas.fullStarData.length,
      renderedPointCount: (isAtlas ? atlas.starsMesh : explorer.points).geometry.getAttribute('position').count,
      viewport: { width: innerWidth, height: innerHeight },
      canvasCSS: { width: rect.width, height: rect.height },
      drawingBuffer: { width: canvas.width, height: canvas.height },
      devicePixelRatio, rendererPixelRatio: controller.renderer.getPixelRatio(),
      documentHidden: document.hidden, documentFocused: document.hasFocus(),
      cameraPosition: controller.camera.position.toArray(), cameraQuaternion: controller.camera.quaternion.toArray(),
      cameraTarget: controller.controls.target.toArray(),
      webgl: { version: gl.getParameter(gl.VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
      jsHeap: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null,
      threeMemory: { ...controller.renderer.info.memory },
      scientificAudit: window.galaxyMap.catalogAudit
    };
  }

  async function prepare(scenario) {
    if (scenario.startsWith('atlas-')) {
      document.getElementById('ex-mode-atlas').click();
      const shouldFly = scenario.includes('-flight');
      if ((atlas.activeControls === atlas.flyControls) !== shouldFly) document.getElementById('toggle-fly-mode-button').click();
      const selector = document.getElementById('visual-preset');
      selector.value = scenario.includes('scientific') ? 'scientific' : 'cinematic';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      atlas.camera.position.copy(initial.position);
      atlas.camera.quaternion.copy(initial.quaternion);
      atlas.controls.target.copy(initial.target);
      atlas.camera.updateMatrixWorld(true);
      atlas.clock.getDelta();
      document.activeElement?.blur();
    } else {
      document.getElementById(`ex-mode-${scenario.split('-')[0]}`).click();
      document.querySelector('#ex-presets [data-preset="all"]').click();
      explorer.canvas.focus();
    }
    await rendered();
    return conditions();
  }

  async function sample(scenario, durationMs) {
    check(!currentSample, 'Only one rendering sample may run at a time');
    const before = conditions();
    const raw = { starts: [], submissionMs: [], hiddenFrames: 0, unfocusedFrames: 0 };
    currentSample = raw;
    await pause(durationMs);
    currentSample = null;
    const after = conditions();
    const intervals = raw.starts.slice(1).map((time, index) => time - raw.starts[index]);
    check(intervals.length >= 20, 'Insufficient actual rendering frames');
    check(raw.hiddenFrames === 0 && raw.unfocusedFrames === 0, 'Rendering sample lost foreground visibility or focus');
    const cameraDistance = Math.hypot(...after.cameraPosition.map((value,index)=>value-before.cameraPosition[index]));
    if (scenario.includes('-flight')) check(cameraDistance > 1, 'Native flight input must actually move the camera');
    const elapsed = raw.starts.at(-1)-raw.starts[0];
    return {
      scenario, before, after, requestedDurationMs: durationMs, observedFrameSpanMs: elapsed,
      frames: raw.starts.length, framesPerSecond: intervals.length * 1000 / elapsed,
      frameIntervalsMs: stats(intervals), frameSubmissionMs: stats(raw.submissionMs),
      intervalsOver33_333ms: intervals.filter(x=>x>1000/30).length,
      intervalsOver50ms: intervals.filter(x=>x>50).length,
      hiddenFrames: raw.hiddenFrames, unfocusedFrames: raw.unfocusedFrames, cameraDistance,
      raw: { frameStartOffsetsMs: raw.starts.map(x=>x-raw.starts[0]), frameIntervalsMs: intervals, frameSubmissionMs: raw.submissionMs }
    };
  }

  async function action(name, perform, validate) {
    console.log(`Phase 5 action start: ${name}`);
    const start = performance.now();
    const value = perform();
    const dispatchEnd = performance.now();
    await value;
    const settled = performance.now();
    await rendered();
    const renderedAt = await rendered();
    const result = validate ? validate() : null;
    console.log(`Phase 5 action complete: ${name}`);
    return { name, synchronousDispatchMs: dispatchEnd-start, settledMs: settled-start, nextTwoCompletedRenderCallsMs: renderedAt-start, result };
  }

  async function interactions() {
    await prepare('atlas-scientific-idle');
    const result = { search: [], filters: [], routes: [], modeChanges: [] };
    const search = document.getElementById('search-input');
    for (let repeat=0;repeat<7;repeat++) {
      for (const query of ['Sirius', 'si', 'cyg', 'zzzz-no-such-object']) {
        result.search.push(await action(`autocomplete:${query}`, () => {
          search.value = query;
          search.dispatchEvent(new Event('input', { bubbles:true }));
        }, () => {
          const matches = [...document.querySelectorAll('.suggestion-item')].map(element=>element.dataset.starId);
          if (query === 'Sirius') check(matches.length===1 && ui.lookup.byId.get(matches[0]).name==='Sirius', 'Exact search must retain identity');
          if (query === 'zzzz-no-such-object') check(matches.length===0, 'No-match search must remain empty');
          return { query, matches };
        }));
      }
    }
    ui.clearSearch();
    const named = document.getElementById('proper-name-filter');
    const initialCount = atlas.starsMesh.geometry.getAttribute('position').count;
    for (let repeat=0;repeat<5;repeat++) {
      for (const checked of [true,false]) result.filters.push(await action(checked?'proper-names-on':'proper-names-off', () => {
        named.checked=checked;named.dispatchEvent(new Event('change',{bubbles:true}));
      },()=>{
        const count = atlas.starsMesh.geometry.getAttribute('position').count;
        check(count === ui.activeStarData.length, 'Rendered filtering and picking identity must agree');
        check(checked ? count>0&&count<initialCount : count===initialCount, 'Filter must change and restore the actual geometry');
        return { count };
      }));
    }
    const from = atlas.fullStarData.find(star=>star.id==='sol');
    const to = atlas.fullStarData.find(star=>/proxima/i.test(star.name));
    check(from && to, 'Route benchmark needs real Sol and Proxima');
    for (let repeat=0;repeat<3;repeat++) {
      let route;
      result.routes.push(await action('worker:Sol-to-Proxima:2pc', async()=>{route=await routes.calculateRouteWithWorker(from,to,2);},()=>{
        check(route && !route.stranded && route.path.length===2, 'Worker route must connect real nearby endpoints');
        check(route.path[0]===from && route.path[1]===to, 'Worker result must retain canonical object identity');
        return { ids: route.path.map(star=>star.id), maxJumpPc: 2 };
      }));
    }
    for (let repeat=0;repeat<5;repeat++) {
      for (const mode of ['solar','nearby','atlas']) result.modeChanges.push(await action(`mode:${mode}`,()=>{
        document.getElementById(`ex-mode-${mode}`).click();
      },()=>{
        check(explorer.currentMode===mode,'Mode action must activate the requested real view');
        const count=(mode==='atlas'?atlas.starsMesh:explorer.points).geometry.getAttribute('position').count;
        check(count===(mode==='atlas'?ui.activeStarData.length:explorer.objects.length),'Mode geometry must match active identities');
        return {mode,count};
      }));
    }
    return result;
  }

  function restoreCamera(state) {
    const controller = explorer.currentMode==='atlas'?atlas:explorer;
    controller.camera.position.fromArray(state.cameraPosition);
    controller.camera.quaternion.fromArray(state.cameraQuaternion);
    controller.controls.target.fromArray(state.cameraTarget);
    controller.camera.updateMatrixWorld(true);
  }
  async function setProductionNearbyCollection(key) {
    const selector=document.getElementById('ex-nearby-collection');
    check(selector instanceof HTMLSelectElement, 'Production nearby collection selector must exist');
    check([...selector.options].some(option=>option.value===key), 'Requested collection must be an actual production option');
    const before={mode:explorer.currentMode,collection:explorer.nearbyCollection};
    const start=performance.now();
    selector.value=key;
    selector.dispatchEvent(new Event('change',{bubbles:true}));
    const dispatchMs=performance.now()-start;
    await rendered();
    const completed=await rendered();
    check(explorer.nearbyCollection===key && selector.value===key, 'Production change handler must select the requested nearby collection');
    return {key,before,after:{mode:explorer.currentMode,collection:explorer.nearbyCollection},synchronousDispatchMs:dispatchMs,nextTwoCompletedRenderCallsMs:completed-start};
  }
  window.__phase5Benchmark = { prepare, sample, conditions, interactions, rendered, restoreCamera, setProductionNearbyCollection };
})();
