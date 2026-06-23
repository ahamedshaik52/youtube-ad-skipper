// ============================================================
// content.js — Core skip logic for YouTube Ad Skipper v1.0.3
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

    log(`Firing skip... (button: ${btn ? btn.className.split(' ').slice(0,2).join('.') : 'none'})`);

    // Method 1 (primary): seek the ad video to its end.
    // This bypasses the isTrusted restriction entirely — no event dispatch needed.
    trySeekSkip();

    // Method 2 (fallback): dispatch full pointer+mouse event chain.
    // YouTube's handler may still honour this on some ad types.
    if (btn && isVisible(btn)) {
      const rect = btn.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const eventProps = { bubbles: true, cancelable: true, view: window, detail: 1, clientX: cx, clientY: cy };
      try {
        ['pointerover', 'pointerenter', 'mouseover', 'mouseenter',
         'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'
        ].forEach(type => {
          try { btn.dispatchEvent(new MouseEvent(type, eventProps)); } catch (_) {}
        });
        btn.click();
      } catch (_) {}

      const roleParent = btn.closest('[role="button"]');
      if (roleParent && roleParent !== btn) {
        try { roleParent.dispatchEvent(new MouseEvent('click', eventProps)); } catch (_) {}
        try { roleParent.click(); } catch (_) {}
      }
    }

    clickCooldownUntil = Date.now() + CLICK_COOLDOWN_MS;
    setTimeout(verifySkip, CLICK_VERIFY_DELAY_MS);
  }

  // Seek the playing video to its end — skips the ad without dispatching events.
  // Works because HTMLVideoElement.currentTime is a plain property, not an event handler.
  function trySeekSkip() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return false;
    const video = player.querySelector('video');
    if (!video || video.paused) return false;
    if (!isFinite(video.duration) || video.duration <= 0) return false;
    const target = Math.max(video.duration - 0.1, video.currentTime + 0.1);
    log(`Seek-skip: ${video.currentTime.toFixed(1)}s → ${target.toFixed(1)}s (ad duration: ${video.duration.toFixed(1)}s)`);
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
