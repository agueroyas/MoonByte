/**
 * ARTEMIS PRISM — Global Reactive Application State
 */

import { LUNAR_LANDING_SITES } from './data/lunarSites.js';

export class AppState {
  constructor() {
    this.listeners = new Set();

    // Default simulation start epoch: Artemis III summer illumination window (Sept 2026)
    this.currentDate = new Date("2026-09-18T12:00:00Z");
    this.isPlaying = false;
    this.playSpeedMultiplier = 60; // 1 second real-world = 1 hour simulation

    // Active site selection
    this.activeSiteId = "SITE_SHACKLETON_RIDGE_1";
    this.activeSite = LUNAR_LANDING_SITES[0];

    // Navigation and Workspace Mode
    // "2d-explorer" | "3d-twin" | "comparison" | "sunchaser" | "dossier"
    this.activeView = "3d-twin";

    // 2D Map Layers visibility
    this.layers = {
      elevation: true,
      slope: false,
      roughness: false,
      psr: true,
      realtimeShadow: true,
      earthLos: false,
      siteMarkers: true,
      roverTrack: true
    };

    // Camera & 3D state
    this.cameraMode = "orbital"; // "orbital" | "top-down" | "rover-fpv"
    this.sunShadowIntensity = 1.0;

    // Rover simulation state
    this.roverState = {
      isTraversing: false,
      currentStep: 0,
      activePlan: null
    };

    // Assistant chat state
    this.assistantOpen = false;
    this.unreadAssistantNotes = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(changeKey, data) {
    for (const listener of this.listeners) {
      listener(changeKey, data, this);
    }
  }

  setSite(siteId) {
    const found = LUNAR_LANDING_SITES.find(s => s.id === siteId);
    if (found) {
      this.activeSiteId = siteId;
      this.activeSite = found;
      this.notify("site", found);
    }
  }

  setDate(newDate) {
    this.currentDate = new Date(newDate);
    this.notify("date", this.currentDate);
  }

  stepTimeHours(hours) {
    this.setDate(new Date(this.currentDate.getTime() + hours * 3600000));
  }

  setView(viewName) {
    this.activeView = viewName;
    this.notify("view", viewName);
  }

  toggleLayer(layerKey) {
    if (this.layers[layerKey] !== undefined) {
      this.layers[layerKey] = !this.layers[layerKey];
      this.notify("layer", { layer: layerKey, enabled: this.layers[layerKey] });
    }
  }

  setPlaying(playing) {
    this.isPlaying = playing;
    this.notify("playback", playing);
  }
}

export const appState = new AppState();
