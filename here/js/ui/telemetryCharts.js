/**
 * ARTEMIS PRISM — Real-Time Telemetry & Survival Sparklines
 * Interactive multi-stream telemetry canvas:
 * 1. Solar Illumination & Penumbral Fraction
 * 2. Battery State-of-Charge (SOC %) with 20% Critical Reserve Line
 * 3. Earth Line-of-Sight & RF Link Margin
 * 4. Surface Radiative Equilibrium Temperature (K)
 */

export class TelemetryCharts {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.telemetryData = [];
    this.currentCursorTime = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }

  setData(telemetrySeries, currentEpoch) {
    this.telemetryData = telemetrySeries;
    this.currentCursorTime = currentEpoch;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h || this.telemetryData.length === 0) return;

    // Dark HUD background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, w, h);

    const padLeft = 50;
    const padRight = 20;
    const padTop = 30;
    const padBottom = 25;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Grid lines
    ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 4; y++) {
      const gy = padTop + (plotH * y) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(w - padRight, gy);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "10px monospace";
      ctx.fillText(`${100 - y * 25}%`, 14, gy + 3);
    }

    // Critical 20% Battery Reserve Line (Red Dash)
    const critY = padTop + plotH * 0.8;
    ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, critY);
    ctx.lineTo(w - padRight, critY);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.font = "9px monospace";
    ctx.fillText("CRITICAL FLOOR 20% SOC", padLeft + 6, critY - 4);
    ctx.setLineDash([]);

    const N = this.telemetryData.length;

    // 1. Draw Solar Illumination Area (Amber Glow)
    ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    for (let i = 0; i < N; i++) {
      const pt = this.telemetryData[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - (pt.sunlitFraction || 0));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.closePath();
    ctx.fill();

    // 2. Draw Battery SOC Curve (Cyan Line)
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const pt = this.telemetryData[i];
      const soc = Math.max(0, Math.min(100, pt.batterySocPercent !== undefined ? pt.batterySocPercent : 85));
      const x = padLeft + (i / (N - 1)) * plotW;
      const y = padTop + plotH * (1.0 - soc / 100.0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Draw Earth LOS Status Bar at bottom
    for (let i = 0; i < N; i++) {
      const pt = this.telemetryData[i];
      const x = padLeft + (i / (N - 1)) * plotW;
      const stepW = Math.max(2, plotW / N);
      ctx.fillStyle = pt.hasEarthLos ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)";
      ctx.fillRect(x, padTop + plotH + 4, stepW, 6);
    }

    // Legend
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "#00e5ff";
    ctx.fillText("■ Battery SOC %", padLeft + 10, 18);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("■ Illumination %", padLeft + 140, 18);
    ctx.fillStyle = "#10b981";
    ctx.fillText("■ Earth Direct LOS", padLeft + 260, 18);
  }
}
