'use client';

import { useEffect, useRef } from 'react';

// Animated population-density globe — a port of `BGSoftOrbs` from the
// Claude Design wireframe bundle (`backgrounds.jsx:271-809`). Renders
// to a single full-bleed <canvas>:
//   • LAND layer (240k uniform-area dots) — outlines all inhabited
//     landmasses in a neutral cool-grey-blue.
//   • REGION layer (60k population-weighted dots) — adds density on
//     top in stripe-palette tones (iris/magenta/orange/yellow).
//   • Highlight pulses — Spain/Portugal/Italy/Greece markers that
//     breathe on a 1.6 s cycle (StudentX market signal).
//
// Geometry: viewer sits BELOW the sphere; only the upper hemisphere
// is visible. Yaw rotates 0.08 rad/s, axial tilt -0.40 rad lifts the
// ~50°N band toward the apex so Europe sits near the top of the dome.
//
// Performance:
//   • Pixel-buffer pass for non-highlight particles (one getImageData
//     + putImageData per frame — far cheaper than 300k arc() calls).
//   • Highlight pass uses arc() for ~4 markers.
//   • Skips the loop when the tab is hidden.
//   • No prop API — drop in once at the hub root.
export default function HubBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let w = 0;
    let h = 0;
    let particles = [];
    const t0 = performance.now();

    // LAND — broad continental shapes for the uniform 300k base layer.
    // Sparse zones (deep Sahara, Siberian interior, Outback interior,
    // Amazon interior, Greenland interior) intentionally omitted so they
    // read as empty.
    const LAND = [
      // ── NORTH AMERICA ──
      { cx: 0.205, cy: 0.355, rx: 0.085, ry: 0.045 },
      { cx: 0.235, cy: 0.275, rx: 0.06, ry: 0.04 },
      { cx: 0.155, cy: 0.27, rx: 0.045, ry: 0.045 },
      { cx: 0.08, cy: 0.25, rx: 0.04, ry: 0.03 },
      { cx: 0.205, cy: 0.43, rx: 0.04, ry: 0.03 },
      { cx: 0.235, cy: 0.475, rx: 0.025, ry: 0.02 },
      { cx: 0.27, cy: 0.45, rx: 0.03, ry: 0.012 },

      // ── SOUTH AMERICA ──
      { cx: 0.33, cy: 0.595, rx: 0.055, ry: 0.06 },
      { cx: 0.315, cy: 0.69, rx: 0.03, ry: 0.045 },
      { cx: 0.295, cy: 0.68, rx: 0.01, ry: 0.06 },
      { cx: 0.29, cy: 0.585, rx: 0.025, ry: 0.04 },
      { cx: 0.295, cy: 0.51, rx: 0.03, ry: 0.025 },

      // ── EUROPE ──
      { cx: 0.475, cy: 0.275, rx: 0.018, ry: 0.03 },
      { cx: 0.52, cy: 0.23, rx: 0.03, ry: 0.04 },
      { cx: 0.51, cy: 0.31, rx: 0.04, ry: 0.03 },
      { cx: 0.555, cy: 0.305, rx: 0.035, ry: 0.03 },
      { cx: 0.475, cy: 0.35, rx: 0.025, ry: 0.025 },
      { cx: 0.515, cy: 0.345, rx: 0.012, ry: 0.03 },
      { cx: 0.545, cy: 0.345, rx: 0.025, ry: 0.022 },
      { cx: 0.545, cy: 0.37, rx: 0.018, ry: 0.018 },
      { cx: 0.58, cy: 0.365, rx: 0.03, ry: 0.02 },

      // ── AFRICA ──
      { cx: 0.53, cy: 0.53, rx: 0.08, ry: 0.15 },
      { cx: 0.605, cy: 0.51, rx: 0.025, ry: 0.03 },
      { cx: 0.555, cy: 0.7, rx: 0.02, ry: 0.02 },
      { cx: 0.61, cy: 0.64, rx: 0.008, ry: 0.025 },

      // ── MIDDLE EAST ──
      { cx: 0.595, cy: 0.395, rx: 0.025, ry: 0.025 },
      { cx: 0.61, cy: 0.45, rx: 0.03, ry: 0.03 },
      { cx: 0.635, cy: 0.395, rx: 0.03, ry: 0.025 },

      // ── CENTRAL ASIA / RUSSIA SOUTH ──
      { cx: 0.66, cy: 0.355, rx: 0.045, ry: 0.025 },
      { cx: 0.665, cy: 0.395, rx: 0.025, ry: 0.02 },

      // ── SOUTH ASIA ──
      { cx: 0.69, cy: 0.45, rx: 0.04, ry: 0.045 },
      { cx: 0.7, cy: 0.535, rx: 0.008, ry: 0.012 },

      // ── EAST ASIA ──
      { cx: 0.77, cy: 0.395, rx: 0.05, ry: 0.045 },
      { cx: 0.825, cy: 0.375, rx: 0.01, ry: 0.025 },
      { cx: 0.86, cy: 0.38, rx: 0.012, ry: 0.035 },
      { cx: 0.815, cy: 0.435, rx: 0.006, ry: 0.012 },

      // ── SOUTHEAST ASIA ──
      { cx: 0.76, cy: 0.475, rx: 0.025, ry: 0.04 },
      { cx: 0.77, cy: 0.52, rx: 0.015, ry: 0.012 },
      { cx: 0.825, cy: 0.49, rx: 0.014, ry: 0.03 },
      { cx: 0.76, cy: 0.54, rx: 0.02, ry: 0.018 },
      { cx: 0.795, cy: 0.56, rx: 0.025, ry: 0.008 },
      { cx: 0.795, cy: 0.53, rx: 0.02, ry: 0.02 },
      { cx: 0.815, cy: 0.545, rx: 0.018, ry: 0.015 },
      { cx: 0.86, cy: 0.58, rx: 0.025, ry: 0.02 },

      // ── OCEANIA ──
      { cx: 0.84, cy: 0.665, rx: 0.045, ry: 0.035 },
      { cx: 0.91, cy: 0.715, rx: 0.012, ry: 0.022 },
    ];

    // REGION density hotspots — population-weighted on top of LAND.
    const REGIONS = [
      // ── NORTH AMERICA ──
      { cx: 0.265, cy: 0.345, rx: 0.022, ry: 0.025, density: 1.4, color: '#ff5fa2' },
      { cx: 0.235, cy: 0.33, rx: 0.03, ry: 0.022, density: 0.9, color: '#ff5fa2' },
      { cx: 0.245, cy: 0.385, rx: 0.035, ry: 0.025, density: 0.8, color: '#ff5fa2' },
      { cx: 0.155, cy: 0.37, rx: 0.012, ry: 0.035, density: 1.0, color: '#ff5fa2' },
      { cx: 0.155, cy: 0.305, rx: 0.012, ry: 0.018, density: 0.55, color: '#ff5fa2' },
      { cx: 0.215, cy: 0.44, rx: 0.025, ry: 0.02, density: 1.1, color: '#ff5fa2' },
      { cx: 0.235, cy: 0.475, rx: 0.02, ry: 0.012, density: 0.6, color: '#ff5fa2' },
      { cx: 0.27, cy: 0.45, rx: 0.025, ry: 0.01, density: 0.5, color: '#ff5fa2' },

      // ── SOUTH AMERICA ──
      { cx: 0.33, cy: 0.625, rx: 0.025, ry: 0.025, density: 1.2, color: '#ff5fa2' },
      { cx: 0.345, cy: 0.56, rx: 0.02, ry: 0.03, density: 0.7, color: '#ff5fa2' },
      { cx: 0.29, cy: 0.52, rx: 0.018, ry: 0.025, density: 0.7, color: '#ff5fa2' },
      { cx: 0.29, cy: 0.605, rx: 0.012, ry: 0.03, density: 0.5, color: '#ff5fa2' },
      { cx: 0.32, cy: 0.7, rx: 0.02, ry: 0.03, density: 0.7, color: '#ff5fa2' },
      { cx: 0.295, cy: 0.7, rx: 0.006, ry: 0.04, density: 0.5, color: '#ff5fa2' },

      // ── EUROPE ──
      { cx: 0.49, cy: 0.3, rx: 0.03, ry: 0.022, density: 1.5, color: '#ff5fa2' },
      { cx: 0.52, cy: 0.31, rx: 0.025, ry: 0.02, density: 1.1, color: '#ff5fa2' },
      { cx: 0.56, cy: 0.295, rx: 0.03, ry: 0.025, density: 0.8, color: '#ff5fa2' },
      { cx: 0.515, cy: 0.235, rx: 0.025, ry: 0.03, density: 0.35, color: '#ff5fa2' },
      { cx: 0.555, cy: 0.355, rx: 0.03, ry: 0.018, density: 0.9, color: '#ff5fa2' },
      // StudentX markets — highlight pulse
      { cx: 0.485, cy: 0.345, rx: 0.014, ry: 0.022, density: 2.0, color: '#ffcb57', highlight: true },
      { cx: 0.47, cy: 0.345, rx: 0.008, ry: 0.018, density: 1.8, color: '#ff5fa2', highlight: true },
      { cx: 0.515, cy: 0.345, rx: 0.01, ry: 0.025, density: 2.0, color: '#ffcb57', highlight: true },
      { cx: 0.54, cy: 0.355, rx: 0.012, ry: 0.014, density: 2.0, color: '#ff5fa2', highlight: true },

      // ── AFRICA ──
      { cx: 0.56, cy: 0.43, rx: 0.008, ry: 0.045, density: 1.3, color: '#ffcb57' },
      { cx: 0.495, cy: 0.395, rx: 0.03, ry: 0.012, density: 0.7, color: '#ffcb57' },
      { cx: 0.515, cy: 0.51, rx: 0.03, ry: 0.02, density: 1.3, color: '#ffcb57' },
      { cx: 0.585, cy: 0.52, rx: 0.02, ry: 0.025, density: 0.9, color: '#ffcb57' },
      { cx: 0.585, cy: 0.575, rx: 0.018, ry: 0.025, density: 0.9, color: '#ffcb57' },
      { cx: 0.555, cy: 0.7, rx: 0.02, ry: 0.02, density: 0.6, color: '#ffcb57' },
      { cx: 0.61, cy: 0.64, rx: 0.008, ry: 0.022, density: 0.4, color: '#ffcb57' },

      // ── MIDDLE EAST ──
      { cx: 0.595, cy: 0.395, rx: 0.025, ry: 0.02, density: 0.9, color: '#ffcb57' },
      { cx: 0.62, cy: 0.43, rx: 0.022, ry: 0.025, density: 0.55, color: '#ffcb57' },
      { cx: 0.625, cy: 0.38, rx: 0.022, ry: 0.018, density: 0.8, color: '#ffcb57' },

      // ── SOUTH ASIA ──
      { cx: 0.66, cy: 0.42, rx: 0.02, ry: 0.025, density: 1.6, color: '#ff5fa2' },
      { cx: 0.685, cy: 0.43, rx: 0.03, ry: 0.018, density: 2.2, color: '#ff5fa2' },
      { cx: 0.715, cy: 0.45, rx: 0.018, ry: 0.014, density: 2.4, color: '#ff5fa2' },
      { cx: 0.685, cy: 0.49, rx: 0.022, ry: 0.03, density: 1.5, color: '#ff5fa2' },
      { cx: 0.695, cy: 0.535, rx: 0.008, ry: 0.012, density: 0.9, color: '#ff5fa2' },
      { cx: 0.7, cy: 0.42, rx: 0.012, ry: 0.008, density: 1.0, color: '#ff5fa2' },

      // ── EAST ASIA ──
      { cx: 0.785, cy: 0.395, rx: 0.025, ry: 0.04, density: 2.0, color: '#ff5fa2' },
      { cx: 0.755, cy: 0.405, rx: 0.022, ry: 0.02, density: 1.3, color: '#ff5fa2' },
      { cx: 0.825, cy: 0.37, rx: 0.01, ry: 0.022, density: 1.6, color: '#ff5fa2' },
      { cx: 0.86, cy: 0.38, rx: 0.012, ry: 0.03, density: 1.7, color: '#ff5fa2' },
      { cx: 0.815, cy: 0.435, rx: 0.006, ry: 0.012, density: 1.4, color: '#ff5fa2' },
      { cx: 0.76, cy: 0.33, rx: 0.03, ry: 0.018, density: 0.25, color: '#ff5fa2' },

      // ── SOUTHEAST ASIA ──
      { cx: 0.77, cy: 0.48, rx: 0.01, ry: 0.03, density: 1.3, color: '#ff5fa2' },
      { cx: 0.755, cy: 0.485, rx: 0.014, ry: 0.02, density: 1.0, color: '#ff5fa2' },
      { cx: 0.825, cy: 0.485, rx: 0.012, ry: 0.025, density: 1.2, color: '#ff5fa2' },
      { cx: 0.795, cy: 0.56, rx: 0.025, ry: 0.008, density: 2.0, color: '#ff5fa2' },
      { cx: 0.76, cy: 0.54, rx: 0.018, ry: 0.018, density: 0.7, color: '#ff5fa2' },
      { cx: 0.77, cy: 0.52, rx: 0.012, ry: 0.012, density: 0.9, color: '#ff5fa2' },

      // ── OCEANIA ──
      { cx: 0.87, cy: 0.665, rx: 0.012, ry: 0.03, density: 0.9, color: '#ffcb57' },
      { cx: 0.815, cy: 0.66, rx: 0.008, ry: 0.014, density: 0.4, color: '#ffcb57' },
      { cx: 0.91, cy: 0.715, rx: 0.008, ry: 0.018, density: 0.5, color: '#ffcb57' },
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      particles = [];
      const totalBudget = Math.min(300000, Math.floor((w * h) / 10));
      const landBudget = Math.floor(totalBudget * 0.8);
      const regionBudget = totalBudget - landBudget;

      // For UNIFORM AREA density on the SPHERE (not the equirectangular
      // plane), accept each candidate sample with probability cos(lat).
      // Without this correction, samples at high latitudes (where equirect
      // compresses the globe) project onto a smaller sphere area →
      // over-dense bands. Oversample by 1/avg(cos(lat)) to compensate.
      const seedEllipse = (region, N, inwardBias, color, highlight, rRange, small) => {
        const hex = (color || '#9ca3af').replace('#', '');
        const cR = parseInt(hex.slice(0, 2), 16);
        const cG = parseInt(hex.slice(2, 4), 16);
        const cB = parseInt(hex.slice(4, 6), 16);
        const cyMin = region.cy - region.ry;
        const cyMax = region.cy + region.ry;
        const latTop = (0.5 - cyMin) * Math.PI;
        const latBot = (0.5 - cyMax) * Math.PI;
        const avgCos = 0.5 * (Math.cos(latTop) + Math.cos(latBot));
        const oversample = Math.max(1, Math.ceil(1 / Math.max(0.05, avgCos)));
        let placed = 0;
        let attempts = 0;
        const maxAttempts = N * oversample * 3;
        while (placed < N && attempts < maxAttempts) {
          attempts++;
          const a = Math.random() * Math.PI * 2;
          const u = Math.pow(Math.random(), inwardBias);
          const nx = region.cx + Math.cos(a) * region.rx * u;
          const ny = region.cy + Math.sin(a) * region.ry * u;
          const jitter = 0.014;
          const nxJ = nx + (Math.random() - 0.5) * jitter;
          const nyJ = ny + (Math.random() - 0.5) * jitter;
          const lon = (nxJ - 0.5) * Math.PI * 2;
          const lat = (0.5 - nyJ) * Math.PI;
          const cosLat = Math.cos(lat);
          if (Math.random() > cosLat) continue;
          placed++;
          particles.push({
            cosLat,
            sinLat: Math.sin(lat),
            lon,
            cR,
            cG,
            cB,
            color,
            highlight: !!highlight,
            small: !!small,
            r: highlight ? (rRange[0] + Math.random() * rRange[1]) * 0.7 : 0,
            phase: Math.random() * Math.PI * 2,
          });
        }
      };

      const totalLandArea = LAND.reduce((s, r) => s + r.rx * r.ry, 0);
      LAND.forEach((region) => {
        const share = (region.rx * region.ry) / totalLandArea;
        const N = Math.max(50, Math.floor(landBudget * share));
        seedEllipse(region, N, 0.5, '#f6f4ff', false, null, false);
      });

      const totalDensity = REGIONS.reduce((s, r) => s + r.density * r.rx * r.ry, 0);
      REGIONS.forEach((region) => {
        const share = (region.density * region.rx * region.ry) / totalDensity;
        const N = Math.max(40, Math.floor(regionBudget * share));
        seedEllipse(region, N, 0.6, region.color, region.highlight, [1.8, 1.4], true);
      });
    };

    const loop = (now) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        raf = requestAnimationFrame(loop);
        return;
      }
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Sphere geometry — viewer is BELOW; we see only the upper hemisphere.
      const cxS = w * 0.5;
      const R = Math.max(h * 0.95, w * 0.62);
      const cyS = h + R * 0.18;

      // Soft halo glow rising from below the horizon.
      const halo = ctx.createRadialGradient(cxS, cyS, R * 0.85, cxS, cyS, R * 1.05);
      halo.addColorStop(0, 'rgba(99,91,255,0.04)');
      halo.addColorStop(0.6, 'rgba(255,95,162,0.02)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Faint sphere body so the dome reads even in sparse zones (oceans).
      ctx.beginPath();
      ctx.arc(cxS, cyS, R, 0, Math.PI * 2);
      const sphere = ctx.createRadialGradient(cxS, cyS - R * 0.3, R * 0.1, cxS, cyS, R);
      sphere.addColorStop(0, 'rgba(255,255,255,0.0)');
      sphere.addColorStop(0.85, 'rgba(99,91,255,0.018)');
      sphere.addColorStop(1, 'rgba(99,91,255,0.075)');
      ctx.fillStyle = sphere;
      ctx.fill();

      // Yaw spins the globe; tilt brings the ~50°N band toward the apex.
      const yaw = t * 0.08;
      const tilt = -0.4;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      // ── Pixel-buffer pass: write all non-highlight particles to ImageData. ──
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dw = canvas.width;
      const dh = canvas.height;
      const img = ctx.getImageData(0, 0, dw, dh);
      const data = img.data;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.highlight) continue;
        const lonRcos = Math.cos(p.lon + yaw);
        const lonRsin = Math.sin(p.lon + yaw);
        const x3 = p.cosLat * lonRsin;
        const y3 = p.sinLat;
        const z3 = p.cosLat * lonRcos;
        const yT = y3 * cosT - z3 * sinT;
        const zT = y3 * sinT + z3 * cosT;
        if (zT < 0.015) continue;

        const sx = cxS + x3 * R;
        const sy = cyS - yT * R;
        if (sy > h + 4) continue;
        if (sx < -4 || sx > w + 4) continue;

        const px = (sx * dpr) | 0;
        const py = (sy * dpr) | 0;
        if (px < 0 || py < 0 || px >= dw || py >= dh) continue;

        const depth = zT;
        const alpha = (0.55 + 0.15 * Math.sin(t * 0.6 + p.phase)) * (0.35 + depth * 0.65);
        const a = alpha < 1 ? alpha : 1;

        const blend = (idx, mul) => {
          const A = a * mul;
          const inv = 1 - A;
          data[idx] = (p.cR * A + data[idx] * inv) | 0;
          data[idx + 1] = (p.cG * A + data[idx + 1] * inv) | 0;
          data[idx + 2] = (p.cB * A + data[idx + 2] * inv) | 0;
          data[idx + 3] = 255;
        };
        const idx = (py * dw + px) * 4;
        blend(idx, 1.0);
        if (!p.small) {
          // 3×3 inner core + 5×5 outer ring soft-fade for LAND chunky dots.
          if (px + 1 < dw) blend(idx + 4, 1.0);
          if (px - 1 >= 0) blend(idx - 4, 1.0);
          if (py + 1 < dh) blend(idx + dw * 4, 1.0);
          if (py - 1 >= 0) blend(idx - dw * 4, 1.0);
          if (px + 1 < dw && py + 1 < dh) blend(idx + dw * 4 + 4, 1.0);
          if (px - 1 >= 0 && py + 1 < dh) blend(idx + dw * 4 - 4, 1.0);
          if (px + 1 < dw && py - 1 >= 0) blend(idx - dw * 4 + 4, 1.0);
          if (px - 1 >= 0 && py - 1 >= 0) blend(idx - dw * 4 - 4, 1.0);
          if (px + 2 < dw) blend(idx + 8, 0.55);
          if (px - 2 >= 0) blend(idx - 8, 0.55);
          if (py + 2 < dh) blend(idx + dw * 8, 0.55);
          if (py - 2 >= 0) blend(idx - dw * 8, 0.55);
          if (px + 2 < dw && py + 2 < dh) blend(idx + dw * 8 + 8, 0.3);
          if (px - 2 >= 0 && py + 2 < dh) blend(idx + dw * 8 - 8, 0.3);
          if (px + 2 < dw && py - 2 >= 0) blend(idx - dw * 8 + 8, 0.3);
          if (px - 2 >= 0 && py - 2 >= 0) blend(idx - dw * 8 - 8, 0.3);
        } else {
          // REGION particles: 3×3 block at full alpha.
          if (px + 1 < dw) blend(idx + 4, 1.0);
          if (px - 1 >= 0) blend(idx - 4, 1.0);
          if (py + 1 < dh) blend(idx + dw * 4, 1.0);
          if (py - 1 >= 0) blend(idx - dw * 4, 1.0);
          if (px + 1 < dw && py + 1 < dh) blend(idx + dw * 4 + 4, 1.0);
          if (px - 1 >= 0 && py + 1 < dh) blend(idx + dw * 4 - 4, 1.0);
          if (px + 1 < dw && py - 1 >= 0) blend(idx - dw * 4 + 4, 1.0);
          if (px - 1 >= 0 && py - 1 >= 0) blend(idx - dw * 4 - 4, 1.0);
        }
      }

      ctx.putImageData(img, 0, 0);

      // ── Highlight pass: arc() draw for the few StudentX-market pulses. ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.highlight) continue;
        const lonRcos = Math.cos(p.lon + yaw);
        const lonRsin = Math.sin(p.lon + yaw);
        const x3 = p.cosLat * lonRsin;
        const y3 = p.sinLat;
        const z3 = p.cosLat * lonRcos;
        const yT = y3 * cosT - z3 * sinT;
        const zT = y3 * sinT + z3 * cosT;
        if (zT < 0.015) continue;
        const sx = cxS + x3 * R;
        const sy = cyS - yT * R;
        if (sy > h + 20) continue;
        const depth = zT;
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.6 + p.phase);
        const alpha = (0.65 + pulse * 0.35) * (0.4 + depth * 0.6);
        const radius = p.r * (0.9 + pulse * 0.4) * (0.6 + depth * 0.4);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };

    resize();
    init();
    const ro = new ResizeObserver(() => {
      resize();
      init();
    });
    ro.observe(canvas);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0.9,
        }}
      />
    </div>
  );
}
