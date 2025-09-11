
/* =========================================================================
   TV1 Dashboard App (clean build)
   - Fetches runtime JSON with cache-busting
   - Updates: BP number, top 3 icons/text, bar chart, distribution chart
   - Exposes hooks used by tv-1 kiosk adapter (script.js):
       setMode(mode), updateTopElements(arr), updateBarChart(_), updateDistributionChart(bp)
   - Defensive against missing DOM & double inits (fixes Chart.js ownerDocument error)
   ========================================================================== */

   (function () {
    'use strict';
  
    // --------------- Config ---------------
    const RUNTIME_BASE = 'https://feeling-nature-seoul-survey-2025.s3.us-east-2.amazonaws.com/public/runtime/';
    const CURRENT_URL  = RUNTIME_BASE + 'current.json';
    const STATE_URL    = RUNTIME_BASE + 'state.json';
  
    // --------------- App singleton ---------------
    const app = {
      els: {},
      charts: {
        dist: null,   // Chart.js instance for line chart (distribution)
        bars: null    // Chart.js instance for bar chart (top intensities)
      },
      mode: 'landing',
      data: {
        bp: 0.5,
        intensities: {},
        intensity_top: [],
        distribution: []
      }
    };
    window.app = app; // for debugging
  
    document.addEventListener('DOMContentLoaded', () => {
      cacheDom();
      wireDevButtons();
      // Leave the rest to tv-1 adapter which calls setMode() based on state.json
    });
  
    // --------------- DOM helpers ---------------
    function $(sel) { return document.querySelector(sel); }
    function cacheDom() {
      app.els.bpNumber = $('#bpValueNumber');     // big number (left bottom)
      app.els.topIcons = $('#topElements');       // 3 icon slots container
      app.els.topText  = $('#topCategoryText');   // text like "Sky, Tree, Plant/Flora"
      app.els.barCanvas = $('#barChart');         // bars
      app.els.lineCanvas = $('#lineChart');       // distribution
      app.els.dashboard = document.body;          // whole page (we don't toggle hidden pages here)
  
      // Create icon slots if not present
      if (app.els.topIcons && app.els.topIcons.children.length < 3) {
        app.els.topIcons.innerHTML = `
          <div class="top-icon" data-slot="0"><img alt="" /><div class="label"></div></div>
          <div class="top-icon" data-slot="1"><img alt="" /><div class="label"></div></div>
          <div class="top-icon" data-slot="2"><img alt="" /><div class="label"></div></div>
        `;
      }
    }
  
    function wireDevButtons() {
      const landingBtn = document.getElementById('btnLanding');
      const resultBtn  = document.getElementById('btnResult');
      if (landingBtn) landingBtn.addEventListener('click', () => setMode('landing'));
      if (resultBtn)  resultBtn.addEventListener('click',  () => setMode('result'));
    }
  
    // --------------- Fetch helpers (no-cache) ---------------
    async function fetchJSONNoCache(url) {
      const u = new URL(url);
      u.searchParams.set('_', Date.now().toString());
      const res = await fetch(u.toString(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
      return res.json();
    }
  
    async function loadFreshCurrentWithRetry(maxTries = 3) {
      let lastErr = null;
      for (let i = 0; i < maxTries; i++) {
        try { return await fetchJSONNoCache(CURRENT_URL); }
        catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
      }
      throw lastErr || new Error('failed to load current.json');
    }
  
    // --------------- Public API for tv-1 adapter ---------------
    window.setMode = function setMode(mode) {
      if (mode !== 'landing' && mode !== 'result') return;
      app.mode = mode;
  
      // Destroy charts when leaving result to avoid Chart.js resize on hidden canvases
      if (mode === 'landing') {
        destroyChart('dist'); destroyChart('bars');
      }
      // Keep existing animations on your map; only update when result arrives
    };
  
    // Update only top 3 elements (icons + labels). Safe to call before charts exist.
    window.updateTopElements = function updateTopElements(topArr) {
      const names = normalizeTopList(topArr || app.data.intensity_top);
      app.data.intensity_top = names;
  
      // Update text
      if (app.els.topText) {
        app.els.topText.textContent = names.length ? names.join(', ') : '';
      }
  
      // Update icons+labels
      if (!app.els.topIcons) return;
      const slots = app.els.topIcons.querySelectorAll('.top-icon');
      const mapIcon = iconForLabel;
      for (let i = 0; i < 3; i++) {
        const slot = slots[i];
        if (!slot) continue;
        const name = names[i] || '';
        const img = slot.querySelector('img');
        const lab = slot.querySelector('.label');
        if (name) {
          if (img) { img.src = mapIcon(name); img.alt = name; img.style.opacity = '1'; }
          if (lab) { lab.textContent = name; lab.style.opacity = '1'; }
        } else {
          if (img) { img.src = ''; img.alt = ''; img.style.opacity = '0.35'; }
          if (lab) { lab.textContent = ''; lab.style.opacity = '0.35'; }
        }
      }
    };
  
    // Update the bar chart from intensities; call with optional newest intensities
    window.updateBarChart = function updateBarChart(intensities) {
      if (intensities) app.data.intensities = intensities;
      if (!app.els.barCanvas || !isElementReady(app.els.barCanvas)) return;
  
      const labelsAndVals = topTenFromIntensities(app.data.intensities);
      const labels = labelsAndVals.map(d => d.label);
      const values = labelsAndVals.map(d => d.value);
  
      // (Re)build
      rebuildChartWhenReady('bars', app.els.barCanvas, () => ({
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Top categories',
            data: values,
            borderWidth: 0,
            backgroundColor: values.map(() => 'rgba(177, 232, 110, 0.85)')
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 800 },
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9aa09a' } },
            y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#9aa09a' } }
          }
        }
      }));
    };
  
    // Update the distribution line chart & BP number
    window.updateDistributionChart = function updateDistributionChart(userBpValue) {
      if (typeof userBpValue === 'number' && !Number.isNaN(userBpValue)) app.data.bp = userBpValue;
  
      // BP big number
      if (app.els.bpNumber) app.els.bpNumber.textContent = app.data.bp.toFixed(2);
  
      if (!app.data.distribution || !app.data.distribution.length) return;
      if (!app.els.lineCanvas || !isElementReady(app.els.lineCanvas)) return;
  
      const bins = app.data.distribution.map(d => (typeof d.bin === 'number' ? d.bin : Number(d.bin) || 0));
      const counts = app.data.distribution.map(d => Number(d.count) || 0);
      const maxCount = Math.max(1, ...counts);
      const pct = counts.map(c => (c / maxCount) * 100);
  
      // (Re)build
      rebuildChartWhenReady('dist', app.els.lineCanvas, () => ({
        type: 'line',
        data: {
          labels: bins.map(v => String(v.toFixed(1))),
          datasets: [{
            label: 'All Participants',
            data: pct,
            borderColor: '#666666',
            backgroundColor: 'rgba(102,102,102,0.12)',
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'none' },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 800 },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#9aa09a',
                callback: (value, idx, ticks) => {
                  if (idx === 0) return '0';
                  if (idx === ticks.length - 1) return '1';
                  if (idx === Math.floor(ticks.length / 2)) return '0.5';
                  return '';
                }
              }
            },
            y: { display: false }
          }
        }
      }));
  
      // Also update the center visualization if the host app exposes a hook
      try {
        if (typeof window.updateBPVisualization === 'function') {
          window.updateBPVisualization(app.data.bp);
        } else if (typeof window.updateRadialBP === 'function') {
          window.updateRadialBP(app.data.bp);
        } else if (typeof window.setBiPValue === 'function') {
          window.setBiPValue(app.data.bp);
        }
      } catch (e) {
        console.warn('Center viz hook failed:', e);
      }
    };
  
    // Convenience called by tv-1 adapter when state becomes "show_result"
    window.tv1ApplyResults = async function tv1ApplyResults() {
      try {
        const cur = await loadFreshCurrentWithRetry(3);
        const bp   = Number(cur.bp) || 0;
        const tops = normalizeTopList(cur.intensity_top || cur.top || []);
        const intensities = cur.intensities || {};
        app.data = {
          bp, intensities, intensity_top: tops,
          distribution: Array.isArray(cur.distribution) ? cur.distribution : []
        };
  
        // Order matters for visuals:
        updateTopElements(tops);
        updateBarChart(intensities);
        updateDistributionChart(bp);
      } catch (e) {
        console.error('tv1ApplyResults failed:', e);
      }
    };
  
    // --------------- Utilities ---------------
    function isElementReady(el) {
      // must exist, be connected, and have a size
      return !!(el && el.isConnected && el.ownerDocument && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
  
    function rebuildChartWhenReady(key, canvasEl, buildConfigFn) {
      // Destroy if something exists
      destroyChart(key);
  
      // Wait next frame so Chart.js reads the true size (prevents ownerDocument errors)
      requestAnimationFrame(() => {
        if (!isElementReady(canvasEl)) return; // still not ready; skip quietly
        const ctx = canvasEl.getContext('2d');
        try {
          const cfg = buildConfigFn();
          app.charts[key] = new Chart(ctx, cfg);
        } catch (e) {
          console.error('Chart build failed:', e);
        }
      });
    }
  
    function destroyChart(key) {
      const ch = app.charts[key];
      if (ch && typeof ch.destroy === 'function') {
        try { ch.destroy(); } catch (_e) {}
      }
      app.charts[key] = null;
    }
  
    function normalizeTopList(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.filter(Boolean).map(String);
    }
  
    function iconForLabel(label) {
      // Map a category name to your existing topic icons under /assets/icons/
      const canon = (s) => s.toLowerCase().replace(/[^a-z]/g,'');
      const name = canon(label);
      const file =
        name.includes('sky') ? 'sky' :
        name.includes('tree') ? 'tree' :
        name.includes('grass') ? 'grass' :
        name.includes('plant') ? 'plant' :
        name.includes('water') ? 'water' :
        name.includes('sea') ? 'sea' :
        name.includes('person') ? 'person' :
        name.includes('ground') ? 'ground' :
        name.includes('mountain') ? 'mountain' :
        name.includes('animal') ? 'animal' :
        name.includes('flower') ? 'flower' :
        name.includes('rock') ? 'rock' :
        'default';
      return `/assets/icons/${file}.svg`;
    }
  
    function topTenFromIntensities(intensities) {
      const canon = (s) => s.toLowerCase().replace(/[^a-z]/g,'');
      const LABEL_MAP = {
        sky:'Sky', tree:'Tree', grass:'Grass', person:'Person', ground:'Earth/Ground',
        mountain:'Mountain', plant:'Plant/Flora', water:'Water', sea:'Sea', river:'River',
        lake:'Lake', waterfall:'Waterfall', swimming:'Swimming Pool', rock:'Rock/Stone',
        sand:'Sand', light:'Light/Sunlight', animal:'Animal/Fauna', flower:'Flower',
        palm:'Palmtree', naturalfood:'Natural Food', fountain:'Fountain',
        land:'Land/Soil', field:'Field', hill:'Hill', fireplace:'Fireplace', food:'Natural Food'
      };
  
      const items = [];
      for (const [k, vRaw] of Object.entries(intensities || {})) {
        const v = Number(vRaw);
        if (Number.isFinite(v)) {
          const key = canon(k);
          const label = LABEL_MAP[key] || k;
          items.push({ key, label, value: v });
        }
      }
      items.sort((a,b) => b.value - a.value);
      return items.slice(0, 10);
    }
  
  })();
  