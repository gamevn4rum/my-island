# Mykonos Island Voxels

A browser-based isometric island builder styled after Mediterranean Mykonos. Pure HTML/CSS/ES modules — no bundler, no transpiler, no `node_modules`.

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

## Configuration (`src/config.js`)

- Grid: 14×14 cells
- Tile: 64×32 px (classic 2:1 isometric)
- Voxel: 4×4 per tile, 16px each
- Camera zoom: 0.5–3.0, default 1.4
- Layers: TERRAIN(0) / WATER(1) / OBJECT(2)

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

- Keep it framework-free — no bundlers, transpilers, or `node_modules` in the runtime.
- Keep the asset style coherent (cobalt-on-cream, soft shadows, elastic motion).
- No per-frame `ctx.filter`, ImageBitmap shenanigans, or anything that breaks the renderer's caching invariants — they are load-bearing.
