/* TV-1 kiosk adapter + state poller (always-show overlay on in_progress) */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

function log(...a){ console.log("[TV1]", ...a); }
const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");
let timer = null;

function hideOverlay(){
  if (ovEl) ovEl.style.display = "none";
  if (ovCnt) ovCnt.style.display = "none";
  if (timer){ clearInterval(timer); timer = null; }
}
function showNoteOverlay(msg){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  ovMsg.textContent = msg || "Please complete your survey questions.";
  ovCnt.style.display = "none";
}
function showCountdownOverlay(msg, secs, notBeforeIso){
  if (!ovEl) return;
  ovEl.style.display = "flex";
  ovMsg.textContent = msg || "Loading your result…";
  ovCnt.style.display = "block";
  const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs||3)*1000);
  function tick(){
    const remain = Math.max(0, target - Date.now());
    ovCnt.textContent = String(Math.ceil(remain/1000));
    if (remain <= 0 && timer){ clearInterval(timer); timer = null; }
  }
  if (timer) clearInterval(timer);
  tick(); timer = setInterval(tick, 200);
}

function expired(state){
  const exp = Date.parse(state?.expires_at || "");
  return !Number.isFinite(exp) || Date.now() > exp;
}
async function j(url){ const r = await fetch(url + "?t=" + Date.now(), {cache:"no-cache"}); return r.json(); }

function applyCurrentJson(cur){
  try{
    const bp = Number(cur?.bp ?? 0);
    const top = Array.isArray(cur?.intensity_top) ? cur.intensity_top : [];
    const num = document.getElementById("bpValueNumber");
    if (num && Number.isFinite(bp)) num.textContent = bp.toFixed(2);
    if (typeof window.updateTopElements === "function") window.updateTopElements(top.slice(0,3));
    if (typeof window.updateBarChart   === "function") window.updateBarChart(top.slice(0,10));
    if (typeof window.updateDistributionChart === "function" && Number.isFinite(bp)) window.updateDistributionChart(bp);
  }catch(e){ console.error("applyCurrentJson:", e); }
}

async function poll(){
  try{
    const state = await j(STATE_URL);
    log("state:", state);

    if (expired(state)){
      hideOverlay();
      window.setMode?.("landing");
      return;
    }

    const stage = state.stage || "idle";
    const ov = state.overlay || {};

    if (stage === "idle"){
      hideOverlay();
      window.setMode?.("landing");
      return;
    }

    if (stage === "in_progress"){
      // Always render overlay on every poll while in_progress (no stage-change dependency)
      if (ov.type === "countdown"){
        showCountdownOverlay(ov.message, ov.countdown_secs, ov.not_before);
      } else {
        showNoteOverlay(ov.message);
      }
      window.setMode?.("landing");
      return;
    }

    if (stage === "show_result"){
      hideOverlay();
      const cur = await j(RESULT_URL);
      log("current:", cur);
      window.setMode?.("result");
      applyCurrentJson(cur);
      return;
    }

    // Fallback
    hideOverlay();
    window.setMode?.("landing");
  }catch(e){
    console.warn("[TV1] poll error:", e);
  }
}

window.addEventListener("load", () => {
  console.log("[TV1] kiosk poller loaded (always-overlay mode)");
  poll();
  setInterval(poll, 1200);
});
