// ============================================================
// content.js — Core skip logic for YouTube Ad Skipper
// Injected into every youtube.com tab by the manifest.
// ============================================================

(function () {
  'use strict';

  // ---- State ----------------------------------------------------------------
  let isEnabled       = true;   // mirrors chrome.storage setting
  let observer        = null;   // the active MutationObserver instance
  let sessionCount    = 0;      // ads skipped in this browser session
  let clickScheduled  = false;  // prevents duplicate scheduled clicks
  let attachRetries   = 0;      // retry counter for player-not-found cases
  let debounceTimer   = null;   // debounce handle for mutation callbacks

  // ---- Bootstrap ------------------------------------------------------------

  function init() {
    chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_COUNT], (result) => {
      isEnabled    = result[STORAGE_KEY_ENABLED] !== false; // default: true
      sessionCount = result[STORAGE_KEY_COUNT]   || 0;

      log(`Initialized. Enabled: ${isEnabled}. Session skips loaded: ${sessionCount}`);

      if (isEnabled) scheduleAttach();
    });

    // React to enable/disable changes from the popup
    chrome.storage.onChanged.addListener((changes) => {
      if (STORAGE_KEY_ENABLED in changes) {
        const next = changes[STORAGE_KEY_ENABLED].newValue;
        isEnabled = (next !== false);
        log(`State changed → ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
        isEnabled ? scheduleAttach() : detachObserver();
      }
    });

    // Handle YouTube SPA navigation (navigating between videos)
    window.addEventListener('yt-navigate-finish', onSpaNavigate);

    // Fallback: also listen to popstate (back/forward)
    window.addEventListener('popstate', onSpaNavigate);
  }

  // ---- SPA Navigation -------------------------------------------------------

  function onSpaNavigate() {
    if (!isEnabled) return;
    log('SPA navigation detected — re-attaching observer...');
    detachObserver();
    attachRetries = 0;
    setTimeout(scheduleAttach, SPA_REATTACH_DELAY_MS);
  }

  // ---- Observer Lifecycle ---------------------------------------------------

  let domWatcher   = null;  // body-level watcher that waits for #movie_player
  let retryTimer   = null;  // handle for the scheduled retry setTimeout

  function scheduleAttach() {
    attachRetries = 0;
    clearTimeout(retryTimer);
    stopDomWatcher();

    const player = document.querySelector(PLAYER_SELECTOR);
    if (player) {
      // Player already in DOM — attach immediately
      attachObserver(player);
      return;
    }

    // Player not ready yet.
    // Start DOM watcher IMMEDIATELY so we never miss the insertion, and
    // run a parallel retry loop as an extra safety net.
    log('Player not in DOM yet — starting DOM watcher + retry loop.');
    startDomWatcher();
    scheduleRetry();
  }

  function scheduleRetry() {
    if (!isEnabled || observer) return; // already attached elsewhere, stop
    attachRetries++;
    if (attachRetries > MAX_ATTACH_RETRIES) return; // DOM watcher handles the rest

    retryTimer = setTimeout(() => {
      if (!isEnabled || observer) return;
      const player = document.querySelector(PLAYER_SELECTOR);
      if (player) {
        log(`Player found on retry ${attachRetries}. Attaching observer.`);
        stopDomWatcher();
        attachObserver(player);
      } else {
        scheduleRetry(); // keep trying
      }
    }, PLAYER_RETRY_DELAY_MS);
  }

  // Watches document.body for #movie_player to appear (handles slow/SPA renders)
  function startDomWatcher() {
    if (domWatcher) return; // already watching

    const root = document.body || document.documentElement;

    domWatcher = new MutationObserver(() => {
      if (!isEnabled) { stopDomWatcher(); return; }
      if (observer) { stopDomWatcher(); return; } // already attached by retry loop

      const player = document.querySelector(PLAYER_SELECTOR);
      if (player) {
        log('Player found by DOM watcher. Attaching observer.');
        clearTimeout(retryTimer);
        stopDomWatcher();
        attachObserver(player);
      }
    });

    domWatcher.observe(root, { childList: true, subtree: true });
    log('DOM watcher active — watching for #movie_player.');
  }

  function stopDomWatcher() {
    if (domWatcher) {
      domWatcher.disconnect();
      domWatcher = null;
    }
  }

  function attachObserver(player) {
    if (observer) observer.disconnect();

    observer = new MutationObserver(onMutation);
    observer.observe(player, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ['class', 'style']
    });

    log('Observer attached to #movie_player.');
  }

  function detachObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      log('Observer detached.');
    }
    stopDomWatcher();
    clearTimeout(retryTimer);
    clickScheduled = false;
    clearTimeout(debounceTimer);
  }

  // ---- Mutation Callback (debounced) ----------------------------------------

  function onMutation(mutations) {
    // Quick bail-outs before debouncing
    if (!isEnabled) return;
    if (clickScheduled) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(evaluate, OBSERVER_DEBOUNCE_MS);
  }

  // ---- Core Detection & Click Logic -----------------------------------------

  function evaluate() {
    if (!isEnabled || clickScheduled) return;

    if (!isAdPlaying()) return;

    const skipBtn = findSkipButton();
    if (!skipBtn) return;

    log(`Skip button found: "${skipBtn.textContent.trim()}". Scheduling click in ${CLICK_DELAY_MS}ms.`);
    clickScheduled = true;

    setTimeout(() => {
      clickScheduled = false;
      performClick();
    }, CLICK_DELAY_MS);
  }

  // Layer 1 — Is an ad actively playing?
  function isAdPlaying() {
    // Most reliable: YouTube adds 'ad-showing' to <html> during ads
    if (document.documentElement.classList.contains('ad-showing')) return true;

    // Secondary checks via ad-specific overlay elements
    return AD_SELECTORS.some(sel => document.querySelector(sel) !== null);
  }

  // Layer 2 — Find the skip button using the prioritized selector list
  function findSkipButton() {
    // Try each known selector
    for (const selector of SKIP_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && isVisible(el) && !el.disabled) return el;
    }

    // Text-based fallback: any visible, non-disabled button inside the player
    // whose label contains "skip" (case-insensitive)
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return null;

    const buttons = Array.from(player.querySelectorAll('button'));
    return buttons.find(btn =>
      !btn.disabled &&
      isVisible(btn) &&
      btn.textContent.trim().toLowerCase().includes('skip')
    ) || null;
  }

  // Final safety checklist before the click fires
  function performClick() {
    if (!isEnabled) return;
    if (!isAdPlaying()) {
      log('Ad ended before click could fire. Skipping click.');
      return;
    }

    const skipBtn = findSkipButton();
    if (!skipBtn) {
      log('Skip button disappeared before click. Skipping click.');
      return;
    }

    if (skipBtn.disabled || !isVisible(skipBtn)) {
      log('Skip button is disabled or hidden at click time. Aborting.');
      return;
    }

    // Perform the click
    skipBtn.click();
    sessionCount++;

    log(`Ad skipped! Session total: ${sessionCount}`);

    // Persist session count for popup display
    chrome.storage.local.set({ [STORAGE_KEY_COUNT]: sessionCount });
  }

  // ---- Utilities ------------------------------------------------------------

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    // Must have non-zero dimensions
    if (rect.width === 0 || rect.height === 0) return false;
    // Must be in the layout (offsetParent check; exempts fixed-positioned elements)
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function log(msg) {
    console.log(`${LOG_PREFIX} ${msg}`);
  }

  // ---- Start ----------------------------------------------------------------
  init();

})(); // IIFE — keeps all variables out of global scope
