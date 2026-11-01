// Shared pieces for every casino table: wallet, sound, cards, chips, effects and screen routing.
window.Casino = (() => {
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
// Thrown by a game's async flow when the player has left the table, to stop it mid-animation.
const ABORT = Symbol('abort');
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

// ---------- Wallet ----------
const START_CHIPS = 1000;
const balanceEl = $('#balance');
const balanceAmount = $('#balance-amount');
let shownBalance = 0;
let balanceRaf = 0;

const wallet = {
  balance: Math.max(0, Math.round(Number(store.get('casino.balance', START_CHIPS)) || 0)),
  add(n) {
    this.balance = Math.max(0, Math.round(this.balance + n));
    store.set('casino.balance', this.balance);
    animateBalance(n);
    Arcade.record('casino.chips', { chips: this.balance });
  },
  // Chips sitting on a table (an undealt bet, a poker stack) are remembered so a reload hands them back.
  hold(game, amount) { store.set(`casino.held.${game}`, amount); },
  refill() {
    this.add(START_CHIPS);
    sound.bigWin();
    confetti.rain(140);
  },
};

function animateBalance(delta) {
  const from = shownBalance;
  const to = wallet.balance;
  const t0 = performance.now();
  cancelAnimationFrame(balanceRaf);
  if (delta) {
    balanceEl.classList.remove('up', 'down');
    void balanceEl.offsetWidth;
    balanceEl.classList.add(delta > 0 ? 'up' : 'down');
  }
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / 650);
    shownBalance = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    balanceAmount.textContent = fmt(shownBalance);
    if (p < 1) balanceRaf = requestAnimationFrame(tick);
  };
  balanceRaf = requestAnimationFrame(tick);
}

// ---------- Sound ----------
const sound = {
  ctx: null,
  muted: store.get('casino.muted', false),
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  play(fn) {
    if (this.muted || !this.ensure()) return;
    fn(this.ctx, this.out, this.ctx.currentTime);
  },
  tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = null } = {}) {
    this.play((ctx, out, now) => {
      const t = now + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  },
  noise(dur, { freq = 3000, q = 1, vol = 0.3, delay = 0 } = {}) {
    this.play((ctx, out, now) => {
      const len = Math.ceil(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(out);
      src.start(now + delay);
    });
  },
  card() { this.noise(0.09, { freq: 2400, q: 0.8, vol: 0.55 }); },
  flip() { this.noise(0.05, { freq: 4800, q: 1.4, vol: 0.4 }); },
  chip(delay = 0) {
    this.tone(2900, 0.05, { type: 'triangle', vol: 0.1, delay });
    this.tone(4200, 0.04, { type: 'triangle', vol: 0.07, delay: delay + 0.025 });
  },
  click() { this.tone(660, 0.05, { type: 'square', vol: 0.04 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.24, { type: 'triangle', vol: 0.13, delay: i * 0.09 })); },
  bigWin() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.13, delay: i * 0.08 }));
    this.tone(2093, 0.7, { vol: 0.07, delay: 0.5 });
  },
  lose() {
    this.tone(330, 0.35, { type: 'sawtooth', vol: 0.05, slide: 160 });
    this.tone(247, 0.5, { type: 'sawtooth', vol: 0.05, slide: 110, delay: 0.18 });
  },
  shuffle() { for (let i = 0; i < 12; i++) this.noise(0.05, { freq: 3000, q: 0.7, vol: 0.3, delay: i * 0.045 }); },
  setMuted(m) {
    this.muted = m;
    store.set('casino.muted', m);
    $('#mute-btn').textContent = m ? '🔇' : '🔊';
  },
};
document.addEventListener('pointerdown', () => { if (!sound.muted) sound.ensure(); }, { once: true });

// ---------- Cards ----------
const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎'];
const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r) => RANK_LABELS[r] || String(r);
// Pip positions as % of the card, laid out on a 3-column grid inside the corner indexes.
const L = 35;
const C = 50;
const R = 65;
const PIPS = {
  2: [[C, 22], [C, 78, 1]],
  3: [[C, 22], [C, 50], [C, 78, 1]],
  4: [[L, 22], [R, 22], [L, 78, 1], [R, 78, 1]],
  5: [[L, 22], [R, 22], [C, 50], [L, 78, 1], [R, 78, 1]],
  6: [[L, 22], [R, 22], [L, 50], [R, 50], [L, 78, 1], [R, 78, 1]],
  7: [[L, 22], [R, 22], [C, 36], [L, 50], [R, 50], [L, 78, 1], [R, 78, 1]],
  8: [[L, 22], [R, 22], [C, 36], [L, 50], [R, 50], [C, 64, 1], [L, 78, 1], [R, 78, 1]],
  9: [[L, 22], [R, 22], [L, 41], [R, 41], [C, 50], [L, 59, 1], [R, 59, 1], [L, 78, 1], [R, 78, 1]],
  10: [[L, 22], [R, 22], [C, 32], [L, 41], [R, 41], [L, 59, 1], [R, 59, 1], [C, 68, 1], [L, 78, 1], [R, 78, 1]],
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeck(decks = 1) {
  const out = [];
  for (let d = 0; d < decks; d++) {
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) out.push({ r, s });
  }
  return shuffle(out);
}

function cardEl(card, faceUp = true) {
  const el = document.createElement('div');
  el.className = `card${card.s === 1 || card.s === 2 ? ' red' : ''}${faceUp ? '' : ' face-down'}`;
  const rank = rankLabel(card.r);
  const suit = SUITS[card.s];
  let center;
  if (card.r === 14) center = `<div class="ace">${suit}</div>`;
  else if (card.r > 10) center = `<div class="court"><b>${rank}</b><i class="c1">${suit}</i><i class="c2">${suit}</i></div>`;
  else center = PIPS[card.r].map(([x, y, f]) => `<span class="pip${f ? ' flip' : ''}" style="left:${x}%;top:${y}%">${suit}</span>`).join('');
  el.innerHTML = `<div class="card-inner"><div class="card-face card-front"><div class="corner tl"><b>${rank}</b><i>${suit}</i></div>${center}<div class="corner br"><b>${rank}</b><i>${suit}</i></div></div><div class="card-face card-back"></div></div>`;
  card.el = el;
  return el;
}

const centerOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

// ---------- Chips ----------
function chipEl(value) {
  const el = document.createElement('div');
  el.className = `chip chip-${value}`;
  el.innerHTML = `<span>${value >= 1000 ? `${value / 1000}K` : value}</span>`;
  return el;
}

const fxLayer = $('#fx');

// ---------- Effects ----------
const bannerEl = $('#banner');
function banner(html, kind = '', ms = 1800) {
  bannerEl.innerHTML = html;
  bannerEl.className = 'banner';
  void bannerEl.offsetWidth;
  bannerEl.className = `banner show ${kind}`;
  bannerEl.style.animationDuration = kind.includes('win') || kind.includes('gold') ? `${ms}ms, 1.4s` : `${ms}ms`;
}

function floatText(el, text, kind = 'win') {
  const c = centerOf(el);
  const t = document.createElement('div');
  t.className = `float-text ${kind}`;
  t.textContent = text;
  t.style.left = `${c.x}px`;
  t.style.top = `${c.y}px`;
  fxLayer.append(t);
  setTimeout(() => t.remove(), 1500);
}

const confetti = (() => {
  const cv = $('#confetti');
  const g = cv.getContext('2d');
  const colors = ['#f5c84c', '#ffe9a8', '#e0414b', '#4ade80', '#60a5fa', '#ffffff', '#c084fc'];
  let parts = [];
  let raf = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = window.innerWidth * dpr;
    cv.height = window.innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function add(p) {
    parts.push({
      w: rand(6, 11), h: rand(8, 15), rot: rand(0, 6), vr: rand(-0.25, 0.25),
      color: colors[(Math.random() * colors.length) | 0], life: rand(110, 170), ...p,
    });
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick() {
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.25;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.globalAlpha = Math.min(1, p.life / 30);
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.rot * 2)), p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
      g.restore();
    }
    parts = parts.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) g.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();
  return {
    burst(x = window.innerWidth / 2, y = window.innerHeight * 0.45, n = 120) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(3, 12);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6 });
      }
      start();
    },
    rain(n = 160) {
      for (let i = 0; i < n; i++) add({ x: rand(0, window.innerWidth), y: rand(-200, -10), vx: rand(-1, 1), vy: rand(1, 4), life: 220 });
      start();
    },
  };
})();

// ---------- Screens ----------
const games = {};
let current = null;

let leaveConfirmed = false;
let leaveTarget = 'lobby';

function register(name, game) { games[name] = game; }
function go(name) { location.hash = name === 'lobby' ? '' : name; }

// A game's leave(force) returns a warning when leaving now would cost the player chips.
// Browser confirm() dialogs are blocked in some viewers, so the warning is an in-page modal.
function route() {
  const name = location.hash.replace('#', '');
  const target = games[name] ? name : 'lobby';
  if (target === current) return;
  if (current && current !== 'lobby') {
    const force = leaveConfirmed;
    leaveConfirmed = false;
    const warning = games[current].leave(force);
    if (typeof warning === 'string') {
      history.replaceState(null, '', `#${current}`);
      leaveTarget = target;
      $('#leave-text').textContent = warning;
      $('#leave-modal').hidden = false;
      $('#leave-stay').focus();
      return;
    }
  }
  current = target;
  if (room && target !== room.game) friends.leave(); // leaving the table leaves the room
  $$('.screen').forEach((s) => { s.hidden = s.id !== target; });
  const back = $('#back');
  if (target === 'lobby') {
    back.textContent = '← Arcade';
    back.href = '../../index.html';
    renderLobby();
  } else {
    back.textContent = '← Lobby';
    back.href = '#';
    games[target].enter();
  }
}

$('#leave-stay').addEventListener('click', () => { $('#leave-modal').hidden = true; });
$('#leave-go').addEventListener('click', () => {
  $('#leave-modal').hidden = true;
  leaveConfirmed = true;
  go(leaveTarget);
});

$('#back').addEventListener('click', (e) => {
  if (current !== 'lobby') {
    e.preventDefault();
    go('lobby');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input') && e.key !== 'Enter') return;
  const game = games[current];
  if (game && game.key) game.key(e);
});

// ---------- Playing with friends ----------
// The lobby's friends box opens or joins a room for one table and takes you there.
let friends = null;
let room = null;

function setRoom(r) {
  room = r;
  $('#room-chip').hidden = !r;
  if (r) {
    $('#room-code').textContent = r.code;
    go(r.game);
  } else if (current !== 'lobby') {
    // The host left: back to the lobby, where the friends box says why.
    leaveConfirmed = true;
    go('lobby');
  }
}

function renderLobby() {
  $('#refill').hidden = wallet.balance >= 100;
}

function buildLobby() {
  const bg = $('#lobby-bg');
  const suits = ['♠', '♥', '♦', '♣'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    const suit = suits[i % 4];
    s.textContent = suit;
    if (suit === '♥' || suit === '♦') s.className = 'red';
    s.style.left = `${rand(0, 100)}%`;
    s.style.fontSize = `${rand(28, 80)}px`;
    s.style.animationDuration = `${rand(16, 34)}s`;
    s.style.animationDelay = `${-rand(0, 34)}s`;
    bg.append(s);
  }
  const fan = (host, list) => list.forEach(([r, s, rot, x]) => {
    const el = cardEl({ r, s });
    el.style.setProperty('--r', `${rot}deg`);
    el.style.setProperty('--x', `${x}px`);
    host.append(el);
  });
  fan($('#art-blackjack'), [[14, 0, -12, -26], [13, 1, 10, 26]]);
  fan($('#art-poker'), [[10, 2, -24, -64], [11, 2, -12, -32], [12, 2, 0, 0], [13, 2, 12, 32], [14, 2, 24, 64]]);
  const chip = (host, v, left, top) => {
    const c = chipEl(v);
    c.style.left = left;
    c.style.top = top;
    host.append(c);
  };
  chip($('#art-blackjack'), 100, '14%', '58%');
  chip($('#art-blackjack'), 25, '76%', '22%');
  chip($('#art-poker'), 500, '8%', '18%');
  chip($('#art-poker'), 1000, '84%', '62%');
  $('#refill-btn').addEventListener('click', () => { wallet.refill(); renderLobby(); });
  friends = ArcadeNet.panel({
    hosts: [{ game: 'poker', label: 'Host Hold\'em' }, { game: 'blackjack', label: 'Host Blackjack' }],
    games: ['poker', 'blackjack'],
    max: 4,
    blurb: 'Up to 4 players at one table',
    onRoom: setRoom,
  });
  $('#friends').append(friends.el);
}

function start() {
  for (const game of ['blackjack', 'poker']) {
    const held = Number(store.get(`casino.held.${game}`, 0)) || 0;
    if (held > 0) wallet.balance += held;
    wallet.hold(game, 0);
  }
  store.set('casino.balance', wallet.balance);
  shownBalance = wallet.balance;
  balanceAmount.textContent = fmt(wallet.balance);
  sound.setMuted(sound.muted);
  $('#mute-btn').addEventListener('click', () => sound.setMuted(!sound.muted));
  buildLobby();
  window.addEventListener('hashchange', route);
  route();
}

return {
  $, $$, sleep, rand, fmt, store, wallet, sound, ABORT, register, go, start,
  get room() { return room; },
  cards: { makeDeck, shuffle, cardEl, rankLabel, SUITS, PIPS },
  chips: { chipEl },
  fx: { banner, floatText, confetti },
};
})();
