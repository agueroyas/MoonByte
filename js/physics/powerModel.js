/**
 * ARTEMIS PRISM — Power Generation & Battery Energy Balance Model
 * Implements solar incidence, panel architecture (vertical vs horizontal),
 * charging/inverter efficiency, dynamic vehicle loads, and battery State-of-Charge (SOC).
 */

export class PowerModel {
  constructor(config = {}) {
    this.solarConstantW_M2 = 1361.0;
    this.panelAreaM2 = config.panelAreaM2 || 3.2; // m² (vertical deployable mast array)
    this.panelEfficiency = config.panelEfficiency || 0.295; // 29.5% triple-junction GaAs space cells
    this.dustDegradationFactor = config.dustDegradationFactor || 0.94; // 6% dust obscuration loss
    this.chargingEfficiency = config.chargingEfficiency || 0.92; // 92% battery charge controller
    this.panelOrientation = config.panelOrientation || "VERTICAL_TRACKING"; // VERTICAL_TRACKING vs HORIZONTAL_FIXED
    
    // Battery storage configuration
    this.batteryCapacityWh = config.batteryCapacityWh || 8500.0; // 8.5 kWh Li-ion space battery
    this.criticalReserveFloorPercent = 20.0; // 20% critical survival threshold

    // Dynamic electrical loads (Watts)
    this.loads = {
      baseAvionicsW: 110.0,
      scienceInstrumentsW: 55.0,
      telecomDownlinkW: 45.0,
      driveMotorsW: 280.0, // active during rover movement
      survivalHeaterColdW: 175.0, // active in darkness/shadow (<100K)
      survivalHeaterWarmW: 30.0   // active when illuminated
    };
  }

  /**
   * Computes instantaneous gross solar power generation (Watts)
   * @param {number} sunlitFraction - Fraction of solar disk visible (0.0 to 1.0)
   * @param {number} solarElevationDeg - Solar elevation above horizon (typically 0.5° to 1.5° at pole)
   */
  calculateSolarPowerOutput(sunlitFraction, solarElevationDeg) {
    if (sunlitFraction <= 0.001 || solarElevationDeg <= -0.27) {
      return {
        grossPowerWatts: 0.0,
        netSolarFluxWPerM2: 0.0,
        panelIncidenceAngleDeg: 90.0,
        sunlitFraction: 0.0,
        classification: "Computed result (Zero illumination)"
      };
    }

    let incidenceCosine = 1.0;
    if (this.panelOrientation === "VERTICAL_TRACKING") {
      // At lunar south pole, solar elevation is low (0° - 1.5°).
      // A vertical panel tracking the Sun's azimuth intercepts sunlight near perpendicular:
      // Incidence angle = 90° - elevation = ~88.5° to surface normal = near cos(elev) ~ 0.999
      incidenceCosine = Math.cos(solarElevationDeg * (Math.PI / 180.0));
    } else {
      // Fixed horizontal panel: receives sunlight at grazing angle sin(elev) ~ 0.02
      incidenceCosine = Math.max(0.0, Math.sin(solarElevationDeg * (Math.PI / 180.0)));
    }

    const effectiveFlux = this.solarConstantW_M2 * incidenceCosine * sunlitFraction;
    const grossPower = effectiveFlux * this.panelAreaM2 * this.panelEfficiency * this.dustDegradationFactor;

    return {
      grossPowerWatts: parseFloat(grossPower.toFixed(1)),
      effectiveFluxWPerM2: parseFloat(effectiveFlux.toFixed(1)),
      panelOrientation: this.panelOrientation,
      panelAreaM2: this.panelAreaM2,
      incidenceCosine: parseFloat(incidenceCosine.toFixed(3)),
      sunlitFraction,
      classification: "Computed result (Solar geometry & panel efficiency)"
    };
  }

  /**
   * Computes instantaneous power demand (Watts) based on vehicle operational state
   */
  calculatePowerDemand(isDriving = false, isSunlit = true, isTransmitting = true) {
    let demand = this.loads.baseAvionicsW + this.loads.scienceInstrumentsW;
    if (isTransmitting) demand += this.loads.telecomDownlinkW;
    if (isDriving) demand += this.loads.driveMotorsW;
    demand += isSunlit ? this.loads.survivalHeaterWarmW : this.loads.survivalHeaterColdW;

    return {
      totalDemandWatts: parseFloat(demand.toFixed(1)),
      breakdown: {
        avionics: this.loads.baseAvionicsW,
        instruments: this.loads.scienceInstrumentsW,
        telecom: isTransmitting ? this.loads.telecomDownlinkW : 0,
        drive: isDriving ? this.loads.driveMotorsW : 0,
        heaters: isSunlit ? this.loads.survivalHeaterWarmW : this.loads.survivalHeaterColdW
      }
    };
  }

  /**
   * Simulates battery state-of-charge over time given power generated and consumed
   */
  simulateEnergyBalance(currentBatteryWh, powerGenW, powerDemandW, deltaTimeHours) {
    const netPowerW = powerGenW - powerDemandW;
    let newBatteryWh = currentBatteryWh;

    if (netPowerW > 0) {
      // Charging battery
      const chargeEnergyWh = netPowerW * deltaTimeHours * this.chargingEfficiency;
      newBatteryWh = Math.min(this.batteryCapacityWh, currentBatteryWh + chargeEnergyWh);
    } else {
      // Discharging battery
      const dischargeEnergyWh = Math.abs(netPowerW) * deltaTimeHours;
      newBatteryWh = Math.max(0.0, currentBatteryWh - dischargeEnergyWh);
    }

    const socPercent = (newBatteryWh / this.batteryCapacityWh) * 100.0;
    const isCritical = socPercent <= this.criticalReserveFloorPercent;
    const isDepleted = newBatteryWh <= 0.0;

    let remainingSurvivalHours = Infinity;
    if (netPowerW < 0) {
      remainingSurvivalHours = newBatteryWh / Math.abs(netPowerW);
    }

    return {
      batteryEnergyWh: parseFloat(newBatteryWh.toFixed(1)),
      batteryCapacityWh: this.batteryCapacityWh,
      socPercent: parseFloat(socPercent.toFixed(1)),
      netPowerWatts: parseFloat(netPowerW.toFixed(1)),
      isCharging: netPowerW > 0,
      isCriticalReserve: isCritical,
      isDepleted,
      remainingSurvivalHours: remainingSurvivalHours === Infinity ? 999.0 : parseFloat(remainingSurvivalHours.toFixed(1))
    };
  }
}
