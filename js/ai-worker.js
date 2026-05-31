/* =============================================
   ZChess - AI Web Worker
   Runs chess AI in a separate thread so UI never freezes
   ============================================= */

// Make window = self so existing IIFE modules work in worker context
var window = self;

// Load chess engine and AI engine
try {
  importScripts('./chess-engine.js', './ai-engine.js');
} catch (e) {
  self.postMessage({ error: 'Failed to load scripts: ' + e.message });
}

// Listen for compute requests from main thread
self.onmessage = function(e) {
  const { state, difficulty, id } = e.data;

  try {
    const move = ZChess.AI.getBestMove(state, difficulty);
    self.postMessage({ move, id });
  } catch (err) {
    self.postMessage({ error: err.message, id });
  }
};

console.log('[AIWorker] Ready');
