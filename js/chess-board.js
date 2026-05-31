/* =============================================
   ZChess - Chess Board UI Controller
   OPTIMIZED: Persistent DOM, incremental updates,
   event delegation, zero innerHTML resets per move
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const ChessBoard = {
  gameState: null,
  selectedSquare: null,
  legalMovesForSelected: [],
  flipped: false,
  isAIGame: false,
  aiDifficulty: 'medium',
  playerColor: 'w',
  isThinking: false,
  gameOver: false,
  undoHistory: [],

  // Persistent square DOM elements [row][col]
  _squares: null,
  // Track previous board to only update changed squares
  _prevPieces: null,

  SYMBOLS: {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
  },

  // =========================================
  // BOARD INITIALIZATION - runs once
  // =========================================

  initBoard() {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl || this._squares) return;

    this._squares = Array.from({ length: 8 }, () => new Array(8));
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));

    const frag = document.createDocumentFragment();

    for (let sr = 7; sr >= 0; sr--) {
      for (let sc = 0; sc < 8; sc++) {
        const el = document.createElement('div');
        const br = this.flipped ? 7 - sr : sr;
        const bc = this.flipped ? 7 - sc : sc;
        el.className = `chess-square ${(br + bc) % 2 === 1 ? 'light' : 'dark'}`;
        el.dataset.row = br;
        el.dataset.col = bc;
        this._squares[br][bc] = el;
        frag.appendChild(el);
      }
    }

    boardEl.appendChild(frag);

    // Event delegation - ONE listener for the entire board
    boardEl.addEventListener('click', (e) => {
      const sq = e.target.closest('.chess-square');
      if (sq) this.handleSquareClick(+sq.dataset.row, +sq.dataset.col);
    });

    // Drag & Drop delegation
    boardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    boardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const sq = e.target.closest('.chess-square');
      if (!sq || !this.dragSource) return;
      const toRow = +sq.dataset.row;
      const toCol = +sq.dataset.col;
      if (!isNaN(toRow) && !isNaN(toCol)) {
        this.handleSquareClick(toRow, toCol);
      }
      this.dragSource = null;
    });
  },

  // =========================================
  // INCREMENTAL RENDER
  // Only updates what actually changed
  // =========================================

  render() {
    if (!this._squares) {
      this.initBoard();
    }

    const { board } = this.gameState;
    const engine = ZChess.Engine;
    const inCheck = engine.isInCheck(board, this.gameState.turn);
    const kingSquare = inCheck ? engine.findKing(board, this.gameState.turn) : null;
    const lastMove = this.gameState.history.length > 0
      ? this.gameState.history[this.gameState.history.length - 1]
      : null;

    // Build legal move set for O(1) lookup
    const legalSet = new Set();
    const captureSet = new Set();
    for (const m of this.legalMovesForSelected) {
      const key = `${m.to.row},${m.to.col}`;
      legalSet.add(key);
      if (m.capture || m.enPassant) captureSet.add(key);
    }

    const sel = this.selectedSquare;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const el = this._squares[r][c];
        const piece = board[r][c];
        const key = `${r},${c}`;

        // --- Class names (no DOM creation, just string compare) ---
        const isLight = (r + c) % 2 === 1;
        let cls = `chess-square ${isLight ? 'light' : 'dark'}`;

        if (sel && sel.row === r && sel.col === c) cls += ' selected';
        if (kingSquare && kingSquare.row === r && kingSquare.col === c) cls += ' king-check';
        if (lastMove) {
          if (lastMove.from.row === r && lastMove.from.col === c) cls += ' last-move-from';
          if (lastMove.to.row === r && lastMove.to.col === c) cls += ' last-move-to';
        }
        if (legalSet.has(key)) {
          cls += captureSet.has(key) ? ' can-capture' : ' can-move';
        }

        if (el.className !== cls) el.className = cls;

        // --- Move dot ---
        const hasDot = el.querySelector('.move-dot');
        const needsDot = legalSet.has(key);
        if (needsDot && !hasDot) {
          const dot = document.createElement('div');
          dot.className = 'move-dot';
          el.appendChild(dot);
        } else if (!needsDot && hasDot) {
          hasDot.remove();
        }

        // --- Piece update (only if changed) ---
        const pieceKey = piece ? piece.color + piece.type : '';
        const prevKey = this._prevPieces[r][c];

        if (pieceKey !== prevKey) {
          this._prevPieces[r][c] = pieceKey;
          // Remove old piece element
          const oldPiece = el.querySelector('.chess-piece');
          if (oldPiece) oldPiece.remove();

          if (piece) {
            const pEl = this._createPieceEl(piece, r, c);
            el.appendChild(pEl);
          }
        } else if (piece) {
          // Update selected state on existing piece element
          const pEl = el.querySelector('.chess-piece');
          if (pEl) {
            const shouldBeSelected = sel && sel.row === r && sel.col === c;
            pEl.classList.toggle('selected-piece', shouldBeSelected);
          }
        }
      }
    }

    this.updateMoveHistory();
    this.updateCapturedPieces();
  },

  _createPieceEl(piece, row, col) {
    const el = document.createElement('div');
    el.className = `chess-piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
    el.textContent = this.SYMBOLS[piece.color + piece.type];
    el.dataset.row = row;
    el.dataset.col = col;
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', (e) => {
      const { board, turn } = this.gameState;
      const p = board[row][col];
      if (!p || (this.isAIGame && p.color !== this.playerColor)) {
        e.preventDefault();
        return;
      }
      this.dragSource = { row, col };
      this.selectPiece(row, col);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${row},${col}`);
      requestAnimationFrame(() => el.classList.add('dragging'));
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this.dragSource = null;
    });

    return el;
  },

  // Re-order square elements when board is flipped
  _reorderSquares() {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl || !this._squares) return;

    const frag = document.createDocumentFragment();
    if (this.flipped) {
      for (let sr = 0; sr < 8; sr++) {
        for (let sc = 7; sc >= 0; sc--) {
          frag.appendChild(this._squares[sr][sc]);
        }
      }
    } else {
      for (let sr = 7; sr >= 0; sr--) {
        for (let sc = 0; sc < 8; sc++) {
          frag.appendChild(this._squares[sr][sc]);
        }
      }
    }
    boardEl.appendChild(frag);
  },

  // =========================================
  // GAME LIFECYCLE
  // =========================================

  startGame(options = {}) {
    this.isAIGame = options.mode === 'ai';
    this.aiDifficulty = options.difficulty || 'medium';
    this.playerColor = options.playerColor || 'w';
    this.flipped = this.playerColor === 'b';
    this.gameOver = false;
    this.isThinking = false;
    this.undoHistory = [];
    this.selectedSquare = null;
    this.legalMovesForSelected = [];

    this.gameState = ZChess.Engine.createInitialState();

    // Reset piece tracking
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));

    this.initBoard();
    if (this.flipped) this._reorderSquares();
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.updateCoordinates();
    this.saveGameState();

    if (this.isAIGame && this.playerColor === 'b') {
      this.triggerAIMove();
    }
  },

  resumeGame() {
    try {
      const saved = localStorage.getItem(ZChess.STORAGE.GAME_STATE);
      if (!saved) return false;
      const data = JSON.parse(saved);
      Object.assign(this, data);
      this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
      this.initBoard();
      this.render();
      this.updateTurnIndicator();
      this.updatePlayerBars();
      return true;
    } catch (e) {
      return false;
    }
  },

  saveGameState() {
    try {
      localStorage.setItem(ZChess.STORAGE.GAME_STATE, JSON.stringify({
        gameState: this.gameState,
        isAIGame: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        playerColor: this.playerColor,
        flipped: this.flipped,
        gameOver: this.gameOver
      }));
    } catch (e) {}
  },

  // =========================================
  // INTERACTION
  // =========================================

  handleSquareClick(row, col) {
    if (this.gameOver || this.isThinking) return;
    const { board, turn } = this.gameState;
    const piece = board[row][col];

    if (this.isAIGame && turn !== this.playerColor) return;

    if (this.selectedSquare) {
      const move = this.legalMovesForSelected.find(m => m.to.row === row && m.to.col === col);

      if (move) {
        if (move.promotion) {
          const promoMoves = this.legalMovesForSelected.filter(m =>
            m.to.row === row && m.to.col === col && m.promotion
          );
          this.showPromotionDialog(promoMoves, this.gameState.turn);
          return;
        }
        this.makeMove(move);
        return;
      }

      if (piece && piece.color === turn) {
        this.selectPiece(row, col);
        return;
      }

      this.deselectPiece();
      return;
    }

    if (piece && piece.color === turn) {
      this.selectPiece(row, col);
    }
  },

  selectPiece(row, col) {
    this.selectedSquare = { row, col };
    this.legalMovesForSelected = ZChess.Engine.getLegalMovesForPiece(this.gameState, row, col);
    this.render();
    if (ZChess.Sound) ZChess.Sound.playClick();
  },

  deselectPiece() {
    this.selectedSquare = null;
    this.legalMovesForSelected = [];
    this.render();
  },

  // =========================================
  // MOVE EXECUTION
  // =========================================

  async makeMove(move) {
    const engine = ZChess.Engine;

    if (this.isAIGame) {
      this.undoHistory.push(engine.cloneState(this.gameState));
    }

    this.gameState = engine.applyMove(this.gameState, move);
    this.selectedSquare = null;
    this.legalMovesForSelected = [];

    if (ZChess.Sound) {
      if (move.castling) ZChess.Sound.playCastle();
      else if (move.capture || move.enPassant) ZChess.Sound.playCapture();
      else if (move.promotion) ZChess.Sound.playPromotion();
      else ZChess.Sound.playMove();
    }

    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    const status = engine.getGameStatus(this.gameState);
    if (status.status === 'check' && ZChess.Sound) ZChess.Sound.playCheck();

    if (status.status !== 'playing' && status.status !== 'check') {
      this.handleGameEnd(status, move);
      return;
    }

    if (this.isAIGame && this.gameState.turn !== this.playerColor) {
      await this.triggerAIMove();
    }
  },

  // =========================================
  // AI MOVE (Web Worker)
  // =========================================

  async triggerAIMove() {
    if (this.gameOver || this.isThinking) return;
    this.isThinking = true;
    this.showAIThinking(true);
    this.updateTurnIndicator();

    try {
      const move = await this._computeAIMove(this.gameState, this.aiDifficulty);

      if (!move || this.gameOver) {
        this.isThinking = false;
        this.showAIThinking(false);
        return;
      }

      const engine = ZChess.Engine;
      this.gameState = engine.applyMove(this.gameState, move);

      if (ZChess.Sound) {
        if (move.castling) ZChess.Sound.playCastle();
        else if (move.capture || move.enPassant) ZChess.Sound.playCapture();
        else if (move.promotion) ZChess.Sound.playPromotion();
        else ZChess.Sound.playMove();
      }

      this.render();
      this.updateTurnIndicator();
      this.updatePlayerBars();
      this.saveGameState();

      const status = engine.getGameStatus(this.gameState);
      if (status.status === 'check' && ZChess.Sound) ZChess.Sound.playCheck();
      if (status.status !== 'playing' && status.status !== 'check') {
        this.handleGameEnd(status, move);
      }
    } catch (e) {
      console.error('[ChessBoard] AI error:', e);
    }

    this.isThinking = false;
    this.showAIThinking(false);
  },

  async _computeAIMove(state, difficulty) {
    const minDelay = difficulty === 'beginner' ? 150 : 300;
    const startTime = Date.now();

    const wait = (move) => new Promise(resolve => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDelay - elapsed);
      setTimeout(() => resolve(move), remaining);
    });

    // Try Web Worker (fetches scripts inline - no CORS/null-origin issue)
    if (typeof Worker !== 'undefined') {
      try {
        const blobUrl = await this._getWorkerBlobUrl();
        if (blobUrl) {
          const move = await this._runWorker(blobUrl, state, difficulty);
          return wait(move);
        }
      } catch (e) {
        console.warn('[AI] Worker failed, fallback sync:', e.message);
      }
    }

    // Sync fallback
    const move = ZChess.AI.getBestMove(state, difficulty);
    return wait(move);
  },

  async _getWorkerBlobUrl() {
    if (this._workerBlobUrl) return this._workerBlobUrl;

    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const engineUrl = scripts.find(s => s.src.includes('chess-engine'))?.src;
    const aiUrl    = scripts.find(s => s.src.includes('ai-engine'))?.src;
    if (!engineUrl || !aiUrl) return null;

    // Fetch both scripts and inline them - avoids null-origin importScripts issues
    const [engineText, aiText] = await Promise.all([
      fetch(engineUrl, { cache: 'force-cache' }).then(r => r.text()),
      fetch(aiUrl,    { cache: 'force-cache' }).then(r => r.text())
    ]);

    const workerCode = `
var window = self;
${engineText}
${aiText}
self.onmessage = function(e) {
  try {
    var move = ZChess.AI.getBestMove(e.data.state, e.data.difficulty);
    self.postMessage({ move: move });
  } catch(err) {
    self.postMessage({ move: null, error: String(err) });
  }
};`;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this._workerBlobUrl = URL.createObjectURL(blob);
    return this._workerBlobUrl;
  },

  _runWorker(blobUrl, state, difficulty) {
    return new Promise((resolve, reject) => {
      let done = false;
      const worker = new Worker(blobUrl);

      const finish = (move) => {
        if (done) return;
        done = true;
        worker.terminate();
        resolve(move);
      };

      const timeout = setTimeout(() => {
        console.warn('[AI] Worker timeout - using sync fallback');
        done = true;
        worker.terminate();
        try { resolve(ZChess.AI.getBestMove(state, 'medium')); }
        catch(e) { resolve(null); }
      }, 10000);

      worker.onmessage = (e) => { clearTimeout(timeout); finish(e.data.move ?? null); };
      worker.onerror   = (e) => { clearTimeout(timeout); reject(new Error(e.message)); };

      worker.postMessage({ state, difficulty });
    });
  },

  _workerBlobUrl: null,
  dragSource: null,

  // =========================================
  // PROMOTION DIALOG
  // =========================================

  showPromotionDialog(promoMoves, color) {
    const overlay = document.getElementById('promotion-overlay');
    const pieces = document.getElementById('promotion-pieces');
    if (!overlay || !pieces) return;

    pieces.innerHTML = '';
    const types = ['Q', 'R', 'B', 'N'];
    const names = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };

    types.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'promotion-piece-btn';
      btn.innerHTML = `
        <span style="font-size:44px;line-height:1">${this.SYMBOLS[color + type]}</span>
        <span class="promotion-piece-label">${names[type]}</span>
      `;
      btn.addEventListener('click', () => {
        overlay.classList.remove('open');
        const move = promoMoves.find(m => m.promotion === type);
        if (move) this.makeMove(move);
      });
      pieces.appendChild(btn);
    });

    overlay.classList.add('open');
  },

  // =========================================
  // GAME END
  // =========================================

  async handleGameEnd(status, lastMove) {
    this.gameOver = true;
    localStorage.removeItem(ZChess.STORAGE.GAME_STATE);

    let outcome, heading, reason;

    if (status.status === 'checkmate') {
      const winnerColor = status.winner;
      outcome = this.isAIGame
        ? (winnerColor === this.playerColor ? 'win' : 'loss')
        : (winnerColor === 'w' ? 'win' : 'loss');
      heading = outcome === 'win' ? 'Victory!' : 'Defeat';
      reason = 'Checkmate';
      if (ZChess.Sound) {
        outcome === 'win' ? ZChess.Sound.playWin() : ZChess.Sound.playCheckmate();
      }
    } else {
      outcome = 'draw';
      heading = 'Draw';
      const reasonMap = {
        stalemate: 'Stalemate',
        insufficient: 'Insufficient Material',
        'fifty-move': '50-Move Rule',
        repetition: 'Threefold Repetition'
      };
      reason = reasonMap[status.reason] || 'Draw';
      if (ZChess.Sound) ZChess.Sound.playDraw();
    }

    let xpGain = 0, ratingChange = 0;

    if (ZChess.Auth && ZChess.Auth.isLoggedIn()) {
      const aiRatings = {
        beginner: 600, easy: 800, medium: 1000, advanced: 1300,
        expert: 1600, grandmaster: 1900, impossible: 2400
      };
      const result = await ZChess.Auth.saveGameResult({
        outcome,
        isAI: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        opponentRating: this.isAIGame ? aiRatings[this.aiDifficulty] : 1200,
        moves: this.gameState.history.length,
        lastPiece: lastMove?.piece?.type
      });
      if (result) { xpGain = result.xpGain; ratingChange = result.ratingChange; }
    }

    setTimeout(() => this.showGameResultModal(heading, reason, outcome, xpGain, ratingChange), 600);
  },

  showGameResultModal(heading, reason, outcome, xpGain, ratingChange) {
    const modal = document.getElementById('game-result-modal');
    if (!modal) return;

    const typeClass = outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw';
    const emoji = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💔' : '🤝';

    document.getElementById('result-icon').className = `result-icon ${typeClass}`;
    document.getElementById('result-icon').textContent = emoji;
    document.getElementById('result-heading').className = `result-title ${typeClass}`;
    document.getElementById('result-heading').textContent = heading;
    document.getElementById('result-reason').textContent = reason;
    document.getElementById('result-xp').textContent = `+${xpGain}`;
    const ratingEl = document.getElementById('result-rating');
    ratingEl.textContent = ratingChange >= 0 ? `+${ratingChange}` : ratingChange;
    ratingEl.className = `result-stat-value ${ratingChange >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('game-result-overlay').classList.add('open');
  },

  // =========================================
  // UNDO / RESIGN / FLIP
  // =========================================

  undoMove() {
    if (!this.isAIGame || this.undoHistory.length === 0 || this.gameOver) return;

    // Each entry in undoHistory = state BEFORE the player's move.
    // Pop restores exactly one player+AI move pair.
    const prevState = this.undoHistory.pop();
    if (!prevState) return;

    this.gameState = prevState;
    this.selectedSquare = null;
    this.legalMovesForSelected = [];
    // Critical: reset thinking flag so player can move immediately
    this.isThinking = false;
    this.gameOver = false;

    // Force full board redraw
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    if (ZChess.Notifications) ZChess.Notifications.info('Move undone');
  },

  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    localStorage.removeItem(ZChess.STORAGE.GAME_STATE);
    if (ZChess.Auth && ZChess.Auth.isLoggedIn()) {
      ZChess.Auth.saveGameResult({ outcome: 'loss', isAI: this.isAIGame,
        aiDifficulty: this.aiDifficulty, opponentRating: 1200,
        moves: this.gameState.history.length });
    }
    if (ZChess.Sound) ZChess.Sound.playLose();
    this.showGameResultModal('Defeat', 'Resigned', 'loss', 20, -10);
  },

  flipBoard() {
    this.flipped = !this.flipped;
    this._reorderSquares();
    this.updateCoordinates();
    // Force full piece re-render after flip
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.render();
  },

  // =========================================
  // UI UPDATES
  // =========================================

  updateTurnIndicator() {
    const el = document.getElementById('turn-indicator');
    if (!el) return;
    const { turn } = this.gameState;
    const inCheck = ZChess.Engine.isInCheck(this.gameState.board, turn);

    if (inCheck) {
      el.className = 'turn-indicator check-indicator';
      el.innerHTML = `<div class="turn-dot"></div> CHECK!`;
    } else if (this.isThinking) {
      el.className = 'turn-indicator opponent-turn';
      el.innerHTML = `<div class="ai-thinking">
        <div class="thinking-dots">
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
        </div>
        AI is thinking...
      </div>`;
    } else {
      const isPlayerTurn = !this.isAIGame || turn === this.playerColor;
      el.className = `turn-indicator ${isPlayerTurn ? 'your-turn' : 'opponent-turn'}`;
      el.innerHTML = `<div class="turn-dot"></div>
        ${isPlayerTurn ? 'Your turn' : (this.isAIGame ? 'AI thinking...' : 'Opponent\'s turn')}`;
    }
  },

  updatePlayerBars() {
    const user = ZChess.Auth && ZChess.Auth.currentUser;
    const userName = user?.username || 'Guest';
    const userRating = user?.rating || '';

    const updateBar = (barId, color) => {
      const bar = document.getElementById(barId);
      if (!bar) return;
      bar.classList.toggle('active', this.gameState.turn === color);
      const isPlayer = this.playerColor === color;
      const name = isPlayer ? userName : (this.isAIGame ? `AI (${this.aiDifficulty})` : 'Opponent');
      const rating = isPlayer ? userRating : '';
      const nameEl = bar.querySelector('.player-name-sm');
      const ratingEl = bar.querySelector('.player-rating-sm');
      if (nameEl) nameEl.textContent = name;
      if (ratingEl) ratingEl.textContent = rating;
    };

    updateBar('player-bar-white', 'w');
    updateBar('player-bar-black', 'b');
  },

  updateMoveHistory() {
    const el = document.getElementById('move-history-list');
    if (!el) return;
    const history = this.gameState.history;
    el.innerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const w = history[i];
      const b = history[i + 1];
      const row = document.createElement('div');
      row.className = 'move-history-row';
      row.innerHTML = `<span class="move-number">${num}.</span>
        <span class="move-white">${w?.notation || ''}</span>
        <span class="move-black">${b?.notation || ''}</span>`;
      el.appendChild(row);
    }
    const panel = document.getElementById('move-history-panel');
    if (panel) panel.scrollTop = panel.scrollHeight;
  },

  updateCapturedPieces() {
    const { capturedPieces } = this.gameState;
    const ORDER = ['Q','R','B','N','P'];
    const upd = (id, pieces) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = [...pieces]
        .sort((a,b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map(t => `<span class="captured-piece">${this.SYMBOLS['b'+t]}</span>`)
        .join('');
    };
    upd('captured-by-white', capturedPieces.b);
    upd('captured-by-black', capturedPieces.w);
  },

  showAIThinking(show) {
    const el = document.getElementById('ai-thinking-indicator');
    if (el) el.style.display = show ? 'flex' : 'none';
  },

  updateCoordinates() {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['1','2','3','4','5','6','7','8'];
    const colLabels = document.getElementById('board-col-labels');
    const rowLabels = document.getElementById('board-row-labels');
    if (colLabels) {
      const f = this.flipped ? [...files].reverse() : files;
      colLabels.innerHTML = f.map(x => `<span class="coord-label">${x}</span>`).join('');
    }
    if (rowLabels) {
      const r = this.flipped ? ranks : [...ranks].reverse();
      rowLabels.innerHTML = r.map(x => `<span class="coord-label">${x}</span>`).join('');
    }
  },

  // =========================================
  // INIT
  // =========================================

  init() {
    console.log('[ZChess] ChessBoard module loaded');
  }
};

window.ZChess.ChessBoard = ChessBoard;
ChessBoard.init();

})();
