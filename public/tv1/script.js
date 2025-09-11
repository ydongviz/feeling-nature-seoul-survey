/* ===================================================================
TV1 ADAPTER (fixed) — polls state.json, loads current.json, and renders
- Compatible with your existing app-9:10.js (no changes to visuals).
- Sets highlight window to bp ± 0.01 and updates all widgets together.
=================================================================== */

(function(){
    // ---- CONFIG ----
    const DEFAULT_RUNTIME_BASE = 'https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime';
    // Expose globally so app-9:10.js helpers that reference RUNTIME_BASE can see it
    window.RUNTIME_BASE = window.RUNTIME_BASE || DEFAULT_RUNTIME_BASE;
  
    const POLL_MS = 2000; // cadence for checking state.json
    let pollTimer = null;
    let lastComputedAt = null;
  
    // ---- Helpers ----
    async function fetchJSONNoCache(url) {
      const withTs = url + (url.includes('?') ? '&' : '?') + 'ts=' + Date.now();
      const res = await fetch(withTs, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }});
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    }
  
    function normalizeCurrent(cur) {
      return {
        bp: Number(cur?.bp ?? cur?.BP ?? 0),
        intensities: cur?.intensities || cur?.classes || {},
        intensity_top: Array.isArray(cur?.intensity_top) ? cur.intensity_top : [],
        distribution: Array.isArray(cur?.distribution) ? cur.distribution : null,
        meta: cur?.meta || {}
      };
    }
  
    function setHighlightFromBp(bp) {
      const EPS = 0.01;
      window.HIGHLIGHT_MIN = Math.max(0, bp - EPS);
      window.HIGHLIGHT_MAX = Math.min(1, bp + EPS);
    }
  
    // ---- Core apply path (single source of truth) ----
    async function applyCurrent(curRaw) {
      const cur = normalizeCurrent(curRaw);
  
      // Store to app globals so existing functions can access
      window.app = window.app || { data: {} };
      app.runtimeCurrent = cur;
      app.data.current = cur;
      app.data.dashboardData = { source: 'current.json', ...cur };
  
      // Update BP and highlight window
      setHighlightFromBp(cur.bp);
      if (typeof window.setUserBp === 'function') window.setUserBp(cur.bp);
  
      // Switch mode first so containers are visible/sized
      if (typeof window.setMode === 'function') await window.setMode('result');
  
      // Build/rebuild sections if needed (app handles idempotence)
      if (typeof window.buildAllContent === 'function') window.buildAllContent();
  
      // Unified dashboard update (numbers, icons, bars, distribution)
      if (typeof window.updateDashboardDisplay === 'function') {
        await window.updateDashboardDisplay();
      }
  
      // Kick the result animation sequence (highlight → circular → highlight+pulse)
      if (typeof window.executeResultSequence === 'function') {
        await window.executeResultSequence();
      }
    }
  
    // ---- Polling for new state from Lambda ----
    async function checkStateOnce() {
      try {
        const state = await fetchJSONNoCache(`${window.RUNTIME_BASE}/state.json`);
        const computedAt = state?.meta?.computed_at || state?.computed_at || null;
  
        // Initial run or new computation detected
        if (!lastComputedAt || (computedAt && computedAt !== lastComputedAt)) {
          lastComputedAt = computedAt;
  
          // Fetch the matched current.json and render
          const current = await fetchJSONNoCache(`${window.RUNTIME_BASE}/current.json`);
          await applyCurrent(current);
        }
      } catch (err) {
        console.warn('[adapter] state poll failed:', err);
      }
    }
  
    function startPoller() {
      if (pollTimer) return;
      pollTimer = setInterval(checkStateOnce, POLL_MS);
    }
  
    function stopPoller() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
  
    // ---- Dev buttons (optional) ----
    function wireDevButtons() {
      const bLanding = document.getElementById('btn-landing');
      const bResult  = document.getElementById('btn-show-result');
  
      if (bLanding && typeof window.setMode === 'function') {
        bLanding.addEventListener('click', () => window.setMode('landing'));
      }
      if (bResult) {
        bResult.addEventListener('click', async () => {
          try {
            const current = await fetchJSONNoCache(`${window.RUNTIME_BASE}/current.json`);
            await applyCurrent(current);
          } catch (e) {
            console.error('[adapter] manual show-result failed:', e);
          }
        });
      }
    }
  
    // ---- Boot ----
    function bootAdapter() {
      wireDevButtons();
      startPoller();
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootAdapter);
    } else {
      bootAdapter();
    }
  
    // Expose some controls for debugging
    window.__tv1 = Object.assign(window.__tv1 || {}, {
      startPoller, stopPoller, checkStateOnce
    });
  })();