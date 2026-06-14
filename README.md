# YouTube Ad Skipper

> A lightweight, zero-dependency Chrome/Edge browser extension that automatically clicks the **Skip Ad** button on YouTube within 3 seconds of it appearing — silently, in the background, every time.

---

## Features

- **Instant skip** — detects the Skip Ad button via `MutationObserver` and clicks it in ~500 ms
- **Two-layer detection** — checks `html.ad-showing` + DOM selectors, then text-based fallback
- **SPA-aware** — re-attaches automatically when you navigate between YouTube videos
- **ON/OFF toggle** — enable or disable from the toolbar popup; state persists across sessions
- **Session counter** — popup shows how many ads were skipped since you opened the browser
- **Zero data collection** — no network requests, no analytics, no external services
- **Minimal permissions** — only `storage` + `*.youtube.com` host permission

---

## Screenshots

| Observer attached & skipping | Popup UI |
|---|---|
| Console shows `[YTSkipper] Observer attached to #movie_player.` and `Ad skipped!` | Toggle ON/OFF, view session skip count |

---

## Installation (Chrome / Edge)

> No build step, no npm, no dependencies required.

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/ahamedshaik52/youtube-ad-skipper.git
   ```

2. Open your browser and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`

3. Enable **Developer Mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `youtube-ad-skipper` folder

5. The extension icon appears in your toolbar — **done**

> Pin the icon via the puzzle-piece menu for quick access to the toggle.

---

## Installation (Firefox — via Tampermonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Firefox
2. Open `userscript/youtube-ad-skipper.user.js` from this repo
3. Tampermonkey prompts you to install — click **Install**
4. Done. Auto-skip is active on every YouTube tab.

---

## Usage

| Action | How |
|--------|-----|
| Enable / Disable auto-skip | Click toolbar icon → flip the toggle |
| View session skip count | Click toolbar icon → see counter |
| Reset session count | Click toolbar icon → "Reset session count" |
| Verify it's working | Open YouTube → F12 → Console → look for `[YTSkipper]` logs |

---

## How It Works

```
Page loads
    │
    ▼
Content script injects into youtube.com
    │
    ▼
Reads enabled/disabled state from chrome.storage.local
    │
    ▼
Attaches MutationObserver to #movie_player
    │
    ▼ (on every DOM mutation)
Layer 1: Is html.ad-showing class present?
    │  YES ──► Layer 2: Is .ytp-skip-ad-button visible?
    │                       │  YES ──► Wait 500ms ──► click()
    │                       │                              │
    │                       │  NO  ──► (keep watching)    │
    │                                                      ▼
    │  NO  ──► (keep watching)               [YTSkipper] Ad skipped! ✓
    │
    ▼
On yt-navigate-finish (SPA nav) ──► re-attach observer to new player
```

---

## Project Structure

```
youtube-ad-skipper/
│
├── manifest.json              # Extension manifest (Manifest V3)
├── constants.js               # All CSS selectors & timing values (update here on YouTube UI changes)
├── content.js                 # Core logic: MutationObserver, detection, auto-click
│
├── popup/
│   ├── popup.html             # Toggle UI
│   ├── popup.css              # Dark-themed styles
│   └── popup.js               # Toggle ↔ storage sync + live counter
│
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
│
├── userscript/
│   └── youtube-ad-skipper.user.js   # Firefox / Tampermonkey equivalent
│
└── CHANGELOG.md               # Version history + selector update guide
```

---

## Skip Button Selectors

All selectors live in `constants.js` and are tried in priority order:

| Priority | Selector | Notes |
|----------|----------|-------|
| 1 | `.ytp-skip-ad-button` | Primary — stable since ~2018 |
| 2 | `.ytp-ad-skip-button-modern` | Modern YouTube UI variant |
| 3 | `.ytp-ad-skip-button-slot button` | Slot-container selector |
| 4 | `.ytp-ad-skip-button-container button` | Container variant |
| 5 | `.videoAdUiSkipButton` | Legacy fallback |
| 6 | Text-based fallback | Any `button` inside `#movie_player` containing "skip" |

---

## Maintenance

When YouTube updates their UI and skipping stops working:

1. Open YouTube with an ad playing
2. Press **F12 → Elements** → click the Inspector icon → click the Skip Ad button
3. Note the class names on the highlighted element
4. Update `SKIP_SELECTORS` in `constants.js`
5. Bump the version in `manifest.json`
6. Go to `chrome://extensions` → click **⟳ Refresh** on the extension card
7. Add an entry to `CHANGELOG.md`

---

## Security & Privacy

- **No network requests** — the extension never calls any external URL
- **No data collection** — nothing is tracked, logged externally, or transmitted
- **Minimal permissions** — `storage` (for the ON/OFF toggle) + `*.youtube.com` only
- **Sandboxed** — runs entirely inside your browser's content script sandbox
- **Open source** — every line of code is visible here

---

## Legal Note

This extension is for **personal use only** and is not published on the Chrome Web Store.

It does **not** block ads (the initial mandatory 5-second view still plays). It only automates the Skip button click that is already available to users — the same action as pressing it manually.

For a fully ad-free experience, consider [YouTube Premium](https://www.youtube.com/premium).

---

## Contributing

This is a personal-use tool. If you spot a broken selector after a YouTube update, open an issue with:
- The new selector you found in DevTools
- The YouTube player version (visible in `#movie_player`'s `data-version` attribute)

---

## License

[MIT](LICENSE) — free for personal use.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and selector update log.
