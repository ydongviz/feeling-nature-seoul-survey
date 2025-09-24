/* TV-1 kiosk adapter + state poller (production) - BILINGUAL VERSION */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null, etag = null, stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

// FIXED: Correct Korean text encoding using Unicode escapes
const KIOSK_TEXTS = {
  en: {
    survey: "Please complete your survey questions!",
    loading: "Loading your result…"
  },
  ko: {
    survey: "\uc124\ubb38 \uc870\uc0ac\ub97c \uc644\ub8cc\ud574 \uc8fc\uc138\uc694!",
    loading: "\uacb0\uacfc\ub97c \ubd88\ub7ec\uc624\ub294 \uc911…"
  }
};

// ADDED: Track current language globally in script.js
let currentKioskLanguage = 'en';

function hideOverlay(){ if(ovEl) ovEl.style.display="none"; if(ovCnt) ovCnt.style.display="none"; if(timer){clearInterval(timer); timer=null;} }

function showNote(msg, language = null){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    
    // FIXED: Use passed language parameter or fallback to tracked language
    const lang = language || currentKioskLanguage || window.app?.ui?.currentLanguage || 'en';
    const defaultMsg = KIOSK_TEXTS[lang]?.survey || KIOSK_TEXTS.en.survey;
    
    if (ovMsg) ovMsg.textContent = msg || defaultMsg;
    if (ovCnt) ovCnt.style.display = "none";
}

function showCountdown(msg, secs, notBeforeIso, language = null){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    
    // FIXED: Use passed language parameter or fallback to tracked language
    const lang = language || currentKioskLanguage || window.app?.ui?.currentLanguage || 'en';
    const defaultMsg = KIOSK_TEXTS[lang]?.loading || KIOSK_TEXTS.en.loading;
    
    if (ovMsg) ovMsg.textContent = msg || defaultMsg;
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
    const language = cur?.language || 'English'; // Get language from response
    
    // FIXED: Update language tracking FIRST
    currentKioskLanguage = language === 'Korean' ? 'ko' : 'en';
    
    // CRITICAL: Update TV UI language BEFORE updating dashboard
    if (typeof window.updateUILanguage === "function") {
      window.updateUILanguage(currentKioskLanguage);
      //console.log(`[applyCurrent] Updated UI language to: ${currentKioskLanguage}`);
    }
    
    if (Number.isFinite(bp)) {
      // Store the raw BP value globally for reference
      window.RAW_BP_VALUE = bp;
      
      // ONLY call the BP manager - let it handle normalization and DOM updates
      if (typeof window.setUserBp === "function") {
        window.setUserBp(bp);
      }
    }
    
    // FIXED: Pass full data object to dashboard manager for proper filtering
    if (typeof window.updateDashboardDisplay === "function") {
      window.updateDashboardDisplay({
        bp: bp,
        intensities: cur?.intensities || {},
        intensity_top: cur?.intensity_top || [],
        distribution: cur?.distribution || null
      });
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

      // ADDED: Check if language info is available in state and update tracking
      if (st.language) {
        currentKioskLanguage = st.language === 'Korean' ? 'ko' : 'en';
      }
  
      // Accept either {stage} or {state}
      let stage = st.stage || st.state || "idle";
      if (stage === "landing")   stage = "idle";
      if (stage === "countdown") stage = "in_progress";
  
      // Synthesize overlay if the Lambda wrote root fields
      let ov = st.overlay;
      if (!ov || typeof ov !== "object") {
        if (st.state === "countdown") {
          ov = { type:"countdown", message: st.message || KIOSK_TEXTS[currentKioskLanguage]?.loading, not_before: st.countdown_end };
        } else if (st.state === "in_progress") {
          ov = { type:"note", message: st.message || KIOSK_TEXTS[currentKioskLanguage]?.survey };
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
        // FIXED: Pass language to overlay functions
        if (ov.type === "countdown") showCountdown(ov.message, ov.countdown_secs, ov.not_before, currentKioskLanguage);
        else showNote(ov.message, currentKioskLanguage);
        window.setMode?.("landing"); return;
      }
      
      // show_result logic
      if (stage === "show_result"){
        hideOverlay();
        const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
        if (!changed || rendering) return;
        rendering = true;
        
        try {
          const c = await fetchJSON(RESULT_URL);
          
          if (!c.notModified && c.json) {
            applyCurrent(c.json);
          }
          await window.setMode?.("result");
          
          // Give map time to render
          await new Promise(resolve => setTimeout(resolve, 800));
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