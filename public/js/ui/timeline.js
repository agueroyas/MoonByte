/**
 * ARTEMIS PRISM — Aerospace Mission Timeline & Telemetry Scrubber Dock
 * Professional synodic epoch scrubber, time-warp controls, and real-time survival clock telemetry.
 */

import { soundManager } from './audio.js';

export class TimelineController {
  constructor(containerElement, appState, onChangeCallback) {
    this.container = containerElement;
    this.state = appState;
    this.onChange = onChangeCallback;
    this.animationTimer = null;
    this.warpMultiplier = 1; // 1 = 1h/sec, 6 = 6h/sec, 24 = 24h/sec

    this._render();
    this._setupListeners();
  }

  _render() {
    this.container.innerHTML = `
      <div class="h-full w-full flex items-center justify-between px-4 py-2 bg-slate-900 border-t border-slate-800 text-slate-200 font-mono text-xs select-none shadow-md">
        
        <!-- Left: Playback & Step Controls -->
        <div class="flex items-center gap-2">
          <button id="tl-btn-step-back" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors" title="Step -6 Hours">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
          </button>
          <button id="tl-btn-play-pause" class="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold border border-cyan-400 transition-colors flex items-center gap-1.5" title="Play / Pause Replay">
            <svg id="tl-icon-play" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg id="tl-icon-pause" class="w-4 h-4 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            <span id="tl-play-text">PLAY</span>
          </button>
          <button id="tl-btn-step-fwd" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors" title="Step +6 Hours">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
          </button>

          <!-- Time Warp Multipliers -->
          <div class="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 ml-2">
            <button class="tl-warp-btn px-2 py-0.5 rounded text-[10px] font-bold text-cyan-400 bg-slate-800" data-warp="1">1x</button>
            <button class="tl-warp-btn px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white" data-warp="6">6x</button>
            <button class="tl-warp-btn px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white" data-warp="24">24x</button>
          </div>
        </div>

        <!-- Center: Master Mission Epoch & Synodic Scrubber -->
        <div class="flex-1 max-w-3xl mx-6 flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-2">
              <span class="text-slate-500">MISSION EPOCH:</span>
              <span id="tl-epoch-label" class="text-cyan-400 font-bold tracking-wider">2026-09-18 12:00:00 UTC</span>
              <span class="text-slate-500">•</span>
              <span id="tl-jd-label" class="text-slate-400">JD 2461299.00</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-amber-400 font-semibold">SYNODIC MONTH SOLSTICE</span>
              <span class="text-slate-500">•</span>
              <span id="tl-offset-label" class="text-slate-300">T+00h</span>
            </div>
          </div>

          <div class="relative flex items-center">
            <input id="tl-slider" type="range" min="0" max="720" value="0" step="1" 
                   class="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400 focus:outline-none" />
          </div>

          <div class="flex justify-between text-[9px] text-slate-500">
            <span>T+00h (Touchdown)</span>
            <span>T+120h (EVA 1)</span>
            <span>T+360h (1/2 Month)</span>
            <span>T+720h (Synodic Cycle)</span>
          </div>
        </div>

        <!-- Right: Telemetry Mini-Sparkline & Survival Status -->
        <div class="flex items-center gap-4 border-l border-slate-800 pl-4">
          <!-- Sparkline Mini Canvas -->
          <div class="w-36 h-9 relative flex flex-col justify-center">
            <div class="text-[9px] text-slate-500 mb-0.5 flex justify-between">
              <span>FORWARD TELEMETRY</span>
              <span class="text-cyan-400">120h</span>
            </div>
            <canvas id="tl-mini-sparkline" class="w-full h-6 rounded bg-slate-950/80 border border-slate-800"></canvas>
          </div>

          <!-- Survival Clock Callout -->
          <div class="text-right flex flex-col">
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Survival Clock</span>
            <div class="flex items-center gap-1.5">
              <span id="tl-survival-dot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span id="tl-survival-text" class="text-xs font-bold text-emerald-400">NOMINAL (&gt;72h)</span>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  _setupListeners() {
    this.baseEpoch = new Date("2026-09-18T12:00:00Z");
    const slider = this.container.querySelector('#tl-slider');
    const playBtn = this.container.querySelector('#tl-btn-play-pause');
    const stepBackBtn = this.container.querySelector('#tl-btn-step-back');
    const stepFwdBtn = this.container.querySelector('#tl-btn-step-fwd');
    const warpBtns = this.container.querySelectorAll('.tl-warp-btn');

    slider.addEventListener('input', (e) => {
      const hoursOffset = parseInt(e.target.value);
      const newDate = new Date(this.baseEpoch.getTime() + hoursOffset * 3600000);
      this.state.setDate(newDate);
      this._updateDisplay(newDate, hoursOffset);
      if (this.onChange) this.onChange(newDate);
    });

    stepBackBtn.addEventListener('click', () => {
      soundManager.playClick(1000, 0.02);
      let val = Math.max(0, parseInt(slider.value) - 6);
      slider.value = val;
      slider.dispatchEvent(new Event('input'));
    });

    stepFwdBtn.addEventListener('click', () => {
      soundManager.playClick(1000, 0.02);
      let val = Math.min(parseInt(slider.max), parseInt(slider.value) + 6);
      slider.value = val;
      slider.dispatchEvent(new Event('input'));
    });

    playBtn.addEventListener('click', () => {
      soundManager.playClick(1200, 0.03);
      if (this.state.isPlaying) {
        this.stopPlayback();
      } else {
        this.startPlayback();
      }
    });

    warpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick(900, 0.02);
        warpBtns.forEach(b => {
          b.className = 'tl-warp-btn px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white';
        });
        btn.className = 'tl-warp-btn px-2 py-0.5 rounded text-[10px] font-bold text-cyan-400 bg-slate-800';
        this.warpMultiplier = parseInt(btn.getAttribute('data-warp'));
        if (this.state.isPlaying) {
          this.stopPlayback();
          this.startPlayback();
        }
      });
    });
  }

  startPlayback() {
    this.state.setPlaying(true);
    const slider = this.container.querySelector('#tl-slider');
    const iconPlay = this.container.querySelector('#tl-icon-play');
    const iconPause = this.container.querySelector('#tl-icon-pause');
    const playText = this.container.querySelector('#tl-play-text');

    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    playText.textContent = "PAUSE";

    const intervalMs = Math.max(40, 200 / this.warpMultiplier);
    this.animationTimer = setInterval(() => {
      let val = parseInt(slider.value) + 1;
      if (val > parseInt(slider.max)) val = 0;
      slider.value = val;
      slider.dispatchEvent(new Event('input'));
    }, intervalMs);
  }

  stopPlayback() {
    this.state.setPlaying(false);
    const iconPlay = this.container.querySelector('#tl-icon-play');
    const iconPause = this.container.querySelector('#tl-icon-pause');
    const playText = this.container.querySelector('#tl-play-text');

    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    playText.textContent = "PLAY";

    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  _updateDisplay(date, hoursOffset) {
    const epochLabel = this.container.querySelector('#tl-epoch-label');
    const jdLabel = this.container.querySelector('#tl-jd-label');
    const offsetLabel = this.container.querySelector('#tl-offset-label');

    if (epochLabel) {
      epochLabel.textContent = date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
    }
    if (offsetLabel) {
      offsetLabel.textContent = `T+${String(hoursOffset).padStart(2, '0')}h`;
    }
    if (jdLabel) {
      const jd = (date.getTime() / 86400000.0) + 2440587.5;
      jdLabel.textContent = `JD ${jd.toFixed(2)}`;
    }
  }

  updateSurvivalStatus(statusText, isAlert = false) {
    const textEl = this.container.querySelector('#tl-survival-text');
    const dotEl = this.container.querySelector('#tl-survival-dot');
    if (textEl && dotEl) {
      textEl.textContent = statusText;
      textEl.className = isAlert ? "text-xs font-bold text-red-400" : "text-xs font-bold text-emerald-400";
      dotEl.className = isAlert ? "w-2 h-2 rounded-full bg-red-400 animate-ping" : "w-2 h-2 rounded-full bg-emerald-400";
    }
  }

  renderMiniSparkline(telemetrySeries) {
    const canvas = this.container.querySelector('#tl-mini-sparkline');
    if (!canvas || !telemetrySeries || telemetrySeries.length === 0) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const N = telemetrySeries.length;

    // Draw Sunlight Area (Amber)
    ctx.fillStyle = "rgba(245, 158, 11, 0.25)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < N; i++) {
      const pt = telemetrySeries[i];
      const x = (i / (N - 1)) * w;
      const y = h * (1.0 - (pt.sunlitFraction || 0));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Draw Battery SOC line (Cyan)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const pt = telemetrySeries[i];
      const soc = pt.batterySocPercent !== undefined ? pt.batterySocPercent : 85;
      const x = (i / (N - 1)) * w;
      const y = h * (1.0 - soc / 100.0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
