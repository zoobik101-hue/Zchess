/* =============================================
   ZChess - Sound Effects Manager
   Uses Web Audio API for crisp, low-latency sounds
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Sound = {
  ctx: null,
  enabled: true,
  masterVolume: 0.7,

  init() {
    this.enabled = ZChess.Settings.get('sounds') !== false;

    // Create context on first user interaction
    document.addEventListener('click', () => {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          console.warn('[Sound] Web Audio API not available');
        }
      }
    }, { once: true });

    document.addEventListener('settingschange', (e) => {
      this.enabled = e.detail.sounds !== false;
    });
  },

  // Create and play a tone
  playTone(frequency, duration, type = 'sine', volume = 0.5, delay = 0) {
    if (!this.enabled || !this.ctx) return;

    try {
      const oscillator = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime + delay);

      gainNode.gain.setValueAtTime(0, this.ctx.currentTime + delay);
      gainNode.gain.linearRampToValueAtTime(volume * this.masterVolume, this.ctx.currentTime + delay + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);

      oscillator.start(this.ctx.currentTime + delay);
      oscillator.stop(this.ctx.currentTime + delay + duration + 0.01);
    } catch (e) {
      // Silent fail
    }
  },

  // Synthesized sound effects
  playMove() {
    this.playTone(600, 0.08, 'triangle', 0.3);
    this.playTone(800, 0.06, 'triangle', 0.2, 0.05);
  },

  playCapture() {
    this.playTone(300, 0.12, 'sawtooth', 0.4);
    this.playTone(200, 0.15, 'triangle', 0.3, 0.05);
    this.playTone(150, 0.2, 'sine', 0.2, 0.1);
  },

  playCheck() {
    this.playTone(880, 0.1, 'square', 0.25);
    this.playTone(660, 0.1, 'square', 0.25, 0.1);
    this.playTone(880, 0.15, 'square', 0.3, 0.2);
  },

  playCheckmate() {
    // Dramatic descending tones
    this.playTone(880, 0.2, 'sine', 0.5);
    this.playTone(740, 0.2, 'sine', 0.5, 0.2);
    this.playTone(622, 0.2, 'sine', 0.5, 0.4);
    this.playTone(554, 0.5, 'sine', 0.4, 0.6);
  },

  playWin() {
    // Uplifting arpeggio
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      this.playTone(freq, 0.2, 'sine', 0.5, i * 0.12);
    });
    this.playTone(1047, 0.5, 'sine', 0.4, 0.5);
  },

  playLose() {
    // Descending tones
    const notes = [330, 294, 262, 220];
    notes.forEach((freq, i) => {
      this.playTone(freq, 0.25, 'triangle', 0.4, i * 0.15);
    });
  },

  playDraw() {
    this.playTone(440, 0.15, 'sine', 0.3);
    this.playTone(550, 0.15, 'sine', 0.3, 0.15);
    this.playTone(440, 0.3, 'sine', 0.25, 0.3);
  },

  playLevelUp() {
    // Fanfare
    const notes = [523, 659, 784, 659, 784, 1047];
    const timings = [0, 0.08, 0.16, 0.26, 0.34, 0.44];
    notes.forEach((freq, i) => {
      this.playTone(freq, 0.15, 'sine', 0.55, timings[i]);
    });
  },

  playAchievement() {
    // Triumphant chord
    this.playTone(523, 0.4, 'sine', 0.4);
    this.playTone(659, 0.4, 'sine', 0.35, 0.05);
    this.playTone(784, 0.4, 'sine', 0.35, 0.1);
    this.playTone(1047, 0.6, 'sine', 0.45, 0.15);
  },

  playClick() {
    this.playTone(1200, 0.04, 'square', 0.15);
  },

  playNotification() {
    this.playTone(880, 0.1, 'sine', 0.3);
    this.playTone(1100, 0.1, 'sine', 0.25, 0.12);
  },

  playCastle() {
    this.playTone(400, 0.1, 'triangle', 0.3);
    this.playTone(500, 0.1, 'triangle', 0.3, 0.08);
    this.playTone(600, 0.12, 'triangle', 0.3, 0.16);
  },

  playPromotion() {
    const notes = [523, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      this.playTone(freq, 0.15, 'sine', 0.5, i * 0.1);
    });
  }
};

window.ZChess.Sound = Sound;

console.log('[ZChess] Sound module loaded');

})();
