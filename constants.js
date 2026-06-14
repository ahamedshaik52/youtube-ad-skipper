// ============================================================
// constants.js — All configurable values for YouTube Ad Skipper
// To update selectors after a YouTube UI change, edit THIS file only.
// ============================================================

// Skip button CSS selectors, tried in priority order (most specific first)
const SKIP_SELECTORS = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button-slot button',
  '.ytp-ad-skip-button-container button',
  '.videoAdUiSkipButton',
  '.ytp-ad-overlay-close-button'
];

// Selectors that confirm an ad is actively playing
const AD_SELECTORS = [
  '.ytp-ad-player-overlay',
  '.ytp-ad-module',
  '.ytp-ad-text'
];

// The YouTube player container — observer is scoped to this element
const PLAYER_SELECTOR = '#movie_player';

// ---- Timing ----------------------------------------------------------------
// How long to wait (ms) after detecting the skip button before clicking.
// 500ms mimics natural human reaction time and avoids click-handler init races.
const CLICK_DELAY_MS = 500;

// Debounce delay (ms) for MutationObserver callbacks to avoid rapid re-firing
const OBSERVER_DEBOUNCE_MS = 50;

// How long (ms) to wait before trying to re-attach the observer after SPA navigation
const SPA_REATTACH_DELAY_MS = 1200;

// How long (ms) to retry finding #movie_player if not yet in DOM on load
const PLAYER_RETRY_DELAY_MS = 500;

// Max times to retry attaching the observer before giving up (per page load)
const MAX_ATTACH_RETRIES = 10;

// ---- Storage keys ----------------------------------------------------------
const STORAGE_KEY_ENABLED = 'ytSkipperEnabled';
const STORAGE_KEY_COUNT   = 'ytSkipperCount';

// ---- Logging ---------------------------------------------------------------
const LOG_PREFIX = '[YTSkipper]';
