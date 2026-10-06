/**
 * PRABAL HOUSING
 * Procedural hero clouds.
 *
 * Renders soft, lit cumulus textures once (in a Web Worker when available),
 * then hands them to CSS as horizontally-tileable backgrounds that drift on
 * the compositor. Each layer gets a day and a night variant so the theme
 * toggle is a cheap opacity crossfade.
 */

(function () {
    'use strict';

    // Layer recipes. Coordinates are normalised to the texture (0..1).
    // period = number of noise cells across the width (must be even so the
    // half-scale cluster noise tiles too).
    const LAYERS = {
        // Thin, fast wisps along the top edge.
        high: {
            w: 1024, h: 320, period: 6, octaves: 7, stretch: 2.6,
            coverage: 0.45, softness: 0.22, warp: 0.25, cluster: 0.35, erosion: 0.35,
            top: [0.0, 0.3], base: [0.55, 0.95],
            absorb: 1.2, opacity: 0.6, nightOpacity: 0.4,
            day: { lit: [255, 255, 255], shade: [186, 200, 222] },
            night: { lit: [118, 134, 168], shade: [22, 30, 52] },
            seed: 11
        },
        // The hero cumulus.
        mid: {
            w: 1024, h: 512, period: 4, octaves: 8, stretch: 1.3,
            coverage: 0.38, softness: 0.2, warp: 0.18, cluster: 0.5, erosion: 0.32,
            top: [0.05, 0.42], base: [0.62, 0.8],
            absorb: 2.6, opacity: 1, nightOpacity: 0.55,
            day: { lit: [255, 255, 255], shade: [150, 166, 192] },
            night: { lit: [132, 148, 182], shade: [16, 22, 40] },
            seed: 23
        },
        // Small hazy clouds near the horizon.
        far: {
            w: 1024, h: 256, period: 10, octaves: 7, stretch: 1.8,
            coverage: 0.4, softness: 0.2, warp: 0.15, cluster: 0.35, erosion: 0.3,
            top: [0.2, 0.6], base: [0.72, 0.9],
            absorb: 1.8, opacity: 0.85, nightOpacity: 0.4,
            haze: 0.4,
            day: { lit: [252, 252, 252], shade: [176, 190, 208], haze: [214, 222, 230] },
            night: { lit: [96, 110, 140], shade: [18, 24, 42], haze: [20, 28, 48] },
            seed: 37
        },
        // Foreground bank: puffy top edge, melts into the page background at the bottom.
        bank: {
            w: 1024, h: 512, period: 6, octaves: 8, stretch: 1.6,
            coverage: 0.36, softness: 0.2, warp: 0.2, cluster: 0.3, erosion: 0.3,
            ramp: [0.0, 0.45], solidFrom: 0.92,
            relief: 3, opacity: 1, nightOpacity: 1,
            day: { lit: [253, 252, 248], shade: [206, 207, 210], bg: [238, 236, 228] },
            night: { lit: [40, 49, 70], shade: [13, 18, 31], bg: [8, 12, 20] },
            seed: 53
        }
    };

    // ---- Renderer (self-contained so it can be stringified into a worker) ----
    function renderCloudLayer(s) {
        const W = s.w, H = s.h, P = s.period;

        let seed = s.seed >>> 0 || 1;
        const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        const perm = new Uint8Array(512);
        const base = new Uint8Array(256);
        for (let i = 0; i < 256; i++) base[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            const t = base[i]; base[i] = base[j]; base[j] = t;
        }
        for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

        const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
        const GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
        const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

        // Perlin noise that wraps every `period` cells on x (seamless tiling).
        function perlin(x, y, period) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const x0 = ((xi % period) + period) % period;
            const x1 = (x0 + 1) % period;
            const y0 = yi & 255, y1 = (yi + 1) & 255;
            const h00 = perm[perm[x0 & 255] + y0] & 7;
            const h10 = perm[perm[x1 & 255] + y0] & 7;
            const h01 = perm[perm[x0 & 255] + y1] & 7;
            const h11 = perm[perm[x1 & 255] + y1] & 7;
            const n00 = GX[h00] * xf + GY[h00] * yf;
            const n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
            const n01 = GX[h01] * xf + GY[h01] * (yf - 1);
            const n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
            const u = fade(xf), v = fade(yf);
            const a = n00 + u * (n10 - n00);
            const b = n01 + u * (n11 - n01);
            return a + v * (b - a);
        }

        function fbm(x, y, period, octaves) {
            let sum = 0, amp = 0.5, f = 1, norm = 0;
            for (let o = 0; o < octaves; o++) {
                sum += amp * perlin(x * f, y * f, period * f);
                norm += amp;
                amp *= 0.5;
                f *= 2;
            }
            return sum / norm;
        }

        const smooth = (a, b, x) => {
            const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
            return t * t * (3 - 2 * t);
        };

        // Billow noise: |perlin| folded upward gives the round, cauliflower
        // puffs cumulus edges are made of.
        function billow(x, y, period, octaves) {
            let sum = 0, amp = 0.5, f = 1, norm = 0;
            for (let o = 0; o < octaves; o++) {
                sum += amp * (1 - Math.abs(perlin(x * f, y * f, period * f)) * 1.6);
                norm += amp;
                amp *= 0.5;
                f *= 2;
            }
            return sum / norm;
        }

        // 1. Density field
        const D = new Float32Array(W * H);   // alpha / coverage
        const L = new Float32Array(W * H);   // deeper field used for lighting, keeps interior structure
        for (let py = 0; py < H; py++) {
            const yn = py / (H - 1);
            const v = (py / W) * P * s.stretch;

            const profile = s.ramp
                ? smooth(s.ramp[0], s.ramp[1], yn)
                : smooth(s.top[0], s.top[1], yn) * (1 - smooth(s.base[0], s.base[1], yn));

            for (let px = 0; px < W; px++) {
                const u = (px / W) * P;
                const wx = fbm(u + 3.7, v + 1.3, P, 2) * s.warp;
                const wy = fbm(u + 8.1, v + 5.9, P, 2) * s.warp;

                // Large silhouettes, then eroded by fine billows.
                const shape = fbm(u + wx, v + wy, P, 3) * 0.5 + 0.5
                    + fbm(u * 0.5 + 1.7, v * 0.5 + 9.2, P / 2, 2) * s.cluster;
                const detail = billow((u + wx) * 4 + 0.5, (v + wy) * 4 + 0.5, P * 4, s.octaves - 3);

                let d;
                if (s.ramp) {
                    const val = shape - 0.55 + profile * 0.95 - (1 - detail) * s.erosion;
                    d = smooth(s.coverage, s.coverage + s.softness, val);
                    L[py * W + px] = shape * 0.8 + detail * 0.2; // height field for relief shading
                    if (yn > s.solidFrom) d = Math.max(d, smooth(s.solidFrom, 1, yn));
                } else {
                    const val = shape * profile - (1 - detail) * s.erosion * (1 - profile * 0.4);
                    d = smooth(s.coverage, s.coverage + s.softness, val);
                    L[py * W + px] = smooth(s.coverage, s.coverage + s.softness * 2.5, val);
                }
                D[py * W + px] = d;
            }
        }

        // 2. Light it: march toward the sun (up and slightly left) for optical depth.
        const day = new Uint8ClampedArray(W * H * 4);
        const night = new Uint8ClampedArray(W * H * 4);
        const steps = 5;
        const stepY = Math.max(2, Math.round(H / 64));
        const stepX = Math.round(stepY * 0.6);

        const mix = (a, b, t) => a + (b - a) * t;

        for (let py = 0; py < H; py++) {
            const yn = py / (H - 1);
            for (let px = 0; px < W; px++) {
                const i = py * W + px;
                const d = D[i];
                const o = i * 4;
                if (d <= 0.001 && !(s.ramp && yn > 0.18)) continue;

                let shade;
                if (s.ramp) {
                    // Cloud sea seen from above: faces tilted toward the sun are lit.
                    const sy = Math.max(0, py - stepY * 4);
                    const sx = ((px - stepX * 4) % W + W) % W;
                    const relief = (L[i] - L[sy * W + sx]) * s.relief * (1 - smooth(0.35, 1, yn) * 0.75);
                    shade = Math.min(1, Math.max(0.3, 0.82 + relief + (1 - d) * 0.2));
                } else {
                    let tau = 0;
                    for (let k = 1; k <= steps; k++) {
                        const sy = py - k * stepY;
                        if (sy < 0) break;
                        const sx = ((px - k * stepX) % W + W) % W;
                        tau += L[sy * W + sx];
                    }
                    const lit = Math.exp(-tau * s.absorb / steps * 1.6);
                    // Thin edges glow a touch (silver lining); thick cores sink into shade.
                    shade = Math.min(1, 0.28 + 0.72 * lit + (1 - L[i]) * 0.2);
                }

                // Cumulus bases are darker.
                if (!s.ramp && s.base) shade *= 1 - smooth(s.base[0] - 0.2, s.base[1], yn) * 0.18;

                const write = (out, pal, opacity) => {
                    let r = mix(pal.shade[0], pal.lit[0], shade);
                    let g = mix(pal.shade[1], pal.lit[1], shade);
                    let b = mix(pal.shade[2], pal.lit[2], shade);
                    if (pal.haze) {
                        const hz = s.haze * (0.5 + 0.5 * yn);
                        r = mix(r, pal.haze[0], hz); g = mix(g, pal.haze[1], hz); b = mix(b, pal.haze[2], hz);
                    }
                    let a = Math.pow(d, s.ramp ? 0.6 : 0.85) * opacity;
                    // Below its puffy crest the bank is fully opaque, so nothing ghosts through.
                    if (s.ramp) a = Math.max(a, smooth(0.18, 0.42, yn) * opacity);
                    if (pal.bg) {
                        const t = smooth(0.3, 0.97, yn);
                        r = mix(r, pal.bg[0], t); g = mix(g, pal.bg[1], t); b = mix(b, pal.bg[2], t);
                    }
                    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a * 255;
                };
                write(day, s.day, s.opacity);
                write(night, s.night, s.nightOpacity);
            }
        }

        return { w: W, h: H, day, night };
    }


    // ---- Aurora renderer (self-contained, also stringified into the worker) ----
    // Curtains of light: a wavy band with a sharp lower hem, long vertical rays
    // rising from it, green at the base shading to teal and violet at the top.
    function renderAurora(s) {
        const W = s.w, H = s.h;
        let seed = s.seed >>> 0 || 1;
        const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        const lattice = new Float32Array(512);
        for (let i = 0; i < 512; i++) lattice[i] = rand() * 2 - 1;

        // Periodic 1D value noise (period = cells), smooth interpolation
        function noise1(x, cells) {
            const xi = Math.floor(x), f = x - xi;
            const a = lattice[((xi % cells) + cells) % cells];
            const b = lattice[(((xi + 1) % cells) + cells) % cells];
            const t = f * f * (3 - 2 * f);
            return a + (b - a) * t;
        }
        function fbm1(u, cells, oct) {
            let sum = 0, amp = 0.5, f = 1, norm = 0;
            for (let o = 0; o < oct; o++) {
                sum += amp * noise1(u * f + o * 17.3, cells * f);
                norm += amp; amp *= 0.5; f *= 2;
            }
            return sum / norm;
        }
        const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const mix = (a, b, t) => a + (b - a) * t;

        // Per-column properties
        const hem = new Float32Array(W), ray = new Float32Array(W), glow = new Float32Array(W);
        for (let x = 0; x < W; x++) {
            const u = x / W;
            // Sweeping arc + folds; sin terms keep it seamlessly tileable
            hem[x] = H * (s.base + s.wave * fbm1(u * s.cells, s.cells, 4)
                + s.arc * Math.sin(2 * Math.PI * (u + s.phase))
                + s.arc * 0.35 * Math.sin(6 * Math.PI * (u + s.phase * 2)));
            // Rays: broad, soft variation only (fine detail aliased into hard lines)
            const r1 = fbm1(u * s.rayCells, s.rayCells, 3) * 0.5 + 0.5;
            const r2 = fbm1(u * s.rayCells * 2 + 3.1, s.rayCells * 2, 2) * 0.5 + 0.5;
            ray[x] = Math.pow(r1 * 0.72 + r2 * 0.28, 1.9) * 1.9;
            glow[x] = smooth(0.15, 0.75, fbm1(u * s.patchCells + 7.7, s.patchCells, 3) * 0.5 + 0.5);
        }

        // 1. Intensity field. Above and below the hem use the same ray factor,
        //    so brightness is continuous across it (no hard edge line).
        const V = new Float32Array(W * H);
        const T = new Float32Array(W * H);
        const fold = H * s.fold, rise = H * s.rise, seam = fold * 0.7;
        for (let y = 0; y < H; y++) {
            const edgeFade = smooth(0, 0.18, y / H) * (1 - smooth(0.85, 1, y / H));
            for (let x = 0; x < W; x++) {
                const d = hem[x] - y; // >0 above the hem
                const curtain = 0.35 + 0.65 * ray[x];
                let v = d >= 0
                    ? Math.exp(-d / rise) * curtain
                    : Math.exp(-(d * d) / (fold * fold)) * curtain;
                // Soft glowing seam along the hem
                v += Math.exp(-(d * d) / (seam * seam)) * 0.45 * ray[x];
                const i = y * W + x;
                V[i] = v * glow[x] * edgeFade;
                T[i] = Math.min(1, Math.max(0, d / (H * 0.55)));
            }
        }

        // 2. Separable box blur (wraps horizontally so the texture still tiles).
        //    Baked in once here, so it costs nothing while animating.
        function blurH(src, r) {
            const dst = new Float32Array(src.length), n = 2 * r + 1;
            for (let y = 0; y < H; y++) {
                const row = y * W;
                let acc = 0;
                for (let k = -r; k <= r; k++) acc += src[row + ((k % W) + W) % W];
                for (let x = 0; x < W; x++) {
                    dst[row + x] = acc / n;
                    acc += src[row + (x + r + 1) % W] - src[row + ((x - r) % W + W) % W];
                }
            }
            return dst;
        }
        function blurV(src, r) {
            const dst = new Float32Array(src.length), n = 2 * r + 1;
            for (let x = 0; x < W; x++) {
                let acc = 0;
                for (let k = -r; k <= r; k++) acc += src[Math.min(H - 1, Math.max(0, k)) * W + x];
                for (let y = 0; y < H; y++) {
                    dst[y * W + x] = acc / n;
                    acc += src[Math.min(H - 1, y + r + 1) * W + x] - src[Math.max(0, y - r) * W + x];
                }
            }
            return dst;
        }
        const rx = Math.max(2, Math.round(W / 320)), ry = Math.max(1, Math.round(H / 160));
        let B = V;
        for (let pass = 0; pass < 3; pass++) B = blurV(blurH(B, rx), ry); // 3 box passes ≈ gaussian

        // 3. Colour: green at the hem → teal → violet higher up
        const out = new Uint8ClampedArray(W * H * 4);
        const c0 = s.colors[0], c1 = s.colors[1], c2 = s.colors[2];
        for (let i = 0; i < W * H; i++) {
            const v = B[i];
            if (v < 0.003) continue;
            const t = T[i];
            const k = t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55;
            const a0 = t < 0.45 ? c0 : c1, a1 = t < 0.45 ? c1 : c2;
            const ks = k * k * (3 - 2 * k);
            const o = i * 4;
            out[o] = mix(a0[0], a1[0], ks);
            out[o + 1] = mix(a0[1], a1[1], ks);
            out[o + 2] = mix(a0[2], a1[2], ks);
            // Slight gamma lift keeps faint edges silky instead of banded
            out[o + 3] = Math.pow(Math.min(1, v), 0.9) * 255 * s.opacity;
        }
        return { w: W, h: H, day: out, night: out.slice(0, 0) };
    }

    const AURORA = {
        a: { w: 1024, h: 384, seed: 91, cells: 2, wave: 0.12, base: 0.6, arc: 0.12, phase: 0.1,
             rayCells: 20, patchCells: 3, fold: 0.07, rise: 0.4, opacity: 1,
             colors: [[100, 255, 175], [60, 220, 215], [165, 105, 255]] },
        b: { w: 1024, h: 320, seed: 137, cells: 3, wave: 0.1, base: 0.58, arc: 0.1, phase: 0.55,
             rayCells: 22, patchCells: 4, fold: 0.06, rise: 0.3, opacity: 0.75,
             colors: [[120, 255, 205], [90, 175, 255], [220, 115, 235]] }
    };

    // ---- Plumbing -----------------------------------------------------------

    function toObjectURL(w, h, pixels) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL()), 'image/png');
        });
    }

    function makeWorker() {
        try {
            const src = `${renderCloudLayer.toString()}
                ${renderAurora.toString()}
                self.onmessage = e => {
                    const { name, spec, kind } = e.data;
                    const out = kind === 'aurora' ? renderAurora(spec) : renderCloudLayer(spec);
                    self.postMessage({ name, kind, ...out }, [out.day.buffer, out.night.buffer]);
                };`;
            const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
            return new Worker(url);
        } catch (err) {
            return null;
        }
    }

    function scaleSpec(spec, factor) {
        if (factor === 1) return spec;
        return Object.assign({}, spec, { w: Math.round(spec.w * factor), h: Math.round(spec.h * factor) });
    }

    async function applyLayer(el, result) {
        const [dayURL, nightURL] = await Promise.all([
            toObjectURL(result.w, result.h, result.day),
            toObjectURL(result.w, result.h, result.night)
        ]);
        el.innerHTML = '';
        [['day', dayURL], ['night', nightURL]].forEach(([variant, url]) => {
            const strip = document.createElement('div');
            strip.className = `cloud-strip cloud-strip--${variant}`;
            strip.style.backgroundImage = `url(${url})`;
            el.appendChild(strip);
        });
        requestAnimationFrame(() => el.classList.add('is-ready'));
    }

    function init() {
        const els = Array.from(document.querySelectorAll('[data-cloud]'));
        if (!els.length) return;

        // Smaller textures on phones; clouds are soft so upscaling is invisible.
        const factor = window.innerWidth < 768 ? 0.6 : 1;
        // Render the most visible layers first.
        const order = ['mid', 'bank', 'high', 'far'];
        els.sort((a, b) => order.indexOf(a.dataset.cloud) - order.indexOf(b.dataset.cloud));

        const worker = makeWorker();
        if (worker) {
            const byName = {};
            els.forEach(el => { byName[el.dataset.cloud] = el; });
            let pending = els.length;
            worker.onmessage = e => {
                const el = byName[e.data.name];
                if (el) applyLayer(el, e.data);
                if (--pending === 0) worker.terminate();
            };
            worker.onerror = () => {
                worker.terminate();
                renderOnMainThread(els, factor);
            };
            els.forEach(el => {
                const spec = LAYERS[el.dataset.cloud];
                if (spec) worker.postMessage({ name: el.dataset.cloud, spec: scaleSpec(spec, factor) });
                else pending--;
            });
        } else {
            renderOnMainThread(els, factor);
        }
    }

    function renderOnMainThread(els, factor) {
        // Yield between layers so the page stays responsive.
        let i = 0;
        const next = () => {
            if (i >= els.length) return;
            const el = els[i++];
            const spec = LAYERS[el.dataset.cloud];
            if (spec) applyLayer(el, renderCloudLayer(scaleSpec(spec, factor)));
            setTimeout(next, 16);
        };
        next();
    }

    // Aurora is rendered lazily — only once night mode is actually used.
    let auroraStarted = false;
    function ensureAurora() {
        if (auroraStarted) return;
        const els = Array.from(document.querySelectorAll('[data-aurora]'));
        if (!els.length) return;
        auroraStarted = true;
        // Prefer the live WebGL aurora; the pre-rendered texture is the fallback
        if (window.PrabalAurora && window.PrabalAurora.start()) return;
        const factor = window.innerWidth < 768 ? 0.75 : 1;

        const apply = (el, res) => toObjectURL(res.w, res.h, res.day).then(url => {
            el.innerHTML = '';
            const strip = document.createElement('div');
            strip.className = 'aurora-strip';
            strip.style.backgroundImage = `url(${url})`;
            el.appendChild(strip);
            requestAnimationFrame(() => el.classList.add('is-ready'));
        });

        const worker = makeWorker();
        if (worker) {
            const byName = {};
            els.forEach(el => { byName[el.dataset.aurora] = el; });
            let pending = els.length;
            worker.onmessage = e => {
                if (byName[e.data.name]) apply(byName[e.data.name], e.data);
                if (--pending === 0) worker.terminate();
            };
            els.forEach(el => worker.postMessage({ kind: 'aurora', name: el.dataset.aurora, spec: scaleSpec(AURORA[el.dataset.aurora], factor) }));
        } else {
            els.forEach(el => apply(el, renderAurora(scaleSpec(AURORA[el.dataset.aurora], factor))));
        }
    }

    window.PrabalSky = { ensureAurora };
    if (document.body && document.body.classList.contains('night-mode')) ensureAurora();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
