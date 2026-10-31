// Runs inside the real packaged executable only when --verify-offline is given.
// The normal application entrypoint creates its real window, renderer and data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

exports.attach = function attach(app, session, outputDirectory) {
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const stem = path.join(output, `offline-${runId}`);
  const evidence = {
    runId,
    scope: 'Actual packaged executable startup, bundled assets, bounded default markers and camera animation with network unavailable',
    isPackaged: app.isPackaged,
    executable: process.execPath,
    resources: process.resourcesPath,
    appPath: app.getAppPath(),
    versions: process.versions,
    networkMode: 'Electron offline network emulation plus HTTP/HTTPS/WS/WSS request cancellation',
    networkLimit: 'Application session only; the host network adapter remains connected. navigator.onLine is recorded but is not a reliable signal of session emulation.',
    messages: [],
    requests: [],
    checks: {},
    status: 'running'
  };
  let finished = false;
  let testing = false;
  let probing = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let timeout;
  const finish = error => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    evidence.status = error ? 'failed' : 'passed';
    if (error) evidence.error = error.stack || String(error);
    fs.writeFileSync(`${stem}.json`, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ status: evidence.status, evidence: `${stem}.json`, screenshot: evidence.screenshot, error: evidence.error }));
    app.exit(error ? 1 : 0);
  };
  timeout = setTimeout(() => finish(new Error('Packaged offline application did not initialize within 60 seconds')), 60000);

  // Electron uses only the most recently registered callback. This harness owns
  // the deny-and-record callback in verification mode; normal --offline has its
  // own callback in main.js. Neither changes machine-wide network settings.
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    evidence.requests.push({ url: details.url, resourceType: details.resourceType, intentionalProbe: probing, cancelled: true });
    callback({ cancel: true });
  });
  process.on('uncaughtException', finish);
  process.on('unhandledRejection', finish);

  try {
    assert.equal(app.isPackaged, true, 'Run the built executable, not development Electron');
    // Resolve and load the actual shipped dependency tree, even though offline
    // mode correctly skips the network update check.
    const updater = require('electron-updater');
    assert.equal(typeof updater.autoUpdater.checkForUpdatesAndNotify, 'function');
    evidence.checks.updater = {
      loaded: true,
      path: require.resolve('electron-updater'),
      version: require('electron-updater/package.json').version
    };
  } catch (error) {
    finish(error);
    return;
  }

  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('console-message', (_event, level, message, line, source) => {
      evidence.messages.push({ level, message, line, source, intentionalProbe: probing });
      if (message === '3D Star Map Explorer initialized successfully' && !testing) {
        testing = true;
        verifyWindow(win).catch(finish);
      }
    });
    win.webContents.on('render-process-gone', (_event, details) => finish(new Error(`Renderer exited: ${JSON.stringify(details)}`)));
    win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) finish(new Error(`Main document failed to load: ${code} ${description} ${url}`));
    });
  });

  async function verifyWindow(win) {
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await delay(1800);
    evidence.checks.renderer = await win.webContents.executeJavaScript(`(() => {
      const r = window.starRenderer;
      const uniforms = r?.starsMesh?.material?.uniforms;
      return {
        title: document.title, url: location.href, online: navigator.onLine,
        fullCatalogCount: r?.fullStarData?.length,
        geometryCount: r?.starsMesh?.geometry?.attributes?.position?.count,
        attributes: Object.fromEntries(['position', 'color', 'size', 'starParams'].map(name => {
          const attribute = r?.starsMesh?.geometry?.getAttribute(name);
          return [name, {present: !!attribute, count: attribute?.count, finite: attribute ? attribute.array.every(Number.isFinite) : false}];
        })),
        webgl: !!r?.renderer?.getContext(), frameCount: r?.renderer?.info?.render?.frame,
        canvasWidth: r?.canvas?.width, canvasHeight: r?.canvas?.height,
        loadingHidden: getComputedStyle(document.getElementById('loading-indicator')).display === 'none',
        errorNotification: document.querySelector('.app-notification.error')?.textContent || null,
        searchInput: !!document.getElementById('search-input'),
        hasSol: r?.fullStarData?.some(s => s.name === 'Sol'),
        gsapVersion: window.gsap?.version,
        fontsStatus: document.fonts.status,
        fontFaces: [...document.fonts].map(font => ({family:font.family, status:font.status, weight:font.weight})),
        bodyFont: getComputedStyle(document.body).fontFamily,
        titleFont: getComputedStyle(document.querySelector('h1')).fontFamily,
        styleSheets: [...document.styleSheets].map(s => s.href),
        remoteResources: performance.getEntriesByType('resource').filter(e => /^(https?|wss?):/.test(e.name)).map(e => e.name),
        scripts: [...document.scripts].map(s => s.src).filter(Boolean),
        hiddenUtilityWorks: getComputedStyle(document.getElementById('route-buttons-container')).display === 'none',
        minPointSize: uniforms?.minPointSize?.value,
        maxPointSize: uniforms?.maxPointSize?.value,
        pixelRatio: uniforms?.pixelRatio?.value,
        starComposerOffscreen: r?.starComposer?.renderToScreen === false,
        blendTextureID: r?.blendPass?.textureID
      };
    })()`);
    const r = evidence.checks.renderer;
    // navigator.onLine reflects the host adapter on this Electron version even
    // when session network emulation is offline. Keep the raw value; failed
    // Chromium session requests below provide the actual network evidence.
    assert.equal(r.fullCatalogCount, 117735);
    assert.ok(r.geometryCount > 0);
    for (const [name, attribute] of Object.entries(r.attributes)) {
      assert.equal(attribute.present, true, `${name} attribute must exist`);
      assert.equal(attribute.count, r.geometryCount, `${name} attribute must cover every displayed star`);
      assert.equal(attribute.finite, true, `${name} attribute must contain only finite values`);
    }
    assert.equal(r.webgl, true);
    assert.ok(r.frameCount > 0);
    assert.equal(r.loadingHidden, true);
    assert.equal(r.errorNotification, null);
    assert.equal(r.searchInput, true);
    assert.equal(r.hasSol, true);
    assert.equal(r.gsapVersion, '3.12.5');
    assert.equal(r.fontsStatus, 'loaded');
    for (const family of ['Inter', 'Press Start 2P']) {
      assert.ok(r.fontFaces.some(font => font.family.replace(/^['\"]|['\"]$/g, '') === family && font.status === 'loaded'), `Bundled ${family} FontFace must actually load`);
    }
    assert.ok(r.styleSheets.length >= 1);
    assert.ok(r.styleSheets.filter(Boolean).every(url => url.startsWith('file:')));
    assert.ok(r.scripts.every(url => url.startsWith('file:')));
    assert.deepEqual(r.remoteResources, []);
    assert.equal(r.hiddenUtilityWorks, true, 'Bundled utility CSS must preserve hidden state');
    assert.equal(r.minPointSize, 2);
    assert.equal(r.maxPointSize, 10);
    assert.ok(r.pixelRatio > 0 && r.pixelRatio <= 2);
    assert.equal(r.starComposerOffscreen, true);
    assert.equal(r.blendTextureID, 'tBase');
    assert.deepEqual(evidence.requests, [], 'Startup must not require any remote assets');
    assert.deepEqual(evidence.messages.filter(m => m.level >= 3), [], 'Renderer must have no startup errors');

    // Drive the real selector's change listener -> UIManager custom event ->
    // script.js preset handler. Wait for render frames to update both materials.
    evidence.checks.visualModes = await win.webContents.executeJavaScript(`(async () => {
      const r = window.starRenderer;
      const selector = document.getElementById('visual-preset');
      const before = r.starsMesh.geometry.getAttribute('position').array.slice();
      const records = [];
      for (const mode of ['scientific', 'cinematic']) {
        selector.value = mode;
        selector.dispatchEvent(new Event('change', {bubbles:true}));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const positions = r.starsMesh.geometry.getAttribute('position').array;
        records.push({
          selected: selector.value, visualMode: r.visualMode,
          bloomEnabled: r.starBloomPass.enabled,
          bloomToggleChecked: document.getElementById('bloom-toggle').checked,
          animationStrength: r.starsMesh.material.uniforms.animationStrength.value,
          bloomAnimationStrength: r.starsBloomMesh.material.uniforms.animationStrength.value,
          minPointSize: r.starsMesh.material.uniforms.minPointSize.value,
          maxPointSize: r.starsMesh.material.uniforms.maxPointSize.value,
          coordinatesUnchanged: positions.length === before.length && positions.every((value, i) => value === before[i])
        });
      }
      return records;
    })()`);
    for (const mode of evidence.checks.visualModes) {
      const cinematic = mode.selected === 'cinematic';
      assert.equal(mode.visualMode, mode.selected);
      assert.equal(mode.bloomEnabled, cinematic);
      assert.equal(mode.bloomToggleChecked, cinematic);
      assert.equal(mode.animationStrength, cinematic ? 1 : 0);
      assert.equal(mode.bloomAnimationStrength, cinematic ? 1 : 0);
      assert.equal(mode.minPointSize, 2);
      assert.equal(mode.maxPointSize, 10);
      assert.equal(mode.coordinatesUnchanged, true);
    }
    assert.deepEqual(evidence.checks.visualModes.map(mode => mode.selected), ['scientific', 'cinematic']);
    assert.deepEqual(evidence.messages.filter(m => m.level >= 3), [], 'Visual mode switching must not produce renderer errors');

    const screenshot = await win.webContents.capturePage();
    evidence.screenshot = `${stem}.png`;
    fs.writeFileSync(evidence.screenshot, screenshot.toPNG());
    // A broad image-level regression guard catches viewport-sized bright disks
    // in the real default catalog view. The focused GPU fixture separately
    // checks exact point diameter. Exclude the overlay/title/status from this
    // measurement so UI text cannot determine the result.
    const size = screenshot.getSize();
    const pixels = screenshot.toBitmap();
    let sampled = 0;
    let bright = 0;
    const startX = Math.min(400, Math.floor(size.width / 2));
    for (let y = 90; y < size.height - 35; y++) {
      for (let x = startX; x < size.width - 20; x++) {
        const i = (y * size.width + x) * 4;
        if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 > 100) bright++;
        sampled++;
      }
    }
    evidence.checks.defaultView = { width: size.width, height: size.height, sampledPixels: sampled, brightPixels: bright, brightFraction: bright / sampled };
    assert.ok(sampled > 10000);
    assert.ok(bright > 10, 'The rendered field must contain visible star pixels');
    assert.ok(bright / sampled < 0.2, 'Oversized bright markers must not obscure the default field');

    // Exercise the real production camera animation with the bundled GSAP,
    // then verify it finishes and restores normal controls while offline.
    evidence.checks.cameraAnimation = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const r = window.starRenderer;
      const before = r.camera.position.clone();
      const destination = before.clone().addScaledVector(r.camera.up, 2);
      const timer = setTimeout(() => reject(new Error('Camera animation timed out')), 6000);
      r.animateCameraTo(r.controls.target.clone(), destination, () => {
        clearTimeout(timer);
        resolve({distanceMoved: r.camera.position.distanceTo(before), destinationError: r.camera.position.distanceTo(destination), controlsEnabled: r.activeControls.enabled});
      });
    })`);
    assert.ok(evidence.checks.cameraAnimation.distanceMoved > 1);
    assert.ok(evidence.checks.cameraAnimation.destinationError < 0.01);
    assert.equal(evidence.checks.cameraAnimation.controlsEnabled, true);
    assert.equal(evidence.requests.length, 0, 'Offline camera interaction must not fetch remote assets');

    probing = true;
    evidence.checks.networkProbe = await win.webContents.executeJavaScript(`(async () => {
      try { await fetch('https://example.com/galaxy-map-offline-probe', {cache: 'no-store'}); return {blocked:false}; }
      catch (error) { return {blocked:true, error:String(error)}; }
    })()`);
    assert.equal(evidence.checks.networkProbe.blocked, true, 'Deliberate network request must fail');
    // Session.fetch uses Chromium networking without a document's CSP or CORS,
    // so its rejection confirms the network guard independently of page policy.
    try {
      await session.fetch('https://example.com/galaxy-map-offline-session-probe', { cache: 'no-store' });
      evidence.checks.sessionNetworkProbe = { blocked: false };
    } catch (error) {
      evidence.checks.sessionNetworkProbe = { blocked: true, error: String(error) };
    }
    assert.equal(evidence.checks.sessionNetworkProbe.blocked, true, 'Chromium session network request must fail outside page CSP/CORS');
    evidence.checks.sessionNetworkProbe.cancellationObserved = evidence.requests.some(request => request.url === 'https://example.com/galaxy-map-offline-session-probe' && request.intentionalProbe && request.cancelled);
    assert.equal(evidence.checks.sessionNetworkProbe.cancellationObserved, true, 'Network cancellation callback must observe the session probe');
    evidence.checks.startupRemoteRequests = evidence.requests.filter(request => !request.intentionalProbe).length;
    evidence.updatePolicy = 'main.js enters this harness in its explicit offline branch, which skips network update checks; the shipped updater module was loaded and checked above';
    finish();
  }
};
