/**
 * Music.js
 *
 * Background music track. Deliberately separate from the WebAudio SFX bus
 * in `Audio.js` — this is a single long, looping clip driven by a plain
 * HTMLAudioElement, not a debounced one-shot effect.
 *
 * Playback is attempted as soon as the app finishes loading. Browsers block
 * autoplay until the user has interacted with the page, so if that first
 * `play()` is rejected we arm a one-shot listener and start on the first
 * gesture instead. The title-card button toggles play/pause and reflects the
 * current state (its `.playing` class controls both colour and glyph).
 */

export function initMusic({ audioEl, buttonEl, volume = 0.35 }) {
    if (!audioEl || !buttonEl) return;

    audioEl.volume = volume;

    // The user's explicit intent. Starts true (we want music on load); a
    // manual pause sets it false so a later stray gesture won't restart it.
    let wantPlaying = true;

    const reflect = () => {
        const playing = !audioEl.paused;
        buttonEl.classList.toggle('playing', playing);
        buttonEl.setAttribute('aria-pressed', String(playing));
        buttonEl.setAttribute('aria-label',
            playing ? 'Pause background music' : 'Play background music');
    };

    const tryPlay = () => {
        const p = audioEl.play();
        // Older browsers return undefined; modern ones return a promise that
        // rejects when autoplay is blocked. Either way, reflect the outcome.
        if (p && typeof p.catch === 'function') p.catch(() => reflect());
    };

    // Start as soon as the app is ready.
    tryPlay();

    // If autoplay was blocked, the first interaction anywhere kicks it off —
    // but only while the user still wants music playing.
    const onFirstGesture = () => {
        if (wantPlaying && audioEl.paused) tryPlay();
        removeEventListener('pointerdown', onFirstGesture);
        removeEventListener('keydown', onFirstGesture);
    };
    addEventListener('pointerdown', onFirstGesture);
    addEventListener('keydown', onFirstGesture);

    buttonEl.addEventListener('click', () => {
        if (audioEl.paused) { wantPlaying = true; tryPlay(); }
        else { wantPlaying = false; audioEl.pause(); }
    });

    // Keep the button in sync no matter how state changed (autoplay success,
    // manual toggle, or media-key / OS interruption).
    audioEl.addEventListener('play', reflect);
    audioEl.addEventListener('pause', reflect);
    reflect();
}
