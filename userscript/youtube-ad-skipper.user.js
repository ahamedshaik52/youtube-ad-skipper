// ==UserScript==
// @name         YouTube Ad Skipper
// @namespace    https://github.com/personal/youtube-ad-skipper
// @version      1.0.0
// @description  Automatically clicks the Skip Ad button on YouTube within 3 seconds.
// @author       Personal Use
// @match        *://*.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- Config (mirrors constants.js) ----------------------------------------
  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container button',
    '.videoAdUiSkipButton',
    '.ytp-ad-overlay-close-button'
  ];

  const AD_SELECTORS = [
    '.ytp-ad-player-overlay',
    '.ytp-ad-module',
    '.ytp-ad-text'
  ];

  const PLAYER_SELECTOR       = '#movie_player';
  const CLICK_DELAY_MS        = 500;
  const OBSERVER_DEBOUNCE_MS  = 50;
  const SPA_REATTACH_DELAY_MS = 1200;
  const PLAYER_RETRY_DELAY_MS = 500;
  const MAX_ATTACH_RETRIES    = 10;
  const LOG_PREFIX            = '[YTSkipper]';

  // ---- State ----------------------------------------------------------------
  let isEnabled      = GM_getValue('ytSkipperEnabled', true);
  let observer       = null;
  let sessionCount   = 0;
  let clickScheduled = false;
  let attachRetries  = 0;
  let debounceTimer  = null;

  // ---- Init -----------------------------------------------------------------
  function init() {
    log(`Initialized (userscript). Enabled: ${isEnabled}`);
    if (isEnabled) scheduleAttach();

    window.addEventListener('yt-navigate-finish', onSpaNavigate);
    window.addEventListener('popstate', onSpaNavigate);
  }

  function onSpaNavigate() {
    if (!isEnabled) return;
    log('SPA navigation — re-attaching...');
    detachObserver();
    attachRetries = 0;
    setTimeout(scheduleAttach, SPA_REATTACH_DELAY_MS);
  }

  function scheduleAttach() { attachRetries = 0; tryAttach(); }

  function tryAttach() {
    if (!isEnabled) return;
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) {
      if (++attachRetries <= MAX_ATTACH_RETRIES) {
        setTimeout(tryAttach, PLAYER_RETRY_DELAY_MS);
      }
      return;
    }
    attachObserver(player);
  }

  function attachObserver(player) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(onMutation);
    observer.observe(player, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style']
    });
    log('Observer attached.');
  }

  function detachObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    clickScheduled = false;
    clearTimeout(debounceTimer);
  }

  function onMutation() {
    if (!isEnabled || clickScheduled) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(evaluate, OBSERVER_DEBOUNCE_MS);
  }

  function evaluate() {
    if (!isEnabled || clickScheduled) return;
    if (!isAdPlaying()) return;
    const btn = findSkipButton();
    if (!btn) return;
    log(`Skip button found. Clicking in ${CLICK_DELAY_MS}ms.`);
    clickScheduled = true;
    setTimeout(() => { clickScheduled = false; performClick(); }, CLICK_DELAY_MS);
  }

  function isAdPlaying() {
    if (document.documentElement.classList.contains('ad-showing')) return true;
    return AD_SELECTORS.some(sel => document.querySelector(sel) !== null);
  }

  function findSkipButton() {
    for (const sel of SKIP_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isVisible(el) && !el.disabled) return el;
    }
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return null;
    return Array.from(player.querySelectorAll('button')).find(btn =>
      !btn.disabled && isVisible(btn) &&
      btn.textContent.trim().toLowerCase().includes('skip')
    ) || null;
  }

  function performClick() {
    if (!isEnabled || !isAdPlaying()) return;
    const btn = findSkipButton();
    if (!btn || btn.disabled || !isVisible(btn)) return;
    btn.click();
    sessionCount++;
    GM_setValue('ytSkipperCount', sessionCount);
    log(`Ad skipped! Session total: ${sessionCount}`);
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }

  init();
})();
