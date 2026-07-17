/**
 * main.js
 *
 * Entry point. Generates the asset pack first (with progress UI), then
 * instantiates the game once everything is ready.
 */

import { loadThemesForBoot } from './assets/assetLoader.js';
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { loadUiAudio } from './ui/Audio.js';
import { initMusic } from './ui/Music.js';
import { SaveSystem } from './storage/SaveSystem.js';

// Asset ids the first-run starter scene places. Boot builds these first so the
// opening village can paint immediately; the rest of the pack (palette-only
// art) streams in afterward. Keep in sync with seedExampleVillage() below.
const STARTER_ASSET_IDS = [
    'grass', 'path', 'water', 'sand',
    'gmk_house', 'gmk_main_chapel', 'gmk_windmill', 'gmk_two_story', 'gmk_villa',
    'cypress', 'bougainvillea', 'olive', 'flower_pot', 'gmk_terracotta_pot',
    'agave', 'gmk_lantern_post', 'gmk_small_bridge',
];

async function main() {
    const fill = document.getElementById('loading-fill');
    const status = document.getElementById('loading-status');
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');

    // Only load the theme packs this save actually needs up front — the active
    // theme plus any theme its objects reference (and always the default, for
    // the palette + starter scene). Other themes stream in lazily on switch.
    const themeIds = SaveSystem.peekThemes();

    // Within those themes, build the CRITICAL assets first (what the opening
    // frame renders): a restored save's placed ids, or the starter-scene ids on
    // first run. The app appears as soon as these are ready; the remaining
    // (palette-only) assets finish in the background.
    const savedIds = SaveSystem.peekAssetIds();
    const criticalIds = savedIds.size ? savedIds : new Set(STARTER_ASSET_IDS);

    // Deferred hook: fires per asset during the background pass. Wired to the
    // palette refresh only after the UI exists (see below).
    let onBackgroundAsset = null;

    const { restDone } = await loadThemesForBoot(themeIds, criticalIds, {
        onProgress: (p, label) => {
            fill.style.width = `${Math.round(p * 100)}%`;
            status.textContent = `crafting ${label}…`;
        },
        onBackgroundAsset: (id) => onBackgroundAsset?.(id),
    });

    // Kick off the UI sound effect download in parallel — it's tiny and
    // we don't want the very first click to feel sluggish waiting for it.
    loadUiAudio();

    fill.style.width = '100%';
    status.textContent = 'arriving at the harbor';

    // Tiny delay for the bar to finish its sweep — feels nicer.
    await new Promise(r => setTimeout(r, 250));

    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);
    const ui = new UIManager(game);
    game.ui = ui;
    ui.update();

    // Try to restore previous session.
    if (game.load()) {
        ui.showToast('Welcome back');
    } else {
        seedExampleVillage(game);
    }

    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');

    // Start the background music now that the app is on screen. Autoplay may
    // be blocked until the first interaction — initMusic handles that.
    initMusic({
        audioEl: document.getElementById('bgm'),
        buttonEl: document.getElementById('music-toggle'),
    });

    // The rest of the asset pack streams in behind the now-interactive app.
    // Coalesce palette refreshes so swatches fill in progressively without
    // rebuilding the grid on every single asset.
    let refreshQueued = false;
    const refreshPalette = () => {
        if (refreshQueued) return;
        refreshQueued = true;
        setTimeout(() => {
            refreshQueued = false;
            ui.palette.refreshLoadedArt();
            game.renderer.markDirty();
        }, 180);
    };
    onBackgroundAsset = refreshPalette;
    restDone.then(() => {
        ui.palette.refreshLoadedArt();
        game.renderer.markDirty();
    });
}

/**
 * Place a small starter scene so first-run users see something pretty.
 *
 * Each placement is queued with a depth-based delay so the village
 * ripples in back-to-front: the back row of grass appears first, then
 * the wave sweeps forward across the island and the buildings + props
 * pop in on top of the terrain wave as it passes them. The whole reveal
 * lasts a touch over a second.
 */
function seedExampleVillage(game) {
    const W = game.tileMap.width, H = game.tileMap.height;

    // Tuning for the reveal. STEP_MS is how long the wave takes to move
    // one diamond row deeper into the scene; OBJECT_DELAY adds a small
    // beat after the back-row terrain settles before its building or
    // prop pops in on top.
    const STEP_MS      = 32;
    const OBJECT_DELAY = 90;

    const placeT = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS;
        game.placeAndAnimate(id, gx, gy, { delay });
    };
    const placeO = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS + OBJECT_DELAY;
        game.placeAndAnimate(id, gx, gy, { delay });
    };

    // Grass everywhere
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        placeT('grass', gx, gy);
    }

    // Stone path crossing
    const midX = Math.floor(W / 2);
    const midY = Math.floor(H / 2);
    for (let gx = 1; gx < W - 1; gx++) placeT('path', gx, midY);
    for (let gy = 1; gy < H - 1; gy++) placeT('path', midX, gy);

    // Water canal along the front edge
    for (let gx = 0; gx < W; gx++) {
        placeT('water', gx, H - 1);
        placeT('water', gx, H - 2);
    }
    // Sand strip just behind the water as beach
    for (let gx = 0; gx < W; gx++) placeT('sand', gx, H - 3);

    // A house and chapel
    placeO('gmk_house', 2, 2);
    placeO('gmk_main_chapel', 7, 1);
    placeO('gmk_windmill', 11, 2);
    placeO('gmk_two_story', 2, 7);
    placeO('gmk_villa', 7, 7);

    // Some nature accents (neutral, bare ids)
    placeO('cypress', 1, 5);
    placeO('cypress', 12, 5);
    placeO('bougainvillea', 5, 3);
    placeO('olive', 0, 9);
    placeO('flower_pot', 6, 5);
    placeO('gmk_terracotta_pot', 11, 6);
    placeO('agave', 13, 8);

    // Lanterns + small bridge
    placeO('gmk_lantern_post', 4, 6);
    placeO('gmk_lantern_post', 9, 6);
    placeO('gmk_small_bridge', 5, H - 2);
}

main().catch(err => {
    console.error(err);
    document.getElementById('loading-status').textContent =
        `Something went wrong: ${err.message}`;
});
