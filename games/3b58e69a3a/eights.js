(() => {
'use strict';

const { $, $$, sleep, rand, sound, ABORT, cards, fx, Table3D, profile } = Casino;
const { V, speckle, roundRect } = Table3D;

// Crazy Eights for four: you and three bots, or friends in a bot's seat. Play a card that
// matches the top of the pile by suit or number; eights are wild and pick the next suit.
// First to empty their hand wins the points left in everyone else's.
const HAND_SIZE = 5;
const BOTS = [
  { name: 'Foxy', avatar: '🦊', color: '#ff8a3d' },
  { name: 'Bruno', avatar: '🐻', color: '#c98b5a' },
  { name: 'Mei', avatar: '🐼', color: '#67e8f9' },
  { name: 'Tigra', avatar: '🐯', color: '#f5c84c' },
  { name: 'Ollie', avatar: '🦉', color: '#b07cff' },
  { name: 'Rex', avatar: '🦖', color: '#34d399' },
  { name: 'Coco', avatar: '🐵', color: '#ff7ab6' },
];
const SUIT_ICONS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
const isRed = (s) => s === 1 || s === 2;

const cardCode = (c) => c.s * 15 + c.r;
const cardFrom = (n) => ({ r: n % 15, s: Math.floor(n / 15) });
const points = (c) => (c.r === 8 ? 50 : c.r === 14 ? 1 : c.r > 10 ? 10 : c.r);
const rankName = (r) => cards.rankLabel(r);

// A seeded random number generator, so every browser at the table reshuffles the same way.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Table state ----------
const el = {
  stage: $('#ce-stage'), dock: $('#ce-dock'), status: $('#ce-status'), hand: $('#ce-hand'),
  draw: $('#ce-draw'), pass: $('#ce-pass'), next: $('#ce-next'),
  suits: $('#ce-suits'), suitRow: $('#ce-suit-row'),
};

let players = [];
let stock = [];
let discard = [];
let suit = 0; // the suit to follow: the top card's, or the one an eight named
let dealerSeat = 0;
let rng = Math.random;
let session = 0;
let roundNo = 0;
let roundRunning = false;
let humanTurn = null; // { resolve, drawn } while you're choosing
let usedBots = new Set();

// ---------- Playing with friends ----------
// Like the poker table: the host seats everyone, shuffles and decides for the bots. A round goes
// out as one 'deal' message (seats, dealer, deck and a seed for reshuffles), then every move in
// order as 'act' messages. Guests send their moves to the host, which checks and passes them on.
const TURN_LIMIT = 40000;
const AUTO_DEAL = 6000;
const RESYNC = Symbol('resync');
let room = null;
let mySeat = 0;
let inbox = [];
let inboxWaiter = null;
let remoteQueue = new Map(); // host: a move a friend sent before this table got to their turn
let waitingRemote = null;
let friendColors = new Map();
let autoDealTimer = 0;

const isGuest = () => !!room && !room.isHost;
const myId = () => (room ? room.id : 'me');
const viewSeat = (seat) => (seat - mySeat + 4) % 4;
const alive = (s) => { if (s !== session) throw ABORT; };
const human = () => players.find((p) => p.isHuman);
const nextSeat = (i) => (i + 1) % players.length;
const top = () => discard[discard.length - 1];
const playable = (c) => c.r === 8 || c.s === suit || c.r === top().r;
const canDraw = () => stock.length > 0 || discard.length > 1;
const friendsAtTable = () => players.filter((p) => p.peer && !p.isHuman).length;

// ---------- 3D table ----------
// Seat 0 (you) is nearest the camera; seats go clockwise. Positions are [x, z] on the felt.
const LAYOUTS = {
  wide: {
    table: { a: 8.6, b: 4.6, upright: false },
    seats: [
      { plate: [0, 5.5], cards: [0, 3.0], yaw: 0 },
      { plate: [-9.6, 0], cards: [-6.2, 0], yaw: -Math.PI / 2 },
      { plate: [0, -5.7], cards: [0, -3.1], yaw: Math.PI },
      { plate: [9.6, 0], cards: [6.2, 0], yaw: Math.PI / 2 },
    ],
    stock: [-1.3, 0.2],
    discard: [1.3, 0.2],
    suit: [0, 1.75],
    view: { elevation: 46, target: [0, 0, 0.4], width: 21, depth: 12 },
  },
  tall: {
    table: { a: 7.6, b: 4.6, upright: true },
    seats: [
      { plate: [0, 8.2], cards: [0, 5.3], yaw: 0 },
      { plate: [-3.0, -4.3], cards: [-2.6, -2.0], yaw: -Math.PI / 2 },
      { plate: [0, -9.6], cards: [0, -6.0], yaw: Math.PI },
      { plate: [3.0, -4.3], cards: [2.6, -2.0], yaw: Math.PI / 2 },
    ],
    stock: [-1.0, 1.6],
    discard: [1.0, 1.6],
    suit: [0, 3.3],
    view: { elevation: 72, target: [0, 0, 0.2], width: 10.2, depth: 15.5 },
  },
};

let t3 = null;
let tables = null;
let layoutName = 'wide';
let stockMesh = null;
let suitLabel = null;
let layoutPending = true;
const L = () => LAYOUTS[layoutName];
const at = ([x, z], y = 0) => V(x, y, z);
const spotOf = (seat) => L().seats[viewSeat(seat)];

function stadium(a, b, upright) {
  const pts = [];
  const c = a - b;
  for (let i = 0; i <= 40; i++) {
    const t = -Math.PI / 2 + (i / 40) * Math.PI;
    pts.push([c + b * Math.cos(t), b * Math.sin(t)]);
  }
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI / 2 + (i / 40) * Math.PI;
    pts.push([-c + b * Math.cos(t), b * Math.sin(t)]);
  }
  return upright ? pts.map(([x, z]) => [z, x]) : pts;
}

function buildTables() {
  t3 = Table3D.create(el.stage, { bottomInset: () => el.dock.offsetHeight });
  tables = {};
  for (const [name, lay] of Object.entries(LAYOUTS)) {
    const { a, b, upright } = lay.table;
    tables[name] = t3.addTable({
      outline: stadium(a, b, upright),
      railRadius: 0.48,
      drawFelt(g, map, s, cw, ch) {
        const [gx, gy] = map(0, 0);
        const grd = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(cw, ch) * 0.6);
        grd.addColorStop(0, '#1f7fa0');
        grd.addColorStop(0.55, '#125b78');
        grd.addColorStop(1, '#06283a');
        g.fillStyle = grd;
        g.fillRect(0, 0, cw, ch);
        speckle(g, cw, ch, 50000, 0.05);
        // Outlines for the draw pile and the discard pile, and the house rule between them.
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.lineWidth = 0.025 * s;
        for (const p of [lay.stock, lay.discard]) {
          const [px, py] = map(p[0] - 0.68, p[1] - 0.9);
          roundRect(g, px, py, 1.36 * s, 1.8 * s, 0.12 * s);
          g.stroke();
        }
        const [tx, ty] = map(0, lay.stock[1] - 1.35);
        g.fillStyle = 'rgba(236,196,98,.85)';
        g.font = `700 ${0.34 * s}px Cinzel, Georgia, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('EIGHTS ARE WILD', tx, ty);
      },
    });
  }

  const back = t3.makeCard({ r: 14, s: 0 }).group;
  t3.scene.remove(back);
  stockMesh = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const c = back.clone();
    c.rotation.set(0, (Math.random() - 0.5) * 0.06, Math.PI);
    c.position.y = 0.012 + i * 0.012;
    stockMesh.add(c);
  }
  t3.scene.add(stockMesh);
  suitLabel = t3.label('ce-suit', () => at(L().suit));
  suitLabel.hide();
}

const stockLayers = () => (stock.length ? Math.min(stockMesh.children.length, Math.ceil(stock.length / 5)) : 0);
const stockTop = () => at(L().stock, 0.02 + stockLayers() * 0.012);
const platePoint = (p) => at(spotOf(p.seat).plate, 0.5);
const handPoint = () => t3.screenPoint(el.hand, 6);

function updateStock() {
  const n = stockLayers();
  stockMesh.children.forEach((c, i) => { c.visible = i < n; });
}

// An opponent's hand: a face-down fan in front of their seat.
function fanSlot(p, i, n) {
  const s = spotOf(p.seat);
  const gap = Math.min(0.42, 3.4 / Math.max(1, n - 1));
  const lx = (i - (n - 1) / 2) * gap;
  const yaw = p.revealed ? 0 : s.yaw;
  const [cx, cz] = s.cards;
  return { x: cx + lx * Math.cos(s.yaw), y: 0.012 + i * 0.004, z: cz - lx * Math.sin(s.yaw), yaw };
}

function layoutFan(p, dur = 220) {
  return Promise.all(p.hand.map((c, i) => (c.obj ? t3.moveCard(c, fanSlot(p, i, p.hand.length), dur) : null)));
}

// Cards land on the discard pile a little askew, each keeping its own tilt.
function discardSlot(c, i) {
  if (!c.jit) c.jit = { x: rand(-0.12, 0.12), z: rand(-0.12, 0.12), yaw: rand(-0.35, 0.35) };
  const [dx, dz] = L().discard;
  return { x: dx + c.jit.x, y: 0.012 + Math.min(i, 14) * 0.005, z: dz + c.jit.z, yaw: c.jit.yaw };
}

// Only the last few discards stay on the table; the rest are underneath anyway.
function trimDiscard() {
  for (let i = 0; i < discard.length - 10; i++) if (discard[i].obj) t3.removeCard(discard[i]);
}

function setView(dur = 900) {
  const v = L().view;
  return t3.setView({ fov: 40, elevation: v.elevation, width: v.width, depth: v.depth, target: at(v.target) }, dur);
}

function applyLayout(force = false) {
  const r = el.stage.getBoundingClientRect();
  if (!r.width || !r.height) { layoutPending = true; return; }
  const name = r.width / Math.max(1, r.height - el.dock.offsetHeight) < 0.9 ? 'tall' : 'wide';
  if (name === layoutName && !force && !layoutPending) return;
  layoutPending = false;
  layoutName = name;
  for (const [n, t] of Object.entries(tables)) t.group.visible = n === name;
  stockMesh.position.copy(at(L().stock));
  stockMesh.rotation.y = name === 'tall' ? 0.15 : -0.2;
  for (const p of players) {
    p.hand.forEach((c, i) => { if (c.obj) t3.moveCard(c, fanSlot(p, i, p.hand.length), 0); });
  }
  discard.forEach((c, i) => { if (c.obj) t3.moveCard(c, discardSlot(c, i), 0); });
  setView(0);
}

// ---------- Seats ----------
function pickBot() {
  const free = BOTS.filter((b) => !usedBots.has(b.name));
  const bot = free[Math.floor(Math.random() * free.length)];
  usedBots.add(bot.name);
  return bot;
}

const OPEN_SEAT = { name: 'Open seat', avatar: '·', color: '#5b6b62' };

function makePlayer(seat, who, isHuman = false) {
  return {
    seat, isHuman, name: who.name, avatar: who.avatar, color: who.color,
    peer: who.peer || null, look: who.look || null, hand: [], revealed: false, view: null,
  };
}

const seatInfo = (p) => ({ name: p.name, color: p.color, avatar: p.avatar, peer: p.peer, look: p.isHuman ? Arcade.player.look : p.look });
function botSeat() {
  const b = pickBot();
  return { name: b.name, color: b.color, avatar: b.avatar, peer: null, look: null };
}

function buildSeats() {
  for (const p of players) {
    if (p.view) continue;
    const seat = p.seat;
    const label = t3.label('seat', () => at(spotOf(seat).plate), { clamp: true });
    const s = label.el;
    s.innerHTML = `
      <div class="plate">
        <div class="avatar"></div>
        <div class="seat-info">
          <div class="seat-name"><span class="nm"></span><span class="thinking-dots"><i></i><i></i><i></i></span></div>
          <div class="seat-stack"></div>
        </div>
        <div class="bubble"></div>
        <button class="edit-me" type="button" aria-label="Customize your character" title="Customize your character">✎</button>
      </div>`;
    p.view = { label, seat: s, plate: s.querySelector('.plate'), bubble: s.querySelector('.bubble') };
    s.querySelector('.edit-me').addEventListener('click', () => profile.open());
  }
}

function renderSeat(p) {
  const v = p.view;
  const avatar = v.seat.querySelector('.avatar');
  if (p.isHuman) avatar.innerHTML = profile.avatar();
  else if (p.look) avatar.innerHTML = Arcade.character(p.look);
  else avatar.textContent = p.avatar;
  for (let i = 0; i < 4; i++) v.seat.classList.toggle(`seat-${i}`, i === viewSeat(p.seat));
  v.seat.classList.toggle('me', p.isHuman);
  v.seat.classList.toggle('friend', !!p.peer && !p.isHuman);
  v.seat.style.setProperty('--accent', p.color);
  v.seat.querySelector('.nm').textContent = p.name;
  const n = p.hand.length;
  v.seat.querySelector('.seat-stack').textContent = p.name === OPEN_SEAT.name ? '' : `${n} card${n === 1 ? '' : 's'}`;
}

function bubble(p, text, kind) {
  const b = p.view.bubble;
  b.className = `bubble ${kind}`;
  b.textContent = text;
  void b.offsetWidth;
  b.classList.add('show');
}

function setTurn(p) {
  players.forEach((o) => o.view.seat.classList.toggle('turn', o === p));
}

function thinking(p, on) {
  p.view.seat.classList.toggle('thinking', on);
  if (on) setStatus(`<b>${esc(p.name)}</b> is thinking…`);
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setStatus(html) { el.status.innerHTML = html; }

function showSuit(pop = false) {
  const b = suitLabel.el;
  b.classList.toggle('red', isRed(suit));
  suitLabel.show(`${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]}`);
  if (pop) {
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }
}

// Between rounds the dock's Draw and Pass swap for "Deal again" (just the host, with friends).
function showNext(show) {
  el.next.hidden = !show;
  el.draw.hidden = show;
  el.pass.hidden = show;
}

// ---------- Your hand ----------
// Your cards sit in the dock as clickable cards, sorted by suit then rank. The ones you can play
// lift and glow when it's your turn.
function legalFor(p, c, drawn) {
  return !!humanTurn && playable(c) && (!drawn || c === drawn) && p.hand.includes(c);
}

function renderHand(arrived = null) {
  const me = human();
  const list = me ? [...me.hand].sort((a, b) => (a.s - b.s) || (a.r - b.r)) : [];
  el.hand.innerHTML = '';
  if (!me) {
    el.hand.innerHTML = `<div class="ce-hand-empty">${isGuest() ? 'You\'ll be dealt in next round' : ''}</div>`;
    return;
  }
  const w = parseFloat(getComputedStyle(el.dock).getPropertyValue('--card-w')) || 70;
  const avail = el.hand.clientWidth || 600;
  const n = list.length;
  const step = n > 1 ? Math.min(w + 8, (avail - w) / (n - 1)) : 0;
  const left0 = (avail - (w + step * (n - 1))) / 2;
  list.forEach((c, i) => {
    const e = cards.cardEl(c);
    e.style.left = `${left0 + i * step}px`;
    e.style.zIndex = i;
    if (humanTurn) e.classList.add(legalFor(me, c, humanTurn.drawn) ? 'playable' : 'dim');
    if (c === arrived) e.classList.add('arrive');
    e.addEventListener('click', () => pickCard(c));
    el.hand.append(e);
  });
  updateButtons();
}

function updateButtons() {
  const t = humanTurn;
  el.draw.disabled = !t || !!t.drawn || !canDraw();
  el.pass.disabled = !t || !(t.drawn || !canDraw());
}

function pickCard(c) {
  const me = human();
  if (!me || !humanTurn || !legalFor(me, c, humanTurn.drawn)) return;
  if (c.r !== 8) { respond({ type: 'play', card: cardCode(c), suit: c.s }); return; }
  // An eight: choose the suit everyone has to follow.
  el.suitRow.innerHTML = '';
  SUIT_ICONS.forEach((icon, s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = isRed(s) ? 'red' : '';
    b.innerHTML = `${icon}<small>${SUIT_NAMES[s]}</small>`;
    b.addEventListener('click', () => {
      el.suits.hidden = true;
      respond({ type: 'play', card: cardCode(c), suit: s });
    });
    el.suitRow.append(b);
  });
  el.suits.hidden = false;
}

function askHuman(p, drawn) {
  return new Promise((resolve) => {
    humanTurn = { resolve, drawn };
    renderHand();
    const t = top();
    if (drawn) setStatus(`You drew the <b>${rankName(drawn.r)}${SUIT_ICONS[drawn.s]}</b>. Play it or pass.`);
    else if (t.r === 8) setStatus(`Your turn: play a <b>${SUIT_ICONS[suit]}</b> or an 8${canDraw() ? ', or draw' : ''}`);
    else setStatus(`Your turn: play a <b>${SUIT_ICONS[suit]}</b>, a <b>${rankName(t.r)}</b> or an 8${canDraw() ? ', or draw' : ''}`);
    sound.tone(880, 0.08, { type: 'triangle', vol: 0.06 });
  });
}

function respond(action) {
  if (!humanTurn) return;
  const { resolve } = humanTurn;
  humanTurn = null;
  el.suits.hidden = true;
  setStatus('');
  renderHand();
  resolve(action);
}

// ---------- Bots ----------
// Play to the suit you hold most of, dump high cards first, and keep eights for when nothing
// else fits (or to go out).
function botChoice(p, drawn) {
  const options = drawn ? [drawn].filter(playable) : p.hand.filter(playable);
  if (!options.length) return !drawn && canDraw() ? { type: 'draw' } : { type: 'pass' };
  const count = [0, 0, 0, 0];
  for (const c of p.hand) if (c.r !== 8) count[c.s]++;
  const plain = options.filter((c) => c.r !== 8);
  let card;
  if (plain.length) {
    plain.sort((a, b) => (count[b.s] - count[a.s]) || (points(b) - points(a)));
    card = Math.random() < 0.15 ? plain[Math.floor(Math.random() * plain.length)] : plain[0];
  } else {
    card = options[0];
  }
  const best = count.indexOf(Math.max(...count));
  return { type: 'play', card: cardCode(card), suit: card.r === 8 ? best : card.s };
}

async function askBot(p, s, drawn) {
  thinking(p, true);
  const me = human();
  await sleep(me && me.hand.length ? rand(600, 1200) : rand(350, 650));
  thinking(p, false);
  alive(s);
  return botChoice(p, drawn);
}

// ---------- Moves ----------
// Who decides: you from the dock, a bot from its head, a friend over the network. The host tells
// everyone what was chosen; guests wait to hear it, even for their own move.
async function getAction(p, s, drawn) {
  if (!room) return p.isHuman ? askHuman(p, drawn) : askBot(p, s, drawn);
  if (room.isHost) {
    let action;
    if (p.isHuman) action = await askHuman(p, drawn);
    else if (p.peer && room.player(p.peer)) action = await askRemote(p, drawn);
    else action = await askBot(p, s, drawn);
    alive(s);
    room.broadcast({ t: 'act', n: roundNo, seat: p.seat, a: action });
    return action;
  }
  if (p.isHuman) {
    askHuman(p, drawn).then((a) => { if (a && s === session) room.send({ t: 'act', n: roundNo, seat: p.seat, a }); });
  } else {
    thinking(p, true);
  }
  const msg = await nextMessage(s, 'act');
  thinking(p, false);
  if (humanTurn) respond(null); // the host decided for you (you took too long)
  if (msg.seat !== p.seat) throw RESYNC;
  return msg.a;
}

// A move is only taken if it's allowed right now.
function legalMove(p, a, drawn) {
  if (!a || typeof a !== 'object') return null;
  if (a.type === 'draw') return !drawn && canDraw() ? { type: 'draw' } : null;
  if (a.type === 'pass') return drawn || !canDraw() ? { type: 'pass' } : null;
  if (a.type !== 'play') return null;
  const card = p.hand.find((c) => cardCode(c) === a.card);
  if (!card || !playable(card) || (drawn && card !== drawn)) return null;
  const chosen = Math.round(Number(a.suit));
  return { type: 'play', card: a.card, suit: card.r === 8 && chosen >= 0 && chosen <= 3 ? chosen : card.s };
}

// The host waits for a friend's move, and plays for them like a bot if they take too long.
function askRemote(p, drawn) {
  thinking(p, true);
  return new Promise((resolve) => {
    const finish = (a) => {
      clearTimeout(timer);
      waitingRemote = null;
      thinking(p, false);
      resolve(a);
    };
    const fallback = () => finish(botChoice(p, drawn));
    const timer = setTimeout(fallback, TURN_LIMIT);
    waitingRemote = { p, drawn, finish, fallback };
    const early = remoteQueue.get(p.peer);
    remoteQueue.delete(p.peer);
    if (early) offerMove(early, p.peer);
  });
}

function offerMove(msg, from) {
  const w = waitingRemote;
  if (!w || w.p.peer !== from || msg.seat !== w.p.seat || msg.n !== roundNo) {
    if (msg.n === roundNo) remoteQueue.set(from, msg);
    return;
  }
  const a = legalMove(w.p, msg.a, w.drawn);
  if (a) w.finish(a);
}

// A guest waits for the host's next message of a type. A new deal arriving mid-round means the
// host has moved on, so the guest drops this round and plays the new one.
function nextMessage(s, type) {
  return new Promise((resolve, reject) => {
    const pump = () => {
      if (s !== session) { reject(ABORT); return; }
      if (!inbox.length) { inboxWaiter = pump; return; }
      const msg = inbox[0];
      if (msg.t !== type) {
        if (msg.t === 'deal') { reject(RESYNC); return; }
        inbox.shift(); // a move from a round this browser never saw start
        pump();
        return;
      }
      inbox.shift();
      resolve(msg);
    };
    pump();
  });
}

function wakeInbox() {
  const w = inboxWaiter;
  inboxWaiter = null;
  if (w) w();
}

const cardOf = (p, n) => {
  const c = p.hand.find((x) => cardCode(x) === n);
  if (!c) throw RESYNC;
  return c;
};

// ---------- Cards moving ----------
async function reshuffle(s) {
  const keep = discard.pop();
  const pile = discard;
  discard = [keep];
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  pile.forEach((c) => { c.jit = null; });
  fx.banner('Shuffling…', 'small', 1100);
  sound.shuffle();
  stock = pile;
  await t3.sweep(pile, stockTop);
  alive(s);
  updateStock();
  if (keep.obj) t3.moveCard(keep, discardSlot(keep, 0), 300);
}

async function drawFor(p, s) {
  if (!stock.length) await reshuffle(s);
  const card = stock.pop();
  p.hand.push(card);
  bubble(p, 'Draws', 'call');
  renderSeat(p);
  if (p.isHuman) {
    await t3.dealCard(card, stockTop(), slotAt(handPoint()), { faceUp: false, dur: 320 });
    t3.removeCard(card);
    renderHand(card);
  } else {
    await t3.dealCard(card, stockTop(), fanSlot(p, p.hand.length - 1, p.hand.length), { faceUp: false, dur: 320 });
    layoutFan(p);
  }
  updateStock();
  alive(s);
  return card;
}

const slotAt = (v) => ({ x: v.x, y: v.y, z: v.z, yaw: 0 });

async function playCard(p, card, chosen, s) {
  const from = p.isHuman && card.el && card.el.isConnected ? t3.screenPoint(card.el, 6)
    : card.obj ? card.obj.group.position.clone() : platePoint(p);
  if (card.obj) t3.removeCard(card);
  p.hand.splice(p.hand.indexOf(card), 1);
  discard.push(card);
  suit = card.r === 8 ? chosen : card.s;
  renderSeat(p);
  if (p.isHuman) renderHand();
  else layoutFan(p);
  if (card.r === 8) {
    bubble(p, `Crazy 8 · ${SUIT_ICONS[suit]}`, 'raise');
    sound.tone(520, 0.3, { type: 'triangle', vol: 0.08, slide: 1040 });
  } else {
    bubble(p, `${rankName(card.r)}${SUIT_ICONS[card.s]}`, 'check');
  }
  await t3.dealCard(card, from, discardSlot(card, discard.length - 1), { faceUp: true, dur: 340 });
  alive(s);
  trimDiscard();
  showSuit(card.r === 8);
  if (p.hand.length === 1) bubble(p, 'Last card!', 'allin');
}

// ---------- Round flow ----------
async function deal() {
  clearTimeout(autoDealTimer);
  const s = session;
  try {
    if (isGuest()) await guestRounds(s);
    else await hostRound(s);
  } catch (e) {
    if (e !== ABORT) throw e;
  }
}

// On your own, or the host: seat everyone, shuffle, tell the room, then play the round.
async function hostRound(s) {
  showNext(false);
  const deck = cards.makeDeck(1);
  // The card turned up to start the pile shouldn't be an eight: swap any to the bottom.
  const first = deck.length - 1 - 4 * HAND_SIZE;
  for (let k = 0; deck[first].r === 8; k++) [deck[first], deck[k]] = [deck[k], deck[first]];
  const setup = {
    t: 'deal', n: roundNo + 1, seats: planSeats(), dealer: (dealerSeat + 1) % 4,
    seed: Math.floor(Math.random() * 2 ** 32), deck: deck.map(cardCode),
  };
  if (room) room.broadcast(setup);
  await playRound(s, setup);
  showNext(true);
  if (room && room.players.length > 1) scheduleDeal(AUTO_DEAL); // friends are playing or waiting for a seat
}

async function guestRounds(s) {
  for (;;) {
    const setup = await nextMessage(s, 'deal');
    try {
      await playRound(s, setup);
    } catch (e) {
      if (e !== RESYNC) throw e;
      continue; // the host moved on to a new round; play that one
    } finally {
      roundRunning = false;
    }
    setStatus('Waiting for the host to deal the next round…');
  }
}

function scheduleDeal(ms) {
  clearTimeout(autoDealTimer);
  const s = session;
  autoDealTimer = setTimeout(() => { if (s === session && !el.next.hidden) deal(); }, ms);
}

// Friends in the room take bots' seats; bots stay where nobody wants the seat.
function planSeats() {
  const people = room ? room.players.filter((x) => x.id !== room.id).slice(0, 3) : [];
  const seats = players.map((p) => {
    if (p.isHuman) return seatInfo(p);
    if (p.peer && people.some((x) => x.id === p.peer)) {
      const who = room.player(p.peer);
      return { ...seatInfo(p), name: who.name, look: who.look };
    }
    if (!p.peer && p.name !== OPEN_SEAT.name) return seatInfo(p);
    usedBots.delete(p.name);
    return botSeat();
  });
  for (const who of people) {
    if (seats.some((d) => d.peer === who.id)) continue;
    const i = seats.findIndex((d) => !d.peer);
    if (i < 0) break;
    usedBots.delete(seats[i].name);
    seats[i] = { name: who.name, color: friendColors.get(who.id) || '#4f9bff', avatar: '', peer: who.id, look: who.look };
  }
  return seats;
}

function fromSeat(d, seat) {
  const p = makePlayer(seat, d, d.peer === myId());
  if (p.isHuman) Object.assign(p, { name: profile.name, color: profile.color });
  return p;
}

async function seatPlayers(s, seats, { animate = true } = {}) {
  const mine = seats.findIndex((d) => d.peer === myId());
  const turned = mine >= 0 && mine !== mySeat;
  if (mine >= 0) mySeat = mine;
  if (turned) applyLayout(true);
  for (const [i, d] of seats.entries()) {
    const old = players[i];
    const p = fromSeat(d, i);
    p.view = old.view;
    players[i] = p;
    renderSeat(p);
    if (!animate || (old.name === d.name && old.peer === d.peer)) continue;
    p.view.seat.classList.remove('joining');
    void p.view.seat.offsetWidth;
    p.view.seat.classList.add('joining');
    await sleep(350);
    alive(s);
  }
}

// Sweep the last round's cards back into the deck.
async function clearRound(s) {
  const old = [...discard, ...players.flatMap((p) => p.hand)];
  players.forEach((p) => {
    p.view.bubble.textContent = '';
    p.view.seat.classList.remove('winner', 'turn', 'thinking');
  });
  suitLabel.hide();
  if (old.some((c) => c.obj)) await t3.sweep(old, stockTop);
  alive(s);
}

async function playRound(s, setup) {
  roundRunning = true;
  showNext(false);
  await clearRound(s);
  roundNo = setup.n;
  await seatPlayers(s, setup.seats);
  rng = seeded(setup.seed);
  dealerSeat = setup.dealer;
  stock = setup.deck.map(cardFrom);
  discard = [];
  players.forEach((p) => { p.hand = []; p.revealed = false; renderSeat(p); });
  renderHand();
  updateStock();
  setStatus('Dealing…');

  for (let k = 0; k < HAND_SIZE; k++) {
    for (let j = 1; j <= players.length; j++) {
      const p = players[(dealerSeat + j) % players.length];
      const card = stock.pop();
      p.hand.push(card);
      if (p.isHuman) {
        await t3.dealCard(card, stockTop(), slotAt(handPoint()), { faceUp: false, dur: 170 });
        t3.removeCard(card);
        renderHand(card);
      } else {
        await t3.dealCard(card, stockTop(), fanSlot(p, p.hand.length - 1, HAND_SIZE), { faceUp: false, dur: 170 });
      }
      renderSeat(p);
      updateStock();
      alive(s);
    }
  }
  const starter = stock.pop();
  discard.push(starter);
  suit = starter.s;
  updateStock();
  await t3.dealCard(starter, stockTop(), discardSlot(starter, 0), { faceUp: true, dur: 360 });
  alive(s);
  showSuit();
  setStatus('');

  let turn = nextSeat(dealerSeat);
  let quiet = 0; // turns in a row where nobody played
  let winner = null;
  for (let guard = 0; guard < 3000 && !winner; guard++) {
    const p = players[turn];
    setTurn(p);
    let a;
    // With nothing to play and nothing to draw, there's no choice to make: pass.
    if (!p.hand.some(playable) && !canDraw()) a = { type: 'pass' };
    else a = await getAction(p, s, null);
    alive(s);
    if (a.type === 'draw') {
      const card = await drawFor(p, s);
      if (playable(card)) {
        a = await getAction(p, s, card);
        alive(s);
      } else {
        a = { type: 'pass' };
      }
    }
    if (a.type === 'play') {
      await playCard(p, cardOf(p, a.card), a.suit, s);
      quiet = 0;
      if (!p.hand.length) winner = p;
    } else {
      bubble(p, 'Pass', 'fold');
      quiet++;
      // Nobody can move and the deck is spent: the lowest hand wins.
      if (quiet >= players.length && !canDraw()) break;
    }
    turn = nextSeat(turn);
  }
  setTurn(null);
  await endRound(s, winner);
  roundRunning = false;
}

async function endRound(s, outWinner) {
  const score = (p) => p.hand.reduce((a, c) => a + points(c), 0);
  const winner = outWinner || players.reduce((best, p) => (score(p) < score(best) ? p : best));
  const won = players.filter((p) => p !== winner).reduce((a, p) => a + score(p), 0);
  const wild = !!outWinner && top().r === 8;

  // Everyone shows what they were left holding.
  for (const p of players) {
    if (p.isHuman || !p.hand.length) continue;
    p.revealed = true;
    await Promise.all(p.hand.map(async (c, i) => {
      if (!c.obj) return;
      await t3.moveCard(c, fanSlot(p, i, p.hand.length), 260);
      await t3.flip(c, true);
    }));
    alive(s);
  }
  winner.view.seat.classList.add('winner');
  bubble(winner, `🏆 +${won} pts`, 'win');
  const me = human();
  if (me) Arcade.record('eights.round', { won: winner === me, points: won, wild: wild && winner === me, friends: friendsAtTable() });
  if (winner === me) {
    fx.banner(`You win<small>+${won} points${outWinner ? '' : ' · lowest hand'}</small>`, 'win', 2200);
    sound.win();
    fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.45, wild ? 160 : 80);
    setStatus('You went out first!');
  } else {
    setStatus(`<b>${esc(winner.name)}</b> ${outWinner ? 'went out' : 'had the lowest hand'} and wins ${won} points`);
    if (me) sound.lose();
  }
  await sleep(600);
  alive(s);
}

// ---------- Room messages ----------
function onRoomMessage(msg, from) {
  if (!room || !msg || typeof msg !== 'object') return;
  if (!room.isHost) {
    if (msg.t === 'table') { if (!roundRunning && !inbox.length) showTable(msg); return; }
    if (msg.t === 'deal' || msg.t === 'act') { inbox.push(msg); wakeInbox(); }
    return;
  }
  if (msg.t === 'hi') {
    friendColors.set(from, String(msg.color || '#4f9bff').slice(0, 9));
    room.sendTo(from, { t: 'table', seats: players.map(seatInfo) });
    if (!el.next.hidden) scheduleDeal(1500);
  } else if (msg.t === 'act') {
    offerMove(msg, from);
  }
}

// What a guest sees before their first round: the table as the host has it.
function showTable(msg) {
  seatPlayers(session, msg.seats, { animate: false });
  setStatus('Waiting for the next deal…');
}

function joinRoom(r) {
  room = r;
  inbox = [];
  remoteQueue = new Map();
  waitingRemote = null;
  if (!r) return;
  r.on('message', onRoomMessage);
  r.on('leave', (p) => {
    if (r !== room) return;
    remoteQueue.delete(p.id);
    if (waitingRemote && waitingRemote.p.peer === p.id) waitingRemote.fallback();
  });
}

// ---------- Setup ----------
function setupTable() {
  for (const c of [...discard, ...players.flatMap((p) => p.hand)]) t3.removeCard(c);
  const views = players.map((p) => p.view);
  usedBots = new Set();
  mySeat = 0;
  stock = [];
  discard = [];
  if (isGuest()) {
    players = [0, 1, 2, 3].map((i) => makePlayer(i, OPEN_SEAT));
  } else {
    players = [makePlayer(0, { name: profile.name, color: profile.color, avatar: '', peer: myId() }, true)];
    for (let i = 1; i <= 3; i++) players.push(makePlayer(i, pickBot()));
  }
  players.forEach((p, i) => { p.view = views[i]; });
  dealerSeat = Math.floor(Math.random() * 4);
  buildSeats();
  players.forEach((p) => {
    renderSeat(p);
    p.view.seat.classList.remove('winner', 'turn', 'thinking');
    p.view.bubble.textContent = '';
  });
  suitLabel.hide();
  updateStock();
  showNext(false);
  setStatus(isGuest() ? 'Joining the table…' : '');
  renderHand();
  applyLayout(true);
}

// ---------- Wiring ----------
el.draw.addEventListener('click', () => { if (humanTurn && !el.draw.disabled) respond({ type: 'draw' }); });
el.pass.addEventListener('click', () => { if (humanTurn && !el.pass.disabled) respond({ type: 'pass' }); });
el.next.addEventListener('click', () => deal());
$('#ce-suits-cancel').addEventListener('click', () => { el.suits.hidden = true; });
new ResizeObserver(() => {
  if (!t3 || !t3.active) return;
  applyLayout();
  renderHand();
}).observe(el.stage);
profile.onChange(() => {
  const me = human();
  if (!me || !me.view) return;
  Object.assign(me, { name: profile.name, color: profile.color });
  renderSeat(me);
});

Casino.register('eights', {
  enter() {
    session++;
    if (!t3) buildTables();
    t3.setActive(true);
    joinRoom(Casino.room && Casino.room.game === 'eights' ? Casino.room : null);
    roundNo = 0;
    setupTable();
    if (isGuest()) {
      room.send({ t: 'hi', color: profile.color });
      deal();
    } else {
      const s = session;
      setTimeout(() => { if (s === session) deal(); }, 600);
    }
  },
  leave() {
    session++;
    clearTimeout(autoDealTimer);
    wakeInbox();
    respond(null);
    joinRoom(null);
    roundRunning = false;
    showNext(false);
    if (t3) t3.setActive(false);
    return true;
  },
  key(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (!el.next.hidden && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      deal();
      return;
    }
    if (!humanTurn) return;
    if (k === 'd') el.draw.click();
    else if (k === 'p') el.pass.click();
  },
});
})();
