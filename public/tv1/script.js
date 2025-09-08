/*  TV-1 kiosk adapter + state poller
    ------------------------------------------------------------
    Assumptions:
    - Your main app (app.js) defines:
        - setMode('landing' | 'result')
        - updateTopElements(topArray?)         // optional
        - updateBarChart(topArray?)            // optional
        - updateDistributionChart(bpNumber?)   // optional
    - The landing/dashboard DOM is created by app.js when setMode() runs.
    - If your app created dev buttons (“Landing”, “Show result”), we hide them here.
*/

console.log("[TV1] kiosk poller loaded");
window.kioskDebug = {
  note: (m="Test overlay") => (document.getElementById("kioskOverlay").style.display="flex",
                               document.getElementById("kioskMsg").textContent=m,
                               document.getElementById("kioskCount").style.display="none"),
  countdown: (m="Loading…", secs=3) => {
    const ov = document.getElementById("kioskOverlay");
    const msg = document.getElementById("kioskMsg");
    const cnt = document.getElementById("kioskCount");
    ov.style.display="flex"; msg.textContent=m; cnt.style.display="block";
    const t = Date.now()+secs*1000;
    const h = setInterval(()=>{ const s=Math.max(0,Math.ceil((t-Date.now())/1000)); cnt.textContent=String(s); if(s<=0) clearInterval(h);}, 200);
  }
};


// ============= Small helpers =============
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

function $(id) { return document.getElementById(id); }
const overlayEl = $("#kioskOverlay");
const overlayMsg = $("#kioskMsg");
const overlayCount = $("#kioskCount");

let countdownTimer = null;
let lastETag = null;
let currentStage = null;

// Remove any dev/test buttons your app might render
function removeDevButtons() {
  // try common patterns; harmless if none exist
  const texts = ["Landing", "Show result", "Show Result", "Result"];
  const btns = Array.from(document.querySelectorAll("button, .btn, [role='button']"));
  btns.forEach(b => {
    const t = (b.textContent || "").trim();
    if (texts.includes(t)) b.style.display = "none";
  });
}

// ============= Overlay controls =============
function hideOverlay() {
  if (overlayEl) overlayEl.style.display = "none";
  if (overlayCount) overlayCount.style.display = "none";
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

function showNoteOverlay(message) {
  if (!overlayEl) return;
  overlayEl.style.display = "flex";
  overlayMsg.textContent = message || "Please complete your survey questions.";
  overlayCount.style.display = "none";
}

function showCountdownOverlay(message, secs, notBeforeIso) {
  if (!overlayEl) return;
  overlayEl.style.display = "flex";
  overlayMsg.textContent = message || "Loading your result…";
  overlayCount.style.display = "block";

  const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs || 3) * 1000);
  function tick() {
    const remain = Math.max(0, target - Date.now());
    overlayCount.textContent = String(Math.ceil(remain / 1000));
    if (remain <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }
  if (countdownTimer) clearInterval(countdownTimer);
  tick();
  countdownTimer = setInterval(tick, 200);
}

// ============= App glue (hooks the poller into your app) =============
function applyCurrentJson(current) {
  try {
    const bp = Number(current?.bp ?? 0);
    const top = Array.isArray(current?.intensity_top) ? current.intensity_top : [];

    // Update BP number if your HTML exposes it
    const num = document.getElementById("bpValueNumber");
    if (num && Number.isFinite(bp)) num.textContent = bp.toFixed(2);

    // Let your existing helpers render icons/bars/distribution if they exist
    if (typeof window.updateTopElements === "function") window.updateTopElements(top.slice(0, 3));
    if (typeof window.updateBarChart   === "function") window.updateBarChart(top.slice(0, 10));
    if (typeof window.updateDistributionChart === "function" && Number.isFinite(bp)) {
      window.updateDistributionChart(bp);
    }
  } catch (e) {
    console.error("applyCurrentJson error:", e);
  }
}

window.renderLanding = async function renderLanding() {
  hideOverlay();
  if (typeof window.setMode === "function") await window.setMode("landing");
};

window.renderDashboard = async function renderDashboard(current) {
  hideOverlay();
  if (typeof window.setMode === "function") await window.setMode("result");
  applyCurrentJson(current || {});
};

// ============= Polling loop (ETag-aware) =============
async function fetchJSON(url, etag) {
  const headers = etag ? { "If-None-Match": etag } : {};
  const res = await fetch(url, { cache: "no-cache", headers });
  if (res.status === 304) return { notModified: true, etag };
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return { json: await res.json(), etag: res.headers.get("ETag") };
}

function isExpired(state) {
  const exp = Date.parse(state?.expires_at || "");
  return !Number.isFinite(exp) || Date.now() > exp;
}

async function pollState() {
  try {
    const resp = await fetchJSON(STATE_URL, lastETag);
    if (resp.notModified) return;
    if (resp.etag) lastETag = resp.etag;

    const state = resp.json || {};
    const expired = isExpired(state);
    const stage = expired ? "idle" : (state.stage || "idle");
    const ov = state.overlay || {};

    // Stage transitions
    if (stage !== currentStage) currentStage = stage;

    if (stage === "idle") {
      hideOverlay();
      window.renderLanding?.();
      return;
    }

    if (stage === "in_progress") {
      if (ov.type === "note") {
        showNoteOverlay(ov.message || "Please complete your survey questions.");
        window.renderLanding?.();
      } else if (ov.type === "countdown") {
        showCountdownOverlay(ov.message || "Loading your result…", ov.countdown_secs || 3, ov.not_before);
        window.renderLanding?.();
      } else {
        hideOverlay();
        window.renderLanding?.();
      }
      return;
    }

    if (stage === "show_result") {
      hideOverlay();
      // Fetch current.json and render the dashboard
      try {
        const cur = await fetchJSON(RESULT_URL);
        window.renderDashboard?.(cur.json || {});
      } catch (e) {
        // If current.json missing temporarily, fall back to landing (will retry)
        console.warn("current.json fetch failed:", e);
        window.renderLanding?.();
      }
      return;
    }

    // Fallback
    hideOverlay();
    window.renderLanding?.();
  } catch (err) {
    // Network hiccup → keep last view
    console.warn("state poll error:", err);
  }
}

window.addEventListener("load", () => {
  removeDevButtons();         // hide any manual test controls
  window.renderLanding?.();   // draw Landing immediately
  pollState();
  setInterval(pollState, 1200); // steady poll with ETag
});
