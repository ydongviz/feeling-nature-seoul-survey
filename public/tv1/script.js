/* TV-1 kiosk adapter + state poller (production) - ENHANCED WITH DURABILITY */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null, etag = null, stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

// Enhanced error tracking for durability
let pollErrorCount = 0;
let lastPollError = null;
const MAX_POLL_ERRORS = 10; // Max consecutive errors before taking action

function hideOverlay(){ 
  if(ovEl) ovEl.style.display="none"; 
  if(ovCnt) ovCnt.style.display="none"; 
  if(timer){clearInterval(timer); timer=null;} 
}

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
   function tick(){ 
     const r=Math.max(0,target-Date.now()); 
     if (ovCnt) ovCnt.textContent=String(Math.ceil(r/1000)); 
     if(r<=0&&timer){clearInterval(timer); timer=null;} 
   }
   if(timer) clearInterval(timer); 
   tick(); 
   timer=setInterval(tick,200);
}

function expired(s){ 
    const v = s && s.expires_at;
    if (!v) return false;                
    const t = Date.parse(v);
    return Number.isFinite(t) && Date.now() > t;
}

async function fetchJSON(url, et){ 
  const r=await fetch(url,{
    cache:"no-cache", 
    headers: et?{"If-None-Match":et}:{}
  }); 
  if(r.status===304) return {notModified:true, et}; 
  return {json:await r.json(), et:r.headers.get("ETag")}; 
}

function applyCurrent(cur){
  try{
    const bp = Number(cur?.bp ?? 0);
    const top = Array.isArray(cur?.intensity_top) ? cur.intensity_top : [];
    
    if (Number.isFinite(bp)) {
      // Store the raw BP value globally for reference
      window.RAW_BP_VALUE = bp;
      
      // ONLY call the BP manager - let it handle normalization and DOM updates
      if (typeof window.setUserBp === "function") {
        window.setUserBp(bp);
      }
    }
    
    // Pass full data object to dashboard manager for proper filtering
    if (typeof window.updateDashboardDisplay === "function") {
      window.updateDashboardDisplay({
        bp: bp,
        intensities: cur?.intensities || {},
        intensity_top: top,
        distribution: cur?.distribution || null
      });
    }
    
    // Reset error count on successful operation
    pollErrorCount = 0;
    
  } catch(e){ 
    console.error('[applyCurrent] Error:', e);
    pollErrorCount++;
    lastPollError = e;
  }
}

// Enhanced polling with durability and error recovery
async function pollWithDurability(){
    try{
      const s = await fetchJSON(STATE_URL, etag);
      if (s.notModified) return;
      if (s.et) etag = s.et;
      const curEt = s.et || null;
  
      const st = s.json || {};
      if (expired(st)) { 
        hideOverlay(); 
        if (typeof window.setMode === "function") {
          await window.setMode("landing");
        }
        return; 
      }
  
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
        hideOverlay(); 
        if (typeof window.setMode === "function") {
          await window.setMode("landing");
        }
        return;
      }
      
      if (stage === "in_progress"){
        if (ov.type === "countdown") {
          showCountdown(ov.message, ov.countdown_secs, ov.not_before);
        } else {
          showNote(ov.message);
        }
        if (typeof window.setMode === "function") {
          await window.setMode("landing");
        }
        return;
      }
      
      // Enhanced show_result logic with better error handling
      if (stage === "show_result"){
        hideOverlay();
        const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
        if (!changed || rendering) return;
        rendering = true;
        
        try {
          // STEP 1: Fetch the current data FIRST
          const c = await fetchJSON(RESULT_URL);
          
          // STEP 2: Apply the data to ensure BP value is set correctly
          if (!c.notModified && c.json) {
            applyCurrent(c.json);
          }
          
          // STEP 3: Small delay to ensure DOM updates are complete
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // STEP 4: THEN switch to result mode
          if (typeof window.setMode === "function") {
            await window.setMode("result");
          }
          
          lastRenderedEt = curEt;
          
          // Reset error count on successful result rendering
          pollErrorCount = 0;
          
        } catch (error) {
          console.error('[poll] Error in show_result:', error);
          pollErrorCount++;
          lastPollError = error;
          
          // Attempt recovery if too many errors
          if (pollErrorCount >= MAX_POLL_ERRORS) {
            console.warn('[poll] Too many errors, attempting recovery');
            await attemptRecovery();
          }
        } finally {
          rendering = false;
        }
        return;
      }
      
      hideOverlay(); 
      if (typeof window.setMode === "function") {
        await window.setMode("landing");
      }
      
      // Reset error count on successful poll
      pollErrorCount = 0;
      
    } catch(e){ 
      console.error('[poll] Error:', e);
      pollErrorCount++;
      lastPollError = e;
      
      // Attempt recovery if too many consecutive errors
      if (pollErrorCount >= MAX_POLL_ERRORS) {
        console.warn('[poll] Too many consecutive errors, attempting recovery');
        await attemptRecovery();
      }
    }
}

// Recovery mechanism for persistent errors
async function attemptRecovery() {
  try {
    console.log('[Recovery] Attempting system recovery...');
    
    // Force cleanup using durability manager if available
    if (typeof window.getHealthReport === "function") {
      const health = window.getHealthReport();
      console.log('[Recovery] Health report:', health);
    }
    
    // Reset application state
    hideOverlay();
    rendering = false;
    etag = null;
    baselineEt = null;
    lastRenderedEt = null;
    
    // Force return to landing mode
    if (typeof window.setMode === "function") {
      await window.setMode("landing");
    }
    
    // Reset error count after recovery attempt
    pollErrorCount = Math.floor(MAX_POLL_ERRORS / 2); // Don't fully reset to prevent infinite loops
    
    console.log('[Recovery] Recovery attempt completed');
    
  } catch (recoveryError) {
    console.error('[Recovery] Recovery failed:', recoveryError);
    
    // Last resort: consider page reload after too many failed recoveries
    if (pollErrorCount >= MAX_POLL_ERRORS * 2) {
      console.error('[Recovery] Critical failure - consider manual intervention');
      // Note: We don't auto-reload to avoid infinite reload loops
      // Staff should monitor for this message and manually refresh if needed
    }
  }
}

// Health monitoring function
function getPollingHealth() {
  return {
    errorCount: pollErrorCount,
    lastError: lastPollError ? {
      message: lastPollError.message,
      timestamp: Date.now()
    } : null,
    rendering: rendering,
    etag: etag,
    baselineEt: baselineEt,
    lastRenderedEt: lastRenderedEt
  };
}

// Enhanced initialization with better error handling
window.addEventListener("load", () => {
  // Enhanced render functions with error handling
  window.renderLanding = async () => { 
    try {
      hideOverlay(); 
      if (typeof window.setMode === "function") {
        await window.setMode("landing");
      }
    } catch (error) {
      console.error('[renderLanding] Error:', error);
    }
  };
  
  window.renderDashboard = async (c) => { 
    try {
      hideOverlay(); 
      if (typeof window.setMode === "function") {
        await window.setMode("result");
      }
      applyCurrent(c || {});
    } catch (error) {
      console.error('[renderDashboard] Error:', error);
    }
  };
  
  // Expose health monitoring
  window.getPollingHealth = getPollingHealth;
  
  // Initialize
  window.renderLanding?.();
  
  // Start polling with durability enhancements
  setInterval(pollWithDurability, 2000);
  
  // Additional health check every 30 seconds
  setInterval(() => {
    const health = getPollingHealth();
    if (health.errorCount > 5) {
      console.warn('[Health Check] High error count detected:', health);
    }
  }, 30000);
});