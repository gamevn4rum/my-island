/**
 * SaveSystem.js
 *
 * Persistence using localStorage. Saves the tilemap (terrain + objects)
 * along with camera state for a smoother return-to-game experience.
 */

import { CONFIG } from '../config.js';
import { PlacedObject } from '../building/PlacedObject.js';
import { ASSET_INDEX } from '../assets/assetManifest.js';

const KEY = CONFIG.storageKey;

/**
 * Saves made before asset ids gained their theme prefix (e.g. "house")
 * still need to resolve against the current manifest (e.g. "gmk_house").
 * Upgrades in place; leaves anything already valid or unrecognised alone.
 */
function migrateLegacyAssetIds(tileMapData) {
    if (!tileMapData) return;
    const upgrade = (id) => {
        if (id == null || ASSET_INDEX[id]) return id;
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
};
