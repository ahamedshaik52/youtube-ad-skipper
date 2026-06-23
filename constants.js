// ============================================================
// constants.js — All configurable values for YouTube Ad Skipper
// To update selectors after a YouTube UI change, edit THIS file only.
// ============================================================

// Skip button CSS selectors, tried in priority order (most specific first).
// These target the actual interactive element, not countdown wrappers.
const SKIP_SELECTORS = [
  // Modern YouTube (2024-2026) — primary targets
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
  // Slot/container children
  '.ytp-ad-skip-button-slot .ytp-button',
  '.ytp-ad-skip-button-slot button',
  '.ytp-ad-skip-button-container .ytp-button',
  '.ytp-ad-skip-button-container button',
  // Legacy fallbacks
  '.videoAdUiSkipButton',
  '.ytp-ad-overlay-close-button'
];

// Regex patterns that identify countdown text — button is NOT yet clickable.
// Any element whose text matches one of these should be skipped.
const COUNTDOWN_PATTERNS = [
  /skip\s+(?:ad\s+)?in\s+\d/i,   // "Skip in 5" | "Skip Ad in 5"
  /will\s+end\s+in/i,             // "Ad will end in 3"
  /video\s+will\s+play\s+in/i,   // "Video will play in 5"
  /^\d+$/,                        // bare digit only
];

// Selectors that confirm an ad is actively playing
const AD_SELECTORS = [
  '.ytp-ad-player-overlay',
  '.ytp-ad-module',
  '.ytp-ad-text',
  '.ad-showing'   // class sometimes on <body> not just <html>
];

// The YouTube player container — observer is scoped to this element
const PLAYER_SELECTOR = '#movie_player';

// ---- Timing ----------------------------------------------------------------

// How long to wait (ms) after detecting the skip button before clicking.
const CLICK_DELAY_MS = 300;

// After a click attempt (successful or not), block further clicks for this many ms.
// Prevents the ad-countdown DOM update (fires every ~1 s) from re-triggering the loop.
const CLICK_COOLDOWN_MS = 4000;

// How long after a skip attempt to wait before checking whether the ad stopped.
// 2000ms gives the player time to fully transition out of ad state.
const CLICK_VERIFY_DELAY_MS = 2000;

// Debounce delay (ms) for MutationObserver callbacks to avoid rapid re-firing
const OBSERVER_DEBOUNCE_MS = 80;

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
