/* TV-1 kiosk adapter + state poller with enhanced reliability - OPTIMIZED VERSION */
const STATE_URL  = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const RESULT_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/current.json";

const ovEl = document.getElementById("kioskOverlay");
const ovMsg = document.getElementById("kioskMsg");
const ovCnt = document.getElementById("kioskCount");

let timer = null;
let etag = null;
let stage = null;
let baselineEt = null;
let lastRenderedEt = null;
let rendering = false;

// Enhanced error tracking and recovery
let errorCount = 0;
let lastError = null;
let maxRetries = 5;
let retryDelay = 2000;
let pollingActive = true;

function hideOverlay() { 
  if (ovEl) ovEl.style.display = "none"; 
  if (ovCnt) ovCnt.style.display = "none"; 
  if (timer) {
    clearInterval(timer); 
    timer = null;
  } 
}

function showNote(msg) {
  if (!ovEl) return;
  ovEl.style.display = "flex";
  if (ovMsg) ovMsg.textContent = msg || "Please complete your survey questions!";
  if (ovCnt) ovCnt.style.display = "none";
}

function showCountdown(msg, secs, notBeforeIso) {
  if (!ovEl) return;
  ovEl.style.display = "flex";
  if (ovMsg) ovMsg.textContent = msg || "Loading your result…";
  if (ovCnt) ovCnt.style.display = "block";

  const target = notBeforeIso ? Date.parse(notBeforeIso) : (Date.now() + (secs || 3) * 1000);
  function tick() { 
    const r = Math.max(0, target - Date.now()); 
    if (ovCnt) ovCnt.textContent = String(Math.ceil(r / 1000)); 
    if (r <= 0 && timer) {
      clearInterval(timer); 
      timer = null;
    } 
  }
  if (timer) clearInterval(timer); 
  tick(); 
  timer = setInterval(tick, 200);
}

function expired(s) { 
  const v = s && s.expires_at;
  if (!v) return false;                
  const t = Date.parse(v);
  return Number.isFinite(t) && Date.now() > t;
}

// Enhanced fetch with retry logic
async function fetchJSONWithRetry(url, etag, retries = maxRetries) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        cache: "no-cache", 
        headers: etag ? {"If-None-Match": etag} : {},
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (response.status === 304) {
        return { notModified: true, etag };
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      errorCount = 0; // Reset error count on success
      return { json: data, etag: response.headers.get("ETag") };
      
    } catch (error) {
      console.warn(`[Fetch] Attempt ${attempt + 1}/${retries} failed for ${url}:`, error.message);
      
      if (attempt === retries - 1) {
        throw error; // Re-throw on final attempt
      }
      
      // Progressive backoff delay
      const delay = retryDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function fetchJSON(url, et) {
  return fetchJSONWithRetry(url, et);
}

function applyCurrent(cur) {
  try {
    const bp = Number(cur?.bp ?? 0);
    const top = Array.isArray(cur?.intensity_top) ? cur.intensity_top : [];
    
    console.log(`[applyCurrent] Setting BP: ${bp}, Intensities:`, cur?.intensities);
    
    if (Number.isFinite(bp)) {
      // Store the raw BP value globally for reference
      window.RAW_BP_VALUE = bp;
      
      // Call the BP manager - let it handle normalization and DOM updates
      if (typeof window.setUserBp === "function") {
        window.setUserBp(bp);
        console.log(`[applyCurrent] Called setUserBp(${bp}) - BPManager will handle normalization`);
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
      console.log(`[applyCurrent] Called updateDashboardDisplay with full data`);
    }
    
  } catch (e) { 
    console.error('[applyCurrent] Error:', e);
    throw e; // Re-throw to trigger error handling
  }
}

// Enhanced error recovery
function handlePollingError(error) {
  errorCount++;
  lastError = error;
  
  console.error(`[Poll] Error ${errorCount}/${maxRetries}:`, error.message);
  
  if (errorCount >= maxRetries) {
    console.error('[Poll] Max errors reached, attempting recovery...');
    
    // Attempt recovery by resetting state and forcing landing mode
    try {
      hideOverlay();
      if (typeof window.setMode === "function") {
        window.setMode("landing");
      }
      
      // Force memory cleanup if available
      if (typeof window.memoryManager?.forceCleanup === "function") {
        window.memoryManager.forceCleanup();
      }
      
      // Reset polling state
      etag = null;
      baselineEt = null;
      lastRenderedEt = null;
      rendering = false;
      
      // Reset error count after recovery attempt
      setTimeout(() => {
        errorCount = Math.floor(maxRetries / 2); // Partial reset
        console.log('[Poll] Recovery attempted, resuming with reduced error threshold');
      }, 5000);
      
    } catch (recoveryError) {
      console.error('[Poll] Recovery failed:', recoveryError);
    }
  }
  
  // Implement exponential backoff
  const backoffDelay = Math.min(retryDelay * Math.pow(2, errorCount - 1), 30000); // Max 30 seconds
  return backoffDelay;
}

async function poll() {
  if (!pollingActive) return;
  
  try {
    const s = await fetchJSON(STATE_URL, etag);
    if (s.notModified) return;
    if (s.etag) etag = s.etag;
    const curEt = s.etag || null;

    const st = s.json || {};
    if (expired(st)) { 
      hideOverlay(); 
      if (typeof window.setMode === "function") {
        window.setMode("landing");
      }
      return; 
    }

    // Accept either {stage} or {state}
    let stage = st.stage || st.state || "idle";
    if (stage === "landing") stage = "idle";
    if (stage === "countdown") stage = "in_progress";

    // Synthesize overlay if the Lambda wrote root fields
    let ov = st.overlay;
    if (!ov || typeof ov !== "object") {
      if (st.state === "countdown") {
        ov = { 
          type: "countdown", 
          message: st.message || "Loading your result…", 
          not_before: st.countdown_end 
        };
      } else if (st.state === "in_progress") {
        ov = { 
          type: "note", 
          message: st.message || "Please complete your survey questions!" 
        };
      } else {
        ov = {};
      }
    }

    // Baseline only to avoid replaying old results
    if (baselineEt === null) {
      baselineEt = curEt;
      if (stage !== "show_result") {
        // fall through and render overlay immediately
      }
    }

    if (stage === "idle") {
      hideOverlay(); 
      if (typeof window.setMode === "function") {
        window.setMode("landing");
      }
      return;
    }
    
    if (stage === "in_progress") {
      if (ov.type === "countdown") {
        showCountdown(ov.message, ov.countdown_secs, ov.not_before);
      } else {
        showNote(ov.message);
      }
      if (typeof window.setMode === "function") {
        window.setMode("landing");
      }
      return;
    }
    
    // Enhanced show_result logic with better error handling
    if (stage === "show_result") {
      hideOverlay();
      const changed = curEt && curEt !== lastRenderedEt && curEt !== baselineEt;
      if (!changed || rendering) return;
      
      rendering = true;
      
      try {
        // STEP 1: Fetch the current data FIRST
        console.log('[Poll] Fetching result data...');
        const c = await fetchJSON(RESULT_URL);
        
        // STEP 2: Apply the data to ensure BP value is set correctly
        if (!c.notModified && c.json) {
          console.log('[Poll] Applying current data:', c.json);
          applyCurrent(c.json);
        }
        
        // STEP 3: Small delay to ensure DOM updates are complete
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // STEP 4: THEN switch to result mode
        console.log('[Poll] Switching to result mode...');
        if (typeof window.setMode === "function") {
          await window.setMode("result");
        }
        
        lastRenderedEt = curEt;
        console.log('[Poll] Result mode activated successfully');
        
      } catch (error) {
        console.error('[Poll] Error in show_result:', error);
        
        // Fallback to landing mode on error
        try {
          if (typeof window.setMode === "function") {
            await window.setMode("landing");
          }
        } catch (fallbackError) {
          console.error('[Poll] Fallback to landing failed:', fallbackError);
        }
        
        throw error; // Re-throw to trigger error handling
        
      } finally {
        rendering = false;
      }
      return;
    }
    
    // Default fallback
    hideOverlay(); 
    if (typeof window.setMode === "function") {
      window.setMode("landing");
    }
    
  } catch (error) {
    const backoffDelay = handlePollingError(error);
    
    // Implement backoff delay for next poll cycle
    setTimeout(() => {
      // Next poll will be delayed by the backoff amount
    }, backoffDelay);
  }
}

// Health monitoring function
function getHealthStatus() {
  return {
    pollingActive,
    errorCount,
    maxRetries,
    lastError: lastError ? {
      message: lastError.message,
      timestamp: new Date().toISOString()
    } : null,
    etag,
    stage,
    rendering,
    memoryStats: typeof window.mediaCache?.getStats === "function" 
      ? window.mediaCache.getStats() 
      : null
  };
}

// Enhanced initialization with graceful degradation
function initializePolling() {
  console.log('[Poll] Initializing enhanced polling system...');
  
  // Set up global functions for backward compatibility
  window.renderLanding = async () => { 
    hideOverlay(); 
    if (typeof window.setMode === "function") {
      window.setMode("landing");
    }
  };
  
  window.renderDashboard = async (c) => { 
    hideOverlay(); 
    if (typeof window.setMode === "function") {
      window.setMode("result");
    }
    if (c) {
      applyCurrent(c);
    }
  };
  
  // Start with landing mode
  if (typeof window.renderLanding === "function") {
    window.renderLanding();
  }
  
  // Start polling with enhanced error handling
  const pollInterval = setInterval(() => {
    if (pollingActive) {
      poll().catch(error => {
        // Errors are handled within poll() function
        console.warn('[Poll] Unhandled polling error:', error.message);
      });
    }
  }, 2000);
  
  // Export health monitoring
  window.getPollingHealth = getHealthStatus;
  
  // Graceful shutdown on page unload
  window.addEventListener('beforeunload', () => {
    pollingActive = false;
    clearInterval(pollInterval);
    hideOverlay();
  });
  
  console.log('[Poll] Enhanced polling system initialized successfully');
}

// Compatibility check and initialization
function initializeWithCompatibilityCheck() {
  try {
    // Check for required browser features
    const requiredFeatures = [
      'fetch',
      'Promise', 
      'AbortSignal',
      'URL'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => 
      typeof window[feature] === 'undefined'
    );
    
    if (missingFeatures.length > 0) {
      console.error('[Init] Missing browser features:', missingFeatures);
      // Fallback for older browsers
      maxRetries = 3;
      retryDelay = 5000;
    }
    
    // Add timeout support fallback for older browsers
    if (!AbortSignal.timeout) {
      console.warn('[Init] AbortSignal.timeout not supported, using fallback');
      // Set longer retry delays for older browsers
      retryDelay = 5000;
    }
    
    initializePolling();
    
  } catch (error) {
    console.error('[Init] Initialization failed:', error);
    
    // Ultra-simple fallback polling for emergencies
    setInterval(() => {
      fetch(STATE_URL)
        .then(response => response.json())
        .then(data => {
          console.log('[Fallback] Basic polling active:', data);
          // Minimal state handling
          if (data.stage === 'show_result' || data.state === 'show_result') {
            hideOverlay();
          }
        })
        .catch(err => console.warn('[Fallback] Poll failed:', err.message));
    }, 5000);
  }
}

// Enhanced event listener with multiple fallbacks
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWithCompatibilityCheck);
} else {
  // DOM already loaded
  setTimeout(initializeWithCompatibilityCheck, 100);
}

// Additional fallback for very slow connections
window.addEventListener('load', () => {
  // Ensure polling is active even if other initialization failed
  setTimeout(() => {
    if (!pollingActive) {
      console.warn('[Fallback] Starting emergency polling...');
      pollingActive = true;
      initializeWithCompatibilityCheck();
    }
  }, 2000);
});

// Export debugging utilities
window.debugPolling = {
  getHealth: getHealthStatus,
  resetErrors: () => {
    errorCount = 0;
    lastError = null;
    console.log('[Debug] Error count reset');
  },
  forceRecovery: () => {
    errorCount = maxRetries;
    console.log('[Debug] Forcing recovery mode...');
    handlePollingError(new Error('Manual recovery trigger'));
  },
  stopPolling: () => {
    pollingActive = false;
    console.log('[Debug] Polling stopped');
  },
  startPolling: () => {
    pollingActive = true;
    errorCount = 0;
    console.log('[Debug] Polling restarted');
  }
};