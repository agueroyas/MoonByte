/**
 * ARTEMIS PRISM — Earth Visibility & Communication Geometry
 * Distinguishes direct line-of-sight geometric visibility from full RF link budgets.
 */

export class EarthVisibilityEngine {
  constructor(terrainModel, ephemerisEngine) {
    this.terrain = terrainModel;
    this.ephemeris = ephemerisEngine;
  }

  /**
   * Evaluates instantaneous Earth line-of-sight
   * @param {number} xM - Stereographic coordinate X in meters
   * @param {number} yM - Stereographic coordinate Y in meters
   * @param {number} latDeg - Lunar latitude
   * @param {number} lonDeg - Lunar longitude
   * @param {Date} date - Simulation epoch
   * @param {object} optionalRfParams - Optional RF hardware params (antenna gain, Tx power)
   */
  evaluateEarthVisibility(xM, yM, latDeg, lonDeg, date, optionalRfParams = null) {
    const earthGeom = this.ephemeris.getEarthPosition(latDeg, lonDeg, date);
    const vis = this.terrain.checkVisibility(xM, yM, earthGeom.azimuthDeg, earthGeom.elevationDeg, false);

    const baseResult = {
      date: date.toISOString(),
      earthAzimuthDeg: earthGeom.azimuthDeg,
      earthGeometricElevationDeg: earthGeom.elevationDeg,
      horizonElevationDeg: vis.horizonElevationDeg,
      elevationMarginDeg: vis.elevationMarginDeg,
      hasDirectLineOfSight: vis.isVisible,
      earthDistanceKm: earthGeom.earthDistanceKm,
      subEarthLibrationLatDeg: earthGeom.subEarthLatDeg,
      subEarthLibrationLonDeg: earthGeom.subEarthLonDeg,
      classification: "Computed result (DEM terrain raymarch + JPL Horizons ephemeris)"
    };

    // Strict compliance rule 7.6: If RF parameters are missing, report geometric visibility only!
    if (!optionalRfParams) {
      return {
        ...baseResult,
        rfLinkBudgetCalculated: false,
        telecomStatus: vis.isVisible ? "Geometric LOS Available (RF Link Budget Unspecified)" : "Geometric Terrain Blocked (Blackout)",
        scientificNote: "Geometric line-of-sight only. Antenna gain, transmitter power, receiver G/T, and atmospheric/space loss margins not configured."
      };
    }

    // If explicit RF parameters are provided, calculate X-band / Ka-band free space loss
    const c = 299792458; // m/s
    const freqHz = optionalRfParams.frequencyHz || 8.45e9; // 8.45 GHz X-Band
    const lambda = c / freqHz;
    const distanceM = earthGeom.earthDistanceKm * 1000;
    const fsplDb = 20 * Math.log10((4 * Math.PI * distanceM) / lambda);
    const eirpDbw = (optionalRfParams.txPowerWatts ? 10 * Math.log10(optionalRfParams.txPowerWatts) : 10) + (optionalRfParams.antennaGainDbi || 24);
    const dsnGtDbK = 42.0; // 34-meter DSN Deep Space Network receiver G/T
    const kDb = -228.6; // Boltzmann constant in dBW/(Hz*K)
    const bitRateBps = optionalRfParams.dataRateBps || 2.0e6; // 2 Mbps
    const ebN0Db = eirpDbw - fsplDb + dsnGtDbK - kDb - 10 * Math.log10(bitRateBps);
    const linkMarginDb = ebN0Db - (optionalRfParams.requiredEbN0Db || 3.0);

    return {
      ...baseResult,
      rfLinkBudgetCalculated: true,
      freeSpacePathLossDb: parseFloat(fsplDb.toFixed(2)),
      ebN0Db: parseFloat(ebN0Db.toFixed(2)),
      linkMarginDb: parseFloat(linkMarginDb.toFixed(2)),
      telecomStatus: (vis.isVisible && linkMarginDb >= 3.0) ? "Nominal DSN Link (>3dB margin)" : (vis.isVisible ? "Marginal Signal (<3dB margin)" : "Terrain Occlusion Blackout"),
      scientificNote: "Includes free-space loss to NASA Deep Space Network 34m ground terminal."
    };
  }

  /**
   * Generates time-series Earth visibility window
   */
  computeEarthVisibilityTimeline(xM, yM, latDeg, lonDeg, startDate, durationHours = 120, stepMinutes = 60) {
    const steps = Math.floor((durationHours * 60) / stepMinutes);
    const timeline = [];
    let totalLosSteps = 0;
    let maxBlackoutSpanHours = 0;
    let currentBlackoutSpan = 0;

    let currentTime = new Date(startDate.getTime());

    for (let i = 0; i < steps; i++) {
      const state = this.evaluateEarthVisibility(xM, yM, latDeg, lonDeg, currentTime);
      timeline.push({
        time: new Date(currentTime),
        timeIso: currentTime.toISOString(),
        hasLos: state.hasDirectLineOfSight,
        earthElevationDeg: state.earthGeometricElevationDeg,
        elevationMarginDeg: state.elevationMarginDeg
      });

      if (state.hasDirectLineOfSight) {
        totalLosSteps++;
        if (currentBlackoutSpan > maxBlackoutSpanHours) {
          maxBlackoutSpanHours = currentBlackoutSpan;
        }
        currentBlackoutSpan = 0;
      } else {
        currentBlackoutSpan += (stepMinutes / 60);
      }

      currentTime = new Date(currentTime.getTime() + stepMinutes * 60000);
    }

    if (currentBlackoutSpan > maxBlackoutSpanHours) {
      maxBlackoutSpanHours = currentBlackoutSpan;
    }

    return {
      timeline,
      durationHours,
      losAvailabilityPercent: parseFloat(((totalLosSteps / steps) * 100).toFixed(1)),
      maxContinuousBlackoutHours: parseFloat(maxBlackoutSpanHours.toFixed(1))
    };
  }
}
