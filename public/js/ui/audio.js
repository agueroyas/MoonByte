/**
 * ARTEMIS PRISM — Aerospace Tactile Audio Feedback Engine
 * Synthesizes subtle, short mechanical clicks and alert tones using the Web Audio API.
 * Adheres strictly to Section 6:
 * - Extremely short, soft click for primary interactions (~10-15ms, low gain)
 * - Muted by default on load, respects user preference persisted in localStorage
 * - No external sound downloads or untrusted audio assets
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    this.enabled = isBrowser ? (localStorage.getItem('artemis_sound_enabled') === 'true') : false;
  }

  _initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    localStorage.setItem('artemis_sound_enabled', this.enabled ? 'true' : 'false');
    if (this.enabled) {
      this._initContext();
      this.playClick(880, 0.04);
    }
    return this.enabled;
  }

  isSoundEnabled() {
    return this.enabled;
  }

  /**
   * Subtle aerospace mechanical click
   */
  playClick(freq = 1200, vol = 0.03) {
    if (!this.enabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, this.ctx.currentTime + 0.012);

      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.012);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.015);
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }

  /**
   * Subtle affirmative chime for successful verification/planning
   */
  playAffirmative() {
    if (!this.enabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [587.33, 880].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.025, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.09);
      });
    } catch (e) {}
  }

  /**
   * Low soft caution tone for hard-constraint vetoes
   */
  playCaution() {
    if (!this.enabled) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.1);

      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {}
  }
}

export const soundManager = new AudioEngine();
