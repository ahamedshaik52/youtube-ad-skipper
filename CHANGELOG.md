# Changelog — YouTube Ad Skipper

All selector changes and version updates are recorded here.
When YouTube changes its UI and skipping breaks, update `constants.js` and add an entry below.

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
