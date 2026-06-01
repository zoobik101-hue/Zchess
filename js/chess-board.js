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
  trainingMode: false,
  trainingPuzzle: false,
  aiDifficulty: 'medium',
  playerColor: 'w',
  isThinking: false,
  gameOver: false,
  undoHistory: [],
  // Generation counter - incremented on undo/newgame to cancel pending AI moves
  _aiGen: 0,

  // ---- Multiplayer ----
  multiplayerMode: false,
  multiplayerOpponent: null, // { name, rating }

  // ---- Game statistics tracker ----
  _gameStats: null,

  // Piece values for material-based quality analysis
  _pieceVal: { p:1, n:3, b:3, r:5, q:9, k:0 },

  // Persistent square DOM elements [row][col]
  _squares: null,
  // Track previous board to only update changed squares
  _prevPieces: null,
  _trainingHint: null,

  SYMBOLS: {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
  },

  // Path to SVG pieces (cburnett set)
  _piecesBase: 'assets/pieces/cburnett',

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
        if (this._trainingHint) {
          if (this._trainingHint.fr === r && this._trainingHint.fc === c) cls += ' hint-from';
          if (this._trainingHint.tr === r && this._trainingHint.tc === c) cls += ' hint-to';
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
    el.dataset.row = row;
    el.dataset.col = col;
    el.setAttribute('draggable', 'true');

    // SVG image piece
    const img = document.createElement('img');
    img.src = `${this._piecesBase}/${piece.color}${piece.type.toUpperCase()}.svg`;
    img.alt = piece.color + piece.type;
    img.className = 'piece-img';
    img.draggable = false;
    el.appendChild(img);

    el.addEventListener('dragstart', (e) => {
      const { board, turn } = this.gameState;
      const p = board[row][col];
      // Block dragging opponent's pieces in AI or multiplayer
      const notOurPiece = (this.isAIGame || this.multiplayerMode || this.trainingPuzzle) && p?.color !== this.playerColor;
      const notOurTurn  = (this.multiplayerMode || this.trainingPuzzle) && turn !== this.playerColor;
      if (!p || notOurPiece || notOurTurn) {
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

  /** Clear and rebuild board DOM (fixes orientation when re-entering a game) */
  _rebuildBoard() {
    const boardEl = document.getElementById('chess-board');
    if (boardEl) boardEl.innerHTML = '';
    this._squares = null;
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.initBoard();
    this._reorderSquares();
    this.updateCoordinates();
  },

  /** Your pieces always at bottom in multiplayer / when playing black */
  _applyBoardOrientation() {
    const wantFlip = this.playerColor === 'b';
    if (this.flipped !== wantFlip || !this._squares) {
      this.flipped = wantFlip;
      this._rebuildBoard();
    } else {
      this._reorderSquares();
      this.updateCoordinates();
    }
    this._layoutPlayerBars();
  },

  _layoutPlayerBars() {
    const blackBar = document.getElementById('player-bar-black');
    const whiteBar = document.getElementById('player-bar-white');
    const boardWrap = document.querySelector('.chess-board-wrap');
    if (!blackBar || !whiteBar) return;

    if (this.multiplayerMode || this.isAIGame || this.trainingMode) {
      const selfIsWhite = this.playerColor === 'w';
      blackBar.style.order = selfIsWhite ? '1' : '3';
      whiteBar.style.order = selfIsWhite ? '3' : '1';
      if (boardWrap) boardWrap.style.order = '2';
      blackBar.classList.toggle('player-bar-self', !selfIsWhite);
      whiteBar.classList.toggle('player-bar-self', selfIsWhite);
      blackBar.classList.toggle('player-bar-opp', selfIsWhite);
      whiteBar.classList.toggle('player-bar-opp', !selfIsWhite);
    } else {
      blackBar.style.order = '1';
      whiteBar.style.order = '3';
      if (boardWrap) boardWrap.style.order = '2';
      blackBar.classList.remove('player-bar-self', 'player-bar-opp');
      whiteBar.classList.remove('player-bar-self', 'player-bar-opp');
    }
    this.updateMatchInfoPanel();
  },

  updateMatchInfoPanel() {
    const panel = document.getElementById('match-info-panel');
    if (!panel) return;

    const show = this.multiplayerMode && !this.gameOver;
    panel.style.display = show ? '' : 'none';
    if (!show) return;

    const youChip = document.getElementById('match-you-chip');
    const oppChip = document.getElementById('match-opp-chip');
    const banner  = document.getElementById('match-turn-banner');
    const opp = this.multiplayerOpponent;

    const youLabel = this.playerColor === 'w'
      ? `♔ ${t('board.you_white')}`
      : `♚ ${t('board.you_black')}`;
    const oppLabel = this.playerColor === 'w'
      ? `♚ ${t('board.opponent_black')}`
      : `♔ ${t('board.opponent_white')}`;

    if (youChip) youChip.textContent = youLabel;
    if (oppChip) {
      const name = opp?.name || t('board.opponent');
      oppChip.textContent = `${oppLabel} · ${name}`;
    }

    if (banner) {
      const myTurn = this.gameState?.turn === this.playerColor;
      banner.className = `match-turn-banner ${myTurn ? 'is-your-turn' : 'is-opp-turn'}`;
      banner.textContent = myTurn ? t('board.your_turn') : t('board.opponent_turn');
    }
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
    const isCoach = options.mode === 'training' && options.trainingMode === 'coach';
    this.trainingMode = isCoach;
    this.trainingPuzzle = false;
    this.isAIGame = options.mode === 'ai' || isCoach;
    this.aiDifficulty = options.difficulty || 'medium';
    this.playerColor = options.playerColor || 'w';
    this.gameOver = false;
    this.isThinking = false;
    this.undoHistory = [];
    this.selectedSquare = null;
    this.legalMovesForSelected = [];

    // Reset stats
    this._gameStats = {
      startTime: Date.now(),
      playerMoves: 0,
      aiMoves: 0,
      playerCaptures: 0,
      aiCaptures: 0,
      playerChecks: 0,
      aiChecks: 0,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      blunders: 0,
      undos: 0,
      castled: false,
      promotions: 0
    };

    this.gameState = ZChess.Engine.createInitialState();

    // Invalidate any pending AI worker from previous game
    this._aiGen++;

    // Reset piece tracking
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));

    this._applyBoardOrientation();
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    if (this.isAIGame && this.playerColor === 'b') {
      this.triggerAIMove();
    }

    if (isCoach && ZChess.Training) {
      ZChess.Training.active = true;
      ZChess.Training.mode = 'coach';
      ZChess.Training._showPanel(true);
      ZChess.Training._setCoachUI();
    }
  },

  startTrainingLesson(lesson) {
    this.trainingMode = true;
    this.trainingPuzzle = true;
    this.isAIGame = false;
    this.multiplayerMode = false;
    this.playerColor = lesson.color || 'w';
    this.gameOver = false;
    this.isThinking = false;
    this.undoHistory = [];
    this.selectedSquare = null;
    this.legalMovesForSelected = [];
    this._gameStats = null;
    this._aiGen++;

    this.gameState = ZChess.Engine.parseFEN(lesson.fen);
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.clearTrainingHint();

    this._applyBoardOrientation();
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();

    if (ZChess.Training) {
      ZChess.Training.active = true;
      ZChess.Training.mode = 'puzzle';
      ZChess.Training.lesson = lesson;
    }
  },

  // =========================================
  // MULTIPLAYER GAME START
  // =========================================

  startMultiplayerGame(options = {}) {
    this.isAIGame        = false;
    this.trainingMode    = false;
    this.trainingPuzzle  = false;
    this.multiplayerMode = true;
    this.playerColor     = options.playerColor || 'w';
    this.gameOver        = false;
    this.isThinking      = false;
    this.undoHistory     = [];
    this.selectedSquare  = null;
    this.legalMovesForSelected = [];
    this.multiplayerOpponent = {
      name:   options.opponentName   || 'Opponent',
      rating: options.opponentRating || 1200,
      avatar: options.opponentAvatar || null
    };

    this._gameStats = {
      startTime: Date.now(),
      playerMoves: 0, aiMoves: 0, playerCaptures: 0, aiCaptures: 0,
      playerChecks: 0, aiChecks: 0, excellent: 0, good: 0,
      inaccuracy: 0, blunders: 0, undos: 0, castled: false, promotions: 0
    };

    this._aiGen++;
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.gameState = ZChess.Engine.createInitialState();

    // Replay stored moves (reconnection case)
    if (options.moves && options.moves.length > 0) {
      const engine = ZChess.Engine;
      options.moves.forEach(mv => {
        const legal = engine.getLegalMoves(this.gameState);
        const found = legal.find(m =>
          m.from.row === mv.from.row && m.from.col === mv.from.col &&
          m.to.row   === mv.to.row   && m.to.col   === mv.to.col   &&
          (m.promotion || null) === (mv.promotion || null)
        );
        if (found) this.gameState = engine.applyMove(this.gameState, found);
      });
    }

    this._applyBoardOrientation();
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();

    // Show multiplayer status bar
    const bar = document.getElementById('mp-status-bar');
    if (bar) bar.style.display = '';

    // Start move timer - white always goes first
    if (ZChess.Multiplayer) {
      setTimeout(() => {
        ZChess.Multiplayer.startMoveTimer(this.playerColor === 'w');
      }, 300);
    }
  },

  // =========================================
  // APPLY OPPONENT NETWORK MOVE
  // =========================================

  async applyNetworkMove(mv) {
    if (this.gameOver) return;
    const engine = ZChess.Engine;

    // Find matching legal move by from/to/promotion
    const legal = engine.getLegalMoves(this.gameState);
    const move  = legal.find(m =>
      m.from.row === mv.from.row && m.from.col === mv.from.col &&
      m.to.row   === mv.to.row   && m.to.col   === mv.to.col   &&
      (m.promotion || null) === (mv.promotion || null)
    );
    if (!move) return;

    // Track stats for opponent (ai-equivalent)
    if (this._gameStats) {
      this._gameStats.aiMoves++;
      if (move.capture || move.enPassant) {
        this._gameStats.aiCaptures++;
        const capVal = this._pieceVal[move.captured?.type || 'p'] || 1;
        if (capVal >= 5) this._gameStats.blunders++;
        else             this._gameStats.inaccuracy++;
      }
    }

    this.gameState = engine.applyMove(this.gameState, move);
    this.selectedSquare = null;
    this.legalMovesForSelected = [];

    if (ZChess.Sound) {
      if (move.castling)               ZChess.Sound.playCastle();
      else if (move.capture || move.enPassant) ZChess.Sound.playCapture();
      else                             ZChess.Sound.playMove();
    }

    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();

    const status = engine.getGameStatus(this.gameState);
    if (status.status === 'check' && ZChess.Sound) ZChess.Sound.playCheck();

    if (this._gameStats && status.status === 'check') this._gameStats.aiChecks++;

    if (status.status !== 'playing' && status.status !== 'check') {
      // Opponent's move ended the game — report to Firestore
      ZChess.Multiplayer.stopMoveTimer();
      const winner = status.status === 'checkmate' ? status.winner : 'draw';
      const reason = status.status === 'checkmate' ? 'checkmate' : (status.reason || status.status);
      await ZChess.Multiplayer.reportResult({ winner, reason });
      this.handleGameEnd(status, move);
    } else {
      // Game continues — now it's our turn, start our move timer
      ZChess.Multiplayer.startMoveTimer(true);
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

    if ((this.isAIGame || this.multiplayerMode || this.trainingPuzzle) && turn !== this.playerColor) return;

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

      // In multiplayer: only allow selecting own pieces
      if (piece && piece.color === turn && (!this.multiplayerMode || piece.color === this.playerColor)) {
        this.selectPiece(row, col);
        return;
      }

      this.deselectPiece();
      return;
    }

    // In multiplayer: only allow selecting own pieces
    if (piece && piece.color === turn && (!this.multiplayerMode || piece.color === this.playerColor)) {
      this.selectPiece(row, col);
    }
  },

  clearTrainingHint() {
    this._trainingHint = null;
    if (this._squares) this.render();
  },

  showTrainingHint(fr, fc, tr, tc) {
    this._trainingHint = { fr, fc, tr, tc };
    if (this._squares) this.render();
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

    const isPlayerMove = move.piece.color === this.playerColor;

    if (this.trainingMode && isPlayerMove && ZChess.Training?.active) {
      ZChess.Training.onBeforePlayerMove(engine.cloneState(this.gameState));
      if (this.trainingPuzzle && !ZChess.Training.isPuzzleMoveCorrect(move)) {
        await ZChess.Training.onPuzzleWrongMove(move);
        this.selectedSquare = null;
        this.legalMovesForSelected = [];
        this.render();
        return;
      }
    }

    if (this.isAIGame) {
      this.undoHistory.push(engine.cloneState(this.gameState));
    }

    // --- Track player stats ---
    if (this._gameStats && (this.isAIGame || this.multiplayerMode)) {
      this._gameStats.playerMoves++;

      if (move.capture || move.enPassant) {
        this._gameStats.playerCaptures++;
        // Quality: compare captured vs attacker piece value
        const capVal = this._pieceVal[(move.captured?.type || move.enPassant ? 'p' : 'p')] || 1;
        const atkVal = this._pieceVal[move.piece?.type] || 1;
        if (capVal > atkVal) this._gameStats.excellent++;
        else this._gameStats.good++;
      }
      if (move.castling) this._gameStats.castled = true;
      if (move.promotion) this._gameStats.promotions++;
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

    // Track check given by player
    if (this._gameStats && status.status === 'check' && (this.isAIGame || this.multiplayerMode)) {
      this._gameStats.playerChecks++;
    }

    if (this.trainingMode && isPlayerMove && ZChess.Training?.active) {
      await ZChess.Training.onPlayerMove(move, this.gameState);
    }

    if (status.status !== 'playing' && status.status !== 'check') {
      // In multiplayer: report result to Firestore before showing modal
    if (this.multiplayerMode && ZChess.Multiplayer) {
      ZChess.Multiplayer.stopMoveTimer();
      const winner = status.status === 'checkmate' ? status.winner : 'draw';
      const reason = status.status === 'checkmate' ? 'checkmate' : (status.reason || status.status);
      await ZChess.Multiplayer.reportResult({ winner, reason });
    }
    this.handleGameEnd(status, move);
    return;
  }

  // Trigger AI only in AI game mode
  if (this.isAIGame && this.gameState.turn !== this.playerColor) {
    await this.triggerAIMove();
  }
  // In multiplayer: just wait for opponent's move via Firestore subscription

  // Push move to Firestore in multiplayer + switch timer to opponent
    if (this.multiplayerMode && ZChess.Multiplayer) {
      ZChess.Multiplayer.stopMoveTimer(); // stop our timer
      await ZChess.Multiplayer.sendMove(move);
      ZChess.Multiplayer.startMoveTimer(false); // show opponent's "turn" state (dimmed)
    }
  },

  // =========================================
  // AI MOVE (Web Worker)
  // =========================================

  async triggerAIMove() {
    if (this.gameOver || this.isThinking) return;
    this.isThinking = true;
    this.updateTurnIndicator();

    // Snapshot generation - if it changes before worker responds, abort
    const myGen = ++this._aiGen;

    try {
      const move = await this._computeAIMove(this.gameState, this.aiDifficulty);

      // If undo/newgame happened while we were waiting - discard this move
      if (myGen !== this._aiGen || !move || this.gameOver) {
        this.isThinking = false;
        this.updateTurnIndicator();
        return;
      }

      const engine = ZChess.Engine;

      // --- Track AI stats (= player mistakes) ---
      if (this._gameStats) {
        this._gameStats.aiMoves++;
        if (move.capture || move.enPassant) {
          this._gameStats.aiCaptures++;
          // Classify the player's previous move quality
          const capVal = this._pieceVal[move.captured?.type || 'p'] || 1;
          if (capVal >= 5) this._gameStats.blunders++;        // AI took rook or queen
          else if (capVal >= 3) this._gameStats.inaccuracy++; // AI took bishop/knight
          else this._gameStats.inaccuracy++;                  // AI took pawn
        }
      }

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

      // Track AI giving check (= player is in check)
      if (this._gameStats && status.status === 'check') {
        this._gameStats.aiChecks++;
      }

      if (status.status !== 'playing' && status.status !== 'check') {
        this.handleGameEnd(status, move);
      }
    } catch (e) {
      console.error('[ChessBoard] AI error:', e);
    }

    this.isThinking = false;
    this.updateTurnIndicator();
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
    const names = {
      Q: t('board.promote_queen'),
      R: t('board.promote_rook'),
      B: t('board.promote_bishop'),
      N: t('board.promote_knight')
    };

    types.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'promotion-piece-btn';
      btn.innerHTML = `
        <img src="${this._piecesBase}/${color}${type}.svg" alt="${color}${type}" class="promotion-piece-img" draggable="false">
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
      heading = outcome === 'win' ? t('board.you_win') : t('board.you_lose');
      reason = t('board.checkmate');
      if (ZChess.Sound) {
        outcome === 'win' ? ZChess.Sound.playWin() : ZChess.Sound.playCheckmate();
      }
    } else {
      outcome = 'draw';
      heading = t('board.draw');
      const reasonMap = {
        stalemate: t('board.stalemate_reason'),
        insufficient: t('board.insufficient_reason'),
        'fifty-move': t('board.fifty_reason'),
        repetition: t('board.repetition_reason')
      };
      reason = reasonMap[status.reason] || t('board.draw');
      if (ZChess.Sound) ZChess.Sound.playDraw();
    }

    let xpGain = 0, ratingChange = 0;

    if (ZChess.Auth && ZChess.Auth.isLoggedIn()) {
      const aiRatings = {
        beginner: 600, easy: 800, medium: 1000, advanced: 1300,
        expert: 1600, grandmaster: 1900, impossible: 2400
      };
      const meta = this._getGameSaveMeta();
      const result = await ZChess.Auth.saveGameResult({
        outcome,
        isAI: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        opponentRating: this.isAIGame ? aiRatings[this.aiDifficulty] : (this.multiplayerOpponent?.rating || 1200),
        moves: this.gameState.history.length,
        lastPiece: lastMove?.piece?.type,
        ...meta
      });
      if (result) { xpGain = result.xpGain; ratingChange = result.ratingChange; }
    }

    const stats = this._buildGameStats();
    setTimeout(() => this.showGameResultModal(heading, reason, outcome, xpGain, ratingChange, stats), 600);
  },

  _getGameSaveMeta() {
    const s = this._gameStats;
    const durationSec = s ? Math.floor((Date.now() - s.startTime) / 1000) : 0;
    let opponentType = 'unknown';
    let opponentUsername = null;

    if (this.isAIGame) opponentType = 'ai';
    else if (this.multiplayerMode) {
      opponentType = 'human';
      opponentUsername = this.multiplayerOpponent?.name || null;
    }

    const mode = this.trainingMode ? 'training'
      : this.isAIGame ? 'ai'
      : this.multiplayerMode ? 'online'
      : 'local';

    return {
      id: 'g_' + Date.now(),
      durationSec,
      playerColor: this.playerColor,
      mode,
      opponentType,
      opponentUsername,
      moveHistory: ZChess.serializeMoveHistory
        ? ZChess.serializeMoveHistory(this.gameState?.history || [])
        : []
    };
  },

  _buildGameStats() {
    const s = this._gameStats;
    if (!s) return null;

    const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins > 0
      ? `${mins}м ${secs}с`
      : `${secs}с`;

    const totalMoves = s.playerMoves + s.aiMoves;
    // Accuracy: 100% base, -5 per inaccuracy, -15 per blunder, +0 per undo (already penalised)
    const raw = 100 - (s.inaccuracy * 5) - (s.blunders * 15);
    const accuracy = Math.max(0, Math.min(100, Math.round(raw)));

    return {
      time: timeStr,
      totalMoves,
      playerMoves: s.playerMoves,
      playerCaptures: s.playerCaptures,
      aiCaptures: s.aiCaptures,
      playerChecks: s.playerChecks,
      excellent: s.excellent,
      good: s.good,
      inaccuracy: s.inaccuracy,
      blunders: s.blunders,
      castled: s.castled,
      promotions: s.promotions,
      undos: s.undos,
      accuracy
    };
  },

  showGameResultModal(heading, reason, outcome, xpGain, ratingChange, stats) {
    const overlay = document.getElementById('game-result-overlay');
    const screen  = document.getElementById('game-result-modal');
    if (!overlay || !screen) return;

    const typeClass = outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw';

    const emojis = { win: '🏆', loss: '💀', draw: '🤝' };
    const labels = {
      win:  t('board.you_win')  || 'ПОБЕДА',
      loss: t('board.you_lose') || 'ПОРАЖЕНИЕ',
      draw: t('board.draw')     || 'НИЧЬЯ'
    };

    // Apply theme class
    screen.className = `game-result-screen ${typeClass}`;

    document.getElementById('result-icon').textContent = emojis[outcome] || '🏁';
    document.getElementById('result-outcome-label').textContent = labels[outcome] || '';
    document.getElementById('result-heading').textContent = heading;
    document.getElementById('result-reason').textContent = reason;

    // XP
    document.getElementById('result-xp').textContent = xpGain > 0 ? `+${xpGain}` : `${xpGain}`;
    document.getElementById('result-xp').className = `result-stat-val ${xpGain >= 0 ? 'positive' : 'neutral'}`;

    // Rating
    const ratingEl = document.getElementById('result-rating');
    ratingEl.textContent = ratingChange >= 0 ? `+${ratingChange}` : `${ratingChange}`;
    ratingEl.className = `result-stat-val ${ratingChange > 0 ? 'positive' : ratingChange < 0 ? 'negative' : 'neutral'}`;

    // Detailed game stats
    if (stats) {
      this._fillStatEl('rs-time',       stats.time);
      this._fillStatEl('rs-total-moves', stats.totalMoves);
      this._fillStatEl('rs-player-moves', stats.playerMoves);
      this._fillStatEl('rs-captures',   stats.playerCaptures);
      this._fillStatEl('rs-ai-captures', stats.aiCaptures);
      this._fillStatEl('rs-checks',     stats.playerChecks);
      this._fillStatEl('rs-excellent',  stats.excellent);
      this._fillStatEl('rs-good',       stats.good);
      this._fillStatEl('rs-inaccuracy', stats.inaccuracy);
      this._fillStatEl('rs-blunders',   stats.blunders);
      this._fillStatEl('rs-undos',      stats.undos);
      this._fillStatEl('rs-promotions', stats.promotions || 0);
      this._fillStatEl('rs-castled', stats.castled ? '✓' : '✗');

      const accEl = document.getElementById('rs-accuracy');
      if (accEl) {
        accEl.textContent = `${stats.accuracy}%`;
        accEl.className = `rs-val ${stats.accuracy >= 80 ? 'col-green' : stats.accuracy >= 55 ? 'col-yellow' : 'col-red'}`;
      }

      const barEl = document.getElementById('rs-accuracy-bar');
      if (barEl) barEl.style.width = `${stats.accuracy}%`;

      document.getElementById('rs-detail-block')?.removeAttribute('style');
    } else {
      // No stats (non-AI or no tracking) - hide block
      const blk = document.getElementById('rs-detail-block');
      if (blk) blk.style.display = 'none';
    }

    overlay.classList.add('open');

    this._renderGameReview();

    // Launch confetti for win
    if (outcome === 'win') {
      this._launchConfetti();
    }
  },

  _renderGameReview() {
    const block = document.getElementById('result-review-block');
    const body = document.getElementById('result-review-body');
    if (!block || !body || !ZChess.GameReview) return;

    const history = this.gameState?.history || [];
    if (history.length < 2) {
      block.style.display = 'none';
      return;
    }

    block.style.display = '';
    ZChess.GameReview.showLoading(body);

    const playerColor = this.multiplayerMode && ZChess.Multiplayer?.localColor
      ? ZChess.Multiplayer.localColor
      : this.playerColor;

    ZChess.GameReview.analyzeAsync(history, playerColor).then((analysis) => {
      if (!analysis) {
        block.style.display = 'none';
        return;
      }
      ZChess.GameReview.render(body, analysis);
    });
  },

  _fillStatEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  _launchConfetti() {
    const canvas = document.getElementById('result-particles');
    if (!canvas) return;

    const W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    const H = canvas.height = canvas.offsetHeight || window.innerHeight;
    const ctx = canvas.getContext('2d');

    const colors = ['#fbbf24','#f59e0b','#a855f7','#7c3aed','#4ade80','#60a5fa','#f472b6'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * -1,
      r: Math.random() * 8 + 4,
      d: Math.random() * 3 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0,
      tiltAngleInc: (Math.random() * 0.07) + 0.05,
      shape: Math.random() > 0.5 ? 'rect' : 'circle'
    }));

    let frame = 0;
    const MAX_FRAMES = 180;

    const draw = () => {
      if (frame++ > MAX_FRAMES) { ctx.clearRect(0, 0, W, H); return; }
      ctx.clearRect(0, 0, W, H);

      pieces.forEach(p => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += p.d + Math.sin(frame * 0.02) * 0.5;
        p.tilt = Math.sin(p.tiltAngle) * 12;

        if (p.y > H) { p.y = -20; p.x = Math.random() * W; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.tilt * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / MAX_FRAMES + 0.3);

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        }
        ctx.restore();
      });

      requestAnimationFrame(draw);
    };
    draw();
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
    if (this._gameStats) this._gameStats.undos++;
    // Increment generation - cancels any pending AI worker response
    this._aiGen++;
    this.isThinking = false;
    this.gameOver = false;

    // Force full board redraw
    this._prevPieces = Array.from({ length: 8 }, () => new Array(8).fill(null));
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    if (ZChess.Notifications) ZChess.Notifications.info(t('board.move_undone'));
  },

  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    localStorage.removeItem(ZChess.STORAGE.GAME_STATE);
    if (ZChess.Auth && ZChess.Auth.isLoggedIn()) {
      ZChess.Auth.saveGameResult({
        outcome: 'loss',
        isAI: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        opponentRating: 1200,
        moves: this.gameState.history.length,
        ...this._getGameSaveMeta()
      });
    }
    if (ZChess.Sound) ZChess.Sound.playLose();
    // In multiplayer: notify opponent
    if (this.multiplayerMode && ZChess.Multiplayer) {
      ZChess.Multiplayer.resignOnline();
    }
    const stats = this._buildGameStats();
    this.showGameResultModal(t('board.you_lose'), t('board.resigned_reason'), 'loss', 20, -10, stats);
  },

  flipBoard() {
    this.flipped = !this.flipped;
    if (!this._squares) {
      this._rebuildBoard();
    } else {
      this._reorderSquares();
      this.updateCoordinates();
    }
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
      el.innerHTML = `<span class="turn-dot"></span><span>${t('board.check')}</span>`;
    } else if (this.isThinking) {
      el.className = 'turn-indicator opponent-turn is-thinking';
      el.innerHTML = `<span class="thinking-dots" aria-hidden="true">
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
        </span>
        <span>${t('board.ai_thinking')}</span>`;
    } else {
      const isPlayerTurn = turn === this.playerColor;
      el.className = `turn-indicator ${isPlayerTurn ? 'your-turn' : 'opponent-turn'}`;
      let label = t('board.your_turn');
      if (!isPlayerTurn) {
        label = this.isAIGame ? t('board.opponent_turn') : t('board.opponent_turn');
      }
      el.innerHTML = `<span class="turn-dot"></span><span>${label}</span>`;
    }
    this.updateMatchInfoPanel();
  },

  updatePlayerBars() {
    const user = ZChess.Auth && ZChess.Auth.currentUser;
    const userName = user?.username || t('common.guest');
    const userRating = user?.rating || '';

    // Translate difficulty name for AI label
    const diffKey = `game.difficulty_${this.aiDifficulty}`;
    const diffName = t(diffKey) || this.aiDifficulty;

    const updateBar = (barId, color) => {
      const bar = document.getElementById(barId);
      if (!bar) return;
      bar.classList.toggle('active', this.gameState.turn === color);
      const isPlayer = this.playerColor === color;
      let name = isPlayer ? userName : t('board.opponent');
      if (!isPlayer && this.isAIGame) {
        name = `${t('board.ai_opponent')} (${diffName})`;
      } else if (!isPlayer && this.multiplayerMode && this.multiplayerOpponent?.name) {
        name = this.multiplayerOpponent.name;
      } else if (isPlayer) {
        name = `${userName} (${color === 'w' ? t('board.color_white') : t('board.color_black')})`;
      }
      const rating = isPlayer ? userRating : (this.multiplayerMode && !isPlayer ? (this.multiplayerOpponent?.rating || '') : '');
      const nameEl = bar.querySelector('.player-name-sm');
      const ratingEl = bar.querySelector('.player-rating-sm');
      const avatarEl = bar.querySelector('.player-avatar-sm');
      if (nameEl) nameEl.textContent = name;
      if (ratingEl) ratingEl.textContent = rating;

      if (avatarEl && ZChess.UserDisplay) {
        if (isPlayer && user) {
          ZChess.UserDisplay.renderAvatar(avatarEl, ZChess.UserDisplay.fromUser(user));
        } else if (!isPlayer && this.multiplayerMode && this.multiplayerOpponent) {
          ZChess.UserDisplay.renderAvatar(avatarEl, {
            username: this.multiplayerOpponent.name,
            avatar: this.multiplayerOpponent.avatar
          });
        } else if (this.isAIGame && !isPlayer) {
          avatarEl.innerHTML = '🤖';
          avatarEl.classList.remove('has-avatar-img');
        } else {
          ZChess.UserDisplay.renderAvatar(avatarEl, { username: name, avatar: null });
        }
      }
    };

    updateBar('player-bar-white', 'w');
    updateBar('player-bar-black', 'b');
    this._layoutPlayerBars();
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
      const base = this._piecesBase;
      el.innerHTML = [...pieces]
        .sort((a,b) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map(t => `<img src="${base}/b${t}.svg" alt="${t}" class="captured-piece-img" draggable="false">`)
        .join('');
    };
    upd('captured-by-white', capturedPieces.b);
    upd('captured-by-black', capturedPieces.w);
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
