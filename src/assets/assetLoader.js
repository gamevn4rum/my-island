/**
 * assetLoader.js
 *
 * Loads the AI-generated image asset pack from /assets/.
 *
 * For each manifest entry:
 *   1. Try to load /assets/<filename>.
 *   2. If that succeeds, run it through imageToAsset() to produce the
 *      canonical record.
 *   3. If it fails (image not yet generated), fall back to the procedural
 *      voxel builder so the editor still functions during dev.
 *
 * The eventual goal is for every entry to have a real image so the fallback
 * path is never taken at runtime.
 */

import {
    THEME_INDEX,
    getThemeManifest,
    NEUTRAL_MANIFEST,
} from './assetManifest.js';
import { imageToAsset, loadImageElement, loadImageBitmap } from './imageToAsset.js';
import { renderVoxels } from './voxelRenderer.js';

// Built assets, keyed by absolute id. Populated incrementally as themes are
// loaded (boot loads only the themes a save actually needs; the rest arrive
// lazily on first theme switch), so this map may be partial.
let _assets = null;

// Themes whose art has been fully brought in.
const _loadedThemes = new Set();

// In-flight lazy loads, keyed by a sorted theme-set signature, so two rapid
// requests for the same theme share one load instead of double-processing.
const _inflight = new Map();

// Dedup cache keyed by everything that affects a built record: the same source
// PNG processed with the same geometry yields identical canvases, so themes
// that share art (e.g. the Nordic stub reusing Aegean PNGs) reuse the work
// instead of re-fetching and re-rendering it. Maps signature → built asset.
const _fileCache = new Map();

/** A signature over every field that affects the processed canvases/shadow. */
function _entrySignature(entry) {
    return [
        entry.filename,
        entry.kind,
        entry.footprint?.w, entry.footprint?.d,
        entry.sizeScale ?? 1,
        entry.tileLike === true,
        entry.fitCell === true,
        entry.flatBase === true,
        entry.noShadow === true,
        entry.shadowStyle ?? 'cast',
    ].join('|');
}

/** Build one manifest entry into a draw-ready asset, or null if it can't. */
async function _processEntry(entry) {
    const meta = {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        kind: entry.kind,
        footprint: entry.footprint,
        tileLike: entry.tileLike === true,
        noShadow: entry.noShadow === true,
        flatBase: entry.flatBase === true,
        shadowStyle: entry.shadowStyle ?? 'cast',
    };

    let record = null;

    if (entry.filename) {
        try {
            // Decode off the main thread (createImageBitmap); falls back to an
            // HTMLImageElement where unsupported. Either is a drawImage source.
            const img = await loadImageBitmap(`assets/${entry.filename}`);
            record = imageToAsset(img, entry.footprint, entry.kind, {
                sizeScale: entry.sizeScale ?? 1,
                tileLike:  entry.tileLike === true,
                fitCell:   entry.fitCell === true,
                flatBase:  entry.flatBase === true,
            });
            record.source = 'image';
            // imageToAsset copies pixels into its own trimmed canvas, so the
            // source bitmap can be released immediately (frees GPU/CPU memory).
            img.close?.();
        } catch {
            /* fall through to procedural fallback */
        }
    }

    if (!record && entry.builder) {
        const voxels = entry.builder();
        record = renderVoxels(voxels, entry.footprint);
        record.source = 'procedural';
    }

    if (!record) return null;

    // Pre-render a draw-ready canvas at display resolution so the per-frame
    // `drawImage` no longer downsamples a multi-megabyte PNG every frame.
    record.displayCanvas = buildDisplayCanvas(record.canvas, record.width, record.height);

    const built = { ...meta, ...record };

    // Pre-render a silhouette shadow for objects that should cast a ground
    // shadow. Tile-like assets (terrain) and assets that bake their own shadow
    // into the PNG opt out via the manifest.
    if (entry.kind === 'object' && !meta.tileLike && !meta.noShadow && record.canvas) {
        const shadow = buildShadowCanvas(record.canvas, record.width, record.height);
        if (shadow) {
            built.shadowCanvas  = shadow.canvas;
            built.shadowPadding = shadow.padding;
            built.shadowWidth   = shadow.width;
            built.shadowHeight  = shadow.height;
            built.shadowBlurred = shadow.blurred;
        }
        if (meta.shadowStyle === 'contact') {
            built.contactPoints = buildContactPoints(record.canvas, record.width, record.height);
        }
    }

    return built;
}

export function isThemeLoaded(themeId) {
    return _loadedThemes.has(themeId);
}

/**
 * The not-yet-built manifest entries needed for the given themes. The shared
 * neutral set (terrain + nature) is theme-independent, so it's always included
 * — built once on the first call, then skipped (already in `_assets`) on lazy
 * theme loads. Entries already present are omitted.
 */
function collectEntries(themeIds) {
    const entries = [];
    for (const entry of NEUTRAL_MANIFEST) {
        if (!_assets[entry.id]) entries.push(entry);
    }
    for (const themeId of themeIds) {
        if (!THEME_INDEX[themeId] || _loadedThemes.has(themeId)) continue;
        for (const entry of getThemeManifest(themeId)) {
            if (!_assets[entry.id]) entries.push(entry);
        }
    }
    return entries;
}

/**
 * Build a list of manifest entries into `_assets`, time-slicing so the loading
 * bar can paint. `onProgress(fraction, name)` reports overall progress;
 * `onEach(id)` (optional) fires as each asset becomes available — used by the
 * background boot pass to stream new swatches into the palette.
 */
async function _processEntries(entries, onProgress = () => {}, onEach = null) {
    const total = entries.length;
    let imageCount = 0, fallbackCount = 0, reuseCount = 0;
    let lastYield = performance.now();

    for (let i = 0; i < total; i++) {
        const entry = entries[i];
        const sig = entry.filename ? _entrySignature(entry) : null;

        let built;
        if (sig && _fileCache.has(sig)) {
            // Same PNG + geometry already built for another theme — reuse the
            // canvases wholesale, only swapping in this entry's identity.
            const cached = _fileCache.get(sig);
            built = { ...cached, id: entry.id, name: entry.name, category: entry.category };
            reuseCount++;
        } else {
            built = await _processEntry(entry);
            if (built) {
                if (sig) _fileCache.set(sig, built);
                if (built.source === 'image') imageCount++;
                else if (built.source === 'procedural') fallbackCount++;
            }
        }

        if (built) _assets[entry.id] = built;

        onProgress((i + 1) / total, entry.name);
        if (built && onEach) onEach(entry.id);

        // Time-budget yield: let the loading bar paint without burning a whole
        // frame after every asset. Cache reuses cost almost nothing, so this
        // yields far less than the old every-2-assets rule.
        const now = performance.now();
        if (now - lastYield > 24) {
            await new Promise(r => requestAnimationFrame(r));
            lastYield = performance.now();
        }
    }

    return { imageCount, fallbackCount, reuseCount, total };
}

/**
 * Load the art for the given themes into the shared asset map. Entries already
 * present (or sharing a source PNG with an already-built entry) are reused, so
 * calling this repeatedly only ever does the outstanding work.
 */
export async function loadThemes(themeIds, onProgress = () => {}) {
    if (!_assets) _assets = {};
    const stats = await _processEntries(collectEntries(themeIds), onProgress);

    for (const themeId of themeIds) {
        if (THEME_INDEX[themeId]) _loadedThemes.add(themeId);
    }

    if (stats.total > 0) {
        const parts = [`${stats.imageCount} images`];
        if (stats.reuseCount)    parts.push(`${stats.reuseCount} reused`);
        if (stats.fallbackCount) parts.push(`${stats.fallbackCount} procedural`);
        console.info(`[assets] loaded ${themeIds.join(', ')} — ${parts.join(', ')}.`);
    }

    return _assets;
}

/**
 * Boot loader: build the CRITICAL assets first — the ids the opening scene (or
 * a restored save) will actually render — so the app can appear as soon as
 * those are ready, then finish the rest of the pack in the background. Only the
 * critical pass is awaited; the returned `restDone` promise resolves once the
 * remaining (palette-only) assets have streamed in.
 *
 *   await loadThemesForBoot(themes, criticalIds, { onProgress, onBackgroundAsset })
 *
 * `onProgress` drives the loading bar for the (short) critical pass;
 * `onBackgroundAsset(id)` fires per asset during the background pass.
 */
export async function loadThemesForBoot(themeIds, criticalIds, {
    onProgress = () => {}, onBackgroundAsset = null,
} = {}) {
    if (!_assets) _assets = {};
    const want = criticalIds instanceof Set ? criticalIds : new Set(criticalIds || []);

    const critical = [], rest = [];
    for (const entry of collectEntries(themeIds)) {
        (want.has(entry.id) ? critical : rest).push(entry);
    }

    // Blocking: only what the first frame needs. Reported on the loading bar.
    await _processEntries(critical, onProgress);

    // Non-blocking: everything else, after the app is shown. The themes aren't
    // marked "loaded" until this finishes, so a lazy re-request stays correct.
    const restDone = _processEntries(rest, () => {}, onBackgroundAsset)
        .then(() => {
            for (const themeId of themeIds) {
                if (THEME_INDEX[themeId]) _loadedThemes.add(themeId);
            }
            console.info(`[assets] boot: ${critical.length} critical + ${rest.length} background ready.`);
        });

    return { assets: _assets, restDone, criticalCount: critical.length, restCount: rest.length };
}

/**
 * Ensure the given themes are loaded, coalescing concurrent requests for the
 * same work. Resolves once their art is available.
 */
export function ensureThemesLoaded(themeIds, onProgress = () => {}) {
    const need = themeIds.filter(t => THEME_INDEX[t] && !_loadedThemes.has(t));
    if (need.length === 0) return Promise.resolve(_assets);

    const key = need.slice().sort().join(',');
    if (_inflight.has(key)) return _inflight.get(key);

    const p = loadThemes(need, onProgress).finally(() => _inflight.delete(key));
    _inflight.set(key, p);
    return p;
}

/**
 * Quality knobs for asset pre-rendering.
 *
 * DISPLAY_SUPERSAMPLE: how many times the asset's display (CSS) size we
 *   bake into the per-asset draw canvas. The renderer always blits this
 *   canvas at the asset's display size, so the only resampling left at
 *   runtime is from `displayCanvas.size` (≈ display × SUPERSAMPLE) down to
 *   the on-screen pixel size at the current camera zoom × devicePixelRatio.
 *
 *   The effective worst-case factor we need to cover is
 *   `maxZoom × devicePixelRatio` (3.0 × 2 = 6 on a typical retina). We
 *   set SUPERSAMPLE to that max and let `buildDisplayCanvas` cap to the
 *   source PNG size so we never burn memory rendering above the source's
 *   own resolution. Result: assets stay pixel-sharp at every zoom level
 *   on retina, and the per-frame draw is still just a fast intermediate
 *   blit instead of a 2k-wide PNG downsample.
 *
 * SHADOW_SUPERSAMPLE / SHADOW_BLUR_PX: shadows are projected then blurred
 *   at draw time. We pre-blur a smaller silhouette once at load time and
 *   then just blit it transformed per frame, so the slow `ctx.filter`
 *   blur path is gone from the render loop entirely.
 */
const DEFAULT_DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
const MAX_ZOOM    = 3.0;
const DISPLAY_SUPERSAMPLE = Math.max(2, Math.ceil(MAX_ZOOM * DEFAULT_DPR));
const SHADOW_SUPERSAMPLE  = 1;
const SHADOW_BLUR_PX      = 6;

/**
 * Pre-render an asset's source canvas down to a draw-ready canvas at the
 * asset's display resolution × SUPERSAMPLE. The render loop later blits
 * this canvas at `(width, height)` regardless of camera zoom, so the
 * browser only ever resamples a small intermediate instead of the full
 * 1k–2k px PNG, and only does it once per zoom-change effectively.
 *
 * Returns the original canvas as-is when the source is already small
 * enough — pre-rendering would be a net loss in that case.
 */
function buildDisplayCanvas(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return srcCanvas;
    const targetW = Math.max(1, Math.ceil(displayW * DISPLAY_SUPERSAMPLE));
    const targetH = Math.max(1, Math.ceil(displayH * DISPLAY_SUPERSAMPLE));
    if (targetW >= srcCanvas.width && targetH >= srcCanvas.height) {
        // Source isn't bigger than the supersampled draw size, so the
        // browser would be upsampling either way. Skip the extra canvas.
        return srcCanvas;
    }
    const out = document.createElement('canvas');
    out.width  = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d');
    if (!ctx) return srcCanvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    return out;
}

/**
 * Build a black silhouette of an asset canvas for use as a cast shadow,
 * pre-resampled to display resolution and pre-blurred so the per-frame
 * shadow pass is just a transformed `drawImage` (no `ctx.filter` blur,
 * no full-resolution silhouette upload to the GPU each frame).
 */
function buildShadowCanvas(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return null;
    const targetW = Math.max(1, Math.ceil(displayW * SHADOW_SUPERSAMPLE));
    const targetH = Math.max(1, Math.ceil(displayH * SHADOW_SUPERSAMPLE));
    const pad = Math.ceil(SHADOW_BLUR_PX * 2.5);
    const w = targetW + pad * 2;
    const h = targetH + pad * 2;

    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    if (!tctx) return null;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(srcCanvas, pad, pad, targetW, targetH);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, w, h);

    // Pre-blur once at load time. If the browser doesn't support
    // `ctx.filter`, we just ship the un-blurred silhouette — the renderer
    // adds an extra alpha shrink to soften it visually.
    if (typeof tctx.filter !== 'string') {
        return { canvas: tmp, padding: pad, width: targetW, height: targetH, blurred: false };
    }
    const out = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    const octx = out.getContext('2d');
    octx.filter = `blur(${SHADOW_BLUR_PX}px)`;
    octx.drawImage(tmp, 0, 0);
    return { canvas: out, padding: pad, width: targetW, height: targetH, blurred: true };
}

/**
 * Find left/right foot points for low contact-shadow assets such as fences.
 * We look for tall opaque column clusters (the posts) and return their
 * bottom-center points scaled into the final draw size.
 */
function buildContactPoints(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return [];
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const ctx = srcCanvas.getContext('2d');
    if (!ctx) return [];

    let data;
    try {
        data = ctx.getImageData(0, 0, w, h).data;
    } catch {
        return [];
    }

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 20) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < minX || maxY < minY) return [];

    const visibleH = maxY - minY + 1;
    const threshold = visibleH * 0.45;
    const runs = [];
    let runStart = -1;
    for (let x = minX; x <= maxX; x++) {
        let count = 0;
        for (let y = minY; y <= maxY; y++) {
            if (data[(y * w + x) * 4 + 3] > 20) count++;
        }
        if (count >= threshold && runStart < 0) runStart = x;
        if ((count < threshold || x === maxX) && runStart >= 0) {
            const end = count < threshold ? x - 1 : x;
            if (end - runStart >= 5) runs.push({ start: runStart, end });
            runStart = -1;
        }
    }
    if (runs.length < 2) return [];

    const postRuns = [runs[0], runs[runs.length - 1]];
    const sx = displayW / w;
    const sy = displayH / h;
    return postRuns.map(run => {
        let bottomY = minY;
        for (let y = minY; y <= maxY; y++) {
            for (let x = run.start; x <= run.end; x++) {
                if (data[(y * w + x) * 4 + 3] > 20) {
                    if (y > bottomY) bottomY = y;
                    break;
                }
            }
        }
        return {
            x: ((run.start + run.end) / 2) * sx,
            y: bottomY * sy,
        };
    });
}

/**
 * Back-compat entry point: load every theme's art in one pass. Kept for any
 * caller that wants the whole pack; the boot path now prefers `loadThemes`
 * with just the themes a save needs.
 */
export async function loadAssets(onProgress = () => {}) {
    return loadThemes(Object.keys(THEME_INDEX), onProgress);
}

export function getAsset(id) {
    if (!_assets) throw new Error('Assets not yet loaded');
    const a = _assets[id];
    if (!a) console.warn(`Unknown asset id: ${id}`);
    return a;
}

export function allAssets() {
    if (!_assets) throw new Error('Assets not yet loaded');
    return _assets;
}
