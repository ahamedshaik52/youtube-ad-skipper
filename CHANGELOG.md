# Changelog — YouTube Ad Skipper

All selector changes and version updates are recorded here.
When YouTube changes its UI and skipping breaks, update `constants.js` and add an entry below.

---

## [1.0.5] — 2026-07-12

### Changed — complete skip-engine rewrite for human-speed skipping

**Corrected diagnosis from v1.0.4**
- The "ad page" seen after skipping was YouTube's in-player static END CARD, not the advertiser's website — no navigation ever happened
- The real problem: seek-only skipping let the ad "complete", which shows the end card and dwells there; combined with the 4-second cooldown and the 300ms click delay, skipping felt much slower than a human click

**New strategy (both methods fire together, retry every 500ms):**
1. Click the Skip button the moment it exists via plain `element.click()` — dispatches directly to that element only (no coordinates), exactly like a human click, cannot hit the ad
2. Seek the ad video to its end simultaneously — kills the ad even DURING the 5s countdown before the skip button appears, and handles unskippable ads
3. While the player stays in ad state (end card, "Ad 2 of 2" pods), re-attempt every 500ms — no more 4-second dead time

**Safety improvement**
- Seeking is now gated strictly on the player's `ad-showing` class (`#movie_player.ad-showing`) — the extension can never seek the actual video
- Removed `AD_SELECTORS` presence check (`.ytp-ad-module` exists even with no ad → false positives)

**Counting**
- One ad break (pod of 1–2 ads) now counts as ONE skip, incremented only after the player fully exits ad state

### Removed
- 300ms `CLICK_DELAY_MS` pre-click wait (instant action instead)
- 4000ms `CLICK_COOLDOWN_MS` (replaced by 500ms `ATTEMPT_INTERVAL_MS` throttle)
- `AD_SELECTORS` array (unsafe ad detection)
- Overlay banner ads still handled: `.ytp-ad-overlay-close-button` clicked directly

---

## [1.0.4] — 2026-07-12

### Fixed

**Bug — Extension was clicking the ad, not the skip button (ad URL opened instead of skipping)**
- Root cause: `new MouseEvent('click', {clientX, clientY})` dispatches events at screen coordinates
- YouTube's ad overlay sits on top of the skip button and intercepts ALL coordinate-based pointer/mouse events before they reach the skip button
- This registered every skip attempt as an "ad click" → navigated to the advertiser's URL
- Fix: removed the entire synthetic MouseEvent dispatch chain from `performClick()`

**Removed — dangerous synthetic mouse event chain**
- `pointerover`, `pointerenter`, `mouseover`, `mouseenter`, `pointermove`, `mousemove`, `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click` dispatched at button coordinates → DELETED
- These events were the cause of accidental ad navigation

**Kept — safe skip methods only**
- `trySeekSkip()`: sets `video.currentTime = video.duration - 0.1` (no events, no coordinates, no overlay intercept)
- Overlay/banner ads: direct `btn.click()` with no coordinates (only used for `.ytp-ad-overlay-close-button`)
- `video.paused` check removed from `trySeekSkip()` — seek works even while buffering

### Changed
- `trySeekSkip()` no longer requires `!video.paused` — works during buffering too
- Added `isOverlayAd()` logic inline to distinguish banner-close from video-skip

---

## [1.0.3] — 2026-06-23

### Fixed

**Root cause: YouTube ignores synthetic click events (`isTrusted: false`)**
- `new MouseEvent()` and `.click()` dispatched from a content script always have `isTrusted: false`
- YouTube's modern skip button handler checks `event.isTrusted` and silently rejects synthetic events
- This caused the button to be found correctly but the click to have no effect

**Fix 1 — `trySeekSkip()`: seek the video to its end (primary skip method)**
- `HTMLVideoElement.currentTime` is a plain DOM property — no event dispatch, no `isTrusted` check
- `video.currentTime = video.duration - 0.1` immediately ends the ad and triggers the next item
- Called first in `performClick()` before the synthetic click fallback

**Fix 2 — Extension context invalidated error**
- When the extension is reloaded while a YouTube tab is open, the old content script becomes orphaned
- Calling `chrome.storage.local.*` on an orphaned script throws "Extension context invalidated"
- Added `isContextValid()` guard and `safeStorageGet()` / `safeStorageSet()` wrappers
- Also added upfront runtime guard at IIFE start — orphaned scripts now exit immediately

### Changed
- `CLICK_VERIFY_DELAY_MS` increased from 1000ms to 2000ms (gives player more time to clear ad state)
- `performClick()` now calls `trySeekSkip()` first, then falls back to synthetic click chain

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
