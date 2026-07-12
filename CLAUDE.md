# CLAUDE.md — YouTube Ad Skipper

Chrome Manifest V3 extension that automatically skips YouTube ads without user interaction.

## Project structure

```
youtube-ad-skipper/
├── manifest.json          # Extension identity, permissions, content script registration
├── constants.js           # ALL selectors and timing values — edit this file only when YouTube changes UI
├── content.js             # Core skip logic injected into every youtube.com tab
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark YouTube-themed styles
│   └── popup.js           # Reads/writes chrome.storage.local; live counter via onChanged
├── icons/                 # PNG icons at 16, 32, 48, 128px
├── userscript/            # Tampermonkey version for Firefox
└── CHANGELOG.md           # Version history — always update when bumping version
```

## How the skip works (v1.0.5 engine)

1. `MutationObserver` is scoped to `#movie_player` and fires on any DOM/attribute change
2. Debounced 80ms → `evaluate()` gates on the strict ad signal: `#movie_player.ad-showing` class (never seek outside this state)
3. `attemptSkip()` fires BOTH methods together, throttled to one attempt per 500ms:
   - **Click**: `findSkipButton()` searches `SKIP_SELECTORS`; if a clickable (non-countdown) button exists → plain `btn.click()`. No coordinates, dispatches only to that element — behaves like a human click, can never hit the ad.
   - **Seek**: `video.currentTime = video.duration` on the ad video — works even during the 5s countdown before the button appears, and on unskippable ads.
4. `scheduleVerify()` rechecks 1.2s later: still in ad state (end card / "Ad 2 of 2" pod) → loop back and attempt again; ad state cleared → count ONE skip for the whole ad break.
5. Overlay banner ads (during normal playback, no `ad-showing` class): `.ytp-ad-overlay-close-button` clicked directly in `evaluate()`.

## Hard-won lessons (do not regress)

- **Never dispatch synthetic MouseEvents with coordinates** (`clientX/clientY` chains). Historically caused confusion and adds no value; plain `element.click()` + seek covers everything.
- **Never gate seeking on loose selectors** like `.ytp-ad-module` — that element exists even with no ad, and a false positive would seek the user's actual video. Only trust `#movie_player.ad-showing`.
- **The "ad page" after a seek-skip is YouTube's in-player end card**, not the advertiser's site. Dismiss it by re-attempting (click Skip on the end card) every 500ms until `ad-showing` clears.
- **No long cooldowns.** A 4s cooldown between attempts made the extension feel slower than a human. 500ms throttle is the right balance.

## Key constants (constants.js)

| Constant | Default | Purpose |
|----------|---------|---------|
| `SKIP_SELECTORS` | array | CSS selectors for the skip button, tried in order |
| `COUNTDOWN_PATTERNS` | regex array | Text patterns that mean "not yet clickable" |
| `ATTEMPT_INTERVAL_MS` | 500 | Min gap between skip attempts during ad state |
| `CLICK_VERIFY_DELAY_MS` | 1200 | Recheck delay after an attempt (retry or count) |
| `OBSERVER_DEBOUNCE_MS` | 80 | Debounce for MutationObserver callbacks |

## When YouTube breaks the extension

YouTube periodically renames CSS classes. When skipping stops working:

1. Open YouTube with an ad playing → F12 → Elements tab
2. Click the inspector crosshair, click the Skip Ad button
3. Note the class names on the highlighted element
4. Update `SKIP_SELECTORS` in `constants.js`
5. Bump patch version in `manifest.json` and `popup/popup.html`
6. Add entry to `CHANGELOG.md`
7. Commit and push

**Never edit `content.js` just to update selectors — all selector changes go in `constants.js`.**

## Version bump checklist

- [ ] `manifest.json` → `"version": "x.y.z"`
- [ ] `popup/popup.html` → footer `vx.y.z`
- [ ] `CHANGELOG.md` → new section at top

## Chrome storage keys

| Key | Type | Purpose |
|-----|------|---------|
| `ytSkipperEnabled` | boolean | ON/OFF toggle state |
| `ytSkipperCount` | number | Session skip counter |

## Development workflow

```
# After editing any file:
1. chrome://extensions → click ⟳ reload on the extension card
2. Refresh the YouTube tab (required — old content script stays alive until tab refresh)
3. F12 → Console → watch for [YTSkipper] log lines

# Push to GitHub:
cd C:/Users/ahame/youtube-ad-skipper
git add <files>
git commit -m "fix: description"
git push origin main
```

## Debugging console output

| Message | Meaning |
|---------|---------|
| `Observer attached to #movie_player` | Script loaded, watching for ads |
| `Countdown still running: "Skip in 5"` | Waiting for button to become clickable |
| `Seek-skip: 3.1s → 29.9s` | Skip fired via currentTime seek |
| `SUCCESS: Ad skipped!` | Ad confirmed stopped, counter incremented |
| `WARN: Ad still playing after skip attempt` | Cooldown active, will retry after 4s |
| `Extension was reloaded. Please refresh this YouTube tab` | Orphaned content script — refresh the tab |

## GitHub repo

https://github.com/ahamedshaik52/youtube-ad-skipper
