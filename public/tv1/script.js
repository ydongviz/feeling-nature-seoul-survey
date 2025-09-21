/* TV-1 kiosk adapter + state poller (production, hardened) */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl  = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");

let etag = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;
let pollTimer = null;
let baseIntervalMs = 2000;
let backoffMs = 0;           // grows on failures, resets on success
let maxBackoffMs = 15000;    // cap

function hideOverlay(){
  if (ovEl) ovEl.style.display = "none";
  if (ovCnt) ovCnt.style.display = "none";
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
    const r = Math.max(0, target - Date.now());
    ovCnt.textContent = String(Math.ceil(r/1000));
    if (r <= 0 && pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  }
  tick();
  const id = setInterval(tick, 200);
  // keep this countdown local; don't reuse global timer ids
  setTimeout(() => clearInterval(id), (secs||3)*1000 + 1200);
}

function expired(s){
  const v = s && s.expires_at;
  if (!v) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && Date.now() > t;
}

// --- fetch helpers with timeout and ETag support ---
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options; // 5s hard timeout
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchJSON(url, et){
  const headers = et ? { "If-None-Match": et } : {};
  const res = await fetchWithTimeout(url, { cache: "no-cache", headers, timeout: 7000 });
  if (res.status === 304) return { notModified: true, et };
  const nextEt = res.headers.get("ETag");
  const json   = await res.json();
  return { json, et: nextEt };
}

// --- main apply / stage handling ---
function applyCurrent(cur){
  try {
    const bp  = Number(cur?.bp ?? 0);
    const top = Array.isArray(cur?.intensity_top) ? cur.intensity_top : [];
    if (Number.isFinite(bp) && typeof window.setUserBp === "function") {
      window.RAW_BP_VALUE = bp;
      window.setUserBp(bp);     // normalization + DOM updates handled in app.js
    }
    if (typeof window.updateDashboardDisplay === "function") {
      window.updateDashboardDisplay({
        bp,
        intensities: cur?.intensities || {},
        intensity_top: top,
        distribution: cur?.distribution || null
      });
    }
  } catch (e) {
    console.error("[applyCurrent] Error:", e);
  }
}

// --- polling loop with backoff ---
async function pollOnce(){
  try {
    // fast-fail if currently applying a result
    if (rendering) return;

    const s = await fetchJSON(STATE_URL, etag);
    if (s.notModified) { backoffMs = 0; return; }
    if (s.et) etag = s.et;
    const curEt = s.et || null;

    const st = s.json || {};
    // compute a canonical "stage"
    let stage = st.stage || st.state || "idle";
    if (stage === "landing")   stage = "idle";
    if (stage === "countdown") stage = "in_progress";

    // overlay synthesis (if Lambda didn’t provide one)
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

    // baseline for result replay protection
    if (baselineEt === null) {
      baselineEt = curEt;
    }

    // handle expired -> land
    if (expired(st)) { hideOverlay(); window.setMode?.("landing"); backoffMs = 0; return; }

    // idle/in_progress overlays
    if (stage === "idle") {
      hideOverlay();
      window.setMode?.("landing");
      backoffMs = 0;
      return;
    }

    if (stage === "in_progress") {
      if (ov.type === "countdown") showCountdown(ov.message, ov.countdown_secs, ov.not_before);
      else showNote(ov.message);
      window.setMode?.("landing");
      backoffMs = 0;
      return;
    }

    // show_result path: fetch current FIRST, then flip mode
    if (stage === "show_result") {
      hideOverlay();

      const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
      if (!changed || rendering) { backoffMs = 0; return; }

      rendering = true;
      try {
        const c = await fetchJSON(RESULT_URL);
        if (!c.notModified && c.json) {
          applyCurrent(c.json);
        }
        // allow DOM to settle
        await new Promise(r => setTimeout(r, 200));
        await window.setMode?.("result");
        lastRenderedEt = curEt;
      } finally {
        rendering = false;
      }
      backoffMs = 0;
      return;
    }

    // any unknown state -> land
    window.setMode?.("landing");
    backoffMs = 0;

  } catch (e) {
    // Network hiccup: do not flip modes; show a gentle note and back off a bit
    console.error("[poll] Error:", e);
    showNote(navigator.onLine ? "Network issue — showing landing loop" : "Offline — showing landing loop");
    backoffMs = Math.min(maxBackoffMs, (backoffMs || 2000) * 1.5);
  }
}

function scheduleNextPoll(){
  clearTimeout(pollTimer);
  const delay = baseIntervalMs + (backoffMs || 0);
  pollTimer = setTimeout(async () => {
    await pollOnce();
    scheduleNextPoll();
  }, delay);
}

// online/offline hints (optional nicety)
window.addEventListener("online",  () => { hideOverlay(); backoffMs = 0; });
window.addEventListener("offline", () => { showNote("Offline — showing landing loop"); });

window.addEventListener("load", () => {
  // Expose helpers for manual rendering if needed
  window.renderLanding   = async () => { hideOverlay(); window.setMode?.("landing"); };
  window.renderDashboard = async (c)  => { hideOverlay(); window.setMode?.("result"); applyCurrent(c||{}); };

  // initial state
  window.renderLanding?.();
  scheduleNextPoll();
});

