/**
 * ARTEMIS PRISM — 2D Polar Stereographic Geospatial Cartography Explorer
 * High-performance planetary GIS canvas with layer blending, opacity sliders,
 * interactive spherical measurement tool, candidate site markers, and coordinate crosshairs.
 */

import { LUNAR_LANDING_SITES } from '../data/lunarSites.js';
import { LEMELIN_PSR_REGISTRY } from '../data/lemelinPsr.js';
import { soundManager } from './audio.js';

export class View2D {
  constructor(canvasElement, terrainModel, appState, ephemerisEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.terrain = terrainModel;
    this.state = appState;
    this.ephemeris = ephemerisEngine;

    // Viewport transform
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Active layer and opacities
    this.activeLayer = "elevation"; // "elevation" | "slope" | "psr"
    this.layerOpacity = 1.0;
    this.hoverInfo = null;

    // Measurement tool state
    this.isMeasuring = false;
    this.measureStart = null;
    this.measureEnd = null;
    this.measurementResult = null;

    this._setupInteraction();
  }

  _setupInteraction() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.isMeasuring) {
        const rect = this.canvas.getBoundingClientRect();
        const world = this._screenToWorldM(e.clientX - rect.left, e.clientY - rect.top);
        if (!this.measureStart) {
          this.measureStart = world;
          this.measureEnd = world;
        } else {
          this.measureEnd = world;
          this._finalizeMeasurement();
        }
        this.render();
        return;
      }

      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (this.isMeasuring && this.measureStart) {
          this.measureEnd = this._screenToWorldM(mouseX, mouseY);
          this.render();
        } else if (this.isDragging) {
          this.panX = e.clientX - this.dragStart.x;
          this.panY = e.clientY - this.dragStart.y;
          this.render();
        } else {
          this._handleHover(mouseX, mouseY);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.zoom = Math.max(0.4, Math.min(8.0, this.zoom * zoomFactor));
      this.render();
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.isMeasuring) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this._handleClick(mouseX, mouseY);
    });

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }

  toggleMeasurementTool() {
    this.isMeasuring = !this.isMeasuring;
    this.measureStart = null;
    this.measureEnd = null;
    this.measurementResult = null;
    soundManager.playClick(900, 0.03);
    this.render();
    return this.isMeasuring;
  }

  _finalizeMeasurement() {
    if (!this.measureStart || !this.measureEnd) return;
    const dx = this.measureEnd.x - this.measureStart.x;
    const dy = this.measureEnd.y - this.measureStart.y;
    const distM = Math.hypot(dx, dy);
    const z1 = this.terrain.getElevation(this.measureStart.x, this.measureStart.y);
    const z2 = this.terrain.getElevation(this.measureEnd.x, this.measureEnd.y);
    const dz = Math.abs(z2 - z1);
    const avgSlopeDeg = (Math.atan2(dz, Math.max(1, distM)) * 180) / Math.PI;

    this.measurementResult = {
      distanceM: Math.round(distM),
      deltaZM: Math.round(dz),
      avgSlopeDeg: parseFloat(avgSlopeDeg.toFixed(1))
    };
    soundManager.playAffirmative();
  }

  _screenToWorldM(screenX, screenY) {
    const centerX = this.canvas.width / 2 + this.panX;
    const centerY = this.canvas.height / 2 + this.panY;
    const size = Math.min(this.canvas.width, this.canvas.height) * 0.85 * this.zoom;
    const normX = (screenX - centerX) / size;
    const normY = (screenY - centerY) / size;

    return {
      x: normX * this.terrain.domainExtentM,
      y: -normY * this.terrain.domainExtentM
    };
  }

  _worldMToScreen(worldX, worldY) {
    const centerX = this.canvas.width / 2 + this.panX;
    const centerY = this.canvas.height / 2 + this.panY;
    const size = Math.min(this.canvas.width, this.canvas.height) * 0.85 * this.zoom;

    return {
      x: centerX + (worldX / this.terrain.domainExtentM) * size,
      y: centerY - (worldY / this.terrain.domainExtentM) * size
    };
  }

  _handleHover(screenX, screenY) {
    const world = this._screenToWorldM(screenX, screenY);
    if (Math.abs(world.x) <= this.terrain.domainExtentM / 2 && Math.abs(world.y) <= this.terrain.domainExtentM / 2) {
      const elev = this.terrain.getElevation(world.x, world.y);
      const slope = this.terrain.getSlopeMultiBaseline(world.x, world.y);
      
      // Calculate latitude & longitude in Lunar Polar Stereographic
      const R_MOON = 1737400.0;
      const rM = Math.hypot(world.x, world.y);
      const colatRad = 2.0 * Math.atan(rM / (2.0 * R_MOON));
      const latDeg = -90.0 + (colatRad * 180.0) / Math.PI;
      const lonDeg = (Math.atan2(world.x, world.y) * 180.0) / Math.PI;

      this.hoverInfo = {
        screenX,
        screenY,
        xM: Math.round(world.x),
        yM: Math.round(world.y),
        latDeg: parseFloat(latDeg.toFixed(4)),
        lonDeg: parseFloat(lonDeg.toFixed(4)),
        elevationM: Math.round(elev),
        slopeDeg: slope.slopeFootprint95thDeg
      };
      this.render();
    } else {
      this.hoverInfo = null;
      this.render();
    }
  }

  _handleClick(screenX, screenY) {
    for (const site of LUNAR_LANDING_SITES) {
      const coords = this._latLonToStereoM(site.lat, site.lon);
      const screenPos = this._worldMToScreen(coords.x, coords.y);
      const dist = Math.hypot(screenPos.x - screenX, screenPos.y - screenY);
      if (dist < 18) {
        this.state.setSite(site.id);
        soundManager.playClick(1100, 0.03);
        return;
      }
    }
  }

  _latLonToStereoM(latDeg, lonDeg) {
    const toRad = Math.PI / 180.0;
    const colatRad = (90.0 + latDeg) * toRad;
    const lonRad = lonDeg * toRad;
    const rM = 2.0 * 1737400.0 * Math.tan(colatRad / 2.0);
    return {
      x: rM * Math.sin(lonRad),
      y: rM * Math.cos(lonRad)
    };
  }

  render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (!width || !height) return;

    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    const halfExtent = this.terrain.domainExtentM / 2;
    const topLeft = this._worldMToScreen(-halfExtent, halfExtent);
    const bottomRight = this._worldMToScreen(halfExtent, -halfExtent);
    const renderWidth = bottomRight.x - topLeft.x;
    const renderHeight = bottomRight.y - topLeft.y;

    if (!this.terrainCanvasBuffer || this.bufferLayer !== this.activeLayer) {
      this._updateTerrainBuffer();
    }

    ctx.globalAlpha = this.layerOpacity;
    ctx.drawImage(this.terrainCanvasBuffer, topLeft.x, topLeft.y, renderWidth, renderHeight);
    ctx.globalAlpha = 1.0;

    // Real-time illumination shadow overlay
    if (this.state.layers.realtimeShadow) {
      this._renderShadowOverlay(topLeft.x, topLeft.y, renderWidth, renderHeight);
    }

    // Geodetic grid rings & scale lines
    this._renderCoordinateOverlay(ctx, topLeft, bottomRight);

    // Candidate landing sites
    if (this.state.layers.siteMarkers) {
      this._renderSiteMarkers(ctx);
    }

    // Rover traverse track
    if (this.state.roverState.activePlan && this.state.layers.roverTrack) {
      this._renderRoverTrack(ctx, this.state.roverState.activePlan);
    }

    // Measurement Line & Annotation
    if (this.isMeasuring && this.measureStart && this.measureEnd) {
      this._renderMeasurementTool(ctx);
    }

    ctx.restore();

    // Inspection Crosshair HUD
    this._renderHud(ctx);
  }

  _updateTerrainBuffer() {
    const N = this.terrain.gridSize;
    if (!this.terrainCanvasBuffer) {
      this.terrainCanvasBuffer = document.createElement('canvas');
      this.terrainCanvasBuffer.width = N;
      this.terrainCanvasBuffer.height = N;
    }
    const bCtx = this.terrainCanvasBuffer.getContext('2d');
    const imgData = bCtx.createImageData(N, N);
    const data = imgData.data;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const pxIdx = idx * 4;
        const elev = this.terrain.elevationGrid[idx];
        const slope = this.terrain.slopeGrid[idx];
        const isPsr = this.terrain.psrGrid[idx] === 1;

        let r = 0, g = 0, b = 0;

        if (this.activeLayer === "elevation") {
          const normZ = Math.max(0, Math.min(1, (elev + 3400) / 4850));
          if (isPsr && this.state.layers.psr) {
            r = Math.floor(normZ * 20 + 12);
            g = Math.floor(normZ * 60 + 35);
            b = Math.floor(normZ * 140 + 85);
          } else {
            r = Math.floor(normZ * 180 + 35);
            g = Math.floor(normZ * 190 + 35);
            b = Math.floor(normZ * 210 + 45);
          }
        } else if (this.activeLayer === "slope") {
          if (slope < 7.0) {
            r = 34; g = 197; b = 94; // Safe Green
          } else if (slope <= 15.0) {
            r = 245; g = 158; b = 11; // Caution Amber
          } else {
            r = 239; g = 68; b = 68; // Hazard Red
          }
        } else if (this.activeLayer === "psr") {
          if (isPsr) {
            r = 30; g = 58; b = 138;
          } else {
            r = 148; g = 163; b = 184;
          }
        }

        data[pxIdx] = r;
        data[pxIdx + 1] = g;
        data[pxIdx + 2] = b;
        data[pxIdx + 3] = 255;
      }
    }

    bCtx.putImageData(imgData, 0, 0);
    this.bufferLayer = this.activeLayer;
  }

  _renderShadowOverlay(left, top, width, height) {
    const ctx = this.ctx;
    const sunGeom = this.ephemeris.getSunPosition(-89.9, 0, this.state.currentDate);
    const sunAzRad = (sunGeom.azimuthDeg * Math.PI) / 180.0;

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const grad = ctx.createLinearGradient(
      left + width / 2 - Math.sin(sunAzRad) * width * 0.45,
      top + height / 2 + Math.cos(sunAzRad) * height * 0.45,
      left + width / 2 + Math.sin(sunAzRad) * width * 0.45,
      top + height / 2 - Math.cos(sunAzRad) * height * 0.45
    );
    grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.55, "rgba(235, 240, 250, 0.95)");
    grad.addColorStop(1, "rgba(50, 65, 90, 0.85)");

    ctx.fillStyle = grad;
    ctx.fillRect(left, top, width, height);
    ctx.restore();
  }

  _renderCoordinateOverlay(ctx, topLeft, bottomRight) {
    ctx.save();
    ctx.strokeStyle = "rgba(71, 85, 105, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    const center = this._worldMToScreen(0, 0);

    // Shackleton Rim Circle (~10.5 km radius)
    const rimRadiusScreen = (10500.0 / this.terrain.domainExtentM) * (bottomRight.x - topLeft.x);
    ctx.beginPath();
    ctx.arc(center.x, center.y, rimRadiusScreen, 0, Math.PI * 2);
    ctx.stroke();

    // South Pole Crosshair (89.9°S, 0°E)
    ctx.strokeStyle = "#38bdf8";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(center.x - 14, center.y);
    ctx.lineTo(center.x + 14, center.y);
    ctx.moveTo(center.x, center.y - 14);
    ctx.lineTo(center.x, center.y + 14);
    ctx.stroke();

    // Scale bar in bottom right
    const scaleBarM = 5000;
    const p1 = this._worldMToScreen(0, 0);
    const p2 = this._worldMToScreen(scaleBarM, 0);
    const barPx = Math.abs(p2.x - p1.x);

    const bx = this.canvas.width - 150;
    const by = this.canvas.height - 35;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx, by + 4);
    ctx.moveTo(bx + barPx, by - 4);
    ctx.lineTo(bx + barPx, by + 4);
    ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText("5 KM (LOLA 1:1)", bx + barPx / 2 - 32, by - 7);

    ctx.restore();
  }

  _renderSiteMarkers(ctx) {
    ctx.save();
    for (const site of LUNAR_LANDING_SITES) {
      const coords = this._latLonToStereoM(site.lat, site.lon);
      const pos = this._worldMToScreen(coords.x, coords.y);
      const isSelected = site.id === this.state.activeSiteId;
      const isVetoed = site.metrics.slopeFootprint95thDeg > 15.0;

      if (isSelected) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = isVetoed ? "#ef4444" : (isSelected ? "#38bdf8" : "#10b981");
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isSelected ? "#ffffff" : "#cbd5e1";
      ctx.font = isSelected ? "bold 11px JetBrains Mono, monospace" : "10px JetBrains Mono, monospace";
      ctx.fillText(site.code, pos.x + 8, pos.y + 3);
    }
    ctx.restore();
  }

  _renderRoverTrack(ctx, plan) {
    if (!plan || !plan.waypoints || plan.waypoints.length < 2) return;
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);

    for (let i = 0; i < plan.waypoints.length - 1; i++) {
      const wp1 = plan.waypoints[i];
      const wp2 = plan.waypoints[i + 1];
      const p1 = this._worldMToScreen(wp1.xM, wp1.yM);
      const p2 = this._worldMToScreen(wp2.xM, wp2.yM);

      ctx.strokeStyle = wp1.isSunlit ? "#f59e0b" : "#3b82f6";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderMeasurementTool(ctx) {
    const p1 = this._worldMToScreen(this.measureStart.x, this.measureStart.y);
    const p2 = this._worldMToScreen(this.measureEnd.x, this.measureEnd.y);

    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
    ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2);
    ctx.fill();

    if (this.measurementResult) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(midX - 50, midY - 22, 100, 20);
      ctx.strokeStyle = "#f59e0b";
      ctx.setLineDash([]);
      ctx.strokeRect(midX - 50, midY - 22, 100, 20);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText(`${this.measurementResult.distanceM}m | ${this.measurementResult.avgSlopeDeg}°`, midX - 44, midY - 8);
    }
    ctx.restore();
  }

  _renderHud(ctx) {
    if (!this.hoverInfo) return;
    const h = this.hoverInfo;

    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 1;

    const hudX = 16;
    const hudY = this.canvas.height - 84;
    ctx.fillRect(hudX, hudY, 280, 68);
    ctx.strokeRect(hudX, hudY, 280, 68);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText(`COORDS: ${h.latDeg}°S, ${h.lonDeg}°E`, hudX + 12, hudY + 18);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`LOLA ELEVATION: ${h.elevationM} m`, hudX + 12, hudY + 36);
    ctx.fillStyle = h.slopeDeg > 15 ? "#ef4444" : "#10b981";
    ctx.fillText(`HORN 3x3 SLOPE: ${h.slopeDeg}° (${h.slopeDeg > 15 ? "CRITICAL HAZARD" : "SAFE"})`, hudX + 12, hudY + 54);

    ctx.restore();
  }

  setLayer(layerName) {
    this.activeLayer = layerName;
    this.bufferLayer = null;
    soundManager.playClick(1000, 0.02);
    this.render();
  }
}
