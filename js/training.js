/* =============================================
   ZChess - Training & Coaching Module
   Lessons, move quality, hints, progress
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const STORAGE_KEY = 'zchess_training_progress';

const CATEGORIES = [
  { id: 'basics',     icon: '📚', titleKey: 'training.cat_basics' },
  { id: 'tactics',    icon: '⚔️', titleKey: 'training.cat_tactics' },
  { id: 'checkmate',  icon: '👑', titleKey: 'training.cat_checkmate' },
  { id: 'defense',    icon: '🛡️', titleKey: 'training.cat_defense' },
  { id: 'openings',   icon: '🚀', titleKey: 'training.cat_openings' },
  { id: 'endgame',    icon: '🏁', titleKey: 'training.cat_endgame' }
];

/** Parse UCI: e2e4, e7e8q, e1g1 (castling) */
function parseUci(uci) {
  const engine = ZChess.Engine;
  const from = engine.algebraicToSquare(uci.slice(0, 2));
  const to   = engine.algebraicToSquare(uci.slice(2, 4));
  const promotion = uci.length > 4 ? uci[4].toUpperCase() : null;
  return { from, to, promotion };
}

function moveMatchesExpected(move, expected) {
  if (!expected) return false;
  if (move.from.row !== expected.from.row || move.from.col !== expected.from.col) return false;
  if (move.to.row !== expected.to.row || move.to.col !== expected.to.col) return false;
  const mp = move.promotion ? move.promotion.toUpperCase() : null;
  const ep = expected.promotion ? expected.promotion.toUpperCase() : null;
  if (mp !== ep) return false;
  if (expected.castling && move.castling !== expected.castling) return false;
  return true;
}

/** Resolve solutionUci to real legal moves from FEN */
function resolveLessonMoves(lesson) {
  const engine = ZChess.Engine;
  let state = engine.parseFEN(lesson.fen);
  const expected = [];
  const uciList = lesson.solutionUci || [];

  for (const uci of uciList) {
    const spec = parseUci(uci);
    const legal = engine.getLegalMoves(state);
    let found = legal.find(m => moveMatchesExpected(m, spec));

    if (!found && uci.length === 4) {
      const toSq = spec.to;
      found = legal.find(m =>
        m.from.row === spec.from.row && m.from.col === spec.from.col &&
        m.to.row === toSq.row && m.to.col === toSq.col
      );
    }

    if (!found) {
      console.warn('[Training] Illegal solution', lesson.id, uci);
      lesson._broken = true;
      expected.push(spec);
    } else {
      expected.push({
        from: { ...found.from },
        to: { ...found.to },
        promotion: found.promotion || null,
        castling: found.castling || null,
        _legal: true
      });
      state = engine.applyMove(state, found);
    }
  }

  lesson._expected = expected;
  lesson.maxMoves = expected.length;
  return expected.length > 0 && expected.every((e, i) => lesson.solutionUci[i]);
}

/** @type {Array<object>} - FEN + solutionUci verified on board coords */
const LESSONS = [
  { id: 'basics_develop', category: 'basics', difficulty: 1,
    titleKey: 'training.lesson_basics_develop_title',
    descKey: 'training.lesson_basics_develop_desc',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    color: 'w', solutionUci: ['g1f3'] },

  { id: 'basics_center', category: 'basics', difficulty: 1,
    titleKey: 'training.lesson_basics_center_title',
    descKey: 'training.lesson_basics_center_desc',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    color: 'w', solutionUci: ['d2d4'] },

  { id: 'basics_castle', category: 'basics', difficulty: 2,
    titleKey: 'training.lesson_basics_castle_title',
    descKey: 'training.lesson_basics_castle_desc',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    color: 'w', solutionUci: ['e1g1'] },

  { id: 'tactics_fork', category: 'tactics', difficulty: 2,
    titleKey: 'training.lesson_tactics_fork_title',
    descKey: 'training.lesson_tactics_fork_desc',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    color: 'w', solutionUci: ['f3e5'] },

  { id: 'tactics_pin', category: 'tactics', difficulty: 2,
    titleKey: 'training.lesson_tactics_pin_title',
    descKey: 'training.lesson_tactics_pin_desc',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4',
    color: 'w', solutionUci: ['c4b5'] },

  { id: 'tactics_skewer', category: 'tactics', difficulty: 3,
    titleKey: 'training.lesson_tactics_skewer_title',
    descKey: 'training.lesson_tactics_skewer_desc',
    fen: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',
    color: 'w', solutionUci: ['a1a8'] },

  { id: 'tactics_discovered', category: 'tactics', difficulty: 2,
    titleKey: 'training.lesson_tactics_discovered_title',
    descKey: 'training.lesson_tactics_discovered_desc',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 3',
    color: 'w', solutionUci: ['c4f7'] },

  { id: 'mate_scholar', category: 'checkmate', difficulty: 2,
    titleKey: 'training.lesson_mate_scholar_title',
    descKey: 'training.lesson_mate_scholar_desc',
    fen: 'r1bqkb1r/pppp1ppp/4n3/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K2R w KQkq - 0 4',
    color: 'w', solutionUci: ['f3f7'] },

  { id: 'mate_back_rank', category: 'checkmate', difficulty: 2,
    titleKey: 'training.lesson_mate_back_rank_title',
    descKey: 'training.lesson_mate_back_rank_desc',
    fen: '6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1',
    color: 'w', solutionUci: ['a1a8'] },

  { id: 'mate_queen_king', category: 'checkmate', difficulty: 2,
    titleKey: 'training.lesson_mate_qk_title',
    descKey: 'training.lesson_mate_qk_desc',
    fen: '7k/4Q3/8/8/8/8/8/4K3 w - - 0 1',
    color: 'w', solutionUci: ['e7f8'] },

  { id: 'def_block_check', category: 'defense', difficulty: 2,
    titleKey: 'training.lesson_def_block_title',
    descKey: 'training.lesson_def_block_desc',
    fen: 'rnbqkbnr/pppppppp/8/4p2q/6P1/5P2/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    color: 'w', solutionUci: ['g2g3'] },

  { id: 'def_escape', category: 'defense', difficulty: 2,
    titleKey: 'training.lesson_def_escape_title',
    descKey: 'training.lesson_def_escape_desc',
    fen: '8/8/8/3Q3/4k3/8/8/8 b - - 0 1',
    color: 'b', solutionUci: ['e4d5'] },

  { id: 'def_hanging', category: 'defense', difficulty: 1,
    titleKey: 'training.lesson_def_hanging_title',
    descKey: 'training.lesson_def_hanging_desc',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    color: 'w', solutionUci: ['e2e4'] },

  { id: 'open_italian', category: 'openings', difficulty: 2,
    titleKey: 'training.lesson_open_italian_title',
    descKey: 'training.lesson_open_italian_desc',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    color: 'w', solutionUci: ['e1g1'] },

  { id: 'open_sicilian', category: 'openings', difficulty: 2,
    titleKey: 'training.lesson_open_sicilian_title',
    descKey: 'training.lesson_open_sicilian_desc',
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    color: 'w', solutionUci: ['b1c3'] },

  { id: 'end_promote', category: 'endgame', difficulty: 2,
    titleKey: 'training.lesson_end_promote_title',
    descKey: 'training.lesson_end_promote_desc',
    fen: '8/4P3/8/8/8/8/8/4K2k w - - 0 1',
    color: 'w', solutionUci: ['e7e8q'] },

  { id: 'end_kq_vs_k', category: 'endgame', difficulty: 2,
    titleKey: 'training.lesson_end_kq_title',
    descKey: 'training.lesson_end_kq_desc',
    fen: '7k/4Q3/8/8/8/8/8/4K3 w - - 0 1',
    color: 'w', solutionUci: ['e7f8'] }
];

LESSONS.forEach(les => resolveLessonMoves(les));

function validateAllLessons() {
  const broken = LESSONS.filter(l => {
    if (!l._expected?.length) return true;
    return l.solutionUci.some((uci, i) => {
      const e = l._expected[i];
      return !e || !l._expected[i].from ||
        (l._expected[i].from.row === undefined);
    });
  });
  if (broken.length) {
    console.error('[Training] Broken lessons:', broken.map(b => b.id).join(', '));
  }
}
validateAllLessons();

const Training = {
  active: false,
  mode: null,       // 'puzzle' | 'coach'
  lesson: null,
  coachDifficulty: 'beginner',
  _moveIndex: 0,
  _hintsUsed: 0,
  _evalBefore: 0,
  _stateBefore: null,
  _progress: { completed: {}, stats: { excellent: 0, good: 0, inaccuracy: 0, blunder: 0 } },

  init() {
    this._loadProgress();
    this._bindUI();
  },

  _loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this._progress = { ...this._progress, ...JSON.parse(raw) };
    } catch (_) {}
  },

  _saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._progress));
  },

  getCategories() { return CATEGORIES; },
  getLessons(catId) {
    return LESSONS.filter(l => !catId || l.category === catId);
  },
  getLesson(id) { return LESSONS.find(l => l.id === id); },

  isLessonComplete(id) {
    return !!this._progress.completed[id];
  },

  /** Render catalog into #training-catalog */
  renderCatalog(selectedCategory) {
    const wrap = document.getElementById('training-catalog');
    if (!wrap) return;

    const cat = selectedCategory || 'basics';
    const lessons = this.getLessons(cat);

    wrap.innerHTML = `
      <div class="training-cat-tabs">
        ${CATEGORIES.map(c => `
          <button type="button" class="training-cat-tab ${c.id === cat ? 'active' : ''}" data-cat="${c.id}">
            <span>${c.icon}</span>
            <span data-i18n="${c.titleKey}">${typeof t === 'function' ? t(c.titleKey) : c.id}</span>
          </button>
        `).join('')}
      </div>
      <div class="training-lessons-grid">
        ${lessons.map(les => this._lessonCardHTML(les)).join('')}
      </div>
      <div class="training-coach-block">
        <div class="training-coach-card">
          <div class="training-coach-icon">🎓</div>
          <div>
            <h4 data-i18n="training.coach_title">${t('training.coach_title')}</h4>
            <p data-i18n="training.coach_desc">${t('training.coach_desc')}</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-start-coach" data-i18n="training.coach_start">${t('training.coach_start')}</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll('.training-cat-tab').forEach(btn => {
      btn.addEventListener('click', () => this.renderCatalog(btn.dataset.cat));
    });

    wrap.querySelectorAll('[data-lesson-id]').forEach(btn => {
      btn.addEventListener('click', () => this.startLesson(btn.dataset.lessonId));
    });

    document.getElementById('btn-start-coach')?.addEventListener('click', () => this.startCoachGame());
  },

  _lessonCardHTML(les) {
    const done = this.isLessonComplete(les.id);
    const stars = '★'.repeat(les.difficulty) + '☆'.repeat(3 - les.difficulty);
    return `
      <div class="training-lesson-card ${done ? 'completed' : ''}">
        <div class="tlc-top">
          <span class="tlc-diff">${stars}</span>
          ${done ? '<span class="tlc-done">✓</span>' : ''}
        </div>
        <h4 data-i18n="${les.titleKey}">${t(les.titleKey)}</h4>
        <p data-i18n="${les.descKey}">${t(les.descKey)}</p>
        <button type="button" class="btn btn-secondary btn-sm" data-lesson-id="${les.id}" data-i18n="training.start_lesson">${t('training.start_lesson')}</button>
      </div>
    `;
  },

  _bindUI() {
    document.getElementById('btn-training-hint')?.addEventListener('click', () => this.showHint());
    document.getElementById('btn-training-reset')?.addEventListener('click', () => this.resetLesson());
    document.getElementById('btn-training-exit')?.addEventListener('click', () => this.exitTraining());
  },

  startLesson(lessonId) {
    const lesson = this.getLesson(lessonId);
    if (!lesson) return;

    resolveLessonMoves(lesson);
    if (!lesson._expected?.length) {
      ZChess.Notifications?.error(t('training.lesson_error'));
      return;
    }

    this.active = true;
    this.mode = 'puzzle';
    this.lesson = lesson;
    this._moveIndex = 0;
    this._hintsUsed = 0;

    ZChess.App._skipPlayResume = true;
    ZChess.App.navigate('play');
    setTimeout(() => {
      ZChess.ChessBoard.startTrainingLesson(lesson);
      this._showPanel(true);
      this._updateLessonUI();
      ZChess.App._skipPlayResume = false;
    }, 120);
  },

  startCoachGame() {
    const color = ZChess.App.gameSetupOptions?.playerColor || 'w';
    let playerColor = color;
    if (playerColor === 'r') playerColor = Math.random() < 0.5 ? 'w' : 'b';

    this.active = true;
    this.mode = 'coach';
    this.lesson = null;
    this.coachDifficulty = 'beginner';
    this._moveIndex = 0;
    this._hintsUsed = 0;

    ZChess.App._skipPlayResume = true;
    ZChess.App.navigate('play');
    setTimeout(() => {
      ZChess.ChessBoard.startGame({
        mode: 'training',
        trainingMode: 'coach',
        difficulty: 'beginner',
        playerColor
      });
      this._showPanel(true);
      this._setCoachUI();
      ZChess.App._skipPlayResume = false;
    }, 120);
  },

  cleanup() {
    this.active = false;
    this.mode = null;
    this.lesson = null;
    if (ZChess.ChessBoard) {
      ZChess.ChessBoard.trainingMode = false;
      ZChess.ChessBoard.trainingPuzzle = false;
    }
    this._showPanel(false);
  },

  exitTraining() {
    this.cleanup();
    ZChess.App.navigate('game');
    ZChess.App.gameSetupOptions.mode = 'training';
    ZChess.App.renderGameSetup();
  },

  resetLesson() {
    if (!this.lesson) return;
    this._moveIndex = 0;
    this._hintsUsed = 0;
    resolveLessonMoves(this.lesson);
    ZChess.ChessBoard.clearTrainingHint?.();
    ZChess.ChessBoard.startTrainingLesson(this.lesson);
    this._updateLessonUI();
  },

  _showPanel(show) {
    const panel = document.getElementById('training-panel');
    if (panel) panel.style.display = show ? '' : 'none';
    const undo = document.getElementById('btn-undo-move');
    if (undo) undo.style.display = (show && this.mode === 'coach') ? '' : (show ? 'none' : '');
  },

  _updateLessonUI() {
    const les = this.lesson;
    if (!les) return;
    const title = document.getElementById('training-lesson-title');
    const desc  = document.getElementById('training-lesson-desc');
    const step  = document.getElementById('training-step');
    if (title) title.textContent = t(les.titleKey);
    if (desc)  desc.textContent  = t(les.descKey);
    if (step) {
      const goal = this._formatExpectedMove();
      step.textContent = t('training.step_goal', {
        current: this._moveIndex + 1,
        max: les.maxMoves || 1,
        move: goal || '—'
      });
    }
    this._clearFeedback();
    ZChess.ChessBoard?.clearTrainingHint?.();
  },

  _setCoachUI() {
    const title = document.getElementById('training-lesson-title');
    const desc  = document.getElementById('training-lesson-desc');
    const step  = document.getElementById('training-step');
    if (title) title.textContent = t('training.coach_title');
    if (desc)  desc.textContent  = t('training.coach_desc');
    if (step)  step.textContent  = t('training.coach_live');
    this._clearFeedback();
  },

  _clearFeedback() {
    const fb = document.getElementById('training-feedback');
    if (fb) fb.className = 'training-feedback';
    const pct = document.getElementById('training-move-pct');
    if (pct) pct.textContent = '—';
    const bar = document.getElementById('training-quality-bar');
    if (bar) bar.style.width = '0%';
  },

  showHint() {
    if (this.mode === 'coach') {
      this._showFeedback('hint', t('training.coach_hint_generic'), 0);
      return;
    }

    const les = this.lesson;
    const exp = les?._expected?.[this._moveIndex];
    if (!exp) return;

    const engine = ZChess.Engine;
    const fromSq = engine.squareToAlgebraic(exp.from.row, exp.from.col);
    const toSq   = engine.squareToAlgebraic(exp.to.row, exp.to.col);
    let promo = '';
    if (exp.promotion) promo = ' → ' + t('training.promote_queen');

    ZChess.ChessBoard?.showTrainingHint(exp.from.row, exp.from.col, exp.to.row, exp.to.col);
    this._hintsUsed++;
    this._showFeedback('hint', t('training.hint_move', { from: fromSq, to: toSq }) + promo, 0);
  },

  /** Called before player move in training */
  onBeforePlayerMove(state) {
    this._stateBefore = ZChess.Engine.cloneState(state);
    this._evalBefore = this._evalForPlayer(state);
  },

  isPuzzleMoveCorrect(move) {
    if (this.mode !== 'puzzle' || !this.lesson) return true;
    return this._checkPuzzleMove(move);
  },

  async onPuzzleWrongMove(move) {
    const engine = ZChess.Engine;
    let stateAfter = this._stateBefore;
    if (this._stateBefore) {
      stateAfter = engine.applyMove(engine.cloneState(this._stateBefore), move);
    }
    const analysis = await this._analyzeMove(stateAfter, move);
    const expected = this._formatExpectedMove();
    const msg = t('training.puzzle_wrong') + (expected ? ' ' + t('training.try_move', { move: expected }) : '');
    this._showFeedback(analysis.quality, msg, analysis.pct);
    if (ZChess.Sound) ZChess.Sound.playLose?.();
  },

  /** Called after player move (applied on board) */
  async onPlayerMove(move, stateAfter) {
    if (!this.active) return;

    if (this.mode === 'puzzle' && this.lesson) {
      this._moveIndex++;
      if (this._moveIndex >= (this.lesson.maxMoves || 1)) {
        this._completeLesson();
        return;
      }
      this._updateLessonUI();
      this._showFeedback('excellent', t('training.puzzle_correct'), 98);
      if (ZChess.Sound) ZChess.Sound.playMove?.();
      return;
    }

    if (this.mode === 'coach') {
      const analysis = await this._analyzeMove(stateAfter, move);
      this._showFeedback(analysis.quality, analysis.message, analysis.pct);
      this._trackStat(analysis.quality);
    }
  },

  _checkPuzzleMove(move) {
    const exp = this.lesson?._expected?.[this._moveIndex];
    if (!exp || !exp._legal) return false;
    return moveMatchesExpected(move, exp);
  },

  _formatExpectedMove() {
    const exp = this.lesson?._expected?.[this._moveIndex];
    if (!exp) return '';
    const engine = ZChess.Engine;
    return engine.squareToAlgebraic(exp.from.row, exp.from.col) +
      ' → ' + engine.squareToAlgebraic(exp.to.row, exp.to.col);
  },

  _completeLesson() {
    this._progress.completed[this.lesson.id] = Date.now();
    this._saveProgress();
    this._showFeedback('excellent', t('training.lesson_complete'), 100);
    ZChess.Notifications?.success(t('training.lesson_complete'));
    if (ZChess.Sound) ZChess.Sound.playWin?.();
    setTimeout(() => {
      this.cleanup();
      ZChess.App.navigate('game');
      ZChess.App.gameSetupOptions.mode = 'training';
      ZChess.App.renderGameSetup();
    }, 2200);
  },

  _trackStat(quality) {
    if (this._progress.stats[quality] !== undefined) {
      this._progress.stats[quality]++;
      this._saveProgress();
    }
  },

  _evalForPlayer(state) {
    const ev = ZChess.AI.evaluate(state);
    const c = ZChess.ChessBoard.playerColor || 'w';
    return c === 'w' ? ev : -ev;
  },

  async _analyzeMove(stateAfter, playedMove) {
    const engine = ZChess.Engine;
    const ai = ZChess.AI;

    const evalBefore = this._evalBefore;
    const evalAfter  = this._evalForPlayer(stateAfter);
    const cpLoss = Math.max(0, evalBefore - evalAfter);

    let bestMove = null;
    if (this._stateBefore) {
      try {
        bestMove = ai.getBestMove(this._stateBefore, 'medium');
      } catch (_) {}
    }

    const isBest = bestMove && this._movesEqual(playedMove, bestMove);
    let quality, pct;

    if (isBest || cpLoss <= 25) {
      quality = 'excellent';
      pct = isBest ? 96 + Math.floor(Math.random() * 4) : 88 + Math.min(10, Math.floor(25 - cpLoss));
    } else if (cpLoss <= 70) {
      quality = 'good';
      pct = 72 + Math.max(0, 15 - Math.floor(cpLoss / 5));
    } else if (cpLoss <= 180) {
      quality = 'inaccuracy';
      pct = 45 + Math.max(0, 25 - Math.floor(cpLoss / 8));
    } else {
      quality = 'blunder';
      pct = Math.max(5, 35 - Math.floor(cpLoss / 15));
    }

    const msgKey = `training.feedback_${quality}`;
    let message = t(msgKey);
    if (bestMove && quality !== 'excellent') {
      const alg = engine.squareToAlgebraic(bestMove.from.row, bestMove.from.col) +
        engine.squareToAlgebraic(bestMove.to.row, bestMove.to.col);
      message += ' ' + t('training.best_was', { move: alg });
    }

    return { quality, message, pct, cpLoss };
  },

  _movesEqual(a, b) {
    if (!a || !b) return false;
    return a.from.row === b.from.row && a.from.col === b.from.col &&
      a.to.row === b.to.row && a.to.col === b.to.col &&
      (a.promotion || '') === (b.promotion || '');
  },

  _showFeedback(quality, message, pct) {
    const fb = document.getElementById('training-feedback');
    const pctEl = document.getElementById('training-move-pct');
    const bar = document.getElementById('training-quality-bar');
    const msg = document.getElementById('training-feedback-msg');

    if (fb) {
      fb.className = `training-feedback quality-${quality}`;
    }
    if (msg) msg.textContent = message;
    if (pctEl && pct > 0) pctEl.textContent = `${pct}%`;
    if (bar) {
      bar.style.width = `${Math.min(100, pct)}%`;
      bar.className = `training-quality-fill quality-${quality}`;
    }

    const labels = {
      excellent: t('training.quality_excellent'),
      good: t('training.quality_good'),
      inaccuracy: t('training.quality_inaccuracy'),
      blunder: t('training.quality_blunder'),
      hint: t('training.hint_label')
    };
    const ql = document.getElementById('training-quality-label');
    if (ql) ql.textContent = labels[quality] || quality;
  }
};

Training.prepareLesson = resolveLessonMoves;

window.ZChess.Training = Training;
console.log('[ZChess] Training module loaded');

})();
