# Bundled interface assets

The main application has no CDN, hosted stylesheet, or hosted font dependency. `index.html` loads local `ui-utilities.css`, `style.css`, and GSAP; `style.css` loads local font files. Existing Three.js files were already local.

GSAP remains version **3.12.5**, matching the former CDN version. Its unmodified distribution came from the [official 3.12.5 tag](https://github.com/greensock/GSAP/tree/3.12.5). The file retains its copyright/license header; `gsap/UPSTREAM-README.md` preserves the upstream distribution and licensing notice. The referenced license is the [GSAP standard license](https://gsap.com/standard-license).

Inter and Press Start 2P were downloaded from the [Google Fonts repository](https://github.com/google/fonts) on 2026-10-31. Their complete SIL Open Font License texts are alongside the font files. The font bytes and source URLs are recorded in `offline-assets.json`.

`ui-utilities.css` is a small application-maintained stylesheet covering the actual utility classes in the interface and generated spectral legend. It replaces the runtime Tailwind CDN compiler without adding a build or network dependency. When adding interface classes, maintain these local rules as well.

The Moon inspector uses GLTFLoader and BufferGeometryUtils from the official Three.js **r164** tag, matching the app's renderer. Their bare Three.js imports are rewritten to the local vendored module. `three/LICENSE` preserves the upstream MIT license, and `offline-assets.json` records the shipped bytes and sources. The Moon model embeds its images and buffers; no online decoder is required.

Run `node tests/offline-assets.cjs` for static asset, hash, font signature and actual GSAP interpolation checks. This is not proof of an offline application launch; the packaged Electron checks provide that separate evidence.
