/**
 * ARTEMIS PRISM — Illumination & Terrain Shadow Simulation
 * Couples JPL Horizons ephemeris with LOLA 64-azimuth horizon maps.
 * Handles solar disk angular radius (0.533°) for partial penumbral occultation.
 */

export class IlluminationEngine {
  constructor(terrainModel, ephemerisEngine) {
    this.terrain = terrainModel;
    this.ephemeris = ephemerisEngine;
  }

  /**
   * Evaluates instantaneous illumination at a given coordinate and epoch
   * @param {number} xM - Stereographic coordinate X in meters
   * @param {number} yM - Stereographic coordinate Y in meters
   * @param {number} latDeg - Lunar latitude
   * @param {number} lonDeg - Lunar longitude
   * @param {Date} date - Simulation epoch
   */
  evaluateIllumination(xM, yM, latDeg, lonDeg, date) {
    const sunGeom = this.ephemeris.getSunPosition(latDeg, lonDeg, date);
    const vis = this.terrain.checkVisibility(xM, yM, sunGeom.azimuthDeg, sunGeom.elevationDeg, true);

    return {
      date: date.toISOString(),
      solarAzimuthDeg: sunGeom.azimuthDeg,
      solarGeometricElevationDeg: sunGeom.elevationDeg,
      horizonElevationDeg: vis.horizonElevationDeg,
      elevationMarginDeg: vis.elevationMarginDeg,
      sunlitFraction: vis.sunlitFraction,
      isDirectSunlight: vis.sunlitFraction > 0.05,
      isFullySunlit: vis.sunlitFraction >= 0.95,
      isPartialEclipse: vis.sunlitFraction > 0.05 && vis.sunlitFraction < 0.95,
      classification: "Computed result (Terrain horizon raymarch + Horizons ephemeris)"
    };
  }

  /**
   * Generates time-series illumination window across a mission span
   * Identifies continuous sun periods, darkness spans, and upcoming sunset/sunrise
   */
  computeIlluminationTimeline(xM, yM, latDeg, lonDeg, startDate, durationHours = 120, stepMinutes = 60) {
    const steps = Math.floor((durationHours * 60) / stepMinutes);
    const timeline = [];
    let currentSunSpan = 0;
    let currentShadowSpan = 0;
    let maxShadowDurationHours = 0;
    let totalSunlitSteps = 0;

    let currentTime = new Date(startDate.getTime());

    for (let i = 0; i < steps; i++) {
      const state = this.evaluateIllumination(xM, yM, latDeg, lonDeg, currentTime);
      timeline.push({
        time: new Date(currentTime),
        timeIso: currentTime.toISOString(),
        sunlitFraction: state.sunlitFraction,
        solarElevationDeg: state.solarGeometricElevationDeg,
        horizonElevationDeg: state.horizonElevationDeg,
        isSunlit: state.isDirectSunlight
      });

      if (state.isDirectSunlight) {
        totalSunlitSteps++;
        currentSunSpan += (stepMinutes / 60);
        if (currentShadowSpan > maxShadowDurationHours) {
          maxShadowDurationHours = currentShadowSpan;
        }
        currentShadowSpan = 0;
      } else {
        currentShadowSpan += (stepMinutes / 60);
        currentSunSpan = 0;
      }

      currentTime = new Date(currentTime.getTime() + stepMinutes * 60000);
    }

    if (currentShadowSpan > maxShadowDurationHours) {
      maxShadowDurationHours = currentShadowSpan;
    }

    const illuminationFraction = totalSunlitSteps / steps;

    return {
      timeline,
      durationHours,
      meanIlluminationPercent: parseFloat((illuminationFraction * 100).toFixed(1)),
      maxContinuousShadowHours: parseFloat(maxShadowDurationHours.toFixed(1)),
      nextEvent: this._findNextIlluminationEvent(timeline)
    };
  }

  _findNextIlluminationEvent(timeline) {
    if (timeline.length < 2) return { event: "Unknown", inHours: 0 };
    const initialState = timeline[0].isSunlit;
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].isSunlit !== initialState) {
        const diffHours = (timeline[i].time.getTime() - timeline[0].time.getTime()) / 3600000;
        return {
          event: initialState ? "Sunset (Penumbral Shadow Entry)" : "Sunrise (Sunlit Ridge Emergence)",
          inHours: parseFloat(diffHours.toFixed(1)),
          targetTime: timeline[i].timeIso
        };
      }
    }
    return {
      event: initialState ? "Continuous Sun throughout window" : "Continuous Shadow throughout window",
      inHours: (timeline[timeline.length - 1].time.getTime() - timeline[0].time.getTime()) / 3600000,
      targetTime: null
    };
  }
}
