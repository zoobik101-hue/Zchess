/* =============================================
   ZChess - Online Multiplayer Module
   Uses Firestore for real-time sync.
   Handles: rooms, quick match, heartbeat,
   disconnect detection, reconnection.
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Multiplayer = {

  /* ---- State ---- */
  db:            null,
  roomId:        null,
  localUid:      null,
  localColor:    null, // 'w' | 'b'
  status:        'idle', // idle | searching | waiting | playing
  unsubRoom:     null,
  heartbeatTimer: null,
  _lastMoveCount: 0,
  _gameEnded:    false,
  _disconnectWarned: false,
  _forfeitTimer: null,

  /* ---- Init ---- */
  init() {
    if (ZChess.Auth && ZChess.Auth.db) this.db = ZChess.Auth.db;
  },

  /* ---- Helpers ---- */
  _ensureDb() {
    if (!this.db && ZChess.Auth?.db) this.db = ZChess.Auth.db;
    if (!this.db) throw new Error('Firebase not initialized');
  },

  _requireUser() {
    if (!ZChess.Auth?.currentUser) throw new Error('not_logged_in');
    return ZChess.Auth.currentUser;
  },

  generateCode() {
    // No confusable chars (0/O, I/l/1)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  },

  _now() { return Date.now(); },

  /* ================================================
     ROOM MANAGEMENT
     ================================================ */

  async createRoom(isPublic = false) {
    this._ensureDb();
    const user = this._requireUser();
    const code = this.generateCode();
    const ref  = this.db.collection('rooms').doc();

    const data = {
      id:         ref.id,
      inviteCode: code,
      status:     'waiting',
      isPublic:   isPublic,
      white: {
        uid:       user.uid,
        username:  user.username || 'Player',
        rating:    user.rating   || 1200,
        connected: true,
        lastPing:  this._now()
      },
      black:     null,
      moves:     [],
      turn:      'w',
      result:    null,
      createdAt: this._now()
    };

    await ref.set(data);
    this._activateRoom(ref.id, 'w', 'waiting');
    return { roomId: ref.id, code };
  },

  async joinByCode(code) {
    this._ensureDb();
    const user = this._requireUser();

    // Single-field query to avoid composite index requirement
    const snap = await this.db.collection('rooms')
      .where('inviteCode', '==', code.toUpperCase().trim())
      .limit(5).get();

    if (snap.empty) throw new Error('room_not_found');

    // Filter client-side
    const doc = snap.docs.find(d => d.data().status === 'waiting');
    if (!doc) throw new Error('room_not_found');

    const room = doc.data();
    if (room.white.uid === user.uid) throw new Error('own_room');

    const blackData = {
      uid:       user.uid,
      username:  user.username || 'Player',
      rating:    user.rating   || 1200,
      connected: true,
      lastPing:  this._now()
    };

    await doc.ref.update({ status: 'playing', black: blackData });

    this._activateRoom(doc.id, 'b', 'playing');

    // Joiner must start game immediately - handleRoomUpdate won't trigger
    // because this.status is already 'playing' (not 'waiting')
    const fullRoom = { ...room, status: 'playing', black: blackData };
    this._beginGame(fullRoom);

    return { roomId: doc.id };
  },

  async findQuickMatch() {
    this._ensureDb();
    const user = this._requireUser();

    // Single-field query to avoid composite index requirement
    const cutoff = this._now() - 120_000;
    const snap = await this.db.collection('rooms')
      .where('status', '==', 'waiting')
      .limit(20).get();

    // Filter client-side: public rooms, not ours, not too old
    const candidate = snap.docs.find(d => {
      const r = d.data();
      return r.isPublic && r.white.uid !== user.uid && r.createdAt > cutoff;
    });

    if (candidate) {
      const doc  = candidate;
      const room = doc.data();
      const blackData = {
        uid:       user.uid,
        username:  user.username || 'Player',
        rating:    user.rating   || 1200,
        connected: true,
        lastPing:  this._now()
      };
      await doc.ref.update({ status: 'playing', black: blackData });
      this._activateRoom(doc.id, 'b', 'playing');

      // Joiner starts game immediately (same as joinByCode)
      this._beginGame({ ...room, status: 'playing', black: blackData });

      return { roomId: doc.id, found: true };
    }

    // No room found - create public room and wait
    const result = await this.createRoom(true);
    return { ...result, found: false };
  },

  _activateRoom(roomId, color, status) {
    this.roomId     = roomId;
    this.localColor = color;
    this.localUid   = ZChess.Auth.currentUser.uid;
    this.status     = status;
    this._lastMoveCount = 0;
    this._gameEnded     = false;
    this._disconnectWarned = false;
    localStorage.setItem('zchess_room', roomId);
    this.subscribeRoom(roomId);
    this.startHeartbeat();
  },

  /* ================================================
     REAL-TIME SUBSCRIPTION
     ================================================ */

  subscribeRoom(roomId) {
    if (this.unsubRoom) { this.unsubRoom(); this.unsubRoom = null; }
    this.unsubRoom = this.db.collection('rooms').doc(roomId)
      .onSnapshot(doc => {
        if (doc.exists) this.handleRoomUpdate(doc.data());
      }, err => {
        console.error('[MP] Snapshot error:', err);
      });
  },

  handleRoomUpdate(room) {
    // Opponent joined → start game
    if (room.status === 'playing' && this.status === 'waiting') {
      this.status = 'playing';
      this._beginGame(room);
      return;
    }

    if (this.status !== 'playing') return;

    // Apply any new moves we haven't seen
    if (room.moves.length > this._lastMoveCount) {
      const newMoves = room.moves.slice(this._lastMoveCount);
      this._lastMoveCount = room.moves.length;
      newMoves.forEach(mv => {
        if (mv.playerUid !== this.localUid) {
          ZChess.ChessBoard.applyNetworkMove(mv);
        }
      });
    }

    // Game result came from Firestore (other player reported it)
    if (room.result && !this._gameEnded) {
      this._gameEnded = true;
      this._handleNetworkResult(room.result);
    }

    // Opponent disconnect / ping check
    const opp = this.localColor === 'w' ? room.black : room.white;
    if (opp) this._checkOpponentPing(opp.lastPing);
  },

  /* ================================================
     GAME START
     ================================================ */

  _beginGame(room) {
    const opp = this.localColor === 'w' ? room.black : room.white;
    if (!opp) return;

    // Make sure lobby overlay is visible to show countdown
    const overlay = document.getElementById('room-lobby-overlay');
    if (overlay && !overlay.classList.contains('open')) overlay.classList.add('open');

    this._showLobbyState('lobby-ready');
    this._updateReadyInfo(opp);

    let n = 3;
    const el = document.getElementById('lobby-countdown');

    const playerColor    = this.localColor;
    const opponentName   = opp.username || 'Opponent';
    const opponentRating = opp.rating   || 1200;

    const tick = () => {
      if (el) el.textContent = n;
      if (n-- <= 0) {
        // Close lobby modal
        if (overlay) overlay.classList.remove('open');

        // Navigate to the chess board page, then start the multiplayer game
        if (ZChess.App && ZChess.App.navigate) ZChess.App.navigate('play');

        setTimeout(() => {
          ZChess.ChessBoard.startMultiplayerGame({ playerColor, opponentName, opponentRating });
        }, 200);
        return;
      }
      setTimeout(tick, 1000);
    };
    tick();
  },

  _updateReadyInfo(opp) {
    const user = ZChess.Auth.currentUser || {};
    const myEl  = document.getElementById('ready-my-name');
    const oppEl = document.getElementById('ready-opp-name');
    const myR   = document.getElementById('ready-my-rating');
    const oppR  = document.getElementById('ready-opp-rating');
    if (myEl)  myEl.textContent  = user.username  || 'Вы';
    if (oppEl) oppEl.textContent = opp.username   || 'Соперник';
    if (myR)   myR.textContent   = user.rating    || 1200;
    if (oppR)  oppR.textContent  = opp.rating     || 1200;
  },

  /* ================================================
     MOVE SYNC
     ================================================ */

  async sendMove(move) {
    if (!this.roomId || !this.db) return;

    const mv = {
      playerUid: this.localUid,
      from:      { row: move.from.row, col: move.from.col },
      to:        { row: move.to.row,   col: move.to.col   },
      piece:     { type: move.piece.type, color: move.piece.color },
      captured:  move.captured ? { type: move.captured.type, color: move.captured.color } : null,
      promotion: move.promotion  || null,
      castling:  move.castling   || null,
      enPassant: move.enPassant  || false,
      ts:        this._now()
    };

    this._lastMoveCount++;

    await this.db.collection('rooms').doc(this.roomId).update({
      moves:       firebase.firestore.FieldValue.arrayUnion(mv),
      turn:        this.localColor === 'w' ? 'b' : 'w',
      lastMoveAt:  this._now()
    });
  },

  /* ================================================
     GAME END
     ================================================ */

  async reportResult(result) {
    if (!this.roomId || !this.db) return;
    if (this._gameEnded) return;
    this._gameEnded = true;

    await this.db.collection('rooms').doc(this.roomId).update({
      status: 'finished',
      result
    }).catch(() => {});
  },

  async resignOnline() {
    await this.reportResult({
      winner: this.localColor === 'w' ? 'b' : 'w',
      reason: 'resign'
    });
  },

  _handleNetworkResult(result) {
    if (ZChess.ChessBoard.gameOver) return;

    const isDraw = result.winner === 'draw';
    const iWon   = result.winner === this.localColor;

    let outcome, heading, reason;
    if (isDraw) {
      outcome = 'draw';
      heading = t('board.draw');
      reason  = t('board.draw');
    } else if (iWon) {
      outcome = 'win';
      heading = t('board.you_win');
      reason  = result.reason === 'resign'     ? t('board.resigned_reason') :
                result.reason === 'disconnect' ? 'Соперник отключился' :
                t('board.checkmate');
    } else {
      outcome = 'loss';
      heading = t('board.you_lose');
      reason  = result.reason === 'resign'     ? t('board.resigned_reason') :
                result.reason === 'disconnect' ? 'Вы были отключены' :
                t('board.checkmate');
    }

    ZChess.ChessBoard.gameOver = true;
    if (ZChess.Sound) {
      if (iWon)        ZChess.Sound.playWin?.();
      else if (isDraw) ZChess.Sound.playDraw?.();
      else             ZChess.Sound.playLose?.();
    }

    setTimeout(() => {
      const stats = ZChess.ChessBoard._buildGameStats?.() || null;
      ZChess.ChessBoard.showGameResultModal(heading, reason, outcome, 0, 0, stats);
    }, 800);
  },

  /* ================================================
     DISCONNECT DETECTION (heartbeat based)
     ================================================ */

  startHeartbeat() {
    this.stopHeartbeat();
    const key = this.localColor === 'w' ? 'white' : 'black';

    const ping = () => {
      if (!this.roomId || !this.db) return;
      this.db.collection('rooms').doc(this.roomId).update({
        [`${key}.lastPing`]:  this._now(),
        [`${key}.connected`]: true
      }).catch(() => {});
    };

    ping();
    this.heartbeatTimer = setInterval(ping, 8000);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this._forfeitTimer)  { clearTimeout(this._forfeitTimer);   this._forfeitTimer  = null; }
  },

  _checkOpponentPing(lastPing) {
    if (!lastPing || this._gameEnded) return;
    const age = this._now() - lastPing;

    if (age > 90_000) {
      // Auto-forfeit: opponent gone > 90 seconds
      if (!this._gameEnded) {
        this.reportResult({ winner: this.localColor, reason: 'disconnect' });
        ZChess.Notifications?.warning('Соперник отключился. Победа!');
      }
    } else if (age > 30_000 && !this._disconnectWarned) {
      this._disconnectWarned = true;
      const el = document.getElementById('mp-opp-status');
      if (el) { el.textContent = '⚠ Соединение потеряно'; el.className = 'mp-status-warn'; }
      ZChess.Notifications?.warning('Соперник потерял соединение...');
    } else if (age < 15_000 && this._disconnectWarned) {
      this._disconnectWarned = false;
      const el = document.getElementById('mp-opp-status');
      if (el) { el.textContent = '● Онлайн'; el.className = 'mp-status-ok'; }
    }
  },

  /* ================================================
     RECONNECTION
     ================================================ */

  async tryReconnect() {
    const savedId = localStorage.getItem('zchess_room');
    if (!savedId) return false;

    const user = ZChess.Auth?.currentUser;
    if (!user) { localStorage.removeItem('zchess_room'); return false; }

    this._ensureDb();

    try {
      const doc = await this.db.collection('rooms').doc(savedId).get();
      if (!doc.exists) { localStorage.removeItem('zchess_room'); return false; }

      const room = doc.data();
      if (room.status !== 'playing') { localStorage.removeItem('zchess_room'); return false; }

      // Determine our color
      if      (room.white.uid   === user.uid) this.localColor = 'w';
      else if (room.black?.uid  === user.uid) this.localColor = 'b';
      else { localStorage.removeItem('zchess_room'); return false; }

      this.roomId     = savedId;
      this.localUid   = user.uid;
      this.status     = 'playing';
      this._lastMoveCount = room.moves.length;
      this._gameEnded     = !!room.result;

      this.subscribeRoom(savedId);
      this.startHeartbeat();

      const opp = this.localColor === 'w' ? room.black : room.white;
      ZChess.ChessBoard.startMultiplayerGame({
        playerColor:    this.localColor,
        opponentName:   opp?.username || 'Opponent',
        opponentRating: opp?.rating   || 1200,
        moves:          room.moves
      });

      ZChess.Notifications?.success('Переподключено к игре!');
      return true;
    } catch (e) {
      console.error('[MP] Reconnect error:', e);
      localStorage.removeItem('zchess_room');
      return false;
    }
  },

  /* ================================================
     CLEANUP
     ================================================ */

  async leave() {
    this.stopHeartbeat();
    if (this.unsubRoom) { this.unsubRoom(); this.unsubRoom = null; }

    if (this.roomId && this.db && this.status !== 'idle') {
      const key = this.localColor === 'w' ? 'white' : 'black';
      this.db.collection('rooms').doc(this.roomId).update({
        [`${key}.connected`]: false,
        [`${key}.lastPing`]:  this._now()
      }).catch(() => {});
    }

    localStorage.removeItem('zchess_room');
    this.roomId     = null;
    this.status     = 'idle';
    this._lastMoveCount = 0;
    this._gameEnded     = false;
    this._disconnectWarned = false;
  },

  /* ---- UI helpers ---- */
  _showLobbyState(id) {
    document.querySelectorAll('.lobby-state').forEach(el => el.style.display = 'none');
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  },

  showLobby(tab) {
    document.getElementById('room-lobby-overlay')?.classList.add('open');
    this._showLobbyState(tab || 'lobby-choose');
  }
};

window.ZChess.Multiplayer = Multiplayer;
console.log('[ZChess] Multiplayer module loaded');

})();
