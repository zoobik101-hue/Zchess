/* =============================================
   ZChess - Chess Board UI Controller
   Handles: Rendering, Click, Drag, Promotion, Game Result
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const ChessBoard = {
  // Game state
  gameState: null,
  selectedSquare: null,
  legalMovesForSelected: [],
  flipped: false,
  isAIGame: false,
  aiDifficulty: 'medium',
  playerColor: 'w',
  isThinking: false,
  gameOver: false,
  undoHistory: [], // Stack for undo in AI games

  // DOM elements
  boardEl: null,
  historyEl: null,
  turnEl: null,

  // Piece symbols
  SYMBOLS: {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
  },

  // Start a new game
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

    // Initialize game state
    this.gameState = ZChess.Engine.createInitialState();

    // Render the board
    this.render();

    // If playing as black vs AI, AI goes first
    if (this.isAIGame && this.playerColor === 'b') {
      this.triggerAIMove();
    }

    // Update turn indicator
    this.updateTurnIndicator();
    this.updatePlayerBars();

    // Save state for resume
    this.saveGameState();
  },

  // Resume a saved game
  resumeGame() {
    try {
      const saved = localStorage.getItem(ZChess.STORAGE.GAME_STATE);
      if (!saved) return false;
      const data = JSON.parse(saved);
      Object.assign(this, data);
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
      const toSave = {
        gameState: this.gameState,
        isAIGame: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        playerColor: this.playerColor,
        flipped: this.flipped,
        gameOver: this.gameOver
      };
      localStorage.setItem(ZChess.STORAGE.GAME_STATE, JSON.stringify(toSave));
    } catch (e) {}
  },

  // Render the full board
  render() {
    this.boardEl = document.getElementById('chess-board');
    if (!this.boardEl) return;

    this.boardEl.innerHTML = '';

    const { board } = this.gameState;
    const engine = ZChess.Engine;

    // Find king in check
    const inCheck = engine.isInCheck(board, this.gameState.turn);
    const kingSquare = inCheck ? engine.findKing(board, this.gameState.turn) : null;

    // Last move squares
    const lastMove = this.gameState.history.length > 0
      ? this.gameState.history[this.gameState.history.length - 1]
      : null;

    for (let screenRow = 7; screenRow >= 0; screenRow--) {
      for (let screenCol = 0; screenCol < 8; screenCol++) {
        // Convert screen coordinates to board coordinates
        const boardRow = this.flipped ? 7 - screenRow : screenRow;
        const boardCol = this.flipped ? 7 - screenCol : screenCol;

        const square = this.createSquare(boardRow, boardCol, {
          kingSquare,
          lastMove,
          screenRow,
          screenCol
        });

        this.boardEl.appendChild(square);
      }
    }

    // Update side panels
    this.updateMoveHistory();
    this.updateCapturedPieces();
  },

  createSquare(row, col, { kingSquare, lastMove }) {
    const el = document.createElement('div');
    const isLight = (row + col) % 2 === 1;
    el.className = `chess-square ${isLight ? 'light' : 'dark'}`;
    el.dataset.row = row;
    el.dataset.col = col;

    // Selected square
    if (this.selectedSquare && this.selectedSquare.row === row && this.selectedSquare.col === col) {
      el.classList.add('selected');
    }

    // King in check
    if (kingSquare && kingSquare.row === row && kingSquare.col === col) {
      el.classList.add('king-check');
    }

    // Last move highlight
    if (lastMove) {
      if (lastMove.from.row === row && lastMove.from.col === col) el.classList.add('last-move-from');
      if (lastMove.to.row === row && lastMove.to.col === col) el.classList.add('last-move-to');
    }

    // Legal move indicator
    const legalMove = this.legalMovesForSelected.find(m => m.to.row === row && m.to.col === col);
    if (legalMove) {
      const dot = document.createElement('div');
      if (legalMove.capture || legalMove.enPassant) {
        el.classList.add('can-capture');
        dot.className = 'move-dot';
      } else {
        dot.className = 'move-dot';
      }
      el.appendChild(dot);
    }

    // Piece
    const piece = this.gameState.board[row][col];
    if (piece) {
      const pieceEl = this.createPiece(piece, row, col);
      el.appendChild(pieceEl);
    }

    // Click handler
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSquareClick(row, col);
    });

    return el;
  },

  createPiece(piece, row, col) {
    const el = document.createElement('div');
    el.className = `chess-piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
    el.textContent = this.SYMBOLS[piece.color + piece.type];
    el.dataset.row = row;
    el.dataset.col = col;
    el.setAttribute('draggable', 'true');

    const isSelected = this.selectedSquare &&
      this.selectedSquare.row === row && this.selectedSquare.col === col;
    if (isSelected) el.classList.add('selected-piece');

    // Drag events
    el.addEventListener('dragstart', (e) => this.handleDragStart(e, row, col));
    el.addEventListener('dragend', () => this.handleDragEnd());

    return el;
  },

  // --- Interaction Handlers ---

  handleSquareClick(row, col) {
    if (this.gameOver || this.isThinking) return;

    const { board, turn } = this.gameState;
    const piece = board[row][col];
    const engine = ZChess.Engine;

    // If AI's turn, ignore
    if (this.isAIGame && turn !== this.playerColor) return;

    // If a square is already selected
    if (this.selectedSquare) {
      // Try to make a move
      const move = this.legalMovesForSelected.find(m =>
        m.to.row === row && m.to.col === col
      );

      if (move) {
        // Check if promotion
        if (move.promotion) {
          // Find all promotion moves to this square
          const promoMoves = this.legalMovesForSelected.filter(m =>
            m.to.row === row && m.to.col === col && m.promotion
          );
          this.showPromotionDialog(promoMoves, this.gameState.turn);
          return;
        }
        this.makeMove(move);
        return;
      }

      // Clicked own piece - select it instead
      if (piece && piece.color === turn) {
        this.selectPiece(row, col);
        return;
      }

      // Clicked empty square or opponent piece (not a valid move) - deselect
      this.deselectPiece();
      return;
    }

    // No piece selected yet - try to select
    if (piece && piece.color === turn) {
      this.selectPiece(row, col);
    }
  },

  selectPiece(row, col) {
    this.selectedSquare = { row, col };
    this.legalMovesForSelected = ZChess.Engine.getLegalMovesForPiece(this.gameState, row, col);

    // Filter to unique destination squares (for promotion, multiple moves to same dest)
    const seen = new Set();
    this.legalMovesForSelected = this.legalMovesForSelected.filter(m => {
      const key = `${m.to.row},${m.to.col}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Restore all including promotions
    this.legalMovesForSelected = ZChess.Engine.getLegalMovesForPiece(this.gameState, row, col);

    this.render();
    if (ZChess.Sound) ZChess.Sound.playClick();
  },

  deselectPiece() {
    this.selectedSquare = null;
    this.legalMovesForSelected = [];
    this.render();
  },

  // --- Move Execution ---

  async makeMove(move) {
    const engine = ZChess.Engine;

    // Save state for undo (only in AI games)
    if (this.isAIGame) {
      this.undoHistory.push(engine.cloneState(this.gameState));
    }

    // Apply the move
    this.gameState = engine.applyMove(this.gameState, move);
    this.selectedSquare = null;
    this.legalMovesForSelected = [];

    // Play sound
    if (ZChess.Sound) {
      if (move.castling) ZChess.Sound.playCastle();
      else if (move.capture || move.enPassant) ZChess.Sound.playCapture();
      else if (move.promotion) ZChess.Sound.playPromotion();
      else ZChess.Sound.playMove();
    }

    // Render
    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    // Check game status
    const status = engine.getGameStatus(this.gameState);

    if (status.status === 'check') {
      if (ZChess.Sound) ZChess.Sound.playCheck();
    }

    if (status.status !== 'playing' && status.status !== 'check') {
      this.handleGameEnd(status, move);
      return;
    }

    // AI move
    if (this.isAIGame && this.gameState.turn !== this.playerColor) {
      await this.triggerAIMove();
    }
  },

  async triggerAIMove() {
    if (this.gameOver || this.isThinking) return;

    this.isThinking = true;
    this.showAIThinking(true);
    this.updateTurnIndicator();

    try {
      const move = await ZChess.AI.getBestMoveAsync(this.gameState, this.aiDifficulty);

      if (!move || this.gameOver) {
        this.isThinking = false;
        this.showAIThinking(false);
        return;
      }

      // Apply AI move
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

      if (status.status === 'check') {
        if (ZChess.Sound) ZChess.Sound.playCheck();
      }

      if (status.status !== 'playing' && status.status !== 'check') {
        this.handleGameEnd(status, move);
      }

    } catch (e) {
      console.error('[ChessBoard] AI error:', e);
    }

    this.isThinking = false;
    this.showAIThinking(false);
  },

  // --- Promotion Dialog ---

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

  // --- Game End ---

  async handleGameEnd(status, lastMove) {
    this.gameOver = true;
    localStorage.removeItem(ZChess.STORAGE.GAME_STATE);

    let outcome;
    let heading, reason;

    if (status.status === 'checkmate') {
      const winnerColor = status.winner;
      if (this.isAIGame) {
        outcome = winnerColor === this.playerColor ? 'win' : 'loss';
      } else {
        outcome = winnerColor === 'w' ? 'win' : 'loss'; // from white's perspective
      }
      heading = outcome === 'win' ? t('board.you_win') : t('board.you_lose');
      reason = t('board.checkmate');

      if (ZChess.Sound) {
        outcome === 'win' ? ZChess.Sound.playWin() : ZChess.Sound.playCheckmate();
      }
    } else {
      outcome = 'draw';
      heading = t('board.draw');
      const reasonMap = {
        stalemate: t('board.stalemate'),
        insufficient: t('board.draw_insufficient'),
        'fifty-move': t('board.draw_fifty'),
        repetition: 'Draw - Threefold Repetition'
      };
      reason = reasonMap[status.reason] || t('board.draw');

      if (ZChess.Sound) ZChess.Sound.playDraw();
    }

    // Save game result
    let xpGain = 0, ratingChange = 0, newLevel = 1;

    if (ZChess.Auth.isLoggedIn()) {
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
      if (result) {
        xpGain = result.xpGain;
        ratingChange = result.ratingChange;
        newLevel = result.newLevel;
      }
    }

    // Show result modal
    setTimeout(() => {
      this.showGameResultModal(heading, reason, outcome, xpGain, ratingChange);
    }, 600);
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
    document.getElementById('result-rating').textContent = ratingChange >= 0 ? `+${ratingChange}` : ratingChange;
    document.getElementById('result-rating').className = `result-stat-value ${ratingChange >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('game-result-overlay').classList.add('open');
  },

  // --- Undo Move ---

  undoMove() {
    if (!this.isAIGame || this.undoHistory.length === 0 || this.gameOver) return;

    // Undo player's move and AI's move (2 moves back)
    const targetLength = Math.max(0, this.undoHistory.length - 2);
    this.gameState = this.undoHistory[targetLength] || this.undoHistory[0];
    this.undoHistory = this.undoHistory.slice(0, targetLength);

    this.selectedSquare = null;
    this.legalMovesForSelected = [];
    this.isThinking = false;
    this.gameOver = false;

    this.render();
    this.updateTurnIndicator();
    this.updatePlayerBars();
    this.saveGameState();

    ZChess.Notifications.info('Move undone');
  },

  // --- Resign ---

  resign() {
    if (this.gameOver) return;

    const outcome = 'loss';
    this.gameOver = true;
    localStorage.removeItem(ZChess.STORAGE.GAME_STATE);

    if (ZChess.Auth.isLoggedIn()) {
      ZChess.Auth.saveGameResult({
        outcome,
        isAI: this.isAIGame,
        aiDifficulty: this.aiDifficulty,
        opponentRating: 1200,
        moves: this.gameState.history.length
      });
    }

    if (ZChess.Sound) ZChess.Sound.playLose();
    this.showGameResultModal(t('board.you_lose'), 'Resigned', 'loss', 20, -10);
  },

  // --- Board Flip ---

  flipBoard() {
    this.flipped = !this.flipped;
    this.render();
  },

  // --- UI Updates ---

  updateTurnIndicator() {
    const el = document.getElementById('turn-indicator');
    if (!el) return;

    const { turn } = this.gameState;
    const engine = ZChess.Engine;
    const inCheck = engine.isInCheck(this.gameState.board, turn);

    if (inCheck) {
      el.className = 'turn-indicator check-indicator';
      el.innerHTML = `<div class="turn-dot"></div> ${t('board.check')}`;
    } else if (this.isThinking) {
      el.className = 'turn-indicator opponent-turn';
      el.innerHTML = `
        <div class="ai-thinking">
          <div class="thinking-dots">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
          </div>
          ${t('board.ai_thinking')}
        </div>
      `;
    } else {
      const isPlayerTurn = !this.isAIGame || turn === this.playerColor;
      el.className = `turn-indicator ${isPlayerTurn ? 'your-turn' : 'opponent-turn'}`;
      el.innerHTML = `
        <div class="turn-dot"></div>
        ${isPlayerTurn ? t('board.your_turn') : (this.isAIGame ? t('board.ai_thinking') : t('board.opponent_turn'))}
      `;
    }
  },

  updatePlayerBars() {
    const user = ZChess.Auth.currentUser;
    const userName = user?.username || t('common.guest');
    const userRating = user?.rating || '';

    // White bar
    const whiteBar = document.getElementById('player-bar-white');
    const blackBar = document.getElementById('player-bar-black');

    if (whiteBar) {
      const isActive = this.gameState.turn === 'w';
      whiteBar.classList.toggle('active', isActive);

      const whiteName = this.playerColor === 'w' ? userName : (this.isAIGame ? `AI (${this.aiDifficulty})` : 'Opponent');
      const whiteRating = this.playerColor === 'w' ? userRating : '';
      whiteBar.querySelector('.player-name-sm').textContent = whiteName;
      whiteBar.querySelector('.player-rating-sm').textContent = whiteRating;
    }

    if (blackBar) {
      const isActive = this.gameState.turn === 'b';
      blackBar.classList.toggle('active', isActive);

      const blackName = this.playerColor === 'b' ? userName : (this.isAIGame ? `AI (${this.aiDifficulty})` : 'Opponent');
      const blackRating = this.playerColor === 'b' ? userRating : '';
      blackBar.querySelector('.player-name-sm').textContent = blackName;
      blackBar.querySelector('.player-rating-sm').textContent = blackRating;
    }
  },

  updateMoveHistory() {
    const el = document.getElementById('move-history-list');
    if (!el) return;

    const history = this.gameState.history;
    el.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const white = history[i];
      const black = history[i + 1];

      const row = document.createElement('div');
      row.className = 'move-history-row';
      row.innerHTML = `
        <span class="move-number">${moveNum}.</span>
        <span class="move-white">${white?.notation || ''}</span>
        <span class="move-black">${black?.notation || ''}</span>
      `;
      el.appendChild(row);
    }

    // Scroll to bottom
    const panel = document.getElementById('move-history-panel');
    if (panel) panel.scrollTop = panel.scrollHeight;
  },

  updateCapturedPieces() {
    const { capturedPieces } = this.gameState;
    const VALUE_ORDER = ['Q','R','B','N','P'];

    const updateBar = (elId, pieces) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.innerHTML = pieces
        .sort((a,b) => VALUE_ORDER.indexOf(a) - VALUE_ORDER.indexOf(b))
        .map(type => `<span class="captured-piece">${this.SYMBOLS['b' + type]}</span>`)
        .join('');
    };

    updateBar('captured-by-white', capturedPieces.b);
    updateBar('captured-by-black', capturedPieces.w);
  },

  showAIThinking(show) {
    const el = document.getElementById('ai-thinking-indicator');
    if (el) el.style.display = show ? 'flex' : 'none';
  },

  // --- Drag & Drop ---

  dragSource: null,

  handleDragStart(e, row, col) {
    const { board, turn } = this.gameState;
    const piece = board[row][col];
    if (!piece || (this.isAIGame && piece.color !== this.playerColor)) {
      e.preventDefault();
      return;
    }

    this.dragSource = { row, col };
    this.selectPiece(row, col);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row},${col}`);

    // Make dragged element look right
    setTimeout(() => {
      const el = e.target;
      if (el) el.classList.add('dragging');
    }, 0);
  },

  handleDragEnd() {
    this.dragSource = null;
    document.querySelectorAll('.chess-piece.dragging').forEach(el => {
      el.classList.remove('dragging');
    });
  },

  initDragDrop() {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;

    boardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    boardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('.chess-square');
      if (!target || !this.dragSource) return;

      const toRow = parseInt(target.dataset.row);
      const toCol = parseInt(target.dataset.col);

      if (isNaN(toRow) || isNaN(toCol)) return;

      this.handleSquareClick(toRow, toCol);
      this.dragSource = null;
    });
  },

  // --- Coordinate Labels ---

  updateCoordinates() {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['1','2','3','4','5','6','7','8'];

    const colLabels = document.getElementById('board-col-labels');
    const rowLabels = document.getElementById('board-row-labels');

    if (colLabels) {
      const displayFiles = this.flipped ? [...files].reverse() : files;
      colLabels.innerHTML = displayFiles.map(f => `<span class="coord-label">${f}</span>`).join('');
    }

    if (rowLabels) {
      const displayRanks = this.flipped ? ranks : [...ranks].reverse();
      rowLabels.innerHTML = displayRanks.map(r => `<span class="coord-label">${r}</span>`).join('');
    }
  },

  // Main init
  init() {
    this.initDragDrop();
    console.log('[ZChess] ChessBoard module loaded');
  }
};

window.ZChess.ChessBoard = ChessBoard;

ChessBoard.init();

})();
