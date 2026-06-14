// ============================================================
// popup.js — Toggle logic and session stats for the popup UI
// ============================================================

(function () {
  'use strict';

  // Storage keys (must match constants.js)
  const STORAGE_KEY_ENABLED = 'ytSkipperEnabled';
  const STORAGE_KEY_COUNT   = 'ytSkipperCount';

  // DOM references
  const toggle      = document.getElementById('toggle');
  const statusText  = document.getElementById('status-text');
  const statusIcon  = document.getElementById('status-icon');
  const skipCount   = document.getElementById('skip-count');
  const toggleDesc  = document.getElementById('toggle-description');
  const resetBtn    = document.getElementById('reset-btn');

  // ---- Load current state on popup open ------------------------------------

  chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_COUNT], (result) => {
    const enabled = result[STORAGE_KEY_ENABLED] !== false; // default true
    const count   = result[STORAGE_KEY_COUNT]   || 0;

    applyState(enabled);
    skipCount.textContent = count;
  });

  // ---- Toggle handler -------------------------------------------------------

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ [STORAGE_KEY_ENABLED]: enabled });
    applyState(enabled);
  });

  // ---- Reset session count --------------------------------------------------

  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ [STORAGE_KEY_COUNT]: 0 });
    skipCount.textContent = '0';

    // Brief visual confirmation
    resetBtn.textContent = 'Count reset!';
    resetBtn.style.color = '#22c55e';
    resetBtn.style.borderColor = '#22c55e';
    setTimeout(() => {
      resetBtn.textContent = 'Reset session count';
      resetBtn.style.color = '';
      resetBtn.style.borderColor = '';
    }, 1500);
  });

  // ---- Live count refresh (if user leaves popup open) ----------------------

  chrome.storage.onChanged.addListener((changes) => {
    if (STORAGE_KEY_COUNT in changes) {
      skipCount.textContent = changes[STORAGE_KEY_COUNT].newValue || 0;
    }
    if (STORAGE_KEY_ENABLED in changes) {
      applyState(changes[STORAGE_KEY_ENABLED].newValue !== false);
    }
  });

  // ---- UI state helper ------------------------------------------------------

  function applyState(enabled) {
    toggle.checked = enabled;

    if (enabled) {
      statusText.textContent = 'Active';
      statusText.className   = 'status-badge enabled';
      statusIcon.textContent = '✓';
      statusIcon.style.color = '#22c55e';
      toggleDesc.textContent = 'Automatically clicks Skip Ad within 3 seconds.';
    } else {
      statusText.textContent = 'Paused';
      statusText.className   = 'status-badge disabled';
      statusIcon.textContent = '✕';
      statusIcon.style.color = '#ef4444';
      toggleDesc.textContent = 'Auto-skip is off. Ads will not be skipped.';
    }
  }

})();
