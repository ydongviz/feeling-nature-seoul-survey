/* =========================================================
   Feeling Nature – Event Kiosk (Single-Source app.js)
   Clean + reliable for 4-day event
   ========================================================= */

/* ---------- Config ---------- */
const MAX_DISTANCE_METERS = 15000;
const Modes = { LANDING: 'landing', RESULT: 'result' };

const HIGHLIGHT_COLOR = '#92C043';
const NON_HIGHLIGHT_GRAY = '#666666';

const BP_GROUPS = [
  { min: 0.00, max: 0.25 },
  { min: 0.25, max: 0.50 },
  { min: 0.50, max: 0.75 },
  { min: 0.75, max: 1.00 }
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

/* ---------- App singleton ---------- */
const app = {
  mode: null,
  elements: { leftTop: null, rightCol: null, footer: null, mapContainer: null, canvas: null },
  state: {
    currentDataType: 'BS',
    isCircularView: false,
    isHighlightMode: false,
    animationInProgress: false,
    bpValue: 0.5,                // will be overwritten by current.json or setUserBp
    highlightMin: 0.49,
    highlightMax: 0.51
  },
  data: { cache: {}, dashboardData: null, allParticipantsData: null, current: null },
  map: null,
  mapLoaded: false,
  landing: { active: false, currentGroup: null, intervalId: null },
  cleanup: { timers: new Set(), animations: new Set() }
};

/* ---------- Scales ---------- */
const colorScale = d3.scaleLinear().domain([0, 1]).range(["#151D07", "#92C043"]).clamp(true);
const sizeScale  = d3.scaleLinear().domain([0, 0.2, 0.6, 0.8, 1]).range([0, 1, 2, 3, 6]);

/* ---------- Small helpers (registered timers/raf) ---------- */
app.registerTimeout = (fn, ms) => { const id = setTimeout(fn, ms); app.cleanup.timers.add(id); return id; };
app.registerInterval = (fn, ms) => { const id = setInterval(fn, ms); app.cleanup.timers.add(id); return id; };
app.registerRAF = (fn) => { const id = requestAnimationFrame(fn); app.cleanup.animations.add(id); return id; };

function wait(ms) { return new Promise(r => app.registerTimeout(r, ms)); }
function debounce(fn, delay) { let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),delay);} }

/* ---------- Geometry utils ---------- */
function calculateDistance(lat1, lon1, lat2, lon2){
  const R=6371e3, φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180, Δφ=(lat2-lat1)*Math.PI/180, Δλ=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function calculateBearing(lat1, lon1, lat2, lon2){
  const φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180, Δλ=(lon2-lon1)*Math.PI/180;
  return Math.atan2(Math.sin(Δλ)*Math.cos(φ2), Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ));
}

/* ---------- Tooltip cleanup ---------- */
function removeAllCustomTooltips(){ document.querySelectorAll('#custom-chart-tooltip').forEach(t=>t.remove()); }

/* ---------- Data ---------- */
function parseData(d, weighted=false){
  const biophiliaValue = weighted ? +d.biophilia_weighted_norm : +d.coverage_norm;
  return { lat:+d.lat_clean, lon:+d.lon_clean, biophilia_norm:biophiliaValue, panoid:String(d.panoid||d.id||'u') };
}

async function loadSeoulData(type){
  const key = `seoul_${type}`;
  if (app.data.cache[key]) return app.data.cache[key];
  try{
    const raw = await d3.csv(seoulData.dataFiles[type]);
    const data = raw.map(d=>parseData(d, type==='BP')).filter(d=>Number.isFinite(d.lat)&&Number.isFinite(d.lon)&&Number.isFinite(d.biophilia_norm));
    app.data.cache[key] = data;
  }catch(e){
    // graceful fallback to synthetic data
    const out=[]; const {lat,lon}=seoulData.coordinates;
    for(let i=0;i<9000;i++){ const a=Math.random()*Math.PI*2, r=(Math.random()**2)*MAX_DISTANCE_METERS;
      out.push({lat:lat+(r*Math.cos(a))/111000, lon:lon+(r*Math.sin(a))/88000, biophilia_norm:Math.random(), panoid:`s${i}`});
    }
    app.data.cache[key]=out;
  }
  return app.data.cache[key];
}

async function loadDashboardData(){
  try{
    const base = (window.APP_CONFIG?.RUNTIME_BASE_URL)||window.RUNTIME_BASE||'';
    const cur = await fetch(`${base}/current.json?ts=${Date.now()}`, {cache:'no-store'}).then(r=>r.json());
    const bp = Number(cur?.bp ?? cur?.BP ?? 0.5);
    app.data.current = cur;
    app.data.dashboardData = { bp, intensities:cur?.intensities||cur?.classes||null, intensity_top:cur?.intensity_top||cur?.top||[], distribution:cur?.distribution||null };
    window.setUserBp?.(bp); // will also set highlightMin/Max
    return app.data.dashboardData;
  }catch(e){ return null; }
}

async function loadAllParticipantsData(){
  if (app.data.allParticipantsData) return app.data.allParticipantsData;
  try{
    const raw = await d3.csv(seoulData.dataFiles.BP);
    const vals = raw.map(d=>+d.biophilia_weighted_norm).filter(v=>Number.isFinite(v)&&v>=0&&v<=1);
    app.data.allParticipantsData = vals.length? vals : Array.from({length:1000},()=>Math.max(0,Math.min(1,0.5+(Math.random()-0.5)*0.3)));
  }catch(e){
    app.data.allParticipantsData = Array.from({length:1000},()=>Math.max(0,Math.min(1,0.5+(Math.random()-0.5)*0.3)));
  }
  return app.data.allParticipantsData;
}

/* ---------- Map (single initializer, token from <meta>) ---------- */
function initializeMapbox(){
  try{
    const el = document.getElementById('map');
    if (!el) { app.registerTimeout(initializeMapbox, 50); return; }

    const tok = document.querySelector('meta[name="mapbox-token"]')?.content?.trim();
    if (!tok) console.warn('Missing <meta name="mapbox-token">');
    mapboxgl.accessToken = tok || '';

    app.map = new mapboxgl.Map({
      container: el,
      style: 'mapbox://styles/yimap/cm2znj5kv00oj01qkhyuya0yn?fresh=true',
      center: [seoulData.coordinates.lon, seoulData.coordinates.lat],
      zoom: 11.5
    });

    app.map.on('load', ()=>{ app.mapLoaded = true; });

    const redrawCanvas = debounce(()=>{
      if (app.state.animationInProgress) return;
      const data = app.data.cache[`seoul_${app.state.currentDataType}`];
      if (!data) return;
      if (app.mode === Modes.LANDING && app.landing.active && app.landing.currentGroup){
        updateVisualizationCanvasWithBPGroups(data, seoulData.coordinates.lat, seoulData.coordinates.lon);
      } else {
        updateVisualizationCanvas(data, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      }
    },300);

    app.map.on('moveend', redrawCanvas);
    app.map.on('zoomend', redrawCanvas);
  }catch(e){ console.error('Mapbox initialization failed:', e); }
}

/* ---------- Pulse (result-only) ---------- */
app.effects = { pulse: { active:false, raf:null, t0:0, last:0, period:1200 } };

function isHighlighted(d){ return d.biophilia_norm >= app.state.highlightMin && d.biophilia_norm <= app.state.highlightMax; }

function startPulseLoop(){
  const pe=app.effects.pulse; if (pe.raf) return;
  pe.active=true; pe.t0=performance.now(); pe.last=pe.t0;
  const tick = () => {
    if (!pe.active){ pe.raf=null; return; }
    const now = performance.now();
    if (now - pe.last > 42){
      const data = app.data.cache[`seoul_${app.state.currentDataType}`];
      if (data) updateVisualizationCanvas(data, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      pe.last = now;
    }
    pe.raf = requestAnimationFrame(tick);
    app.cleanup.animations.add(pe.raf);
  };
  pe.raf = requestAnimationFrame(tick);
}
function stopPulseLoop(){ const pe=app.effects.pulse; pe.active=false; if(pe.raf) cancelAnimationFrame(pe.raf); pe.raf=null; }

/* pause pulse when tab hidden (saves CPU) */
document.addEventListener('visibilitychange', ()=>{ if (document.hidden) stopPulseLoop(); });

/* ---------- Layout helpers ---------- */
function showLandingLayout(){
  if (!app.elements.rightCol) app.elements.rightCol = document.querySelector('.right-column');
  if (!app.elements.footer)   app.elements.footer   = document.querySelector('footer');
  if (app.elements.rightCol) app.elements.rightCol.style.display='none';
  if (app.elements.footer)   app.elements.footer.style.display='none';
  ensureLandingText();
}
function showDashboardLayout(){
  removeLandingText();
  const gif=document.getElementById('landingVideo'); if (gif){ gif.style.display='none'; gif.style.opacity='1'; }
  if (!app.elements.rightCol) app.elements.rightCol = document.querySelector('.right-column');
  if (!app.elements.footer)   app.elements.footer   = document.querySelector('footer');
  if (app.elements.rightCol) app.elements.rightCol.style.display='block';
  if (app.elements.footer)   app.elements.footer.style.display='flex';
}
function ensureLandingText(){
  if (!document.getElementById('landing-line1')){
    const l1=document.createElement('div'); l1.id='landing-line1'; l1.className='landing-line1'; document.body.appendChild(l1);
  }
  if (!document.getElementById('landing-line2')){
    const wrap=document.querySelector('.center-column .visualization-wrapper')||document.querySelector('.center-column');
    if (wrap){ const l2=document.createElement('div'); l2.id='landing-line2'; l2.className='landing-line2'; wrap.parentNode.insertBefore(l2, wrap.nextSibling); }
  }
}
function updateLandingTexts(line1Text, line2Text='', showLine2=true){
  const l1=document.getElementById('landing-line1'), l2=document.getElementById('landing-line2');
  if (l1){ l1.textContent=line1Text; l1.style.display=line1Text?'block':'none'; l1.classList.toggle('feeling-nature', line1Text==='Feeling Nature Seoul'); }
  if (l2){ l2.textContent=line2Text; l2.style.display=(showLine2 && line2Text)?'block':'none'; }
}
function removeLandingText(){ document.getElementById('landing-line1')?.remove(); document.getElementById('landing-line2')?.remove(); }
function showHeaderLogos(showBoth=false){
  const logos=document.getElementById('headerLogos'), left=document.querySelector('.header-logo:first-child'), right=document.querySelector('.header-logo:last-child');
  if (logos) logos.style.display='flex';
  if (right) right.style.display='block';
  if (left)  left.style.display= showBoth ? 'block' : 'none';
}
function hideHeaderLogos(){ const logos=document.getElementById('headerLogos'); if (logos) logos.style.display='none'; }

/* ---------- Canvas drawing ---------- */
function updateVisualizationCanvasWithBPGroups(data, centerLat, centerLon){
  const canvas = app.elements.canvas || (app.elements.canvas=document.getElementById('visualization-canvas'));
  if (!canvas || !data?.length) return;
  const rect=(canvas.parentElement||canvas).getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; canvas.style.width=rect.width+'px'; canvas.style.height=rect.height+'px';
  const ctx=canvas.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  const width=rect.width, height=rect.height, g=app.landing.currentGroup;
  const filtered=data.filter(d=>calculateDistance(centerLat, centerLon, d.lat, d.lon)<=MAX_DISTANCE_METERS);
  ctx.clearRect(0,0,width,height);
  filtered.forEach(d=>{
    if (!app.map) return;
    const p=app.map.project([d.lon,d.lat]);
    if (p.x<0||p.x>width||p.y<0||p.y>height) return;
    const inGroup=g && d.biophilia_norm>=g.min && d.biophilia_norm<g.max;
    ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,sizeScale(d.biophilia_norm)),0,Math.PI*2);
    ctx.fillStyle=colorScale(d.biophilia_norm); ctx.globalAlpha = inGroup?0.9:0.1; ctx.fill();
  });
  ctx.globalAlpha=1;
}

function updateVisualizationCanvas(data, centerLat, centerLon, animate=false){
  const canvas = app.elements.canvas || (app.elements.canvas=document.getElementById('visualization-canvas'));
  if (!canvas || !data?.length) return;
  const rect=(canvas.parentElement||canvas).getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; canvas.style.width=rect.width+'px'; canvas.style.height=rect.height+'px';
  const ctx=canvas.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  const width=rect.width, height=rect.height, cx=width/2, cy=height/2;

  const radiusScale=d3.scaleLinear().domain([0,MAX_DISTANCE_METERS]).range([0,(Math.min(cx,cy)-5)*0.98]).clamp(true);

  const filtered=data.filter(d=>calculateDistance(centerLat,centerLon,d.lat,d.lon)<=MAX_DISTANCE_METERS);
  const getMapPos=d=>{ const p=app.map.project([d.lon,d.lat]); return {x:p.x,y:p.y,r:sizeScale(d.biophilia_norm)}; };
  const getCircPos=d=>{ const dist=calculateDistance(centerLat,centerLon,d.lat,d.lon), ang=calculateBearing(centerLat,centerLon,d.lat,d.lon);
                         const rr=radiusScale(Math.floor(dist/500)*500); return {x:cx+rr*Math.cos(ang), y:cy+rr*Math.sin(ang), r:sizeScale(d.biophilia_norm)}; };

  const getColor=d=>{
    if (app.effects.pulse.active && app.state.isHighlightMode){
      // simple two-color pulse between highlight and gray
      const t=((performance.now()-app.effects.pulse.t0)%app.effects.pulse.period)/app.effects.pulse.period;
      const s=(1+Math.sin(2*Math.PI*t))/2;
      const a=(h)=>parseInt(h.replace('#',''),16);
      const lerp=(c1,c2)=>'#'+[16,8,0].map(shift=>{
        const v=Math.round(((c1>>shift)&255)*(1-s)+((c2>>shift)&255)*s);
        return v.toString(16).padStart(2,'0');
      }).join('');
      const c1=parseInt(HIGHLIGHT_COLOR.slice(1),16), c2=parseInt(NON_HIGHLIGHT_GRAY.slice(1),16);
      return isHighlighted(d)? lerp(c1,c2) : NON_HIGHLIGHT_GRAY;
    }
    if (!app.state.isHighlightMode) return colorScale(d.biophilia_norm);
    return isHighlighted(d) ? HIGHLIGHT_COLOR : NON_HIGHLIGHT_GRAY;
  };
  const getOpacity=d=> app.state.isHighlightMode ? (isHighlighted(d)?0.7:0.15) : 0.7;

  if (!animate){
    ctx.clearRect(0,0,width,height);
    const base= app.state.isCircularView ? filtered.map(getCircPos) : filtered.map(getMapPos);
    // draw non-highlighted then highlighted for layering
    filtered.forEach((d,i)=>{ if (app.state.isHighlightMode && isHighlighted(d)) return;
      const p=base[i]; if(p.x<0||p.x>width||p.y<0||p.y>height) return;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,p.r),0,2*Math.PI); ctx.fillStyle=getColor(d); ctx.globalAlpha=getOpacity(d); ctx.fill();
    });
    if (app.state.isHighlightMode) filtered.forEach((d,i)=>{ if (!isHighlighted(d)) return;
      const p=base[i]; if(p.x<0||p.x>width||p.y<0||p.y>height) return;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,p.r),0,2*Math.PI); ctx.fillStyle=getColor(d); ctx.globalAlpha=getOpacity(d); ctx.fill();
    });
    ctx.globalAlpha=1; return;
  }

  // animated morph between map ↔ circular
  app.state.animationInProgress=true;
  const init = app.state.isCircularView ? filtered.map(getMapPos) : filtered.map(getCircPos);
  const targ = app.state.isCircularView ? filtered.map(getCircPos) : filtered.map(getMapPos);
  const total = 1600, fade=600;
  let start=null;
  const step=(t)=>{
    if (!start) start=t;
    const e=t-start; ctx.clearRect(0,0,width,height);
    if (e<fade){
      const alpha=1-(e/fade)*(1-0.2);
      filtered.forEach((d,i)=>{ const p=init[i]; ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,p.r),0,2*Math.PI);
        ctx.fillStyle=getColor(d); ctx.globalAlpha=alpha*(getOpacity(d)/0.7); ctx.fill(); });
    }else{
      const tt=d3.easeCubicInOut(Math.min(1,(e-fade)/(total-fade)));
      filtered.forEach((d,i)=>{ const a=init[i], b=targ[i], x=a.x+(b.x-a.x)*tt, y=a.y+(b.y-a.y)*tt, r=a.r+(b.r-a.r)*tt;
        ctx.beginPath(); ctx.arc(x,y,Math.max(1,r),0,2*Math.PI); ctx.fillStyle=getColor(d); ctx.globalAlpha=getOpacity(d); ctx.fill(); });
    }
    ctx.globalAlpha=1;
    if (e<total) app.registerRAF(step); else app.state.animationInProgress=false;
  };
  app.registerRAF(step);
}

/* ---------- Landing sequence (endless) ---------- */
let landingRestartTimer=null;

async function startLandingAnimationSequence(){
  if (app.mode!==Modes.LANDING || app.landing.active) return;
  app.landing.active=true;

  try{
    // A) Video + title
    showHeaderLogos(false);
    showVideo();
    updateLandingTexts('Feeling Nature Seoul','',false);
    await wait(5000);

    // B) Video + explainer
    updateLandingTexts(
      'Biophilia refers to the benefits that contact with nature brings to humans. But do we value nature the same way across biomes?',
      'Explore how Seoul residents perceive nature.', true
    );
    await wait(11000);

    // C) BS map
    hideVideo(); showHeaderLogos(true);
    app.state.currentDataType='BS'; const bs=await loadSeoulData('BS');
    updateVisualizationCanvas(bs, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    updateLandingTexts('Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.',
      'BS Map: the distribution of nature-based elements in Seoul urban environment.', true);
    await wait(4000);

    // D) BP map
    app.state.currentDataType='BP'; const bp=await loadSeoulData('BP');
    updateVisualizationCanvas(bp, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    updateLandingTexts('Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.',
      'BP Map: the strength of perceived Biophilia in the city', true);
    await wait(4000);

    // E) BP group highlight (2 cycles), then restart whole sequence
    await runBPGroupHighlightLoop(bp, seoulData.coordinates.lat, seoulData.coordinates.lon, 2);
  }catch(e){
    console.error('Landing sequence error', e);
  }finally{
    app.landing.active=false;
    landingRestartTimer = app.registerTimeout(()=>{ if (app.mode===Modes.LANDING) startLandingAnimationSequence(); }, 1000);
  }
}

function updateLandingTextGroupDynamic(group){
  const min=(Math.round(group.min*100)/100).toFixed(2);
  const max=(Math.round(group.max*100)/100).toFixed(2);
  updateLandingTexts('Complete the survey to learn how you perceive and value nature in Seoul!',
    `Biophilic Perceptions (BP) group value located in Seoul: ${min}–${max}`, true);
}

async function runBPGroupHighlightLoop(data, lat, lon, cycles=2){
  let i=0, done=0;
  app.landing.currentGroup = BP_GROUPS[0];
  updateLandingTextGroupDynamic(app.landing.currentGroup);
  updateVisualizationCanvasWithBPGroups(data, lat, lon);

  const tick = ()=>{
    if (app.mode!==Modes.LANDING) return;
    i=(i+1)%BP_GROUPS.length;
    if (i===0 && ++done>=cycles){ /* stop loop, caller restarts sequence */ return; }
    app.landing.currentGroup = BP_GROUPS[i];
    updateLandingTextGroupDynamic(app.landing.currentGroup);
    updateVisualizationCanvasWithBPGroups(data, lat, lon);
    app.landing.intervalId = app.registerTimeout(tick, 2500);
  };
  app.landing.intervalId = app.registerTimeout(tick, 2500);
}

/* ---------- Result sequence (hides basemap during circular) ---------- */
async function executeResultSequence(){
  try{
    if (app.state.currentDataType!=='BP'){ app.state.currentDataType='BP'; await loadSeoulData('BP'); await wait(300); }
    const bp = app.data.cache['seoul_BP'];

    // 1) Highlight on map
    app.state.isCircularView=false;
    app.state.isHighlightMode=true;
    startPulseLoop();
    updateVisualizationCanvas(bp, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    await wait(3000);

    // 1b) stop pulse & clear
    app.state.isHighlightMode=false; stopPulseLoop();
    updateVisualizationCanvas(bp, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
    await wait(1200);

    // 2) Switch to circular view — HIDE MAP
    const mapEl=document.getElementById('map'); if (mapEl) mapEl.classList.add('hidden-map');  // << important
    app.state.isCircularView=true;
    updateVisualizationCanvas(bp, seoulData.coordinates.lat, seoulData.coordinates.lon, true);
    await wait(1800);

    // 3) Hold circular
    await wait(4000);
  }catch(e){
    console.error('Result sequence error', e);
  }finally{
    app.state.animationInProgress=false;
  }
}

/* ---------- Video & texts ---------- */
function showVideo(){
  const gif=document.getElementById('landingVideo'), map=document.getElementById('map'), canvas=document.getElementById('visualization-canvas');
  if (gif){ gif.style.display='block'; gif.style.opacity='1'; }
  if (map) map.style.display='none';
  if (canvas) canvas.style.display='none';
}
function hideVideo(){
  const gif=document.getElementById('landingVideo'), map=document.getElementById('map'), canvas=document.getElementById('visualization-canvas');
  if (gif){ gif.style.opacity='0'; app.registerTimeout(()=>{ gif.style.display='none'; gif.style.opacity='1'; }, 500); }
  if (map) map.style.display='block';
  if (canvas) canvas.style.display='block';
}

/* ---------- Mode switching ---------- */
function clearAllTimersAndAnimations(){
  for (const id of app.cleanup.timers){ clearTimeout(id); clearInterval(id); }
  app.cleanup.timers.clear();
  for (const id of app.cleanup.animations){ cancelAnimationFrame(id); }
  app.cleanup.animations.clear();
  stopPulseLoop(); removeAllCustomTooltips(); window.stopKioskPoller?.();
  app.landing.active=false; app.landing.currentGroup=null; if (app.landing.intervalId){ clearTimeout(app.landing.intervalId); app.landing.intervalId=null; }
  app.state.animationInProgress=false;
  if (landingRestartTimer){ clearTimeout(landingRestartTimer); landingRestartTimer=null; }
}

async function setMode(newMode){
  if (app.mode===newMode) return;
  clearAllTimersAndAnimations();

  if (!app.elements.leftTop){
    app.elements.leftTop = document.querySelector('.left-column-top');
    app.elements.rightCol = document.querySelector('.right-column');
    app.elements.footer   = document.querySelector('footer');
    app.elements.mapContainer = document.getElementById('map');
    app.elements.canvas   = document.getElementById('visualization-canvas');
  }

  app.mode = newMode;
  document.body.classList.toggle('result-mode', newMode===Modes.RESULT);
  document.body.classList.toggle('landing-mode', newMode===Modes.LANDING);

  const mapEl=document.getElementById('map');
  if (mapEl) mapEl.classList.remove('hidden-map');  // start visible; result sequence will hide when circular

  if (newMode===Modes.LANDING){
    showLandingLayout();
    hideHeaderLogos();           // landing sequence controls logos
    app.state.currentDataType='BP';
    await loadSeoulData('BP');
    app.state.isCircularView=false; app.state.isHighlightMode=false;
    await startLandingAnimationSequence();
  } else {
    showDashboardLayout();
    hideHeaderLogos();
    await Promise.all([loadSeoulData('BS'), loadSeoulData('BP'), loadDashboardData(), loadAllParticipantsData()]);
    app.state.isCircularView=false; app.state.isHighlightMode=false;
    await executeResultSequence();
  }
}

/* ---------- Global hooks for the poller ---------- */
window.setMode = setMode;
window.updateVisualizationCanvas = updateVisualizationCanvas;
window.updateVisualizationCanvasWithBPGroups = updateVisualizationCanvasWithBPGroups;

// TV adapter pushes BP value here
window.setUserBp = function(bp){
  const v = Number(bp)||0.5, EPS=0.01;
  app.state.bpValue=v;
  app.state.highlightMin=Math.max(0,v-EPS);
  app.state.highlightMax=Math.min(1,v+EPS);
  const n=document.getElementById('bpValueNumber'); if (n) n.textContent=v.toFixed(2);
};

/* ---------- Bootstrap ---------- */
window.addEventListener('load', async ()=>{
  initializeMapbox();                 // reads <meta name="mapbox-token">
  await setMode(Modes.LANDING);       // start in landing
});
