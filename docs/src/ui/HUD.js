/**
 * HUD.js
 *
 * Bottom-right HUD: clock + toggles for ambient occlusion / grid / borders.
 */

import { playUiClick } from './Audio.js';
import { CONFIG } from '../config.js';
import { ISLAND_SHAPES } from '../grid/islandShapes.js';

export class HUD {
    constructor(game) {
        this.game = game;
        this.timeEl    = document.getElementById('hud-time');
        this.aoToggle  = document.getElementById('toggle-ao');
        this.gridToggle= document.getElementById('toggle-grid');
        this.bordersToggle = document.getElementById('toggle-borders');
        this.sizeEl    = document.getElementById('hud-size');
        this.shapeEl   = document.getElementById('hud-shape');
        this.sizeButtons = new Map();

        this.aoToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.ambientOcclusion = this.aoToggle.checked;
            game.renderer.markDirty();
        });
        this.gridToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.showGrid = this.gridToggle.checked;
            game.renderer.markDirty();
            game.toolbar?.update();
        });
        this.bordersToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.showBorders = this.bordersToggle.checked;
            game.renderer.markDirty();
        });

        this._buildWorldControls();
        this.syncWorld();

        this._tick();
        setInterval(() => this._tick(), 30000);
    }

    _buildWorldControls() {
        if (this.sizeEl) {
            this.sizeEl.innerHTML = '';
            for (const p of CONFIG.grid.presets) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'seg-btn';
                btn.textContent = p.name;
                btn.dataset.preset = p.id;
                btn.title = `${p.size}×${p.size}`;
                btn.addEventListener('click', () => {
                    playUiClick();
                    this.game.setGridSize(p.id);
                });
                this.sizeEl.appendChild(btn);
                this.sizeButtons.set(p.id, btn);
            }
        }
        if (this.shapeEl) {
            this.shapeEl.innerHTML = '';
            for (const s of ISLAND_SHAPES) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                this.shapeEl.appendChild(opt);
            }
            this.shapeEl.addEventListener('change', () => {
                playUiClick();
                this.game.setIslandShape(this.shapeEl.value);
            });
        }
    }

    _tick() {
        // Animated golden-hour clock for atmosphere.
        const d = new Date();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        if (this.timeEl) this.timeEl.textContent = `${hh}:${mm}`;
    }

    syncToggles() {
        this.gridToggle.checked = this.game.renderer.showGrid;
        this.aoToggle.checked   = this.game.renderer.ambientOcclusion;
        this.bordersToggle.checked = this.game.renderer.showBorders;
    }

    /** Reflect the world's current size preset + shape in the controls. */
    syncWorld() {
        const tm = this.game.tileMap;
        const preset = CONFIG.grid.presets.find(p => p.size === tm.width);
        for (const [id, btn] of this.sizeButtons) {
            btn.classList.toggle('active', !!preset && id === preset.id);
        }
        if (this.shapeEl) this.shapeEl.value = tm.shape;
    }
}
