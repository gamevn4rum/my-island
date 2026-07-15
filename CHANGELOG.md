# Changelog

All notable, user-facing changes to **The Islander** are recorded here. Entries
are written from a product perspective — what was **Added**, **Changed**, or
**Designed** — rather than in engineering detail. Newest release first.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Versioning is a simple running number; adjust the scheme when the product
adopts a formal release process.

---

## [Unreleased]

### Added
- **Background music.** A looping ambient theme now plays once the island
  loads, with a music toggle in the top-left title card to pause or resume it.

### Changed
- **Terrain & Nature are now theme-neutral.** Ground tiles and plants are a
  single shared set that no longer changes with the theme. The palette is split
  into two sections: a themed section on top (theme switcher + Buildings, Water,
  Props) and a neutral section beneath it (Terrain, Nature). Switching themes
  leaves your terrain and greenery — and the palette's bottom section —
  untouched. Existing islands are migrated automatically.
- **Faster startup.** The opening load now only prepares the theme your island
  actually uses instead of every theme up front; other themes load the moment
  you switch to one. Shared artwork is also reused rather than re-processed, so
  the loading screen clears noticeably sooner.
- **New app icon.** The beach-house artwork now appears as the browser tab
  favicon, on the loading screen, and in the top-left title card.

### Fixed
- **All five palette categories are now reachable.** The category tabs
  (Terrain, Nature, Props, Water, Buildings) previously overflowed the narrow
  palette behind a hidden scrollbar, leaving **Water** and **Buildings**
  effectively invisible. The tabs now wrap onto two rows so every category —
  including Buildings — is always in view.

### Designed
- **More bespoke Nordic art.** The Nordic theme now ships with its own
  hand-made pieces — **House, Cube House, Terrace House, Two-Story, Altar,
  Tower Chapel, Blue Railing,** and **Gate Fence** — instead of borrowing the
  Mykonos look. These eight were redrawn with cleaner cutouts for crisper,
  tighter-cropped placement. The rest of the Nordic set continues to reuse
  Mykonos art until it's drawn.

---

## [0.2.0] — 2026-07-14 · Themes & Island Customization

The builder becomes personalizable: players can now restyle the whole asset
set and reshape the island itself.

### Added
- **Theme switcher.** A theme control in the palette lets players switch the
  entire asset set between visual themes on the fly. Ships with **Mykonos**
  (the original Mediterranean look, default) and **Nordic**. The chosen theme
  is remembered with each saved island.
- **Selectable island size.** Four presets — **Small (10×10)**, **Medium
  (14×14, default)**, **Large (20×20)**, and **Extra-Large (26×26)** — let
  players pick how much room they have to build.
- **Selectable island shapes (11).** Beyond the default full island, players
  can shape their world as **Square, Rectangle, L-Shape, Ring, C-Shape,
  Diamond, Cross, Round, Archipelago,** or **Teardrop**. Size and shape combine
  freely — any shape works at any size.

### Changed
- **Renamed the application to "The Islander"** (previously "Mykonos Island
  Voxels"). Mykonos is now positioned as the default *theme* rather than the
  product name.
- **Smart resizing.** Shrinking the island or switching to a smaller shape
  automatically removes anything left off the new coastline, with an on-screen
  message confirming how many items were cleared. Existing builds that still
  fit are preserved.
- **Saves now record the active theme and island shape**, so reopening a
  project restores the exact look and layout. Older saves open safely and
  default to the full Mykonos island.

### Designed
- **New "Island size / shape" controls** added to the on-screen HUD, styled to
  match the existing panel language (cream surfaces, cobalt highlights).
- **Theme switcher** placed at the top of the asset palette, above the category
  tabs, for a consistent, discoverable location.
- **Island-in-water rendering.** Land renders as the cream slab and every
  unoccupied cell is filled with sea, so shapes read as real islands — a Ring's
  hollow center becomes a lagoon, an Archipelago's channels become open water.
  A Full island is unchanged (no unoccupied cells means no water).

### Known limitations
- The **Nordic** theme currently reuses the Mykonos artwork as a placeholder,
  so the two themes look alike today. The switching experience is complete;
  bespoke Nordic art is a follow-up.
- Size and shape controls live in the desktop HUD, which is hidden on small
  mobile screens (consistent with the existing HUD behavior).

---

## [0.1.0] — Initial release

- First playable build of the isometric island builder: place and erase
  Mediterranean voxel assets on a 14×14 grid, pan/zoom the camera, toggle grid
  and shadows, and save to the browser. Deployed via Netlify and GitHub Pages.
