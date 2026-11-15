/**
 * ARTEMIS PRISM — Sun-Chaser Rover Mission Planning Workspace
 * Dedicated workspace for time-expanded A* traverse routing, slope hazard profiles,
 * and dynamic solar energy & battery State-of-Charge (SOC) optimization.
 */

import { LUNAR_LANDING_SITES } from '../data/lunarSites.js';
import { soundManager } from './audio.js';

export class SunChaserWorkspace {
  constructor(containerElement, terrainModel, sunChaserPlanner, appState, onRouteComputedCallback) {
    this.container = containerElement;
    this.terrain = terrainModel;
    this.planner = sunChaserPlanner;
    this.state = appState;
    this.onRouteComputed = onRouteComputedCallback;

    this.currentPlan = null;
    this.selectedScenario = "SCENARIO_HENSON"; // "SCENARIO_HENSON" | "SCENARIO_DEEP_PSR" | "SCENARIO_RIDGE"

    this._render();
    this._setupListeners();
    this.runPlan();
  }

  _render() {
    this.container.innerHTML = `
      <div class="h-full w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
        <!-- Top Toolbar -->
        <div class="flex items-center justify-between px-6 py-3 bg-slate-900/90 border-b border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div>
              <h2 class="text-sm font-bold tracking-wide uppercase text-white flex items-center gap-2">
                Sun-Chaser Rover Traversal & Energy Dispatch
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">Time-Expanded A*</span>
              </h2>
              <p class="text-xs text-slate-400">Physics-informed routing across dynamic solar ridges & cryogenic shadow basins.</p>
            </div>
          </div>

          <!-- Scenario Switcher -->
          <div class="flex items-center gap-3">
            <label class="text-xs text-slate-400 font-mono">Traverse Scenario:</label>
            <select id="sc-scenario-select" class="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 font-mono focus:border-amber-400 focus:outline-none">
              <option value="SCENARIO_HENSON" selected>Shackleton Ridge → Henson Saddle (Solar Ridge Corridor)</option>
              <option value="SCENARIO_DEEP_PSR">Shackleton Rim → Cold Trap Margin (Volatile In-Situ Test)</option>
              <option value="SCENARIO_RIDGE">Connecting Ridge Peak → Northern Plateau (High-Sun Transit)</option>
            </select>
            <button id="sc-btn-run" class="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Compute Trajectory
            </button>
          </div>
        </div>

        <!-- Main Body: Split into Analysis HUD & Telemetry Graphs -->
        <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          <!-- Left Column: Metrics & Waypoints -->
          <div class="w-full lg:w-96 flex flex-col border-r border-slate-800 bg-slate-900/50 p-4 gap-4 overflow-y-auto">
            <!-- Execution KPI Cards -->
            <div class="grid grid-cols-2 gap-2.5 font-mono">
              <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span class="text-[10px] text-slate-400 uppercase block">Total Traverse</span>
                <span id="sc-kpi-dist" class="text-base font-bold text-cyan-400">-- m</span>
              </div>
              <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span class="text-[10px] text-slate-400 uppercase block">Estimated Duration</span>
                <span id="sc-kpi-time" class="text-base font-bold text-slate-200">-- h</span>
              </div>
              <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span class="text-[10px] text-slate-400 uppercase block">Min Battery SOC</span>
                <span id="sc-kpi-soc" class="text-base font-bold text-emerald-400">-- %</span>
              </div>
              <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span class="text-[10px] text-slate-400 uppercase block">Max Traversed Slope</span>
                <span id="sc-kpi-slope" class="text-base font-bold text-slate-200">-- °</span>
              </div>
            </div>

            <!-- Traversal Status Banner -->
            <div id="sc-status-banner" class="p-3 rounded-lg border text-xs font-mono">
              Evaluating mobility constraints...
            </div>

            <!-- Vehicle Physics Assumptions (Rule 3.2 Compliance) -->
            <div class="bg-slate-900/90 p-3 rounded-lg border border-slate-800/80 text-xs">
              <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-bold">Vehicle Model Parameters</span>
              <ul class="text-[11px] text-slate-300 space-y-1 font-mono">
                <li>• Mobility Speed: <span class="text-slate-100">0.05 m/s (180 m/h)</span></li>
                <li>• Max Slope Threshold: <span class="text-amber-400">15.0° (Hard Limit)</span></li>
                <li>• Vertical Solar Array: <span class="text-slate-100">3.2 m² @ 29.5% GaAs</span></li>
                <li>• Battery Capacity: <span class="text-slate-100">8,500 Wh (Floor: 20%)</span></li>
                <li>• Drive Load: <span class="text-slate-100">280 W | Avionics: 165 W</span></li>
              </ul>
            </div>

            <!-- Waypoint List -->
            <div class="flex-1 flex flex-col min-h-[220px]">
              <span class="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Waypoint Discretization</span>
              <div class="flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60">
                <table class="w-full text-[11px] font-mono text-left">
                  <thead class="bg-slate-900 sticky top-0 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th class="p-1.5">Step</th>
                      <th class="p-1.5">Dist</th>
                      <th class="p-1.5">Slope</th>
                      <th class="p-1.5">Sun</th>
                      <th class="p-1.5">SOC</th>
                    </tr>
                  </thead>
                  <tbody id="sc-waypoint-table-body" class="divide-y divide-slate-800/40"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Right Column: Visual Telemetry Profiles -->
          <div class="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
            
            <!-- Graph 1: Elevation & Slope Profile -->
            <div class="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-bold font-mono uppercase text-slate-200">Elevation & Horn 3x3 Slope Cross-Section</h3>
                  <p class="text-[11px] text-slate-400">Terrain elevation and slope angle along the planned rover trajectory.</p>
                </div>
                <div class="flex items-center gap-4 text-xs font-mono">
                  <span class="text-cyan-400">■ Elevation (m)</span>
                  <span class="text-amber-400">■ Slope (°)</span>
                  <span class="text-red-400">--- 15° Slope Limit</span>
                </div>
              </div>
              <div class="h-44 w-full relative">
                <canvas id="sc-chart-elevation" class="w-full h-full"></canvas>
              </div>
            </div>

            <!-- Graph 2: Battery State-of-Charge (SOC %) & Solar Charging -->
            <div class="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-bold font-mono uppercase text-slate-200">Battery State-of-Charge (SOC %) & Illumination</h3>
                  <p class="text-[11px] text-slate-400">Energy margin accounting for drive motors, base heaters, and solar charging.</p>
                </div>
                <div class="flex items-center gap-4 text-xs font-mono">
                  <span class="text-emerald-400">■ Battery SOC %</span>
                  <span class="text-amber-400">■ Sunlit Fraction</span>
                  <span class="text-red-400">--- 20% Critical Floor</span>
                </div>
              </div>
              <div class="h-44 w-full relative">
                <canvas id="sc-chart-battery" class="w-full h-full"></canvas>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  }

  _setupListeners() {
    const select = this.container.querySelector('#sc-scenario-select');
    const runBtn = this.container.querySelector('#sc-btn-run');

    select.addEventListener('change', (e) => {
      this.selectedScenario = e.target.value;
      soundManager.playClick(1000, 0.02);
      this.runPlan();
    });

    runBtn.addEventListener('click', () => {
      soundManager.playClick(1200, 0.03);
      this.runPlan();
    });
  }

  runPlan() {
    let startCoord = { x: 0, y: 10500 };
    let targetCoord = { x: 1400, y: 9200 };

    if (this.selectedScenario === "SCENARIO_HENSON") {
      startCoord = { x: 0, y: 10500 }; // Shackleton Connecting Ridge
      targetCoord = { x: 2200, y: 8400 }; // Henson saddle spur
    } else if (this.selectedScenario === "SCENARIO_DEEP_PSR") {
      startCoord = { x: 0, y: 10500 };
      targetCoord = { x: 800, y: 9100 }; // Steep crater apron margin
    } else if (this.selectedScenario === "SCENARIO_RIDGE") {
      startCoord = { x: -800, y: 10400 };
      targetCoord = { x: 1200, y: 10600 }; // Sunlit rim crest
    }

    const epoch = this.state.currentDate;
    const site = this.state.activeSite;

    this.currentPlan = this.planner.planTraverse(startCoord, targetCoord, epoch, site.lat, site.lon);
    this._renderPlanResults(this.currentPlan);

    if (this.onRouteComputed) {
      this.onRouteComputed(this.currentPlan);
    }
  }

  _renderPlanResults(plan) {
    // 1. Update KPI labels
    this.container.querySelector('#sc-kpi-dist').textContent = `${plan.totalDistanceMeters} m`;
    this.container.querySelector('#sc-kpi-time').textContent = `${plan.totalDurationHours} h`;
    this.container.querySelector('#sc-kpi-soc').textContent = `${plan.minBatterySocPercent}%`;
    this.container.querySelector('#sc-kpi-soc').className = plan.minBatterySocPercent < 20 ? 'text-base font-bold text-red-400' : 'text-base font-bold text-emerald-400';
    this.container.querySelector('#sc-kpi-slope').textContent = `${plan.maxSlopeDeg}°`;
    this.container.querySelector('#sc-kpi-slope').className = plan.maxSlopeDeg > 15 ? 'text-base font-bold text-red-400' : 'text-base font-bold text-slate-200';

    // 2. Update Status Banner
    const banner = this.container.querySelector('#sc-status-banner');
    if (plan.isFeasible) {
      banner.className = "p-3 rounded-lg border bg-emerald-950/70 text-emerald-300 border-emerald-800/60 text-xs font-mono";
      banner.innerHTML = `<strong>FEASIBLE & ENERGY POSITIVE:</strong> Route preserves battery SOC (>20%) and avoids slope hazards (>15°). Net solar margin: +${plan.netEnergyMarginWh} Wh.`;
      soundManager.playAffirmative();
    } else {
      banner.className = "p-3 rounded-lg border bg-amber-950/80 text-amber-300 border-amber-800/80 text-xs font-mono";
      banner.innerHTML = `<strong>CONSTRAINED / CAUTION:</strong> ${plan.status}. Route exceeds vehicle engineering margin under current ephemeris.`;
      soundManager.playCaution();
    }

    // 3. Render Waypoints Table
    const tbody = this.container.querySelector('#sc-waypoint-table-body');
    tbody.innerHTML = plan.waypoints.map(wp => `
      <tr class="hover:bg-slate-800/40">
        <td class="p-1.5 text-slate-400 font-bold">#${wp.stepIndex}</td>
        <td class="p-1.5 text-slate-200">${wp.cumulativeDistM}m</td>
        <td class="p-1.5 ${wp.slopeDeg > 15 ? 'text-red-400 font-bold' : 'text-slate-300'}">${wp.slopeDeg}°</td>
        <td class="p-1.5 ${wp.isSunlit ? 'text-amber-400' : 'text-slate-500'}">${Math.round(wp.sunlitFraction * 100)}%</td>
        <td class="p-1.5 ${wp.batterySocPercent < 20 ? 'text-red-400 font-bold' : 'text-cyan-400'}">${Math.round(wp.batterySocPercent)}%</td>
      </tr>
    `).join('');

    // 4. Draw Canvas Graphs
    this._drawElevationChart(plan.waypoints);
    this._drawBatteryChart(plan.waypoints);
  }

  _drawElevationChart(waypoints) {
    const canvas = this.container.querySelector('#sc-chart-elevation');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, w, h);

    const padLeft = 45;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 25;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const N = waypoints.length;
    if (N < 2) return;

    // Determine min/max elevation
    let minZ = Infinity, maxZ = -Infinity;
    waypoints.forEach(wp => {
      if (wp.elevationM < minZ) minZ = wp.elevationM;
      if (wp.elevationM > maxZ) maxZ = wp.elevationM;
    });
    minZ = Math.floor(minZ / 100) * 100 - 100;
    maxZ = Math.ceil(maxZ / 100) * 100 + 100;
    const zRange = maxZ - minZ || 1;

    // Grid lines
    ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const y = padTop + (plotH * k) / 3;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      const elevLabel = Math.round(maxZ - (k / 3) * zRange);
      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.fillText(`${elevLabel}m`, 8, y + 3);
    }

    // Elevation Fill & Line (Cyan)
    ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    for (let i = 0; i < N; i++) {
      const wp = waypoints[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - (wp.elevationM - minZ) / zRange);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const wp = waypoints[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - (wp.elevationM - minZ) / zRange);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Slope Curve (Amber) - Scaled 0 to 30 deg
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const wp = waypoints[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - Math.min(30, wp.slopeDeg) / 30.0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 15° Slope Limit Line (Red Dash)
    const limitY = padTop + plotH * (1.0 - 15.0 / 30.0);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, limitY);
    ctx.lineTo(w - padRight, limitY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawBatteryChart(waypoints) {
    const canvas = this.container.querySelector('#sc-chart-battery');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, w, h);

    const padLeft = 45;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 25;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const N = waypoints.length;
    if (N < 2) return;

    // Grid lines for 0%, 25%, 50%, 75%, 100%
    ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = padTop + (plotH * k) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.fillText(`${100 - k * 25}%`, 14, y + 3);
    }

    // Critical 20% Floor Line (Red Dash)
    const critY = padTop + plotH * 0.8;
    ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, critY);
    ctx.lineTo(w - padRight, critY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sunlight Area (Amber)
    ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    for (let i = 0; i < N; i++) {
      const wp = waypoints[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - wp.sunlitFraction);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.closePath();
    ctx.fill();

    // Battery SOC Curve (Emerald)
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const wp = waypoints[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - wp.batterySocPercent / 100.0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
