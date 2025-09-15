import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.115.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'https://cdn.jsdelivr.net/npm/three@0.115.0/examples/jsm/math/MeshSurfaceSampler.js';

/* ---------- DOM Elements ---------- */
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

/* ---------- State Management ---------- */
let isTransformed = false;
let isTransitioning = false;
let isPlaying = false;
let currentMode = 'menu'; // 'menu' | 'landing' | 'video'

// Performance optimization flags
let enableTreeShimmer = true;
let enableComplexShaders = true;
let particleCount = 30000;

// Dynamic Music Volume System
let currentVolume = 1.0;
let targetVolume = 1.0;
const baseVolume = 1.0;

// Kiosk reliability
let lastKnownGoodState = null;
let errorCount = 0;
const MAX_ERRORS = 3;
let idleTimer = 0;
const IDLE_TIMEOUT = 300000; // 5 minutes
const RESET_TIMEOUT = 600000; // 10 minutes

// Performance monitoring
let frameCount = 0;
let lastFPSCheck = performance.now();
let currentFPS = 60;

/* ---------- THREE.js Core ---------- */
let scene, camera, renderer, controls;
let base, treeObject = null;
let uniformsTree = { time: { value: 0 } };

// Particle system
const r = 4.8;
let pointsCount = 0;
let pointsGeom, pointsMat, circleTexture;
let points = [], delay = [], speed = [], color = [];

// Biome configuration (from original)
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

// Shader uniforms (original TV-2 configuration)
const uniforms = {
  time: { value: 0 },
  upperLimit: { value: 10 },
  upperRatio: { value: 2.1 },
  spiralRadius: { value: 1.8 },
  spiralTurns: { value: 1.3 },
  tex2020: { value: null }, // SEOUL texture
  azimuth: { value: 0 },
  isTransformed: { value: 0 },
  globalOpacity: { value: 1.0 }
};

/* ---------- Texture Creation (Original Style) ---------- */
function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const center = 16, radius = 14;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.80, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

function buildSeoulTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 8;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 80px 'Arial Black', Arial, sans-serif";
  ctx.strokeText("SEOUL", canvas.width * 0.5, canvas.height * 0.5);
  ctx.fillText("SEOUL", canvas.width * 0.5, canvas.height * 0.5);
  return new THREE.CanvasTexture(canvas);
}

/* ---------- Audio Management ---------- */
function playBackgroundMusic() {
  if (!backgroundMusic) return;
  backgroundMusic.currentTime = 4;
  backgroundMusic.volume = currentVolume;
  backgroundMusic.play().catch(() => {});
}

function updateMusicVolume(avgHeight, maxHeight, phase) {
  let heightRatio = Math.max(0, Math.min(1, avgHeight / maxHeight));
  if (heightRatio > 0.98) heightRatio = 1.0;
  targetVolume = Math.min(1.0, heightRatio * baseVolume);

  if (Math.abs(currentVolume - targetVolume) > 0.005) {
    currentVolume += (targetVolume - currentVolume) * 0.2;
    if (!backgroundMusic.paused) backgroundMusic.volume = currentVolume;
  }

  // Debug HUD updates
  if (volumeValue) volumeValue.textContent = currentVolume.toFixed(3);
  if (heightValue) heightValue.textContent = avgHeight.toFixed(2);
  if (phaseValue) phaseValue.textContent = phase;
}

function fadeOutMusic(ms = 1500) {
  if (!backgroundMusic || backgroundMusic.paused) return;
  const steps = Math.max(1, Math.floor(ms / 50));
  const v0 = backgroundMusic.volume;
  let i = 0;
  const interval = setInterval(() => {
    i++;
    backgroundMusic.volume = Math.max(0, v0 * (1 - i / steps));
    if (i >= steps) {
      clearInterval(interval);
      backgroundMusic.pause();
    }
  }, 50);
}

/* ---------- Performance Optimization ---------- */
function optimizeForDevice() {
  // Detect device capabilities
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer_info = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    
    // Adjust for lower-end devices
    if (renderer_info.includes('Intel') || navigator.hardwareConcurrency < 4) {
      particleCount = 15000;
      enableTreeShimmer = false;
      console.log('Optimizing for lower-end device');
    }
  }
}

function monitorPerformance() {
  frameCount++;
  const now = performance.now();
  
  if (now - lastFPSCheck >= 1000) {
    currentFPS = Math.round((frameCount * 1000) / (now - lastFPSCheck));
    frameCount = 0;
    lastFPSCheck = now;
    
    // Auto-adjust quality based on FPS
    if (currentFPS < 30 && particleCount > 10000) {
      particleCount = Math.max(10000, particleCount * 0.8);
      console.log(`Reducing particles to ${particleCount} for better performance`);
    }
  }
}

/* ---------- Scene Initialization ---------- */
function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x11130E);
  document.body.appendChild(renderer.domElement);
  window.addEventListener("resize", onWindowResize, false);

  // Camera controls (original TV-2 style)
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

  createGroundWithGradient();
  loadTreeWithShimmer();
  createPetalField();
  
  animate();
  saveState();
}

function createGroundWithGradient() {
  const baseGeom = new THREE.CircleBufferGeometry(6, 64);
  baseGeom.rotateX(-Math.PI * 0.5);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x5A4218 });
  
  // Original gradient effect
  baseMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      `
        vec2 uv = vUv - 0.5;
        uv *= 2.0;
        float dist = length(uv);
        vec3 groundColor = mix(outgoingLight, vec3(0.067, 0.075, 0.055), dist);
        gl_FragColor = vec4(groundColor, diffuseColor.a);
      `
    );
  };
  
  base = new THREE.Mesh(baseGeom, baseMat);
  base.position.y = -0.15;
  scene.add(base);
}

function loadTreeWithShimmer() {
  const loader = new OBJLoader();
  loader.load(
    'https://threejs.org/examples/models/obj/tree.obj',
    (object) => {
      object.children[0].material = new THREE.MeshBasicMaterial({ 
        color: 0x4A3C28, 
        transparent: true, 
        opacity: 0.75 
      });

      if (enableTreeShimmer) {
        const sampler = new MeshSurfaceSampler(object.children[0])
          .setWeightAttribute(null)
          .build();
        
        const pts = [], idx = [];
        const normal = new THREE.Vector3();
        
        for (let i = 0; i < 1250; i++) {
          const point = new THREE.Vector3();
          sampler.sample(point, normal);
          pts.push(point);
          idx.push(i);
        }

        const treePoints = new THREE.Points(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.PointsMaterial({ 
            color: 0x482D02, 
            size: 0.16, 
            map: circleTexture,
            transparent: true,
            alphaTest: 0.05,
            depthWrite: false
          })
        );
        
        treePoints.geometry.setAttribute("idx", new THREE.BufferAttribute(new Float32Array(idx), 1));
        
        // Original shimmer shader
        treePoints.material.onBeforeCompile = (shader) => {
          shader.uniforms.time = uniformsTree.time;
          shader.vertexShader = 'uniform float time; attribute float idx;' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            'gl_PointSize = size;',
            `float halfSize = size*0.5; float tIdx = idx + time;
             gl_PointSize = size + (sin(tIdx)*cos(tIdx*2.5)*0.5+0.5) * halfSize * 0.5;`
          );
        };

        object.add(treePoints);
      }

      object.rotation.y = THREE.Math.DEG2RAD * 20;
      object.scale.setScalar(5);
      scene.add(object);
      treeObject = object;
      if (percentage) percentage.style.display = "none";
    },
    (xhr) => {
      if (xhr.lengthComputable && percentage) {
        percentage.textContent = (xhr.loaded / xhr.total * 100).toFixed(0) + '%';
      }
    }
  );
}

function createPetalField() {
  circleTexture = createCircleTexture();
  uniforms.tex2020.value = buildSeoulTexture();

  // Generate petal positions (original algorithm)
  const c = new THREE.Color();
  while (pointsCount < particleCount) {
    const vec = new THREE.Vector3(
      THREE.Math.randFloat(-r, r), 
      0, 
      THREE.Math.randFloat(-r, r)
    );
    const rRatio = vec.length() / r;
    
    if (vec.length() <= r && Math.random() < (1 - rRatio)) {
      points.push(vec);
      
      // Original petal colors
      c.set(0xffffcc);
      color.push(c.r, c.g - Math.random() * 0.1, c.b + Math.random() * 0.2);
      delay.push(THREE.Math.randFloat(-10, 0));
      
      let val = THREE.Math.randFloat(1, 2);
      if (Math.random() < 0.25) val = 0;
      speed.push(Math.PI * val * 0.125, val);

      // Biome target positions
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

  pointsMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    map: circleTexture,
    alphaTest: 0.05,
    depthWrite: false
  });

  // Original TV-2 shader with optimizations
  pointsMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

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
         // Biome dots floating (original effect)
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
         // Original petal spiral motion
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
         float sT = sin(time*0.5)*0.5 + spiralTurns; float sA = hR * sT * 6.2831853;
         float sR = mix(spiralRadius, 0., hR); transformed.x += cos(sA)*sR; transformed.z += sin(sA)*-sR;

         // SEOUL letter sampling (original effect)
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

    // Original fragment shader with petal shape
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vIsEffect; uniform float globalOpacity; void main() {'
    );
    
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `
        // Original petal 5-lobe shape
        vec2 p = gl_PointCoord - 0.5;
        float ang = atan(p.y, p.x);
        float petal = 0.42 + 0.10 * cos(ang * 5.0);
        float mask = 1.0 - step(petal, length(p));
        if (mask < 0.5) discard;
      
        // Original color mixing
        vec3 seoul = vec3(0.95, 0.00, 0.45);
        vec3 baseCol = vColor;
        vec3 mixed = mix(baseCol, seoul, clamp(vIsEffect, 0.0, 1.0));
      
        vec4 diffuseColor = vec4(mixed, opacity * globalOpacity);
      `
    );
  };

  const pointsMesh = new THREE.Points(pointsGeom, pointsMat);
  scene.add(pointsMesh);
}

/* ---------- Animation Loop ---------- */
const clock = new THREE.Clock();
function animate() {
  renderer.setAnimationLoop(() => {
    monitorPerformance();
    
    const deltaTime = clock.getDelta();
    uniforms.time.value += deltaTime * 0.5;
    uniforms.azimuth.value = controls.getAzimuthalAngle();
    uniforms.isTransformed.value = isTransformed ? 1.0 : 0.0;
    uniformsTree.time.value = uniforms.time.value * 5.0;

    // Volume calculation (optimized sampling)
    if (!isTransformed && isPlaying && currentMode === 'landing') {
      calculateVolumeProxy();
    }

    controls.update();
    renderer.render(scene, camera);
  });
}

function calculateVolumeProxy() {
  const delays = pointsGeom.attributes.delay.array;
  const speeds = pointsGeom.attributes.speed.array;
  const UL = uniforms.upperLimit.value;

  // Optimized sampling (1500 instead of full particle count)
  const SAMPLE = 1500;
  const total = delays.length;
  const indices = new Uint32Array(Math.min(SAMPLE, total));
  for (let i = 0; i < indices.length; i++) {
    indices[i] = (Math.random() * total) | 0;
  }

  const heights = [];
  let rising = 0, falling = 0;
  
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const d = delays[i];
    const sp = speeds[i * 2 + 1];
    const ct = uniforms.time.value + d;
    if (ct <= 0) continue;

    const cycle = 40, rise = 20, fall = 6;
    const loop = ct % cycle;
    let h;
    
    if (loop < rise) {
      h = (sp * loop) % UL;
      rising++;
    } else {
      const fp = (loop - rise) / fall;
      const id = (d + 10) / 10;
      const adj = Math.max(0, Math.min(1, (fp - id * 0.3) / (1 - id * 0.3)));
      const maxH = (sp * rise) % UL;
      h = maxH * (1 - adj * adj * (3 - 2 * adj)); // smoothstep
      falling++;
    }
    heights.push(h);
  }

  let phase = 'Mixed';
  if (rising > 2 * falling) phase = 'Rising';
  else if (falling > 2 * rising) phase = 'Falling';

  if (heights.length) {
    heights.sort((a, b) => a - b);
    const p90 = heights[Math.floor(0.9 * heights.length)];
    updateMusicVolume(p90, UL, phase);
  }
}

/* ---------- Mode Transitions ---------- */
function startLandingExperience() {
  if (currentMode === 'video') {
    location.reload(); // Clean reset for kiosk
    return;
  }
  if (isPlaying) return;
  
  currentMode = 'landing';
  isPlaying = true;
  if (veil) veil.style.display = "none";
  if (instructions) instructions.textContent = 'Landing mode active';
  playBackgroundMusic();
  saveState();
  resetIdleTimer();
}

function transformToBiomeDots() {
  if (isTransformed || isTransitioning) return;
  isTransitioning = true;

  fadeOutMusic(3000);

  if (treeObject) treeObject.visible = false;
  if (base) base.visible = false;

  // Camera transition for biome view
  controls.target.set(0, 0, 0);
  camera.position.set(0, 15, 50);
  controls.autoRotate = false;
  controls.minDistance = 20;
  controls.maxDistance = 80;

  // Transform particles to biome positions
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
  uniforms.isTransformed.value = 1;

  isTransformed = true;
  isTransitioning = false;
  if (instructions) instructions.textContent = 'Biome dots floating';
  saveState();
}

function startShowVideo() {
  if (currentMode === 'video') return;
  currentMode = 'video';
  
  if (instructions) instructions.textContent = 'Preparing video...';
  
  if (!isTransformed) transformToBiomeDots();
  
  setTimeout(() => {
    fadeDotsToTransparent(2000, () => {
      teardownThree();
      fadeOutMusic(1500);
      showFullScreenVideo();
    });
  }, 5000);
  
  resetIdleTimer();
}

function fadeDotsToTransparent(duration = 2000, onDone) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    uniforms.globalOpacity.value = 1 - t;
    if (t < 1) requestAnimationFrame(step);
    else {
      uniforms.globalOpacity.value = 0;
      if (typeof onDone === 'function') onDone();
    }
  }
  requestAnimationFrame(step);
}

function showFullScreenVideo() {
  if (!bgVideo || !videoContainer) return;
  
  bgVideo.muted = false;
  const reveal = () => { videoContainer.style.display = 'block'; };
  
  if (bgVideo.readyState >= 2) reveal();
  else {
    const onCanPlay = () => {
      bgVideo.removeEventListener('canplay', onCanPlay);
      reveal();
    };
    bgVideo.addEventListener('canplay', onCanPlay);
  }

  const playPromise = bgVideo.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(() => {
      if (tapToPlay) tapToPlay.style.display = 'flex';
      reveal();
    });
  }
  
  currentMode = 'video';
  saveState();
}

/* ---------- Cleanup and Error Recovery ---------- */
function teardownThree() {
  try { controls?.dispose?.(); } catch(e) {}
  try { renderer?.setAnimationLoop(null); } catch(e) {}
  try {
    scene?.traverse(obj => {
      if (obj.isMesh || obj.isPoints) {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    });
  } catch(e) {}
  try { renderer?.dispose?.(); } catch(e) {}
  try { renderer?.domElement?.remove?.(); } catch(e) {}
  scene = camera = renderer = controls = null;
}

function saveState() {
  if (!camera || !controls) return;
  lastKnownGoodState = {
    mode: currentMode,
    isTransformed,
    isPlaying,
    cameraPosition: camera.position.clone(),
    controlsTarget: controls.target.clone()
  };
  errorCount = 0; // Reset error count on successful state save
}

function recoverFromError() {
  errorCount++;
  console.warn(`Kiosk error #${errorCount}, attempting recovery...`);
  
  if (errorCount >= MAX_ERRORS) {
    location.reload();
    return;
  }
  
  if (lastKnownGoodState) {
    currentMode = lastKnownGoodState.mode;
    isTransformed = lastKnownGoodState.isTransformed;
    if (lastKnownGoodState.mode === 'landing') {
      startLandingExperience();
    }
  }
}

/* ---------- Kiosk Auto-Management ---------- */
function resetIdleTimer() {
  idleTimer = 0;
}

function checkIdleTimeout() {
  idleTimer += 1000;
  
  if (idleTimer >= RESET_TIMEOUT) {
    // Auto-return to landing mode after long idle
    if (currentMode !== 'landing') {
      console.log('Auto-returning to landing mode after idle timeout');
      startLandingExperience();
    }
    resetIdleTimer();
  }
}

/* ---------- Event Handlers ---------- */
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ---------- Event Listeners ---------- */
if (landingButton) {
  landingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    startLandingExperience();
  });
}

if (showVideoButton) {
  showVideoButton.addEventListener('click', (e) => {
    e.stopPropagation();
    startShowVideo();
  });
}

if (tapToPlay) {
  tapToPlay.addEventListener('click', () => {
    tapToPlay.style.display = 'none';
    bgVideo.muted = false;
    bgVideo.play();
  });
}

// Error recovery
window.addEventListener('error', recoverFromError);
if (typeof renderer !== 'undefined' && renderer?.context) {
  renderer.context.addEventListener('webglcontextlost', recoverFromError);
}

// Auto-management and idle detection
setInterval(checkIdleTimeout, 1000);

// Reset idle timer on any interaction
['click', 'touch', 'keydown', 'mousemove'].forEach(event => {
  document.addEventListener(event, resetIdleTimer, { passive: true });
});

// Audio context unlock for mobile
function unlockAudioContext() {
  if (backgroundMusic && backgroundMusic.paused) {
    try { 
      backgroundMusic.play().catch(() => {});
    } catch {}
  }
  document.removeEventListener('pointerdown', unlockAudioContext, { capture: true });
}
document.addEventListener('pointerdown', unlockAudioContext, { capture: true, once: true });

/* ---------- Initialize Application ---------- */
function initialize() {
  try {
    optimizeForDevice();
    
    // Preload audio
    if (backgroundMusic) backgroundMusic.load();
    
    // Initialize 3D scene
    initScene();
    
    console.log('TV-2 Kiosk initialized successfully');
    console.log(`Particle count: ${particleCount}`);
    console.log(`Tree shimmer: ${enableTreeShimmer ? 'enabled' : 'disabled'}`);
    
  } catch (error) {
    console.error('Initialization error:', error);
    recoverFromError();
  }
}

// Start the application
initialize();