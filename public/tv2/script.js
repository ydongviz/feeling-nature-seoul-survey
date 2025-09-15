// public/tv2/script.js — Pattern B soft reset, autoplay video (audio preferred), robust OBJ load, shader fix

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

const S3_STATE_URL = "https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/state.json";
const POLL_MS = 1200;

// DOM
const backgroundMusic = document.getElementById('backgroundMusic');
const veil = document.getElementById('veil');
const percentage = document.getElementById('percentage');
const videoContainer = document.getElementById('videoContainer');
const bgVideo = document.getElementById('bgVideo');
const tapToPlay = document.getElementById('tapToPlay');
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const hud = document.getElementById('hud'); if (!DEBUG && hud) hud.style.display = 'none';

let currentMode = 'landing', isTransformed = false, isPlaying = false;
let currentVolume = 1.0, targetVolume = 1.0, baseVolume = 1.0;

let scene, camera, renderer, controls;
let base, treeObject = null;
let pointsGeom, pointsMat, circleTexture;

const uniforms = {
  time: { value: 0 },
  upperLimit: { value: 10 },
  upperRatio: { value: 2.1 },
  spiralRadius: { value: 1.8 },
  spiralTurns: { value: 1.3 },
  tex2020: { value: null },
  azimuth: { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 }
};
const uniformsTree = { time: { value: 0 } };

const MAX_POINTS = 30000;
const biomeColors = {
  "Alpine": new THREE.Color("#C2E4FF"),
  "Mediterranean": new THREE.Color("#FFB14E"),
  "Desert": new THREE.Color("#EBA845"),
  "Tundra": new THREE.Color("#B6D5D0"),
  "Monsoon": new THREE.Color("#46A1E0"),
  "Savanna": new THREE.Color("#BEA748"),
  "Coniferous Forest": new THREE.Color("#1EBF6F"),
  "Temperate Forest": new THREE.Color("#83BB59"),
  "Grassland": new THREE.Color("#AAB770"),
  "Tropical Forest": new THREE.Color("#497B42")
};
const biomeNames = Object.keys(biomeColors);
let targetPositions = [], targetColors = [];

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
  const cnvs = document.createElement('canvas'); cnvs.width = 1024; cnvs.height = 256;
  const ctx = cnvs.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.strokeStyle = 'rgba(255,0,120,1)';
  ctx.lineWidth = 8;
  ctx.font = 'bold 200px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeText('SEOUL', cnvs.width/2, cnvs.height/2 + 10);
  ctx.fillText('SEOUL', cnvs.width/2, cnvs.height/2 + 10);
  return new THREE.CanvasTexture(cnvs);
}

// Music
function playBackgroundMusic(){
  if (!backgroundMusic) return;
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  backgroundMusic.play().catch(()=>{});
}
function fadeOutMusic(ms=1200){
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms/50)), v0 = backgroundMusic.volume; let i=0;
  const it = setInterval(()=>{ i++; backgroundMusic.volume = Math.max(0, v0*(1 - i/steps));
    if (i>=steps){ clearInterval(it); backgroundMusic.pause(); } },50);
}

// Soft reset buffers
let initialPositions = null, initialColors = null;
function captureInitialBuffersOnce(){
  if (!pointsGeom) return;
  if (!initialPositions) initialPositions = pointsGeom.attributes.position.array.slice(0);
  if (!initialColors) initialColors = pointsGeom.attributes.color.array.slice(0);
}
function pauseForVideo(){
  try{ renderer && renderer.setAnimationLoop(null); }catch{}
  if (renderer && renderer.domElement) renderer.domElement.style.display = 'none';
}
function hideVideoAndPause(){
  try{ bgVideo && bgVideo.pause(); }catch{}
  try{ if (bgVideo) bgVideo.currentTime = 0; }catch{}
  if (videoContainer) videoContainer.style.display = 'none';
  if (tapToPlay) tapToPlay.style.display = 'none';
}
function resetLandingState(){
  if (!pointsGeom) return;
  if (initialPositions){
    pointsGeom.attributes.position.array.set(initialPositions);
    pointsGeom.attributes.position.needsUpdate = true;
  }
  if (initialColors){
    pointsGeom.attributes.color.array.set(initialColors);
    pointsGeom.attributes.color.needsUpdate = true;
  }
  const d = pointsGeom.attributes.delay;
  if (d){
    for (let i=0;i<d.array.length;i++) d.array[i] = THREE.Math.randFloat(-10, 0);
    d.needsUpdate = true;
  }
  isTransformed = false;
  uniforms.isTransformed.value = 0.0;
  uniforms.globalOpacity.value = 1.0;
  if (treeObject) treeObject.visible = true;
  if (base) base.visible = true;
  if (controls){
    controls.target.set(0,4,0); camera.position.set(0,5,10);
    controls.autoRotate = true; controls.minDistance=5; controls.maxDistance=12.5; controls.update();
  }
  if (renderer && renderer.domElement) renderer.domElement.style.display='';
  animate();
}

// Scene
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

  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // Base
  const g = new THREE.CircleGeometry(8,64);
  const m = new THREE.MeshBasicMaterial({ color: 0x0C0E09, transparent:true, opacity:0.9 });
  base = new THREE.Mesh(g,m); base.rotation.x = -Math.PI/2; base.position.y = -0.05; scene.add(base);

  // Robust OBJ url resolution
  const TREE_OBJ_URL = new URL('./img/seoul-tree.obj', window.location.href).href;

  // Load tree OBJ + shimmer overlay (guard against 404/HTML response)
  const loader = new OBJLoader(); if (percentage) percentage.style.display = "block";
  loader.load(
    TREE_OBJ_URL,
    (obj)=>{
      // find first Mesh
      let mesh=null;
      obj.traverse((child)=>{ if (child.isMesh && !mesh) mesh = child; });
      if (!mesh || !mesh.geometry){
        console.warn('OBJ loaded but no Mesh found—skipping sampler overlay.');
        obj.rotation.y = THREE.Math.DEG2RAD*20; obj.scale.setScalar(5);
        scene.add(obj); treeObject=obj; if (percentage) percentage.style.display='none';
        return;
      }

      // color meshes
      obj.traverse(child=>{ if (child.isMesh){ child.material.color?.set(0x5B3A1A); } });

      // shimmer points overlay (guard sampler)
      let treePts=null;
      try{
        const sampler = new MeshSurfaceSampler(mesh).build();
        const pts=[], idx=[], n=new THREE.Vector3();
        for (let i=0;i<1250;i++){ const p=new THREE.Vector3(); sampler.sample(p,n); pts.push(p); idx.push(i); }
        treePts = new THREE.Points(
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
      }catch(e){
        console.warn('MeshSurfaceSampler failed; continuing without shimmer overlay.', e);
      }

      obj.rotation.y = THREE.Math.DEG2RAD * 20; obj.scale.setScalar(5);
      scene.add(obj); treeObject = obj; if (percentage) percentage.style.display = "none";
    },
    (xhr)=>{ if (percentage && xhr.lengthComputable) percentage.textContent = (xhr.loaded/xhr.total*100).toFixed(0) + '%'; },
    (err)=>{
      console.warn('OBJ load failed; likely 404 or HTML returned. Skipping tree.', err);
      if (percentage) percentage.style.display = "none";
      treeObject = null; // continue without tree
    }
  );

  // Petals
  const c = new THREE.Color();
  const points=[], color=[], delay=[], speed=[];
  let pointsCount=0; const r=8;
  while(pointsCount<MAX_POINTS){
    const v = new THREE.Vector3(THREE.Math.randFloat(-r,r),0,THREE.Math.randFloat(-r,r));
    const rr = v.length()/r;
    if (v.length()<=r && Math.random()<(1-rr)){
      points.push(v);
      c.set(0xffffcc); color.push(c.r, c.g - Math.random()*0.1, c.b + Math.random()*0.2);
      delay.push(THREE.Math.randFloat(-10,0));
      let val = THREE.Math.randFloat(1,2); if (Math.random()<0.25) val=0;
      speed.push(Math.PI*val*0.125, val);
      const b = biomeNames[Math.floor(Math.random()*biomeNames.length)];
      const bc = biomeColors[b];
      const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
      targetPositions.push(new THREE.Vector3(tx,ty,tz));
      targetColors.push([bc.r,bc.g,bc.b]);
      pointsCount++;
    }
  }
  pointsGeom = new THREE.BufferGeometry().setFromPoints(points);
  pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(color),3));
  pointsGeom.setAttribute("delay", new THREE.BufferAttribute(new Float32Array(delay),1));
  pointsGeom.setAttribute("speed", new THREE.BufferAttribute(new Float32Array(speed),2));

  pointsMat = new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.95,
    map: createCircleTexture(), alphaTest: 0.05, depthWrite: false
  });

  pointsMat.onBeforeCompile = (shader)=>{
    Object.assign(shader.uniforms, uniforms);

    // VERTEX: add varyings (no duplicate varyings) and logic
    shader.vertexShader =
      `uniform float time, upperLimit, upperRatio, spiralRadius, spiralTurns, azimuth, isTransformed;
       uniform sampler2D tex2020;
       attribute float delay; attribute vec2 speed;
       varying float vRatio; varying float vIsEffect;
       mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       if (isTransformed > 0.5) {
         float ws1=0.6, ws2=0.9;
         float wp1=(position.z*0.5+position.x*1.7);
         float w1=sin(time*ws1+wp1)*0.5;
         float wp2=(position.x*0.7+position.z*1.3);
         float w2=cos(time*ws2+wp2)*0.4;
         float dx=sin(time*0.2+position.z*0.1)*0.3;
         float dz=cos(time*0.25+position.x*0.1)*0.2;
         float gA=sin(time*0.3)*0.15;
         mat3 gR=mat3(cos(gA),0.,sin(gA), 0.,1.,0., -sin(gA),0.,cos(gA));
         float rS=0.1+(position.x+position.y+position.z)*0.01;
         float rA=sin(time*rS)*0.1;
         mat3 rY=mat3(cos(rA),0.,sin(rA), 0.,1.,0., -sin(rA),0.,cos(rA));
         transformed = gR * (rY * position + vec3(dx, w1+w2, dz));
         vRatio=0.; vIsEffect=0.;
       } else {
         float t=max(time + delay, 0.0);
         float cycle=40., rise=20., fall=6.; float loopT=mod(t, cycle);
         float UL=upperLimit;
         if (loopT < rise){
           float h=mod(speed.y*loopT, UL);
           vec2 sp=vec2(position.x, position.z)*(spiralRadius + 0.05*loopT);
           float turns=spiralTurns*3.14159;
           sp *= rot(loopT * turns / rise);
           transformed = vec3(sp.x, h, sp.y);
         } else {
           float fp=(loopT - rise)/fall;
           float id=(delay + 10.)/10.;
           float adj=clamp((fp - id*0.3)/(1. - id*0.3), 0., 1.);
           float maxH=mod(speed.y * rise, UL);
           float fallCurve=(1. - (adj*adj*(3.-2.*adj)));
           transformed = vec3(position.x, maxH*fallCurve, position.z);
         }
         mat2 R = rot(-azimuth);
         vec2 uv=(R * vec2(position.x, position.z))*0.05 + vec2(0.5, 0.5);
         float letter=texture2D(tex2020, uv).r;
         vIsEffect=step(0.5, letter);
         float distXZ=length(vec2(position.x, position.z));
         vRatio=clamp(distXZ / UL, 0., 1.);
       }`
    );

    // FRAGMENT: do NOT redeclare vColor; use diffuseColor from standard pipeline
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {','varying float vRatio; varying float vIsEffect; uniform float globalOpacity; void main(){')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        // Petal mask (custom 5-lobe). Keep standard sprite map too.
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = atan(p.y, p.x);
        float k = 5.0;
        float petal = (0.55 + 0.25 * cos(k * a));
        float mask = 1.0 - step(petal, length(p));
        if (mask < 0.5) discard;

        // Mix Seoul pink over whatever color pipeline built for diffuseColor.rgb
        vec3 seoul = vec3(0.95, 0.00, 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, seoul, clamp(vIsEffect, 0.0, 1.0));
        diffuseColor.a *= globalOpacity;
      `);
  };

  const pts = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pts);
  captureInitialBuffersOnce();

  animate();
}

function onResize(){
  if (!renderer || !camera) return;
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

const clock = new THREE.Clock();
function animate(){
  renderer.setAnimationLoop(()=>{
    const dt = clock.getDelta();
    uniforms.time.value += dt * 0.5;
    if (controls){
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
    hud.innerHTML = '<div><b>Volume</b> '+currentVolume.toFixed(2)+'</div>'+
                    '<div><b>Height (P90)</b> '+(p90||0).toFixed(2)+' / '+UL+'</div>'+
                    '<div><b>Phase</b> '+phase+'</div>';
  }
}
function calcVolumeProxy(){
  if (!pointsGeom) return;
  const UL = uniforms.upperLimit.value;
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;
  const SAMPLE=1500, total=delays.length;
  const idxs = new Uint32Array(Math.min(SAMPLE, total));
  for (let i=0;i<idxs.length;i++) idxs[i] = (Math.random()*total)|0;
  const t = uniforms.time.value;
  const hts = []; let rising=0, falling=0;
  for (let k=0;k<idxs.length;k++){
    const i=idxs[k], d=delays[i], sp=speeds[i*2+1], ct=t+d; if (ct<=0) continue;
    const cycle=40, rise=20, fall=6, loop=ct%cycle;
    let h;
    if (loop<rise){ h=(sp*loop)%UL; rising++; }
    else { const fp=(loop-rise)/fall, id=(d+10)/10, adj=Math.max(0,Math.min(1,(fp-id*0.3)/(1-id*0.3)));
           const maxH=(sp*rise)%UL; h=maxH*(1 - (adj*adj*(3-2*adj))); falling++; }
    hts.push(h);
  }
  let phase='Mixed'; if (rising>2*falling) phase='Rising'; else if (falling>2*rising) phase='Falling';
  if (hts.length){ hts.sort((a,b)=>a-b); const p90=hts[Math.floor(0.9*hts.length)]; updateMusic(p90, UL, phase); }
}

// Transitions
function startLanding(){
  if (veil) veil.style.display = "none";
  if (currentMode === 'video'){
    hideVideoAndPause();
    resetLandingState();
    isPlaying = true; try{ backgroundMusic && backgroundMusic.load(); }catch{}
    playBackgroundMusic();
    currentMode = 'landing'; return;
  }
  if (isTransformed){
    resetLandingState();
    isPlaying = true; try{ backgroundMusic && backgroundMusic.load(); }catch{}
    playBackgroundMusic();
    currentMode='landing'; return;
  }
  isPlaying = true; try{ backgroundMusic && backgroundMusic.load(); }catch{}
  playBackgroundMusic();
  currentMode = 'landing';
}

function toBiomeDots(){
  if (isTransformed) return;
  if (treeObject) treeObject.visible=false;
  if (base) base.visible=false;

  if (controls){
    controls.autoRotate=false; controls.target.set(0,0,0); camera.position.set(0,15,28);
    controls.minDistance=12; controls.maxDistance=40; controls.update();
  }

  const pos = pointsGeom.attributes.position.array;
  const col = pointsGeom.attributes.color.array;
  const N = Math.min(targetPositions.length, pos.length/3);
  for (let i=0;i<N;i++){
    const tp=targetPositions[i], tc=targetColors[i];
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
  if (!bgVideo){ console.warn('bgVideo missing'); return; }
  bgVideo.muted = false; // prefer audio
  const reveal = ()=>{ if (videoContainer) videoContainer.style.display='block'; else bgVideo.style.display='block'; };
  if (bgVideo.readyState>=2) reveal(); else { const h=()=>{ bgVideo.removeEventListener('canplay',h); reveal(); }; bgVideo.addEventListener('canplay',h); }
  const p = bgVideo.play();
  if (p && p.catch) p.catch(()=>{ if (tapToPlay) tapToPlay.style.display='flex'; reveal(); });
}
if (tapToPlay){
  tapToPlay.addEventListener('click', ()=>{ if (!bgVideo) return; tapToPlay.style.display='none'; bgVideo.muted=false; bgVideo.play(); });
}

// Poller
let lastETag=null;
function isExpired(s){ const e=Date.parse(s?.expires_at||''); return Number.isFinite(e) && Date.now()>e; }
async function fetchState(){
  try{
    const headers={}; if (lastETag) headers['If-None-Match']=lastETag;
    const res=await fetch(S3_STATE_URL,{ headers, cache:'no-cache' });
    if (res.status===304) return null;
    if (!res.ok) throw new Error('state '+res.status);
    lastETag=res.headers.get('ETag'); return await res.json();
  }catch{ return null; }
}
async function tick(){
  const s = await fetchState(); if (!s) return;
  const stage = (s.stage || s.state || 'idle');
  if (isExpired(s) || stage==='landing' || stage==='idle'){ startLanding(); return; }
  if (stage==='show_result'){
    if (currentMode!=='video'){
      toBiomeDots();
      setTimeout(()=>{
        fadeDots(2000, ()=>{
          fadeOutMusic(1200);
          pauseForVideo();
          showVideo();
          currentMode='video';
        });
      }, 5000);
    }
    return;
  }
  if (currentMode!=='landing') startLanding();
}

// Boot
(function main(){
  for (let i=0;i<MAX_POINTS;i++){
    const b=biomeNames[i%biomeNames.length], bc=biomeColors[b];
    const tx=(Math.random()-0.5)*80, ty=(Math.random()-0.5)*40, tz=(Math.random()-0.5)*60;
    targetPositions.push(new THREE.Vector3(tx,ty,tz));
    targetColors.push([bc.r,bc.g,bc.b]);
  }
  initScene();
  currentMode='landing'; isPlaying=true;
  if (veil) veil.style.display='none';
  try{ backgroundMusic && backgroundMusic.load(); }catch{}
  playBackgroundMusic();
  const resumeAudioOnce = ()=>{
    if (backgroundMusic && backgroundMusic.paused){ try{ backgroundMusic.play().catch(()=>{});}catch{} }
    document.removeEventListener('pointerdown', resumeAudioOnce, { capture:true });
  };
  document.addEventListener('pointerdown', resumeAudioOnce, { capture:true, once:true });
  setInterval(tick, POLL_MS);
})();