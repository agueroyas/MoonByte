/**
 * ARTEMIS PRISM v2.1 — Aerospace Mission Planning Master Application
 * Coordinates all physics engines, 3D Digital Twin, 2D GIS Cartography,
 * MCDA Decision Support, Sun-Chaser Rover Traversal, and MoonByte Copilot.
 */

import { appState } from './state.js';
import { LUNAR_LANDING_SITES } from './data/lunarSites.js';
import { PROVENANCE_REGISTRY } from './data/provenance.js';
import { TerrainModel } from './data/terrainModel.js';
import { EphemerisEngine } from './physics/ephemeris.js';
import { IlluminationEngine } from './physics/illumination.js';
import { EarthVisibilityEngine } from './physics/earthVisibility.js';
import { ThermalModel } from './physics/thermalModel.js';
import { PowerModel } from './physics/powerModel.js';
import { McdaEngine, DEFAULT_CRITERIA_CONFIG } from './planning/mcda.js';
import { SunChaserPlanner } from './planning/sunChaser.js';

import { soundManager } from './ui/audio.js';
import { View2D } from './ui/view2d.js';
import { View3D } from './ui/view3d.js';
import { TimelineController } from './ui/timeline.js';
import { ComparisonWorkspace } from './ui/comparisonTable.js';
import { SunChaserWorkspace } from './ui/sunChaserView.js';
import { ReportGenerator } from './ui/reportGenerator.js';
import { MoonByteAssistant } from './ui/moonByteAssistant.js';

class ArtemisPrismMasterApp {
  constructor() {
    this.state = appState;

    // Physics & Science Engines
    this.terrain = new TerrainModel(128, 32000);
    this.ephemeris = new EphemerisEngine();
    this.illumination = new IlluminationEngine(this.terrain, this.ephemeris);
    this.earthVis = new EarthVisibilityEngine(this.terrain, this.ephemeris);
    this.thermal = new ThermalModel();
    this.power = new PowerModel();
    this.mcda = new McdaEngine(DEFAULT_CRITERIA_CONFIG);
    this.sunChaser = new SunChaserPlanner(this.terrain, this.illumination, this.power);

    // Workspaces
    this.view2d = null;
    this.view3d = null;
    this.timeline = null;
    this.comparison = null;
    this.sunChaserView = null;
    this.reportGen = null;
    this.assistant = null;
  }

  init() {
    console.log("ARTEMIS PRISM v2.1: Initializing Aerospace Digital Twin Core...");

    // 1. Setup Main Viewports
    const container3d = document.getElementById('container-3d');
    const canvas2d = document.getElementById('canvas-2d');
    const timelineContainer = document.getElementById('timeline-container');
    const comparisonContainer = document.getElementById('comparison-container');
    const sunchaserContainer = document.getElementById('sunchaser-container');

    this.view3d = new View3D(container3d, this.terrain, this.state, this.ephemeris, (pick) => {
      this.onTerrainPick(pick);
    });

    this.view2d = new View2D(canvas2d, this.terrain, this.state, this.ephemeris);

    this.timeline = new TimelineController(timelineContainer, this.state, (newDate) => {
      this.onEpochChanged(newDate);
    });

    this.comparison = new ComparisonWorkspace(comparisonContainer, this.state);

    this.sunChaserView = new SunChaserWorkspace(sunchaserContainer, this.terrain, this.sunChaser, this.state, (plan) => {
      this.onRouteComputed(plan);
    });

    this.reportGen = new ReportGenerator(this.state, this.terrain, this.ephemeris, this.illumination, this.earthVis, this.power);
    this.assistant = new MoonByteAssistant(this.state, this.terrain, this.ephemeris, this.mcda, this.sunChaser);

    // 2. Setup Shell Controls
    this._setupWorkspaceNav();
    this._setupSiteDropdown();
    this._setup3dControls();
    this._setup2dControls();
    this._setupAudioToggle();
    this._setupCopilotDrawer();
    this._setupDossierActions();

    // 3. Render Provenance Registry Table
    this.renderProvenanceTable();

    // 4. Subscribe to App State
    this.state.subscribe((key, data) => {
      if (key === 'site') {
        this.onSiteChanged(data);
      } else if (key === 'date') {
        this.onEpochChanged(data);
      } else if (key === 'view') {
        this.onViewChanged(data);
      }
    });

    // 5. Initial Data Sync
    this.updateInspectorPanel();
    this.updateTelemetrySparkline();

    console.log("ARTEMIS PRISM v2.1: Systems Nominal. Lunar South Pole Digital Twin Active.");
  }

  _setupWorkspaceNav() {
    const navButtons = document.querySelectorAll('.workspace-nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick(1100, 0.02);
        const view = btn.getAttribute('data-view');
        this.state.setView(view);
      });
    });
  }

  onViewChanged(viewName) {
    document.querySelectorAll('.workspace-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    const v3d = document.getElementById('view-3d-wrapper');
    const v2d = document.getElementById('view-2d-wrapper');
    const vMcda = document.getElementById('view-mcda-wrapper');
    const vSc = document.getElementById('view-sunchaser-wrapper');
    const vDossier = document.getElementById('view-dossier-wrapper');
    const vProv = document.getElementById('view-provenance-wrapper');

    [v3d, v2d, vMcda, vSc, vDossier, vProv].forEach(v => v.classList.add('hidden'));

    if (viewName === '3d-twin') {
      v3d.classList.remove('hidden');
      this.view3d.resize();
    } else if (viewName === '2d-explorer') {
      v2d.classList.remove('hidden');
      this.view2d.resize();
    } else if (viewName === 'comparison') {
      vMcda.classList.remove('hidden');
      this.comparison.updateTable();
    } else if (viewName === 'sunchaser') {
      vSc.classList.remove('hidden');
      this.sunChaserView.runPlan();
    } else if (viewName === 'dossier') {
      vDossier.classList.remove('hidden');
      this.renderDossier();
    } else if (viewName === 'provenance') {
      vProv.classList.remove('hidden');
    }
  }

  _setupSiteDropdown() {
    const select = document.getElementById('site-selector');
    if (!select) return;

    select.innerHTML = LUNAR_LANDING_SITES.map(s => {
      const isVeto = s.metrics.slopeFootprint95thDeg > 15.0;
      return `<option value="${s.id}" ${s.id === this.state.activeSiteId ? 'selected' : ''}>
        ${s.code} — ${s.name} (${s.metrics.slopeFootprint95thDeg}°${isVeto ? ' - VETO' : ''})
      </option>`;
    }).join('');

    select.addEventListener('change', (e) => {
      soundManager.playClick(1000, 0.02);
      this.state.setSite(e.target.value);
    });
  }

  _setup3dControls() {
    // Camera Presets
    document.querySelectorAll('[data-cam]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cam = btn.getAttribute('data-cam');
        this.view3d.setCameraPreset(cam);
      });
    });

    // Shading Mode
    document.querySelectorAll('[data-shading]').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick(950, 0.02);
        document.querySelectorAll('[data-shading]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-shading');
        this.view3d.setShadingMode(mode);
      });
    });
  }

  _setup2dControls() {
    // 2D Layers
    document.querySelectorAll('.layer-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layer-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const layer = btn.getAttribute('data-layer');
        this.view2d.setLayer(layer);
      });
    });

    // Measurement Tool
    const measureBtn = document.getElementById('btn-measure-tool');
    const measureText = document.getElementById('text-measure-btn');
    if (measureBtn) {
      measureBtn.addEventListener('click', () => {
        const isActive = this.view2d.toggleMeasurementTool();
        measureBtn.classList.toggle('active', isActive);
        if (measureText) measureText.textContent = isActive ? "Click 2 Points" : "Measure Distance";
      });
    }
  }

  _setupAudioToggle() {
    const btn = document.getElementById('btn-toggle-audio');
    const iconOn = document.getElementById('icon-sound-on');
    const iconOff = document.getElementById('icon-sound-off');
    const textState = document.getElementById('text-sound-state');

    const updateAudioUI = (enabled) => {
      if (enabled) {
        iconOn.classList.remove('hidden');
        iconOff.classList.add('hidden');
        textState.textContent = "AUDIO ON";
        btn.classList.add('text-cyan-400');
      } else {
        iconOn.classList.add('hidden');
        iconOff.classList.remove('hidden');
        textState.textContent = "MUTE";
        btn.classList.remove('text-cyan-400');
      }
    };

    updateAudioUI(soundManager.isSoundEnabled());

    if (btn) {
      btn.addEventListener('click', () => {
        const enabled = soundManager.toggleSound();
        updateAudioUI(enabled);
      });
    }
  }

  _setupCopilotDrawer() {
    const drawer = document.getElementById('copilot-drawer');
    const toggleBtn = document.getElementById('btn-toggle-assistant');
    const closeBtn = document.getElementById('btn-close-copilot');
    const input = document.getElementById('copilot-user-input');
    const sendBtn = document.getElementById('btn-copilot-send');

    const toggle = () => {
      soundManager.playClick(1050, 0.02);
      drawer.classList.toggle('collapsed');
      this.state.assistantOpen = !drawer.classList.contains('collapsed');
    };

    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
    if (closeBtn) closeBtn.addEventListener('click', toggle);

    const handleSend = () => {
      const val = input.value.trim();
      if (!val) return;
      input.value = "";
      this._appendCopilotMessage("user", val);
      soundManager.playClick(1200, 0.02);

      setTimeout(() => {
        const reply = this.assistant.processQuery(val);
        const replyText = /[\u0600-\u06FF]/.test(val) ? reply.textAr : reply.textEn;
        this._appendCopilotMessage("assistant", replyText, reply.classification);
        soundManager.playAffirmative();
      }, 150);
    };

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
      });
    }

    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.copilot-chip');
      if (chip) {
        const query = chip.getAttribute('data-query');
        input.value = query;
        handleSend();
      }
    });

    // Render initial copilot welcome message
    const initMsg = this.assistant.chatHistory[0];
    this._appendCopilotMessage("assistant", initMsg.textAr + "\n\n" + initMsg.textEn, "Observed or published data", initMsg.quickActions);
  }

  _appendCopilotMessage(sender, text, classification = null, quickActions = null) {
    const body = document.getElementById('copilot-messages-body');
    if (!body) return;

    const div = document.createElement('div');
    div.className = sender === 'user' ? 'copilot-message copilot-msg-user' : 'copilot-message copilot-msg-assistant';

    let html = "";
    if (classification) {
      let badgeClass = "class-computed";
      if (classification.includes("Observed")) badgeClass = "class-observed";
      if (classification.includes("Modelled")) badgeClass = "class-modelled";
      if (classification.includes("Illustrative")) badgeClass = "class-illustrative";
      html += `<div class="class-tag ${badgeClass}">${classification}</div>`;
    }

    let formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/### (.*?)\n/g, '<h4 class="text-cyan-400 font-bold mt-1.5 mb-1">$1</h4>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n\n/g, '<br><br>');

    html += `<div>${formattedText}</div>`;

    if (quickActions) {
      html += `<div class="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-700/60">`;
      quickActions.forEach(qa => {
        html += `<button class="copilot-chip" data-query="${qa.query}">${qa.labelAr} / ${qa.labelEn}</button>`;
      });
      html += `</div>`;
    }

    div.innerHTML = html;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  _setupDossierActions() {
    const btnMd = document.getElementById('btn-dossier-export-md');
    const btnJson = document.getElementById('btn-dossier-export-json');

    if (btnMd) {
      btnMd.addEventListener('click', () => {
        soundManager.playClick(1100, 0.02);
        const md = this.reportGen.generateMarkdownDossier();
        this._downloadFile(md, `ARTEMIS_PRISM_${this.state.activeSite.code}_Dossier.md`, "text/markdown");
      });
    }
    if (btnJson) {
      btnJson.addEventListener('click', () => {
        soundManager.playClick(1100, 0.02);
        const json = this.reportGen.generateJsonDossier();
        this._downloadFile(json, `ARTEMIS_PRISM_${this.state.activeSite.code}_Data.json`, "application/json");
      });
    }
  }

  onSiteChanged(newSite) {
    const select = document.getElementById('site-selector');
    if (select) select.value = newSite.id;

    this.view3d.updateSelectedSite();
    this.view2d.render();
    this.updateInspectorPanel();
    this.updateTelemetrySparkline();
  }

  onEpochChanged(newDate) {
    this.view3d.updateEphemerisLighting();
    this.view2d.render();
    this.updateInspectorPanel();
    this.updateTelemetrySparkline();
  }

  onTerrainPick(pick) {
    const coordsEl = document.getElementById('insp-coords');
    const elevEl = document.getElementById('insp-elevation');
    const slopeEl = document.getElementById('insp-slope-95');

    if (coordsEl) coordsEl.textContent = `X: ${pick.xM}m, Y: ${pick.yM}m`;
    if (elevEl) elevEl.textContent = `${pick.elevationM > 0 ? '+' : ''}${pick.elevationM} m (Picked)`;
    if (slopeEl) {
      slopeEl.textContent = `${pick.slopeDeg}° (${pick.passes15Deg ? 'SAFE' : 'VETO HAZARD'})`;
      slopeEl.className = pick.passes15Deg ? 'inspector-val text-emerald-400' : 'inspector-val text-red-400 font-bold';
    }
  }

  onRouteComputed(plan) {
    this.state.roverState.activePlan = plan;
    this.view3d.updateRoverTrajectory(plan.waypoints);
    this.view2d.render();
  }

  updateInspectorPanel() {
    const site = this.state.activeSite;
    const epoch = this.state.currentDate;

    // Instantaneous physics calculations
    const sunGeom = this.ephemeris.getSunPosition(site.lat, site.lon, epoch);
    const earthGeom = this.ephemeris.getEarthPosition(site.lat, site.lon, epoch);
    const illum = this.illumination.evaluateIllumination(0, 0, site.lat, site.lon, epoch);
    const earthVis = this.earthVis.evaluateEarthVisibility(0, 0, site.lat, site.lon, epoch);
    const thermal = this.thermal.estimateSurfaceTemperature(illum.sunlitFraction, sunGeom.elevationDeg, false);
    const powerGen = this.power.calculateSolarPowerOutput(illum.sunlitFraction, sunGeom.elevationDeg);

    // Site Feasibility Verdict Badge
    const isVetoed = site.metrics.slopeFootprint95thDeg > 15.0 || site.metrics.annualIlluminationPercent < 50.0;
    const verdictBadge = document.getElementById('site-verdict-badge');
    if (verdictBadge) {
      verdictBadge.textContent = isVetoed ? "VETOED" : "FEASIBLE";
      verdictBadge.className = isVetoed ? "badge-tag badge-critical" : "badge-tag badge-nominal";
    }

    // Geodetic Profile
    document.getElementById('insp-coords').textContent = `${Math.abs(site.lat).toFixed(2)}°S, ${site.lon.toFixed(2)}°E`;
    document.getElementById('insp-elevation').textContent = `${site.elevationM > 0 ? '+' : ''}${site.elevationM} m`;

    // Geomorphology
    const slopeEl = document.getElementById('insp-slope-95');
    slopeEl.textContent = `${site.metrics.slopeFootprint95thDeg}° (${site.metrics.slopeFootprint95thDeg <= 15 ? 'PASS ≤ 15°' : 'FAIL VETO'})`;
    slopeEl.className = site.metrics.slopeFootprint95thDeg > 15 ? 'inspector-val text-red-400 font-bold' : 'inspector-val text-emerald-400';
    document.getElementById('insp-slope-multi').textContent = `${site.metrics.slope5mDeg}° / ${site.metrics.slope10mDeg}° / ${site.metrics.slope20mDeg}°`;
    document.getElementById('insp-tri').textContent = `${site.metrics.triM} m`;
    document.getElementById('insp-tpi').textContent = `${site.metrics.tpiM > 0 ? '+' : ''}${site.metrics.tpiM} m (Ridge)`;

    // Solar Geometry
    document.getElementById('insp-sun-az').textContent = `${sunGeom.azimuthDeg.toFixed(1)}°`;
    document.getElementById('insp-sun-el').textContent = `El: ${sunGeom.elevationDeg.toFixed(2)}° (Margin: ${illum.elevationMarginDeg.toFixed(2)}°)`;
    document.getElementById('insp-sunlit-frac').textContent = `${Math.round(illum.sunlitFraction * 100)}% (${illum.isFullySunlit ? 'Unoccluded' : (illum.isDirectSunlight ? 'Penumbral' : 'Shadow')})`;
    document.getElementById('insp-sun-annual').textContent = `${site.metrics.annualIlluminationPercent}% (Summer: ${site.metrics.summerIlluminationPercent}%)`;

    // Direct Earth LOS
    document.getElementById('insp-earth-az-el').textContent = `Az: ${earthGeom.azimuthDeg.toFixed(1)}° | El: ${earthGeom.elevationDeg.toFixed(2)}°`;
    const losEl = document.getElementById('insp-earth-los');
    losEl.textContent = earthVis.hasDirectLineOfSight ? "DIRECT LOS OK" : "TERRAIN BLACKOUT";
    losEl.className = earthVis.hasDirectLineOfSight ? 'inspector-val text-emerald-400' : 'inspector-val text-red-400 font-bold';
    document.getElementById('insp-libration').textContent = `Lat: ${earthGeom.subEarthLatDeg > 0 ? '+' : ''}${earthGeom.subEarthLatDeg.toFixed(1)}° | Lon: ${earthGeom.subEarthLonDeg > 0 ? '+' : ''}${earthGeom.subEarthLonDeg.toFixed(1)}°`;

    // Environment & Resources
    document.getElementById('insp-temp').textContent = `${thermal.temperatureKelvin} K (${thermal.temperatureCelsius}°C)`;
    document.getElementById('insp-psr-dist').textContent = `${site.metrics.distanceToPsrBoundaryM} m (${site.metrics.targetPsrName.split(' ')[0]})`;
    document.getElementById('insp-power-gen').textContent = `${powerGen.grossPowerWatts} W (Tracking Array)`;

    // Celestial HUD summary in 3D view
    const sunSum = document.getElementById('hud-sun-summary');
    if (sunSum) sunSum.textContent = `Az ${sunGeom.azimuthDeg.toFixed(1)}° | El ${sunGeom.elevationDeg.toFixed(1)}°`;
    const earthSum = document.getElementById('hud-earth-summary');
    if (earthSum) earthSum.textContent = `Az ${earthGeom.azimuthDeg.toFixed(1)}° | El ${earthGeom.elevationDeg.toFixed(1)}°`;
  }

  updateTelemetrySparkline() {
    const site = this.state.activeSite;
    const epoch = this.state.currentDate;

    const series = [];
    const steps = 40;
    const stepHours = 3;
    let runningBatteryWh = this.power.batteryCapacityWh * 0.95;

    for (let i = 0; i < steps; i++) {
      const stepDate = new Date(epoch.getTime() + i * stepHours * 3600000);
      const sun = this.ephemeris.getSunPosition(site.lat, site.lon, stepDate);
      const illum = this.illumination.evaluateIllumination(0, 0, site.lat, site.lon, stepDate);
      const powerGen = this.power.calculateSolarPowerOutput(illum.sunlitFraction, sun.elevationDeg);
      const powerDemand = this.power.calculatePowerDemand(false, illum.isDirectSunlight, true);
      const balance = this.power.simulateEnergyBalance(runningBatteryWh, powerGen.grossPowerWatts, powerDemand.totalDemandWatts, stepHours);
      runningBatteryWh = balance.batteryEnergyWh;

      series.push({
        time: stepDate,
        sunlitFraction: illum.sunlitFraction,
        batterySocPercent: balance.socPercent
      });
    }

    if (this.timeline) {
      this.timeline.renderMiniSparkline(series);
    }
  }

  renderDossier() {
    const container = document.getElementById('dossier-rendered-content');
    if (!container) return;
    const md = this.reportGen.generateMarkdownDossier();
    container.textContent = md;
  }

  renderProvenanceTable() {
    const tbody = document.getElementById('provenance-table-body');
    if (!tbody) return;
    tbody.innerHTML = Object.keys(PROVENANCE_REGISTRY).map(key => {
      const p = PROVENANCE_REGISTRY[key];
      return `
        <tr class="hover:bg-slate-800/40 font-mono text-xs">
          <td class="p-3 text-cyan-400 font-bold">${p.name}</td>
          <td class="p-3 text-slate-300">${p.instrument || p.archive}</td>
          <td class="p-3 text-slate-400">${p.doi || p.referenceDocument || p.productIdentifier}</td>
          <td class="p-3 text-slate-300">${p.horizontalResolution || p.crs || "Global"}</td>
          <td class="p-3"><span class="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px]">${p.classification}</span></td>
        </tr>
      `;
    }).join('');
  }

  _downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// Boot master app on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new ArtemisPrismMasterApp();
  app.init();
  window.__ARTEMIS_APP__ = app;
});
