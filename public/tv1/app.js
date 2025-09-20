/* ========== ENHANCED MEDIA FUNCTIONS WITH CACHING ========== */
async function showGif() {
  const gif = document.getElementById('landingGif');
  const video = document.getElementById('landingVideo');
  const map = document.getElementById('map');
  const canvas = document.getElementById('visualization-canvas');
  
  if (gif) {
    // Use cached URL if available
    const cachedSrc = mediaCache.getCachedUrl('img/fn-landing2.gif');
    if (gif.src !== cachedSrc) {
      gif.src = cachedSrc;
    }
    
    gif.style.display = 'block';
    gif.style.opacity = '1';
  }
  if (video) {
    video.style.display = 'none';
    video.pause();
  }
  if (map) map.style.display = 'none';
  if (canvas) canvas.style.display = 'none';
}

async function showVideo() {
  const gif = document.getElementById('landingGif');
  const video = document.getElementById('landingVideo');
  const map = document.getElementById('map');
  const canvas = document.getElementById('visualization-canvas');
  
  if (gif) gif.style.display = 'none';
  
  if (video) {
    // Use cached URL if available
    const cachedSrc = mediaCache.getCachedUrl('img/fn-landing4.mov');
    if (video.src !== cachedSrc) {
      video.src = cachedSrc;
    }
    
    video.style.display = 'block';
    video.style.opacity = '1';
    video.currentTime = 0;
    video.play().catch(e => console.warn('[showVideo] Play failed:', e));
  }
  if (map) map.style.display = 'none';
  if (canvas) canvas.style.display = 'none';
}

function hideAllMedia() {
  const gif = document.getElementById('landingGif');
  const video = document.getElementById('landingVideo');
  const map = document.getElementById('map');
  const canvas = document.getElementById('visualization-canvas');
  
  if (gif) {
    gif.style.opacity = '0';
    setTimeout(() => {
      gif.style.display = 'none';
      gif.style.opacity = '1';
    }, 500);
  }
  
  if (video) {
    video.style.opacity = '0';
    setTimeout(() => {
      video.style.display = 'none';
      video.pause();
      video.style.opacity = '1';
    }, 500);
  }
  
  if (map) map.style.display = 'block';
  if (canvas) canvas.style.display = 'block';
}

async function preloadVideo() {
  const video = document.getElementById('landingVideo');
  if (!video) return;

  // Preload both GIF and video
  await mediaCache.preloadMedia([
    'img/fn-landing2.gif',
    'img/fn-landing4.mov'
  ]);

  // Apply cached URLs
  const cachedVideoUrl = mediaCache.getCachedUrl('img/fn-landing4.mov');
  if (video.src !== cachedVideoUrl) {
    video.src = cachedVideoUrl;
  }

  if (video.readyState < 4) {
    return new Promise(resolve => {
      video.addEventListener('canplaythrough', resolve, { once: true });
      video.load();
    });
  }
  return Promise.resolve();
}

/* ========== ORIGINAL VISUALIZATION CANVAS (REVERTED) ========== */
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
    const now = performance.now();
    const pe = app.effects.pulse;
    const phase = pe.active ? ((now - pe.t0) % pe.period) / pe.period : 0;
    const pulseIntensity = pe.active ? (1 + Math.sin(2 * Math.PI * phase)) / 2 : 0;
    
    return colorManager.getColor(d, {
      isHighlightMode: app.state.isHighlightMode,
      pulseActive: pe.active && colorManager.isHighlighted(d),
      pulseIntensity
    });
  }

  function getDotOpacity(d) {
    if (!app.state.isHighlightMode) return 0.7;
    return colorManager.isHighlighted(d) ? 0.7 : 0.15;
  }

  const filteredData = data.filter(d => {
    if (!d.lat || !d.lon || isNaN(d.lat) || isNaN(d.lon)) return false;
    const dist = calculateDistance(centerLat, centerLon, d.lat, d.lon);
    return dist <= MAX_DISTANCE_METERS;
  });

  if (!animate) {
    ctx.clearRect(0, 0, width, height);

    const nonHighlighted = app.state.isHighlightMode ? filteredData.filter(d => !colorManager.isHighlighted(d)) : filteredData;
    const highlighted = app.state.isHighlightMode ? filteredData.filter(d => colorManager.isHighlighted(d)) : [];

    // Draw non-highlighted dots first
    nonHighlighted.forEach(d => {
      const p = app.state.isCircularView ? getCircularPosition(d) : getMapPosition(d);
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
        ctx.beginPath();
        const radius = app.state.isCircularView ? p.radius : sizeScale(d.biophilia_norm);
        ctx.arc(p.x, p.y, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.fillStyle = getDotColor(d);
        ctx.globalAlpha = getDotOpacity(d);
        ctx.fill();
      }
   });

    // Draw highlighted dots on top
    highlighted.forEach(d => {
      const p = app.state.isCircularView ? getCircularPosition(d) : getMapPosition(d);
      if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
        ctx.beginPath();
        const radius = app.state.isCircularView ? p.radius : sizeScale(d.biophilia_norm);
        ctx.arc(p.x, p.y, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.fillStyle = getDotColor(d);
        ctx.globalAlpha = getDotOpacity(d);
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
    return;
  }

  // Animation logic
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
  const fadeDuration = 800;
  const moveDurationFirst = 500;
  const dotDelayFirst = 0.05;
  const moveDurationSecond = 200;
  const dotDelaySecond = 0.01;

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
    const finalOpacity = app.state.isHighlightMode ? (colorManager.isHighlighted(d) ? baseOpacity * 1.3 : baseOpacity * 0.3) : baseOpacity;

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
      const tFade = Math.min(1, elapsed / fadeDuration);
      const currentOpacity = 1 + (0.2 - 1) * tFade;

      filteredData.forEach((d, i) => {
        if (!app.state.isHighlightMode || !colorManager.isHighlighted(d)) {
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
          if (colorManager.isHighlighted(d)) {
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

      drawByGroup(d => !app.state.isHighlightMode || !colorManager.isHighlighted(d));
      if (app.state.isHighlightMode) drawByGroup(d => colorManager.isHighlighted(d));
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

/* ========== MODE CONTROL WITH DURABILITY ========== */
async function setMode(newMode) {
  const startTime = performance.now();
  
  try {
    // Track cycle
    if (app.mode && app.mode !== newMode) {
      durabilityManager.incrementCycle();
    }
    
    // Perform cleanup before mode switch
    if (app.mode !== newMode) {
      clearAllTimersAndAnimations();
    }

    if (app.mode === newMode) return;

    if (!app.elements.leftTop) {
      app.elements.leftTop = document.querySelector('.left-column-top');
      app.elements.rightCol = document.querySelector('.right-column');
      app.elements.footer = document.querySelector('footer');
      app.elements.mapContainer = document.getElementById('map');
      app.elements.canvas = document.getElementById('visualization-canvas');
    }

    app.mode = newMode;
    document.body.className = newMode === Modes.RESULT ? 'result-mode' : '';

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
      hideHeaderLogos();
      buildAllContent();

      await ensureMapReady();

      const [, , dashboardData, participantsData] = await Promise.all([
        loadSeoulData('BS'),
        loadSeoulData('BP'), 
        loadDashboardData(),
        loadAllParticipantsData()
      ]);

      if (dashboardData) {
        dashboardManager.updateAll(dashboardData);
      }

      app.state.isCircularView = false;
      app.state.isHighlightMode = false;

      const mapContainer = document.getElementById('map');
      if (mapContainer) {
        mapContainer.classList.remove('hidden-map');
      }

      await wait(100);
      await executeResultSequence();
    }
    
    const renderTime = performance.now() - startTime;
    console.log(`[Durability] Mode switch to ${newMode} took ${renderTime.toFixed(2)}ms`);
    
  } catch (error) {
    durabilityManager.logError(error, `setMode(${newMode})`);
    
    // Attempt recovery
    try {
      durabilityManager.forceCleanup();
      await wait(1000);
      await setMode(Modes.LANDING); // Safe fallback
    } catch (recoveryError) {
      durabilityManager.logError(recoveryError, 'mode switch recovery');
      console.error('[Durability] Critical failure, consider page reload');
    }
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
        <span id="bpValueNumber">0.00</span>
        <div class="bp-indicator"></div>
      </div>
      <p>Highlights similar BiP value in the city areas that could fit your perception</p>
    </div>
    <div class="footer-section">
      <div class="middle-section-title">Which natural element brings you most positive feeling</div>
      <div class="plant-category" id="topCategoryText">Loading...</div>
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

/* ========== LANDING ANIMATION SEQUENCE ========== */
async function startLandingAnimationSequence() {
  if (app.landing.active) return;

  app.landing.active = true;

  try {
    await preloadVideo();
    ensureLandingText();

    while (app.landing.active && app.mode === Modes.LANDING) {
      
      // Phase 1: GIF sequence (16 seconds)
      showGif();
      showHeaderLogos(false);
      updateLandingTexts('Feeling Nature Seoul', '', false);
      await wait(5000);

      if (!app.landing.active || app.mode !== Modes.LANDING) break;

      updateLandingTexts(
        'Biophilia refers to the benefits that contact with nature brings to humans. But do we value nature the same way across biomes?',
        'Explore how Seoul residents perceive nature.',
        true
      );
      await wait(11000);

      if (!app.landing.active || app.mode !== Modes.LANDING) break;

      // Phase 2: Video sequence (17 seconds)
      showVideo();
      showHeaderLogos(true);

      updateLandingTexts(
        'Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.',
        'BS Map: the distribution of nature-based elements in Seoul urban environment.',
        true
      );
      await wait(3000);

      if (!app.landing.active || app.mode !== Modes.LANDING) break;

      updateLandingTexts(
        'Biophilic Perceptions (BP) exceed Biophilic Settings (BS) in Seoul city.',
        'BP Map: the strength of perceived Biophilia in the city',
        true
      );
      await wait(4000);

      if (!app.landing.active || app.mode !== Modes.LANDING) break;

      await animateTextForVideoGroupSequenceFixed();

      if (!app.landing.active || app.mode !== Modes.LANDING) break;
      
      await wait(1000);
    }

  } catch (error) {
    console.error('Error in landing animation sequence:', error);
    app.landing.active = false;
  }
}

async function animateTextForVideoGroupSequenceFixed() {
  const groups = [
    { min: 0.00, max: 0.25, name: 'Very Low (0-0.25)', duration: 3000 },
    { min: 0.25, max: 0.50, name: 'Low (0.25-0.5)', duration: 2000 },
    { min: 0.50, max: 0.75, name: 'Medium (0.5-0.75)', duration: 3000 },
    { min: 0.75, max: 1.00, name: 'High (0.75-1.0)', duration: 1500 }
  ];

  // Show first group immediately (starts at 7s mark)
  updateLandingTextForGroup(groups[0]);
  await wait(groups[0].duration);
  
  // Cycle through remaining groups with specific durations
  for (let i = 1; i < groups.length; i++) {
    if (!app.landing.active || app.mode !== Modes.LANDING) break;
    updateLandingTextForGroup(groups[i]);
    await wait(groups[i].duration);
  }
}

function updateLandingTextForGroup(group) {
  const min = group.min.toFixed(2);
  const max = group.max.toFixed(2);
  
  updateLandingTexts(
    'Complete the survey to learn how you perceive and value nature in Seoul!',
    `Biophilic Perceptions (BP) group value located in Seoul: ${min}–${max}`,
    true
  );
}

/* ========== ENSUREMAPREREADY AND SETMODE - ORIGINAL STRUCTURE ========== */
async function ensureMapReady() {
  if (!app.map) {
    initializeMapbox();
  }
  
  if (app.map && !app.mapLoaded) {
    return new Promise(resolve => {
      app.map.once('load', () => {
        app.mapLoaded = true;
        resolve();
      });
    });
  }
  
  return Promise.resolve();
}

/* ========== MODE CONTROL WITH DURABILITY TRACKING ONLY ========== */
async function setMode(newMode) {
  const startTime = performance.now();
  
  try {
    // Track cycle for durability
    if (app.mode && app.mode !== newMode) {
      durabilityManager.incrementCycle();
    }
    
    // Perform cleanup before mode switch
    if (app.mode !== newMode) {
      clearAllTimersAndAnimations();
    }

    if (app.mode === newMode) return;

    if (!app.elements.leftTop) {
      app.elements.leftTop = document.querySelector('.left-column-top');
      app.elements.rightCol = document.querySelector('.right-column');
      app.elements.footer = document.querySelector('footer');
      app.elements.mapContainer = document.getElementById('map');
      app.elements.canvas = document.getElementById('visualization-canvas');
    }

    app.mode = newMode;
    document.body.className = newMode === Modes.RESULT ? 'result-mode' : '';

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
      hideHeaderLogos();
      buildAllContent();

      await ensureMapReady();

      const [, , dashboardData, participantsData] = await Promise.all([
        loadSeoulData('BS'),
        loadSeoulData('BP'), 
        loadDashboardData(),
        loadAllParticipantsData()
      ]);

      if (dashboardData) {
        dashboardManager.updateAll(dashboardData);
      }

      app.state.isCircularView = false;
      app.state.isHighlightMode = false;

      const mapContainer = document.getElementById('map');
      if (mapContainer) {
        mapContainer.classList.remove('hidden-map');
      }

      await wait(100);
      await executeResultSequence();
    }
    
    const renderTime = performance.now() - startTime;
    console.log(`[Durability] Mode switch to ${newMode} took ${renderTime.toFixed(2)}ms`);
    
  } catch (error) {
    durabilityManager.logError(error, `setMode(${newMode})`);
    
    // Attempt recovery
    try {
      durabilityManager.forceCleanup();
      await wait(1000);
      await setMode(Modes.LANDING); // Safe fallback
    } catch (recoveryError) {
      durabilityManager.logError(recoveryError, 'mode switch recovery');
      console.error('[Durability] Critical failure, consider page reload');
    }
  }
}'BP';
      await loadSeoulData('BP');
      await wait(300); // Allow data to settle
    }

    const bpData = app.data.cache['seoul_BP'];
    if (!bpData || bpData.length === 0) {
      throw new Error('No BP data available for animation');
    }

    // Wait for BP manager to process value
    await wait(200);

    // Step 1: Map view with pulse (with error recovery)
    try {
      app.state.isHighlightMode = true;
      ensureHighlightHasSamples();
      await updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      app.effects.pulse.period = PULSE_BASE_PERIOD;
      startPulseLoop();
      await wait(3000);
    } catch (error) {
      console.error('[Result Sequence] Step 1 failed:', error);
    }

    // Step 2: Clear highlights (with fallback)
    try {
      app.state.isHighlightMode = false;
      stopPulseLoop();
      await updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      await wait(1500);
    } catch (error) {
      console.error('[Result Sequence] Step 2 failed:', error);
    }

    // Step 3: Circular view (with smooth transition)
    try {
      app.state.isCircularView = true;
      ensureHighlightHasSamples();
      const mapContainer = document.getElementById('map');
      if (mapContainer) mapContainer.classList.add('hidden-map');
      
      await updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, true);
      await wait(3500); // Longer wait for animation completion
    } catch (error) {
      console.error('[Result Sequence] Step 3 failed:', error);
    }

    // Step 4: Final highlight with validation
    try {
      app.state.isHighlightMode = true;
      ensureHighlightHasSamples();
      await updateVisualizationCanvas(bpData, seoulData.coordinates.lat, seoulData.coordinates.lon, false);
      app.effects.pulse.period = PULSE_BASE_PERIOD;
      startPulseLoop();
      await wait(200);

      // Step 5: Distribution chart
      const normalizedBpValue = bpManager.normalizedValue || window.ACTUAL_BP_VALUE || 0;
      animateDistributionCurve(normalizedBpValue);
    } catch (error) {
      console.error('[Result Sequence] Step 4/5 failed:', error);
    }

  } catch (error) {
    console.error('[Result Sequence] Critical error:', error);
  } finally {
    app.state.animationInProgress = false;
  }
}

/* ========== DISTRIBUTION ANIMATION ========== */
function animateDistributionCurve(userBpValue) {
  const actualBpValue = userBpValue;

  if (!window.lineChart) {
    return Promise.resolve();
  }

  return new Promise(() => {
    const chart = window.lineChart;
    const bins = 11;
    const binSize = 1 / (bins - 1);
    const userBinIndex = Math.min(Math.round(userBpValue / binSize), bins - 1);

    const histogram = [];
    app.data.allParticipantsData.forEach(value => {
      const idx = Math.min(Math.round(value / binSize), bins - 1);
      histogram[idx] = (histogram[idx] || 0) + 1;
    });

    const count = histogram[userBinIndex] || 0;
    const percentage = ((count / app.data.allParticipantsData.length) * 100).toFixed(1);

    function runFullAnimation() {
      while (chart.data.datasets.length > 1) {
        chart.data.datasets.pop();
      }

      if (!chart || !chart.canvas || !chart.canvas.ownerDocument) return;

      chart.update('none');

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
          }
        }
     }

    function createCustomTooltip(point, bpValue, percentage, count) {
      removeCustomTooltip();
  
      const canvas = chart.canvas;
      const rect = canvas.getBoundingClientRect();
  
      // Calculate actual highlighted dots count
      const data = app.data.cache[`seoul_${app.state.currentDataType}`] || [];
      const lo = window.HIGHLIGHT_MIN;
      const hi = window.HIGHLIGHT_MAX;
      const highlightedCount = data.filter(d => d.biophilia_norm >= lo && d.biophilia_norm <= hi).length;
      const totalDots = data.length;
      const actualPercentage = ((highlightedCount / totalDots) * 100).toFixed(1);
  
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
  
      // Use actual highlighted dot count instead of distribution bin count
      tooltip.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">Your BiP Value: ${bpValue.toFixed(2)}</div>
          <div>Among all dots: ${actualPercentage}% (${highlightedCount} dots)</div>
      `;
  
      document.body.appendChild(tooltip);
  
      const tipW = tooltip.offsetWidth;
      const tipH = tooltip.offsetHeight;
      let left = rect.left + point.x - tipW / 2;
      let top  = rect.top  + point.y + 25;
  
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
      top  = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
  
      tooltip.style.left = `${left}px`;
      tooltip.style.top  = `${top}px`;
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

    initializeMapbox();
    await setMode(Modes.LANDING);

    if (!app._resizeListenerAdded) {
      window.addEventListener('resize', debounce(() => {
        const data = app.data.cache[`seoul_${app.state.currentDataType}`];
        if (!data) return;
    
        if (app.mode === Modes.RESULT) {
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
      app.mode = Modes.LANDING;
    } catch (fallbackError) {
      console.error('Even fallback failed:', fallbackError);
    }
    
    app._initializing = false;
  }
}

/* ========== EXTERNAL API ========== */
// Make key functions available to the TV-1 poller
window.setMode = setMode;
window.updateTopElements = (data) => dashboardManager.updateTopElements(data);
window.updateBarChart = (data) => dashboardManager.updateBarChart(data);
window.updateDistributionChart = (data) => dashboardManager.updateDistributionChart(data);
window.updateDashboardDisplay = (data) => dashboardManager.updateAll(data);
window.getHealthReport = () => durabilityManager.getHealthReport();

/* ========== EVENT LISTENERS ========== */
document.addEventListener('DOMContentLoaded', () => {
  initializeApplication();
});

if (document.readyState !== 'loading') {
  setTimeout(initializeApplication, 100);
}// === RUNTIME BASE SHIM (injected) ==========================================
window.RUNTIME_BASE = window.RUNTIME_BASE || 'https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime';
window.APP_CONFIG  = window.APP_CONFIG  || { RUNTIME_BASE_URL: window.RUNTIME_BASE };
// ==========================================================================
/* EVENT-OPTIMIZED BIOPHILIC VISUALIZATION - OPTIMIZED VERSION
   Addresses critical redundancies + stability + durability improvements:
   1. Unified color management
   2. Consolidated BP value handling
   3. Single dashboard update system
   4. Unified icon management
   5. Centralized safe execution
   6. Media caching for offline playback
   7. Animation stability and performance
   8. Event durability and memory management
*/

/* ========== CONFIGURATION ========== */
const MAX_DISTANCE_METERS = 15000;
const HIGHLIGHT_COLOR = '#92C043', NON_HIGHLIGHT_GRAY = '#666666';
const PULSE_BASE_PERIOD = 1200;

window.USE_CURRENT_JSON = true;

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
};

const sizeScale = d3.scaleLinear().domain([0, 0.2, 0.6, 0.8, 1]).range([0, 1, 2, 3, 6]);

/* ========== MEDIA CACHE MANAGER ========== */
class MediaCacheManager {
  constructor() {
    this.cache = new Map();
    this.preloadQueue = [];
    this.isPreloading = false;
  }

  // Convert media to blob URLs for offline access
  async preloadMedia(urls) {
    if (this.isPreloading) return;
    this.isPreloading = true;

    try {
      const promises = urls.map(async (url) => {
        if (this.cache.has(url)) return this.cache.get(url);
        
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch ${url}`);
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          this.cache.set(url, blobUrl);
          
          console.log(`[MediaCache] Cached: ${url}`);
          return blobUrl;
        } catch (error) {
          console.warn(`[MediaCache] Failed to cache ${url}:`, error);
          return url; // Fallback to original URL
        }
      });

      await Promise.all(promises);
    } finally {
      this.isPreloading = false;
    }
  }

  getCachedUrl(originalUrl) {
    return this.cache.get(originalUrl) || originalUrl;
  }

  // Clean up blob URLs to prevent memory leaks
  cleanup() {
    for (const blobUrl of this.cache.values()) {
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    }
    this.cache.clear();
  }
}

/* ========== ANIMATION MANAGER ========== */
class AnimationManager {
  constructor() {
    this.currentAnimation = null;
    this.animationQueue = [];
    this.isAnimating = false;
    this.lastCanvasUpdate = 0;
    this.frameThrottle = 16; // ~60fps
  }

  // Queue animations to prevent overlapping
  async queueAnimation(animationFn) {
    return new Promise((resolve) => {
      this.animationQueue.push({ fn: animationFn, resolve });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isAnimating || this.animationQueue.length === 0) return;
    
    this.isAnimating = true;
    const { fn, resolve } = this.animationQueue.shift();
    
    try {
      await fn();
      resolve();
    } catch (error) {
      console.error('[AnimationManager] Animation failed:', error);
      resolve();
    } finally {
      this.isAnimating = false;
      // Process next animation after a small delay
      setTimeout(() => this.processQueue(), 50);
    }
  }

  cancelAll() {
    this.animationQueue.length = 0;
    this.isAnimating = false;
    if (this.currentAnimation) {
      cancelAnimationFrame(this.currentAnimation);
      this.currentAnimation = null;
    }
  }
}

/* ========== EVENT DURABILITY MANAGER ========== */
class EventDurabilityManager {
  constructor() {
    this.cycleCount = 0;
    this.lastGCTime = Date.now();
    this.memoryThreshold = 100 * 1024 * 1024; // 100MB threshold
    this.gcInterval = 30000; // Force cleanup every 30 seconds
    this.performanceMetrics = {
      averageRenderTime: 0,
      maxRenderTime: 0,
      errorCount: 0,
      lastErrors: []
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Monitor memory usage and performance
    setInterval(() => {
      this.checkMemoryUsage();
      this.performMaintenance();
    }, this.gcInterval);

    // Monitor for potential memory leaks
    if ('performance' in window && 'memory' in performance) {
      setInterval(() => {
        const memInfo = performance.memory;
        if (memInfo.usedJSHeapSize > this.memoryThreshold) {
          console.warn('[Durability] High memory usage detected:', memInfo);
          this.forceCleanup();
        }
      }, 10000);
    }
  }

  incrementCycle() {
    this.cycleCount++;
    console.log(`[Durability] Cycle ${this.cycleCount} completed`);
    
    // Force cleanup every 50 cycles
    if (this.cycleCount % 50 === 0) {
      console.log('[Durability] Performing deep cleanup after 50 cycles');
      this.deepCleanup();
    }
  }

  checkMemoryUsage() {
    try {
      if ('performance' in window && 'memory' in performance) {
        const memInfo = performance.memory;
        const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(memInfo.totalJSHeapSize / 1024 / 1024);
        
        if (usedMB > 80) { // 80MB threshold
          console.warn(`[Durability] Memory usage: ${usedMB}MB / ${totalMB}MB`);
          this.forceCleanup();
        }
      }
    } catch (error) {
      console.error('[Durability] Memory check failed:', error);
    }
  }

  performMaintenance() {
    try {
      // Clean up old data cache entries
      this.cleanupDataCache();
      
      // Clean up orphaned DOM elements
      this.cleanupDOMElements();
      
      // Reset Chart.js instances to prevent memory leaks
      this.resetChartInstances();
      
      // Clear old timers and animations
      this.cleanupTimersAndAnimations();
      
    } catch (error) {
      console.error('[Durability] Maintenance failed:', error);
    }
  }

  cleanupDataCache() {
    // Keep only essential data, clear old cache entries
    const essentialKeys = ['seoul_BS', 'seoul_BP'];
    const cache = app.data.cache;
    
    for (const key in cache) {
      if (!essentialKeys.includes(key)) {
        delete cache[key];
      }
    }
  }

  cleanupDOMElements() {
    // Remove orphaned tooltip elements
    const tooltips = document.querySelectorAll('#custom-chart-tooltip');
    tooltips.forEach(tooltip => {
      if (!document.body.contains(tooltip.parentNode)) {
        tooltip.remove();
      }
    });

    // Clean up any leaked canvas contexts
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (canvas.id !== 'visualization-canvas' && canvas.id !== 'lineChart') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
  }

  resetChartInstances() {
    // Safely destroy and recreate chart instances
    if (window.lineChart && typeof window.lineChart.destroy === 'function') {
      try {
        window.lineChart.destroy();
        window.lineChart = null;
      } catch (error) {
        console.warn('[Durability] Chart cleanup warning:', error);
        window.lineChart = null;
      }
    }
  }

  cleanupTimersAndAnimations() {
    // Ensure all timers and animations are properly cleaned
    if (app.cleanup) {
      // Clear old timers
      for (const timerId of app.cleanup.timers) {
        try {
          clearTimeout(timerId);
          clearInterval(timerId);
        } catch (e) {}
      }
      
      // Clear old animations
      for (const animationId of app.cleanup.animations) {
        try {
          cancelAnimationFrame(animationId);
        } catch (e) {}
      }
      
      // Reset cleanup arrays
      app.cleanup.timers.clear();
      app.cleanup.animations.clear();
    }
  }

  forceCleanup() {
    console.log('[Durability] Forcing aggressive cleanup');
    
    // Stop all current activities
    stopPulseLoop();
    clearAllTimersAndAnimations();
    
    // Clean up managers
    this.performMaintenance();
    
    // Force garbage collection if available
    if (window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {}
    }
    
    this.lastGCTime = Date.now();
  }

  deepCleanup() {
    console.log('[Durability] Performing deep cleanup');
    
    // Reset application state
    app.state.animationInProgress = false;
    app.state.isHighlightMode = false;
    app.landing.active = false;
    
    // Clear media cache periodically
    if (mediaCache && typeof mediaCache.cleanup === 'function') {
      mediaCache.cleanup();
    }
    
    // Reset canvas
    const canvas = app.elements.canvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      }
    }
    
    // Force aggressive cleanup
    this.forceCleanup();
  }

  logError(error, context = '') {
    this.performanceMetrics.errorCount++;
    this.performanceMetrics.lastErrors.push({
      error: error.message,
      context,
      timestamp: Date.now()
    });
    
    // Keep only last 10 errors
    if (this.performanceMetrics.lastErrors.length > 10) {
      this.performanceMetrics.lastErrors.shift();
    }
    
    console.error(`[Durability] Error in ${context}:`, error);
  }

  getHealthReport() {
    return {
      cycleCount: this.cycleCount,
      errorCount: this.performanceMetrics.errorCount,
      lastErrors: this.performanceMetrics.lastErrors,
      memoryUsage: ('performance' in window && 'memory' in performance) 
        ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB'
        : 'Unknown',
      uptime: Math.round((Date.now() - this.lastGCTime) / 1000) + 's since last cleanup'
    };
  }
}

/* ========== UNIFIED MANAGERS ========== */

// Unified Color Management
class ColorManager {
  constructor() {
    this.colorScale = d3.scaleLinear().domain([0, 1]).range(["#151D07", "#92C043"]).clamp(true);
  }

  getColor(d, state = {}) {
    const { isHighlightMode = false, pulseActive = false, pulseIntensity = 0 } = state;
    
    if (!isHighlightMode) {
      return this.colorScale(d.biophilia_norm);
    }
    
    const highlighted = this.isHighlighted(d);
    
    if (!pulseActive || !highlighted) {
      return highlighted ? HIGHLIGHT_COLOR : NON_HIGHLIGHT_GRAY;
    }
    
    return this.interpolateColor(HIGHLIGHT_COLOR, NON_HIGHLIGHT_GRAY, pulseIntensity);
  }

  isHighlighted(d) {
    const v = d.biophilia_norm;
    const lo = window.HIGHLIGHT_MIN ?? 0.70;
    const hi = window.HIGHLIGHT_MAX ?? 0.75;

    return v >= lo && v <= hi;
  }

  interpolateColor(color1, color2, t) {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
}

// Unified BP Value Management
class BPManager {
  constructor() {
    this.currentValue = 0;
    this.normalizedValue = 0;
    this.elements = {};
  }

  // Add normalization method
  normalizeBPValue(rawBP) {
      const normalized = 0.1 + (rawBP - 0.25) * (0.8 - 0.1) / (0.35 - 0.25);
      return Math.max(0, Math.min(1, normalized)); // Clamp between 0 and 1
  }

  setValue(bp) {
    const rawValue = Number(bp) || 0;
    const normalizedValue = this.normalizeBPValue(rawValue);

    // Store both values
    this.currentValue = rawValue;
    this.normalizedValue = normalizedValue;
    
    const EPS = 0.03;
    
    // Use normalized value for app state and highlighting
    app.state.bpValue = normalizedValue;
    app.state.highlightMin = Math.max(0, normalizedValue - EPS);
    app.state.highlightMax = Math.min(1, normalizedValue + EPS);
    window.HIGHLIGHT_MIN = app.state.highlightMin;
    window.HIGHLIGHT_MAX = app.state.highlightMax;
    
    // Store normalized value globally for other components
    window.ACTUAL_BP_VALUE = normalizedValue;
    
    // Update DOM
    this.updateDOM();
    
    // Trigger repaints
    this.refreshVisualization();
  }

  updateDOM() {
    // Always get fresh element reference
    const bpElement = document.getElementById('bpValueNumber');
    
    if (bpElement) {
      bpElement.textContent = this.normalizedValue.toFixed(2);
    } else {
      console.warn('[BPManager.updateDOM] #bpValueNumber element not found');
      
      // Fallback: try again after a short delay
      setTimeout(() => {
        const retryElement = document.getElementById('bpValueNumber');
        if (retryElement) {
          retryElement.textContent = this.normalizedValue.toFixed(2);
          console.log(`[BPManager.updateDOM] Retry successful: ${this.normalizedValue.toFixed(2)}`);
        }
      }, 100);
    }
  }

  refreshVisualization() {
    // Ensure highlight samples are recalculated when BP value changes
    if (app.mode === Modes.RESULT && app.state.isHighlightMode) {
      ensureHighlightHasSamples();
    }
    
    safeExecute('refreshDotLayer');
    safeExecute('updateLegend');
    safeExecute('updateCenterViz');
  }
}

// Unified Icon Management
class IconManager {
  constructor() {
    this.cache = new Map();
    this.categoryLabels = {
      sky: "Sky", tree: "Tree", grass: "Grass", person: "Person",
      ground: "Earth/Ground", mountain: "Mountain", plant: "Plant/Flora",
      water: "Water", sea: "Sea", field: "Field", rock: "Rock/Stone",
      sand: "Sand", fireplace: "Fireplace", river: "River", flower: "Flower",
      hill: "Hill", palm: "Palmtree", light: "Light/Sunlight",
      land: "Land/Soil", fountain: "Fountain", swimming: "Swimming Pool",
      waterfall: "Waterfall", food: "Natural Food", animal: "Animal/Fauna",
      lake: "Lake"
    };
  }

  normalizeKey(s) {
    if (!s) return "";
    const raw = String(s).toLowerCase().replace(/[^a-z]/g, "");
    const alias = { plantflora: "plant", earthground: "ground", naturalfood: "food", palmtree: "palm" };
    return alias[raw] || raw;
  }

  labelFromKey(k) {
    return this.categoryLabels[k] || k;
  }

  getPaths(key) {
    const normalized = this.normalizeKey(key);
    
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }
    
    const cleanKey = String(normalized).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g,'');
    const base = `img/classes/${cleanKey}`;
    const paths = [`${base}.png`, `${base}.webp`];
    
    this.cache.set(normalized, paths);
    return paths;
  }

  loadWithFallback(img, key, onError) {
    const paths = this.getPaths(key);
    let index = 0;
    
    img.onerror = () => {
      index++;
      if (index < paths.length) {
        img.src = paths[index];
      } else {
        img.onerror = null;
        onError();
      }
    };
    
    img.src = paths[0];
  }
}

// Unified Dashboard Management
class DashboardManager {
  constructor() {
    this.elements = {};
  }

  cacheElements() {
    this.elements = {
      bpNumber: document.getElementById('bpValueNumber'),
      topCategoryText: document.getElementById('topCategoryText'),
      topElements: document.getElementById('topElements'),
      barChart: document.getElementById('barChart'),
      barLabels: document.getElementById('barLabels'),
      lineChart: document.getElementById('lineChart')
    };
  }

  updateAll(data) {
    if (!data) return;
    
    this.cacheElements();
    
    const bpValue = Number(data.bp) || 0;
    bpManager.setValue(bpValue);
    
    // Helper function to filter out "sky" category and ensure exactly 3 items
    const filterOutSkyAndEnsureThree = (items, intensities) => {
      let candidates = [];
      
      // If we have intensity_top array, use it first
      if (Array.isArray(items) && items.length) {
        candidates = items.filter(item => {
          const normalized = iconManager.normalizeKey(item);
          return normalized !== 'sky';
        });
      }
      
      // If we don't have enough non-sky items, supplement from intensities
      if (candidates.length < 3 && intensities) {
        const sortedIntensities = Object.entries(intensities)
          .filter(([key, value]) => {
            const normalized = iconManager.normalizeKey(key);
            return normalized !== 'sky' && Number(value) > 0;
          })
          .sort((a, b) => b[1] - a[1]) // Sort by value descending
          .map(([key]) => key);
        
        // Add missing items from sorted intensities
        for (const key of sortedIntensities) {
          if (candidates.length >= 3) break;
          const normalized = iconManager.normalizeKey(key);
          const alreadyIncluded = candidates.some(existing => 
            iconManager.normalizeKey(existing) === normalized
          );
          if (!alreadyIncluded) {
            candidates.push(key);
          }
        }
      }
      
      // Always return exactly 3 items (or as many as available)
      return candidates.slice(0, 3);
    };
    
    // Get top 3 non-sky items for icons and text
    const top3 = filterOutSkyAndEnsureThree(data.intensity_top, data.intensities);
    
    this.updateTopElements(top3);
    
    // Bar chart: filter sky + keep original value > 0 logic
    const top10 = Object.entries(data.intensities || {})
      .map(([k, v]) => ({ name: k, value: Number(v) || 0 }))
      .filter(d => {
        // Apply both filters: remove sky AND keep only value > 0
        const normalized = iconManager.normalizeKey(d.name);
        return normalized !== 'sky' && d.value > 0;
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);  // Take up to 10 qualifying items
    
    this.updateBarChart(top10);
    
    // Use normalized BP value for distribution chart
    this.updateDistributionChart(bpManager.normalizedValue, data.distribution);
  }

  updateTopElements(top3Names) {
    const keys = (top3Names || []).map(iconManager.normalizeKey.bind(iconManager)).filter(Boolean);

    if (this.elements.topCategoryText) {
      this.elements.topCategoryText.textContent = keys.map(iconManager.labelFromKey.bind(iconManager)).join(', ');
    }

    if (!this.elements.topElements) return;
    this.elements.topElements.innerHTML = '';

    keys.forEach((key) => {
      if (!iconManager.categoryLabels[key]) return;

      const card = document.createElement('div');
      card.className = 'top-element';

      const img = document.createElement('img');
      img.alt = iconManager.labelFromKey(key);
      img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';

      iconManager.loadWithFallback(img, key, () => card.remove());

      card.appendChild(img);
      this.elements.topElements.appendChild(card);
    });
  }

  updateBarChart(intensityData) {
    if (!this.elements.barChart || !this.elements.barLabels) return;

    this.elements.barChart.innerHTML = '';
    this.elements.barLabels.innerHTML = '';

    const maxHeight = 80;
    const shortNames = {
      'plant/flora': 'plant', 'animal/fauna': 'animal', 'living Being': 'living',
      'greenscape': 'green', 'waterscape': 'water', 'landscape': 'land',
      'waterfall': 'fall', 'palm Tree': 'palmtree', 'palmTree': 'palmtree',
      'river': 'river', 'lake': 'lake', 'mountain': 'mount',
      'swimming': 'pool', 'fireplace': 'fire'
    };

    const shorten = (s) => {
      if (shortNames[s]) return shortNames[s];
      const clean = String(s).replace(/_/g, ' ');
      return clean.length > 12 ? clean.slice(0, 12).trim() : clean;
    };

    intensityData.forEach(item => {
      const v = Math.max(0, Math.min(1, item.value));
      const h = v * maxHeight;

      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = `${h}px`;
      bar.style.pointerEvents = 'none';
      this.elements.barChart.appendChild(bar);

      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = shorten(item.name);
      label.title = item.name;
      label.style.pointerEvents = 'none';
      this.elements.barLabels.appendChild(label);
    });
  }

  updateDistributionChart(userBpValue, distribution) {
    const lineCanvas = this.elements.lineChart;
    if (!lineCanvas || !document.body.contains(lineCanvas)) return;

    const lineCtx = lineCanvas.getContext('2d');
    if (!lineCtx) return;

    let labels = [];
    let histogram = [];
    
    if (distribution && Array.isArray(distribution)) {
      labels = distribution.map(d => Number(d.bin).toFixed(1));
      histogram = distribution.map(d => Number(d.count) || 0);
    } else {
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

    if (window.lineChart && typeof window.lineChart.destroy === 'function') {
      try { window.lineChart.destroy(); } catch (e) {}
      window.lineChart = null;
    }

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
          interaction: { intersect: false, mode: 'none' },
          onHover: null,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
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
}

/* ========== INITIALIZE MANAGERS ========== */
const mediaCache = new MediaCacheManager();
const animationManager = new AnimationManager();
const durabilityManager = new EventDurabilityManager();
const colorManager = new ColorManager();
const bpManager = new BPManager();
const iconManager = new IconManager();
const dashboardManager = new DashboardManager();

/* ========== UTILITY FUNCTIONS ========== */
function safeExecute(fnName, ...args) {
  try {
    if (typeof window[fnName] === 'function') {
      return window[fnName](...args);
    }
  } catch (error) {
    // Silent fail for UI updates
  }
  return null;
}

function safeBatch(fnNames) {
  fnNames.forEach(fn => safeExecute(fn));
}

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
    animationInProgress: false,
    bpValue: 0,
    highlightMin: 0.70,
    highlightMax: 0.75
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
  effects: {
    pulse: { active: false, raf: null, t0: 0, last: 0, period: PULSE_BASE_PERIOD }
  },
  initialized: false,
  _initializing: false,
  _resizeListenerAdded: false
};

// Unified BP setter for external use
window.setUserBp = function(bp) {
  bpManager.setValue(bp);
};

/* ========== PULSE ENGINE ========== */
function startPulseLoop() {
  const pe = app.effects.pulse;
  if (pe.raf) return;
  pe.active = true;
  pe.t0 = performance.now();
  pe.last = pe.t0;
  pe.period = PULSE_BASE_PERIOD;

  const tick = () => {
    if (!pe.active) { pe.raf = null; return; }
    const now = performance.now();
    if (now - pe.last > 42) {
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

  // Use normalized BP value consistently
  const currentBpValue = bpManager.normalizedValue || app.state.bpValue || window.ACTUAL_BP_VALUE || 0;
  
  if (!data.length || !Number.isFinite(currentBpValue)) return;

  let lo = app.state.highlightMin;
  let hi = app.state.highlightMax;
  let widen = 0;
  const countInBand = () => data.reduce((a, d) => a + (d.biophilia_norm >= lo && d.biophilia_norm <= hi ? 1 : 0), 0);

  let count = countInBand();
  while (count < minCount && widen < 0.05) {
    widen += 0.005;
    // Use the normalized BP value for range calculation
    lo = Math.max(0, currentBpValue - (0.01 + widen));
    hi = Math.min(1, currentBpValue + (0.01 + widen));
    count = countInBand();
  }
  
  // Update both global and app state with normalized values
  window.HIGHLIGHT_MIN = lo;
  window.HIGHLIGHT_MAX = hi;
  app.state.highlightMin = lo;
  app.state.highlightMax = hi;
}

/* ========== TOOLTIP CLEANUP ========== */
function removeAllCustomTooltips() {
  const existingTooltips = document.querySelectorAll('#custom-chart-tooltip');
  existingTooltips.forEach(tooltip => tooltip.remove());

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

async function loadDashboardData() {
  try {
    const url = `${window.APP_CONFIG?.RUNTIME_BASE_URL || window.RUNTIME_BASE}/current.json`;
    const data = await fetchJSONNoCache(url);
    
    const normalized = {
      bp: +(data?.bp || data?.BP || 0),
      intensities: data?.intensities || data?.classes || {},
      intensity_top: data?.intensity_top || data?.top || [],
      distribution: data?.distribution || null,
      meta: data?.meta || {}
    };

    app.data.dashboardData = normalized;
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
    const el = document.getElementById('map');
    if (!el) {
      setTimeout(initializeMapbox, 50);
      return;
    }

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

      if (app.mode === Modes.RESULT) {
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

  stopPulseLoop();
  removeAllCustomTooltips();

  const video = document.getElementById('landingVideo');
  if (video) video.pause();

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

function ensureLandingText() {
  let line1 = document.getElementById('landing-line1');
  let line2 = document.getElementById('landing-line2');
  
  if (!line1) {
    line1 = document.createElement('div');
    line1.id = 'landing-line1';
    line1.className = 'landing-line1';
    document.body.appendChild(line1);
  }
  
  if (!line2) {
    const wrapper = document.querySelector('.center-column .visualization-wrapper')
                 || document.querySelector('.center-column')
                 || document.querySelector('#map')?.parentElement;
    if (wrapper) {
      line2 = document.createElement('div');
      line2.id = 'landing-line2';
      line2.className = 'landing-line2';
      wrapper.parentNode.insertBefore(line2, wrapper.nextSibling);
    }
  }
  
  return { line1, line2 };
}

function showHeaderLogos(showBoth = false) {
  const logos = document.getElementById('headerLogos');
  const leftLogo = document.querySelector('.header-logo:first-child');
  const rightLogo = document.querySelector('.header-logo:last-child');
  
  if (logos) {
    logos.style.display = 'flex';
  }
  
  if (rightLogo) {
    rightLogo.style.display = 'block';
  }
  
  if (leftLogo) {
    leftLogo.style.display = showBoth ? 'block' : 'none';
  }
}

function hideHeaderLogos() {
  const logos = document.getElementById('headerLogos');
  if (logos) {
    logos.style.display = 'none';
  }
}

function updateLandingTexts(line1Text, line2Text = '', showLine2 = true) {
  const texts = ensureLandingText();
  
  if (texts.line1) {
    texts.line1.textContent = line1Text;
    texts.line1.style.display = line1Text ? 'block' : 'none';
    
    if (line1Text === 'Feeling Nature Seoul') {
      texts.line1.classList.add('feeling-nature');
    } else {
      texts.line1.classList.remove('feeling-nature');
    }
  }
  
  if (texts.line2) {
    texts.line2.textContent = line2Text;
    texts.line2.style.display = (showLine2 && line2Text) ? 'block' : 'none';
  }
}

function removeLandingText() {
  const line1 = document.getElementById('landing-line1');
  const line2 = document.getElementById('landing-line2');
  
  if (line1) line1.remove();
  if (line2) line2.remove();
}

function showDashboardLayout() {
  removeLandingText();
  hideHeaderLogos();
  hideAllMedia();
  
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