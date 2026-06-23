# Changelog — YouTube Ad Skipper

All selector changes and version updates are recorded here.
When YouTube changes its UI and skipping breaks, update `constants.js` and add an entry below.

---

## [1.0.2] — 2026-06-23

### Fixed

**Bug 1 — Counter incremented without verifying the skip worked**
- `sessionCount++` now only runs inside `verifySkip()` after confirming `isAdPlaying()` returns false
- Previously the counter went up on every click attempt regardless of outcome

**Bug 2 — Simple `.click()` insufficient for YouTube's modern player**
- YouTube's skip button uses `<div role="button">` in the modern UI and listens to `pointerdown`/`mousedown` events, not just `click`
- `performClick()` now fires the full event chain: `pointerover → pointerenter → pointermove → pointerdown → mousedown → pointerup → mouseup → click`
- Also tries `.click()` and fires on the nearest `[role="button"]` ancestor as belt-and-suspenders

**Bug 3 — No cooldown after a failed click caused infinite retry loop**
- Added `clickCooldownUntil` timestamp; observer callbacks bail out while cooldown is active
- Cooldown is 4 seconds after every click attempt
- Cooldown resets to 0 immediately on a confirmed successful skip

**Bug 4 — Countdown state was not filtered; button clicked during "Skip in 5" countdown**
- Added `isCountdownText()` function with regex patterns for "Skip in 5", "Ad will end in", "Video will play in"
- `findSkipButton()` calls `isCountdownText()` on every candidate and skips non-clickable states
- Added `COUNTDOWN_PATTERNS` array to `constants.js` for easy future updates

**Bug 5 — Text fallback only searched `<button>`, missed `<div role="button">`**
- Fallback now queries `button, [role="button"], .ytp-button` inside `#movie_player`

### Changed
- `CLICK_DELAY_MS` reduced from 500ms to 300ms (faster skip, still safe)
- `OBSERVER_DEBOUNCE_MS` increased from 50ms to 80ms (reduces observer callback frequency)
- Added `CLICK_COOLDOWN_MS = 4000` and `CLICK_VERIFY_DELAY_MS = 1000` to `constants.js`
- Added `COUNTDOWN_PATTERNS` array to `constants.js`

---

## [1.0.0] — 2026-06-14

### Added
- Initial release
- MutationObserver-based skip button detection scoped to `#movie_player`
- Two-layer detection: ad-playing check (`html.ad-showing`) + skip button selector chain
- 500ms configurable delay before clicking (mimics human reaction time)
- SPA navigation re-attachment via `yt-navigate-finish` event
- Retry logic (up to 10 attempts) when `#movie_player` is not yet in DOM
- Popup UI with ON/OFF toggle, session skip counter, and reset button
- Persistent settings via `chrome.storage.local`
- Tampermonkey userscript version for Firefox

### Selectors in use
- `.ytp-skip-ad-button` (primary)
- `.ytp-ad-skip-button-modern`
- `.ytp-ad-skip-button-slot button`
- `.ytp-ad-skip-button-container button`
- `.videoAdUiSkipButton`
- Text-based fallback: button containing "skip" inside `#movie_player`

---

## Selector Update Guide

When skipping stops working:
1. Open YouTube with an ad playing
2. Press F12 → Elements tab
3. Click the Inspector icon (crosshair), click the Skip Ad button
4. Note the class names on the highlighted element
5. Add or update the entry in `constants.js` → `SKIP_SELECTORS` array
6. Bump the patch version in `manifest.json` (e.g. 1.0.0 → 1.0.1)
7. Add an entry in this file
8. Go to chrome://extensions → click the refresh icon on the extension
