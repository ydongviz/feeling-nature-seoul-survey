// public/tv2/script.js  (ES module, fragment-safe)

// ===== Imports =====
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

// ===== Config =====
const S3_STATE_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const POLL_MS = 1200;

// ===== DOM =====
const bgm = document.getElementById('backgroundMusic');
const veil = document.getElementById('veil');
const percent = document.getElementById('percentage');
const videoBox = document.getElementById('videoContainer');
const bgVideo = document.getElementById('bgVideo');
const tapToPlay = document.getElementById('tapToPlay');

// Optional HUD
const dbg = new URLSearchParams(location.search).get('debug') === '1';
if (dbg) document.getElementById('volumeDebug').hidden = false;
const volVal = document.getElementById('volumeValue');
const hVal = document.getElementById('heightValue');
const phaseVal = document.getElementById('phaseValue');

// ===== State =====
let currentMode = 'boot';     // 'boot' | 'landing' | 'video'
let isTransformed = false;
let isPlaying = false;

let currentVolume = 1, targetVolume = 1, baseVolume = 1;

// ===== THREE globals =====
let scene, camera, renderer, controls;
let base, pointsGeom, pointsMat, circleTexture;
let treeObject = null;

const uniforms = {
  time: { value: 0 },
  upperLimit: { value: 10 },
  upperRatio: { value: 2.1 },
  spiralRadius: { value: 1.8 },
  spiralTurns: { value: 1.3 },
  tex2020: { value: null },
  azimuth: { value: 0 },
  transformProgress: { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 }
};
const uniformsTree = { time: { value: 0 } };

const r = 4.8, MAX_POINTS = 30000;
let pointsCount = 0;
let points = [], delay = [], speed = [], color = [];
const biomeColors = {
  "Tundra": new THREE.Color("#90D2C8"),
  "Mediterranean Forest": new THREE.Color("#BF6021"),
  "Desert": new THREE.Color("#D0C07C"),
  "Savanna": new THREE.Color("#BEA748"),
  "Coniferous Forest": new THREE.Color("#1EBF6F"),
  "Temperate Forest": new THREE.Color("#83BB59"),
  "Grassland": new THREE.Color("#AAB770"),
  "Tropical Forest": new THREE.Color("#497B42")
};
const biomeNames = Object.keys(biomeColors);
let targetPositions = [], targetColors = [];

// ===== Utilities =====
function createCircleTexture(){
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), m = 16, R = 14;
  const g = x.createRadialGradient(m,m,0,m,m,R);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.8,'rgba(255,255,255,0.9)');
  g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
}
function buildSeoulTexture(){
  const cnvs = document.createElement("canvas");
  cnvs.width = 400; cnvs.height = 100;
  const ctx = cnvs.getContext("2d");
  ctx.fillStyle = "transparent"; ctx.fillRect(0,0,cnvs.width,cnvs.height);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "900 80px 'Arial Black', Arial, sans-serif";
  ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.lineWidth = 6; ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.fillText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  return new THREE.CanvasTexture(cnvs);
}

// ===== Music =====
function playBgm(){ if (!bgm) return; bgm.currentTime = 4; bgm.volume = currentVolume; bgm.play().catch(()=>{}); }
function fadeOutBgm(ms=1500){
  if (!bgm || bgm.paused) return;
  const steps = Math.max(1, Math.floor(ms/50)); const v0 = bgm.volume; let i=0;
  const it = setInterval(()=>{ i++; bgm.volume = Math.max(0, v0*(1 - i/steps));
    if (i>=steps){ clearInterval(it); bgm.pause(); }
  },50);
}
function updateMusic(avgHeight, maxH, phase){
  let ratio = Math.max(0, Math.min(1, avgHeight / maxH));
  if (ratio > 0.98) ratio = 1;
  targetVolume = Math.min(1, ratio * baseVolume);
  if (Math.abs(currentVolume - targetVolume) > 0.005){
    currentVolume += (targetVolume - currentVolume) * 0.2;
    if (!bgm.paused) bgm.volume = currentVolume;
  }
  if (dbg){ volVal.textContent = currentVolume.toFixed(3); hVal.textContent = avgHeight.toFixed(2); phaseVal.textContent = phase; }
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
  controls.minDistance = 5; controls.maxDistance = 12.5;
  controls.target.set(0,4,0); controls.update();

  const baseGeom = new THREE.CircleBufferGeometry(6,64); baseGeom.rotateX(-Math.PI*0.5);
  const baseMat = new THREE.MeshBasicMaterial({ color:0x5A4218 });
  base = new THREE.Mesh(baseGeom, baseMat); base.position.y = -0.15; scene.add(base);

  // Pre-create textures
  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // Tree & sampled points (vertex-only tweak; NO fragment edits)
  const loader = new OBJLoader();
  loader.load('https://threejs.org/examples/models/obj/tree.obj',(obj)=>{
    obj.children[0].material = new THREE.MeshBasicMaterial({ color:0x4A3C28, transparent:true, opacity:0.75 });

    const sampler = new MeshSurfaceSampler(obj.children[0]).setWeightAttribute(null).build();
    const pts=[], idx=[];
    const n = new THREE.Vector3();
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
    };

    obj.add(treePts);
    obj.rotation.y = THREE.Math.DEG2RAD * 20; obj.scale.setScalar(5);
    scene.add(obj); treeObject = obj; percent.style.display = "none";
  }, (xhr)=>{ if (xhr.lengthComputable) percent.innerText = (xhr.loaded/xhr.total*100).toFixed(0)+'%'; });

  // Points field
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
  pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(color),3));
  pointsGeom.setAttribute("delay", new THREE.BufferAttribute(new Float32Array(delay),1));
  pointsGeom.setAttribute("speed", new THREE.BufferAttribute(new Float32Array(speed),2));

  pointsMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    map: circleTexture,
    alphaTest: 0.05,
    depthWrite: false
  });
  pointsMat.onBeforeCompile = (shader)=>{
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float time, upperLimit, upperRatio, spiralRadius, spiralTurns, azimuth, transformProgress, isTransformed;
      uniform sampler2D tex2020; attribute float delay; attribute vec2 speed;
      varying float vRatio; varying vec2 vSpeed; varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>
      if (isTransformed > 0.5){
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
        vRatio = 0.; vSpeed = vec2(0.); vIsEffect = 0.;
      } else {
        float t = time + delay; t = max(t, 0.0);
        float cycle = 40., riseT=20., fallT=6.; float loopT = mod(t, cycle);
        float h;
        if (loopT < riseT) { h = mod(speed.y * loopT, upperLimit); }
        else {
          float fp = (loopT - riseT) / fallT;
          float id = (delay + 10.0) / 10.0;
          float adj = clamp((fp - id*0.3) / (1.0 - id*0.3), 0.0, 1.0);
          adj = smoothstep(0.0, 1.0, adj);
          float maxH = mod(speed.y * riseT, upperLimit);
          h = maxH * (1.0 - adj);
        }
        float hR = clamp(h/upperLimit, 0., 1.); vRatio = hR; vSpeed = speed; transformed.y = h;
        float a = atan(position.x, position.z); a += speed.x * t;
        float initL = length(position.xz), finL = initL * upperRatio, radi = mix(initL, finL, hR);
        transformed.x = cos(a) * radi; transformed.z = sin(a) * -radi;
        float sT = sin(time*0.5)*0.5 + spiralTurns; float sA = hR * sT * 6.2831853;
        float sR = mix(spiralRadius, 0., hR); transformed.x += cos(sA)*sR; transformed.z += sin(sA)*-sR;
        vec3 efcPos = vec3(0,6,0.5), efcClamp = vec3(2.0,0.9,0.25)*3.5;
        vec3 efcMin = efcPos - efcClamp, efcMax = efcPos + efcClamp;
        vec3 UVT = vec3(transformed); UVT.xz *= rot(azimuth);
        vec3 efcUV = (UVT - efcMin) / (efcMax - efcMin);
        float isE = texture2D(tex2020, efcUV.xy).r; isE *= (efcUV.z>0. && efcUV.z<1.) ? 1. : 0.;
        vIsEffect = isE;
      }`);
  };

  const pts = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pts);

  animate();
}
function onResize(){
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ===== Animation / volume =====
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
  if (hts.length){
    hts.sort((a,b)=>a-b); const p90 = hts[Math.floor(0.9*hts.length)];
    updateMusic(p90, UL, phase);
  }
}

// ===== Transitions =====
function startLanding(){
  if (currentMode === 'landing') return;
  if (currentMode === 'video'){ location.reload(); return; }
  currentMode = 'landing'; isPlaying = true; veil.style.display = "none"; playBgm();
}
function toBiomeDots(){
  if (isTransformed) return;
  if (bgm) fadeOutBgm(3000);
  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;

  controls.target.set(0,0,0); camera.position.set(0,15,50); controls.autoRotate=false; controls.minDistance=20; controls.maxDistance=80;

  const pos = pointsGeom.attributes.position.array;
  const col = pointsGeom.attributes.color.array;
  for (let i=0;i<targetPositions.length;i++){
    const tp = targetPositions[i], tc = targetColors[i];
    pos[i*3]=tp.x; pos[i*3+1]=tp.y; pos[i*3+2]=tp.z;
    col[i*3]=tc[0]; col[i*3+1]=tc[1]; col[i*3+2]=tc[2];
  }
  pointsGeom.attributes.position.needsUpdate = true;
  pointsGeom.attributes.color.needsUpdate = true;

  uniforms.isTransformed.value = 1;
  isTransformed = true;
}
function fadeDots(ms=2000, done){
  const s = performance.now();
  function step(now){
    const t = Math.min(1,(now-s)/ms); uniforms.globalOpacity.value = 1 - t;
    if (t<1) requestAnimationFrame(step); else { uniforms.globalOpacity.value = 0; done&&done(); }
  }
  requestAnimationFrame(step);
}
function teardownThree(){
  try{ controls.dispose(); }catch(e){}
  try{ renderer.setAnimationLoop(null); }catch(e){}
  try{ scene.traverse(o=>{ if(o.isMesh||o.isPoints){ o.geometry.dispose?.(); o.material.dispose?.(); } }); }catch(e){}
  try{ renderer.dispose?.(); }catch(e){} try{ renderer.domElement.remove?.(); }catch(e){}
  scene=camera=renderer=controls=null;
}
function showVideo(){
  bgVideo.muted = false;
  const reveal = ()=>{ videoBox.style.display = 'block'; };
  if (bgVideo.readyState >= 2) reveal();
  else { const h = ()=>{ bgVideo.removeEventListener('canplay',h); reveal(); }; bgVideo.addEventListener('canplay',h); }
  const p = bgVideo.play(); if (p && p.catch) p.catch(()=>{ tapToPlay.style.display='flex'; reveal(); });
}
tapToPlay.addEventListener('click', ()=>{ tapToPlay.style.display='none'; bgVideo.muted=false; bgVideo.play(); });

// ===== State Poller =====
let lastETag = null;
async function fetchState(){
  try{
    const headers = {}; if (lastETag) headers['If-None-Match']=lastETag;
    const res = await fetch(S3_STATE_URL,{ headers, cache:'no-cache' });
    if (res.status===304) return null;
    if (!res.ok) throw new Error('state '+res.status);
    lastETag = res.headers.get('ETag'); return await res.json();
  }catch(e){ return null; }
}
function expired(s){ const e = Date.parse(s?.expires_at||''); return Number.isFinite(e) && Date.now() > e; }
async function tick(){
  const s = await fetchState(); if (!s) return;
  if (!s.stage || expired(s)){ if (currentMode!=='landing') startLanding(); return; }
  if (s.stage === 'show_result'){
    if (currentMode !== 'video'){
      toBiomeDots();
      setTimeout(()=>{ fadeDots(2000, ()=>{ teardownThree(); fadeOutBgm(1200); showVideo(); currentMode='video'; }); }, 5000);
    }
  } else {
    if (currentMode !== 'landing') startLanding();
  }
}

// ===== Boot =====
function prefillTargets(){
  for (let i=0;i<MAX_POINTS;i++){
    const b = biomeNames[i % biomeNames.length];
    const bc = biomeColors[b];
    const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
    targetPositions.push(new THREE.Vector3(tx,ty,tz));
    targetColors.push([bc.r,bc.g,bc.b]);
  }
}
function buildPointsCloud(){
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
      pointsCount++;
    }
  }
}
(function main(){
  try{ bgm.load(); }catch(e){}
  buildPointsCloud();
  prefillTargets();
  initScene();
  // enter landing immediately
  currentMode = 'landing'; isPlaying = true; veil.style.display = "none"; playBgm();
  setInterval(tick, POLL_MS);
})();
