/* DEBUG VERSION - Language Investigation */
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

// Global language tracking
let currentKioskLanguage = 'en';

function hideOverlay(){ 
  if(ovEl) ovEl.style.display="none"; 
  if(ovCnt) ovCnt.style.display="none"; 
  if(timer){clearInterval(timer); timer=null;} 
}

function showNote(msg, language = null){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  
  // DEBUG: Log all language sources
  console.log('[DEBUG showNote] Language sources:');
  console.log('  - Passed language:', language);
  console.log('  - currentKioskLanguage:', currentKioskLanguage);
  console.log('  - window.app?.ui?.currentLanguage:', window.app?.ui?.currentLanguage);
  
  const lang = language || currentKioskLanguage || window.app?.ui?.currentLanguage || 'en';
  const defaultMsg = KIOSK_TEXTS[lang]?.survey || KIOSK_TEXTS.en.survey;
  
  console.log(`[DEBUG showNote] Final language: ${lang}, Message: ${defaultMsg}`);
  
  if (ovMsg) ovMsg.textContent = msg || defaultMsg;
  if (ovCnt) ovCnt.style.display = "none";
}

function showCountdown(msg, secs, notBeforeIso, language = null){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  
  // DEBUG: Log all language sources
  console.log('[DEBUG showCountdown] Language sources:');
  console.log('  - Passed language:', language);
  console.log('  - currentKioskLanguage:', currentKioskLanguage);
  console.log('  - window.app?.ui?.currentLanguage:', window.app?.ui?.currentLanguage);
  
  const lang = language || currentKioskLanguage || window.app?.ui?.currentLanguage || 'en';
  const defaultMsg = KIOSK_TEXTS[lang]?.loading || KIOSK_TEXTS.en.loading;
  
  console.log(`[DEBUG showCountdown] Final language: ${lang}, Message: ${defaultMsg}`);
  
  if (ovMsg) ovMsg.textContent = msg || defaultMsg;
  if (ovCnt) ovCnt.style.display = "block";

  const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs||3)*1000);
  function tick(){ 
    const r=Math.max(0,target-Date.now()); 
    ovCnt.textContent=String(Math.ceil(r/1000)); 
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
  const r=await fetch(url,{cache:"no-cache", headers: et?{"If-None-Match":et}:{}}); 
  if(r.status===304) return {notModified:true, et}; 
  return {json:await r.json(), et:r.headers.get("ETag")}; 
}

function applyCurrent(cur){
  try{
    const bp = Number(cur?.bp ?? 0);
    const language = cur?.language || 'English';
    
    console.log(`[DEBUG applyCurrent] Raw language from response: ${language}`);
    
    // Update language tracking FIRST
    const newLanguage = language === 'Korean' || language === 'ko' ? 'ko' : 'en';
    if (newLanguage !== currentKioskLanguage) {
      currentKioskLanguage = newLanguage;
      console.log(`[DEBUG applyCurrent] Language changed to: ${currentKioskLanguage}`);
    }
    
    // Update TV UI language
    if (typeof window.updateUILanguage === "function") {
      window.updateUILanguage(currentKioskLanguage);
      console.log(`[DEBUG applyCurrent] Called updateUILanguage with: ${currentKioskLanguage}`);
    } else {
      console.warn('[DEBUG applyCurrent] window.updateUILanguage function not available');
    }
    
    if (Number.isFinite(bp)) {
      window.RAW_BP_VALUE = bp;
      if (typeof window.setUserBp === "function") {
        window.setUserBp(bp);
      }
    }
    
    if (typeof window.updateDashboardDisplay === "function") {
      window.updateDashboardDisplay({
        bp: bp,
        intensities: cur?.intensities || {},
        intensity_top: cur?.intensity_top || [],
        distribution: cur?.distribution || null
      });
    }
    
  } catch(e){ 
    console.error('[DEBUG applyCurrent] Error:', e);
  }
}

async function poll(){
  try{
    const s = await fetchJSON(STATE_URL, etag);
    if (s.notModified) return;
    if (s.et) etag = s.et;
    const curEt = s.et || null;

    const st = s.json || {};
    console.log('[DEBUG poll] State response:', st);
    
    if (expired(st)) { hideOverlay(); window.setMode?.("landing"); return; }

    // Check for language info in state
    if (st.language) {
      const newLanguage = st.language === 'Korean' || st.language === 'ko' ? 'ko' : 'en';
      if (newLanguage !== currentKioskLanguage) {
        currentKioskLanguage = newLanguage;
        console.log(`[DEBUG poll] Language detected in state: ${currentKioskLanguage} (from: ${st.language})`);
      }
    }

    let stage = st.stage || st.state || "idle";
    if (stage === "landing")   stage = "idle";
    if (stage === "countdown") stage = "in_progress";

    console.log(`[DEBUG poll] Stage: ${stage}`);

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

    if (baselineEt === null) {
      baselineEt = curEt;
    }

    if (stage === "idle"){
      hideOverlay(); window.setMode?.("landing"); return;
    }
    if (stage === "in_progress"){
      console.log('[DEBUG poll] Showing overlay with language:', currentKioskLanguage);
      if (ov.type === "countdown") {
        showCountdown(ov.message, ov.countdown_secs, ov.not_before, currentKioskLanguage);
      } else {
        showNote(ov.message, currentKioskLanguage);
      }
      window.setMode?.("landing"); return;
    }
    
    if (stage === "show_result"){
      hideOverlay();
      const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
      if (!changed || rendering) return;
      rendering = true;
      
      try {
        const c = await fetchJSON(RESULT_URL);
        console.log('[DEBUG poll] Current response:', c.json);
        
        if (!c.notModified && c.json) {
          applyCurrent(c.json);
        }
        await window.setMode?.("result");
        
        await new Promise(resolve => setTimeout(resolve, 800));
        if (window.app?.map) {
          window.app.map.resize();
          window.app.map.resize();
        }
        
        lastRenderedEt = curEt;
      } catch (error) {
        console.error('[DEBUG poll] Error in show_result:', error);
      } finally {
        rendering = false;
      }
      return;
    }
    
    hideOverlay(); window.setMode?.("landing");
  }catch(e){ 
    console.error('[DEBUG poll] Error:', e);
  }
}

window.addEventListener("load", () => {
  window.renderLanding   = async () => { hideOverlay(); window.setMode?.("landing"); };
  window.renderDashboard = async (c)  => { hideOverlay(); window.setMode?.("result"); applyCurrent(c||{}); };
  window.renderLanding?.();
  setInterval(poll, 2000);
});