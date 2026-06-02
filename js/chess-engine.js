/* =============================================
   ZChess - Complete Chess Rules Engine
   Supports: all standard chess rules including
   en passant, castling, promotion, check/checkmate/stalemate
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

// Board layout:
// board[row][col]
// row 0 = rank 1 (white back rank), row 7 = rank 8 (black back rank)
// col 0 = a-file, col 7 = h-file
// White pawns start at row 1, move toward row 7 (+row direction)
// Black pawns start at row 6, move toward row 0 (-row direction)

const ChessEngine = {

  // --- State Management ---

  createInitialState() {
    return {
      board: this.createInitialBoard(),
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null, // { row, col } target square or null
      halfMoveClock: 0,
      fullMoveNumber: 1,
      history: [],
      capturedPieces: { w: [], b: [] },
      positionHistory: [] // for threefold repetition
    };
  },

  createInitialBoard() {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['R','N','B','Q','K','B','N','R'];

    for (let c = 0; c < 8; c++) {
      grid[0][c] = { type: back[c], color: 'w' };
      grid[1][c] = { type: 'P', color: 'w' };
      grid[6][c] = { type: 'P', color: 'b' };
      grid[7][c] = { type: back[c], color: 'b' };
    }

    return grid;
  },

  cloneBoard(board) {
    return board.map(row => row.map(p => p ? { ...p } : null));
  },

  cloneState(state) {
    return {
      board: this.cloneBoard(state.board),
      turn: state.turn,
      castling: { ...state.castling },
      enPassant: state.enPassant ? { ...state.enPassant } : null,
      halfMoveClock: state.halfMoveClock,
      fullMoveNumber: state.fullMoveNumber,
      history: [...state.history],
      capturedPieces: {
        w: [...state.capturedPieces.w],
        b: [...state.capturedPieces.b]
      },
      positionHistory: [...(state.positionHistory || [])]
    };
  },

  // --- Utilities ---

  inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  },

  opp(color) {
    return color === 'w' ? 'b' : 'w';
  },

  pawnDir(color) {
    return color === 'w' ? 1 : -1;
  },

  pawnStartRow(color) {
    return color === 'w' ? 1 : 6;
  },

  promotionRow(color) {
    return color === 'w' ? 7 : 0;
  },

  backRankRow(color) {
    return color === 'w' ? 0 : 7;
  },

  squareToAlgebraic(row, col) {
    return String.fromCharCode(97 + col) + (row + 1);
  },

  algebraicToSquare(algebraic) {
    const col = algebraic.charCodeAt(0) - 97;
    const row = parseInt(algebraic[1]) - 1;
    return { row, col };
  },

  // --- Move Generation ---

  getPseudoMoves(board, row, col, castling, enPassant) {
    const piece = board[row][col];
    if (!piece) return [];

    const { type, color } = piece;
    const moves = [];

    const addMove = (tr, tc, extra = {}) => {
      if (!this.inBounds(tr, tc)) return;
      const target = board[tr][tc];
      if (target && target.color === color) return; // can't capture own piece
      moves.push({
        from: { row, col },
        to: { row: tr, col: tc },
        piece: { type, color },
        capture: target ? { ...target } : null,
        ...extra
      });
    };

    const addSlide = (dr, dc) => {
      let r = row + dr, c = col + dc;
      while (this.inBounds(r, c)) {
        const target = board[r][c];
        if (target) {
          if (target.color !== color) {
            moves.push({
              from: { row, col },
              to: { row: r, col: c },
              piece: { type, color },
              capture: { ...target }
            });
          }
          break;
        }
        moves.push({
          from: { row, col },
          to: { row: r, col: c },
          piece: { type, color },
          capture: null
        });
        r += dr; c += dc;
      }
    };

    switch (type) {
      case 'P': {
        const dir = this.pawnDir(color);
        const startRow = this.pawnStartRow(color);
        const promoRow = this.promotionRow(color);
        const nr = row + dir;

        if (this.inBounds(nr, col) && !board[nr][col]) {
          if (nr === promoRow) {
            for (const pt of ['Q','R','B','N']) {
              moves.push({ from:{row,col}, to:{row:nr,col}, piece:{type,color}, capture:null, promotion:pt });
            }
          } else {
            addMove(nr, col);
            // Double push
            if (row === startRow) {
              const nr2 = row + 2 * dir;
              if (this.inBounds(nr2, col) && !board[nr2][col]) {
                moves.push({ from:{row,col}, to:{row:nr2,col}, piece:{type,color}, capture:null, doublePush:true });
              }
            }
          }
        }

        // Captures (diagonal)
        for (const dc of [-1, 1]) {
          const nc = col + dc;
          if (!this.inBounds(nr, nc)) continue;

          const target = board[nr][nc];
          if (target && target.color !== color) {
            if (nr === promoRow) {
              for (const pt of ['Q','R','B','N']) {
                moves.push({ from:{row,col}, to:{row:nr,col:nc}, piece:{type,color}, capture:{...target}, promotion:pt });
              }
            } else {
              moves.push({ from:{row,col}, to:{row:nr,col:nc}, piece:{type,color}, capture:{...target} });
            }
          }

          // En passant
          if (enPassant && nr === enPassant.row && nc === enPassant.col) {
            moves.push({
              from: { row, col },
              to: { row: nr, col: nc },
              piece: { type, color },
              capture: { type: 'P', color: this.opp(color) },
              enPassant: true,
              epCaptureSquare: { row, col: nc }
            });
          }
        }
        break;
      }

      case 'N':
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          addMove(row + dr, col + dc);
        }
        break;

      case 'B':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) addSlide(dr, dc);
        break;

      case 'R':
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) addSlide(dr, dc);
        break;

      case 'Q':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) addSlide(dr, dc);
        break;

      case 'K': {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          addMove(row + dr, col + dc);
        }

        // Castling - king must be on home square
        const br = this.backRankRow(color);
        if (row === br && col === 4) {
          // Kingside
          if (castling[color + 'K'] &&
              !board[br][5] && !board[br][6] &&
              board[br][7]?.type === 'R' && board[br][7]?.color === color) {
            moves.push({ from:{row,col}, to:{row:br,col:6}, piece:{type,color}, capture:null, castling:'K' });
          }
          // Queenside
          if (castling[color + 'Q'] &&
              !board[br][3] && !board[br][2] && !board[br][1] &&
              board[br][0]?.type === 'R' && board[br][0]?.color === color) {
            moves.push({ from:{row,col}, to:{row:br,col:2}, piece:{type,color}, capture:null, castling:'Q' });
          }
        }
        break;
      }
    }

    return moves;
  },

  // --- Attack Detection ---

  isSquareAttacked(board, row, col, byColor) {
    // Pawn attacks
    const pDir = byColor === 'w' ? 1 : -1;
    const pr = row - pDir;
    for (const dc of [-1, 1]) {
      if (this.inBounds(pr, col + dc)) {
        const p = board[pr][col + dc];
        if (p && p.type === 'P' && p.color === byColor) return true;
      }
    }

    // Knight attacks
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = row + dr, c = col + dc;
      if (this.inBounds(r, c)) {
        const p = board[r][c];
        if (p && p.type === 'N' && p.color === byColor) return true;
      }
    }

    // Diagonal (bishop/queen)
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let r = row + dr, c = col + dc;
      while (this.inBounds(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true;
          break;
        }
        r += dr; c += dc;
      }
    }

    // Straight (rook/queen)
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let r = row + dr, c = col + dc;
      while (this.inBounds(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true;
          break;
        }
        r += dr; c += dc;
      }
    }

    // King attacks
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const r = row + dr, c = col + dc;
      if (this.inBounds(r, c)) {
        const p = board[r][c];
        if (p && p.type === 'K' && p.color === byColor) return true;
      }
    }

    return false;
  },

  findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'K' && p.color === color) return { row: r, col: c };
      }
    }
    return null;
  },

  isInCheck(board, color) {
    const king = this.findKing(board, color);
    if (!king) return true;
    return this.isSquareAttacked(board, king.row, king.col, this.opp(color));
  },

  // --- Move Application ---

  applyMoveToBoard(board, move) {
    const nb = this.cloneBoard(board);
    const { from, to } = move;

    // Place piece (with promotion)
    nb[to.row][to.col] = move.promotion
      ? { type: move.promotion, color: move.piece.color }
      : { ...move.piece };

    nb[from.row][from.col] = null;

    // En passant: remove captured pawn
    if (move.enPassant && move.epCaptureSquare) {
      nb[move.epCaptureSquare.row][move.epCaptureSquare.col] = null;
    }

    // Castling: move rook
    if (move.castling) {
      const br = from.row;
      if (move.castling === 'K') {
        nb[br][5] = { type: 'R', color: move.piece.color };
        nb[br][7] = null;
      } else {
        nb[br][3] = { type: 'R', color: move.piece.color };
        nb[br][0] = null;
      }
    }

    return nb;
  },

  /** Shared rules update after a move (board already applied). */
  _buildStateAfterMove(state, move, board) {
    const castling = { ...state.castling };
    const c = move.piece.color;

    const enPassant = move.doublePush
      ? { row: move.from.row + this.pawnDir(move.piece.color), col: move.from.col }
      : null;

    if (move.piece.type === 'K') {
      castling[c + 'K'] = false;
      castling[c + 'Q'] = false;
    }
    if (move.piece.type === 'R') {
      if (move.from.col === 0) castling[c + 'Q'] = false;
      if (move.from.col === 7) castling[c + 'K'] = false;
    }
    if (move.capture?.type === 'R') {
      const oc = this.opp(c);
      const obr = this.backRankRow(oc);
      if (move.to.row === obr) {
        if (move.to.col === 0) castling[oc + 'Q'] = false;
        if (move.to.col === 7) castling[oc + 'K'] = false;
      }
    }

    const halfMoveClock = (move.piece.type === 'P' || move.capture) ? 0 : state.halfMoveClock + 1;
    const fullMoveNumber = state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

    return {
      board,
      turn: this.opp(state.turn),
      castling,
      enPassant,
      halfMoveClock,
      fullMoveNumber
    };
  },

  // Apply move to full game state (returns new state)
  applyMove(state, move) {
    const board = this.applyMoveToBoard(state.board, move);
    const core = this._buildStateAfterMove(state, move, board);
    const ns = this.cloneState(state);
    Object.assign(ns, core);

    if (move.capture) {
      ns.capturedPieces[this.opp(move.capture.color)].push(move.capture.type);
    }

    const notation = this.getMoveNotation(move, state);
    ns.history.push({ ...move, notation });

    const hash = this.getBoardHash(ns.board, ns.turn, ns.castling, ns.enPassant);
    ns.positionHistory = [...(state.positionHistory || []), hash];

    return ns;
  },

  /**
   * Lightweight move for AI search - no history / repetition arrays (avoids O(n) copies per node).
   */
  applyMoveSearch(state, move) {
    const board = this.applyMoveToBoard(state.board, move);
    const core = this._buildStateAfterMove(state, move, board);
    return {
      ...core,
      history: [],
      capturedPieces: { w: [], b: [] },
      positionHistory: [],
      searchPly: (state.searchPly || 0) + 1
    };
  },

  /** Strip UI-only fields before sending position to the AI worker. */
  compactStateForAI(state) {
    return {
      board: state.board,
      turn: state.turn,
      castling: state.castling,
      enPassant: state.enPassant,
      halfMoveClock: state.halfMoveClock,
      fullMoveNumber: state.fullMoveNumber,
      history: [],
      capturedPieces: { w: [], b: [] },
      positionHistory: [],
      searchPly: 0
    };
  },

  // --- Legal Move Filtering ---

  getLegalMoves(state) {
    const { board, turn, castling, enPassant } = state;
    const legal = [];
    const opp = this.opp(turn);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== turn) continue;

        const pseudos = this.getPseudoMoves(board, r, c, castling, enPassant);

        for (const move of pseudos) {
          // Castling: check squares aren't attacked
          if (move.castling) {
            const br = this.backRankRow(turn);
            if (this.isSquareAttacked(board, br, 4, opp)) continue;
            if (move.castling === 'K') {
              if (this.isSquareAttacked(board, br, 5, opp)) continue;
              if (this.isSquareAttacked(board, br, 6, opp)) continue;
            } else {
              if (this.isSquareAttacked(board, br, 3, opp)) continue;
              if (this.isSquareAttacked(board, br, 2, opp)) continue;
            }
          }

          // Apply move and check if own king is in check
          const nb = this.applyMoveToBoard(board, move);
          if (!this.isInCheck(nb, turn)) {
            legal.push(move);
          }
        }
      }
    }

    return legal;
  },

  getLegalMovesForPiece(state, row, col) {
    const all = this.getLegalMoves(state);
    return all.filter(m => m.from.row === row && m.from.col === col);
  },

  // --- Game Status ---

  isCheckmate(state) {
    return this.isInCheck(state.board, state.turn) && this.getLegalMoves(state).length === 0;
  },

  isStalemate(state) {
    return !this.isInCheck(state.board, state.turn) && this.getLegalMoves(state).length === 0;
  },

  isInsufficientMaterial(board) {
    const pieces = { w: [], b: [] };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) pieces[p.color].push({ type: p.type, row: r, col: c });
      }
    }

    const isInsufficient = (list) => {
      if (list.length === 1) return true;
      if (list.length === 2) {
        const nonKing = list.find(p => p.type !== 'K');
        return nonKing && (nonKing.type === 'N' || nonKing.type === 'B');
      }
      return false;
    };

    return isInsufficient(pieces.w) && isInsufficient(pieces.b);
  },

  isThreefoldRepetition(state) {
    const hash = this.getBoardHash(state.board, state.turn, state.castling, state.enPassant);
    const history = state.positionHistory || [];
    const count = history.filter(h => h === hash).length;
    return count >= 2; // current position is 3rd occurrence
  },

  isDraw50Move(state) {
    return state.halfMoveClock >= 100;
  },

  getBoardHash(board, turn, castling, enPassant) {
    let hash = turn;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        hash += p ? p.color + p.type : '-';
      }
    }
    hash += castling.wK ? 'K' : '';
    hash += castling.wQ ? 'Q' : '';
    hash += castling.bK ? 'k' : '';
    hash += castling.bQ ? 'q' : '';
    if (enPassant) hash += `ep${enPassant.row}${enPassant.col}`;
    return hash;
  },

  getGameStatus(state) {
    if (this.isCheckmate(state)) {
      return { status: 'checkmate', winner: this.opp(state.turn), reason: 'checkmate' };
    }
    if (this.isStalemate(state)) {
      return { status: 'draw', winner: null, reason: 'stalemate' };
    }
    if (this.isInsufficientMaterial(state.board)) {
      return { status: 'draw', winner: null, reason: 'insufficient' };
    }
    if (this.isDraw50Move(state)) {
      return { status: 'draw', winner: null, reason: 'fifty-move' };
    }
    if (this.isThreefoldRepetition(state)) {
      return { status: 'draw', winner: null, reason: 'repetition' };
    }
    if (this.isInCheck(state.board, state.turn)) {
      return { status: 'check', winner: null, reason: 'check' };
    }
    return { status: 'playing', winner: null, reason: null };
  },

  // --- Notation ---

  getMoveNotation(move, state) {
    if (move.castling === 'K') return 'O-O';
    if (move.castling === 'Q') return 'O-O-O';

    const { piece, from, to, capture, promotion, enPassant } = move;
    let notation = '';

    if (piece.type !== 'P') {
      notation += piece.type;
      // Disambiguation
      const board = state.board;
      const ambiguous = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === from.row && c === from.col) continue;
          const p = board[r][c];
          if (p && p.type === piece.type && p.color === piece.color) {
            const moves = this.getPseudoMoves(board, r, c, state.castling, state.enPassant);
            if (moves.some(m => m.to.row === to.row && m.to.col === to.col)) {
              ambiguous.push({ row: r, col: c });
            }
          }
        }
      }
      if (ambiguous.length > 0) {
        const sameCol = ambiguous.some(p => p.col === from.col);
        const sameRow = ambiguous.some(p => p.row === from.row);
        if (!sameCol) notation += String.fromCharCode(97 + from.col);
        else if (!sameRow) notation += (from.row + 1);
        else notation += String.fromCharCode(97 + from.col) + (from.row + 1);
      }
    }

    if (capture || enPassant) {
      if (piece.type === 'P') notation += String.fromCharCode(97 + from.col);
      notation += 'x';
    }

    notation += this.squareToAlgebraic(to.row, to.col);

    if (promotion) notation += '=' + promotion;

    // Check/checkmate indicators will be added after applying move
    return notation;
  },

  /** Load position from FEN (pieces + turn + castling + en passant) */
  parseFEN(fen) {
    const parts = (fen || '').trim().split(/\s+/);
    if (!parts[0]) return this.createInitialState();

    const rows = parts[0].split('/');
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let fenRank = 0; fenRank < 8; fenRank++) {
      const row = 7 - fenRank;
      let col = 0;
      for (const ch of rows[fenRank] || '') {
        if (ch >= '1' && ch <= '8') {
          col += parseInt(ch, 10);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          board[row][col] = { type: ch.toUpperCase(), color };
          col++;
        }
      }
    }

    const turn = parts[1] === 'b' ? 'b' : 'w';
    const castStr = parts[2] || 'KQkq';
    const castling = {
      wK: castStr.includes('K'),
      wQ: castStr.includes('Q'),
      bK: castStr.includes('k'),
      bQ: castStr.includes('q')
    };

    let enPassant = null;
    if (parts[3] && parts[3] !== '-') {
      const file = parts[3].charCodeAt(0) - 97;
      const epRank = parts[3][1] === '3' ? 2 : 5;
      if (file >= 0 && file < 8) enPassant = { row: epRank, col: file };
    }

    return {
      board,
      turn,
      castling,
      enPassant,
      halfMoveClock: parseInt(parts[4], 10) || 0,
      fullMoveNumber: parseInt(parts[5], 10) || 1,
      history: [],
      capturedPieces: { w: [], b: [] },
      positionHistory: []
    };
  },

  // Get FEN string (for debugging/display)
  getFEN(state) {
    const ranks = [];
    for (let r = 7; r >= 0; r--) {
      let rank = '';
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) { rank += empty; empty = 0; }
          rank += p.color === 'w' ? p.type : p.type.toLowerCase();
        }
      }
      if (empty > 0) rank += empty;
      ranks.push(rank);
    }

    const castling = [
      state.castling.wK ? 'K' : '',
      state.castling.wQ ? 'Q' : '',
      state.castling.bK ? 'k' : '',
      state.castling.bQ ? 'q' : ''
    ].join('') || '-';

    const ep = state.enPassant ? this.squareToAlgebraic(state.enPassant.row, state.enPassant.col) : '-';

    return `${ranks.join('/')} ${state.turn} ${castling} ${ep} ${state.halfMoveClock} ${state.fullMoveNumber}`;
  }
};

window.ZChess.Engine = ChessEngine;

console.log('[ZChess] Chess Engine loaded');

})();
