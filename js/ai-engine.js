/* =============================================
   ZChess - Chess AI Engine
   Minimax with Alpha-Beta Pruning + Piece-Square Tables
   7 Difficulty levels
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const ChessAI = {

  PIECE_VALUES: { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 },

  // Piece-Square Tables from white's perspective
  // Index [0] = rank 1 (white back rank), [7] = rank 8 (black back rank)
  PST: {
    P: [
      [  0,  0,  0,  0,  0,  0,  0,  0],
      [  5, 10, 10,-20,-20, 10, 10,  5],
      [  5, -5,-10,  0,  0,-10, -5,  5],
      [  0,  0,  0, 20, 20,  0,  0,  0],
      [  5,  5, 10, 25, 25, 10,  5,  5],
      [ 10, 10, 20, 30, 30, 20, 10, 10],
      [ 50, 50, 50, 50, 50, 50, 50, 50],
      [  0,  0,  0,  0,  0,  0,  0,  0]
    ],
    N: [
      [-50,-40,-30,-30,-30,-30,-40,-50],
      [-40,-20,  0,  5,  5,  0,-20,-40],
      [-30,  5, 10, 15, 15, 10,  5,-30],
      [-30,  0, 15, 20, 20, 15,  0,-30],
      [-30,  5, 15, 20, 20, 15,  5,-30],
      [-30,  0, 10, 15, 15, 10,  0,-30],
      [-40,-20,  0,  0,  0,  0,-20,-40],
      [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    B: [
      [-20,-10,-10,-10,-10,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-10,  0,  5, 10, 10,  5,  0,-10],
      [-10,  5,  5, 10, 10,  5,  5,-10],
      [-10,  0, 10, 10, 10, 10,  0,-10],
      [-10, 10, 10, 10, 10, 10, 10,-10],
      [-10,  5,  0,  0,  0,  0,  5,-10],
      [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    R: [
      [  0,  0,  0,  5,  5,  0,  0,  0],
      [ -5,  0,  0,  0,  0,  0,  0, -5],
      [ -5,  0,  0,  0,  0,  0,  0, -5],
      [ -5,  0,  0,  0,  0,  0,  0, -5],
      [ -5,  0,  0,  0,  0,  0,  0, -5],
      [ -5,  0,  0,  0,  0,  0,  0, -5],
      [  5, 10, 10, 10, 10, 10, 10,  5],
      [  0,  0,  0,  0,  0,  0,  0,  0]
    ],
    Q: [
      [-20,-10,-10, -5, -5,-10,-10,-20],
      [-10,  0,  5,  0,  0,  0,  0,-10],
      [-10,  5,  5,  5,  5,  5,  0,-10],
      [  0,  0,  5,  5,  5,  5,  0, -5],
      [ -5,  0,  5,  5,  5,  5,  0, -5],
      [-10,  0,  5,  5,  5,  5,  0,-10],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    K_EARLY: [
      [ 20, 30, 10,  0,  0, 10, 30, 20],
      [ 20, 20,  0,  0,  0,  0, 20, 20],
      [-10,-20,-20,-20,-20,-20,-20,-10],
      [-20,-30,-30,-40,-40,-30,-30,-20],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30]
    ],
    K_END: [
      [-50,-30,-30,-30,-30,-30,-30,-50],
      [-30,-30,  0,  0,  0,  0,-30,-30],
      [-30,-10, 20, 30, 30, 20,-10,-30],
      [-30,-10, 30, 40, 40, 30,-10,-30],
      [-30,-10, 30, 40, 40, 30,-10,-30],
      [-30,-10, 20, 30, 30, 20,-10,-30],
      [-30,-20,-10,  0,  0,-10,-20,-30],
      [-50,-40,-30,-20,-20,-30,-40,-50]
    ]
  },

  // Evaluate board from white's perspective (+white advantage, -black advantage)
  evaluate(state) {
    const { board } = state;
    let score = 0;
    let material = 0;
    let pieceCounts = { w: 0, b: 0 };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || p.type === 'K') continue;
        material += this.PIECE_VALUES[p.type];
        pieceCounts[p.color]++;
      }
    }

    const isEndgame = material < 1300; // less than ~3 pieces each

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;

        const val = this.PIECE_VALUES[p.type];
        const pstRow = p.color === 'w' ? r : 7 - r;

        let pst;
        if (p.type === 'K') {
          pst = isEndgame ? this.PST.K_END[pstRow][c] : this.PST.K_EARLY[pstRow][c];
        } else {
          pst = this.PST[p.type][pstRow][c];
        }

        if (p.color === 'w') {
          score += val + pst;
        } else {
          score -= val + pst;
        }
      }
    }

    return score;
  },

  // Order moves for better alpha-beta pruning
  orderMoves(moves) {
    return moves.sort((a, b) => {
      let scoreA = 0, scoreB = 0;

      // Captures (MVV-LVA: Most Valuable Victim - Least Valuable Attacker)
      if (a.capture) scoreA += this.PIECE_VALUES[a.capture.type] - (this.PIECE_VALUES[a.piece.type] / 10);
      if (b.capture) scoreB += this.PIECE_VALUES[b.capture.type] - (this.PIECE_VALUES[b.piece.type] / 10);

      // Promotions
      if (a.promotion === 'Q') scoreA += 800;
      if (b.promotion === 'Q') scoreB += 800;

      // Checks and castling (bonus)
      if (a.castling) scoreA += 50;
      if (b.castling) scoreB += 50;

      return scoreB - scoreA;
    });
  },

  // Quiescence search to avoid horizon effect
  quiescence(state, alpha, beta, isMaximizing, depth = 0) {
    const engine = ZChess.Engine;

    const standPat = this.evaluate(state);

    if (depth >= 4) return standPat;

    if (isMaximizing) {
      if (standPat >= beta) return beta;
      alpha = Math.max(alpha, standPat);
    } else {
      if (standPat <= alpha) return alpha;
      beta = Math.min(beta, standPat);
    }

    // Only search captures
    const moves = engine.getLegalMoves(state).filter(m => m.capture || m.promotion);
    const ordered = this.orderMoves(moves);

    for (const move of ordered) {
      const newState = engine.applyMove(state, move);
      const score = this.quiescence(newState, alpha, beta, !isMaximizing, depth + 1);

      if (isMaximizing) {
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      } else {
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
    }

    return isMaximizing ? alpha : beta;
  },

  // Minimax with alpha-beta pruning
  minimax(state, depth, alpha, beta, isMaximizing) {
    const engine = ZChess.Engine;
    const status = engine.getGameStatus(state);

    if (status.status === 'checkmate') {
      return isMaximizing ? -100000 + state.history.length : 100000 - state.history.length;
    }
    if (status.status === 'draw') {
      return 0;
    }

    if (depth === 0) {
      return this.quiescence(state, alpha, beta, isMaximizing);
    }

    const moves = engine.getLegalMoves(state);
    if (moves.length === 0) return isMaximizing ? -100000 : 100000;

    const ordered = this.orderMoves(moves);

    if (isMaximizing) {
      let maxVal = -Infinity;
      for (const move of ordered) {
        const ns = engine.applyMove(state, move);
        const val = this.minimax(ns, depth - 1, alpha, beta, false);
        maxVal = Math.max(maxVal, val);
        alpha = Math.max(alpha, val);
        if (beta <= alpha) break; // Beta cutoff
      }
      return maxVal;
    } else {
      let minVal = Infinity;
      for (const move of ordered) {
        const ns = engine.applyMove(state, move);
        const val = this.minimax(ns, depth - 1, alpha, beta, true);
        minVal = Math.min(minVal, val);
        beta = Math.min(beta, val);
        if (beta <= alpha) break; // Alpha cutoff
      }
      return minVal;
    }
  },

  // Get search depth for difficulty level
  // Depth 5 = ~grandmaster level (millions of positions, but alpha-beta keeps it fast)
  // Depth 7 was too slow in the main thread; with Web Worker depth 5 is the sweet spot
  getDepth(difficulty) {
    const depths = {
      beginner:    1,
      easy:        2,
      medium:      3,
      advanced:    4,
      expert:      5,
      grandmaster: 5,
      impossible:  5
    };
    return depths[difficulty] || 3;
  },

  // Get the best move for the current position
  getBestMove(state, difficulty) {
    const engine = ZChess.Engine;
    const moves = engine.getLegalMoves(state);

    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const depth = this.getDepth(difficulty);

    // Beginner: mostly random with slight preference for captures
    if (difficulty === 'beginner') {
      if (Math.random() < 0.7) {
        const captures = moves.filter(m => m.capture);
        if (captures.length > 0 && Math.random() < 0.6) {
          return captures[Math.floor(Math.random() * captures.length)];
        }
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Easy: mostly random but avoids blunders
    if (difficulty === 'easy') {
      if (Math.random() < 0.4) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
    }

    const isMaximizing = state.turn === 'w';
    let bestMove = null;
    let bestValue = isMaximizing ? -Infinity : Infinity;

    const ordered = this.orderMoves([...moves]);

    for (const move of ordered) {
      const ns = engine.applyMove(state, move);
      const value = this.minimax(ns, depth - 1, -Infinity, Infinity, !isMaximizing);

      if (isMaximizing ? value > bestValue : value < bestValue) {
        bestValue = value;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  },

  // Async move calculation (yields control to browser)
  async getBestMoveAsync(state, difficulty) {
    return new Promise((resolve) => {
      // Small timeout to let UI update (show "thinking" indicator)
      const delay = difficulty === 'beginner' ? 100 : 300;

      setTimeout(() => {
        const move = this.getBestMove(state, difficulty);
        resolve(move);
      }, delay);
    });
  }
};

window.ZChess.AI = ChessAI;

console.log('[ZChess] AI Engine loaded');

})();
