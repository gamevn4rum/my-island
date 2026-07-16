/**
 * UIManager.js
 *
 * Aggregates all DOM-driven UI subsystems and toast feedback.
 */

import { Toolbar } from './Toolbar.js';
import { AssetPalette } from './AssetPalette.js';
import { HUD } from './HUD.js';
import { playUiClick } from './Audio.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.toolbar = new Toolbar(document.getElementById('toolbar'), game);
        this.palette = new AssetPalette(
            document.getElementById('palette-themes'),
            document.getElementById('palette-tabs'),
            document.getElementById('palette-grid'),
            document.getElementById('palette-neutral-tabs'),
            document.getElementById('palette-neutral-grid'),
            game,
        );
        this.hud = new HUD(game);
        this.toast = document.getElementById('toast');

        // The Controls cheatsheet is a native <details> disclosure: clicking
        // the summary toggles it. Wire the same UI click sound to that
        // toggle so it feels consistent with the toolbar / palette / HUD.
        const ins = document.getElementById('instructions');
        if (ins) {
            ins.addEventListener('toggle', () => playUiClick());
        }

        // Screenshot button (next to the music player in the title card):
        // capture the island canvas — no grid, no HUD, no menu — as a JPEG
        // and trigger a download.
        const shot = document.getElementById('screenshot-btn');
        if (shot) {
            shot.addEventListener('click', () => {
                playUiClick();
                this.captureScreenshot();
            });
        }

        // Expose for sibling modules
        game.toolbar = this.toolbar;
        game.palette = this.palette;
        game.hud = this.hud;
    }

    update() {
        this.toolbar.update();
        this.palette.update();
    }

    /**
     * Capture the current island as a JPEG and download it. The DOM chrome
     * (title card, toolbar, palette, HUD, controls) is never part of the
     * canvas, so it's excluded automatically; the renderer additionally drops
     * the grid and cursor preview for the capture.
     */
    captureScreenshot() {
        const url = this.game.renderer.captureJPEG();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `the-islander-${stamp}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        this.showToast('Screenshot saved');
    }

    showToast(text, ms = 1600) {
        this.toast.textContent = text;
        this.toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('show');
        }, ms);
    }
}
