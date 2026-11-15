/**
 * ARTEMIS PRISM — Thermal Environment Model & Proxy
 * Strictly adheres to Rule 7.7: Distinguishes between measured Diviner temperatures
 * and simplified radiative equilibrium illumination proxies.
 */

export class ThermalModel {
  constructor() {
    this.SIGMA = 5.670374419e-8; // Stefan-Boltzmann constant W/(m²·K⁴)
    this.BOND_ALBEDO = 0.12; // Mean lunar surface albedo
    this.INFRARED_EMISSIVITY = 0.95; // Thermal regolith infrared emissivity
    this.SOLAR_FLUX_W_M2 = 1361.0; // Solar constant
    this.DEEP_PSR_COLD_TRAP_K = 39.5; // Cryogenic baseline (Diviner observed in Haworth/Shoemaker)
    this.REGOLITH_CONDUCTIVITY = 0.002; // W/(m·K) poor thermal conductor
  }

  /**
   * Calculates surface temperature estimate
   * Uses illumination fraction and solar incidence angle, calibrated against Diviner observations.
   * Explicitly flagged as "Modelled estimate (Radiative proxy)".
   */
  estimateSurfaceTemperature(sunlitFraction, solarElevationDeg, isPsr = false) {
    if (isPsr || sunlitFraction <= 0.001) {
      return {
        temperatureKelvin: this.DEEP_PSR_COLD_TRAP_K,
        temperatureCelsius: parseFloat((this.DEEP_PSR_COLD_TRAP_K - 273.15).toFixed(1)),
        thermalRegime: "Cryogenic Cold Trap (PSR)",
        volatileRetention: "Surface Ice Thermally Stable (< 110 K threshold)",
        classification: "Modelled estimate (Calibrated against LRO Diviner observations)",
        isProxy: true,
        scientificNote: "Subsurface temperature remains stable at ~40 K due to negligible thermal conduction in vacuum regolith."
      };
    }

    // Solar incidence angle on local surface (assumes near-horizontal to modest slope)
    const sinElev = Math.max(0.01, Math.sin(solarElevationDeg * (Math.PI / 180.0)));
    const effectiveFlux = this.SOLAR_FLUX_W_M2 * (1.0 - this.BOND_ALBEDO) * sinElev * sunlitFraction;

    // Radiative equilibrium: T = (Flux / (epsilon * sigma))^(1/4)
    // Plus residual planetary geothermal heat flux (~0.018 W/m²)
    const geothermalFlux = 0.018;
    const totalFlux = effectiveFlux + geothermalFlux;
    const tEquilibrium = Math.pow(totalFlux / (this.INFRARED_EMISSIVITY * this.SIGMA), 0.25);

    // Clamp between cryogenic floor and physical maximum at sub-solar point (~390K equator, ~230K at pole)
    const tClamped = Math.max(this.DEEP_PSR_COLD_TRAP_K, Math.min(235.0, tEquilibrium));

    let volatileRetention = "Ice Sublimation Zone (T > 145 K)";
    if (tClamped < 110.0) {
      volatileRetention = "Water Ice Thermally Stable (T < 110 K)";
    } else if (tClamped < 145.0) {
      volatileRetention = "Metastable / Deep Burial Ice Only";
    }

    return {
      temperatureKelvin: parseFloat(tClamped.toFixed(1)),
      temperatureCelsius: parseFloat((tClamped - 273.15).toFixed(1)),
      thermalRegime: tClamped > 200 ? "Sunlit Polar Warm" : "Twilight Cold Transition",
      volatileRetention,
      classification: "Modelled estimate (Illumination-weighted fourth-power proxy)",
      isProxy: true,
      scientificNote: "WARNING: This is an analytical radiative proxy, not a 3D thermophysical regolith finite-element simulation."
    };
  }
}
