
/* TV-1 kiosk adapter + state poller (revised, complete)
   - Polls state.json for stage changes
   - Fetches current.json and updates dashboard via app.js APIs
   - Ensures the same unified path for poller + control pad
*/

(function(){
    const STATE_URL  = (window.APP_CONFIG && APP_CONFIG.RUNTIME_BASE_URL)
      ? `${APP_CONFIG.RUNTIME_BASE_URL}/state.json`
      : "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
  
    const RESULT_URL = (window.APP_CONFIG && APP_CONFIG.RUNTIME_BASE_URL)
      ? `${APP_CONFIG.RUNTIME_BASE_URL}/current.json`
      : "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";
  
    const ovEl  = document.getElementById("kioskOverlay");
    const ovMsg = document.getElementById("kioskMsg");
    const ovCnt = document.getElementById("kioskCount");
  
    let pollTimer = null;
    let resultEtag = null;
    let lastComputed = null;
  
    function hideOverlay(){
      if (ovEl)  ovEl.style.display = "none";
      if (ovCnt) ovCnt.style.display = "none";
    }
    function showNote(msg){
      if (!ovEl) return;
      ovEl.style.display = "flex";
      if (ovMsg) ovMsg.textContent = msg || "Please complete your survey…";
      if (ovCnt) ovCnt.style.display = "none";
    }
    function showCountdown(msg, seconds){
      if (!ovEl) return;
      ovEl.style.display = "flex";
      if (ovMsg) ovMsg.textContent = msg || "Loading your result…";
      if (ovCnt) {
        ovCnt.style.display = "block";
        const target = Date.now() + (Number(seconds)||3)*1000;
        const t = setInterval(() => {
          const r = Math.max(0, target - Date.now());
          ovCnt.textContent = String(Math.ceil(r/1000));
          if (r <= 0) { clearInterval(t); ovCnt.textContent = "0"; }
        }, 200);
      }
    }
  
    async function fetchNoCache(url, et) {
      const res = await fetch(url + (url.includes("?")?"&":"?") + "ts=" + Date.now(), {
        cache: "no-store",
        headers: et ? { "If-None-Match": et } : {}
      });
      if (res.status === 304) return { json: null, etag: et, notModified: true, res };
      const json = await res.json().catch(()=>null);
      return { json, etag: res.headers.get("ETag"), notModified: false, res };
    }
  
    function applyCurrent(cur){
      try{
        if (!cur || typeof cur !== "object") return;
  
        // Persist for other modules
        window.app = window.app || { data:{}, state:{} };
        window.app.runtimeCurrent = cur;
  
        // Mode: ensure result UI is visible before we render charts
        if (typeof window.setMode === "function") window.setMode("result");
  
        const bp = Number(cur.bp ?? 0);
        if (Number.isFinite(bp) && typeof window.setUserBp === "function") {
          window.setUserBp(bp);
        }
        const num = document.getElementById("bpValueNumber");
        if (num && Number.isFinite(bp)) num.textContent = bp.toFixed(2);
  
        // Top elements + Bars
        const intens = cur.intensities || {};
        let top10 = Object.entries(intens).map(([k,v]) => ({ name:k, value: Number(v)||0 }));
        top10.sort((a,b) => b.value - a.value);
        top10 = top10.slice(0,10);
  
        let top3names = Array.isArray(cur.intensity_top) ? cur.intensity_top.slice(0,3) : top10.slice(0,3).map(d=>d.name);
        if (typeof window.updateTopElements === "function") window.updateTopElements(top3names);
        if (typeof window.updateBarChart   === "function") window.updateBarChart(top10);
  
        // Distribution chart + animation (guarded in app.js for visibility)
        if (typeof window.updateDistributionChart === "function" && Number.isFinite(bp)) {
          window.updateDistributionChart(bp);
          if (typeof window.animateDistributionCurve === "function") window.animateDistributionCurve(bp);
        }
  
        // Kick result visual sequence (highlight -> circular -> highlight+pulse)
        if (typeof window.executeResultSequence === "function") window.executeResultSequence();
      }catch(e){
        console.error("[applyCurrent] error:", e);
      }
    }
  
    async function pollOnce(){
      try{
        // 1) read state
        const { json: state } = await fetchNoCache(STATE_URL, null);
        const stage = state && state.stage || "landing";
  
        if (stage === "landing") {
          hideOverlay();
          if (typeof window.setMode === "function") window.setMode("landing");
          return;
        }
  
        if (stage === "started") {
          showNote("Please complete your survey…");
          if (typeof window.setMode === "function") window.setMode("landing");
          return;
        }
  
        if (stage === "loading") {
          showCountdown("Loading your result…", 3);
          if (typeof window.setMode === "function") window.setMode("landing");
          return;
        }
  
        if (stage === "ready") {
          // 2) fetch current.json (with ETag to avoid work if unchanged)
          const { json: cur, etag } = await fetchNoCache(RESULT_URL, resultEtag);
          if (!cur) { hideOverlay(); return; }
  
          // Skip if computed_at unchanged (extra guard)
          const computed = (cur.meta && cur.meta.computed_at) || null;
          if (computed && computed === lastComputed) { hideOverlay(); return; }
  
          resultEtag = etag || resultEtag;
          lastComputed = computed || lastComputed;
  
          hideOverlay();
          applyCurrent(cur);
          return;
        }
  
        // Unknown stage: keep landing
        hideOverlay();
        if (typeof window.setMode === "function") window.setMode("landing");
      }catch(e){
        // network hiccup: do nothing
      }
    }
  
    function startPoller(){
      if (pollTimer) return;
      pollTimer = setInterval(pollOnce, 1500);
      pollOnce();
    }
  
    // Dev control buttons, if present
    function wireDevButtons() {
      const btnLanding = document.getElementById('btn-landing');
      const btnResult  = document.getElementById('btn-show-result');
      if (btnLanding) btnLanding.addEventListener('click', () => { if (typeof window.setMode === "function") window.setMode('landing'); });
      if (btnResult)  btnResult.addEventListener('click', async () => {
        const { json: cur } = await fetchNoCache(RESULT_URL, null);
        if (cur) { hideOverlay(); applyCurrent(cur); }
      });
    }
  
    window.addEventListener("load", () => {
      wireDevButtons();
      startPoller();
    });
  })();
  