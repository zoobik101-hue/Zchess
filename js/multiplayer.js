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

  // Move timer
  _moveTimerInterval: null,
  _moveTimeLeft:      0,
  MOVE_TIMEOUT:       120, // seconds per move

  // Disconnect thresholds (ms)
  // Note: page reload takes ~3-5 sec, give enough time to reconnect
  WARN_THRESHOLD:    28_000,  // 28 sec - soft warning in status bar only
  FORFEIT_THRESHOLD: 90_000,  // 90 sec - can claim win (page reload / weak network)
  _oppMissedPings: 0,

  /* ---- Init ---- */
  init() {
    if (ZChess.Auth && ZChess.Auth.db) this.db = ZChess.Auth.db;

    // Mark as disconnected instantly when page/tab closes
    window.addEventListener('beforeunload', () => {
      if (this.status !== 'playing' || !this.roomId || !this.db) return;
      const key = this.localColor === 'w' ? 'white' : 'black';
      // Set lastPing far in the past so opponent detects disconnect immediately
      this.db.collection('rooms').doc(this.roomId).update({
        [`${key}.connected`]: false,
        [`${key}.lastPing`]:  0
      }).catch(() => {});
    });

    // No visibilitychange pause - we keep heartbeat going in background
    // (stopping it would make us look disconnected to opponent)
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
        avatar:    user.avatar || null,
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
      avatar:    user.avatar || null,
      rating:    user.rating   || 1200,
      connected: true,
      lastPing:  this._now()
    };

    await doc.ref.update({ status: 'playing', black: blackData });

    // Use 'waiting' so handleRoomUpdate fires _beginGame on first snapshot
    this._activateRoom(doc.id, 'b', 'waiting');

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
        avatar:    user.avatar || null,
        rating:    user.rating   || 1200,
        connected: true,
        lastPing:  this._now()
      };
      await doc.ref.update({ status: 'playing', black: blackData });
      // Use 'waiting' so handleRoomUpdate fires _beginGame on first snapshot
      this._activateRoom(doc.id, 'b', 'waiting');
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
    // ① HIGHEST PRIORITY: game already has a result in Firestore
    if (room.result && !this._gameEnded) {
      this._gameEnded = true;
      this.stopMoveTimer();
      this._hideDisconnectOverlay();
      this._handleNetworkResult(room.result);
      return;
    }

    // If game already ended on our side - ignore further updates
    if (this._gameEnded) return;

    // ② Opponent joined → start game
    if (room.status === 'playing' && this.status === 'waiting') {
      this.status = 'playing';
      this._beginGame(room);
      return;
    }

    if (this.status !== 'playing') return;

    // ③ Apply any new moves we haven't seen
    if (room.moves.length > this._lastMoveCount) {
      const newMoves = room.moves.slice(this._lastMoveCount);
      this._lastMoveCount = room.moves.length;
      newMoves.forEach(mv => {
        if (mv.playerUid !== this.localUid) {
          ZChess.ChessBoard.applyNetworkMove(mv);
        }
      });
    }

    // ④ Opponent profile + disconnect
    if (room.status === 'playing') {
      const opp = this.localColor === 'w' ? room.black : room.white;
      if (opp) {
        this._checkOpponentPing(opp.lastPing, opp.connected);
        if (ZChess.ChessBoard?.multiplayerMode) {
          ZChess.ChessBoard.multiplayerOpponent = {
            uid: opp.uid || null,
            name: opp.username || ZChess.ChessBoard.multiplayerOpponent?.name,
            rating: opp.rating || 1200,
            avatar: opp.avatar || null
          };
          ZChess.ChessBoard.updatePlayerBars();
        }
      }
    }
  },

  /* ================================================
     GAME START
     ================================================ */

  _beginGame(room) {
    const opp = this.localColor === 'w' ? room.black : room.white;
    if (!opp) {
      console.error('[MP] _beginGame: opponent is null', room);
      return;
    }

    console.log('[MP] _beginGame called, localColor=', this.localColor, 'opp=', opp);

    // Make sure lobby overlay is open to show countdown
    const overlay = document.getElementById('room-lobby-overlay');
    if (overlay) overlay.classList.add('open');

    this._showLobbyState('lobby-ready');
    this._updateReadyInfo(opp);

    const playerColor    = this.localColor;
    const opponentName   = opp.username || 'Соперник';
    const opponentRating = opp.rating   || 1200;
    const opponentAvatar = opp.avatar   || null;
    const opponentUid    = opp.uid      || null;
    let   n = 3;
    const el = document.getElementById('lobby-countdown');

    const tick = () => {
      if (el) el.textContent = n;

      if (n <= 0) {
        // Close lobby, navigate to board, start game
        if (overlay) overlay.classList.remove('open');

        const launch = () => {
          ZChess.ChessBoard.startMultiplayerGame({ playerColor, opponentName, opponentRating, opponentAvatar, opponentUid });
        };

        if (ZChess.App && ZChess.App.navigate) {
          ZChess.App.navigate('play');
          setTimeout(launch, 300);
        } else {
          window.location.hash = 'play';
          setTimeout(launch, 500);
        }
        return;
      }

      n--;
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
    if (myEl)  myEl.textContent  = user.username  || t('common.guest');
    if (oppEl) oppEl.textContent = opp.username   || t('profile.opponent_player');
    if (myR)   myR.textContent   = user.rating    || 1200;
    if (oppR)  oppR.textContent  = opp.rating     || 1200;

    if (ZChess.UserDisplay) {
      ZChess.UserDisplay.renderAvatar(document.getElementById('ready-my-avatar'), ZChess.UserDisplay.fromUser(user));
      ZChess.UserDisplay.renderAvatar(document.getElementById('ready-opp-avatar'), {
        username: opp.username || '?',
        avatar: opp.avatar || null
      });
    }

    const PP = ZChess.PublicProfile;
    if (PP && opp.uid) {
      const opts = { uid: opp.uid, username: opp.username };
      PP.bindClick(document.getElementById('ready-opp-card'), opts);
      PP.bindClick(document.getElementById('ready-opp-avatar'), opts);
      PP.bindClick(document.getElementById('ready-opp-name'), opts);
    }
  },

  async syncPublicProfile() {
    if (!this.roomId || !this.db || !ZChess.Auth?.currentUser) return;

    const user = ZChess.Auth.currentUser;
    const ref = this.db.collection('rooms').doc(this.roomId);

    try {
      const snap = await ref.get();
      if (!snap.exists) return;
      const room = snap.data();
      const patch = {};

      if (room.white?.uid === user.uid) {
        patch['white.username'] = user.username || 'Player';
        patch['white.avatar'] = user.avatar || null;
      }
      if (room.black?.uid === user.uid) {
        patch['black.username'] = user.username || 'Player';
        patch['black.avatar'] = user.avatar || null;
      }

      if (Object.keys(patch).length) await ref.update(patch);
    } catch (e) {
      console.warn('[MP] syncPublicProfile:', e);
    }
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
    this.stopMoveTimer();
    this._hideDisconnectOverlay();
    // Remove from localStorage immediately so a page reload won't reconnect
    localStorage.removeItem('zchess_room');

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
                result.reason === 'timeout'    ? 'Время вышло у соперника' :
                result.reason === 'abandoned'  ? 'Соперник покинул игру' :
                t('board.checkmate');
    } else {
      outcome = 'loss';
      heading = t('board.you_lose');
      reason  = result.reason === 'resign'     ? t('board.resigned_reason') :
                result.reason === 'disconnect' ? 'Соперник отключился' :
                result.reason === 'timeout'    ? 'Время вышло' :
                result.reason === 'abandoned'  ? 'Вы покинули игру' :
                t('board.checkmate');
    }

    ZChess.ChessBoard.gameOver = true;
    this.stopMoveTimer();
    this._hideDisconnectOverlay();

    if (ZChess.Sound) {
      if (iWon)        ZChess.Sound.playWin?.();
      else if (isDraw) ZChess.Sound.playDraw?.();
      else             ZChess.Sound.playLose?.();
    }

    // Small delay so last move animation plays out
    setTimeout(() => {
      const stats = ZChess.ChessBoard._buildGameStats?.() || null;
      ZChess.ChessBoard.showGameResultModal(heading, reason, outcome, 0, 0, stats);
    }, 600);
  },

  /* ================================================
     MOVE TIMER (2 minutes per move)
     ================================================ */

  startMoveTimer(isMyTurn) {
    this.stopMoveTimer();
    this._moveTimeLeft = this.MOVE_TIMEOUT;

    const timerEl  = document.getElementById('mp-move-timer-val');
    const barFill  = document.getElementById('mp-timer-bar-fill');
    const timerBox = document.getElementById('mp-move-timer');
    const statusTxt= document.getElementById('mp-turn-label');

    if (statusTxt) {
      statusTxt.textContent = isMyTurn
        ? `⚡ ${t('board.your_turn')}`
        : `⏳ ${t('board.opponent_turn')}`;
    }
    if (ZChess.ChessBoard?.updateMatchInfoPanel) {
      ZChess.ChessBoard.updateMatchInfoPanel();
    }

    if (timerBox) {
      timerBox.style.opacity = isMyTurn ? '1' : '0.4';
    }

    const update = () => {
      const pct = (this._moveTimeLeft / this.MOVE_TIMEOUT) * 100;
      if (timerEl) {
        const m = Math.floor(this._moveTimeLeft / 60);
        const s = String(this._moveTimeLeft % 60).padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
      }
      if (barFill) {
        barFill.style.width  = pct + '%';
        barFill.style.background =
          pct > 50 ? '#4ade80' :
          pct > 25 ? '#fbbf24' : '#ef4444';
      }
    };

    update();

    this._moveTimerInterval = setInterval(() => {
      this._moveTimeLeft--;
      update();

      if (this._moveTimeLeft <= 0) {
        this.stopMoveTimer();
        if (isMyTurn && !this._gameEnded) {
          // I ran out of time → I lose
          this.reportResult({
            winner: this.localColor === 'w' ? 'b' : 'w',
            reason: 'timeout'
          });
          ZChess.ChessBoard.gameOver = true;
          const stats = ZChess.ChessBoard._buildGameStats?.() || null;
          ZChess.ChessBoard.showGameResultModal(
            typeof t === 'function' ? t('board.you_lose') : 'Поражение',
            'Время истекло',
            'loss', 0, 0, stats
          );
        }
      }
    }, 1000);
  },

  stopMoveTimer() {
    if (this._moveTimerInterval) {
      clearInterval(this._moveTimerInterval);
      this._moveTimerInterval = null;
    }
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
    this.heartbeatTimer = setInterval(ping, 5000);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this._forfeitTimer)  { clearTimeout(this._forfeitTimer);   this._forfeitTimer  = null; }
  },

  _checkOpponentPing(lastPing, connected) {
    if (this._gameEnded) return;

    // lastPing 0 = tab closed or not yet synced; don't treat as instant disconnect
    if (!lastPing || lastPing < 1000) {
      if (connected === false) {
        this._oppMissedPings++;
      } else {
        this._oppMissedPings = 0;
      }
      if (this._oppMissedPings < 3) return;
    }

    const age = lastPing > 1000 ? (this._now() - lastPing) : Infinity;

    if (age > this.FORFEIT_THRESHOLD) {
      if (!this._disconnectWarned) {
        this._disconnectWarned = true;
        this._setOppStatus(t('mp.connection_lost'), 'mp-status-warn');
        this._showDisconnectOverlay(false);
      }
    } else if (age > this.WARN_THRESHOLD) {
      if (!this._disconnectWarned) {
        this._disconnectWarned = true;
        this._setOppStatus(t('mp.connection_unstable'), 'mp-status-warn');
      }
    } else if (age < 12_000) {
      if (this._disconnectWarned) {
        this._disconnectWarned = false;
        this._oppMissedPings = 0;
        this._setOppStatus(t('mp.online'), 'mp-status-ok');
        this._hideDisconnectOverlay();
      }
    }
  },

  _setOppStatus(text, cls) {
    const el = document.getElementById('mp-opp-status');
    if (el) { el.textContent = text; el.className = cls; }
  },

  _showDisconnectOverlay(isWin) {
    // Only show once per game
    if (document.getElementById('mp-disconnect-overlay')) {
      const ov = document.getElementById('mp-disconnect-overlay');
      if (ov) ov.style.display = 'flex';
      return;
    }

    const ov = document.createElement('div');
    ov.id = 'mp-disconnect-overlay';
    ov.className = 'mp-disconnect-overlay';
    document.body.appendChild(ov);

    const winColor = this.localColor;
    if (isWin) {
      ov.innerHTML = `
        <div class="mp-disconnect-card">
          <div class="mp-dc-icon">🔌</div>
          <h3>${t('mp.opponent_left')}</h3>
          <p>${t('mp.win_claimed')}</p>
          <button class="lobby-btn-primary" id="dc-btn-menu">${t('mp.to_menu')}</button>
        </div>`;
    } else {
      ov.innerHTML = `
        <div class="mp-disconnect-card">
          <div class="mp-dc-icon">⏳</div>
          <h3>${t('mp.wait_reconnect_title')}</h3>
          <p>${t('mp.wait_reconnect_desc')}</p>
          <button class="lobby-btn-primary" id="dc-btn-claim">${t('mp.claim_win')}</button>
          <button class="lobby-btn-cancel" id="dc-btn-wait" style="margin-top:8px">${t('mp.keep_waiting')}</button>
          <button class="lobby-btn-cancel" id="dc-btn-close-dc" style="margin-top:8px">${t('common.close')}</button>
        </div>`;
    }
    ov.style.display = 'flex';

    // Wire up buttons after inserting into DOM
    const btnMenu  = document.getElementById('dc-btn-menu');
    const btnClaim = document.getElementById('dc-btn-claim');
    const btnWait  = document.getElementById('dc-btn-wait');
    const btnClose = document.getElementById('dc-btn-close-dc');

    if (btnMenu) btnMenu.addEventListener('click', () => this._closeAndLeave());
    if (btnClose) btnClose.addEventListener('click', () => this._hideDisconnectOverlay());
    if (btnClaim) btnClaim.addEventListener('click', () => {
      this._gameEnded = true;
      this.reportResult({ winner: winColor, reason: 'disconnect' });
      this._showDisconnectOverlay(true);
    });
    if (btnWait) btnWait.addEventListener('click', () => {
      this._disconnectWarned = false;
      this._oppMissedPings = 0;
      this._hideDisconnectOverlay();
      this._setOppStatus(t('mp.online'), 'mp-status-ok');
    });
  },

  _closeAndLeave() {
    this._hideDisconnectOverlay();
    this.stopMoveTimer();
    this.leave();
    const bar = document.getElementById('mp-status-bar');
    if (bar) bar.style.display = 'none';
    if (ZChess.App) ZChess.App.navigate('game');
  },

  _hideDisconnectOverlay() {
    const ov = document.getElementById('mp-disconnect-overlay');
    if (ov) ov.style.display = 'none';
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

      // Never reconnect to a finished game
      if (room.status === 'finished' || room.status === 'abandoned' || room.result) {
        localStorage.removeItem('zchess_room');
        return false;
      }

      if (room.status !== 'playing') { localStorage.removeItem('zchess_room'); return false; }

      // Determine our color
      if      (room.white.uid   === user.uid) this.localColor = 'w';
      else if (room.black?.uid  === user.uid) this.localColor = 'b';
      else { localStorage.removeItem('zchess_room'); return false; }

      this.roomId     = savedId;
      this.localUid   = user.uid;
      this.status     = 'playing';
      this._lastMoveCount = room.moves.length;
      this._gameEnded     = false;

      this.subscribeRoom(savedId);
      this.startHeartbeat();

      const opp = this.localColor === 'w' ? room.black : room.white;
      ZChess.ChessBoard.startMultiplayerGame({
        playerColor:    this.localColor,
        opponentName:   opp?.username || 'Opponent',
        opponentRating: opp?.rating   || 1200,
        opponentAvatar: opp?.avatar   || null,
        opponentUid:    opp?.uid      || null,
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
    this.stopMoveTimer();
    this._hideDisconnectOverlay();
    if (this.unsubRoom) { this.unsubRoom(); this.unsubRoom = null; }

    if (this.roomId && this.db && this.status !== 'idle') {
      const key = this.localColor === 'w' ? 'white' : 'black';
      this.db.collection('rooms').doc(this.roomId).update({
        [`${key}.connected`]: false,
        [`${key}.lastPing`]:  this._now()
      }).catch(() => {});
    }

    localStorage.removeItem('zchess_room');
    this.roomId        = null;
    this.localColor    = null;
    this.localUid      = null;
    this.status        = 'idle';
    this._lastMoveCount    = 0;
    this._gameEnded        = false;
    this._disconnectWarned = false;

    // Hide multiplayer HUD
    const bar = document.getElementById('mp-status-bar');
    if (bar) bar.style.display = 'none';

    // Clean up chess board multiplayer state
    if (ZChess.ChessBoard) {
      ZChess.ChessBoard.multiplayerMode     = false;
      ZChess.ChessBoard.multiplayerOpponent = null;
    }
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
