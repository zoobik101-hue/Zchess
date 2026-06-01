/* =============================================
   ZChess - Game replay viewer (profile / history)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const PIECES_BASE = 'assets/pieces/cburnett';

const GameReplay = {
  _game: null,
  _state: null,
  _ply: 0,
  _autoplayTimer: null,
  _flipped: false,

  open(game) {
    if (!game || !game.moveHistory || !game.moveHistory.length) {
      ZChess.Notifications?.info(t('replay.unavailable') || 'Replay unavailable');
      return;
    }

    this._game = game;
    this._ply = 0;
    this._flipped = game.playerColor === 'b';
    this._stopAutoplay();
    this._rebuildState();

    const overlay = document.getElementById('game-replay-overlay');
    if (!overlay) return;

    this._fillMeta();
    this._renderBoard();
    this._renderMoveList();
    this._updateControls();

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close() {
    this._stopAutoplay();
    document.getElementById('game-replay-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
    this._game = null;
    this._state = null;
  },

  _rebuildState() {
    const engine = ZChess.Engine;
    let state = engine.createInitialState();

    for (let i = 0; i < this._ply; i++) {
      const spec = this._game.moveHistory[i];
      const move = this._resolveMove(state, spec);
      if (!move) break;
      state = engine.applyMove(state, move);
    }

    this._state = state;
  },

  _resolveMove(state, spec) {
    const engine = ZChess.Engine;
    const legal = engine.getLegalMoves(state);
    return legal.find(m =>
      m.from.row === spec.from.row && m.from.col === spec.from.col &&
      m.to.row === spec.to.row && m.to.col === spec.to.col &&
      (m.promotion || null) === (spec.promotion || null) &&
      (m.castling || null) === (spec.castling || null)
    ) || null;
  },

  _fillMeta() {
    const g = this._game;
    const title = document.getElementById('replay-title');
    const sub = document.getElementById('replay-subtitle');
    if (title) {
      title.textContent = ZChess.formatGameOpponent
        ? ZChess.formatGameOpponent(g)
        : (g.opponent || '-');
    }
    if (sub) {
      const parts = [];
      if (g.date) parts.push(new Date(g.date).toLocaleString());
      if (g.durationSec != null && ZChess.formatDuration) {
        parts.push(ZChess.formatDuration(g.durationSec));
      }
      parts.push(`${g.moves || g.moveHistory.length} ${t('profile.moves_label')}`);
      if (g.playerColor) {
        parts.push(g.playerColor === 'w' ? t('profile.you_white') : t('profile.you_black'));
      }
      sub.textContent = parts.join(' · ');
    }

    const badge = document.getElementById('replay-outcome-badge');
    if (badge) {
      const oc = g.outcome === 'win' ? 'success' : g.outcome === 'loss' ? 'error' : 'primary';
      badge.className = `badge badge-${oc}`;
      badge.textContent = t(`profile.outcome_${g.outcome || 'draw'}`);
    }

    const rating = document.getElementById('replay-rating-delta');
    if (rating && g.ratingChange != null) {
      const rc = g.ratingChange;
      rating.textContent = rc >= 0 ? `+${rc}` : `${rc}`;
      rating.className = `replay-rating-delta ${rc > 0 ? 'positive' : rc < 0 ? 'negative' : ''}`;
      rating.style.display = '';
    } else if (rating) {
      rating.style.display = 'none';
    }
  },

  _renderBoard() {
    const boardEl = document.getElementById('replay-board');
    if (!boardEl || !this._state) return;

    const { board } = this._state;
    const last = this._ply > 0 ? this._game.moveHistory[this._ply - 1] : null;

    let html = '';
    for (let sr = 7; sr >= 0; sr--) {
      for (let sc = 0; sc < 8; sc++) {
        const br = this._flipped ? 7 - sr : sr;
        const bc = this._flipped ? 7 - sc : sc;
        const light = (br + bc) % 2 === 1;
        const piece = board[br][bc];
        const isLastFrom = last && last.from.row === br && last.from.col === bc;
        const isLastTo = last && last.to.row === br && last.to.col === bc;
        let inner = '';
        if (piece) {
          inner = `<img src="${PIECES_BASE}/${piece.color}${piece.type}.svg" alt="" draggable="false">`;
        }
        html += `<div class="replay-square ${light ? 'light' : 'dark'}${isLastFrom ? ' last-from' : ''}${isLastTo ? ' last-to' : ''}" data-r="${br}" data-c="${bc}">${inner}</div>`;
      }
    }
    boardEl.innerHTML = html;
  },

  _renderMoveList() {
    const el = document.getElementById('replay-move-list');
    if (!el) return;

    const hist = this._game.moveHistory;
    let html = `<div class="replay-move-row replay-move-start${this._ply === 0 ? ' active' : ''}" data-ply="0">${t('replay.start')}</div>`;

    for (let i = 0; i < hist.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const w = hist[i];
      const b = hist[i + 1];
      const wActive = this._ply === i + 1;
      const bActive = b && this._ply === i + 2;

      html += `<div class="replay-move-pair">
        <span class="replay-move-num">${num}.</span>
        <button type="button" class="replay-move-btn${wActive ? ' active' : ''}" data-ply="${i + 1}">${w?.notation || ''}</button>
        ${b ? `<button type="button" class="replay-move-btn${bActive ? ' active' : ''}" data-ply="${i + 2}">${b.notation || ''}</button>` : '<span class="replay-move-empty"></span>'}
      </div>`;
    }

    el.innerHTML = html;

    el.querySelectorAll('[data-ply]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.goToPly(+btn.dataset.ply);
      });
    });

    const active = el.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  _updateControls() {
    const max = this._game.moveHistory.length;
    const plyLabel = document.getElementById('replay-ply-label');
    if (plyLabel) {
      plyLabel.textContent = `${this._ply} / ${max}`;
    }

    const ids = ['replay-first', 'replay-prev', 'replay-next', 'replay-last'];
    const states = [this._ply <= 0, this._ply <= 0, this._ply >= max, this._ply >= max];
    ids.forEach((id, i) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = states[i];
    });
  },

  goToPly(ply) {
    const max = this._game.moveHistory.length;
    this._ply = Math.max(0, Math.min(max, ply));
    this._rebuildState();
    this._renderBoard();
    this._renderMoveList();
    this._updateControls();
  },

  first() { this.goToPly(0); },
  prev() { this.goToPly(this._ply - 1); },
  next() { this.goToPly(this._ply + 1); },
  last() { this.goToPly(this._game.moveHistory.length); },

  toggleFlip() {
    this._flipped = !this._flipped;
    this._renderBoard();
  },

  toggleAutoplay() {
    if (this._autoplayTimer) {
      this._stopAutoplay();
      return;
    }
    const btn = document.getElementById('replay-play');
    if (btn) btn.textContent = '⏸';

    this._autoplayTimer = setInterval(() => {
      if (this._ply >= this._game.moveHistory.length) {
        this._stopAutoplay();
        return;
      }
      this.next();
    }, 700);
  },

  _stopAutoplay() {
    if (this._autoplayTimer) {
      clearInterval(this._autoplayTimer);
      this._autoplayTimer = null;
    }
    const btn = document.getElementById('replay-play');
    if (btn) btn.textContent = '▶';
  },

  init() {
    document.getElementById('replay-close')?.addEventListener('click', () => this.close());
    document.getElementById('replay-first')?.addEventListener('click', () => this.first());
    document.getElementById('replay-prev')?.addEventListener('click', () => this.prev());
    document.getElementById('replay-next')?.addEventListener('click', () => this.next());
    document.getElementById('replay-last')?.addEventListener('click', () => this.last());
    document.getElementById('replay-play')?.addEventListener('click', () => this.toggleAutoplay());
    document.getElementById('replay-flip')?.addEventListener('click', () => this.toggleFlip());

    document.getElementById('game-replay-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'game-replay-overlay') this.close();
    });

    document.addEventListener('keydown', (e) => {
      const overlay = document.getElementById('game-replay-overlay');
      if (!overlay?.classList.contains('open')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });
  }
};

window.ZChess.GameReplay = GameReplay;

document.addEventListener('DOMContentLoaded', () => GameReplay.init());

console.log('[ZChess] GameReplay loaded');

})();
