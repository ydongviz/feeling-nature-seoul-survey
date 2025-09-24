/* TV-1 kiosk adapter + state poller (production) - FIXED VERSION */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null, etag = null, stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

function hideOverlay(){ if(ovEl) ovEl.style.display="none"; if(ovCnt) ovCnt.style.display="none"; if(timer){clearInterval(timer); timer=null;} }

function showNote(msg){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    if (ovMsg) ovMsg.textContent = msg || "Please complete your survey questions!";
    if (ovCnt) ovCnt.style.display = "none";
}

function showCountdown(msg, secs, notBeforeIso){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    if (ovMsg) ovMsg.textContent = msg || "Loading your result…";
    if (ovCnt) ovCnt.style.display = "block";

   const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs||3)*1000);
   function tick(){ const r=Math.max(0,target-Date.now()); ovCnt.textContent=String(Math.ceil(r/1000)); if(r<=0&&timer){clearInterval(timer); timer=null;} }
   if(timer) clearInterval(timer); tick(); timer=setInterval(tick,200);
}

function expired(s){ 
    const v = s && s.expires_at;
    if (!v) return false;                
    const t = Date.parse(v);
    return Number.isFinite(t) && Date.now() > t;
}

async function fetchJSON(url, et){ const r=await fetch(url,{cache:"no-cache", headers: et?{"If-None-Match":et}:{}}); if(r.status===304) return {notModified:true, et}; return {json:await r.json(), et:r.headers.get("ETag")}; }

function applyCurrent(cur){
  try{
    const bp = Number(cur?.bp ?? 0);
    const top = Array.isArray(cur?.intensity_top) ? cur.intensity_top : [];
    
    //console.log(`[applyCurrent] Setting BP: ${bp}, Intensities:`, cur?.intensities);
    
    if (Number.isFinite(bp)) {
      // Store the raw BP value globally for reference
      window.RAW_BP_VALUE = bp;
      
      // ONLY call the BP manager - let it handle normalization and DOM updates
      if (typeof window.setUserBp === "function") {
        window.setUserBp(bp);
        //console.log(`[applyCurrent] Called setUserBp(${bp}) - BPManager will handle normalization`);
      }
    }
    
    // FIXED: Pass full data object to dashboard manager for proper filtering
    if (typeof window.updateDashboardDisplay === "function") {
      window.updateDashboardDisplay({
        bp: bp,
        intensities: cur?.intensities || {},
        intensity_top: top,
        distribution: cur?.distribution || null
      });
      //console.log(`[applyCurrent] Called updateDashboardDisplay with full data including intensities`);
    }
    
  } catch(e){ 
    console.error('[applyCurrent] Error:', e);
  }
}

async function poll(){
    try{
      const s = await fetchJSON(STATE_URL, etag);
      if (s.notModified) return;
      if (s.et) etag = s.et;
      const curEt = s.et || null;
  
      const st = s.json || {};
      if (expired(st)) { hideOverlay(); window.setMode?.("landing"); return; }
  
      // Accept either {stage} or {state}
      let stage = st.stage || st.state || "idle";
      if (stage === "landing")   stage = "idle";
      if (stage === "countdown") stage = "in_progress";
  
      // Synthesize overlay if the Lambda wrote root fields
      let ov = st.overlay;
      if (!ov || typeof ov !== "object") {
        if (st.state === "countdown") {
          ov = { type:"countdown", message: st.message || "Loading your result…", not_before: st.countdown_end };
        } else if (st.state === "in_progress") {
          ov = { type:"note", message: st.message || "Please complete your survey questions!" };
        } else {
          ov = {};
        }
      }
  
      // Baseline only to avoid replaying old *results*; do not drop overlays
      if (baselineEt === null) {
        baselineEt = curEt;
        if (stage !== "show_result") {
          // fall through and render overlay immediately
        }
      }
  
      if (stage === "idle"){
        hideOverlay(); window.setMode?.("landing"); return;
      }
      if (stage === "in_progress"){
        if (ov.type === "countdown") showCountdown(ov.message, ov.countdown_secs, ov.not_before);
        else showNote(ov.message);
        window.setMode?.("landing"); return;
      }
      
      // FIXED: Reorder the show_result logic
      if (stage === "show_result"){
        hideOverlay();
        const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
        if (!changed || rendering) return;
        rendering = true;
        
        try {
          const c = await fetchJSON(RESULT_URL);
          
          /*if (!c.notModified && c.json) {
            applyCurrent(c.json);
          }
          await window.setMode?.("result");*/

          await window.setMode?.("result");
          await new Promise(resolve => setTimeout(resolve, 300));
          
          
          // ADD THIS CRITICAL FIX:
          await new Promise(resolve => setTimeout(resolve, 800)); // Give map time to render
          if (window.app?.map) {
            window.app.map.resize();
            window.app.map.resize(); // Call twice to ensure it takes
          }
          
          lastRenderedEt = curEt;
        } catch (error) {
          console.error('[poll] Error in show_result:', error);
        } finally {
          rendering = false;
        }
        return;
      }
      
      hideOverlay(); window.setMode?.("landing");
    }catch(e){ 
      console.error('[poll] Error:', e);
    }
}

window.addEventListener("load", () => {
  window.renderLanding   = async () => { hideOverlay(); window.setMode?.("landing"); };
  window.renderDashboard = async (c)  => { hideOverlay(); window.setMode?.("result"); applyCurrent(c||{}); };
  window.renderLanding?.();
  setInterval(poll, 2000);
});