/* =============================================
   ZChess - Post-game review (moves + engine hints)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const GameReview = {
  _lastAnalysis: null,

  moveKey(m) {
    if (!m) return '';
    return `${m.from.row},${m.from.col}-${m.to.row},${m.to.col}-${m.promotion || ''}`;
  },

  playerEval(state, playerColor) {
    const e = ZChess.AI.evaluate(state);
    return playerColor === 'w' ? e : -e;
  },

  /**
   * Analyze player moves vs engine best (medium depth).
   * Returns { moves: [{ply, notation, side, quality, bestNotation}], summary }
   */
  analyze(history, playerColor) {
    const engine = ZChess.Engine;
    const AI = ZChess.AI;
    let state = engine.createInitialState();
    const moves = [];
    let bestCount = 0;
    let goodCount = 0;
    let inaccuracyCount = 0;
    let blunderCount = 0;

    for (let i = 0; i < history.length; i++) {
      const played = history[i];
      const isPlayer = state.turn === playerColor;

      if (isPlayer) {
        const best = AI.getBestMove(state, 'medium');
        const bestNotation = best ? engine.getMoveNotation(best, state) : '';
        let quality = 'good';
        let bestLabel = bestNotation;

        if (best && this.moveKey(played) === this.moveKey(best)) {
          quality = 'best';
          bestCount++;
        } else if (best) {
          const afterPlayed = this.playerEval(engine.applyMove(state, played), playerColor);
          const afterBest = this.playerEval(engine.applyMove(state, best), playerColor);
          const loss = afterBest - afterPlayed;
          if (loss > 200) {
            quality = 'blunder';
            blunderCount++;
          } else if (loss > 80 || before - afterPlayed > 120) {
            quality = 'inaccuracy';
            inaccuracyCount++;
          } else {
            goodCount++;
          }
        } else {
          goodCount++;
        }

        moves.push({
          ply: i + 1,
          notation: played.notation || '',
          side: playerColor,
          quality,
          bestNotation: bestLabel
        });
      }

      state = engine.applyMove(state, played);
    }

    const playerMoves = moves.length;
    const summary = {
      playerMoves,
      best: bestCount,
      good: goodCount,
      inaccuracy: inaccuracyCount,
      blunder: blunderCount
    };

    this._lastAnalysis = { moves, summary, playerColor };
    return this._lastAnalysis;
  },

  analyzeAsync(history, playerColor) {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          resolve(this.analyze(history, playerColor));
        } catch (e) {
          console.warn('[GameReview]', e);
          resolve(null);
        }
      }, 50);
    });
  },

  qualityIcon(q) {
    const map = {
      best: '★',
      good: '✓',
      inaccuracy: '?!',
      blunder: '??'
    };
    return map[q] || '·';
  },

  qualityLabel(q) {
    const key = `review.${q}`;
    return typeof t === 'function' ? t(key) : q;
  },

  render(container, analysis) {
    if (!container || !analysis) return;

    const { moves, summary } = analysis;
    if (!moves.length) {
      container.innerHTML = `<p class="review-empty">${typeof t === 'function' ? t('review.no_moves') : 'No moves'}</p>`;
      return;
    }

    const rows = moves.map((m) => {
      const qClass = `review-q-${m.quality}`;
      const hint = m.quality !== 'best' && m.bestNotation
        ? `<span class="review-best-hint">${typeof t === 'function' ? t('review.best_was') : 'Best'}: <strong>${m.bestNotation}</strong></span>`
        : '';

      return `
        <div class="review-move-row ${qClass}">
          <span class="review-move-san">${m.notation}</span>
          <span class="review-move-badge ${qClass}" title="${this.qualityLabel(m.quality)}">${this.qualityIcon(m.quality)}</span>
          ${hint}
        </div>
      `;
    }).join('');

    const sumHtml = `
      <div class="review-summary">
        <span class="review-sum-best">★ ${summary.best}</span>
        <span class="review-sum-good">✓ ${summary.good}</span>
        <span class="review-sum-inacc">?! ${summary.inaccuracy}</span>
        <span class="review-sum-blund">?? ${summary.blunder}</span>
      </div>
    `;

    container.innerHTML = sumHtml + `<div class="review-moves-scroll">${rows}</div>`;
  },

  showLoading(container) {
    if (!container) return;
    container.innerHTML = `<p class="review-loading">${typeof t === 'function' ? t('review.analyzing') : 'Analyzing...'}</p>`;
  }
};

window.ZChess.GameReview = GameReview;

console.log('[ZChess] GameReview loaded');

})();
