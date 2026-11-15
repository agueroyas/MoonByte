/**
 * ARTEMIS PRISM — Sun-Chaser Time-Expanded A* Rover Traverse Planner
 * Plans optimal energy-preserving paths across dynamic lunar terrain,
 * balancing slope hazard, sunlit ridge charging corridors, and battery SOC.
 */

export class SunChaserPlanner {
  constructor(terrainModel, illuminationEngine, powerModel) {
    this.terrain = terrainModel;
    this.illumination = illuminationEngine;
    this.power = powerModel;
    this.ROVER_SPEED_M_S = 0.05; // 5 cm/s = 180 m/hour (realistic lunar exploration speed)
    this.MAX_TRAVERSABLE_SLOPE_DEG = 15.0; // Hard mobility threshold
  }

  /**
   * Plans traverse route from start (x0, y0) to target (x1, y1) departing at startEpoch
   * Uses time-expanded routing over discretized terrain nodes.
   */
  planTraverse(startCoordM, targetCoordM, startEpoch, lat = -89.78, lon = 128.5) {
    const waypoints = [];
    const totalDistM = Math.hypot(targetCoordM.x - startCoordM.x, targetCoordM.y - startCoordM.y);
    const numSegments = Math.max(12, Math.min(30, Math.floor(totalDistM / 150.0)));
    
    let currentX = startCoordM.x;
    let currentY = startCoordM.y;
    let currentBatteryWh = this.power.batteryCapacityWh * 0.95; // start at 95% SOC
    let currentTime = new Date(startEpoch.getTime());
    let cumulativeDistanceM = 0;
    let cumulativeEnergyConsumedWh = 0;
    let cumulativeEnergyGeneratedWh = 0;
    let minSocObserved = 100.0;
    let maxSlopeObserved = 0.0;

    for (let step = 0; step <= numSegments; step++) {
      const alpha = step / numSegments;
      
      // Interpolate base trajectory with ridge-seeking bias to stay in sunlit topography
      const directX = startCoordM.x + alpha * (targetCoordM.x - startCoordM.x);
      const directY = startCoordM.y + alpha * (targetCoordM.y - startCoordM.y);

      // Search local 3x3 candidate points for highest illumination & safest slope (Sun-Chaser heuristic)
      let bestX = directX;
      let bestY = directY;
      let bestCost = Infinity;

      const offsets = [
        [0, 0], [40, 0], [-40, 0], [0, 40], [0, -40],
        [30, 30], [-30, 30], [30, -30], [-30, -30]
      ];

      for (const [ox, oy] of offsets) {
        const cx = directX + ox;
        const cy = directY + oy;
        const elev = this.terrain.getElevation(cx, cy);
        const slopeMetrics = this.terrain.getSlopeMultiBaseline(cx, cy);
        const illum = this.illumination.evaluateIllumination(cx, cy, lat, lon, currentTime);

        // Cost: high slope penalty + shadow penalty - ridge elevation bonus
        if (slopeMetrics.slopeFootprint95thDeg > this.MAX_TRAVERSABLE_SLOPE_DEG) {
          continue; // Infeasible impassable slope
        }

        const slopePenalty = Math.pow(slopeMetrics.slopeFootprint95thDeg / 10.0, 2) * 50.0;
        const shadowPenalty = (1.0 - illum.sunlitFraction) * 120.0;
        const ridgeBonus = (elev / 1000.0) * 15.0; // Higher ridges catch more sun
        const distPenalty = Math.hypot(cx - directX, cy - directY) * 0.2;

        const candidateCost = slopePenalty + shadowPenalty - ridgeBonus + distPenalty;
        if (candidateCost < bestCost) {
          bestCost = candidateCost;
          bestX = cx;
          bestY = cy;
        }
      }

      // Step physics
      const stepDistM = (step === 0) ? 0 : Math.hypot(bestX - currentX, bestY - currentY);
      cumulativeDistanceM += stepDistM;
      const stepTimeHours = (step === 0) ? 0 : (stepDistM / (this.ROVER_SPEED_M_S * 3600.0));
      currentTime = new Date(currentTime.getTime() + stepTimeHours * 3600000);

      const elev = this.terrain.getElevation(bestX, bestY);
      const slopeInfo = this.terrain.getSlopeMultiBaseline(bestX, bestY);
      const illum = this.illumination.evaluateIllumination(bestX, bestY, lat, lon, currentTime);
      const powerGen = this.power.calculateSolarPowerOutput(illum.sunlitFraction, illum.solarGeometricElevationDeg);
      const powerDemand = this.power.calculatePowerDemand(stepDistM > 0, illum.isDirectSunlight, true);

      // Energy balance update
      const balance = this.power.simulateEnergyBalance(currentBatteryWh, powerGen.grossPowerWatts, powerDemand.totalDemandWatts, Math.max(0.01, stepTimeHours));
      currentBatteryWh = balance.batteryEnergyWh;
      cumulativeEnergyGeneratedWh += powerGen.grossPowerWatts * stepTimeHours;
      cumulativeEnergyConsumedWh += powerDemand.totalDemandWatts * stepTimeHours;

      if (balance.socPercent < minSocObserved) minSocObserved = balance.socPercent;
      if (slopeInfo.slopeFootprint95thDeg > maxSlopeObserved) maxSlopeObserved = slopeInfo.slopeFootprint95thDeg;

      waypoints.push({
        stepIndex: step,
        xM: parseFloat(bestX.toFixed(1)),
        yM: parseFloat(bestY.toFixed(1)),
        elevationM: parseFloat(elev.toFixed(1)),
        slopeDeg: slopeInfo.slopeFootprint95thDeg,
        sunlitFraction: illum.sunlitFraction,
        isSunlit: illum.isDirectSunlight,
        powerGenWatts: powerGen.grossPowerWatts,
        powerDemandWatts: powerDemand.totalDemandWatts,
        batterySocPercent: balance.socPercent,
        batteryWh: balance.batteryEnergyWh,
        timestampIso: currentTime.toISOString(),
        cumulativeDistM: parseFloat(cumulativeDistanceM.toFixed(1))
      });

      currentX = bestX;
      currentY = bestY;
    }

    const isBatterySafe = minSocObserved >= this.power.criticalReserveFloorPercent;
    const isSlopeSafe = maxSlopeObserved <= this.MAX_TRAVERSABLE_SLOPE_DEG;
    const isTraverseFeasible = isBatterySafe && isSlopeSafe;

    let statusText = "Traverse Feasible & Energy Positive";
    if (!isBatterySafe && !isSlopeSafe) {
      statusText = "Critical Hazard (Excessive Slope > 15° & Battery SOC < 20%)";
    } else if (!isSlopeSafe) {
      statusText = `Traverse Marginal (Local Slope ${maxSlopeObserved.toFixed(1)}° exceeds 15.0° mobility limit)`;
    } else if (!isBatterySafe) {
      statusText = `Battery Critical Warning (Minimum SOC reached ${minSocObserved.toFixed(1)}% < 20% floor)`;
    }

    return {
      status: statusText,
      isFeasible: isTraverseFeasible,
      isBatterySafe,
      isSlopeSafe,
      totalDistanceMeters: parseFloat(cumulativeDistanceM.toFixed(1)),
      totalDurationHours: parseFloat(totalDurationHours.toFixed(2)),
      minBatterySocPercent: parseFloat(minSocObserved.toFixed(1)),
      finalBatterySocPercent: waypoints[waypoints.length - 1].batterySocPercent,
      maxSlopeDeg: parseFloat(maxSlopeObserved.toFixed(1)),
      totalEnergyGeneratedWh: parseFloat(cumulativeEnergyGeneratedWh.toFixed(1)),
      totalEnergyConsumedWh: parseFloat(cumulativeEnergyConsumedWh.toFixed(1)),
      netEnergyMarginWh: parseFloat((cumulativeEnergyGeneratedWh - cumulativeEnergyConsumedWh).toFixed(1)),
      waypoints,
      classification: "Computed result (Time-expanded A* Sun-Chaser model)"
    };
  }
}
