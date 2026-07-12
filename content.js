// ============================================================
// content.js — Core skip logic for YouTube Ad Skipper v1.0.4
// Injected into every youtube.com tab by the manifest.
// ============================================================

(function () {
  'use strict';

  // Guard: stop immediately if the extension runtime is already gone
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

  // ---- Chrome API Safety ----------------------------------------------------
  function isContextValid() {
    try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; } catch (_) { return false; }
  }
  function safeStorageGet(keys, cb) {
    if (!isContextValid()) return;
    try { chrome.storage.local.get(keys, cb); } catch (_) {}
  }
  function safeStorageSet(data) {
    if (!isContextValid()) return;
    try { chrome.storage.local.set(data); } catch (_) {}
  }

  // ---- State ----------------------------------------------------------------
  let isEnabled          = true;   // mirrors chrome.storage setting
  let observer           = null;   // active MutationObserver on #movie_player
  let sessionCount       = 0;      // ads CONFIRMED skipped this session
  let clickScheduled     = false;  // prevents duplicate scheduled clicks
  let clickCooldownUntil = 0;      // FIX #3: timestamp — no new clicks before this
  let attachRetries      = 0;
  let debounceTimer      = null;
  let domWatcher         = null;
  let retryTimer         = null;

  // ---- Bootstrap ------------------------------------------------------------

  function init() {
    safeStorageGet([STORAGE_KEY_ENABLED, STORAGE_KEY_COUNT], (result) => {
      isEnabled    = result[STORAGE_KEY_ENABLED] !== false;
      sessionCount = result[STORAGE_KEY_COUNT]   || 0;
      log(`Initialized. Enabled: ${isEnabled}. Session skips: ${sessionCount}`);
      if (isEnabled) scheduleAttach();
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (!isContextValid()) return;
      if (STORAGE_KEY_ENABLED in changes) {
        isEnabled = changes[STORAGE_KEY_ENABLED].newValue !== false;
        log(`State → ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
        isEnabled ? scheduleAttach() : detachObserver();
      }
    });

    window.addEventListener('yt-navigate-finish', onSpaNavigate);
    window.addEventListener('popstate', onSpaNavigate);
  }

  // ---- SPA Navigation -------------------------------------------------------

  function onSpaNavigate() {
    if (!isEnabled) return;
    log('SPA navigation — re-attaching observer...');
    detachObserver();
    attachRetries      = 0;
    clickCooldownUntil = 0; // reset cooldown on video change
    setTimeout(scheduleAttach, SPA_REATTACH_DELAY_MS);
  }

  // ---- Observer Lifecycle ---------------------------------------------------

  function scheduleAttach() {
    attachRetries = 0;
    clearTimeout(retryTimer);
    stopDomWatcher();

    const player = document.querySelector(PLAYER_SELECTOR);
    if (player) { attachObserver(player); return; }

    log('Player not in DOM yet — starting DOM watcher + retry loop.');
    startDomWatcher();
    scheduleRetry();
  }

  function scheduleRetry() {
    if (!isEnabled || observer) return;
    attachRetries++;
    if (attachRetries > MAX_ATTACH_RETRIES) return;

    retryTimer = setTimeout(() => {
      if (!isEnabled || observer) return;
      const player = document.querySelector(PLAYER_SELECTOR);
      if (player) {
        log(`Player found on retry ${attachRetries}. Attaching.`);
        stopDomWatcher();
        attachObserver(player);
      } else {
        scheduleRetry();
      }
    }, PLAYER_RETRY_DELAY_MS);
  }

  function startDomWatcher() {
    if (domWatcher) return;
    const root = document.body || document.documentElement;
    domWatcher = new MutationObserver(() => {
      if (!isEnabled) { stopDomWatcher(); return; }
      if (observer)   { stopDomWatcher(); return; }
      const player = document.querySelector(PLAYER_SELECTOR);
      if (player) {
        log('DOM watcher found player. Attaching observer.');
        clearTimeout(retryTimer);
        stopDomWatcher();
        attachObserver(player);
      }
    });
    domWatcher.observe(root, { childList: true, subtree: true });
    log('DOM watcher active — watching for #movie_player.');
  }

  function stopDomWatcher() {
    if (domWatcher) { domWatcher.disconnect(); domWatcher = null; }
  }

  function attachObserver(player) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(onMutation);
    observer.observe(player, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style']
    });
    log('Observer attached to #movie_player.');
  }

  function detachObserver() {
    if (observer) { observer.disconnect(); observer = null; log('Observer detached.'); }
    stopDomWatcher();
    clearTimeout(retryTimer);
    clickScheduled = false;
    clearTimeout(debounceTimer);
  }

  // ---- Mutation Callback ----------------------------------------------------

  function onMutation() {
    if (!isEnabled)  return;
    if (clickScheduled) return;
    if (Date.now() < clickCooldownUntil) return; // FIX #3: respect cooldown

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(evaluate, OBSERVER_DEBOUNCE_MS);
  }

  // ---- Core Detection Logic -------------------------------------------------

  function evaluate() {
    if (!isEnabled || clickScheduled) return;
    if (Date.now() < clickCooldownUntil) return; // FIX #3

    if (!isAdPlaying()) return;

    const skipBtn = findSkipButton();
    if (!skipBtn) return;

    log(`Skip button ready: "${skipBtn.textContent.trim().slice(0, 40)}". Clicking in ${CLICK_DELAY_MS}ms.`);
    clickScheduled = true;

    setTimeout(() => {
      clickScheduled = false;
      performClick(skipBtn);
    }, CLICK_DELAY_MS);
  }

  // Layer 1 — Is an ad actively playing?
  function isAdPlaying() {
    if (document.documentElement.classList.contains('ad-showing')) return true;
    if (document.body && document.body.classList.contains('ad-showing')) return true;
    return AD_SELECTORS.some(sel => document.querySelector(sel) !== null);
  }

  // Layer 2 — Find the actual clickable skip button.
  // FIX #4: filters out countdown state ("Skip in 5") before returning a match.
  // FIX #5: searches [role="button"] and .ytp-button, not just <button>.
  function findSkipButton() {
    // Try each primary selector
    for (const selector of SKIP_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el || !isVisible(el)) continue;

      const text = el.textContent.trim();
      if (isCountdownText(text)) {
        log(`Countdown still running: "${text.slice(0, 30)}" — waiting.`);
        continue;
      }

      log(`Matched selector "${selector}": "${text.slice(0, 30)}"`);
      return el;
    }

    // Fallback: search inside #movie_player for any interactive element
    // whose visible text says "Skip" but is NOT a countdown.
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return null;

    // Include div[role="button"] and .ytp-button — YouTube uses these in modern UI
    const candidates = Array.from(
      player.querySelectorAll('button, [role="button"], .ytp-button')
    );

    const found = candidates.find(el => {
      if (!isVisible(el)) return false;
      const text = el.textContent.trim().toLowerCase();
      return text.includes('skip') && !isCountdownText(text);
    });

    if (found) log(`Text-fallback found: "${found.textContent.trim().slice(0, 40)}"`);
    return found || null;
  }

  // FIX #4: detect countdown text patterns — button is NOT yet clickable
  function isCountdownText(text) {
    if (!text) return false;
    return COUNTDOWN_PATTERNS.some(pattern => pattern.test(text));
  }

  // ---- Click & Verification -------------------------------------------------

  function performClick(scheduledBtn) {
    if (!isEnabled) return;
    if (!isAdPlaying()) {
      log('Ad ended naturally before click fired — no action needed.');
      return;
    }

    const btn = findSkipButton() || scheduledBtn;
    if (!btn) {
      log('No skip button at click time — aborting.');
      return;
    }

    // Overlay/banner ads (the "X" close button on bottom banners while video plays).
    // These are not video-seeking targets — just close the overlay directly.
    if (btn.closest('.ytp-ad-overlay-close-button') || btn.matches('.ytp-ad-overlay-close-button')) {
      log('Overlay ad — closing directly.');
      try { btn.click(); } catch (_) {}
      clickCooldownUntil = Date.now() + CLICK_COOLDOWN_MS;
      setTimeout(verifySkip, CLICK_VERIFY_DELAY_MS);
      return;
    }

    // Video ads (skippable) — seek the video to its end.
    //
    // WHY NOT mouse events: coordinate-based MouseEvent dispatch (clientX/Y) is
    // intercepted by YouTube's ad overlay BEFORE the skip button receives it,
    // which registers as an ad click and navigates to the advertiser's URL.
    // Setting video.currentTime is a plain property write — no events, no overlay.
    log('Video ad — seeking to end.');
    const seeked = trySeekSkip();
    if (!seeked) {
      log('Seek unavailable (video not ready or no duration). Retrying after cooldown.');
    }

    clickCooldownUntil = Date.now() + CLICK_COOLDOWN_MS;
    setTimeout(verifySkip, CLICK_VERIFY_DELAY_MS);
  }

  // Seek the playing video to its end — no events, no isTrusted issue, no ad-click risk.
  function trySeekSkip() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return false;
    const video = player.querySelector('video');
    if (!video) return false;
    if (!isFinite(video.duration) || video.duration <= 0) return false;
    const target = video.duration - 0.1;
    if (video.currentTime >= target) return false; // already at end
    log(`Seek-skip: ${video.currentTime.toFixed(1)}s → ${target.toFixed(1)}s (duration: ${video.duration.toFixed(1)}s)`);
    try { video.currentTime = target; } catch (_) { return false; }
    return true;
  }

  function verifySkip() {
    if (isAdPlaying()) {
      log('WARN: Ad still playing after skip attempt. Cooldown active, will retry.');
    } else {
      sessionCount++;
      log(`SUCCESS: Ad skipped! Session total: ${sessionCount}`);
      safeStorageSet({ [STORAGE_KEY_COUNT]: sessionCount });
      clickCooldownUntil = 0;
      // Immediately check for a consecutive ad ("Ad 1 of 2" → "Ad 2 of 2" pod case)
      setTimeout(evaluate, 300);
    }
  }

  // ---- Utilities ------------------------------------------------------------

  function isVisible(el) {
    if (!el) return false;
    const rect  = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display     !== 'none'    &&
      style.visibility  !== 'hidden'  &&
      parseFloat(style.opacity) > 0
    );
  }

  function log(msg) {
    console.log(`${LOG_PREFIX} ${msg}`);
  }

  // ---- Start ----------------------------------------------------------------
  init();

})(); // IIFE — all state is local, zero global pollution
