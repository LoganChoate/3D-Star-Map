// AdditiveBlendShader for Three.js EffectComposer
// Based on https://github.com/mrdoob/three.js/blob/master/examples/jsm/shaders/AdditiveBlendShader.js

export const AdditiveBlendShader = {
    uniforms: {
        'tBase': { value: null },
        'tAdd': { value: null }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tBase;
        uniform sampler2D tAdd;
        varying vec2 vUv;
        void main() {
            vec4 base = texture2D(tBase, vUv);
            vec4 add = texture2D(tAdd, vUv);
            gl_FragColor = base + add;
            gl_FragColor.a = 1.0;
        }
    `
};
