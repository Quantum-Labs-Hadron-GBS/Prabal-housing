/**
 * PRABAL HOUSING
 * Live night-sky aurora (WebGL).
 *
 * Curtains of light drawn per frame by a small fragment shader: rays that
 * shimmer and travel, hems that fold and ripple, brightness pulses running
 * along the curtain. Kept light on purpose:
 *   - half-resolution canvas covering only the left ~62% of the hero
 *   - ~30 fps cap
 *   - runs only while night mode is on, the hero is visible and the tab is active
 *   - one still frame for prefers-reduced-motion
 * Returns false from start() when WebGL is unavailable so the caller can fall
 * back to the pre-rendered texture aurora in clouds.js.
 */

(function () {
    'use strict';

    // ---- TUNING -------------------------------------------------------------
    // BRIGHTNESS: 0 = invisible, 1 = full show-piece. 0.45 is "noticed on a second look".
    // SPEED:      1 = lively, 0.5 = calm drift.
    const BRIGHTNESS = 0.45;
    const SPEED = 0.55;
    // --------------------------------------------------------------------------

    const VERT = `
        attribute vec2 aPos;
        void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `;

    const FRAG = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif

        uniform vec2 uRes;
        uniform float uTime;
        uniform float uFadeStart;
        uniform float uBrightness;

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.03;
                a *= 0.5;
            }
            return v;
        }

        // One curtain of light. p.x is scaled by aspect, p.y is 0 (bottom) .. 1 (top).
        vec3 curtain(vec2 p, float t, float seed, float baseY, float rayF,
                     vec3 cLow, vec3 cHigh, float rise) {
            float x = p.x;

            // The hem folds and ripples: slow sway + mid folds + quick small ripples
            float hem = baseY
                + 0.11 * sin(x * 1.4 + t * 0.21 + seed)
                + 0.08 * (fbm(vec2(x * 1.1 + t * 0.07, seed)) - 0.5) * 2.0
                + 0.025 * sin(x * 6.0 - t * 0.9 + seed * 2.0);
            float d = p.y - hem; // > 0 above the hem

            // Rays lean with the folds of the curtain
            float sway = (fbm(vec2(x * 0.7 - t * 0.11, p.y * 0.5 + seed)) - 0.5) * 0.9;
            float rx = (x + sway) * rayF;

            // Vertical rays: fine in x, stretched in y, drifting + shimmering
            float r = noise(vec2(rx + t * 0.55, p.y * 0.9 - t * 0.35 + seed));
            r += 0.6 * noise(vec2(rx * 2.2 - t * 1.1, p.y * 1.6 + seed * 3.0));
            r = pow(r / 1.6, 2.6) * 3.2;

            // Bright surges that travel along the curtain
            float surge = 0.45 + 0.55 * smoothstep(-0.3, 1.0,
                sin(x * 2.4 - t * 1.25 + fbm(vec2(x * 0.8, t * 0.12)) * 5.0));

            float above = exp(-max(d, 0.0) / rise);
            float below = exp(-pow(min(d, 0.0) / 0.03, 2.0));
            float body = d > 0.0 ? above : below;
            float seam = exp(-pow(d / 0.022, 2.0));

            float I = (body * (0.18 + r) + seam * (0.18 + 0.45 * r)) * surge;

            // Green at the hem, teal through the body, violet at the ray tips
            float h = clamp(d / rise / 1.6, 0.0, 1.0);
            vec3 col = mix(cLow, cHigh, smoothstep(0.0, 0.7, h));
            col = mix(col, vec3(0.62, 0.34, 1.0), smoothstep(0.45, 1.0, h) * 0.75);
            return col * I;
        }

        void main() {
            vec2 frag = gl_FragCoord.xy;
            vec2 p = vec2(frag.x / uRes.y, frag.y / uRes.y);
            float t = uTime;

            // Softer, slightly desaturated greens/teals read as elegant, not neon
            vec3 col = curtain(p, t, 1.3, 0.50, 10.0,
                               vec3(0.30, 0.90, 0.62), vec3(0.24, 0.70, 0.80), 0.30);
            col += 0.55 * curtain(p + vec2(2.7, 0.0), t * 0.82, 4.7, 0.60, 15.0,
                               vec3(0.36, 0.88, 0.74), vec3(0.36, 0.52, 0.92), 0.24);

            // Fade out toward the right edge of the canvas and at the top/bottom
            float fx = frag.x / uRes.x;
            float fy = frag.y / uRes.y;
            col *= 1.0 - smoothstep(uFadeStart, 1.0, fx);
            // Clear of the headline below and the navbar above
            col *= smoothstep(0.12, 0.42, fy) * (1.0 - smoothstep(0.7, 0.95, fy));

            col = min(col * uBrightness, vec3(1.0));
            float a = max(col.r, max(col.g, col.b));
            gl_FragColor = vec4(col, a); // premultiplied
        }
    `;

    function compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('Aurora shader:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    let started = false;

    function start() {
        if (started) return true;
        const host = document.querySelector('.aurora');
        if (!host) return false;

        const canvas = document.createElement('canvas');
        canvas.className = 'aurora-gl';
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
        if (!gl) return false;

        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const uRes = gl.getUniformLocation(prog, 'uRes');
        const uTime = gl.getUniformLocation(prog, 'uTime');
        const uFadeStart = gl.getUniformLocation(prog, 'uFadeStart');
        const uBrightness = gl.getUniformLocation(prog, 'uBrightness');

        started = true;
        host.classList.add('aurora--gl');
        host.prepend(canvas);

        // Half resolution: aurora light is soft, and this quarters the pixel work
        const SCALE = 0.5;
        const resize = () => {
            const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
            const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
            gl.uniform2f(uRes, w, h);
            gl.uniform1f(uFadeStart, window.innerWidth <= 768 ? 0.5 : 0.62);
            gl.uniform1f(uBrightness, BRIGHTNESS * 1.33);
        };
        let redrawStill = () => {};
        if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); redrawStill(); }).observe(canvas);
        resize();

        // A still frame for reduced-motion users and anyone on Data Saver
        const conn = navigator.connection || {};
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData === true;

        // Weaker devices (few cores / little memory / slow network) get ~20 fps
        // instead of ~30. Aurora motion is slow, so the difference isn't visible.
        const lowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
            (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
            /(^|-)2g|3g/.test(conn.effectiveType || '');
        const FRAME_MS = lowEnd ? 50 : 33;
        const body = document.body;
        const t0 = performance.now() - 40000; // start mid-motion, not from a uniform state
        let raf = 0, last = 0;

        const draw = now => {
            // Keep time small so noise stays precise on mobile GPUs
            gl.uniform1f(uTime, ((now - t0) / 1000 * SPEED) % 3600);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };

        const shouldRun = () => body.classList.contains('night-mode') &&
            !body.classList.contains('hero-offscreen') && !document.hidden;

        const loop = now => {
            raf = 0;
            if (!shouldRun()) return;
            if (now - last >= FRAME_MS) {
                last = now;
                draw(now);
            }
            raf = requestAnimationFrame(loop);
        };

        redrawStill = () => { if (reduced && body.classList.contains('night-mode')) draw(performance.now()); };

        const kick = () => {
            if (reduced) {
                if (body.classList.contains('night-mode')) draw(performance.now());
                return;
            }
            if (!raf && shouldRun()) raf = requestAnimationFrame(loop);
        };

        new MutationObserver(kick).observe(body, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', kick);
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
        kick();
        return true;
    }

    window.PrabalAurora = { start };
})();
