/* TV-1 kiosk adapter + state poller (production) - BILINGUAL DISPLAY */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null, etag = null, stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

// Simplified: Show both languages together
const BILINGUAL_TEXTS = {
  survey: `Please complete your survey questions!<br>설문 조사를 완료해 주세요!`,
  loading: `Loading your result…<br>결과를 불러오는 중…`
};

function hideOverlay(){ 
  if(ovEl) ovEl.style.display="none"; 
  if(ovCnt) ovCnt.style.display="none"; 
  if(timer){clearInterval(timer); timer=null;} 
}

function showNote(msg){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  
  if (ovMsg) ovMsg.innerHTML = msg || BILINGUAL_TEXTS.survey;
  if (ovCnt) ovCnt.style.display = "none";
}

function showCountdown(msg, secs, notBeforeIso){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  
  if (ovMsg) ovMsg.innerHTML = msg || BILINGUAL_TEXTS.loading;
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
    
    // Keep the dashboard language logic for the main UI
    const uiLanguage = language === 'Korean' || language === 'ko' ? 'ko' : 'en';
    
    if (typeof window.updateUILanguage === "function") {
      window.updateUILanguage(uiLanguage);
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

    let stage = st.stage || st.state || "idle";
    if (stage === "landing")   stage = "idle";
    if (stage === "countdown") stage = "in_progress";

    let ov = st.overlay;
    if (!ov || typeof ov !== "object") {
      if (st.state === "countdown") {
        ov = { type:"countdown", message: st.message || BILINGUAL_TEXTS.loading, not_before: st.countdown_end };
      } else if (st.state === "in_progress") {
        ov = { type:"note", message: st.message || BILINGUAL_TEXTS.survey };
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
      if (ov.type === "countdown") {
        showCountdown(ov.message, ov.countdown_secs, ov.not_before);
      } else {
        showNote(ov.message);
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