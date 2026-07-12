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
  '.videoAdUiSkipButton'
];

// Regex patterns that identify countdown text — button is NOT yet clickable.
// Any element whose text matches one of these should be skipped.
const COUNTDOWN_PATTERNS = [
  /skip\s+(?:ad\s+)?in\s+\d/i,   // "Skip in 5" | "Skip Ad in 5"
  /will\s+end\s+in/i,             // "Ad will end in 3"
  /video\s+will\s+play\s+in/i,   // "Video will play in 5"
  /^\d+$/,                        // bare digit only
];

// The YouTube player container — observer is scoped to this element.
// The player carries the `ad-showing` class while any ad is playing.
const PLAYER_SELECTOR = '#movie_player';

// ---- Timing ----------------------------------------------------------------

// Minimum gap (ms) between skip attempts while an ad is on screen.
// Low = reacts fast to end cards and "Ad 2 of 2" pods without hammering the CPU.
const ATTEMPT_INTERVAL_MS = 500;

// How long after a skip attempt to recheck whether the ad state cleared.
// If still in ad state, another attempt fires; if clear, the counter increments.
const CLICK_VERIFY_DELAY_MS = 1200;

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
