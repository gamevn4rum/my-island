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

        // Theme-switch loading popup (streams a theme's art in on demand).
        this.themeLoading       = document.getElementById('theme-loading');
        this.themeLoadingName   = document.getElementById('theme-loading-name');
        this.themeLoadingFill   = document.getElementById('theme-loading-fill');
        this.themeLoadingStatus = document.getElementById('theme-loading-status');

        // The Controls cheatsheet is a native <details> disclosure: clicking
        // the summary toggles it. Wire the same UI click sound to that
        // toggle so it feels consistent with the toolbar / palette / HUD.
        const ins = document.getElementById('instructions');
        if (ins) {
            ins.addEventListener('toggle', () => playUiClick());
        }

        // Screenshot button (next to the music player in the title card):
        // capture the island canvas — no grid, no HUD, no menu — and open a
        // preview modal where you can copy it to the clipboard or download it.
        this.shotModal    = document.getElementById('shot-modal');
        this.shotImage    = document.getElementById('shot-image');
        this.shotCopyBtn  = document.getElementById('shot-copy');
        this.shotDownload = document.getElementById('shot-download');
        this._shotUrl     = null;

        const shot = document.getElementById('screenshot-btn');
        if (shot) {
            shot.addEventListener('click', () => {
                playUiClick();
                this.openScreenshot();
            });
        }
        this._wireScreenshotModal();

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
     * Capture the current island as a JPEG and open the preview modal. The DOM
     * chrome (title card, toolbar, palette, HUD, controls) is never part of the
     * canvas, so it's excluded automatically; the renderer additionally drops
     * the grid and cursor preview for the capture.
     */
    openScreenshot() {
        const url = this.game.renderer.captureJPEG();
        this._shotUrl = url;
        if (this.shotImage) this.shotImage.src = url;
        if (this.shotModal) this.shotModal.classList.remove('hidden');
    }

    closeScreenshot() {
        if (this.shotModal) this.shotModal.classList.add('hidden');
    }

    /* Wire the preview modal's buttons, backdrop, and Escape key. Called once
     * from the constructor; the buttons operate on the currently shown shot. */
    _wireScreenshotModal() {
        if (!this.shotModal) return;

        this.shotModal.querySelectorAll('[data-shot-close]').forEach(el => {
            el.addEventListener('click', () => {
                playUiClick();
                this.closeScreenshot();
            });
        });

        this.shotCopyBtn?.addEventListener('click', () => {
            playUiClick();
            this._copyScreenshot();
        });
        this.shotDownload?.addEventListener('click', () => {
            playUiClick();
            this._downloadScreenshot();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.shotModal.classList.contains('hidden')) {
                this.closeScreenshot();
            }
        });
    }

    _downloadScreenshot() {
        if (!this._shotUrl) return;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const a = document.createElement('a');
        a.href = this._shotUrl;
        a.download = `the-islander-${stamp}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        this.showToast('Screenshot saved');
    }

    async _copyScreenshot() {
        // The Clipboard API only reliably takes PNG for images, so re-encode
        // the (already background-flattened) shot as a PNG blob before writing.
        try {
            if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
                throw new Error('clipboard unsupported');
            }
            const blob = await this._shotPngBlob();
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            this._flashButton(this.shotCopyBtn, 'Copied');
            this.showToast('Copied to clipboard');
        } catch (err) {
            console.error(err);
            this.showToast('Copy unavailable — try Download');
        }
    }

    _shotPngBlob() {
        return new Promise((resolve, reject) => {
            const img = this.shotImage;
            if (!img || !img.naturalWidth) return reject(new Error('no screenshot'));
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png');
        });
    }

    /* Briefly swap a button's label to confirm an action, then restore it. */
    _flashButton(btn, label) {
        if (!btn) return;
        const span = btn.querySelector('span');
        const original = span ? span.textContent : null;
        if (span) span.textContent = label;
        btn.classList.add('is-done');
        clearTimeout(this._shotFlashTimer);
        this._shotFlashTimer = setTimeout(() => {
            if (span && original != null) span.textContent = original;
            btn.classList.remove('is-done');
        }, 1400);
    }

    /* ── Theme-switch loading popup ──────────────────────────────
     * Mirrors the boot loader's progress UI, but as a compact modal
     * shown only while a theme's art streams in on switch. Driven by
     * Game.setTheme via the onProgress callback of ensureThemesLoaded.
     */
    showThemeLoading(themeName) {
        if (!this.themeLoading) return;
        if (this.themeLoadingName) this.themeLoadingName.textContent = themeName;
        if (this.themeLoadingFill) this.themeLoadingFill.style.width = '0%';
        if (this.themeLoadingStatus) this.themeLoadingStatus.textContent = 'preparing assets';
        this.themeLoading.classList.remove('hidden');
    }

    updateThemeLoading(p, label) {
        if (!this.themeLoading) return;
        if (this.themeLoadingFill) this.themeLoadingFill.style.width = `${Math.round(p * 100)}%`;
        if (label && this.themeLoadingStatus) this.themeLoadingStatus.textContent = `crafting ${label}…`;
    }

    async hideThemeLoading() {
        if (!this.themeLoading) return;
        if (this.themeLoadingFill) this.themeLoadingFill.style.width = '100%';
        if (this.themeLoadingStatus) this.themeLoadingStatus.textContent = 'ready';
        // Let the bar finish its sweep before dismissing — feels nicer.
        await new Promise(r => setTimeout(r, 220));
        this.themeLoading.classList.add('hidden');
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
