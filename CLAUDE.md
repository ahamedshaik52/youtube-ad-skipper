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

## How the skip works

1. `MutationObserver` is scoped to `#movie_player` and fires on any DOM/attribute change
2. Debounced 80ms → `evaluate()` checks two layers:
   - `html.classList.contains('ad-showing')` (YouTube sets this during ads)
   - Presence of any `AD_SELECTORS` element
3. If an ad is playing, `findSkipButton()` searches `SKIP_SELECTORS` in priority order
4. Countdown text ("Skip in 5") is filtered via `COUNTDOWN_PATTERNS` — button must be in clickable state
5. **Primary skip method**: `trySeekSkip()` — sets `video.currentTime = video.duration - 0.1` on `#movie_player video`. This bypasses the `isTrusted` restriction that blocks synthetic click events.
6. **Fallback**: full pointer+mouse event chain dispatched on the button element
7. 1 second after skip: `verifySkip()` confirms ad stopped; only then increments counter
8. On confirmed skip: immediately calls `evaluate()` again to catch consecutive ads (Ad 1 of 2 → Ad 2 of 2)

## Why seek-skip instead of click

YouTube's skip button handler checks `event.isTrusted`. Events created with `new MouseEvent()` from a content script always have `isTrusted: false` and are silently rejected. Setting `video.currentTime` is a plain DOM property assignment — no event, no trust check.

## Key constants (constants.js)

| Constant | Default | Purpose |
|----------|---------|---------|
| `SKIP_SELECTORS` | array | CSS selectors for the skip button, tried in order |
| `COUNTDOWN_PATTERNS` | regex array | Text patterns that mean "not yet clickable" |
| `AD_SELECTORS` | array | Selectors that confirm an ad is playing |
| `CLICK_DELAY_MS` | 300 | Wait before firing skip (mimics human reaction) |
| `CLICK_COOLDOWN_MS` | 4000 | Block re-clicking after a failed attempt |
| `CLICK_VERIFY_DELAY_MS` | 2000 | Wait before verifying skip succeeded |
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
