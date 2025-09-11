/* ===================================================================
TV1 ADAPTER (Revised) — polls state.json, loads current.json, and renders
- Baseline + render-once guard (prevents Landing auto-jump & flashing)
- Compatible with your existing app.js (no changes to visuals).
- Sets highlight window to bp ± 0.01 and updates all widgets together.
=================================================================== */

(function(){
    // ---- CONFIG ----
    const DEFAULT_RUNTIME_BASE = 'https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime';
    // Expose globally so app.js helpers that reference RUNTIME_BASE can see it
    window.RUNTIME_BASE = window.RUNTIME_BASE || DEFAULT_RUNTIME_BASE;
    window.APP_CONFIG = window.APP_CONFIG || { RUNTIME_BASE_URL: window.RUNTIME_BASE };

    const POLL_MS = 2000;
    let pollTimer = null;
    let baselineComputedAt = null;
    let lastRenderedComputedAt = null;
    let rendering = false;

    // ---- Helpers ----
    async function fetchJSONNoCache(url){
      const res = await fetch(url + (url.includes('?')?'&':'?') + 'ts=' + Date.now(), { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    }

    function isElementVisibleAndSized(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display==='none' || s.visibility==='hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width>0 && r.height>0;
    }

    function waitForVisibleAndSized(sel, tries=20){
      return new Promise(resolve=>{
        (function tick(n){
          const el = document.querySelector(sel);
          if (isElementVisibleAndSized(el) || n<=0) return resolve(el);
          requestAnimationFrame(()=>tick(n-1));
        })(tries);
      });
    }

    function normalizeCurrent(cur) {
      return {
        bp: Number(cur?.bp ?? cur?.BP ?? 0),
        intensities: cur?.intensities ?? cur?.classes ?? {},
        intensity_top: Array.isArray(cur?.intensity_top) ? cur.intensity_top : [],
        distribution: Array.isArray(cur?.distribution) ? cur.distribution : [],
        meta: cur?.meta ?? {}
      };
    }

    // ---- Core apply path (single source of truth) ----
    async function applyCurrentFromNetwork(){
      const base = (window.APP_CONFIG && window.APP_CONFIG.RUNTIME_BASE_URL) 
        ? window.APP_CONFIG.RUNTIME_BASE_URL 
        : window.RUNTIME_BASE;
      const current = await fetchJSONNoCache(`${base}/current.json`);
      const normalized = normalizeCurrent(current);

      // Store to app globals so existing functions can access
      window.app = window.app || { state:{}, data:{} };
      app.runtimeCurrent = normalized;
      app.data.dashboardData = { source:'current.json', ...normalized };

      // Update BP and highlight window
      if (typeof window.setUserBp === 'function') {
        window.setUserBp(normalized.bp);
      } else {
        const EPS = 0.01;
        app.state = app.state || {};
        app.state.bpValue = normalized.bp;
        app.state.highlightMin = Math.max(0, normalized.bp - EPS);
        app.state.highlightMax = Math.min(1, normalized.bp + EPS);
        window.HIGHLIGHT_MIN = app.state.highlightMin;
        window.HIGHLIGHT_MAX = app.state.highlightMax;
      }

      // Switch mode first so containers are visible/sized
      if (typeof window.setMode === 'function') await window.setMode('result');
      
      // Wait for footer to be ready for Chart.js
      await waitForVisibleAndSized('#footer', 20);

      // Build/rebuild sections if needed (app handles idempotence)
      if (typeof window.buildAllContent === 'function') window.buildAllContent();

      // Update visualization canvas with current data
      if (typeof window.updateVisualizationCanvas === 'function') { 
        try { window.updateVisualizationCanvas(); } catch {} 
      }

      // Unified dashboard update (numbers, icons, bars, distribution)
      if (typeof window.updateDashboardDisplay === 'function') { 
        try { window.updateDashboardDisplay(); } catch {} 
      }

      // Kick the result animation sequence (highlight → circular → highlight+pulse)
      if (typeof window.executeResultSequence === 'function') { 
        try { await window.executeResultSequence(); } catch {} 
      }
    }

    // ---- Polling for new state from Lambda ----
    async function checkStateOnce(){
      try{
        const base = (window.APP_CONFIG && window.APP_CONFIG.RUNTIME_BASE_URL) 
          ? window.APP_CONFIG.RUNTIME_BASE_URL 
          : window.RUNTIME_BASE;
        const state = await fetchJSONNoCache(`${base}/state.json`);
        const computedAt = state?.meta?.computed_at || state?.computed_at || null;

        // Set baseline on first poll (stay in Landing)
        if (baselineComputedAt === null) { 
          baselineComputedAt = computedAt; 
          return; 
        }

        // Check for actual change and prevent concurrent renders
        const changed = computedAt
          && computedAt !== baselineComputedAt
          && computedAt !== lastRenderedComputedAt;

        if (changed && !rendering){
          rendering = true;
          try {
            await applyCurrentFromNetwork();
            lastRenderedComputedAt = computedAt;
          } finally {
            rendering = false;
          }
        }
      } catch (e) {
        rendering = false;
        console.warn('[adapter] state poll failed:', e);
      }
    }

    function startPoller(){ 
      if (!pollTimer) pollTimer = setInterval(checkStateOnce, POLL_MS); 
    }
    
    function stopPoller(){ 
      if (pollTimer){ 
        clearInterval(pollTimer); 
        pollTimer=null; 
      } 
    }

    // ---- Dev buttons (optional) ----
    function wireDevButtons() {
      const bLanding = document.getElementById('btn-landing');
      const bResult = document.getElementById('btn-show-result');

      if (bLanding && typeof window.setMode === 'function') {
        bLanding.addEventListener('click', () => {
          window.setMode('landing');
        });
      }

      if (bResult) {
        bResult.addEventListener('click', async () => {
          if (rendering) return; // Prevent concurrent renders
          rendering = true;
          try {
            await applyCurrentFromNetwork();
            lastRenderedComputedAt = 'manual';
          } catch (e) {
            console.error('[adapter] manual show-result failed:', e);
          } finally {
            rendering = false;
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
      startPoller, 
      stopPoller, 
      checkStateOnce,
      applyCurrentFromNetwork,
      isRendering: () => rendering,
      getBaselineComputedAt: () => baselineComputedAt,
      getLastRenderedComputedAt: () => lastRenderedComputedAt
    });
})();