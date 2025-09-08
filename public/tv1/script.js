/* TV-1 kiosk adapter + state poller (debug) */
const DEBUG = true;
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

function log(...a){ if(DEBUG) console.log("[TV1]", ...a); }
function $(id){ return document.getElementById(id); }

const overlay = { el: $("#kioskOverlay"), msg: $("#kioskMsg"), cnt: $("#kioskCount") };
let countdownTimer = null;
let currentStage = null;

/* overlay helpers */
function hideOverlay(){
  if (overlay.el) overlay.el.style.display = "none";
  if (overlay.cnt) overlay.cnt.style.display = "none";
  if (countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; }
}
function showNoteOverlay(message){
  if (!overlay.el) return;
  overlay.el.style.display = "flex";
  overlay.msg.textContent = message || "Please complete your survey questions.";
  overlay.cnt.style.display = "none";
}
function showCountdownOverlay(message, secs, notBeforeIso){
  if (!overlay.el) return;
  overlay.el.style.display = "flex";
  overlay.msg.textContent = message || "Loading your result…";
  overlay.cnt.style.display = "block";
  const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs||3)*1000);
  function tick(){
    const remain = Math.max(0, target - Date.now());
    overlay.cnt.textContent = String(Math.ceil(remain/1000));
    if (remain <= 0 && countdownTimer){ clearInterval(countdownTimer); countdownTimer = null; }
  }
  if (countdownTimer) clearInterval(countdownTimer);
  tick(); countdownTimer = setInterval(tick, 200);
}

/* utils */
function isExpired(state){
  const exp = Date.parse(state?.expires_at || "");
  return !Number.isFinite(exp) || Date.now() > exp;
}
async function fetchJSONFresh(url){
  // force re-fetch (avoid any caching issues)
  const r = await fetch(url + "?t=" + Date.now(), { cache: "no-cache" });
  return await r.json();
}

/* wire current.json into your app */
function applyCurrentJson(current){
  try{
    const bp = Number(current?.bp ?? 0);
    const top = Array.isArray(current?.intensity_top) ? current.intensity_top : [];
    const n = document.getElementById("bpValueNumber");
    if (n && Number.isFinite(bp)) n.textContent = bp.toFixed(2);
    if (typeof window.updateTopElements === "function") window.updateTopElements(top.slice(0,3));
    if (typeof window.updateBarChart   === "function") window.updateBarChart(top.slice(0,10));
    if (typeof window.updateDistributionChart === "function" && Number.isFinite(bp)) window.updateDistributionChart(bp);
  } catch(e){ console.error("applyCurrentJson error:", e); }
}

/* main poll */
async function pollState(){
  try{
    const state = await fetchJSONFresh(STATE_URL);
    log("fetched state:", state);

    if (isExpired(state)){
      if (currentStage !== "idle"){ currentStage = "idle"; hideOverlay(); window.setMode && window.setMode("landing"); }
      return;
    }

    const stage = state.stage || "idle";
    const ov = state.overlay || {};
    if (stage !== currentStage){ log("stage →", stage); currentStage = stage; }

    if (stage === "idle"){
      hideOverlay(); window.setMode && window.setMode("landing"); return;
    }
    if (stage === "in_progress"){
      if (ov.type === "note"){ showNoteOverlay(ov.message); window.setMode && window.setMode("landing"); return; }
      if (ov.type === "countdown"){ showCountdownOverlay(ov.message, ov.countdown_secs, ov.not_before); window.setMode && window.setMode("landing"); return; }
      hideOverlay(); window.setMode && window.setMode("landing"); return;
    }
    if (stage === "show_result"){
      hideOverlay();
      const current = await fetchJSONFresh(RESULT_URL);
      log("fetched current:", current);
      window.setMode && window.setMode("result");
      applyCurrentJson(current);
      return;
    }

    hideOverlay(); window.setMode && window.setMode("landing");
  }catch(e){
    console.warn("[TV1] state poll error:", e);
  }
}

/* expose hooks + start */
window.addEventListener("load", () => {
  log("kiosk poller loaded (debug mode)");
  window.renderLanding   = async () => { hideOverlay(); window.setMode && window.setMode("landing"); };
  window.renderDashboard = async (c)  => { hideOverlay(); window.setMode && window.setMode("result"); applyCurrentJson(c||{}); };
  pollState();
  setInterval(pollState, 1200);
});
