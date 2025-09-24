/* TV-1 kiosk adapter + state poller (production) - BILINGUAL VERSION - FIXED */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null, etag = null, stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

const KIOSK_TEXTS = {
  en: {
    survey: "Please complete your survey questions!",
    loading: "Loading your result…"
  },
  ko: {
    survey: "설문 조사를 완료해 주세요!",
    loading: "결과를 불러오는 중…"
  }
};

// ADDED: Track current language globally in script.js
let currentKioskLanguage = 'en';

function hideOverlay(){ if(ovEl) ovEl.style.display="none"; if(ovCnt) ovCnt.style.display="none"; if(timer){clearInterval(timer); timer=null;} }

// FIXED: Always use current language from global state
function showNote(msg, language = null){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    
    // FIXED: Use global currentKioskLanguage as fallback
    const lang = language || currentKioskLanguage || 'en';
    const defaultMsg = KIOSK_TEXTS[lang]?.survey || KIOSK_TEXTS.en.survey;
    
    if (ovMsg) ovMsg.textContent = msg || defaultMsg;
    if (ovCnt) ovCnt.style.display = "none";
}

// FIXED: Always use current language from global state
function showCountdown(msg, secs, notBeforeIso, language = null){
    if (!ovEl) return;
    ovEl.style.display = "flex";
    
    // FIXED: Use global currentKioskLanguage as fallback
    const lang = language || currentKioskLanguage || 'en';
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
    
    // FIXED: Update language tracking FIRST and more reliably
    const newLanguage = language === 'Korean' || language === 'ko' ? 'ko' : 'en';
    if (newLanguage !== currentKioskLanguage) {
      currentKioskLanguage = newLanguage;
      console.log(`[applyCurrent] Language changed to: ${currentKioskLanguage} (from: ${language})`);
    }
    
    // CRITICAL: Update TV UI language BEFORE updating dashboard
    if (typeof window.updateUILanguage === "function") {
      window.updateUILanguage(currentKioskLanguage);
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

      // FIXED: Check for language info in state and update tracking FIRST
      if (st.language) {
        const newLanguage = st.language === 'Korean' || st.language === 'ko' ? 'ko' : 'en';
        if (newLanguage !== currentKioskLanguage) {
          currentKioskLanguage = newLanguage;
          console.log(`[poll] Language detected in state: ${currentKioskLanguage} (from: ${st.language})`);
        }
      }
  
      // Accept either {stage} or {state}
      let stage = st.stage || st.state || "idle";
      if (stage === "landing")   stage = "idle";
      if (stage === "countdown") stage = "in_progress";
  
      // FIXED: Synthesize overlay with current language
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
        // FIXED: Always pass current language to overlay functions
        if (ov.type === "countdown") {
          showCountdown(ov.message, ov.countdown_secs, ov.not_before, currentKioskLanguage);
        } else {
          showNote(ov.message, currentKioskLanguage);
        }
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