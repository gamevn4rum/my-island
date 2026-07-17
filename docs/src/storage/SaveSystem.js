/**
 * SaveSystem.js
 *
 * Persistence using localStorage. Saves the tilemap (terrain + objects)
 * along with camera state for a smoother return-to-game experience.
 */

import { CONFIG } from '../config.js';
import { PlacedObject } from '../building/PlacedObject.js';
import {
    ASSET_INDEX,
    DEFAULT_THEME_ID,
    THEME_INDEX,
    THEMES,
    themeOfAssetId,
} from '../assets/assetManifest.js';

const KEY = CONFIG.storageKey;

/**
 * Reconcile saved asset ids with the current manifest. Two eras to cover:
 *   1. Pre-prefix saves (e.g. "house") → add the default prefix ("gmk_house").
 *   2. Terrain/Nature were once themed ("gmk_grass", "nord_cypress") but are
 *      now a shared, bare-id neutral set ("grass", "cypress") → strip the
 *      theme prefix when the bare id exists.
 * Upgrades in place; leaves anything already valid or unrecognised alone.
 */
function migrateLegacyAssetIds(tileMapData) {
    if (!tileMapData) return;
    const upgrade = (id) => {
        if (id == null || ASSET_INDEX[id]) return id;
        // Themed terrain/nature id → bare neutral id (gmk_grass → grass).
        for (const t of THEMES) {
            if (id.startsWith(t.prefix)) {
                const bare = id.slice(t.prefix.length);
                if (ASSET_INDEX[bare]) return bare;
            }
        }
        // Legacy pre-prefix id → default theme prefix (house → gmk_house).
        const prefixed = `gmk_${id}`;
        return ASSET_INDEX[prefixed] ? prefixed : id;
    };
    if (Array.isArray(tileMapData.terrain)) {
        tileMapData.terrain = tileMapData.terrain.map(upgrade);
    }
    if (Array.isArray(tileMapData.objects)) {
        for (const obj of tileMapData.objects) obj.assetId = upgrade(obj.assetId);
    }
}

export const SaveSystem = {
    save(tileMap, camera, theme) {
        const payload = {
            v: 1,
            theme,
            tileMap: tileMap.serialize(),
            camera: {
                offsetX: camera.offsetX,
                offsetY: camera.offsetY,
                zoom: camera.zoom,
            },
        };
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    },

    /**
     * Restores tilemap + camera into the passed instances. Returns
     * `{ ok, theme }` — `theme` is the active theme the save was made with
     * (undefined for pre-theme saves), which the caller applies to the UI.
     */
    load(tileMap, camera) {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return { ok: false };
            const data = JSON.parse(raw);
            migrateLegacyAssetIds(data.tileMap);
            tileMap.deserialize(data.tileMap, d => new PlacedObject(d));
            if (data.camera) {
                camera.offsetX = data.camera.offsetX;
                camera.offsetY = data.camera.offsetY;
                camera.zoom    = data.camera.zoom;
            }
            return { ok: true, theme: data.theme };
        } catch (e) {
            console.error('Load failed:', e);
            return { ok: false };
        }
    },

    clear() {
        try { localStorage.removeItem(KEY); } catch {}
    },

    /**
     * Peek at the stored save (without deserializing it) to work out which
     * themes it actually needs: the active theme it was saved with, plus any
     * theme referenced by a placed object or terrain tile (villages may mix
     * themes). The default theme is always included so the palette and the
     * first-run starter scene have art. Lets boot load only the needed packs
     * and defer the rest until a theme switch.
     */
    peekThemes() {
        const themes = new Set([DEFAULT_THEME_ID]);
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (data.theme && THEME_INDEX[data.theme]) themes.add(data.theme);
                const tm = data.tileMap || {};
                const ids = [];
                if (Array.isArray(tm.terrain)) ids.push(...tm.terrain);
                if (Array.isArray(tm.objects)) ids.push(...tm.objects.map(o => o?.assetId));
                for (const id of ids) {
                    const t = themeOfAssetId(id);
                    if (t) themes.add(t);
                }
            }
        } catch (e) {
            console.error('peekThemes failed:', e);
        }
        return [...themes];
    },

    /**
     * The set of asset ids a stored save actually places (terrain + objects),
     * run through the same legacy-id migration as load(). Boot uses these as
     * the "critical" set so a restored island paints before the rest of the
     * pack finishes streaming in. Empty when there's no save (first run).
     */
    peekAssetIds() {
        const ids = new Set();
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return ids;
            const data = JSON.parse(raw);
            migrateLegacyAssetIds(data.tileMap);
            const tm = data.tileMap || {};
            if (Array.isArray(tm.terrain)) {
                for (const id of tm.terrain) if (id) ids.add(id);
            }
            if (Array.isArray(tm.objects)) {
                for (const o of tm.objects) if (o?.assetId) ids.add(o.assetId);
            }
        } catch (e) {
            console.error('peekAssetIds failed:', e);
        }
        return ids;
    },
};
