# The Islander

A browser-based isometric island builder (branded **The Islander** in the UI; **Aegean** is the default asset theme). Pure HTML/CSS/ES modules — no bundler, no transpiler, no `node_modules`. The `localStorage` save key still uses the old `mykonos-island-voxels` slug for back-compat — don't rename it. Likewise the Aegean theme keeps its historical `id: 'mykonos'` slug and `gmk_` asset-id prefix (both persisted in saves) — only its display name is "Aegean".

## Tech Stack

- **Language**: Vanilla JavaScript (ES modules), CSS, HTML5 Canvas — no framework
- **Build**: `netlify-build.mjs` — zero-dependency Node.js script; copies runtime files to `dist/`
- **No package.json**: Node is only needed for the build script (uses only built-ins, Node ≥ 16)
- **Deployments**: Netlify (`netlify.toml`) + GitHub Pages (`.github/workflows/deploy.yml`)

## Project Layout

```
index.html              # Entry point
styles.css              # All UI styling (~760 lines, no framework)
src/
  main.js               # Boot, asset loading, starter scene
  config.js             # Grid size, tile dims, palette colours, storage key
  core/
    Game.js             # Game state + tool dispatch
    Camera.js           # Pan/zoom/change notifications
    Renderer.js         # Layered canvas caching + animations (largest file, 40 KB)
    InputManager.js     # Mouse, touch, keyboard unified input
  grid/
    IsoGrid.js          # Screen ↔ cell coordinate math
    TileMap.js          # Terrain + objects, O(1) spatial occupancy index
  building/
    PlacedObject.js     # Individual placed object data
    PlacementSystem.js  # Asset placement logic
  assets/
    assetManifest.js    # 75+ asset definitions
    assetLoader.js      # PNG → display canvas + shadow canvas
    imageToAsset.js     # Silhouette extraction, anchor inference
    voxelRenderer.js    # Procedural fallback when PNGs missing
  ui/
    UIManager.js
    Toolbar.js
    AssetPalette.js
    HUD.js
    Audio.js            # WebAudio clip routing + debounce
  storage/
    SaveSystem.js       # localStorage save/load
assets/                 # PNG asset pack (75+ files)
  raw/                  # Source PNGs
  raw_pending/          # New assets awaiting cleanup
  newAsset/             # New asset variants
*.ogg                   # 7 sound effects (placement, UI, material categories)
tools/
  process_assets.py     # Python script: trims transparent PNG edges
netlify-build.mjs       # Build script → dist/
netlify.toml            # Netlify config + cache headers
```

## Key Architecture Decisions

- **Layered cache rendering** (`Renderer.js`): four canvas caches — backdrop+vignette (screen-space), platform, terrain, static-objects (all world-space). Idle frames are free; only animating tiles recomposite.
- **High-DPI assets**: source PNGs pre-rendered at 6× display resolution; cache canvases at 2–3×. No softening at any zoom level.
- **Spatial occupancy index** (`TileMap`): O(1) object lookup and free-cell checks — never iterate the full object list.
- **Dirty-flag render loop**: `markDirty()` gates the loop; static scenes don't repaint.
- **Sound debouncing** (`Audio.js`): 7 distinct material sounds; debounced so brush-painting doesn't flood the audio bus.
- **Auto-save**: `localStorage` key `mykonos-island-voxels.save.v1` (from `config.js`).
- **No external dependencies**: keep the runtime framework-free — this is a load-bearing constraint, not a preference.

## World size & shape

The island's **size** and **shape** are player-selectable at runtime from the HUD (bottom-right).

- **Size** = the bounding grid, chosen from `CONFIG.grid.presets` (S 10², M 14² default, L 20², XL 26²).
- **Shape** = a land mask carved inside that bounding box (`src/grid/islandShapes.js`: `computeMask(shapeId, W, H)` → `Uint8Array`; 11 shapes — Full, Square, Rectangle, L, Ring(O), C, Diamond, Cross(+), Round, Archipelago, Teardrop). Size and shape compose: the shape scales to whatever size is chosen.
- `TileMap` owns the mask: `isLand(gx,gy)` is the buildability test (vs `inBounds`, which is just array bounds). `applyLayout(w,h,shape)` resizes/reshapes and **drops any terrain/objects that no longer sit on land**, returning the removed count. `layoutVersion` bumps on layout changes.
- The renderer treats the whole grid square as the floating tile: land is the cream slab (`_traceLandPath`) and **every unoccupied cell is filled with sea** (`_traceCellUnion` with `!isLand`), so shapes read as real islands (Ring → lagoon, Archipelago → channels) and a Full island is unchanged (no unoccupied cells). The drop shadow is cast by the square; the grid is clipped to the land path. Platform cache is keyed on `layoutVersion`; a size change also recomputes world bounds and invalidates terrain/objects caches.
- Shape is persisted in the save (`TileMap.serialize`); legacy saves default to `full`.

## Configuration (`src/config.js`)

- Grid: 14×14 default (`grid.presets` S/M/L/XL; `grid.defaultShape`)
- Tile: 64×32 px (classic 2:1 isometric)
- Voxel: 4×4 per tile, 16px each
- Camera zoom: 0.5–3.0, default 1.4
- Layers: TERRAIN(0) / WATER(1) / OBJECT(2)

## Asset Pipeline

Every visible object is a hand-made transparent PNG (this is a hard project rule from `mykonos_voxel_builder_prompt.md`: no external art, no stock, no icon packs — all assets are generated specifically for this project). The runtime never generates final art; it only loads PNGs and, if one is missing, falls back to a procedural voxel builder so the editor keeps working during dev.

**Data flow (PNG → screen):**

1. **Author a PNG** in the Aegean style — an isometric object on a transparent background. Convention: filename `gmk_<id>.png`, prefix `gmk_` = "generated Mykonos" (the theme's historical slug, retained for save compat).
2. **Source dirs**: cleaned originals live in `assets/raw/`; freshly generated art awaiting cleanup goes in `assets/raw_pending/`. Variants can sit in `assets/newAsset/`.
3. **Trim + compress** with `python tools/process_assets.py --quantize 256 <file(s)>` (reads `raw/`, or `--pending` for `raw_pending/`). Output lands in `assets/<name>.png`. Background removal is done by hand before this step (deliberate quality bar).
   - **Always pass `--quantize 256`.** This is the load-time strategy — a 256-colour adaptive palette is near-lossless on this flat cobalt-on-cream art but shrinks the PNGs ~80–93% (a batch of 24-bit RGBA sources went 14.7 MB → 1.1 MB). Every shipped asset in `assets/` is quantized; new ones must match, or they bloat the first-load payload. Without the flag the script only crops transparent borders (no recolor, no downscale).
   - **Interpreter:** on this Windows box only `python` (C:\Python313) has Pillow — `python3`/`py` don't. `--quantize` takes an explicit value (`--quantize 256`), otherwise argparse eats the next filename as its argument.
   - **Filename must equal the asset id** (`<id>.png`), since the manifest derives `filename` from `id`. Fix source-name typos before/at this step (e.g. a raw `nord_arcway.png` had to become `nord_archway.png` to match id `nord_archway`).
4. **Register** the asset in `src/assets/assetManifest.js` (the single source of truth).
5. **Load**: `assetLoader.js` tries `assets/<filename>`, runs it through `imageToAsset.js` (trim → detect base/diamond geometry → infer anchor), then pre-renders a display canvas + pre-blurred cast-shadow canvas. On load failure it calls the manifest entry's `builder` (procedural fallback in `assetDefinitions.js` / `voxelRenderer.js`).
6. **Display**: `AssetPalette.js` renders two stacked sections in the right-side palette — a themed section (theme switcher + Buildings/Water/Props tabs, top ~2/3) and a neutral section (Terrain/Nature tabs, bottom ~1/3). Each section has its own swatch grid; the renderer places assets by anchor.

**Manifest entry fields** (see the header comment in `assetManifest.js` for the authoritative list):
- `category`: `terrain` | `nature` | `props` | `water` | `buildings` — drives which palette tab it appears under.
- `footprint {w,d}`: grid cells occupied (large buildings are multi-cell, e.g. villa 4×4).
- `kind`: `terrain` (replaces the ground tile) vs `object` (sits on top).
- `sizeScale`: fraction of the cell width the art occupies (decoupled from footprint — a jar on a 1×1 cell uses ~0.35).
- `tileLike`: source PNG is a full iso voxel cube; strip its side-walls and reuse just the top diamond so adjacent tiles seam cleanly.
- `fitCell`: scale the high-res PNG into the cell width without re-compositing.
- `flatBase`: PNG has no painted slab — its bottom edge is the prop's feet; anchor at the cell's front corner.
- `noShadow`: skip the projected cast shadow (PNG already bakes its own grounding shadow).
- `shadowStyle`: `cast` (default silhouette projection) or `contact` (small grounding shadow under posts/fences).
- `builder`: procedural fallback, only used when the PNG is missing.

**Adding one asset (same theme):** author `gmk_<id>.png` → drop in `assets/raw_pending/` → `python tools/process_assets.py --pending --quantize 256` → add a one-line entry to `assetManifest.js` with the right category/footprint/flags. No code changes needed elsewhere; the palette and loader pick it up automatically. Optionally add a `builder` fallback in `assetDefinitions.js`.

**Adding Nordic art (or another partially-derived theme):** the `nord_` set is derived from Aegean by `deriveTheme`; an entry only points at its own PNG once its bare id is in `NORDIC_REAL_ART` (`assetManifest.js`). So: trim+quantize the `assets/nord_<id>.png` as above, then add the bare id (e.g. `bench`, `small_bridge`) to `NORDIC_REAL_ART` — no new manifest rows, since it inherits the Aegean entry's footprint/flags. Terrain/nature are neutral (not themed): a new ground tile like `snow` is a single `tileLike` row in `NEUTRAL_MANIFEST` and shows under every theme.

## Themes

Assets are grouped into **themes** — parallel asset sets selectable at runtime from the segmented control at the top of the palette (`#palette-themes`, above the category tabs).

- **Registry**: `THEMES` in `assetManifest.js`. Each theme has an `id`, display `name`, id `prefix`, and a `manifest`. `AEGEAN_MANIFEST` is the authored source of truth (its theme `id` slug is `'mykonos'` and its `prefix` is `gmk_`, both kept for save compat); `NORDIC_MANIFEST` is currently a **stub** derived by `deriveTheme()` — it clones the Aegean entries under the `nord_` prefix but keeps them pointed at the same PNGs, so the switcher is fully functional before any bespoke Nordic art exists.
- **Neutral Terrain & Nature (theme-independent)**: `terrain` and `nature` are a single shared set with **bare ids** (`grass`, `cypress` — no theme prefix), defined once in `NEUTRAL_MANIFEST`. Ground tiles and plants look the same across themes, so they're excluded from the per-theme manifests, always loaded at boot, and rendered in the palette's own bottom section — untouched by the theme switcher. Their PNGs are named bare too (`assets/grass.png`). Only `buildings`, `water`, and `props` are themed. Use `assetsForCategory(category, themeId)` to get the right entries for a category (neutral set vs. active theme).
- **Absolute ids (load-bearing invariant)**: every *themed* asset id carries its theme prefix (`gmk_house`, `nord_house`) — never bare (the sole exception is the neutral set above). So a placed object or save always resolves to exactly the art it was made with, and a village may even mix themes. `ASSET_INDEX` (the metadata index) spans the neutral set **and** every theme, so any id resolves to its manifest entry regardless of load state.
- **Lazy theme loading**: the loader no longer brings in every theme's *art* at boot. `main.js` loads only the packs a save needs — `SaveSystem.peekThemes()` returns the active theme plus any theme referenced by placed objects, always including the default (for the palette + first-run starter). Other themes stream in on first switch via `ensureThemesLoaded()`. Themes that share a source PNG (e.g. the Nordic stub reusing Aegean art) are **deduped** by a signature over filename+geometry: the second theme reuses the first's built canvases instead of re-fetching/re-processing. Because the renderer null-checks every `getAsset`, an as-yet-unloaded theme degrades gracefully rather than crashing.
- **Switching** (`Game.setTheme`) only changes what the palette offers and what *new* placements draw from — already-placed objects are untouched (no destructive re-theming). If the target theme's art isn't loaded yet it is streamed in first (`isThemeLoaded`/`ensureThemesLoaded`), then applied via `_applyTheme`. The current selection is re-anchored to the new theme's equivalent asset via `reThemeAssetId` (gmk_house → nord_house). The active theme is persisted in the save (`SaveSystem`) and restored on load.

**Adding a real theme (e.g. Nordic art, desert):** draw a coherent PNG set in the new style, add the files as `assets/<prefix>_*.png`, and register a `THEMES` entry. For a genuinely distinct set, replace the `deriveTheme` stub with real per-entry `filename`s. The themed categories (`props/water/buildings`) and all geometry conventions stay identical, so a theme is purely new PNGs + a manifest — terrain and nature are shared (neutral) and not part of a theme. Note the starter scene in `src/main.js` hard-codes bare neutral ids (`grass`, `cypress`) plus `gmk_*` building/prop ids for first-run — retheme the themed ones if the default should change.

## Build

```bash
node netlify-build.mjs   # → dist/
```

Copies: `index.html`, `styles.css`, `src/`, `assets/`, 7 OGG files.
Skips: `.DS_Store`, `.webp` duplicates, design references, `tools/`.

## Run Locally

Browsers refuse to load ES modules from `file://` — serve over HTTP:

```bash
python3 -m http.server 8000
# or: npx serve .
```

## Secrets

**None.** No API keys, no environment variables in any code. The GitHub Actions deployment uses only the automatic `GITHUB_TOKEN` — no secrets to add to GitHub.

## Contributing Rules

- Record user-facing changes in `CHANGELOG.md` — business-oriented (Added / Changed / Designed), newest first. Update it as part of shipping a feature.
- Keep it framework-free — no bundlers, transpilers, or `node_modules` in the runtime.
- Keep the asset style coherent (cobalt-on-cream, soft shadows, elastic motion).
- No per-frame `ctx.filter`, ImageBitmap shenanigans, or anything that breaks the renderer's caching invariants — they are load-bearing.
