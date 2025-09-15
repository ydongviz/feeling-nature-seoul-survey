// tv2/script.js — COMPLETE build (Pattern B), original visuals, music, robust poller & video
// ES module

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

/* ---------------- Config ---------------- */
const STATE_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const POLL_MS = 1200;
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

/* ---------------- DOM ---------------- */
const $ = (id)=>document.getElementById(id);
const backgroundMusic = $('backgroundMusic');
const veil            = $('veil');
const percentage      = $('percentage');
const hud             = $('hud');
const videoContainer  = $('videoContainer');
const bgVideo         = $('bgVideo');
const tapToPlay       = $('tapToPlay');

if (!DEBUG && hud) hud.style.display='none';

/* ---------------- Runtime state ---------------- */
let currentMode   = 'landing'; // 'landing' | 'video'
let isTransformed = false;
let isPlaying     = false;

/* ---------------- Music ---------------- */
let currentVolume = 1.0, targetVolume = 1.0, baseVolume = 1.0;

function playBackgroundMusic(){
  if (!backgroundMusic) return;
  try { backgroundMusic.load(); } catch {}
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  backgroundMusic.loop = true;
  const p = backgroundMusic.play();
  if (p?.catch) p.catch(()=>{});
}
function fadeOutMusic(ms=1200){
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms/50));
  const v0 = backgroundMusic.volume; let i=0;
  const it = setInterval(()=>{
    i++;
    backgroundMusic.volume = Math.max(0, v0*(1 - i/steps));
    if (i>=steps){ clearInterval(it); backgroundMusic.pause(); }
  },50);
}
function updateMusic(p90, UL, phase){
  let hRatio = Math.max(0, Math.min(1, p90 / UL));
  if (hRatio > 0.98) hRatio = 1.0;
  targetVolume = Math.min(1, hRatio * baseVolume);
  currentVolume += (targetVolume - currentVolume) * 0.2;
  if (backgroundMusic && !backgroundMusic.paused) backgroundMusic.volume = currentVolume;
  if (DEBUG && hud){
    hud.innerHTML = `<div><b>Volume</b> ${currentVolume.toFixed(2)}</div>
                     <div><b>Height (P90)</b> ${(p90||0).toFixed(2)} / ${UL}</div>
                     <div><b>Phase</b> ${phase}</div>`;
  }
}

/* ---------------- THREE globals ---------------- */
let scene=null, camera=null, renderer=null, controls=null;
let base=null, treeObject=null;
let pointsGeom=null, pointsMat=null, circleTexture=null;

const uniforms = {
  time:          { value: 0 },
  upperLimit:    { value: 10 },
  upperRatio:    { value: 2.1 },
  spiralRadius:  { value: 1.8 },
  spiralTurns:   { value: 1.3 },
  tex2020:       { value: null },
  azimuth:       { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 }
};
const uniformsTree = { time: { value: 0 } };

/* Field config */
const RADIUS = 4.8, MAX_POINTS = 30000;
let points = [], delay = [], speed = [], color = [];
let targetPositions = [], targetColors = [];
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

/* ---------------- Utils ---------------- */
function createCircleTexture(){
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), m = 16, R = 14;
  const g = x.createRadialGradient(m,m,0,m,m,R);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.8,'rgba(255,255,255,0.9)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,32,32);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function buildSeoulTexture(){
  const cnvs = document.createElement('canvas'); cnvs.width = 400; cnvs.height = 100;
  const ctx = cnvs.getContext('2d');
  ctx.clearRect(0,0,cnvs.width,cnvs.height);
  ctx.fillStyle = '#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=8;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font="900 80px 'Arial Black', Arial, sans-serif";
  ctx.strokeText('SEOUL', cnvs.width/2, cnvs.height/2);
  ctx.fillText('SEOUL', cnvs.width/2, cnvs.height/2);
  return new THREE.CanvasTexture(cnvs);
}

/* ---------------- Scene ---------------- */
function initScene(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 1000);
  camera.position.set(0,5,10);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const clearCol = new THREE.Color(0x11130E);
  renderer.setClearColor(clearCol);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.05;
  controls.autoRotate = true; controls.autoRotateSpeed = -0.8;
  controls.minPolarAngle = THREE.Math.DEG2RAD * 80; controls.maxPolarAngle = THREE.Math.DEG2RAD * 100;
  controls.minDistance = 5;  controls.maxDistance = 12.5;
  controls.target.set(0,4,0); controls.update();

  // Resize guard
  window.addEventListener('resize', onResize, { passive:true });

  // Ground (original radial falloff mix)
  const baseGeom = new THREE.CircleGeometry(6,64); baseGeom.rotateX(-Math.PI*0.5);
  const baseMat = new THREE.MeshBasicMaterial({ color:0x5A4218 });
  baseMat.defines = { USE_UV: "" };
  baseMat.onBeforeCompile = (shader)=>{
    shader.fragmentShader = shader.fragmentShader.replace(
      `gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
      `
        vec3 col = vec3(${clearCol.r.toFixed(3)}, ${clearCol.g.toFixed(3)}, ${clearCol.b.toFixed(3)});
        vec2 uv = vUv - 0.5; uv *= 2.0;
        col = mix(outgoingLight, col, length(uv));
        gl_FragColor = vec4(col, diffuseColor.a);
      `
    );
  };
  base = new THREE.Mesh(baseGeom, baseMat); base.position.y = -0.15; scene.add(base);

  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // Tree OBJ + shimmer overlay (robust to failure)
  const loader = new OBJLoader();
  loader.load(
    'https://threejs.org/examples/models/obj/tree.obj',
    (obj)=>{
      const mesh = obj.children.find(c=>c.isMesh) || obj.children[0];
      if (mesh) mesh.material = new THREE.MeshBasicMaterial({ color:0x4A3C28, transparent:true, opacity:0.75 });
      try{
        const sampler = new MeshSurfaceSampler(mesh).setWeightAttribute(null).build();
        const pts=[], idx=[]; const n=new THREE.Vector3();
        for (let i=0;i<1250;i++){ const p=new THREE.Vector3(); sampler.sample(p,n); pts.push(p); idx.push(i); }
        const treePts = new THREE.Points(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.PointsMaterial({ color:0x482D02, size:0.16, map:circleTexture, transparent:true, alphaTest:0.05, depthWrite:false })
        );
        treePts.geometry.setAttribute('idx', new THREE.BufferAttribute(new Float32Array(idx),1));
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
      }catch(e){ /* continue without shimmer */ }
      obj.rotation.y = THREE.Math.DEG2RAD*20; obj.scale.setScalar(5);
      scene.add(obj); treeObject = obj; if (percentage) percentage.style.display='none';
    },
    (xhr)=>{ if (percentage && xhr.lengthComputable) percentage.textContent = (xhr.loaded/xhr.total*100).toFixed(0)+'%'; },
    ()=>{ if (percentage) percentage.style.display='none'; }
  );

  // Petals field
  const c = new THREE.Color();
  let count=0;
  while (count < MAX_POINTS){
    const v = new THREE.Vector3(THREE.Math.randFloat(-RADIUS,RADIUS),0,THREE.Math.randFloat(-RADIUS,RADIUS));
    const rr = v.length()/RADIUS;
    if (v.length()<=RADIUS && Math.random()<(1-rr)){
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
      count++;
    }
  }
  pointsGeom = new THREE.BufferGeometry().setFromPoints(points);
  pointsGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(color),3));
  pointsGeom.setAttribute('delay', new THREE.BufferAttribute(new Float32Array(delay),1));
  pointsGeom.setAttribute('speed', new THREE.BufferAttribute(new Float32Array(speed),2));

  pointsMat = new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.95,
    map: circleTexture, alphaTest: 0.05, depthWrite: false
  });

  pointsMat.onBeforeCompile = (shader)=>{
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float time, upperLimit, upperRatio, spiralRadius, spiralTurns, azimuth, isTransformed;
      uniform sampler2D tex2020;
      attribute float delay; attribute vec2 speed;
      varying float vRatio; varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
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
        vRatio = 0.; vIsEffect = 0.;
      } else {
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
        float sT = spiralTurns; // constant
        float sA = hR * sT * 6.2831853;
        float sR = mix(spiralRadius, 0., hR); transformed.x += cos(sA)*sR; transformed.z += sin(sA)*-sR;

        // SEOUL letter sampling window (camera-azimuth aligned)
        vec3 efcPos = vec3(0., 6., 0.5);
        vec3 efcClamp = vec3(2.0, 0.9, 0.25) * 3.5;
        vec3 efcMin = efcPos - efcClamp;
        vec3 efcMax = efcPos + efcClamp;
        vec3 UVT = vec3(transformed); UVT.xz *= rot(azimuth);
        vec3 efcUV = (UVT - efcMin) / (efcMax - efcMin);
        float isE = texture2D(tex2020, efcUV.xy).r;
        isE *= (efcUV.z>0. && efcUV.z<1.) ? 1. : 0.;
        vIsEffect = isE;
      }`);

    shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', `
      if (isTransformed > 0.5) { gl_PointSize = 0.3; }
      else {
        float cond = floor(speed.y + 0.5) == 0.;
        gl_PointSize = size * (cond ? 0.75 : ((1. - vRatio) * (smoothstep(0., 0.01, vRatio) * 0.25) + 0.75));
        gl_PointSize = mix(gl_PointSize, size * 2.2, vIsEffect);
      }`);

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {','varying float vIsEffect; uniform float globalOpacity; void main(){')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 seoul = vec3(0.95, 0.00, 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, seoul, clamp(vIsEffect, 0.0, 1.0));
        diffuseColor.a  *= globalOpacity;`);
  };

  const pts = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pts);

  animate();
}

function onResize(){
  if (!camera || !renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}

/* ---------------- Animation & Volume ---------------- */
const clock = new THREE.Clock();
function animate(){
  renderer.setAnimationLoop(()=>{
    const dt = clock.getDelta();
    uniforms.time.value += dt * 0.5;
    if (controls){ uniforms.azimuth.value = controls.getAzimuthalAngle(); controls.update(); }
    uniforms.isTransformed.value = isTransformed ? 1.0 : 0.0;
    uniformsTree.time.value = uniforms.time.value * 5.0;

    if (!isTransformed && isPlaying && currentMode === 'landing') calcVolumeProxy();
    renderer.render(scene, camera);
  });
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
    const cycle=40, rise=20, fall=6, loop=ct%cycle; let h;
    if (loop < rise){ h = (sp*loop)%UL; rising++; }
    else { const fp=(loop-rise)/fall, id=(d+10)/10;
           const adj = Math.max(0, Math.min(1, (fp - id*0.3)/(1 - id*0.3)));
           const maxH=(sp*rise)%UL; h=maxH*(1 - (adj*adj*(3-2*adj))); falling++; }
    hts.push(h);
  }
  let phase='Mixed'; if (rising > 2*falling) phase='Rising'; else if (falling > 2*rising) phase='Falling';
  if (hts.length){ hts.sort((a,b)=>a-b); const p90 = hts[Math.floor(0.9*hts.length)]; updateMusic(p90, UL, phase); }
}

/* ---------------- Transitions (Pattern B) ---------------- */
function pauseRender(){ try{ renderer?.setAnimationLoop(null); }catch{} }
function resumeRender(){ if (renderer) animate(); }

function startLanding(){
  // Coming from video → restore canvas, resume music
  if (currentMode === 'video'){
    hideVideo();
    resumeRender();
    isTransformed = false; uniforms.isTransformed.value = 0;
    uniforms.globalOpacity.value = 1.0;
    if (treeObject) treeObject.visible = true;
    if (base) base.visible = true;
    controls.target.set(0,4,0); camera.position.set(0,5,10); controls.autoRotate = true; controls.update();
  }
  currentMode = 'landing';
  isPlaying = true;
  veil && (veil.style.display='none');
  playBackgroundMusic();
}

function toBiomeDots(){
  if (isTransformed) return;
  fadeOutMusic(3000);
  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;
  controls.target.set(0,0,0); camera.position.set(0,15,50);
  controls.autoRotate=false; controls.minDistance=20; controls.maxDistance=80; controls.update();

  // warp petals to biome cloud
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

function showVideo(){
  if (!bgVideo) return;
  pauseRender();
  if (videoContainer) videoContainer.style.display = 'block';
  bgVideo.loop = true;
  bgVideo.muted = false; // prefer audio
  const p = bgVideo.play();
  if (p?.catch) p.catch(()=>{ if (tapToPlay) tapToPlay.style.display='flex'; });
}
function hideVideo(){
  if (tapToPlay) tapToPlay.style.display='none';
  if (bgVideo){ try{ bgVideo.pause(); }catch{}; try{ bgVideo.currentTime=0; }catch{} }
  if (videoContainer) videoContainer.style.display = 'none';
}
tapToPlay && tapToPlay.addEventListener('click', ()=>{ tapToPlay.style.display='none'; if (bgVideo){ bgVideo.muted=false; bgVideo.play(); } });

/* ---------------- Poller ---------------- */
let lastETag = null;
function normalizeStage(s){
  const raw = String(s||'').toLowerCase().trim();
  const norm = raw.replace(/[\s_\-]+/g,'');
  if (norm.includes('showresult') || norm==='result' || norm==='results') return 'show_result';
  if (norm==='landing' || norm==='idle' || norm==='home') return 'landing';
  return raw;
}
function isExpired(s){ const e = Date.parse(s?.expires_at||''); return Number.isFinite(e) && Date.now()>e; }

async function fetchState(){
  try{
    const headers={}; if (lastETag) headers['If-None-Match']=lastETag;
    const res = await fetch(STATE_URL, { headers, cache:'no-cache' });
    if (res.status===304) return null;
    if (!res.ok) throw new Error('state '+res.status);
    lastETag = res.headers.get('ETag'); return await res.json();
  }catch{ return null; }
}

async function tick(){
  const s = await fetchState(); if (!s) return;
  const stage = normalizeStage(s.stage || s.state || 'idle');

  if (isExpired(s) || stage === 'landing'){ startLanding(); return; }

  if (stage === 'show_result'){
    if (currentMode !== 'video'){
      toBiomeDots();
      setTimeout(()=>{
        fadeDots(2000, ()=>{
          fadeOutMusic(1200);
          showVideo();
          currentMode = 'video';
        });
      }, 5000);
    }
    return;
  }

  // Otherwise stay in landing
  if (currentMode !== 'landing') startLanding();
}

/* ---------------- Boot ---------------- */
(function main(){
  // Prebuild targets for biome dots
  for (let i=0;i<MAX_POINTS;i++){
    const b = biomeNames[i % biomeNames.length], bc = biomeColors[b];
    const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
    targetPositions.push(new THREE.Vector3(tx,ty,tz));
    targetColors.push([bc.r, bc.g, bc.b]);
  }

  initScene();
  currentMode='landing'; isPlaying=true; if (veil) veil.style.display='none';
  playBackgroundMusic();
  const resumeOnce = ()=>{
    if (backgroundMusic && backgroundMusic.paused){ try{ backgroundMusic.play().catch(()=>{});}catch{} }
    document.removeEventListener('pointerdown', resumeOnce, { capture:true });
  };
  document.addEventListener('pointerdown', resumeOnce, { capture:true, once:true });

  setInterval(tick, POLL_MS);
})();