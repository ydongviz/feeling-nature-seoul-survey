
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

/* ---------- DOM Refs ---------- */
const backgroundMusic = document.getElementById('backgroundMusic');
const landingButton = document.getElementById('landingButton');
const showVideoButton = document.getElementById('showVideoButton');
const veil = document.getElementById('veil');
const percentage = document.getElementById('percentage');
const instructions = document.getElementById('instructions');
const volumeValue = document.getElementById('volumeValue');
const heightValue = document.getElementById('heightValue');
const phaseValue = document.getElementById('phaseValue');
const videoContainer = document.getElementById('videoContainer');
const bgVideo = document.getElementById('bgVideo');
const tapToPlay = document.getElementById('tapToPlay');

/* ---------- State ---------- */
let isTransformed = false;
let isTransitioning = false;
let isPlaying = false;
let animationStartTime = 0;
let currentMode = 'menu'; // 'menu' | 'landing' | 'video'

// Dynamic Music Volume System — P90-driven
let currentVolume = 1.0;
let targetVolume = 1.0;
const baseVolume = 1.0;        // FULL volume at peak
const volumeTransitionSpeed = 0.02;

// Preload audio
backgroundMusic?.load();

function playBackgroundMusic() {
  if (!backgroundMusic) return;
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  const p = backgroundMusic.play();
  if (p && p.catch) p.catch(()=>{});
}

function updateMusicVolume(avgHeight, maxHeight, phase) {
  let heightRatio = Math.max(0, Math.min(1, avgHeight / maxHeight));
  if (heightRatio > 0.98) heightRatio = 1.0;
  targetVolume = Math.min(1.0, heightRatio * baseVolume);

  if (Math.abs(currentVolume - targetVolume) > 0.005) {
    if (currentVolume < targetVolume) currentVolume = Math.min(targetVolume, currentVolume + volumeTransitionSpeed);
    else currentVolume = Math.max(targetVolume, currentVolume - volumeTransitionSpeed);
    if (!backgroundMusic.paused) backgroundMusic.volume = currentVolume;
  }
  // HUD
  if (volumeValue) volumeValue.textContent = currentVolume.toFixed(3);
  if (heightValue) heightValue.textContent = avgHeight.toFixed(2);
  if (phaseValue) phaseValue.textContent = phase;
}

function fadeOutMusic(ms = 1500) {
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms / 50));
  const v0 = backgroundMusic.volume;
  let i = 0;
  const it = setInterval(()=>{
    i++;
    const v = v0 * (1 - i/steps);
    backgroundMusic.volume = Math.max(0, v);
    if (i >= steps) { clearInterval(it); backgroundMusic.pause(); }
  }, 50);
}

/* ---------- THREE Setup ---------- */
let scene, camera, renderer, controls;
let baseGeom, baseMat, base;
let uniformsTree = { time: { value: 0 } };
let treeObject = null;

// Points (petals / dots)
const r = 4.8;
const MAX_POINTS = 30000;
let pointsCount = 0;
let pointsGeom, pointsMat, circleTexture;
let points = [], delay = [], speed = [], color = [];

// Keep original landing positions/colors to allow SOFT RESET
let initialPositions = null;
let initialColors = null;

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

// Shared uniforms for shader
const uniforms = {
  time: { value: 0 },
  upperLimit: { value: 10 },
  upperRatio: { value: 2.1 },
  spiralRadius: { value: 1.8 },
  spiralTurns: { value: 1.3 },
  tex2020: { value: null },   // SEOUL texture
  azimuth: { value: 0 },
  transformProgress: { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 } // fade dots → transparent
};

function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const center = 16, radius = 14;
  const g = ctx.createRadialGradient(center, center, 0, center, center, radius);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(canvas);
}

function buildSeoulTexture(){
  const cnvs = document.createElement("canvas");
  cnvs.width = 400; cnvs.height = 100;
  const ctx = cnvs.getContext("2d");
  ctx.fillStyle = "transparent"; ctx.fillRect(0,0,cnvs.width,cnvs.height);
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "900 80px 'Arial Black', Arial, sans-serif";
  // layered strokes for stronger S/L
  ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.lineWidth = 3; ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.lineWidth = 2; ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.lineWidth = 6; ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.lineWidth = 8; ctx.strokeText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  ctx.shadowColor = "#000"; ctx.shadowBlur = 5; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
  ctx.fillText("SEOUL", cnvs.width * 0.5, cnvs.height * 0.5);
  return new THREE.CanvasTexture(cnvs);
}

function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const bc = new THREE.Color(0x11130E);
  renderer.setClearColor(bc);
  document.body.appendChild(renderer.domElement);
  window.addEventListener("resize", onWindowResize, false);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = -0.8;
  controls.minPolarAngle = THREE.Math.DEG2RAD * 80;
  controls.maxPolarAngle = THREE.Math.DEG2RAD * 100;
  controls.minDistance = 5;
  controls.maxDistance = 12.5;
  controls.target.set(0, 4, 0);
  controls.update();

  // Ground — original vignette mix to background color
  baseGeom = new THREE.CircleBufferGeometry(6, 64);
  baseGeom.rotateX(-Math.PI * 0.5);
  baseMat = new THREE.MeshBasicMaterial({ color: 0x5A4218 });
  baseMat.defines = { "USE_UV": "" };
  baseMat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      `gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
      `
        vec3 col = vec3(${bc.r}, ${bc.g}, ${bc.b});
        vec2 uv = vUv - 0.5;
        uv *= 2.;
        col = mix(outgoingLight, col, length(uv));
        gl_FragColor = vec4(col, diffuseColor.a);
      `
    );
  };
  base = new THREE.Mesh(baseGeom, baseMat);
  base.position.y = -0.15;
  scene.add(base);

  // OBJ tree + shimmering points overlay
  const loader = new OBJLoader();
  loader.load('https://threejs.org/examples/models/obj/tree.obj', (object)=>{
    const mat = new THREE.MeshBasicMaterial({ color: 0x4A3C28, wireframe: false, transparent: true, opacity: 0.75 });
    object.children[0].material = mat;

    const sampler = new MeshSurfaceSampler(object.children[0]).setWeightAttribute(null).build();
    const pts = [], angle = [], idx = [];
    const n = new THREE.Vector3();

    for (let i = 0; i < 1250; i++) {
      const p = new THREE.Vector3();
      sampler.sample(p, n);
      pts.push(p);
      angle.push(Math.random() * Math.PI * 2 / 5);
      idx.push(i);
    }

    const treePoints = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.PointsMaterial({ color:0x482D02, size: 0.16 })
    );
    treePoints.geometry.setAttribute("angle", new THREE.BufferAttribute(new Float32Array(angle), 1));
    treePoints.geometry.setAttribute("idx", new THREE.BufferAttribute(new Float32Array(idx), 1));
    treePoints.material.onBeforeCompile = shader => {
      shader.uniforms.time = uniformsTree.time;
      shader.vertexShader = `uniform float time; attribute float angle; attribute float idx; varying float vAngle;` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n vAngle = angle;`);
      shader.vertexShader = shader.vertexShader.replace(`gl_PointSize = size;`, `float halfSize = size * 0.5; float tIdx = idx + time; gl_PointSize = size + (sin(tIdx) * cos(tIdx * 2.5) * 0.5 + 0.5) * halfSize * 0.5;`);
      shader.fragmentShader = `varying float vAngle;` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(`#include <clipping_planes_fragment>`, `
        vec2 uv = gl_PointCoord - 0.5;
        float a = atan(uv.y, uv.x) + vAngle;
        float f = 0.4 + 0.1 * cos(a * 5.);
        f = 1. - step(f, length(uv));
        if (f < 0.5) discard;
        #include <clipping_planes_fragment>`);
      shader.fragmentShader = shader.fragmentShader.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`, `
        vec3 col = vec3(1,1,0.8);
        uv *= 2.;
        float d = clamp(length(uv), 0., 1.);
        vec4 diffuseColor = vec4(mix(col, diffuse, pow(d, 2.)), 1.);`);
    };

    object.add(treePoints);
    object.rotation.y = THREE.Math.DEG2RAD * 20;
    object.scale.setScalar(5);
    scene.add(object);
    treeObject = object;
    percentage && (percentage.style.display = "none");
  }, (xhr)=>{
    if (xhr.lengthComputable && percentage) percentage.innerText = (xhr.loaded / xhr.total * 100).toFixed(0) + '%';
  });

  // Petals / points buffers
  const c = new THREE.Color();
  while (pointsCount < MAX_POINTS) {
    const vec = new THREE.Vector3(THREE.Math.randFloat(-r, r), 0, THREE.Math.randFloat(-r, r));
    const rRatio = vec.length() / r;
    if (vec.length() <= r && Math.random() < (1. - rRatio)) {
      points.push(vec);
      c.set(0xffffcc);
      color.push(c.r, c.g - Math.random() * 0.1, c.b + Math.random() * 0.2);
      delay.push(THREE.Math.randFloat(-10, 0));
      let val = THREE.Math.randFloat(1, 2);
      val = Math.random() < 0.25 ? 0 : val;
      speed.push(Math.PI * val * 0.125, val);

      const biomeName = biomeNames[Math.floor(Math.random() * biomeNames.length)];
      const biomeColor = biomeColors[biomeName];
      const targetX = (Math.random() - 0.5) * 80;
      const targetY = (Math.random() - 0.5) * 40;
      const targetZ = (Math.random() - 0.5) * 60;
      targetPositions.push(new THREE.Vector3(targetX, targetY, targetZ));
      targetColors.push([biomeColor.r, biomeColor.g, biomeColor.b]);
      pointsCount++;
    }
  }

  pointsGeom = new THREE.BufferGeometry().setFromPoints(points);
  pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(color), 3));
  pointsGeom.setAttribute("delay", new THREE.BufferAttribute(new Float32Array(delay), 1));
  pointsGeom.setAttribute("speed", new THREE.BufferAttribute(new Float32Array(speed), 2));

  // Store initial landing arrays for SOFT RESET
  initialPositions = new Float32Array(pointsGeom.attributes.position.array);
  initialColors = new Float32Array(pointsGeom.attributes.color.array);

  // SEOUL text texture and circle sprite
  const texSeoul = buildSeoulTexture();
  uniforms.tex2020.value = texSeoul;
  circleTexture = createCircleTexture();

  pointsMat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.9 });
  pointsMat.onBeforeCompile = shader => {
    shader.uniforms.time = uniforms.time;
    shader.uniforms.upperLimit = uniforms.upperLimit;
    shader.uniforms.upperRatio = uniforms.upperRatio;
    shader.uniforms.spiralRadius = uniforms.spiralRadius;
    shader.uniforms.spiralTurns = uniforms.spiralTurns;
    shader.uniforms.tex2020 = uniforms.tex2020;
    shader.uniforms.azimuth = uniforms.azimuth;
    shader.uniforms.transformProgress = uniforms.transformProgress;
    shader.uniforms.isTransformed = uniforms.isTransformed;
    shader.uniforms.globalOpacity = uniforms.globalOpacity; // fade control

    shader.vertexShader = `
      uniform float time;
      uniform float upperLimit;
      uniform float upperRatio;
      uniform float spiralRadius;
      uniform float spiralTurns;
      uniform sampler2D tex2020;
      uniform float azimuth;
      uniform float transformProgress;
      uniform float isTransformed;
      attribute float delay;
      attribute vec2 speed;
      varying float vRatio;
      varying vec2 vSpeed;
      varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>
      if (isTransformed > 0.5) {
        // Biome dots floating waves — lively but light
        float waveSpeed1 = 0.3 + (position.x + position.z) * 0.02; 
        float wavePhase1 = (position.x * 1.2 + position.z * 0.9);   
        float wave1 = sin(time * waveSpeed1 + wavePhase1) * 0.8;
        float waveSpeed2 = 0.5 + (position.x - position.z) * 0.015;
        float wavePhase2 = (position.x * 0.7 + position.z * 1.3);
        float wave2 = cos(time * waveSpeed2 + wavePhase2) * 0.4;
        float driftX = sin(time * 0.2 + position.z * 0.1) * 0.3;
        float driftZ = cos(time * 0.25 + position.x * 0.1) * 0.2;
        float globalRotationAngle = sin(time * 0.3) * 0.15;
        mat3 globalRotY = mat3(
          cos(globalRotationAngle), 0.0, sin(globalRotationAngle),
          0.0, 1.0, 0.0,
          -sin(globalRotationAngle), 0.0, cos(globalRotationAngle)
        );
        float rotationSpeed = 0.1 + (position.x + position.y + position.z) * 0.01;
        float rotationAngle = sin(time * rotationSpeed) * 0.1;
        mat3 rotY = mat3(
          cos(rotationAngle), 0.0, sin(rotationAngle),
          0.0, 1.0, 0.0,
          -sin(rotationAngle), 0.0, cos(rotationAngle)
        );  
        transformed = globalRotY * (rotY * position + vec3(driftX, wave1 + wave2, driftZ));
        vRatio = 0.0;
        vSpeed = vec2(0.0);
        vIsEffect = 0.0;
      } else {
        // Petal rise/fall spiral with SEOUL letter effect
        float t = time + delay;
        t = t < 0. ? 0. : t;
        float cycleTime = 40.0;
        float riseTime = 20.0;
        float fallTime = 6.0;
        float loopT = mod(t, cycleTime);
        float h;
        if (loopT < riseTime) {
          h = mod(speed.y * loopT, upperLimit);
        } else {
          float fallProgress = (loopT - riseTime) / fallTime;
          float individualFallDelay = (delay + 10.0) / 10.0;
          float adjustedFallProgress = clamp(fallProgress - individualFallDelay * 0.3, 0.0, 1.0) / (1.0 - individualFallDelay * 0.3);
          adjustedFallProgress = smoothstep(0.0, 1.0, adjustedFallProgress);
          float maxHeightReached = mod(speed.y * riseTime, upperLimit);
          h = maxHeightReached * (1.0 - adjustedFallProgress);
        }
        float hRatio = clamp(h / upperLimit, 0., 1.);
        vRatio = hRatio;
        vSpeed = speed;
        transformed.y = h;
        float a = atan(position.x, position.z);
        a += speed.x * t;
        float initLength = length(position.xz);
        float finalLength = initLength * upperRatio;
        float ratio = mix(initLength, finalLength, hRatio);
        transformed.x = cos(a) * ratio;
        transformed.z = sin(a) * -ratio;
        float sTurns = sin(time * 0.5) * 0.5 + spiralTurns;
        float spiralA = hRatio * sTurns * PI * 2.;
        float sRadius = mix(spiralRadius, 0., hRatio);
        transformed.x += cos(spiralA) * sRadius;
        transformed.z += sin(spiralA) * -sRadius;

        // SEOUL letter sampling window
        vec3 efcPos = vec3(0, 6, 0.5);
        vec3 efcClamp = vec3(2.0, 0.9, 0.25) * 3.5;
        vec3 efcMin = efcPos - efcClamp;
        vec3 efcMax = efcPos + efcClamp;
        vec3 UVTransformed = vec3(transformed);
        mat2 R = rot(azimuth);
        UVTransformed.xz *= R;
        vec3 efcUV = (UVTransformed - efcMin) / (efcMax - efcMin);
        float isEffect = texture2D(tex2020, efcUV.xy).r;
        isEffect *= (efcUV.z > 0. && efcUV.z < 1.) ? 1. : 0.;
        vIsEffect = isEffect;
      }`);

    shader.vertexShader = shader.vertexShader.replace(`gl_PointSize = size;`,
      `if (isTransformed > 0.5) {
        gl_PointSize = 0.3;
      } else {
        float hRatio = vRatio;
        bool cond = floor(speed.y + 0.5) == 0.;
        gl_PointSize = size * (cond ? 0.75 : ((1. - hRatio) * (smoothstep(0., 0.01, hRatio) * 0.25) + 0.75));
        gl_PointSize = mix(gl_PointSize, size * 2.2, vIsEffect); /* larger for letters */
      }`
    );

    shader.fragmentShader = `
      uniform float time;
      uniform float isTransformed;
      uniform float globalOpacity;
      varying float vRatio;
      varying vec2 vSpeed;
      varying float vIsEffect;
      mat2 rot(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(`#include <clipping_planes_fragment>`, `
      if (isTransformed < 0.5) {
        if (vRatio == 1.) discard;
        vec2 uv = gl_PointCoord - 0.5;
        float a = (time * vSpeed.x + vSpeed.x) * 10.;
        uv *= rot(a);
        uv.y *= floor(a + 0.5) == 0. ? 1.25 : 2. + sin(a * PI);
        if (length(uv) > 0.5) discard;
      } else {
        vec2 center = gl_PointCoord - 0.5;
        if (length(center) > 0.5) discard;
      }
      #include <clipping_planes_fragment>`);

    shader.fragmentShader = shader.fragmentShader.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`, `
      vec4 diffuseColor;
      if (isTransformed > 0.5) {
        diffuseColor = vec4(vColor, 0.95 * globalOpacity);
      } else {
        vec3 col = vec3(1., 0.95, 0.8);
        vec2 uv = gl_PointCoord - 0.5;
        float d = clamp(uv.x + .5, 0., 1.);
        vec4 baseCol = vec4(mix(vColor, col, pow(d, 2.)), 1.0 * globalOpacity);
        vec3 seoulColor = vec3(0.95, 0.0, 0.45);
        diffuseColor = vec4(mix(baseCol.rgb, seoulColor, vIsEffect), baseCol.a);
      }`);
  };

  const p = new THREE.Points(pointsGeom, pointsMat);
  scene.add(p);

  sequence(); // begin render loop
}

/* ---------- Landing / Video flows ---------- */
function onDocumentClick(){ /* disabled */ return; }

function startLandingExperience() {
  if (currentMode === 'video') {
    // Soft return from video
    returnToLandingFromVideo();
    return;
  }
  if (isTransformed) {
    // Soft reset petals within existing scene
    softResetLandingWithinScene();
    return;
  }
  if (isPlaying) return;
  currentMode = 'landing';
  isPlaying = true;
  animationStartTime = performance.now();
  veil && (veil.style.display = "none");
  playBackgroundMusic();
}

// (b) Video flow: dots 5s → fade dots → teardown → show video
function startShowVideo() {
  if (currentMode === 'video') return;
  currentMode = 'video';
  if (!isPlaying) { isPlaying = true; }

  instructions && (instructions.textContent = 'Preparing video… dots will fade out.');

  if (!isTransformed) transformToBiomeDots();

  setTimeout(() => {
    fadeDotsToTransparent(2000, () => {
      teardownThree();
      fadeOutMusic(1500);
      showFullScreenVideo();
    });
  }, 5000);
}

function transformToBiomeDots() {
  if (isTransformed || isTransitioning) return;
  isTransitioning = true;

  fadeOutMusic(3000);

  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;

  controls.target.set(0, 0, 0);
  camera.position.set(0, 15, 50);
  camera.updateProjectionMatrix();
  controls.autoRotate = false;
  controls.minDistance = 20;
  controls.maxDistance = 80;

  const positions = pointsGeom.attributes.position.array;
  const colors = pointsGeom.attributes.color.array;
  for (let i = 0; i < targetPositions.length; i++) {
    const target = targetPositions[i];
    const targetColor = targetColors[i];
    positions[i * 3] = target.x;
    positions[i * 3 + 1] = target.y;
    positions[i * 3 + 2] = target.z;
    colors[i * 3] = targetColor[0];
    colors[i * 3 + 1] = targetColor[1];
    colors[i * 3 + 2] = targetColor[2];
  }
  pointsGeom.attributes.position.needsUpdate = true;
  pointsGeom.attributes.color.needsUpdate = true;

  uniforms.isTransformed.value = 1.0;
  if (!circleTexture) circleTexture = createCircleTexture();
  pointsMat.map = circleTexture;
  pointsMat.needsUpdate = true;

  isTransformed = true;
  isTransitioning = false;
  instructions && (instructions.textContent = 'Biome Dots are floating…');
}

// Fade helper
function fadeDotsToTransparent(duration = 2000, onDone) {
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start) / duration);
    uniforms.globalOpacity.value = 1 - t;
    if (t < 1) requestAnimationFrame(step);
    else { uniforms.globalOpacity.value = 0; if (typeof onDone === 'function') onDone(); }
  }
  requestAnimationFrame(step);
}

function showFullScreenVideo() {
  if (!bgVideo || !videoContainer) return;
  bgVideo.muted = false;

  const reveal = () => { videoContainer.style.display = 'block'; };

  if (bgVideo.readyState >= 2) {
    reveal();
  } else {
    const onCanPlay = () => { bgVideo.removeEventListener('canplay', onCanPlay); reveal(); };
    bgVideo.addEventListener('canplay', onCanPlay);
  }

  const p = bgVideo.play();
  if (p && p.catch) p.catch(() => { 
    if (tapToPlay) tapToPlay.style.display = 'flex'; 
    reveal();
  });
}

// Tap-to-play fallback
tapToPlay?.addEventListener('click', ()=>{
  tapToPlay.style.display = 'none';
  bgVideo.muted = false;
  bgVideo.play();
});

/* ---------- Render Loop & Volume calc ---------- */
const clock = new THREE.Clock();
let t = 0;
function sequence() {
  renderer.setAnimationLoop(()=>{
    t += clock.getDelta() * 0.5;
    if (uniforms) {
      uniforms.time.value = t;
      if (controls) uniforms.azimuth.value = controls.getAzimuthalAngle();
      uniforms.isTransformed.value = isTransformed ? 1.0 : 0.0;
    }
    if (uniformsTree) uniformsTree.time.value = t * 5;

    // Update music volume during landing
    if (pointsGeom && !isTransformed && isPlaying && currentMode === 'landing') {
      calculateAverageHeightAndUpdateVolume();
    }

    controls?.update();
    renderer?.render(scene, camera);
  });
}

function calculateAverageHeightAndUpdateVolume() {
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;
  const UL = uniforms.upperLimit.value;

  // Sample-based P90
  const SAMPLE = 2000;
  const total = delays.length;
  const idxs = new Uint32Array(Math.min(SAMPLE, total));
  for (let i = 0; i < idxs.length; i++) idxs[i] = (Math.random() * total) | 0;

  const heights = [];
  let risingCount = 0, fallingCount = 0, phase = 'Mixed';

  for (let k = 0; k < idxs.length; k++) {
    const i = idxs[k];
    const d = delays[i];
    const spd = speeds[i * 2 + 1];
    const currentTime = t + d;
    if (currentTime <= 0) continue;

    const cycleTime = 40.0, riseTime = 20.0, fallTime = 6.0;
    const loopT = currentTime % cycleTime;

    let h;
    if (loopT < riseTime) {
      h = (spd * loopT) % UL;
      risingCount++;
    } else {
      const fallProgress = (loopT - riseTime) / fallTime;
      const individualFallDelay = (d + 10.0) / 10.0;
      const adjusted = Math.max(0, Math.min(1,
        (fallProgress - individualFallDelay * 0.3) / (1.0 - individualFallDelay * 0.3)
      ));
      const maxHeightReached = (spd * riseTime) % UL;
      h = maxHeightReached * (1.0 - adjusted);
      fallingCount++;
    }
    heights.push(h);
  }

  if (risingCount > fallingCount * 2) phase = 'Rising';
  else if (fallingCount > risingCount * 2) phase = 'Falling';

  if (heights.length > 0) {
    heights.sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(heights.length - 1, Math.floor(0.90 * heights.length)));
    const p90Height = heights[idx];
    updateMusicVolume(p90Height, UL, phase);
  }
}

function onWindowResize() {
  if (!camera || !renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/* ---------- Soft reset helpers ---------- */

// When leaving Video → Landing without full page reload
function returnToLandingFromVideo() {
  // Hide video UI and pause
  if (videoContainer) videoContainer.style.display = 'none';
  try { bgVideo?.pause?.(); } catch(e){}
  try { bgVideo.currentTime = 0; } catch(e){}

  // Rebuild scene if it was torn down
  if (!renderer || !scene) {
    initScene();
  }

  // Reset flags
  isTransformed = false;
  uniforms.globalOpacity.value = 1.0;

  // Restore landing camera/controls
  controls.target.set(0, 4, 0);
  camera.position.set(0, 5, 10);
  controls.autoRotate = true;
  controls.minDistance = 5;
  controls.maxDistance = 12.5;

  // Show base & tree
  if (treeObject) treeObject.visible = true;
  if (base) base.visible = true;

  // Reset petals to fresh rising
  reseedPetalDelaysAndSpeeds();
  restoreLandingPositionsAndColors();

  currentMode = 'landing';
  isPlaying = true;
  playBackgroundMusic();
}

// When on Landing (but in dots mode) → fresh petals without reload
function softResetLandingWithinScene() {
  isTransformed = false;
  uniforms.globalOpacity.value = 1.0;

  controls.target.set(0, 4, 0);
  camera.position.set(0, 5, 10);
  controls.autoRotate = true;
  controls.minDistance = 5;
  controls.maxDistance = 12.5;

  if (treeObject) treeObject.visible = true;
  if (base) base.visible = true;

  reseedPetalDelaysAndSpeeds();
  restoreLandingPositionsAndColors();

  currentMode = 'landing';
  isPlaying = true;
  playBackgroundMusic();
}

// Re-seed delay/speed so petals rise again in stagger
function reseedPetalDelaysAndSpeeds() {
  if (!pointsGeom) return;
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;
  for (let i = 0; i < delays.length; i++) {
    delays[i] = THREE.Math.randFloat(-10, 0);
    let val = THREE.Math.randFloat(1, 2);
    val = Math.random() < 0.25 ? 0 : val;
    speeds[i * 2 + 0] = Math.PI * val * 0.125;
    speeds[i * 2 + 1] = val;
  }
  pointsGeom.attributes.delay.needsUpdate = true;
  pointsGeom.attributes.speed.needsUpdate = true;
}

// Put positions/colors back to original landing arrays
function restoreLandingPositionsAndColors() {
  if (!pointsGeom || !initialPositions || !initialColors) return;
  const pos = pointsGeom.attributes.position.array;
  const col = pointsGeom.attributes.color.array;
  pos.set(initialPositions);
  col.set(initialColors);
  pointsGeom.attributes.position.needsUpdate = true;
  pointsGeom.attributes.color.needsUpdate = true;
  // Remove sprite map so we return to petal shader look
  pointsMat.map = null;
  pointsMat.needsUpdate = true;
}

/* ---------- Clean-up ---------- */
function disposeMaterial(mat){
  if (!mat) return;
  if (mat.map) { mat.map.dispose?.(); }
  mat.dispose?.();
}
function disposeGeometry(geo){ geo?.dispose?.(); }

function teardownThree() {
  document.removeEventListener('click', onDocumentClick);
  try { controls?.dispose?.(); } catch(e){}
  try { renderer?.setAnimationLoop(null); } catch(e){}
  try {
    scene?.traverse(obj => {
      if (obj.isMesh || obj.isPoints) {
        disposeGeometry(obj.geometry);
        disposeMaterial(obj.material);
      }
    });
  } catch(e){}
  try { renderer?.dispose?.(); } catch(e){}
  try { renderer?.domElement?.remove?.(); } catch(e){}
  scene = camera = renderer = controls = null;
}

/* ---------- Wire up buttons ---------- */
landingButton?.addEventListener('click', (e)=>{
  e.stopPropagation();
  startLandingExperience();
});
showVideoButton?.addEventListener('click', (e)=>{
  e.stopPropagation();
  startShowVideo();
});

// Kick off THREE scene immediately so petals are visible in menu
initScene();
