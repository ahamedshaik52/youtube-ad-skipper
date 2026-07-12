// ============================================================
// content.js — Core skip logic for YouTube Ad Skipper v1.0.5
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
  let isEnabled     = true;   // mirrors chrome.storage setting
  let observer      = null;   // active MutationObserver on #movie_player
  let sessionCount  = 0;      // ad breaks CONFIRMED skipped this session
  let nextAttemptAt = 0;      // throttle: no skip attempts before this timestamp
  let verifyTimer   = null;   // pending verify/recheck timer
  let attachRetries = 0;
  let debounceTimer = null;
  let domWatcher    = null;
  let retryTimer    = null;

  // ---- Bootstrap ------------------------------------------------------------

  function init() {
    safeStorageGet([STORAGE_KEY_ENABLED, STORAGE_KEY_COUNT], (result) => {
      isEnabled    = result[STORAGE_KEY_ENABLED] !== false;
      sessionCount = result[STORAGE_KEY_COUNT]   || 0;
      log(`Initialized (v1.0.5). Enabled: ${isEnabled}. Session skips: ${sessionCount}`);
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
    attachRetries = 0;
    nextAttemptAt = 0;
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
    evaluate(); // an ad may already be playing right now
  }

  function detachObserver() {
    if (observer) { observer.disconnect(); observer = null; log('Observer detached.'); }
    stopDomWatcher();
    clearTimeout(retryTimer);
    clearTimeout(debounceTimer);
    clearTimeout(verifyTimer);
    verifyTimer = null;
  }

  // ---- Mutation Callback ----------------------------------------------------

  function onMutation() {
    if (!isEnabled) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(evaluate, OBSERVER_DEBOUNCE_MS);
  }

  // ---- Core Skip Logic --------------------------------------------------------
  //
  // Strategy (fast path, mimics an instant human click):
  //  1. The moment the player enters ad state, click the Skip button if it
  //     exists (plain element.click() — targets ONLY that element, safe).
  //  2. Simultaneously seek the ad video to its end. This works even before
  //     the skip button appears, so we never wait out the 5s countdown.
  //  3. Re-attempt every ATTEMPT_INTERVAL_MS while the ad state persists
  //     (covers end cards, "Ad 2 of 2" pods, and slow player transitions).

  function evaluate() {
    if (!isEnabled) return;

    // Banner overlay ads can appear during normal playback (no ad-showing class)
    const overlayBtn = document.querySelector('.ytp-ad-overlay-close-button');
    if (overlayBtn && isVisible(overlayBtn)) {
      log('Overlay banner ad — closing.');
      try { overlayBtn.click(); } catch (_) {}
    }

    if (!isAdShowing()) return;
    if (Date.now() < nextAttemptAt) { scheduleVerify(); return; }
    nextAttemptAt = Date.now() + ATTEMPT_INTERVAL_MS;

    attemptSkip();
  }

  // The player element carries the `ad-showing` class ONLY while an ad plays.
  // This is the strict gate — we never touch video.currentTime outside ad state.
  function isAdShowing() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (player && player.classList.contains('ad-showing')) return true;
    return document.documentElement.classList.contains('ad-showing');
  }

  function attemptSkip() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return;

    // 1) Click the Skip button if present — exactly like a human click on it.
    //    element.click() dispatches directly to THIS element only: no screen
    //    coordinates, so it can never be interpreted as a click on the ad.
    const btn = findSkipButton();
    if (btn) {
      log(`Clicking skip button: "${btn.textContent.trim().slice(0, 30) || btn.className.split(' ')[0]}"`);
      try { btn.click(); } catch (_) {}
    }

    // 2) Seek the ad video to its end — kills the ad instantly, even during
    //    the countdown before the skip button appears, and for unskippable ads.
    const video = player.querySelector('video');
    if (video && isFinite(video.duration) && video.duration > 0 &&
        video.currentTime < video.duration - 0.2) {
      log(`Seek-skip: ${video.currentTime.toFixed(1)}s → end (${video.duration.toFixed(1)}s)`);
      try { video.currentTime = video.duration; } catch (_) {}
    }

    scheduleVerify();
  }

  // Recheck shortly after an attempt: if the ad state is gone → count ONE skip
  // for the whole ad break. If still in ad state (end card / next ad in pod) →
  // loop back into evaluate for another attempt.
  function scheduleVerify() {
    if (verifyTimer) return;
    verifyTimer = setTimeout(() => {
      verifyTimer = null;
      if (!isEnabled) return;
      if (isAdShowing()) {
        evaluate(); // still ads — keep going
      } else {
        sessionCount++;
        log(`SUCCESS: Ad break skipped! Session total: ${sessionCount}`);
        safeStorageSet({ [STORAGE_KEY_COUNT]: sessionCount });
      }
    }, CLICK_VERIFY_DELAY_MS);
  }

  // Find the actual clickable skip button (countdown state filtered out).
  function findSkipButton() {
    for (const selector of SKIP_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el || !isVisible(el)) continue;
      const text = el.textContent.trim();
      if (isCountdownText(text)) continue; // "Skip in 5" — not clickable yet
      return el;
    }

    // Fallback: any interactive element inside the player whose text says "skip"
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return null;
    const candidates = Array.from(
      player.querySelectorAll('button, [role="button"], .ytp-button')
    );
    return candidates.find(el => {
      if (!isVisible(el)) return false;
      const text = el.textContent.trim().toLowerCase();
      return text.includes('skip') && !isCountdownText(text);
    }) || null;
  }

  function isCountdownText(text) {
    if (!text) return false;
    return COUNTDOWN_PATTERNS.some(pattern => pattern.test(text));
  }

  // ---- Utilities ------------------------------------------------------------

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display    !== 'none'   &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0
    );
  }

  function log(msg) {
    console.log(`${LOG_PREFIX} ${msg}`);
  }

  // ---- Start ----------------------------------------------------------------
  init();

})(); // IIFE — all state is local, zero global pollution
