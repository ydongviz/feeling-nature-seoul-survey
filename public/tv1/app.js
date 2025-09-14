// === RUNTIME BASE SHIM (injected) ==========================================
window.RUNTIME_BASE = window.RUNTIME_BASE || 'https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime';
window.APP_CONFIG  = window.APP_CONFIG  || { RUNTIME_BASE_URL: window.RUNTIME_BASE };
// ==========================================================================
/* EVENT-OPTIMIZED BIOPHILIC VISUALIZATION - INTEGRATED WITH SCRIPT3 FEATURES
   Complete integration of:
   1. Geo map to circular layout transition with polar coordinates
   2. Full animation sequence: BS→BP→highlight→circular→highlight final
   3. Distribution curve animation with tooltips from script3.js
*/

/* ========== CONFIGURATION ========== */
const MAX_DISTANCE_METERS = 15000;
window.HIGHLIGHT_MIN = window.HIGHLIGHT_MIN ?? 0.70;
window.HIGHLIGHT_MAX = window.HIGHLIGHT_MAX ?? 0.75;

const HIGHLIGHT_COLOR = '#92C043', NON_HIGHLIGHT_GRAY = '#666666';
const userBp = (window.app?.data?.userBp ?? 0.5);  // default only if not set yet


window.USE_CURRENT_JSON = true;

// Single source of truth for user BP pushed in from TV adapter
window.setUserBp = function setUserBp(bp) {// normalized BP -> center highlight band and repaint
const v = Number(bp) || 0;
const EPS = 0.01;
window.app = window.app || { state:{}, data:{} };
app.state.bpValue = v;
app.state.highlightMin = Math.max(0, v - EPS);
app.state.highlightMax = Math.min(1, v + EPS);
window.HIGHLIGHT_MIN = app.state.highlightMin;
window.HIGHLIGHT_MAX = app.state.highlightMax;

// footer number
const n = document.getElementById('bpValueNumber');
if (n) n.textContent = v.toFixed(2);

// repaint center viz layers if available
if (typeof window.refreshDotLayer === 'function') { try { window.refreshDotLayer(); } catch(_){} }
if (typeof window.updateLegend    === 'function') { try { window.updateLegend(); } catch(_){} }
if (typeof window.updateCenterViz === 'function') { try { window.updateCenterViz(); } catch(_){} }
};

const BP_GROUPS = [
  { min: 0.00, max: 0.25, color: '#92C043', name: 'Very Low (0-0.25)' },
  { min: 0.25, max: 0.50, color: '#92C043', name: 'Low (0.25-0.5)' },
  { min: 0.50, max: 0.75, color: '#92C043', name: 'Medium (0.5-0.75)' },
  { min: 0.75, max: 1.00, color: '#92C043', name: 'High (0.75-1.0)' }
];

const seoulData = {
  name: "Seoul",
  biomeName: "Temperate Forest",
  coordinates: { lat: 37.5503, lon: 126.9971 },
  dataFiles: {
    BS: "./data/SCL/Seoul_biophilic_setting_cleaned.csv",
    BP: "./data/SCL/Seoul_biophilic_setting_cleaned.csv"
  },
  BSDescription: 'The map shows how you perceive and value urban nature by quantifying and locating your Biophilic Individual Perceptions (BiP) value in the city.',
  BPDescription: 'The map shows how you perceive and value urban nature by quantifying and locating your Biophilic Individual Perceptions (BiP) value in the city.',
  dashboardDataPath: "./data/SCL/test_FNdashbaord.csv" 
};

// High value (→1) = close to #92C043; low (→0) = close to #151D07
colorScale = d3.scaleLinear().domain([0, 1]).range(["#151D07", "#92C043"]).clamp(true);
const sizeScale = d3.scaleLinear().domain([0, 0.2, 0.6, 0.8, 1]).range([0, 1, 2, 3, 6]);

/* ========== APPLICATION STATE ========== */
const Modes = { LANDING: 'landing', RESULT: 'result' };

const app = {
  mode: null,
  elements: {
    leftTop: null,
    rightCol: null,
    footer: null,
    mapContainer: null,
    canvas: null,
    buttons: null
  },
  state: {
    currentDataType: 'BS',
    isCircularView: false,
    isHighlightMode: false,
    animationInProgress: false
  },
  data: {
    cache: {},
    dashboardData: null,
    allParticipantsData: null
  },
  map: null,
  mapLoaded: false,
  landing: {
    active: false,
    currentGroup: null,
    intervalId: null
  },
  cleanup: {
    timers: new Set(),
    animations: new Set()
  },
  initialized: false,
  _initializing: false,
  _resizeListenerAdded: false
};

/* ========== PULSE ENGINE (Result-only, highlighted dots) ========== */
app.effects = app.effects || {};
app.effects.pulse = { active: false, raf: null, t0: 0, last: 0, period: 1200 };

// keep these in one place near the pulse engine
//const PULSE_BASE_AMP    = 0.35;   // set this to your CURRENT amplitude
const PULSE_BASE_PERIOD = 1200;   // set this to your CURRENT period (ms)

function colorWithPulse(d) {
  const pe = app.effects?.pulse || {};
  const bp = Number(app.state?.bpValue) || 0;
  
  // Only affect highlighted dots while the pulse is active
  if (!pe.active || !app.state?.isHighlightMode || !isHighlighted(d)) {
    // Return normal color for non-highlighted or when pulse is inactive
    if (!app.state.isHighlightMode) return colorScale(d.biophilia_norm);
    return isHighlighted(d) ? HIGHLIGHT_COLOR : NON_HIGHLIGHT_GRAY;
  }

  // Calculate pulse phase (same timing as before)
  const now = performance.now();
  const phase = ((now - pe.t0) % pe.period) / pe.period; // [0..1)
  
  // Create sinusoidal interpolation between colors
  const intensity = (1 + Math.sin(2 * Math.PI * phase)) / 2; // [0..1]
  
  // Interpolate between HIGHLIGHT_COLOR (#92C043) and NON_HIGHLIGHT_GRAY (#666666)
  return interpolateColor(HIGHLIGHT_COLOR, NON_HIGHLIGHT_GRAY, intensity);
}

function interpolateColor(color1, color2, t) {
  // Parse hex colors
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  // Interpolate each channel
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  // Convert back to hex
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}


function startPulseLoop() {
  const pe = app.effects.pulse;
  if (pe.raf) return;               // already running
  pe.active = true;
  pe.t0 = performance.now();
  pe.last = pe.t0;
  pe.period = PULSE_BASE_PERIOD;    

  const tick = () => {
    if (!pe.active) { pe.raf = null; return; }
    const now = performance.now();
    if (now - pe.last > 42) {       // ~24fps redraw
      const data = app.data.cache[`seoul_${app.state.currentDataType}`];
      if (data) updateVisualizationCanvas(data, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      pe.last = now;
    }
    pe.raf = requestAnimationFrame(tick);
    if (app.cleanup?.animations) app.cleanup.animations.add(pe.raf);
  };
  pe.raf = requestAnimationFrame(tick);
}

function stopPulseLoop() {
  const pe = app.effects.pulse;
  pe.active = false;
  if (pe.raf) cancelAnimationFrame(pe.raf);
  pe.raf = null;
}

function ensureHighlightHasSamples(minCount = 400) {
  const key = `seoul_${app.state.currentDataType || 'BP'}`;
  const data = app.data.cache[key] || [];

  if (!data.length || !Number.isFinite(app.state.bpValue)) return;

  let lo = app.state.highlightMin;
  let hi = app.state.highlightMax;
  let widen = 0;
  const countInBand = () => data.reduce((a, d) => a + (d.biophilia_norm >= lo && d.biophilia_norm <= hi ? 1 : 0), 0);

  let count = countInBand();
  while (count < minCount && widen < 0.05) {
    widen += 0.005; // widen by 0.5% each step
    lo = Math.max(0, app.state.bpValue - (0.01 + widen));
    hi = Math.min(1, app.state.bpValue + (0.01 + widen));
    count = countInBand();
  }
  window.HIGHLIGHT_MIN = lo;
  window.HIGHLIGHT_MAX = hi;
}


/* ========== UTILITY FUNCTIONS ========== */
function debounce(func, delay) {
  let debounceTimer;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isHighlighted(d) {
  const v = d.biophilia_norm;
  const lo = (window.HIGHLIGHT_MIN ?? 0.70);
  const hi = (window.HIGHLIGHT_MAX ?? 0.75);
  return v >= lo && v <= hi;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  return Math.atan2(Math.sin(Δλ) * Math.cos(φ2),
                   Math.cos(φ1) * Math.sin(φ2) -
                   Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ));
}

/* ========== TOOLTIP CLEANUP ========== */
function removeAllCustomTooltips() {
  const existingTooltips = document.querySelectorAll('#custom-chart-tooltip');
  existingTooltips.forEach(tooltip => {
    tooltip.remove();
  });

  if (window.lineChart && typeof window.lineChart.destroy !== 'function') {
    try {
      const chart = window.lineChart;
      if (chart.tooltip) {
        chart.tooltip.setActiveElements([], {x: 0, y: 0});
      }
      while (chart.data.datasets.length > 1) {
        chart.data.datasets.pop();
      }
      chart.update('none');
    } catch (error) {
      // noop
    }
  }
}

/* ========== DATA LOADING ========== */
function parseData(d, weighted = false) {
  const biophiliaValue = weighted ? +d.biophilia_weighted_norm : +d.coverage_norm;
  return {
    lat: +d.lat_clean,
    lon: +d.lon_clean,
    biophilia_norm: biophiliaValue,
    panoid: String(d.panoid || d.id || 'unknown')
  };
}

async function loadSeoulData(dataType) {
  const cacheKey = `seoul_${dataType}`;
  if (app.data.cache[cacheKey]) return app.data.cache[cacheKey];

  try {
    const dataPath = seoulData.dataFiles[dataType];
    const rawData = await d3.csv(dataPath);
    const data = rawData.map(d => parseData(d, dataType === 'BP')).filter(d => {
      return !isNaN(d.lat) && !isNaN(d.lon) && !isNaN(d.biophilia_norm) &&
             d.lat !== 0 && d.lon !== 0;
    });

    if (data && data.length > 0) {
      app.data.cache[cacheKey] = data;
    } else {
      throw new Error('No valid data points after parsing');
    }
  } catch (error) {
    console.error(`Error loading ${dataType} data:`, error);
    app.data.cache[cacheKey] = generateSampleData();
  }

  return app.data.cache[cacheKey];
}

// --- fetch helpers (no-cache) ---
async function fetchJSONNoCache(url) {
  const withTs = url + (url.includes('?') ? '&' : '?') + 'ts=' + Date.now();
  const res = await fetch(withTs, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

// Optional: small retry if S3 propagation lags a split second
async function loadFreshCurrentWithRetry(maxTries = 3) {
  const prevTs = app?.data?.current?.meta?.computed_at || '';
  for (let i = 0; i < maxTries; i++) {
    const cur = await fetchJSONNoCache(`${RUNTIME_BASE}/current.json`);
    const curTs = cur?.meta?.computed_at || '';
    if (curTs && curTs !== prevTs) return cur;
    await new Promise(r => setTimeout(r, 350 + i * 200));
  }
  // last attempt
  return fetchJSONNoCache(`${RUNTIME_BASE}/current.json`);
}

// Called when the system should show results on TV1
async function tv1ApplyResults() {
  // 1) fetch the newest data first (prevents showing stale BP)
  const latest = await loadFreshCurrentWithRetry();

  // 2) set as the single source of truth
  app.data.current = latest;

  // 3) render everything from one place
  updateDashboardDisplay(latest);     // <-- your existing centralized renderer
}

// --- helpers to normalize/label categories and get values from intensities ---
const CATEGORY_LABELS = {
  sky: "Sky", tree: "Tree", grass: "Grass", person: "Person",
  ground: "Earth/Ground", mountain: "Mountain", plant: "Plant/Flora",
  water: "Water", sea: "Sea", field: "Field", rock: "Rock/Stone",
  sand: "Sand", fireplace: "Fireplace", river: "River", flower: "Flower",
  hill: "Hill", palm: "Palmtree", light: "Light/Sunlight",
  land: "Land/Soil", fountain: "Fountain", swimming: "Swimming Pool",
  waterfall: "Waterfall", food: "Natural Food", animal: "Animal/Fauna",
  lake: "Lake"
};

function toKey(s) {
  if (!s) return "";
  const raw = String(s).toLowerCase().replace(/[^a-z]/g, "");
  // a couple of simple aliases so names match your CSV/Lambda keys
  const alias = { plantflora: "plant", earthground: "ground", naturalfood: "food", palmtree: "palm" };
  return alias[raw] || raw;
}
function labelFromKey(k) { return CATEGORY_LABELS[k] || k; }

// Force the BP value everywhere in the UI (prevents the "flip back" to default)
function enforceBpValue(bp) {
  const num = document.getElementById("bpValueNumber");
  if (num) num.textContent = bp.toFixed(2);
  // if your radial viz exposes a setter, call it too (noop if not present)
  if (window.setBiPValue) try { window.setBiPValue(bp); } catch {}
}



// Prefer current.json written by Lambda; fall back to CSV if unavailable
async function loadDashboardData() {
try {
  const base = (window.APP_CONFIG && window.APP_CONFIG.RUNTIME_BASE_URL) ? window.APP_CONFIG.RUNTIME_BASE_URL : window.RUNTIME_BASE;
  const url  = `${base}/current.json`;
  const cur  = (typeof fetchJSONNoCache === 'function') ? await fetchJSONNoCache(url) : await (await fetch(url + '?ts=' + Date.now(), {cache:'no-store'})).json();

  const normalized = {
    bp: Number(cur?.bp ?? cur?.BP ?? 0),
    intensities: cur?.intensities ?? cur?.classes ?? null,
    intensity_top: Array.isArray(cur?.intensity_top) ? cur.intensity_top : (Array.isArray(cur?.top) ? cur.top : []),
    distribution: Array.isArray(cur?.distribution) ? cur.distribution : null,
    meta: cur?.meta ?? {}
  };

  window.app = window.app || { state:{}, data:{} };
  app.runtimeCurrent = normalized;
  app.data.dashboardData = { source:'current.json', ...normalized };

  if (typeof window.setUserBp === 'function') window.setUserBp(normalized.bp);
  else {
    const EPS = 0.01;
    app.state.bpValue = normalized.bp;
    app.state.highlightMin = Math.max(0, normalized.bp - EPS);
    app.state.highlightMax = Math.min(1, normalized.bp + EPS);
    window.HIGHLIGHT_MIN = app.state.highlightMin;
    window.HIGHLIGHT_MAX = app.state.highlightMax;
  }

  return normalized;
} catch (err) {
  console.error('[loadDashboardData] failed:', err);
  return null;
}
}



async function loadAllParticipantsData() {
  if (app.data.allParticipantsData) return app.data.allParticipantsData;

  try {
    const rawData = await d3.csv(seoulData.dataFiles.BP);
    const data = rawData.map(d => parseData(d, true)).filter(d => {
      return !isNaN(d.biophilia_norm) && d.biophilia_norm >= 0 && d.biophilia_norm <= 1;
    });

    app.data.allParticipantsData = data.map(d => d.biophilia_norm);

    if (app.data.allParticipantsData.length === 0) {
      throw new Error('No valid BP values found');
    }
  } catch (error) {
    console.error('Error loading participants data:', error);
    app.data.allParticipantsData = generateSampleDistribution();
  }

  return app.data.allParticipantsData;
}

function generateSampleData() {
  const sampleData = [];
  const centerLat = seoulData.coordinates.lat;
  const centerLon = seoulData.coordinates.lon;

  for (let i = 0; i < 10000; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distanceRatio = Math.random();
    const distance = distanceRatio * distanceRatio * MAX_DISTANCE_METERS;
    const latOffset = (distance * Math.cos(angle)) / 111000;
    const lonOffset = (distance * Math.sin(angle)) / 88000;

    sampleData.push({
      lat: centerLat + latOffset,
      lon: centerLon + lonOffset,
      biophilia_norm: Math.random(),
      panoid: `sample_${i}`
    });
  }

  return sampleData;
}

function generateSampleDistribution() {
  const data = [];
  for (let i = 0; i < 1000; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const value = Math.max(0, Math.min(1, 0.5 + z0 * 0.15));
    data.push(value);
  }
  return data;
}

/* ========== MAP INITIALIZATION ========== */
function initializeMapbox() {
  try {
    // Wait until #map actually exists
    const el = document.getElementById('map');
    if (!el) {
      // Not yet in DOM (or was temporarily re-rendered) → retry shortly
      setTimeout(initializeMapbox, 50);
      return;
    }

    // Use the element, not a string id (more robust)
    mapboxgl.accessToken = 'pk.eyJ1IjoieWltYXAiLCJhIjoiY20yeWRqc2xzMDBkdjJ2cHhyczFiYzZyciJ9.ePNnEmtc0W3b7ep4xQjGNg';
    app.map = new mapboxgl.Map({
      container: el,
      style: 'mapbox://styles/yimap/cm2znj5kv00oj01qkhyuya0yn?fresh=true',
      center: [seoulData.coordinates.lon, seoulData.coordinates.lat],
      zoom: 11.5
    });

    app.map.on('load', () => { app.mapLoaded = true; });

    const redrawCanvas = debounce(() => {
      if (app.state.animationInProgress) return;
      const data = app.data.cache[`seoul_${app.state.currentDataType}`];
      if (!data) return;

      if (app.mode === Modes.LANDING && app.landing.active && app.landing.currentGroup) {
        updateVisualizationCanvasWithBPGroups(data, seoulData.coordinates.lat, seoulData.coordinates.lon);
      } else {
        updateVisualizationCanvas(data, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      }
    }, 300);

    app.map.on('moveend', redrawCanvas);
    app.map.on('zoomend', redrawCanvas);
  } catch (error) {
    console.error('Mapbox initialization failed:', error);
  }
  return app.map;
}


/* ========== CLEANUP FUNCTIONS ========== */
function clearAllTimersAndAnimations() {
  for (const timerId of app.cleanup.timers) {
    clearTimeout(timerId);
    clearInterval(timerId);
  }
  app.cleanup.timers.clear();

  for (const animationId of app.cleanup.animations) {
    cancelAnimationFrame(animationId);
  }
  app.cleanup.animations.clear();

  // stop any result-mode pulsing
  stopPulseLoop();

  removeAllCustomTooltips();

  app.landing.active = false;
  app.landing.currentGroup = null;
  if (app.landing.intervalId) {
    clearInterval(app.landing.intervalId);
    app.landing.intervalId = null;
  }

  app.state.animationInProgress = false;
}

/* ========== LAYOUT FUNCTIONS ========== */
function showLandingLayout() {
  if (!document.getElementById('control-buttons')) {
    //createAndSetupButtons();
  }

  if (app.elements.rightCol) {
    app.elements.rightCol.style.display = 'none';
  }
  if (app.elements.footer) {
    app.elements.footer.style.display = 'none';
  }

  const leftTop = app.elements.leftTop;
  if (leftTop) {
    Array.from(leftTop.children).forEach(child => {
      child.style.display = 'none';
    });

    const buttonsContainer = document.getElementById('control-buttons');
    if (buttonsContainer) {
      buttonsContainer.style.display = 'flex';
      buttonsContainer.style.flexDirection = 'column';
      buttonsContainer.style.gap = '10px';
    }
  }

  ensureLandingText();
}

/* ===== Landing text lines ===== */
function ensureLandingText() {
  let box = document.getElementById('landing-text');
  if (box) { box.style.display = ''; return box; }

  const wrapper = document.querySelector('.center-column .visualization-wrapper')
               || document.querySelector('.center-column')
               || document.querySelector('#map')?.parentElement;
  if (!wrapper) return null;

  box = document.createElement('div');
  box.id = 'landing-text';
  box.className = 'landing-text';
  box.innerHTML = `
  <div class="landing-line1">Complete the survey to learn how you perceive and value urban nature in Seoul!</div>
  <div class="landing-line2" id="landing-line2">Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.</div>  <!-- NEW default -->
  `;
  wrapper.parentNode.insertBefore(box, wrapper.nextSibling);
  return box;
}

// NEW: helper to set line 2 directly
function setLandingLine2(text) {
  const el = document.getElementById('landing-line2');
  if (el) el.textContent = text;
}

function updateLandingTextGroup(group) {
  const line = document.getElementById('landing-line2');
  if (!line || !group) return;
  const min = (Math.round(group.min * 100) / 100).toFixed(2);
  const max = (Math.round(group.max * 100) / 100).toFixed(2);
  line.textContent = `Biophilic Perceptions (BP) group value located in Seoul: ${min}–${max}`;
}

function removeLandingText() {
  const box = document.getElementById('landing-text');
  if (box) box.remove();
}

function showDashboardLayout() {
  removeLandingText();

  if (app.elements.rightCol) {
    app.elements.rightCol.style.display = 'block';
  }
  if (app.elements.footer) {
    app.elements.footer.style.display = 'flex';
  }

  const leftTop = app.elements.leftTop;
  if (leftTop) {
    Array.from(leftTop.children).forEach(child => {
      child.style.display = '';
    });
  }

  const buttonsContainer = document.getElementById('control-buttons');
  if (buttonsContainer) {
    buttonsContainer.style.display = 'flex';
  }
}

/* ========== CANVAS VISUALIZATION - INTEGRATED FROM SCRIPT3 ========== */
function updateVisualizationCanvasWithBPGroups(data, centerLat, centerLon) {
  if (!data || !data.length) return;

  const canvas =
    (app?.elements?.canvas) ||
    document.getElementById('visualization-canvas');
  if (!canvas) return;

  const container = canvas.parentElement || canvas;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  function getMapPosition(d) {
    if (!app.map) return { x: 0, y: 0, radius: 0 };
    const p = app.map.project([d.lon, d.lat]);
    return { x: p.x, y: p.y, radius: sizeScale(d.biophilia_norm) };
  }

  const filtered = data.filter(d => {
    if (!d || isNaN(d.lat) || isNaN(d.lon)) return false;
    return calculateDistance(centerLat, centerLon, d.lat, d.lon) <= MAX_DISTANCE_METERS;
  });

  const group = app.landing.currentGroup; // {min,max}

  ctx.clearRect(0, 0, width, height);

  filtered.forEach(d => {
    const { x, y, radius } = getMapPosition(d);
    if (x < 0 || x > width || y < 0 || y > height) return;

    const inGroup = group && d.biophilia_norm >= group.min && d.biophilia_norm < group.max;

    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    // use the global scale everywhere (map & circular use the same palette)
    ctx.fillStyle = colorScale(d.biophilia_norm);
    // emphasize current bin with alpha only
    ctx.globalAlpha = inGroup ? 0.9 : 0.1;
    ctx.fill();
  });

  ctx.globalAlpha = 1;
}

function updateVisualizationCanvas(data, centerLat, centerLon, animate = false) {
  if (!data || data.length === 0) return;
  const canvas = app.elements.canvas;
  if (!canvas) return;

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const centerX = width / 2;
  const centerY = height / 2;

  // POLAR COORDINATE TRANSFORMATION FROM SCRIPT3
  const radiusScale = d3.scaleLinear()
    .domain([0, MAX_DISTANCE_METERS])
    .range([0, (Math.min(centerX, centerY) - 5) * 0.98])
    .clamp(true);

  function getCircularPosition(d) {
    const distance = calculateDistance(centerLat, centerLon, d.lat, d.lon);
    const angle = calculateBearing(centerLat, centerLon, d.lat, d.lon);
    const quantizedDistance = Math.floor(distance / 500) * 500;
    const adjustedRadius = radiusScale(quantizedDistance);
    return {
      x: centerX + adjustedRadius * Math.cos(angle),
      y: centerY + adjustedRadius * Math.sin(angle),
      radius: sizeScale(d.biophilia_norm),
      opacity: 0.7
    };
  }

  function getMapPosition(d) {
    if (!app.map) return { x: 0, y: 0, radius: 0, opacity: 0 };
    const projected = app.map.project([d.lon, d.lat]);
    return {
      x: projected.x,
      y: projected.y,
      radius: sizeScale(d.biophilia_norm),
      opacity: 0.7
    };
  }

  function getDotColor(d) {
    // If pulse is active and this is highlight mode, use color pulsation
    if (app.effects?.pulse?.active && app.state.isHighlightMode) {
      return colorWithPulse(d);
    }
    
    // Otherwise use existing logic
    if (!app.state.isHighlightMode) return colorScale(d.biophilia_norm);
    return isHighlighted(d) ? HIGHLIGHT_COLOR : NON_HIGHLIGHT_GRAY;
  }

  function getDotOpacity(d) {
    if (!app.state.isHighlightMode) return 0.7;
    return isHighlighted(d) ? 0.7 : 0.15;
  }

  const filteredData = data.filter(d => {
    if (!d.lat || !d.lon || isNaN(d.lat) || isNaN(d.lon)) return false;
    const dist = calculateDistance(centerLat, centerLon, d.lat, d.lon);
    return dist <= MAX_DISTANCE_METERS;
  });

  if (!animate) {
    ctx.clearRect(0, 0, width, height);

    const nonHighlighted = app.state.isHighlightMode ? filteredData.filter(d => !isHighlighted(d)) : filteredData;
    const highlighted = app.state.isHighlightMode ? filteredData.filter(isHighlighted) : [];

    // Draw non-highlighted dots first
    nonHighlighted.forEach(d => {
      const p = app.state.isCircularView ? getCircularPosition(d) : getMapPosition(d);
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
        ctx.beginPath();
        const radius = app.state.isCircularView ? p.radius : sizeScale(d.biophilia_norm);
        ctx.arc(p.x, p.y, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.fillStyle = getDotColor(d); // This will handle the color logic
        ctx.globalAlpha = getDotOpacity(d);
        ctx.fill();
      }
   });

    // Draw highlighted dots on top (with pulsation if active)
    highlighted.forEach(d => {
      const p = app.state.isCircularView ? getCircularPosition(d) : getMapPosition(d);
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
        ctx.beginPath();
        const radius = app.state.isCircularView ? p.radius : sizeScale(d.biophilia_norm);
        ctx.arc(p.x, p.y, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.fillStyle = getDotColor(d); // This will use color pulsation for highlighted dots
        ctx.globalAlpha = getDotOpacity(d);
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
    return;
  }

  // ENHANCED ANIMATION FROM SCRIPT3 WITH SOPHISTICATED PHASING
  app.state.animationInProgress = true;

  let initialPositions, targetPositions;
  if (app.state.isCircularView) {
    initialPositions = filteredData.map(d => getMapPosition(d));
    targetPositions = filteredData.map(d => getCircularPosition(d));
  } else {
    initialPositions = filteredData.map(d => getCircularPosition(d));
    targetPositions = filteredData.map(d => getMapPosition(d));
  }

  const firstGroupCount = Math.floor(filteredData.length * 0.3);
  const fadeDuration = 1000;
  const moveDurationFirst = 800;
  const dotDelayFirst = 0.1;
  const moveDurationSecond = 200;
  const dotDelaySecond = 0.03;

  const totalMoveDurationGroup1 = firstGroupCount > 0 ? ((firstGroupCount - 1) * dotDelayFirst + moveDurationFirst) : 0;
  const totalMoveDurationGroup2 = (filteredData.length - firstGroupCount) > 0 ?
    (firstGroupCount * dotDelayFirst + ((filteredData.length - firstGroupCount - 1) * dotDelaySecond) + moveDurationSecond) : 0;
  const totalMoveDuration = Math.max(totalMoveDurationGroup1, totalMoveDurationGroup2);
  const totalDuration = fadeDuration + totalMoveDuration;

  let startTime = null;

  function drawDotAt(d, i, easedT) {
    const init = initialPositions[i];
    const target = targetPositions[i];
    const x = init.x + (target.x - init.x) * easedT;
    const y = init.y + (target.y - init.y) * easedT;
    const radius = init.radius + (target.radius - init.radius) * easedT;
    const baseOpacity = 0.2 + (1 - 0.2) * easedT;
    const finalOpacity = app.state.isHighlightMode ? (isHighlighted(d) ? baseOpacity * 1.3 : baseOpacity * 0.3) : baseOpacity;

    if (x >= 0 && x <= width && y >= 0 && y <= height) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, radius), 0, 2 * Math.PI);
      ctx.fillStyle = getDotColor(d);
      ctx.globalAlpha = finalOpacity;
      ctx.fill();
    }
  }

  function animateFrame(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    ctx.clearRect(0, 0, width, height);

    if (elapsed < fadeDuration) {
      // Phase 1: Fade Out
      const tFade = Math.min(1, elapsed / fadeDuration);
      const currentOpacity = 1 + (0.2 - 1) * tFade;

      filteredData.forEach((d, i) => {
        if (!app.state.isHighlightMode || !isHighlighted(d)) {
          const pos = initialPositions[i];
          if (pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, Math.max(1, pos.radius), 0, 2 * Math.PI);
            ctx.fillStyle = getDotColor(d);
            ctx.globalAlpha = currentOpacity * (getDotOpacity(d) / 0.7);
            ctx.fill();
          }
        }
      });

      if (app.state.isHighlightMode) {
        filteredData.forEach((d, i) => {
          if (isHighlighted(d)) {
            const pos = initialPositions[i];
            if (pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height) {
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, Math.max(1, pos.radius), 0, 2 * Math.PI);
              ctx.fillStyle = getDotColor(d);
              ctx.globalAlpha = currentOpacity * (getDotOpacity(d) / 0.7);
              ctx.fill();
            }
          }
        });
      }
    } else {
      // Phase 2: Move & Fade In with staggered timing
      const moveElapsedTotal = elapsed - fadeDuration;

      const drawByGroup = (predicate) => {
        filteredData.forEach((d, i) => {
          if (predicate(d)) {
            let currentMoveDuration, currentDotDelay, localDelay;
            if (i < firstGroupCount) {
              currentMoveDuration = moveDurationFirst;
              currentDotDelay = dotDelayFirst;
              localDelay = i * currentDotDelay;
            } else {
              currentMoveDuration = moveDurationSecond;
              currentDotDelay = dotDelaySecond;
              localDelay = firstGroupCount * dotDelayFirst + (i - firstGroupCount) * currentDotDelay;
            }
            const localElapsed = moveElapsedTotal - localDelay;
            const tRaw = localElapsed > 0 ? Math.min(1, localElapsed / currentMoveDuration) : 0;
            const easedT = d3.easeCubicInOut(tRaw);
            drawDotAt(d, i, easedT);
          }
        });
      };

      // Draw non-highlighted first, highlighted second for proper layering
      drawByGroup(d => !app.state.isHighlightMode || !isHighlighted(d));
      if (app.state.isHighlightMode) drawByGroup(d => isHighlighted(d));
    }

    ctx.globalAlpha = 1;
    if (elapsed < totalDuration) {
      const animationId = requestAnimationFrame(animateFrame);
      app.cleanup.animations.add(animationId);
    } else {
      app.state.animationInProgress = false;
    }
  }

  const animationId = requestAnimationFrame(animateFrame);
  app.cleanup.animations.add(animationId);
}

/* ========== MODE CONTROL - INTEGRATED SEQUENCES ========== */
async function setMode(newMode) {
  if (app.mode === newMode) return;

  clearAllTimersAndAnimations();

  if (!app.elements.leftTop) {
    app.elements.leftTop = document.querySelector('.left-column-top');
    app.elements.rightCol = document.querySelector('.right-column');
    app.elements.footer = document.querySelector('footer');
    app.elements.mapContainer = document.getElementById('map');
    app.elements.canvas = document.getElementById('visualization-canvas');
  }

  app.mode = newMode;

  if (newMode === Modes.LANDING) {
    showLandingLayout();

    app.state.currentDataType = 'BP';
    await loadSeoulData('BP');

    app.state.isCircularView = false;
    app.state.isHighlightMode = false;

    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.classList.remove('hidden-map');
    }

    await startLandingAnimationSequence();

  } else if (newMode === Modes.RESULT) {
    showDashboardLayout();
    buildAllContent();

    await Promise.all([
      loadSeoulData('BS'),
      loadSeoulData('BP'),
      loadDashboardData(),
      loadAllParticipantsData()
    ]);

    await updateDashboardDisplay();

    app.state.isCircularView = false;
    app.state.isHighlightMode = false;

    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.classList.remove('hidden-map');
    }

    await executeResultSequence();
  }
}

/* ========== BUILD CONTENT FUNCTIONS ========== */
function buildAllContent() {
  buildLeftColumnContent();
  buildRightColumnContent();
  buildFooterContent();
}

function buildLeftColumnContent() {
  const leftTop = app.elements.leftTop;
  if (!leftTop) return;

  leftTop.innerHTML = `
    <h2 id="locationTitle">Seoul (Temperate Forest)</h2>
    <p id="locationDescription">
      ${app.state.currentDataType === 'BP' ? seoulData.BPDescription : seoulData.BSDescription}
    </p>
  `;

  //createAndSetupButtons();
}

function buildRightColumnContent() {
  if (!app.elements.rightCol) return;

  app.elements.rightCol.innerHTML = `
    <div class="right-column-top">
      <img id="rightColumnImage" src="img/seoul_label.svg" alt="Seoul Label" />
    </div>
  `;
}

function buildFooterContent() {
  if (!app.elements.footer) return;

  app.elements.footer.innerHTML = `
    <div class="footer-section">
      <h4>Your Biophilic Individual Perceptions (BiP) value</h4>
      <div class="bp-value" id="bpValueDisplay">
        <span id="bpValueNumber">0.72</span>
        <div class="bp-indicator"></div>
      </div>
      <p>Highlights similar BiP value in the city areas that could fit your perception</p>
    </div>
    <div class="footer-section">
      <div class="middle-section-title">Which natural element brings you most positive feeling</div>
      <div class="plant-category" id="topCategoryText">Plant/Flora, grass, trees</div>
      <div class="chart-content">
        <div class="chart-left">
          <div class="top-elements" id="topElements"></div>
        </div>
        <div class="chart-right">
          <div class="chart-container">
            <div class="bar-chart" id="barChart"></div>
            <div class="bar-labels" id="barLabels"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="footer-section">
      <div class="chart-title">Your BiP value among the city</div>
      <div class="chart-wrapper">
        <canvas id="lineChart"></canvas>
      </div>
    </div>
  `;
}

/* ========== LANDING ANIMATION (UPDATED TEXT + 3s PAUSE) ========== */
async function startLandingAnimationSequence() {
  if (app.landing.active) return;

  app.landing.active = true;

  try {
    // Step 1: Start with BS data
    app.state.currentDataType = 'BS';
    const bsData = await loadSeoulData('BS');
    updateVisualizationCanvas(bsData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    await wait(2000);

    // Step 2: Switch to BP data
    app.state.currentDataType = 'BP';
    const bpData = await loadSeoulData('BP');
    updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);

    // NEW: show explanatory sentence for 3s before cycling
    setLandingLine2('Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.');
    await wait(3000);

    // Step 3: Start BP group highlighting loop (no pulsation)
    animateBPGroupHighlighting(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon);

  } catch (error) {
    console.error('Error in landing animation sequence:', error);
    app.landing.active = false;
  }
}

function animateBPGroupHighlighting(data, centerLat, centerLon) {
  const groups = [BP_GROUPS[0], BP_GROUPS[1], BP_GROUPS[2], BP_GROUPS[3]];
  let i = 0;

  // Initialize immediately
  app.landing.currentGroup = groups[0];
  updateLandingTextGroup(app.landing.currentGroup); // updates the line to dynamic range
  updateVisualizationCanvasWithBPGroups(data, centerLat, centerLon);

  // Cycle every 2500 ms
  const tick = () => {
    if (!app.landing.active || app.mode !== Modes.LANDING) return;
    i = (i + 1) % groups.length;
    app.landing.currentGroup = groups[i];

    updateLandingTextGroup(app.landing.currentGroup);
    updateVisualizationCanvasWithBPGroups(data, centerLat, centerLon);

    app.landing.intervalId = setTimeout(tick, 2500);
    app.cleanup.timers.add(app.landing.intervalId);
  };

  app.landing.intervalId = setTimeout(tick, 2500);
  app.cleanup.timers.add(app.landing.intervalId);
}

/* ========== RESULT SEQUENCE WITH PULSATION EFFECT ========== */
async function executeResultSequence() {
  if (app.state.animationInProgress) return;

  try {
    // Ensure we're in BP mode first
    if (app.state.currentDataType !== 'BP') {
      app.state.currentDataType = 'BP';
      await loadSeoulData('BP');
      await wait(500);
    }

    const bpData = app.data.cache['seoul_BP'];

    // Step 1: Activate highlight on map view WITH PULSE
    app.state.isHighlightMode = true;
    ensureHighlightHasSamples();    
    updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);

    // set period from BP just before starting pulse
    app.effects = app.effects || {};
    app.effects.pulse = app.effects.pulse || { period: PULSE_BASE_PERIOD };
    //app.effects.pulse.period = getPulsePeriodByBp(app.state.bpValue);
    app.effects.pulse.period = PULSE_BASE_PERIOD;

    startPulseLoop();                 // start pulsing highlighted dots (map)
    await wait(3000);                 // keep pulsing for 3s

    // Step 1b: Clear highlights and stop pulse before transition
    app.state.isHighlightMode = false;
    stopPulseLoop();
    updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    await wait(1500);

    // Step 2: Switch to circular view (no pulse during transition)
    app.state.isCircularView = true;
    ensureHighlightHasSamples();  
    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.classList.add('hidden-map');

    // Animate transition to circular view
    updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, true);

    // Approximate faster transition duration (1.5x faster note retained)
    const fadeDuration = 2000;
    const moveDuration = 800;
    const originalTransitionDuration = fadeDuration + moveDuration + 1000;
    const totalTransitionDuration = originalTransitionDuration / 1.5;
    await wait(totalTransitionDuration);

    // Show full circular layout for a moment
    await wait(4000);

    // Step 3: Activate highlight on circular view AND RESUME PULSE (persist after)
    app.state.isHighlightMode = true;
    updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);

    // set period from BP just before (re)starting pulse
    app.effects = app.effects || {};
    app.effects.pulse = app.effects.pulse || { period: PULSE_BASE_PERIOD };
    app.effects.pulse.period = getPulsePeriodByBp(app.state.bpValue);
    startPulseLoop();                 // pulse continues on circular highlighted dots
    await wait(1000);

    // Step 4: Start distribution curve animation loop
    const bpValue = parseFloat(document.getElementById('bpValueNumber')?.textContent) || 0.72;
    animateDistributionCurve(bpValue);

    // (Pulse remains active until mode changes; clearAllTimersAndAnimations() stops it)
  } catch (error) {
    console.error('Error in result sequence:', error);
  }
}

/* ========== DASHBOARD FUNCTIONS ========== */
function iconPathFor(key) {
  const k = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g,'');
  // Try .png first, then .webp
  return [`img/classes/${k}.png`, `img/classes/${k}.webp`];
}


function updateTopElements(top3Names) {
  const keys = (top3Names || []).map(toKey).filter(Boolean);

  // keep the text line
  const textEl = document.getElementById('topCategoryText');
  if (textEl) textEl.textContent = keys.map(labelFromKey).join(', ');

  const wrap = document.getElementById('topElements');
  if (!wrap) return;
  wrap.innerHTML = '';

  keys.forEach((key) => {
    if (!CATEGORY_LABELS[key]) return;

    const [png, webp] = iconPathFor(key);

    const card = document.createElement('div');
    card.className = 'top-element';

    const img = document.createElement('img');
    img.alt = labelFromKey(key);
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';

    let i = 0;
    const sources = [png, webp];
    img.onerror = () => { i += 1; if (i < sources.length) img.src = sources[i]; else { img.onerror = null; card.remove(); } };
    img.src = sources[0];

    // NOTE: no label created/appended here
    card.appendChild(img);
    wrap.appendChild(card);
  });
}


  function updateBarChart(intensityData) {
    const barChart  = document.getElementById('barChart');
    const barLabels = document.getElementById('barLabels');
    if (!barChart || !barLabels) return;
  
    // reset
    barChart.innerHTML = '';
    barLabels.innerHTML = '';
  
    // fixed scale to 0..1 (not normalized to max)
    const maxHeight = 80; // px
  
    // a short name mapper; fallback trims long names neatly
    const SHORT = {
      'Plant/Flora': 'Plant',
      'Animal/Fauna': 'Animal',
      'Living Being': 'Living',
      'Greenscape': 'Green',
      'Waterscape': 'Water',
      'Landscape': 'Land',
      'Waterfall': 'Fall',
      'Palm Tree': 'Palmtree',
      'PalmTree': 'Palmtree',
      'River': 'River',
      'Lake': 'Lake'
    };
    const shorten = (s) => {
      if (SHORT[s]) return SHORT[s];
      const clean = String(s).replace(/_/g, ' ');
      return clean.length > 12 ? clean.slice(0, 12).trim() : clean;
    };
  
    // draw bars + labels (top-10 already applied by caller)
    intensityData.forEach(item => {
      const v = Math.max(0, Math.min(1, item.value));
      const h = v * maxHeight;
  
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${h}px`;
      // DISABLE MOUSE INTERACTIONS - Remove title attribute
      // bar.title = `${item.name}: ${v.toFixed(2)}`;  // Comment out this line
      bar.style.pointerEvents = 'none';  // Disable pointer events
      barChart.appendChild(bar);
  
      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = shorten(item.name);
      // Keep title for accessibility but disable hover
      label.title = item.name;
      label.style.pointerEvents = 'none';  // Disable pointer events
      barLabels.appendChild(label);
    });
  }
  

  




/* ========== DISTRIBUTION CHART - INTEGRATED FROM SCRIPT3 ========== */
function updateDistributionChart(userBpValue) {
  // Prefer distribution from current.json if Lambda provided it
  let dist = (window.app && app.runtimeCurrent && Array.isArray(app.runtimeCurrent.distribution))
    ? app.runtimeCurrent.distribution
    : null;

  const lineCanvas = document.getElementById('lineChart');
  if (!lineCanvas) return;
  if (!document.body.contains(lineCanvas)) return; 

  const lineCtx = lineCanvas.getContext('2d');
  if (!lineCtx) return;

  let labels = [];
  let histogram = [];

  if (dist) {
    // dist is [{bin:0.0,count:...}, ...]
    labels = dist.map(d => Number(d.bin).toFixed(1));
    histogram = dist.map(d => Number(d.count) || 0);
  } else {
    // Fallback: build from app.data.allParticipantsData
    if (!app.data.allParticipantsData || app.data.allParticipantsData.length === 0) return;
    const bins = 11;
    const binSize = 1 / (bins - 1);
    histogram = new Array(bins).fill(0);
    app.data.allParticipantsData.forEach(value => {
      const v = Number(value) || 0;
      const binIndex = Math.min(Math.round(v / binSize), bins - 1);
      histogram[binIndex]++;
    });
    labels = Array.from({ length: bins }, (_, i) => (i * binSize).toFixed(1));
  }

  const maxCount = Math.max(...histogram, 1);
  const normalizedData = histogram.map(count => (count / maxCount) * 100);

  // Clean up existing chart instance
  if (window.lineChart && typeof window.lineChart.destroy === 'function') {
    try { window.lineChart.destroy(); } catch (e) {}
    window.lineChart = null;
  }

  // Ensure the custom tooltip positioner exists (even if tooltips are disabled)
  if (!Chart.Tooltip.positioners) Chart.Tooltip.positioners = {};
  if (!Chart.Tooltip.positioners.below) {
    Chart.Tooltip.positioners.below = function (elements, eventPosition) {
      if (!elements.length) return false;
      const element = elements[0];
      return { x: element.element.x, y: element.element.y + 35 };
    };
  }

  try {
    window.lineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'All Participants',
          data: normalizedData,
          borderColor: '#666666',
          backgroundColor: 'rgba(102, 102, 102, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 15, right: 40 } },
        // No hover tooltips
        interaction: { intersect: false, mode: 'none' },
        onHover: null,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            position: 'below',
            displayColors: false,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: 'white',
            bodyColor: 'white',
            borderColor: '#444',
            borderWidth: 1,
            cornerRadius: 6,
            caretPadding: 10,
            callbacks: {
              title: () => `Your BiP Value: ${Number(userBpValue).toFixed(2)}`,
              label: (context) => {
                const binIndex = context.dataIndex;
                const count = histogram[binIndex];
                const pct = ((count / histogram.reduce((a,b)=>a+b,0)) * 100).toFixed(1);
                return `Among Seoul locations: ${pct}% (${count} locations)`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            position: 'bottom',
            grid: { display: false, drawBorder: true },
            ticks: {
              display: true,
              color: '#888',
              font: { size: 11, weight: 'normal' },
              padding: 5,
              callback: function(value, index, ticks) {
                if (index === 0) return '0';
                if (index === ticks.length - 1) return '1';
                if (index === Math.floor(ticks.length / 2)) return '0.5';
                return '';
              }
            },
            border: { display: true, color: '#444' }
          },
          y: { display: false, min: 0, grid: { display: false } }
        },
        animation: { duration: 1000 }
      }
    });
  } catch (error) {
    console.error('Error creating distribution chart:', error);
  }
}



/* ========== DISTRIBUTION ANIMATION - INTEGRATED FROM SCRIPT3 ========== */
function animateDistributionCurve(userBpValue) {
  if (!window.lineChart) {
    return Promise.resolve();
  }

  return new Promise(() => {
    const chart = window.lineChart;
    const bins = 11;
    const binSize = 1 / (bins - 1);
    const userBinIndex = Math.min(Math.round(userBpValue / binSize), bins - 1);

    // Calculate tooltip data once
    const histogram = [];
    app.data.allParticipantsData.forEach(value => {
      const idx = Math.min(Math.round(value / binSize), bins - 1);
      histogram[idx] = (histogram[idx] || 0) + 1;
    });

    const count = histogram[userBinIndex] || 0;
    const percentage = ((count / app.data.allParticipantsData.length) * 100).toFixed(1);

    function runFullAnimation() {
      // Ensure chart starts with only the distribution curve (no dots)
      while (chart.data.datasets.length > 1) {
        chart.data.datasets.pop();
      }

      
      if (!chart || !chart.canvas || !chart.canvas.ownerDocument) return;

      chart.update('none');

      // Create animated dot dataset
      const animatedDotDataset = {
        label: 'Animated Dot',
        data: new Array(bins).fill(null),
        borderColor: '#888888',
        backgroundColor: 'transparent',
        pointRadius: 5,
        pointBorderWidth: 1,
        pointBorderColor: '#888888',
        showLine: false,
        pointHoverRadius: 6
      };

      chart.data.datasets.push(animatedDotDataset);

      let currentIndex = 0;
      const animationDuration = 3000;
      const stepDuration = animationDuration / Math.max(1, userBinIndex);

      function animateStep() {
        if (currentIndex <= userBinIndex && app.mode === Modes.RESULT) {
          animatedDotDataset.data.fill(null);
          const yValue = chart.data.datasets[0].data[currentIndex];
          animatedDotDataset.data[currentIndex] = yValue;
          chart.update('none');
          currentIndex++;

          if (currentIndex <= userBinIndex) {
            const timerId = setTimeout(animateStep, stepDuration);
            app.cleanup.timers.add(timerId);
          } else {
            const timerId = setTimeout(showTooltipAtEnd, 500);
            app.cleanup.timers.add(timerId);
          }
        }
      }

      function showTooltipAtEnd() {
        if (app.mode !== Modes.RESULT) return;

        const animatedDataset = chart.data.datasets[1];

        if (animatedDataset) {
          animatedDataset.backgroundColor = '#92C043';
          animatedDataset.borderColor = '#ffffff';
          animatedDataset.pointBackgroundColor = '#92C043';
          animatedDataset.pointBorderColor = '#ffffff';
          animatedDataset.pointRadius = 6;
          animatedDataset.pointHoverRadius = 6;
          animatedDataset.pointHoverBackgroundColor = '#92C043';
          animatedDataset.pointHoverBorderColor = '#ffffff';
          animatedDataset.label = 'You Final';

          chart.update('none');

          const meta = chart.getDatasetMeta(1);
          if (meta.data[userBinIndex]) {
            const pointElement = meta.data[userBinIndex];

            pointElement.options = {
              backgroundColor: '#92C043',
              borderColor: '#ffffff',
              borderWidth: 2,
              radius: 6,
              hoverRadius: 6,
              hoverBackgroundColor: '#92C043',
              hoverBorderColor: '#ffffff'
            };

            chart.render();
            createCustomTooltip(pointElement, userBpValue, percentage, count);

            const hideTimer = setTimeout(() => {
              removeCustomTooltip();
              chart.data.datasets.pop();
              chart.update('none');
              const restartTimer = setTimeout(runFullAnimation, 2000);
              app.cleanup.timers.add(restartTimer);
            }, 10000);
            app.cleanup.timers.add(hideTimer);
          } else {
            const fallbackTimer = setTimeout(() => {
              if (chart.data.datasets.length > 1) {
                chart.data.datasets.pop();
              }
              chart.update('none');
              const restartTimer = setTimeout(runFullAnimation, 2000);
              app.cleanup.timers.add(restartTimer);
            }, 1000);
            app.cleanup.timers.add(fallbackTimer);
          }
        }
      }

      function createCustomTooltip(point, bpValue, percentage, count) {
        removeCustomTooltip();

        const canvas = chart.canvas;
        const rect = canvas.getBoundingClientRect();

        const tooltip = document.createElement('div');
        tooltip.id = 'custom-chart-tooltip';
        tooltip.style.cssText = `
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #444;
          font-size: 12px;
          pointer-events: none;
          z-index: 1000;
          white-space: nowrap;
        `;

        tooltip.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">Your BiP Value: ${bpValue.toFixed(2)}</div>
          <div>Among all dots: ${percentage}% (${count} dots)</div>
        `;

        document.body.appendChild(tooltip);

// Measure after attaching, then clamp within the viewport
const tipW = tooltip.offsetWidth;
const tipH = tooltip.offsetHeight;
let left = rect.left + point.x - tipW / 2;
let top  = rect.top  + point.y + 25;

// clamp horizontally with 8px padding
left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
// clamp vertically if needed
top  = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));

tooltip.style.left = `${left}px`;
tooltip.style.top  = `${top}px`;


        document.body.appendChild(tooltip);
      }

      function removeCustomTooltip() {
        const existing = document.getElementById('custom-chart-tooltip');
        if (existing) existing.remove();
      }

      animateStep();
    }

    runFullAnimation();
  });
}


/* --- Icon preload helpers (prevents first-time icon pop in Result mode) --- */
function _iconKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function _iconCandidates(name) {
  const key = _iconKey(name);
  const base = `img/classes/${key}`;
  return [`${base}.svg`, `${base}.png`, `${base}.webp`];
}
function preloadTopElementIcons(names) {
  app.assets = app.assets || {};
  if (app.assets.topIconsPreloaded) return;
  names.forEach((n) => {
    _iconCandidates(n).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  });
  app.assets.topIconsPreloaded = true;
}

function updateDashboardDisplay() {
const data = (window.app && (app.runtimeCurrent || (app.data && app.data.dashboardData))) || null;
if (!data) return;

const bpValue = Number(data.bp) || 0;
const numEl = document.getElementById('bpValueNumber');
if (numEl) numEl.textContent = bpValue.toFixed(2);

const top3 = (Array.isArray(data.intensity_top) && data.intensity_top.length)
  ? data.intensity_top.slice(0, 3)
  : Object.entries(data.intensities || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
if (typeof updateTopElements === 'function') {
  try { updateTopElements(top3); } catch (e) { console.error('[updateDashboardDisplay] updateTopElements', e); }
}

const top10 = Object.entries(data.intensities || {})
  .map(([k, v]) => ({ name: k, value: Number(v) || 0 }))
  .filter(d => d.value > 0)
  .sort((a, b) => b.value - a.value)
  .slice(0, 10);
if (typeof updateBarChart === 'function') {
  try { updateBarChart(top10); } catch (e) { console.error('[updateDashboardDisplay] updateBarChart', e); }
}

if (typeof updateDistributionChart === 'function') {
  try { updateDistributionChart(bpValue); } catch (e) { console.error('[updateDashboardDisplay] updateDistributionChart', e); }
}
}



/* ========== INITIALIZATION ========== */
async function initializeApplication() {
  if (app.initialized || app._initializing) return;
  app._initializing = true;
  try {
    app.elements.leftTop = document.querySelector('.left-column-top');
    app.elements.rightCol = document.querySelector('.right-column');
    app.elements.footer = document.querySelector('footer');
    app.elements.mapContainer = document.getElementById('map');
    app.elements.canvas = document.getElementById('visualization-canvas');

    //createAndSetupButtons();
    initializeMapbox();

    await setMode(Modes.LANDING);

    if (!app._resizeListenerAdded) {
      window.addEventListener('resize', debounce(() => {
      const data = app.data.cache[`seoul_${app.state.currentDataType}`];
      if (!data) return;

      if (app.mode === Modes.LANDING && app.landing.active && app.landing.currentGroup) {
        updateVisualizationCanvasWithBPGroups(data, seoulData.coordinates.lat, seoulData.coordinates.lon);
      } else {
        updateVisualizationCanvas(data, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      }
    }, 300));
      app._resizeListenerAdded = true;
    }

    app.initialized = true;

    app._initializing = false;

  } catch (error) {
    console.error('CRITICAL: Application initialization failed:', error);

    try {
      //createAndSetupButtons();
      app.mode = Modes.LANDING;
    } catch (fallbackError) {
      console.error('Even fallback failed:', fallbackError);
    }
  }
}

// Make key functions available to the TV-1 poller
window.setMode = typeof setMode === "function" ? setMode : undefined;
window.updateTopElements = typeof updateTopElements === "function" ? updateTopElements : undefined;
window.updateBarChart = typeof updateBarChart === "function" ? updateBarChart : undefined;
window.updateDistributionChart = typeof updateDistributionChart === "function" ? updateDistributionChart : undefined;


/* ========== EVENT LISTENERS ========== */
document.addEventListener('DOMContentLoaded', () => {
  initializeApplication();
});

if (document.readyState !== 'loading') {
  setTimeout(initializeApplication, 100);
}




