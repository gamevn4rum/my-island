/**
 * TileMap.js
 *
 * Stores the world's two layers:
 *   - terrain: a 2D grid of asset ids (one per cell).
 *   - objects: a list of placed objects, each occupying one or more cells.
 *
 * The TileMap is the single source of truth used by the renderer, the
 * placement system, and the save system.
 *
 * Performance notes:
 *   - We keep an `_occupancy` grid (cell → owning object) so `objectAt`
 *     and `isFreeFor` are O(1) per cell instead of scanning the object
 *     list. With many placements the renderer used to spend most of its
 *     time inside `canPlace` during hover, which is now flat.
 *   - `terrainVersion` and `objectsVersion` are bumped on every mutation
 *     so the renderer can cheaply detect cache invalidation.
 */

import { CONFIG } from '../config.js';
import { computeMask, DEFAULT_SHAPE } from './islandShapes.js';

export class TileMap {
    constructor(
        width = CONFIG.grid.width,
        height = CONFIG.grid.height,
        shape = CONFIG.grid.defaultShape ?? DEFAULT_SHAPE,
    ) {
        this.width = width;
        this.height = height;
        this.shape = shape;
        this._mask = computeMask(shape, width, height);
        this.terrain = new Array(width * height).fill(null);
        this.objects = []; // PlacedObject[]
        this._occupancy = new Array(width * height).fill(null);
        this._nextId = 1;

        // Bumped on any change; the renderer compares stored versions to
        // know when to rebuild its cached layer canvases.
        this.terrainVersion = 0;
        this.objectsVersion = 0;
        // Bumped when the grid size or island shape changes, so the renderer
        // knows to rebuild the (otherwise size/shape-invariant) platform.
        this.layoutVersion = 0;
    }

    nextId() { return this._nextId++; }

    /** Within the bounding grid (array/occupancy indexing). */
    inBounds(gx, gy) {
        return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height;
    }

    /** Within the bounding grid AND on the island (buildable). */
    isLand(gx, gy) {
        return this.inBounds(gx, gy) && this._mask[gy * this.width + gx] === 1;
    }

    /** True when every cell of a footprint at (gx,gy) is land. */
    footprintOnLand(gx, gy, footprint = { w: 1, d: 1 }) {
        for (let ix = 0; ix < footprint.w; ix++)
        for (let iy = 0; iy < footprint.d; iy++) {
            if (!this.isLand(gx + ix, gy + iy)) return false;
        }
        return true;
    }

    /**
     * Resize the grid and/or change the island shape, preserving any content
     * that still lands on the new island and discarding the rest. Returns the
     * number of terrain tiles + objects that were removed.
     */
    applyLayout(width, height, shape = this.shape) {
        const oldW = this.width, oldH = this.height, oldTerrain = this.terrain;
        const oldObjects = this.objects;

        this.width = width;
        this.height = height;
        this.shape = shape;
        this._mask = computeMask(shape, width, height);
        this.terrain = new Array(width * height).fill(null);
        this._occupancy = new Array(width * height).fill(null);
        this.objects = [];

        let removed = 0;
        const copyW = Math.min(oldW, width), copyH = Math.min(oldH, height);
        for (let gy = 0; gy < copyH; gy++)
        for (let gx = 0; gx < copyW; gx++) {
            const id = oldTerrain[gy * oldW + gx];
            if (!id) continue;
            if (this.isLand(gx, gy)) this.terrain[gy * width + gx] = id;
            else removed++;
        }
        for (const obj of oldObjects) {
            if (this.footprintOnLand(obj.gx, obj.gy, obj.footprint)) {
                this.objects.push(obj);
                this._stampOccupancy(obj, obj);
            } else {
                removed++;
            }
        }

        this.layoutVersion++;
        this.terrainVersion++;
        this.objectsVersion++;
        return removed;
    }

    setTerrain(gx, gy, assetId) {
        if (!this.inBounds(gx, gy)) return;
        const idx = gy * this.width + gx;
        if (this.terrain[idx] === assetId) return;
        this.terrain[idx] = assetId;
        this.terrainVersion++;
    }
    getTerrain(gx, gy) {
        if (!this.inBounds(gx, gy)) return null;
        return this.terrain[gy * this.width + gx];
    }
    clearTerrain(gx, gy) { this.setTerrain(gx, gy, null); }

    /**
     * Returns the object covering (gx, gy), or null. O(1) thanks to the
     * occupancy index.
     */
    objectAt(gx, gy) {
        if (!this.inBounds(gx, gy)) return null;
        return this._occupancy[gy * this.width + gx] || null;
    }

    /**
     * Returns true if the rectangle [gx..gx+w, gy..gy+d] is on the island and
     * free of objects.
     */
    isFreeFor(gx, gy, w, d) {
        for (let ix = 0; ix < w; ix++)
        for (let iy = 0; iy < d; iy++) {
            const cx = gx + ix, cy = gy + iy;
            if (!this.isLand(cx, cy)) return false;
            if (this._occupancy[cy * this.width + cx]) return false;
        }
        return true;
    }

    addObject(obj) {
        this.objects.push(obj);
        this._stampOccupancy(obj, obj);
        this.objectsVersion++;
    }

    removeObjectAt(gx, gy) {
        const target = this.objectAt(gx, gy);
        if (!target) return null;
        const idx = this.objects.indexOf(target);
        if (idx === -1) return null;
        this.objects.splice(idx, 1);
        this._stampOccupancy(target, null);
        this.objectsVersion++;
        return target;
    }

    clearAll() {
        this.terrain.fill(null);
        this._occupancy.fill(null);
        this.objects.length = 0;
        this._nextId = 1;
        this.terrainVersion++;
        this.objectsVersion++;
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            shape: this.shape,
            terrain: this.terrain,
            objects: this.objects.map(o => o.serialize()),
        };
    }

    /**
     * Replace contents from a serialized snapshot.
     * objectFactory(data) -> PlacedObject lets us avoid a circular import.
     */
    deserialize(data, objectFactory) {
        if (!data) return;
        this.width  = data.width;
        this.height = data.height;
        this.shape  = data.shape ?? DEFAULT_SHAPE;
        this._mask  = computeMask(this.shape, this.width, this.height);
        this.terrain = data.terrain ?? new Array(this.width * this.height).fill(null);
        this.objects = (data.objects ?? []).map(objectFactory);
        this._occupancy = new Array(this.width * this.height).fill(null);
        for (const obj of this.objects) this._stampOccupancy(obj, obj);
        this._nextId = this.objects.length + 1;
        this.layoutVersion++;
        this.terrainVersion++;
        this.objectsVersion++;
    }

    _stampOccupancy(obj, value) {
        const fp = obj.footprint || { w: 1, d: 1 };
        for (let ix = 0; ix < fp.w; ix++)
        for (let iy = 0; iy < fp.d; iy++) {
            const cx = obj.gx + ix, cy = obj.gy + iy;
            if (!this.inBounds(cx, cy)) continue;
            this._occupancy[cy * this.width + cx] = value;
        }
    }
}
