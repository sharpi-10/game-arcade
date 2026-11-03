// Multiplayer rooms for every game, peer to peer. One player hosts in their browser and gets a
// four-letter code; friends type it in to join. Browsers find each other through PeerJS's free
// public server, then talk directly over WebRTC, so the arcade still needs no server of its own.
//
// The host is the hub: clients only talk to the host, and the host passes on what others need.
// Each game decides what its messages mean; this file only keeps the room and its player list.
(() => {
'use strict';

const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'arcade-k7q2-room-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, so codes read cleanly aloud
const CODE_LEN = 4;
const HEARTBEAT = 2000;
const TIMEOUT = 10000;
const CONNECT_TIMEOUT = 12000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newCode = () => Array.from({ length: CODE_LEN }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join('');
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
const me = () => ({ name: Arcade.player.name, look: Arcade.player.look });

let peerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS;
      s.onload = resolve;
      s.onerror = () => { peerLib = null; reject(new Error('Couldn\'t load the multiplayer library. Check your connection.')); };
      document.head.append(s);
    });
  }
  return peerLib;
}

function friendlyError(err) {
  const type = err && err.type;
  if (type === 'peer-unavailable') return 'No room with that code. Check it and try again.';
  if (type === 'browser-incompatible') return 'This browser can\'t play online.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return 'Couldn\'t reach the matchmaking server. Check your connection.';
  return (err && err.message) || 'Something went wrong with the connection.';
}

// ---------- Room ----------
class Room {
  constructor(peer, { code, game, isHost, max }) {
    this.peer = peer;
    this.code = code;
    this.game = game;
    this.isHost = isHost;
    this.max = max;
    this.id = peer.id;
    this.players = [];
    this.conns = new Map(); // host: client id -> connection; client: host id -> connection
    this.handlers = {};
    this.closed = false;
    this.beat = setInterval(() => this.heartbeat(), HEARTBEAT);
  }

  on(type, fn) {
    (this.handlers[type] || (this.handlers[type] = new Set())).add(fn);
    return () => this.handlers[type].delete(fn);
  }

  emit(type, ...args) {
    for (const fn of [...(this.handlers[type] || [])]) {
      try { fn(...args); } catch (e) { console.error(e); }
    }
  }

  get me() { return this.players.find((p) => p.id === this.id); }
  get hostId() { return (this.players.find((p) => p.host) || {}).id; }
  player(id) { return this.players.find((p) => p.id === id); }

  // Client to host. On the host this is delivered to its own handlers, so game code can treat
  // the host's inputs exactly like everyone else's.
  send(msg) {
    if (this.closed) return;
    if (this.isHost) { queueMicrotask(() => this.emit('message', msg, this.id)); return; }
    this.write(this.conns.values().next().value, msg);
  }

  // Host to every client, optionally skipping one (usually whoever sent it).
  broadcast(msg, { except = null } = {}) {
    if (!this.isHost || this.closed) return;
    for (const [id, conn] of this.conns) if (id !== except) this.write(conn, msg);
  }

  sendTo(id, msg) {
    if (id === this.id) { this.send(msg); return; }
    this.write(this.conns.get(id), msg);
  }

  write(conn, msg) {
    if (!conn || !conn.open) return;
    try { conn.send(msg); } catch (e) { /* the connection is going away */ }
  }

  // Tell the room about a new name or look.
  updateMe() {
    if (this.closed) return;
    if (this.isHost) {
      Object.assign(this.me, me());
      this.sharePlayers();
    } else {
      this.send({ t: '$me', ...me() });
    }
  }

  sharePlayers() {
    this.broadcast({ t: '$players', players: this.players });
    this.emit('players', this.players);
  }

  heartbeat() {
    const now = Date.now();
    for (const [id, conn] of this.conns) {
      this.write(conn, { t: '$hb' });
      if (now - (conn.heard || now) > TIMEOUT) this.drop(id, 'timeout');
    }
  }

  // ----- Host side -----
  accept(conn) {
    conn.heard = Date.now();
    conn.on('data', (msg) => {
      conn.heard = Date.now();
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === '$hello') {
        if (this.players.length >= this.max) {
          this.write(conn, { t: '$full' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        this.conns.set(conn.peer, conn);
        const p = { id: conn.peer, name: String(msg.name || 'Player').slice(0, 14), look: msg.look || {}, host: false };
        this.players.push(p);
        this.write(conn, { t: '$welcome', game: this.game, code: this.code, players: this.players });
        this.broadcast({ t: '$players', players: this.players }, { except: conn.peer });
        this.emit('players', this.players);
        this.emit('join', p);
        return;
      }
      if (!this.conns.has(conn.peer)) return;
      if (msg.t === '$hb') return;
      if (msg.t === '$me') {
        const p = this.player(conn.peer);
        if (p) { p.name = String(msg.name || p.name).slice(0, 14); p.look = msg.look || p.look; this.sharePlayers(); }
        return;
      }
      if (msg.t === '$bye') { this.drop(conn.peer, 'left'); return; }
      this.emit('message', msg, conn.peer);
    });
    conn.on('close', () => this.drop(conn.peer, 'left'));
    conn.on('error', () => this.drop(conn.peer, 'error'));
  }

  drop(id, why) {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.conns.delete(id);
    try { conn.close(); } catch { /* already closed */ }
    if (!this.isHost) { this.close(why === 'timeout' ? 'Lost touch with the host.' : 'The host closed the room.'); return; }
    const p = this.player(id);
    this.players = this.players.filter((x) => x.id !== id);
    this.sharePlayers();
    if (p) this.emit('leave', p);
  }

  // ----- Both -----
  leave() {
    if (this.closed) return;
    for (const conn of this.conns.values()) this.write(conn, { t: '$bye' });
    this.close(null);
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    const conns = [...this.conns.values()];
    this.conns.clear();
    // Give the goodbye a moment to go out before tearing the connections down.
    setTimeout(() => {
      for (const c of conns) { try { c.close(); } catch { /* already closed */ } }
      try { this.peer.destroy(); } catch { /* already gone */ }
    }, 150);
    if (current === this) current = null;
    this.emit('close', reason);
  }
}

let current = null;

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('Couldn\'t reach the matchmaking server. Check your connection.')); }, CONNECT_TIMEOUT);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', (err) => { clearTimeout(timer); peer.destroy(); reject(err); });
  });
}

async function host(game, { max = 4 } = {}) {
  if (current) current.leave();
  await loadPeerJS();
  let peer = null;
  let code = '';
  for (let tries = 0; !peer; tries++) {
    code = newCode();
    try {
      peer = await openPeer(PREFIX + code);
    } catch (err) {
      if (err.type !== 'unavailable-id' || tries >= 4) throw new Error(friendlyError(err));
    }
  }
  const room = new Room(peer, { code, game, isHost: true, max });
  room.players.push({ id: peer.id, ...me(), host: true });
  peer.on('connection', (conn) => {
    if (room.closed) { conn.close(); return; }
    conn.on('open', () => room.accept(conn));
  });
  // Losing the matchmaking server only stops new players joining; reconnect quietly.
  peer.on('disconnected', () => { if (!room.closed) { try { peer.reconnect(); } catch { /* try again later */ } } });
  peer.on('error', (err) => { if (err.type === 'peer-unavailable') return; console.warn('Room error', err); });
  current = room;
  return room;
}

async function join(rawCode, { games = null } = {}) {
  const code = cleanCode(rawCode);
  if (code.length !== CODE_LEN) throw new Error(`Room codes are ${CODE_LEN} letters.`);
  if (current) current.leave();
  await loadPeerJS();
  let peer;
  try { peer = await openPeer(null); } catch (err) { throw new Error(friendlyError(err)); }
  return new Promise((resolve, reject) => {
    let room = null;
    const fail = (msg) => {
      clearTimeout(timer);
      if (room) room.close(null);
      else peer.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('The room didn\'t answer. Check the code and try again.'), CONNECT_TIMEOUT);
    peer.on('error', (err) => { if (!room || !room.players.length) fail(friendlyError(err)); });
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      conn.heard = Date.now();
      conn.send({ t: '$hello', ...me() });
    });
    conn.on('data', (msg) => {
      conn.heard = Date.now();
      if (!msg || typeof msg !== 'object' || msg.t === '$hb') return;
      if (msg.t === '$full') { fail('That room is full.'); return; }
      if (msg.t === '$welcome') {
        if (games && !games.includes(msg.game)) { conn.send({ t: '$bye' }); fail('That room is for a different game.'); return; }
        clearTimeout(timer);
        room = new Room(peer, { code, game: msg.game, isHost: false, max: 0 });
        room.players = msg.players;
        room.conns.set(conn.peer, conn);
        conn.on('close', () => room.drop(conn.peer, 'closed'));
        current = room;
        resolve(room);
        return;
      }
      if (!room) return;
      if (msg.t === '$players') { room.players = msg.players; room.emit('players', room.players); return; }
      room.emit('message', msg, conn.peer);
    });
  });
}

window.addEventListener('pagehide', () => { if (current) current.leave(); });

// ---------- Panel ----------
// A ready-made "Play with friends" box: host or join, then the code and who's in the room.
// opts: { hosts: [{ game, label }], games: [ids this page can join], max, onRoom(room | null), blurb }
const CSS = `
.anet { display: grid; gap: 12px; text-align: left; }
.anet-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.anet-head b { font-size: 15px; }
.anet-head span { font-size: 13px; opacity: .7; }
.anet-row { display: flex; gap: 8px; flex-wrap: wrap; }
.anet-btn {
  flex: 1 1 auto; min-height: 42px; padding: 0 16px; border-radius: 12px; cursor: pointer;
  font: 600 15px Rubik, system-ui, sans-serif; color: #fff;
  background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .18);
  transition: background .15s;
}
.anet-btn:hover:not(:disabled) { background: rgba(255, 255, 255, .16); }
.anet-btn:disabled { opacity: .5; cursor: default; }
.anet-btn.go { background: var(--anet-accent, #ffcc33); color: var(--anet-ink, #2a1c00); border-color: transparent; }
.anet-btn.go:hover:not(:disabled) { filter: brightness(1.08); background: var(--anet-accent, #ffcc33); }
.anet-join { display: flex; gap: 8px; }
.anet-join input {
  flex: 1; min-width: 0; height: 42px; padding: 0 14px; border-radius: 12px;
  font: 700 18px Rubik, system-ui, sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #fff;
  background: rgba(0, 0, 0, .3); border: 1px solid rgba(255, 255, 255, .2); outline: none;
  user-select: text; -webkit-user-select: text; touch-action: manipulation;
}
.anet-join input::placeholder { letter-spacing: .04em; font-weight: 500; font-size: 15px; text-transform: none; color: rgba(255, 255, 255, .45); }
.anet-join input:focus { border-color: var(--anet-accent, #ffcc33); }
.anet-join .anet-btn { flex: none; }
.anet-msg { margin: 0; font-size: 14px; opacity: .8; }
.anet-err { margin: 0; font-size: 14px; color: #ff8a8a; }
.anet-err:empty { display: none; }
.anet-code {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
  background: rgba(0, 0, 0, .28); border: 1px dashed rgba(255, 255, 255, .25);
}
.anet-code small { display: block; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .65; }
.anet-code b { display: block; font: 800 30px Rubik, system-ui, sans-serif; letter-spacing: .22em; color: var(--anet-accent, #ffcc33); }
.anet-code > div { flex: 1; }
.anet-code .anet-btn { flex: none; min-height: 36px; font-size: 14px; }
.anet-players { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.anet-players li { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; min-width: 0; }
.anet-players .av { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex: none; }
.anet-players .av svg { width: 100%; height: 100%; display: block; }
.anet-players .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anet-players em { font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: rgba(255, 255, 255, .12); flex: none; }
.anet-players em.host { background: var(--anet-accent, #ffcc33); color: var(--anet-ink, #2a1c00); }
.anet-wait { font-size: 13px; opacity: .65; }
`;

function injectStyles() {
  if (document.getElementById('anet-styles')) return;
  const style = document.createElement('style');
  style.id = 'anet-styles';
  style.textContent = CSS;
  document.head.append(style);
}

function panel(opts) {
  injectStyles();
  const { hosts = [], games = hosts.map((h) => h.game), max = 4, onRoom = () => {}, blurb = '' } = opts;
  const el = document.createElement('div');
  el.className = 'anet';
  let room = null;
  let busy = '';
  let error = '';
  let offRoom = [];

  function render() {
    if (room) {
      const list = room.players.map((p) => `
        <li><span class="av">${Arcade.character(p.look, { crop: 'head' })}</span><span class="nm">${esc(p.name)}</span>
        ${p.host ? '<em class="host">Host</em>' : ''}${p.id === room.id ? '<em>You</em>' : ''}</li>`).join('');
      const free = Math.max(0, room.max - room.players.length);
      el.innerHTML = `
        <div class="anet-head"><b>Playing with friends</b><span>${room.isHost ? 'Share the code to let friends in' : 'You joined a room'}</span></div>
        <div class="anet-code"><div><small>Room code</small><b>${room.code}</b></div><button class="anet-btn" data-copy type="button">Copy</button></div>
        <ul class="anet-players">${list}</ul>
        ${room.isHost && free ? `<div class="anet-wait">Room for ${free} more</div>` : ''}
        <div class="anet-row"><button class="anet-btn" data-leave type="button">Leave room</button></div>`;
      el.querySelector('[data-copy]').onclick = (e) => {
        const b = e.currentTarget;
        const done = () => { b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(room.code).then(done, () => {});
      };
      el.querySelector('[data-leave]').onclick = () => leave();
      return;
    }
    el.innerHTML = `
      <div class="anet-head"><b>Play with friends</b><span>${esc(blurb || `Up to ${max} players`)}</span></div>
      ${busy ? `<p class="anet-msg">${esc(busy)}</p>` : `
      <div class="anet-row">${hosts.map((h) => `<button class="anet-btn go" data-host="${h.game}" type="button">${esc(h.label)}</button>`).join('')}</div>
      <form class="anet-join"><input name="code" maxlength="${CODE_LEN}" placeholder="Friend's room code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code"><button class="anet-btn" type="submit">Join</button></form>`}
      <p class="anet-err" role="alert">${esc(error)}</p>`;
    el.querySelectorAll('[data-host]').forEach((b) => { b.onclick = () => start(() => host(b.dataset.host, { max }), 'Opening a room…'); });
    const form = el.querySelector('form');
    if (form) {
      const input = form.elements.code;
      input.addEventListener('input', () => { input.value = cleanCode(input.value); });
      input.addEventListener('keydown', (e) => e.stopPropagation()); // keep game shortcuts out of the box
      form.onsubmit = (e) => {
        e.preventDefault();
        start(() => join(input.value, { games }), 'Joining…');
      };
    }
  }

  async function start(fn, msg) {
    busy = msg;
    error = '';
    render();
    try {
      setRoom(await fn());
    } catch (e) {
      error = e.message || String(e);
    }
    busy = '';
    render();
  }

  function setRoom(r) {
    offRoom.forEach((off) => off());
    offRoom = [];
    room = r;
    if (r) {
      offRoom.push(r.on('players', render));
      offRoom.push(r.on('close', (reason) => {
        if (room !== r) return;
        error = reason || '';
        setRoom(null);
      }));
    }
    render();
    onRoom(r);
  }

  function leave() {
    const r = room;
    setRoom(null);
    if (r) r.leave();
  }

  const offLook = Arcade.onChange(() => { if (room) room.updateMe(); });
  render();
  return {
    el,
    get room() { return room; },
    leave,
    // Show a message in the box, for example why the game ended a room.
    error(msg) { error = msg || ''; render(); },
    destroy() { offLook(); leave(); el.remove(); },
  };
}

window.ArcadeNet = { host, join, panel, get room() { return current; } };
})();
