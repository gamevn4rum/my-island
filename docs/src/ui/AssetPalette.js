/**
 * AssetPalette.js
 *
 * Right-side palette, split into two stacked sections:
 *   - Themed (top): a theme switcher + tabs for Buildings / Water / Props.
 *     Its swatches swap with the active theme.
 *   - Neutral (bottom): tabs for Terrain / Nature, drawn from the shared,
 *     theme-independent set — unaffected by the theme switcher.
 *
 * Each section keeps its own active sub-tab and renders its own swatch grid;
 * the two grids are visible at once. The *selection* (game.selectedAssetId)
 * is global and may live in either grid — `update()` highlights it wherever
 * it is. Each swatch shows the asset's generated bitmap.
 */

import {
    THEMES,
    THEMED_CATEGORIES,
    NEUTRAL_CATEGORIES,
    assetsForCategory,
} from '../assets/assetManifest.js';
import { allAssets } from '../assets/assetLoader.js';
import { playUiClick } from './Audio.js';

export class AssetPalette {
    constructor(themesEl, tabsEl, gridEl, neutralTabsEl, neutralGridEl, game) {
        this.themesEl = themesEl;
        this.game = game;
        this.themeButtons = new Map();

        // Two independent sections. Each tracks which of its categories is
        // currently shown in its grid, plus its tab/grid DOM handles.
        this.sections = {
            themed: {
                categories: THEMED_CATEGORIES,
                active: THEMED_CATEGORIES[0],   // 'buildings'
                tabsEl, gridEl,
                tabButtons: new Map(),
            },
            neutral: {
                categories: NEUTRAL_CATEGORIES,
                active: NEUTRAL_CATEGORIES[0],   // 'terrain'
                tabsEl: neutralTabsEl,
                gridEl: neutralGridEl,
                tabButtons: new Map(),
            },
        };

        this._buildThemes();
        for (const section of Object.values(this.sections)) {
            this._buildTabs(section);
            this._renderGrid(section);
        }

        // If the game's initial selection lands in a section, surface its
        // category as that section's active tab.
        this._syncActiveFromSelection();
        this.update();
    }

    _buildThemes() {
        this.themesEl.innerHTML = '';
        for (const t of THEMES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-btn';
            btn.textContent = t.name;
            btn.dataset.theme = t.id;
            btn.addEventListener('click', () => {
                playUiClick();
                this.game.setTheme(t.id);
            });
            this.themesEl.appendChild(btn);
            this.themeButtons.set(t.id, btn);
        }
    }

    _buildTabs(section) {
        section.tabsEl.innerHTML = '';
        section.tabButtons.clear();
        for (const c of section.categories) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            btn.textContent = c[0].toUpperCase() + c.slice(1);
            btn.addEventListener('click', () => {
                playUiClick();
                section.active = c;
                this._renderGrid(section);
                this.game.setCategory(c);
            });
            section.tabsEl.appendChild(btn);
            section.tabButtons.set(c, btn);
        }
    }

    /** Absolute ids of the swatches this section should currently show. */
    _expectedIds(section) {
        return assetsForCategory(section.active, this.game.theme).map(a => a.id);
    }

    _renderGrid(section) {
        section.gridEl.innerHTML = '';
        const generated = allAssets();
        const items = assetsForCategory(section.active, this.game.theme);
        for (const def of items) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'swatch';
            swatch.dataset.assetId = def.id;

            const gen = generated[def.id];
            if (gen) {
                const img = document.createElement('canvas');
                const max = 56;
                const scale = Math.min(max / gen.width, max / gen.height, 2);
                img.width  = Math.ceil(gen.width  * scale);
                img.height = Math.ceil(gen.height * scale);
                const ctx = img.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(gen.canvas, 0, 0, img.width, img.height);
                swatch.appendChild(img);
            }

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = def.name;
            swatch.appendChild(name);

            swatch.addEventListener('click', () => {
                playUiClick();
                this.game.selectAsset(def.id);
            });
            section.gridEl.appendChild(swatch);
        }
    }

    /** Point each section's active tab at the current selection's category. */
    _syncActiveFromSelection() {
        const cat = this.game.category;
        for (const section of Object.values(this.sections)) {
            if (section.categories.includes(cat) && section.active !== cat) {
                section.active = cat;
                this._renderGrid(section);
            }
        }
    }

    update() {
        for (const [id, btn] of this.themeButtons) {
            btn.classList.toggle('active', id === this.game.theme);
        }

        this._syncActiveFromSelection();

        for (const section of Object.values(this.sections)) {
            // Re-render only when the visible asset set changed — a theme
            // switch changes the themed grid's ids; the neutral grid never
            // changes on theme switch (shared set), so it stays put.
            const visibleIds = Array.from(section.gridEl.querySelectorAll('.swatch'))
                .map(el => el.dataset.assetId);
            const expectedIds = this._expectedIds(section);
            const sameSet = visibleIds.length === expectedIds.length
                && visibleIds.every((id, i) => id === expectedIds[i]);
            if (!sameSet) this._renderGrid(section);

            for (const [c, btn] of section.tabButtons) {
                btn.classList.toggle('active', c === section.active);
            }
            for (const sw of section.gridEl.querySelectorAll('.swatch')) {
                sw.classList.toggle('selected', sw.dataset.assetId === this.game.selectedAssetId);
            }
        }
    }
}
