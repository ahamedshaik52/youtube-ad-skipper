// ============================================================
// content.js — Core skip logic for YouTube Ad Skipper v1.0.2
// Injected into every youtube.com tab by the manifest.
// ============================================================

(function () {
  'use strict';

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
    chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_COUNT], (result) => {
      isEnabled    = result[STORAGE_KEY_ENABLED] !== false;
      sessionCount = result[STORAGE_KEY_COUNT]   || 0;
      log(`Initialized. Enabled: ${isEnabled}. Session skips: ${sessionCount}`);
      if (isEnabled) scheduleAttach();
    });

    chrome.storage.onChanged.addListener((changes) => {
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

  // FIX #2: use full pointer + mouse event sequence (YouTube listens to pointerdown)
  // FIX #1: counter only increments in verifySkip() AFTER confirming the ad stopped
  // FIX #3: set clickCooldownUntil to block re-clicking for 4 seconds
  function performClick(scheduledBtn) {
    if (!isEnabled) return;

    if (!isAdPlaying()) {
      log('Ad ended naturally before click fired — no action needed.');
      return;
    }

    // Re-find the button at click-time — DOM may have changed during the 300ms delay
    const btn = findSkipButton() || scheduledBtn;
    if (!btn || !isVisible(btn)) {
      log('Skip button gone at click time. Aborting.');
      return;
    }

    const rect = btn.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;

    log(`Firing click on <${btn.tagName.toLowerCase()}> class="${[...btn.classList].slice(0, 3).join(' ')}")`);

    // Fire the full event chain YouTube uses for interactive elements
    const eventProps = { bubbles: true, cancelable: true, view: window, detail: 1, clientX: cx, clientY: cy };
    ['pointerover', 'pointerenter', 'mouseover', 'mouseenter',
     'pointermove', 'mousemove',
     'pointerdown', 'mousedown',
     'pointerup',   'mouseup',
     'click'
    ].forEach(type => {
      try { btn.dispatchEvent(new MouseEvent(type, eventProps)); } catch (_) {}
    });

    // Also try native .click() as a belt-and-suspenders fallback
    try { btn.click(); } catch (_) {}

    // If the button is nested, also fire click on the nearest role=button ancestor
    const roleParent = btn.closest('[role="button"]');
    if (roleParent && roleParent !== btn) {
      try { roleParent.dispatchEvent(new MouseEvent('click', eventProps)); } catch (_) {}
      try { roleParent.click(); } catch (_) {}
    }

    // FIX #3: block new click attempts for CLICK_COOLDOWN_MS regardless of outcome
    clickCooldownUntil = Date.now() + CLICK_COOLDOWN_MS;

    // FIX #1: verify the skip worked; ONLY then increment the counter
    setTimeout(verifySkip, CLICK_VERIFY_DELAY_MS);
  }

  function verifySkip() {
    if (isAdPlaying()) {
      // Ad is still playing — our click had no effect
      log('WARN: Ad still playing after click. Click did not register. Cooldown active, will retry.');
      // Cooldown is still set — next attempt will happen after it expires
    } else {
      // Ad stopped — skip was successful
      sessionCount++;
      log(`SUCCESS: Ad skipped! Session total: ${sessionCount}`);
      chrome.storage.local.set({ [STORAGE_KEY_COUNT]: sessionCount });
      clickCooldownUntil = 0; // clear cooldown — ready for next ad immediately
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
