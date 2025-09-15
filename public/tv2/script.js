// public/tv2/script.js  — TV-2 petals → "SEOUL" → biome dots → video (state-driven, ES module)

// ===== Imports =====
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

// ===== Config (state poller) =====
const S3_STATE_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const POLL_MS = 1200;

// ===== DOM =====
const backgroundMusic = document.getElementById('backgroundMusic');
const veil = document.getElementById('veil');
const percentage = document.getElementById('percentage');
const videoContainer = document.getElementById('videoContainer');
const bgVideo = document.getElementById('bgVideo');
const tapToPlay = document.getElementById('tapToPlay');

// Optional debug HUD (?debug=1)
const urlParams = new URLSearchParams(location.search);
const DEBUG = urlParams.get('debug') === '1';
const hud = document.getElementById('hud');
if (!DEBUG && hud) hud.style.display = 'none';

// ===== Runtime state =====
let currentMode = 'landing';     // 'landing' | 'video'
let isTransformed = false;       // when petals became biome dots
let isPlaying = false;           // landing music proxy state

// Music dynamics
let currentVolume = 1.0;
let targetVolume = 1.0;
let baseVolume = 1.0;

// ===== THREE globals =====
let scene, camera, renderer, controls;
let base, treeObject = null;
let pointsGeom, pointsMat, circleTexture;

const uniforms = {
  time:          { value: 0 },
  upperLimit:    { value: 10 },
  upperRatio:    { value: 2.1 },
  spiralRadius:  { value: 1.8 },
  spiralTurns:   { value: 1.3 },
  tex2020:       { value: null }, // “SEOUL” texture
  azimuth:       { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 }   // fade petals/dots when switching to video
};
const uniformsTree = { time: { value: 0 } };

// Field configuration
const MAX_POINTS = 30000;
const biomeColors = {
  "Alpine":               new THREE.Color("#C2E4FF"),
  "Mediterranean":        new THREE.Color("#FFB14E"),
  "Desert":               new THREE.Color("#EBA845"),
  "Tundra":               new THREE.Color("#B6D5D0"),
  "Monsoon":              new THREE.Color("#46A1E0"),
  "Savanna":              new THREE.Color("#BEA748"),
  "Coniferous Forest":    new THREE.Color("#1EBF6F"),
  "Temperate Forest":     new THREE.Color("#83BB59"),
  "Grassland":            new THREE.Color("#AAB770"),
  "Tropical Forest":      new THREE.Color("#497B42")
};
const biomeNames = Object.keys(biomeColors);
let targetPositions = [], targetColors = [];

// ===== Utilities =====
function createCircleTexture(){
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), m = 16, R = 14;
  const g = x.createRadialGradient(m,m,0,m,m,R);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.7,'rgba(255,255,255,1)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(m,m,R,0,Math.PI*2); x.fill();
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function buildSeoulTexture(){
  const cnvs = document.createElement('canvas');
  cnvs.width = 1024; cnvs.height = 256;
  const ctx = cnvs.getContext('2d');
  ctx.clearRect(0,0,cnvs.width,cnvs.height);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.strokeStyle = 'rgba(255,0,120,1)';
  ctx.lineWidth = 8;
  ctx.font = 'bold 200px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('SEOUL', cnvs.width/2, cnvs.height/2 + 10);
  ctx.fillText('SEOUL', cnvs.width/2, cnvs.height/2 + 10);
  return new THREE.CanvasTexture(cnvs);
}

// ===== Music =====
function playBackgroundMusic(){
  if (!backgroundMusic) return;
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  backgroundMusic.play().catch(()=>{/* blocked; wait for user/tap */});
}
function fadeOutMusic(ms=1500){
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms/50));
  const v0 = backgroundMusic.volume; let i=0;
  const it = setInterval(()=>{ i++; backgroundMusic.volume = Math.max(0, v0*(1 - i/steps));
    if (i>=steps){ clearInterval(it); backgroundMusic.pause(); } },50);
}

// --- Soft-reset landing without page reload (Pattern B) ---
let initialPositions = null, initialColors = null;

function captureInitialBuffersOnce() {
  if (!pointsGeom) return;
  if (!initialPositions) initialPositions = pointsGeom.attributes.position.array.slice(0);
  if (!initialColors)    initialColors    = pointsGeom.attributes.color.array.slice(0);
}

function pauseForVideo() {
  try { renderer?.setAnimationLoop(null); } catch (e) {}
  if (renderer?.domElement) renderer.domElement.style.display = 'none';
}

function hideVideoAndPause() {
  try { bgVideo && bgVideo.pause(); } catch (e) {}
  try { if (bgVideo) bgVideo.currentTime = 0; } catch (e) {}
  if (videoContainer) videoContainer.style.display = 'none';
  if (tapToPlay) tapToPlay.style.display = 'none';
}

function resetLandingState() {
  if (!pointsGeom) return;

  // restore geometry attributes
  if (initialPositions) {
    pointsGeom.attributes.position.array.set(initialPositions);
    pointsGeom.attributes.position.needsUpdate = true;
  }
  if (initialColors) {
    pointsGeom.attributes.color.array.set(initialColors);
    pointsGeom.attributes.color.needsUpdate = true;
  }

  // reseed delays for staggered re-rise
  const d = pointsGeom.attributes.delay;
  if (d) {
    for (let i = 0; i < d.array.length; i++) d.array[i] = THREE.Math.randFloat(-10, 0);
    d.needsUpdate = true;
  }

  // reset uniforms / flags / visibility
  isTransformed = false;
  uniforms.isTransformed.value = 0.0;
  uniforms.globalOpacity.value = 1.0;
  if (treeObject) treeObject.visible = true;
  if (base)       base.visible = true;

  // camera + controls back to landing defaults
  controls.target.set(0, 4, 0);
  camera.position.set(0, 5, 10);
  controls.autoRotate = true;
  controls.minDistance = 5;  controls.maxDistance = 12.5;
  controls.update();

  // show canvas + resume loop
  if (renderer?.domElement) renderer.domElement.style.display = '';
  animate();
}

// ===== Scene =====
function initScene(){
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 1, 1000);
  camera.position.set(0,5,10);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x11130E);
  document.body.appendChild(renderer.domElement);
  addEventListener('resize', onResize);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.05;
  controls.autoRotate = true; controls.autoRotateSpeed = -0.8;
  controls.minPolarAngle = THREE.Math.DEG2RAD * 80; controls.maxPolarAngle = THREE.Math.DEG2RAD * 100;
  controls.minDistance = 5;  controls.maxDistance = 12.5;

  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // Base “ground”
  const g = new THREE.CircleGeometry(8,64);
  const m = new THREE.MeshBasicMaterial({ color: 0x0C0E09, transparent:true, opacity:0.9 });
  base = new THREE.Mesh(g,m); base.rotation.x = -Math.PI/2; base.position.y = -0.05; scene.add(base);

  // Load tree OBJ + shimmer points overlay
  const loader = new OBJLoader(); if (percentage) percentage.style.display = "block";
  loader.load('img/seoul-tree.obj',
    (obj)=>{
      obj.traverse(child=>{ if (child.isMesh){ child.material.color.set(0x5B3A1A); } });

      // shimmer point overlay
      const mesh = obj.children.find(c=>c.isMesh) || obj.children[0];
      const sampler = new MeshSurfaceSampler(mesh).build();
      const pts=[], idx=[], n=new THREE.Vector3();
      for (let i=0;i<1250;i++){ const p=new THREE.Vector3(); sampler.sample(p,n); pts.push(p); idx.push(i); }

      const treePts = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color:0x482D02, size:0.11, map: circleTexture, transparent:true, alphaTest:0.05, depthWrite:false })
      );
      treePts.geometry.setAttribute("idx", new THREE.BufferAttribute(new Float32Array(idx),1));
      treePts.material.onBeforeCompile = (shader)=>{
        shader.uniforms.time = uniformsTree.time;
        shader.vertexShader = 'uniform float time; attribute float idx;' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          'gl_PointSize = size;',
          `float halfSize = size*0.5; float tIdx = idx + time;
           gl_PointSize = size + (sin(tIdx)*cos(tIdx*2.5)*0.5+0.5) * halfSize * 0.5;`
        );
      };

      obj.add(treePts);
      obj.rotation.y = THREE.Math.DEG2RAD * 20; obj.scale.setScalar(5);
      scene.add(obj); treeObject = obj; if (percentage) percentage.style.display = "none";
    },
    (xhr)=>{ if (percentage && xhr.lengthComputable) percentage.textContent = (xhr.loaded/xhr.total*100).toFixed(0) + '%'; }
  );

  // --- Petals field (points) ---
  const c = new THREE.Color();
  const points = []; const color = []; const delay = []; const speed = [];
  let pointsCount = 0; const r = 8;
  while (pointsCount < MAX_POINTS){
    const v = new THREE.Vector3(THREE.Math.randFloat(-r,r),0,THREE.Math.randFloat(-r,r));
    const rr = v.length()/r;
    if (v.length()<=r && Math.random()<(1-rr)){
      points.push(v);
      c.set(0xffffcc); color.push(c.r, c.g - Math.random()*0.1, c.b + Math.random()*0.2);
      delay.push(THREE.Math.randFloat(-10,0));
      let val = THREE.Math.randFloat(1,2); if (Math.random()<0.25) val = 0;
      speed.push(Math.PI*val*0.125, val);
      const b = biomeNames[Math.floor(Math.random()*biomeNames.length)];
      const bc = biomeColors[b];
      const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
      targetPositions.push(new THREE.Vector3(tx,ty,tz));
      targetColors.push([bc.r, bc.g, bc.b]);
      pointsCount++;
    }
  }
  pointsGeom = new THREE.BufferGeometry().setFromPoints(points);
  pointsGeom.setAttribute("color",  new THREE.BufferAttribute(new Float32Array(color),3));
  pointsGeom.setAttribute("delay",  new THREE.BufferAttribute(new Float32Array(delay),1));
  pointsGeom.setAttribute("speed",  new THREE.BufferAttribute(new Float32Array(speed),2));

  pointsMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    map: circleTexture,     // round sprite base
    alphaTest: 0.05,
    depthWrite: false
  });

  // Vertex motion (petals → letters; then biome-dots) + safe fragment tweak for petal shape & color
  pointsMat.onBeforeCompile = (shader)=>{
    Object.assign(shader.uniforms, uniforms);

    // ---- Vertex: motion & letter sampling (keeps your original flow) ----
    shader.vertexShader = `
      uniform float time, upperLimit, upperRatio, spiralRadius, spiralTurns, azimuth, isTransformed;
      uniform sampler2D tex2020;
      attribute float delay; attribute vec2 speed;
      varying float vRatio; varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
        #include <begin_vertex>
        // switch based on isTransformed: 0 = petals, 1 = biome dots (float)
        if (isTransformed > 0.5) {
          // gentle wobble/float in place for biome dots
          float ws1 = 0.6, ws2 = 0.9;
          float wp1 = (position.z * 0.5 + position.x * 1.7);
          float w1 = sin(time * ws1 + wp1) * 0.5;
          float wp2 = (position.x * 0.7 + position.z * 1.3);
          float w2 = cos(time * ws2 + wp2) * 0.4;
          float dx = sin(time * 0.2 + position.z * 0.1) * 0.3;
          float dz = cos(time * 0.25 + position.x * 0.1) * 0.2;
          float gA = sin(time * 0.3) * 0.15;
          mat3 gR = mat3(cos(gA),0.,sin(gA), 0.,1.,0., -sin(gA),0.,cos(gA));
          float rS = 0.1 + (position.x + position.y + position.z)*0.01;
          float rA = sin(time * rS) * 0.1;
          mat3 rY = mat3(cos(rA),0.,sin(rA), 0.,1.,0., -sin(rA),0.,cos(rA));
          transformed = gR * (rY * position + vec3(dx, w1+w2, dz));
          vRatio = 0.; vIsEffect = 0.;
        } else {
          // petals spiral-rise/fall + sample “SEOUL” window
          float t = max(time + delay, 0.0);
          float cycle=40., rise=20., fall=6.; float loopT = mod(t, cycle);
          float UL = upperLimit; float UR = upperRatio;
          float h;
          if (loopT < rise){
            h = mod(speed.y * loopT, UL);
            vec2 sp = vec2(position.x, position.z) * (spiralRadius + 0.05*loopT);
            float turns = spiralTurns * 3.14159;
            sp *= rot(loopT * turns / rise);
            transformed = vec3(sp.x, h, sp.y);
          } else {
            float fp = (loopT - rise)/fall;
            float id = (delay + 10.)/10.;
            float adj = clamp((fp - id*0.3)/(1. - id*0.3), 0., 1.);
            float maxH = mod(speed.y * rise, UL);
            float fallCurve = (1. - (adj*adj*(3.-2.*adj)));
            transformed = vec3(position.x, maxH*fallCurve, position.z);
          }

          // letter sampling window (face-on quad in front of camera)
          mat2 R = rot(-azimuth);
          vec2 uv = (R * vec2(position.x, position.z)) * 0.05 + vec2(0.5, 0.5);
          float letter = texture2D(tex2020, uv).r;
          vIsEffect = step(0.5, letter);
          float distXZ = length(vec2(position.x, position.z));
          vRatio = clamp(distXZ / UL, 0., 1.);
        }
      `
    );

    // ---- Fragment: circular sprite mask + color mixing w/ SEOUL ----
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying vec3 vColor; varying float vRatio; varying float vIsEffect; uniform float globalOpacity; void main() {'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
        #include <color_fragment>
        // Petal mask (soft 5-lobed look)
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = atan(p.y, p.x), r = length(p);
        float k = 5.0, petal = (0.55 + 0.25 * cos(k * a));
        float mask = 1.0 - step(petal, length(p));
        if (mask < 0.5) discard;
      
        // Color mix: default vertex color → Seoul pink on letter mask
        vec3 seoul = vec3(0.95, 0.00, 0.45);
        vec3 baseCol = vColor;
        vec3 mixed   = mix(baseCol, seoul, clamp(vIsEffect, 0.0, 1.0));
      
        vec4 diffuseColor = vec4(mixed, opacity * globalOpacity);
        `
      );  
  };

  const pts = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pts);
  captureInitialBuffersOnce();

  animate();
}

function onResize(){
  if (!renderer || !camera) return;
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ===== Animation / music proxy =====
const clock = new THREE.Clock();
function animate(){
  renderer.setAnimationLoop(()=>{
    const dt = clock.getDelta();
    uniforms.time.value += dt * 0.5;
    if (controls) {
      uniforms.azimuth.value = controls.getAzimuthalAngle();
      controls.update();
    }
    uniforms.isTransformed.value = isTransformed ? 1.0 : 0.0;
    uniformsTree.time.value = uniforms.time.value * 5.0;

    if (!isTransformed && isPlaying && currentMode === 'landing') calcVolumeProxy();
    renderer.render(scene, camera);
  });
}

function updateMusic(p90, UL, phase){
  const hNorm = Math.max(0, Math.min(1, p90 / UL));
  targetVolume = baseVolume * (0.3 + 0.7*hNorm);
  currentVolume = currentVolume + (targetVolume - currentVolume) * 0.04;
  if (backgroundMusic && !backgroundMusic.paused) backgroundMusic.volume = currentVolume;
  if (DEBUG && hud){
    hud.innerHTML = `
      <div><b>Volume</b> ${currentVolume.toFixed(2)}</div>
      <div><b>Height (P90)</b> ${(p90||0).toFixed(2)} / ${UL}</div>
      <div><b>Phase</b> ${phase}</div>
    `;
  }
}
function calcVolumeProxy(){
  if (!pointsGeom) return;
  const UL = uniforms.upperLimit.value;
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;

  const SAMPLE = 1500, total = delays.length;
  const idxs = new Uint32Array(Math.min(SAMPLE, total));
  for (let i=0;i<idxs.length;i++) idxs[i] = (Math.random()*total)|0;

  const t = uniforms.time.value;
  const hts = []; let rising=0, falling=0;
  for (let k=0;k<idxs.length;k++){
    const i = idxs[k], d = delays[i], sp = speeds[i*2+1], ct = t + d; if (ct<=0) continue;
    const cycle=40, rise=20, fall=6, loop=ct%cycle;
    let h;
    if (loop < rise){ h = (sp*loop)%UL; rising++; }
    else { const fp=(loop-rise)/fall, id=(d+10)/10, adj=Math.max(0,Math.min(1,(fp-id*0.3)/(1-id*0.3)));
           const maxH=(sp*rise)%UL; h=maxH*(1 - (adj*adj*(3-2*adj))); falling++; }
    hts.push(h);
  }
  let phase='Mixed'; if (rising > 2*falling) phase='Rising'; else if (falling > 2*rising) phase='Falling';
  if (hts.length){ hts.sort((a,b)=>a-b); const p90 = hts[Math.floor(0.9*hts.length)]; updateMusic(p90, UL, phase); }
}

// ===== Transitions =====
function startLanding(){
  if (veil) veil.style.display = "none";

  if (currentMode === 'video') {
    hideVideoAndPause();     // hide/pause video
    resetLandingState();     // restore petals/tree/ground + camera/controls + loop
    isPlaying = true;
    try { backgroundMusic && backgroundMusic.load(); } catch (e) {}
    playBackgroundMusic();
    currentMode = 'landing';
    return;
  }

  if (isTransformed) {
    resetLandingState();
    isPlaying = true;
    try { backgroundMusic && backgroundMusic.load(); } catch (e) {}
    playBackgroundMusic();
    currentMode = 'landing';
    return;
  }

  // already landing → ensure music & loop
  isPlaying = true;
  try { backgroundMusic && backgroundMusic.load(); } catch (e) {}
  playBackgroundMusic();
  currentMode = 'landing';
}

function toBiomeDots(){
  if (isTransformed) return;

  // hide tree + base for the dots phase
  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;

  // widen camera & stop autorotate
  if (controls){
    controls.autoRotate = false;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 15, 28);
    controls.minDistance = 12; controls.maxDistance = 40;
    controls.update();
  }

  // warp petals to biome colors/positions
  const pos = pointsGeom.attributes.position.array;
  const col = pointsGeom.attributes.color.array;
  for (let i=0;i<targetPositions.length && i*3+2<pos.length;i++){
    const tp = targetPositions[i], tc = targetColors[i];
    pos[i*3]=tp.x; pos[i*3+1]=tp.y; pos[i*3+2]=tp.z;
    col[i*3]=tc[0]; col[i*3+1]=tc[1]; col[i*3+2]=tc[2];
  }
  pointsGeom.attributes.position.needsUpdate = true;
  pointsGeom.attributes.color.needsUpdate = true;

  uniforms.isTransformed.value = 1; isTransformed = true;
}
function fadeDots(ms=2000, done){
  const s = performance.now();
  const step = (now)=>{
    const t = Math.min(1,(now-s)/ms); uniforms.globalOpacity.value = 1 - t;
    if (t<1) requestAnimationFrame(step); else { uniforms.globalOpacity.value = 0; done && done(); }
  };
  requestAnimationFrame(step);
}

function teardownThree(){ // (kept for reference; not used in Pattern B)
  try{ scene?.traverse(o=>{ if(o.isMesh||o.isPoints){ o.geometry.dispose?.(); o.material.dispose?.(); } }); }catch{}
  try{ renderer?.dispose?.(); }catch{} try{ renderer?.domElement?.remove?.(); }catch{}
  scene=camera=renderer=controls=null;
}
function showVideo(){
  if (!bgVideo){ console.warn('bgVideo element not found'); return; }
  // Prefer unmuted (so the video’s own audio plays); fallback to muted autoplay with tap-to-unmute overlay
  bgVideo.muted = false;
  const reveal = ()=>{
    if (videoContainer) videoContainer.style.display = 'block';
    else bgVideo.style.display = 'block';
  };
  if (bgVideo.readyState >= 2) reveal();
  else { const h = ()=>{ bgVideo.removeEventListener('canplay',h); reveal(); }; bgVideo.addEventListener('canplay',h); }
  const p = bgVideo.play();
  if (p && p.catch) p.catch(()=>{ if (tapToPlay) tapToPlay.style.display='flex'; reveal(); });
}
// Tap overlay → enable sound immediately
if (tapToPlay){
  tapToPlay.addEventListener('click', ()=>{ if (!bgVideo) return; tapToPlay.style.display='none'; bgVideo.muted=false; bgVideo.play(); });
}

// ===== State poller (ETag) =====
let lastETag = null;
function isExpired(s){ const e = Date.parse(s?.expires_at||''); return Number.isFinite(e) && Date.now() > e; }
async function fetchState(){
  try{
    const headers = {}; if (lastETag) headers['If-None-Match']=lastETag;
    const res = await fetch(S3_STATE_URL,{ headers, cache:'no-cache' });
    if (res.status===304) return null;
    if (!res.ok) throw new Error('state '+res.status);
    lastETag = res.headers.get('ETag'); return await res.json();
  }catch(e){ return null; }
}

async function tick(){
  const s = await fetchState(); 
  if (!s) return;

  // Accept either {stage} or {state} from the runtime file
  const stage = (s.stage || s.state || 'idle');

  // If state is expired or explicitly landing/idle → ensure landing
  if (isExpired(s) || stage === 'landing' || stage === 'idle') {
    startLanding();
    return;
  }

  // Only show video on show_result; ignore in_progress/countdown on TV2
  if (stage === 'show_result') {
    if (currentMode !== 'video') {
      toBiomeDots();
      setTimeout(() => {
        fadeDots(2000, () => {
          // Fade out landing music, pause rendering, then show video (prefer audio)
          fadeOutMusic(1200);
          pauseForVideo();
          showVideo();
          currentMode = 'video';
        });
      }, 5000);
    }
    return;

  }

  // Any other stage (e.g., in_progress, countdown) → stay/return to landing
  if (currentMode !== 'landing') startLanding();
}


// ===== Boot =====
(function main(){
  // Prebuild targets to full length
  for (let i=0;i<MAX_POINTS;i++){
    const b = biomeNames[i % biomeNames.length];
    const bc = biomeColors[b];
    const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
    targetPositions.push(new THREE.Vector3(tx,ty,tz));
    targetColors.push([bc.r,bc.g,bc.b]);
  }

  initScene();

  // enter landing immediately (music may require user gesture; we add a one-shot handler)
  currentMode = 'landing';
  isPlaying = true;
  if (veil) veil.style.display = "none";
  try { backgroundMusic && backgroundMusic.load(); } catch {}
  playBackgroundMusic();
  const resumeAudioOnce = ()=>{
    if (backgroundMusic && backgroundMusic.paused){
      try { backgroundMusic.play().catch(()=>{}); } catch {}
    }
    document.removeEventListener('pointerdown', resumeAudioOnce, { capture:true });
  };
  document.addEventListener('pointerdown', resumeAudioOnce, { capture:true, once:true });

  setInterval(tick, POLL_MS);
})();