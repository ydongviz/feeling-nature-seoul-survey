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
const veil            = document.getElementById('veil');
const percentage      = document.getElementById('percentage');
const videoContainer  = document.getElementById('videoContainer');
const bgVideo         = document.getElementById('bgVideo');
const tapToPlay       = document.getElementById('tapToPlay');

// Optional debug HUD (?debug=1)
const debug = new URLSearchParams(location.search).get('debug') === '1';
const volumeValue = document.getElementById('volumeValue');
const heightValue = document.getElementById('heightValue');
const phaseValue  = document.getElementById('phaseValue');
if (debug) document.getElementById('volumeDebug')?.removeAttribute('hidden');

// ===== Kiosk State =====
let currentMode   = 'landing'; // 'landing' | 'video'
let isTransformed = false;     // biome-dots phase flag
let isPlaying     = false;

// ===== Music dynamics =====
let currentVolume = 1.0;
let targetVolume  = 1.0;
let baseVolume    = 1.0;

function playBackgroundMusic(){
  if (!backgroundMusic) return;
  try { backgroundMusic.load(); } catch {}
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  const p = backgroundMusic.play();
  if (p && p.catch) p.catch(()=>{});
}
function fadeOutMusic(ms=1500){
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms/50));
  const v0 = backgroundMusic.volume; let i=0;
  const it = setInterval(()=>{
    i++;
    backgroundMusic.volume = Math.max(0, v0*(1 - i/steps));
    if (i>=steps){ clearInterval(it); backgroundMusic.pause(); }
  },50);
}
function updateMusic(avgHeight, maxH, phase){
  let ratio = Math.max(0, Math.min(1, avgHeight / maxH));
  if (ratio > 0.98) ratio = 1.0;
  targetVolume = Math.min(1, ratio * baseVolume);
  if (Math.abs(currentVolume - targetVolume) > 0.005){
    currentVolume += (targetVolume - currentVolume) * 0.2;
    if (!backgroundMusic.paused) backgroundMusic.volume = currentVolume;
  }
  if (debug){
    volumeValue.textContent = currentVolume.toFixed(3);
    heightValue.textContent = avgHeight.toFixed(2);
    phaseValue.textContent  = phase;
  }
}

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
const r = 4.8, MAX_POINTS = 30000;
let pointsCount = 0;
let points = [], delay = [], speed = [], color = [];

// Biome palette
const biomeColors = {
  "Tundra":               new THREE.Color("#90D2C8"),
  "Mediterranean Forest": new THREE.Color("#BF6021"),
  "Desert":               new THREE.Color("#D0C07C"),
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
  g.addColorStop(0.00,'rgba(255,255,255,1)');
  g.addColorStop(0.80,'rgba(255,255,255,0.9)');
  g.addColorStop(1.00,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
}
function buildSeoulTexture(){
  const cnvs = document.createElement("canvas");
  cnvs.width = 400; cnvs.height = 100;
  const ctx = cnvs.getContext("2d");
  ctx.fillStyle = "transparent"; ctx.fillRect(0,0,cnvs.width,cnvs.height);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 8;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "900 80px 'Arial Black', Arial, sans-serif";
  ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.fillText("SEOUL",  cnvs.width * 0.5, cnvs.height * 0.5);
  return new THREE.CanvasTexture(cnvs);
}

// ===== Scene =====
function initScene(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 1, 1000);
  camera.position.set(0,5,10);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const clearCol = new THREE.Color(0x11130E);
  renderer.setClearColor(clearCol);
  document.body.appendChild(renderer.domElement);
  addEventListener('resize', onResize);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.05;
  controls.autoRotate = true; controls.autoRotateSpeed = -0.8;
  controls.minPolarAngle = THREE.Math.DEG2RAD * 80; controls.maxPolarAngle = THREE.Math.DEG2RAD * 100;
  controls.minDistance = 5;  controls.maxDistance = 12.5;
  controls.target.set(0,4,0); controls.update();

  // ----- Ground: original gradient mix (soft radial falloff) -----
  const baseGeom = new THREE.CircleBufferGeometry(6,64); baseGeom.rotateX(-Math.PI*0.5);
  const baseMat = new THREE.MeshBasicMaterial({ color:0x5A4218 });
  baseMat.defines = { USE_UV: "" };
  baseMat.onBeforeCompile = (shader)=>{
    shader.fragmentShader = shader.fragmentShader.replace(
      `gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
      `
        vec3 col = vec3(${clearCol.r.toFixed(3)}, ${clearCol.g.toFixed(3)}, ${clearCol.b.toFixed(3)});
        vec2 uv = vUv - 0.5;
        uv *= 2.0;
        col = mix(outgoingLight, col, length(uv));
        gl_FragColor = vec4(col, diffuseColor.a);
      `
    );
  };
  base = new THREE.Mesh(baseGeom, baseMat); base.position.y = -0.15; scene.add(base);

  // ----- Textures -----
  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // ----- Tree OBJ + shimmer points (keep round sprite) -----
  const loader = new OBJLoader();
  loader.load(
    'https://threejs.org/examples/models/obj/tree.obj',
    (obj)=>{
      obj.children[0].material = new THREE.MeshBasicMaterial({ color:0x4A3C28, transparent:true, opacity:0.75 });
      const sampler = new MeshSurfaceSampler(obj.children[0]).setWeightAttribute(null).build();
      const pts=[], idx=[]; const n = new THREE.Vector3();
      for (let i=0;i<1250;i++){ const p = new THREE.Vector3(); sampler.sample(p,n); pts.push(p); idx.push(i); }
      const treePts = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color:0x482D02, size:0.16, map:circleTexture, transparent:true, alphaTest:0.05, depthWrite:false })
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
        // keep default fragment (uses map) for round discs
      };
      obj.add(treePts);
      obj.rotation.y = THREE.Math.DEG2RAD * 20; obj.scale.setScalar(5);
      scene.add(obj); treeObject = obj; if (percentage) percentage.style.display = "none";
    },
    (xhr)=>{ if (xhr.lengthComputable && percentage) percentage.textContent = (xhr.loaded/xhr.total*100).toFixed(0) + '%'; }
  );

  // ----- Petals field (points) -----
  const c = new THREE.Color();
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

  // Vertex motion (petals → letters; then biome-dots) + minimal fragment tweak for color/opacity only
  pointsMat.onBeforeCompile = (shader)=>{
    Object.assign(shader.uniforms, uniforms);

    // ---- Vertex: motion & letter sampling (as original, but without time wobble on spiralTurns) ----
    shader.vertexShader = `
      uniform float time, upperLimit, upperRatio, spiralRadius, spiralTurns, azimuth, isTransformed;
      uniform sampler2D tex2020;
      attribute float delay; attribute vec2 speed;
      varying float vRatio; varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       if (isTransformed > 0.5){
         // biome dots gently floating
         float ws1 = 0.3 + (position.x + position.z) * 0.02;
         float wp1 = (position.x * 1.2 + position.z * 0.9);
         float w1 = sin(time * ws1 + wp1) * 0.8;
         float ws2 = 0.5 + (position.x - position.z) * 0.015;
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
         float h;
         if (loopT < rise) { h = mod(speed.y * loopT, upperLimit); }
         else {
           float fp=(loopT-rise)/fall; float id=(delay+10.)/10.;
           float adj = clamp((fp - id*0.3)/(1.-id*0.3), 0., 1.); adj = smoothstep(0.,1.,adj);
           float maxH = mod(speed.y * rise, upperLimit); h = maxH * (1. - adj);
         }
         float hR = clamp(h/upperLimit, 0., 1.); vRatio = hR;
         transformed.y = h;
         float a = atan(position.x, position.z); a += speed.x * t;
         float initL = length(position.xz), finL = initL * upperRatio, radi = mix(initL, finL, hR);
         transformed.x = cos(a) * radi; transformed.z = sin(a) * -radi;
         float sT = spiralTurns; // constant (no time wobble) to match original spiral angle
         float sA = hR * sT * 6.2831853;
         float sR = mix(spiralRadius, 0., hR); transformed.x += cos(sA)*sR; transformed.z += sin(sA)*-sR;

         // rotate with camera azimuth; sample letter mask window (original efc window)
         vec3 efcPos = vec3(0, 6, 0.5);
         vec3 efcClamp = vec3(2.0, 0.9, 0.25) * 3.5;
         vec3 efcMin = efcPos - efcClamp;
         vec3 efcMax = efcPos + efcClamp;
         vec3 UVT = vec3(transformed); UVT.xz *= rot(azimuth);
         vec3 efcUV = (UVT - efcMin) / (efcMax - efcMin);
         float isE = texture2D(tex2020, efcUV.xy).r;
         isE *= (efcUV.z>0. && efcUV.z<1.) ? 1. : 0.;
         vIsEffect = isE;
       }`
    );

    // ---- Fragment: KEEP default disc (map), just tint + globalOpacity ----
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vIsEffect; uniform float globalOpacity; void main(){')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec3 seoul = vec3(0.95, 0.00, 0.45);
         diffuseColor.rgb = mix(diffuseColor.rgb, seoul, clamp(vIsEffect, 0.0, 1.0));
         diffuseColor.a  *= globalOpacity;`
      );
  };

  const pts = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pts);

  animate();
}

function onResize(){
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ===== Animation / music proxy =====
const clock = new THREE.Clock();
function animate(){
  renderer.setAnimationLoop(()=>{
    const dt = clock.getDelta();
    uniforms.time.value += dt * 0.5;
    uniforms.azimuth.value = controls.getAzimuthalAngle();
    uniforms.isTransformed.value = isTransformed ? 1.0 : 0.0;
    uniformsTree.time.value = uniforms.time.value * 5.0;

    if (!isTransformed && isPlaying && currentMode === 'landing') calcVolumeProxy();
    controls.update(); renderer.render(scene, camera);
  });
}

function calcVolumeProxy(){
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;
  const UL = uniforms.upperLimit.value;

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
  if (currentMode === 'video' || isTransformed) {
    location.reload();
    return;
  }
  currentMode = 'landing';
  isPlaying = true;
  if (veil) veil.style.display = "none";
  playBackgroundMusic();
}

function toBiomeDots(){
  if (isTransformed) return;
  fadeOutMusic(3000);
  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;

  controls.target.set(0,0,0); camera.position.set(0,15,50);
  controls.autoRotate=false; controls.minDistance=20; controls.maxDistance=80;

  // warp petals to biome colors/positions
  const pos = pointsGeom.attributes.position.array;
  const col = pointsGeom.attributes.color.array;
  for (let i=0;i<targetPositions.length;i++){
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
function teardownThree(){
  try{ controls?.dispose?.(); }catch{}
  try{ renderer?.setAnimationLoop(null); }catch{}
  try{ scene?.traverse(o=>{ if(o.isMesh||o.isPoints){ o.geometry.dispose?.(); o.material.dispose?.(); } }); }catch{}
  try{ renderer?.dispose?.(); }catch{} try{ renderer?.domElement?.remove?.(); }catch{}
  scene=camera=renderer=controls=null;
}
function showVideo(){
  if (!bgVideo || !videoContainer) return;
  bgVideo.muted = false;
  const reveal = ()=>{ videoContainer.style.display = 'block'; };
  if (bgVideo.readyState >= 2) reveal();
  else { const h = ()=>{ bgVideo.removeEventListener('canplay',h); reveal(); }; bgVideo.addEventListener('canplay',h); }
  const p = bgVideo.play();
  if (p && p.catch) p.catch(()=>{ tapToPlay && (tapToPlay.style.display='flex'); reveal(); });
}
tapToPlay && tapToPlay.addEventListener('click', ()=>{ tapToPlay.style.display='none'; bgVideo.muted=false; bgVideo.play(); });

// ===== State poller (ETag) =====
let lastETag = null;
function isExpired(s){ const e = Date.parse(s?.expires_at||''); return Number.isFinite(e) && Date.now() > e; }

// Broadened stage mapping so TV2 tracks TV1 regardless of exact string
function normalizeStage(s){
  const raw = String(s||'').toLowerCase().trim();
  const norm = raw.replace(/[\s_\-]+/g,''); // "show_result" → "showresult"
  if (norm.includes('showresult') || norm === 'result' || norm === 'results') return 'show_result';
  if (norm === 'landing' || norm === 'idle' || norm === 'home') return 'landing';
  return raw; // pass through (e.g., "in_progress", "countdown")
}

async function fetchState(){
  try{
    const headers = {}; if (lastETag) headers['If-None-Match']=lastETag;
    const res = await fetch(S3_STATE_URL,{ headers, cache:'no-cache' });
    if (res.status===304) return null;
    if (!res.ok) throw new Error('state '+res.status);
    lastETag = res.headers.get('ETag');
    return await res.json();
  }catch(e){ return null; }
}

async function tick(){
  const s = await fetchState(); 
  if (!s) return;

  const stageRaw = (s.stage || s.state || 'idle');
  const stage = normalizeStage(stageRaw);

  if (isExpired(s) || stage === 'landing') {
    startLanding();
    return;
  }

  if (stage === 'show_result') {
    if (currentMode !== 'video') {
      toBiomeDots();
      setTimeout(() => {
        fadeDots(2000, () => {
          teardownThree();
          fadeOutMusic(1200);
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

  // enter landing immediately
  currentMode = 'landing';
  isPlaying   = true;
  if (veil) veil.style.display = "none";
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