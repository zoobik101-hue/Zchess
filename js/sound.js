/* =============================================
   ZChess - Sound Effects Engine
   Realistic synthesized sounds via Web Audio API
   Wood hits, metal rings, fanfares
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Sound = {
  ctx: null,
  enabled: true,
  masterVolume: 0.75,
  _masterGain: null,

  init() {
    this.enabled = ZChess.Settings.get('sounds') !== false;

    const resume = () => {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this._masterGain = this.ctx.createGain();
          this._masterGain.gain.value = this.masterVolume;
          this._masterGain.connect(this.ctx.destination);
        } catch (e) {
          console.warn('[Sound] Web Audio API unavailable');
        }
      } else if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };

    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });

    document.addEventListener('settingschange', (e) => {
      this.enabled = e.detail.sounds !== false;
    });
  },

  // --- Core synthesis helpers ---

  // Short white noise burst (for woody "thud" sounds)
  _noise(duration, volume = 0.5, filterFreq = 2000, filterQ = 1) {
    if (!this.ctx || !this._masterGain) return;
    const frames = Math.ceil(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    source.start();
    source.stop(this.ctx.currentTime + duration + 0.01);
  },

  // Single synthesized tone with ADSR
  _tone(freq, duration, type = 'sine', volume = 0.5, attack = 0.01, delay = 0) {
    if (!this.ctx || !this._masterGain) return;
    const t = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + attack);
    gain.gain.setValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  },

  // Pitched tone with frequency ramp (for impact sounds)
  _tonePitch(freqStart, freqEnd, duration, type = 'triangle', volume = 0.5, delay = 0) {
    if (!this.ctx || !this._masterGain) return;
    const t = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);

    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this._masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  },

  // Multiple harmonics for richer sound
  _chord(freqs, duration, type = 'sine', volume = 0.3, delay = 0) {
    freqs.forEach(f => this._tone(f, duration, type, volume, 0.005, delay));
  },

  // --- Chess Sound Effects ---

  // Woody "click" when piece is placed
  playMove() {
    if (!this.enabled) return;
    // Wood thud: noise burst + pitched click
    this._noise(0.06, 0.45, 1200, 2);
    this._tonePitch(320, 180, 0.08, 'triangle', 0.22);
    this._tone(800, 0.04, 'sine', 0.08, 0.005, 0.01);
  },

  // Heavier impact for capture
  playCapture() {
    if (!this.enabled) return;
    this._noise(0.12, 0.6, 600, 1.5);
    this._tonePitch(240, 100, 0.14, 'sawtooth', 0.28);
    this._noise(0.05, 0.3, 2500, 3, 0.04);
    this._tone(160, 0.18, 'triangle', 0.18, 0.005, 0.03);
  },

  // Alert bell for check
  playCheck() {
    if (!this.enabled) return;
    // Metallic bell-like ring
    this._chord([1320, 1760, 2093], 0.6, 'sine', 0.2);
    this._tone(880, 0.5, 'triangle', 0.15, 0.003, 0.05);
    this._tone(1100, 0.35, 'sine', 0.12, 0.003, 0.18);
  },

  // Dramatic descend for checkmate
  playCheckmate() {
    if (!this.enabled) return;
    const notes = [
      { f: 880, t: 0,    d: 0.35 },
      { f: 740, t: 0.28, d: 0.35 },
      { f: 622, t: 0.56, d: 0.4  },
      { f: 440, t: 0.84, d: 0.8  },
    ];
    notes.forEach(n => {
      this._tone(n.f, n.d, 'sine', 0.45, 0.01, n.t);
      this._tone(n.f * 0.5, n.d, 'triangle', 0.2, 0.01, n.t);
    });
    this._noise(0.08, 0.25, 300, 0.5, 0.1);
  },

  // Victory fanfare
  playWin() {
    if (!this.enabled) return;
    const melody = [
      { f: 523,  t: 0    },
      { f: 659,  t: 0.1  },
      { f: 784,  t: 0.2  },
      { f: 1047, t: 0.3  },
      { f: 784,  t: 0.42 },
      { f: 1047, t: 0.52 },
      { f: 1319, t: 0.62 },
    ];
    melody.forEach((n, i) => {
      this._tone(n.f, i < melody.length - 1 ? 0.16 : 0.8, 'sine', 0.45, 0.008, n.t);
      if (i % 2 === 0) this._tone(n.f * 0.5, 0.14, 'triangle', 0.15, 0.005, n.t);
    });
    this._chord([523, 659, 784], 0.9, 'sine', 0.15, 0.75);
  },

  // Somber descent for loss
  playLose() {
    if (!this.enabled) return;
    const notes = [392, 349, 330, 294, 262];
    notes.forEach((f, i) => {
      this._tone(f, 0.35, 'sine', 0.38, 0.01, i * 0.18);
      this._tone(f * 0.5, 0.3, 'triangle', 0.14, 0.005, i * 0.18);
    });
  },

  // Neutral draw sound
  playDraw() {
    if (!this.enabled) return;
    this._tone(440, 0.25, 'sine', 0.3, 0.01);
    this._tone(523, 0.25, 'sine', 0.25, 0.01, 0.2);
    this._tone(440, 0.5, 'sine', 0.2, 0.01, 0.4);
  },

  // Level up fanfare
  playLevelUp() {
    if (!this.enabled) return;
    const seq = [523, 659, 784, 659, 784, 1047, 1319];
    const times = [0, 0.09, 0.18, 0.29, 0.38, 0.48, 0.58];
    seq.forEach((f, i) => {
      this._tone(f, i < seq.length - 1 ? 0.12 : 0.7, 'sine', 0.5, 0.006, times[i]);
    });
    this._chord([659, 784, 1047], 0.8, 'sine', 0.18, 0.65);
  },

  // Achievement unlocked
  playAchievement() {
    if (!this.enabled) return;
    this._tone(784, 0.15, 'sine', 0.4, 0.01);
    this._tone(1047, 0.15, 'sine', 0.38, 0.01, 0.12);
    this._tone(1319, 0.6, 'sine', 0.45, 0.01, 0.24);
    this._chord([784, 1047, 1319], 0.55, 'sine', 0.15, 0.28);
  },

  // UI click
  playClick() {
    if (!this.enabled) return;
    this._noise(0.025, 0.3, 3000, 4);
    this._tonePitch(1400, 900, 0.04, 'triangle', 0.12);
  },

  // Notification ping
  playNotification() {
    if (!this.enabled) return;
    this._tone(1047, 0.2, 'sine', 0.3, 0.005);
    this._tone(1319, 0.2, 'sine', 0.25, 0.005, 0.15);
  },

  // Castling - double click
  playCastle() {
    if (!this.enabled) return;
    this._noise(0.06, 0.4, 1200, 2);
    this._tonePitch(300, 160, 0.08, 'triangle', 0.18);
    setTimeout(() => {
      this._noise(0.06, 0.35, 1000, 2);
      this._tonePitch(260, 140, 0.07, 'triangle', 0.15);
    }, 120);
  },

  // Pawn promotion - ascending sparkle
  playPromotion() {
    if (!this.enabled) return;
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      this._tone(f, 0.18, 'sine', 0.42, 0.007, i * 0.075);
      this._tone(f * 2, 0.1, 'sine', 0.1, 0.003, i * 0.075 + 0.01);
    });
    this._chord([1047, 1319, 1568], 0.7, 'sine', 0.2, 0.5);
  }
};

window.ZChess.Sound = Sound;

console.log('[ZChess] Sound engine loaded');

})();
