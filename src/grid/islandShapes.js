/**
 * islandShapes.js
 *
 * An "island shape" is a mask over the WxH bounding grid that decides which
 * cells are LAND (buildable, and drawn as platform slab) versus empty void.
 * Grid size (from the presets) sets the bounding box; the shape carves the
 * land inside it, so the two compose freely.
 *
 * Each shape is a predicate factory `(W, H) -> (gx, gy) => boolean`. Keeping
 * them parametric in W/H means the same shape scales cleanly across every
 * grid preset. `computeMask` materialises a predicate into a flat Uint8Array
 * (row-major, idx = gy*W + gx) — the form TileMap stores and queries.
 */

const clampT = (frac, n) => Math.max(1, Math.round(n * frac));

/**
 * Predicate factories, keyed by shape id. Coordinates use cell centres
 * (gx+0.5, gy+0.5) for the smooth (round/diamond/teardrop) shapes so the
 * masks stay symmetric.
 */
const SHAPE_PREDICATES = {
    // Whole grid — the classic filled island (default).
    full: () => () => true,

    // Centred square with a water margin all around.
    square: (W, H) => {
        const t = clampT(0.15, Math.min(W, H));
        return (x, y) => x >= t && x < W - t && y >= t && y < H - t;
    },

    // Full-width central band — a long, low island.
    rectangle: (W, H) => {
        const bh = Math.max(2, Math.round(H * 0.55));
        const top = Math.floor((H - bh) / 2);
        return (x, y) => y >= top && y < top + bh;
    },

    // Left column block + bottom row block.
    l: (W, H) => {
        const t = Math.max(2, Math.round(Math.min(W, H) * 0.5));
        return (x, y) => x < t || y >= H - t;
    },

    // Hollow rectangular ring (the "O").
    o: (W, H) => {
        const t = clampT(0.25, Math.min(W, H));
        return (x, y) => x < t || x >= W - t || y < t || y >= H - t;
    },

    // Ring open on the right — a "C".
    c: (W, H) => {
        const t = clampT(0.25, Math.min(W, H));
        return (x, y) => x < t || y < t || y >= H - t;
    },

    // Grid-space diamond (renders as a rotated square on screen).
    diamond: (W, H) => {
        const cx = W / 2, cy = H / 2;
        return (x, y) =>
            Math.abs(x + 0.5 - cx) / cx + Math.abs(y + 0.5 - cy) / cy <= 1.02;
    },

    // Central vertical + horizontal bars — a plus sign.
    plus: (W, H) => {
        const aw = Math.max(2, Math.round(Math.min(W, H) * 0.34));
        const vLo = Math.floor((W - aw) / 2), vHi = vLo + aw;
        const hLo = Math.floor((H - aw) / 2), hHi = hLo + aw;
        return (x, y) => (x >= vLo && x < vHi) || (y >= hLo && y < hHi);
    },

    // Ellipse filling the grid — a soft round island.
    round: (W, H) => {
        const cx = W / 2, cy = H / 2;
        return (x, y) => {
            const nx = (x + 0.5 - cx) / cx;
            const ny = (y + 0.5 - cy) / cy;
            return nx * nx + ny * ny <= 1.05;
        };
    },

    // Several scattered islets — makes bridges meaningful.
    archipelago: (W, H) => {
        const r = Math.max(1.6, Math.min(W, H) * 0.17);
        const r2 = r * r;
        const centres = [
            [0.26, 0.30], [0.72, 0.24], [0.50, 0.55], [0.28, 0.76], [0.76, 0.72],
        ].map(([fx, fy]) => [fx * W, fy * H]);
        return (x, y) => centres.some(([cx, cy]) => {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            return dx * dx + dy * dy <= r2;
        });
    },

    // Round head up top tapering to a point at the bottom.
    teardrop: (W, H) => {
        const cx = W / 2;
        const headCy = H * 0.36;
        const r = Math.min(W, H) * 0.30;
        return (x, y) => {
            const px = x + 0.5, py = y + 0.5;
            const dx = px - cx, dy = py - headCy;
            if (dx * dx + dy * dy <= r * r) return true;
            if (py >= headCy) {
                const t = (py - headCy) / (H - headCy);   // 0 at head → 1 at bottom
                return Math.abs(px - cx) <= r * (1 - t);
            }
            return false;
        };
    },
};

/** Ordered list for the UI (id + display name). */
export const ISLAND_SHAPES = Object.freeze([
    { id: 'full',        name: 'Full' },
    { id: 'square',      name: 'Square' },
    { id: 'rectangle',   name: 'Rectangle' },
    { id: 'l',           name: 'L-Shape' },
    { id: 'o',           name: 'Ring (O)' },
    { id: 'c',           name: 'C-Shape' },
    { id: 'diamond',     name: 'Diamond' },
    { id: 'plus',        name: 'Cross (+)' },
    { id: 'round',       name: 'Round' },
    { id: 'archipelago', name: 'Archipelago' },
    { id: 'teardrop',    name: 'Teardrop' },
]);

export const DEFAULT_SHAPE = 'full';

/**
 * Materialise a shape into a land mask (Uint8Array, 1 = land). Falls back to
 * a full island for unknown ids or any degenerate (all-void) result.
 */
export function computeMask(shapeId, W, H) {
    const factory = SHAPE_PREDICATES[shapeId] || SHAPE_PREDICATES.full;
    const pred = factory(W, H);
    const mask = new Uint8Array(W * H);
    let count = 0;
    for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        if (pred(x, y)) { mask[y * W + x] = 1; count++; }
    }
    if (count === 0) mask.fill(1);
    return mask;
}
