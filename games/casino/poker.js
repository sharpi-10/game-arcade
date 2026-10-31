(() => {
'use strict';

const { $, $$, sleep, rand, fmt, wallet, sound, ABORT, cards, fx, Table3D, profile } = Casino;
const { V, speckle, roundRect } = Table3D;

const SB = 10;
const BB = 20;
const BOT_STACK = 1000;
const BUY_INS = [500, 1000, 2000];
const BOTS = [
  { name: 'Foxy', avatar: '🦊', color: '#ff8a3d', aggr: 0.6, loose: 0.55, bluff: 0.12 },
  { name: 'Bruno', avatar: '🐻', color: '#c98b5a', aggr: 0.3, loose: 0.3, bluff: 0.04 },
  { name: 'Mei', avatar: '🐼', color: '#67e8f9', aggr: 0.45, loose: 0.65, bluff: 0.1 },
  { name: 'Tigra', avatar: '🐯', color: '#f5c84c', aggr: 0.85, loose: 0.6, bluff: 0.2 },
  { name: 'Ollie', avatar: '🦉', color: '#b07cff', aggr: 0.4, loose: 0.35, bluff: 0.07 },
  { name: 'Rex', avatar: '🦖', color: '#34d399', aggr: 0.75, loose: 0.75, bluff: 0.16 },
  { name: 'Coco', avatar: '🐵', color: '#ff7ab6', aggr: 0.55, loose: 0.8, bluff: 0.14 },
];

// ---------- Hand evaluation ----------
// Scores are plain numbers: a bigger score is a better hand. Works for 5 to 7 cards.
const BASE = 15;
const CATEGORY_SIZE = BASE ** 5;
function encode(cat, ranks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * BASE + (ranks[i] || 0);
  return s;
}

function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let h = 14; h >= 5; h--) {
    const need = 0b11111 << (h - 4);
    if ((mask & need) === need) return h;
  }
  return 0;
}

function evaluate(list) {
  const counts = new Array(15).fill(0);
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of list) {
    counts[c.r]++;
    suitCount[c.s]++;
    mask |= 1 << c.r;
  }
  const flushSuit = suitCount.findIndex((n) => n >= 5);
  let flushRanks = null;
  if (flushSuit >= 0) {
    flushRanks = list.filter((c) => c.s === flushSuit).map((c) => c.r).sort((a, b) => b - a);
    const sf = straightHigh(flushRanks.reduce((m, r) => m | (1 << r), 0));
    if (sf) return encode(8, [sf]);
  }
  let quad = 0;
  const trips = [];
  const pairs = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }
  const kickers = (exclude, n) => {
    const out = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (counts[r] && !exclude.includes(r)) out.push(r);
    return out;
  };
  if (quad) return encode(7, [quad, ...kickers([quad], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) return encode(6, [trips[0], Math.max(trips[1] || 0, pairs[0] || 0)]);
  if (flushRanks) return encode(5, flushRanks.slice(0, 5));
  const st = straightHigh(mask);
  if (st) return encode(4, [st]);
  if (trips.length) return encode(3, [trips[0], ...kickers([trips[0]], 2)]);
  if (pairs.length >= 2) return encode(2, [pairs[0], pairs[1], ...kickers([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return encode(1, [pairs[0], ...kickers([pairs[0]], 3)]);
  return encode(0, kickers([], 5));
}

const NAMES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const plural = (r) => (r === 6 ? 'Sixes' : `${NAMES[r]}s`);

function describe(score) {
  const ranks = [];
  let s = score;
  for (let i = 0; i < 5; i++) { ranks.unshift(s % BASE); s = Math.floor(s / BASE); }
  const [a, b] = ranks;
  switch (s) {
    case 8: return a === 14 ? 'Royal Flush' : `Straight Flush, ${NAMES[a]} high`;
    case 7: return `Four of a Kind, ${plural(a)}`;
    case 6: return `Full House, ${plural(a)} over ${plural(b)}`;
    case 5: return `Flush, ${NAMES[a]} high`;
    case 4: return `Straight, ${NAMES[a]} high`;
    case 3: return `Three of a Kind, ${plural(a)}`;
    case 2: return `Two Pair, ${plural(a)} & ${plural(b)}`;
    case 1: return `Pair of ${plural(a)}`;
    default: return `${NAMES[a]} high`;
  }
}

function describeHole([x, y]) {
  if (x.r === y.r) return `Pocket ${plural(x.r)}`;
  const [hi, lo] = x.r > y.r ? [x, y] : [y, x];
  return `${cards.rankLabel(hi.r)}-${cards.rankLabel(lo.r)} ${x.s === y.s ? 'suited' : 'offsuit'}`;
}

// The five cards that make up the best hand, for highlighting at showdown.
function bestFive(list) {
  const target = evaluate(list);
  const n = list.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [list[a], list[b], list[c], list[d], list[e]];
      if (evaluate(five) === target) return five;
    }
  }
  return list.slice(0, 5);
}

const FULL_DECK = [];
for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) FULL_DECK.push({ r, s });
const code = (c) => c.s * BASE + c.r;

// Monte Carlo chance of winning against `opponents` random hands.
function equity(hole, board, opponents, iters = 300) {
  if (opponents <= 0) return 1;
  const used = new Set([...hole, ...board].map(code));
  const pool = FULL_DECK.filter((c) => !used.has(code(c)));
  const missing = 5 - board.length;
  const need = missing + opponents * 2;
  let wins = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const full = board.concat(pool.slice(0, missing));
    const mine = evaluate(hole.concat(full));
    let lost = false;
    let ties = 0;
    for (let o = 0, k = missing; o < opponents; o++, k += 2) {
      const theirs = evaluate([pool[k], pool[k + 1], ...full]);
      if (theirs > mine) { lost = true; break; }
      if (theirs === mine) ties++;
    }
    if (!lost) wins += 1 / (ties + 1);
  }
  return wins / iters;
}

// ---------- Table state ----------
const el = {
  stage: $('#pk-stage'), next: $('#pk-next'),
  actions: $('#pk-actions'), fold: $('#pk-fold'), call: $('#pk-call'),
  raise: $('#pk-raise'), raiseBox: $('#pk-raise-box'), slider: $('#pk-slider'),
  buyin: $('#pk-buyin'), buyinOptions: $('#pk-buyin-options'), buyinText: $('#pk-buyin-text'),
  buyinRefill: $('#pk-buyin-refill'), balance: $('#balance'),
};

let players = [];
let buttonSeat = 0;
let deck = [];
let board = [];
let currentBet = 0;
let minRaise = BB;
let session = 0;
let handRunning = false;
let humanTurn = null; // resolves the human's pending decision
let usedBots = new Set();

const alive = (s) => { if (s !== session) throw ABORT; };
const human = () => players[0];
const live = () => players.filter((p) => !p.folded);
const canAct = () => players.filter((p) => !p.folded && !p.allIn);
const potTotal = () => players.reduce((a, p) => a + p.total, 0);
const collected = () => players.reduce((a, p) => a + p.total - p.bet, 0);
const nextSeat = (i) => (i + 1) % players.length;

// ---------- 3D table ----------
// Two layouts of the same oval table: wide for computers and landscape screens, and turned
// upright for phones. Seat 0 (you) is always nearest the camera; seats go clockwise.
// Positions are [x, z] on the felt.
const LAYOUTS = {
  wide: {
    table: { a: 8.6, b: 4.6, upright: false },
    seats: [
      { plate: [0, 5.5], cards: [0, 2.75], yaw: 0, bet: [2.0, 2.45], button: [-1.9, 2.95] },
      { plate: [-9.6, 0], cards: [-6.3, 0], yaw: -Math.PI / 2, bet: [-4.5, 1.25], button: [-6.1, -1.7] },
      { plate: [0, -5.7], cards: [0, -3.1], yaw: Math.PI, bet: [2.6, -2.9], button: [-2.0, -3.2] },
      { plate: [9.6, 0], cards: [6.3, 0], yaw: Math.PI / 2, bet: [4.5, -1.25], button: [6.1, 1.7] },
    ],
    board: { z: 0.15, gap: 1.22 },
    pot: [0, -1.9],
    potLabel: [0, -1.15],
    deck: [-3.6, -1.9],
    status: [0, 1.5],
    view: { elevation: 46, target: [0, 0, 0.4], width: 21, depth: 12 },
  },
  // On phones the side players' nameplates sit above their cards instead of at the screen edge.
  tall: {
    table: { a: 7.6, b: 4.6, upright: true },
    seats: [
      { plate: [0, 8.2], cards: [0, 5.3], yaw: 0, bet: [1.9, 4.2], button: [-1.9, 5.1] },
      { plate: [-3.0, -4.3], cards: [-2.6, -2.2], yaw: -Math.PI / 2, bet: [-1.6, -0.5], button: [-3.6, -0.4] },
      { plate: [0, -9.6], cards: [0, -6.0], yaw: Math.PI, bet: [-1.0, -4.5], button: [-1.8, -6.2] },
      { plate: [3.0, -4.3], cards: [2.6, -2.2], yaw: Math.PI / 2, bet: [1.6, -0.5], button: [3.6, -0.4] },
    ],
    board: { z: 0.9, gap: 1.18 },
    pot: [0, -2.4],
    potLabel: [0, -1.65],
    deck: [0.9, -5.0],
    status: [0, 2.9],
    view: { elevation: 72, target: [0, 0, 0.2], width: 10.2, depth: 15.5 },
  },
};

let t3 = null;
let tables = null;
let layoutName = 'wide';
let pot = null;
let potLabel = null;
let statusLabel = null;
let deckMesh = null;
let dealerButton = null;
let layoutPending = true;
const L = () => LAYOUTS[layoutName];
const at = ([x, z], y = 0) => V(x, y, z);

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
  t3 = Table3D.create(el.stage, { bottomInset: () => el.actions.offsetHeight });
  tables = {};
  for (const [name, lay] of Object.entries(LAYOUTS)) {
    const { a, b, upright } = lay.table;
    const outline = stadium(a, b, upright);
    tables[name] = t3.addTable({
      outline,
      railRadius: 0.48,
      drawFelt(g, map, s, cw, ch) {
        const [gx, gy] = map(0, 0);
        const grd = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(cw, ch) * 0.6);
        grd.addColorStop(0, '#20995c');
        grd.addColorStop(0.55, '#127245');
        grd.addColorStop(1, '#063a22');
        g.fillStyle = grd;
        g.fillRect(0, 0, cw, ch);
        speckle(g, cw, ch, 50000, 0.05);
        // Faint outlines where the five board cards go.
        g.strokeStyle = 'rgba(255,255,255,.14)';
        g.lineWidth = 0.025 * s;
        for (let i = 0; i < 5; i++) {
          const [px, py] = map((i - 2) * lay.board.gap - 0.58, lay.board.z - 0.8);
          roundRect(g, px, py, 1.16 * s, 1.6 * s, 0.1 * s);
          g.stroke();
        }
      },
    });
  }

  const back = t3.makeCard({ r: 14, s: 0 }).group;
  t3.scene.remove(back);
  deckMesh = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = back.clone();
    c.rotation.set(0, (Math.random() - 0.5) * 0.06, Math.PI);
    c.position.y = 0.012 + i * 0.012;
    deckMesh.add(c);
  }
  t3.scene.add(deckMesh);

  // The word is sized to sit inside the inner ring, and the puck is turned so it reads from your seat.
  const drawButton = (g) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 7;
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(128, 128, 98, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#1a1a1a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 60px Rubik, Arial, sans-serif';
    const size = 60 * Math.min(1, 148 / g.measureText('DEALER').width);
    g.font = `800 ${size}px Rubik, Arial, sans-serif`;
    g.fillText('DEALER', 128, 131);
    g.font = '26px Georgia, serif';
    g.fillText('★', 128, 76);
    g.fillText('★', 128, 182);
  };
  const face = Table3D.texture(256, 256, drawButton);
  if (document.fonts) document.fonts.ready.then(() => { drawButton(face.image.getContext('2d')); face.needsUpdate = true; });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.4 });
  const top = new THREE.MeshStandardMaterial({ map: face, roughness: 0.4 });
  dealerButton = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 40), [white, top, white]);
  dealerButton.castShadow = true;
  dealerButton.position.y = 0.06;
  dealerButton.rotation.y = Math.PI / 2;
  t3.scene.add(dealerButton);

  pot = t3.stack(V(), { label: false });
  potLabel = t3.label('pot-label', () => at(L().potLabel));
  potLabel.hide();
  statusLabel = t3.label('pk-status', () => at(L().status));
}

function cardSlot(p, i) {
  const s = L().seats[p.seat];
  const spread = p.revealed || p.isHuman ? 0.6 : 0.36;
  const lx = (i ? 1 : -1) * spread;
  const yaw = p.revealed ? 0 : s.yaw;
  // Revealed cards turn to face the camera and slide a little further onto the felt.
  const [cx, cz] = p.revealed ? [s.cards[0] * 0.85, s.cards[1] * 0.92] : s.cards;
  return { x: cx + lx * Math.cos(yaw), y: 0.012 + i * 0.006, z: cz - lx * Math.sin(yaw), yaw };
}
const boardSlot = (i) => ({ x: (i - 2) * L().board.gap, y: 0.012, z: L().board.z, yaw: 0 });
const platePoint = (p) => at(L().seats[p.seat].plate, 0.5);
const deckTop = () => at(L().deck, 0.1);
const balancePoint = () => t3.screenPoint(el.balance, 5);

function setView(dur = 900) {
  const v = L().view;
  return t3.setView({ fov: 40, elevation: v.elevation, width: v.width, depth: v.depth, target: at(v.target) }, dur);
}

// Pick the layout that suits the screen and move everything into place.
function applyLayout(force = false) {
  const r = el.stage.getBoundingClientRect();
  if (!r.width || !r.height) { layoutPending = true; return; }
  const name = r.width / Math.max(1, r.height - el.actions.offsetHeight) < 0.9 ? 'tall' : 'wide';
  if (name === layoutName && !force && !layoutPending) return;
  layoutPending = false;
  layoutName = name;
  for (const [n, t] of Object.entries(tables)) t.group.visible = n === name;
  deckMesh.position.copy(at(L().deck));
  deckMesh.rotation.y = name === 'tall' ? 0.2 : -0.25;
  dealerButton.position.copy(at(L().seats[buttonSeat].button, 0.06));
  pot.moveTo(at(L().pot), 0);
  for (const p of players) {
    p.cards.forEach((c, i) => { if (c.obj) t3.moveCard(c, cardSlot(p, i), 0); });
    p.view.betStack.moveTo(at(L().seats[p.seat].bet), 0);
  }
  board.forEach((c, i) => { if (c.obj) t3.moveCard(c, boardSlot(i), 0); });
  setView(0);
}

function pickBot() {
  const free = BOTS.filter((b) => !usedBots.has(b.name));
  const bot = free[Math.floor(Math.random() * free.length)];
  usedBots.add(bot.name);
  return bot;
}

function makePlayer(seat, look, stack, isHuman = false) {
  return {
    seat, isHuman, stack, name: look.name, avatar: look.avatar, color: look.color, style: look,
    cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, revealed: false,
  };
}

function buildSeats() {
  for (const p of players) {
    if (p.view) continue;
    const label = t3.label(`seat seat-${p.seat}${p.isHuman ? ' me' : ''}`, () => at(L().seats[p.seat].plate), { clamp: true });
    const s = label.el;
    s.innerHTML = `
      <div class="plate">
        <div class="avatar"></div>
        <div class="seat-info">
          <div class="seat-name"><span class="nm"></span><span class="thinking-dots"><i></i><i></i><i></i></span></div>
          <div class="seat-stack"></div>
        </div>
        <div class="bubble"></div>
        ${p.isHuman ? '<button class="edit-me" type="button" aria-label="Customize your character" title="Customize your character">✎</button>' : ''}
        ${p.isHuman ? '<div class="pk-hint"><b class="hint-hand"></b><span class="hint-odds"></span><div class="meter"><i></i></div></div>' : ''}
      </div>`;
    p.view = {
      label,
      seat: s,
      plate: s.querySelector('.plate'),
      bubble: s.querySelector('.bubble'),
      betStack: t3.stack(at(L().seats[p.seat].bet)),
    };
    const edit = s.querySelector('.edit-me');
    if (edit) edit.addEventListener('click', () => profile.open());
    renderSeat(p);
  }
  hideHint();
}

function renderSeat(p) {
  const v = p.view;
  v.seat.querySelector('.avatar').textContent = p.avatar;
  v.seat.querySelector('.nm').textContent = p.name;
  v.seat.style.setProperty('--accent', p.color);
  v.seat.querySelector('.seat-stack').textContent = p.allIn && p.stack === 0 && handRunning ? 'All-in' : fmt(p.stack);
  v.seat.classList.toggle('folded', p.folded);
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

function moveDealerButton() {
  return t3.moveObject(dealerButton, at(L().seats[buttonSeat].button, 0.06), 600);
}

function updatePot() {
  pot.set(collected(), { pop: false });
  if (potTotal()) potLabel.show(`Pot ${fmt(potTotal())}`);
  else potLabel.hide();
}

function setStatus(text) {
  if (text) statusLabel.show(text);
  else statusLabel.hide();
}

// Between hands the action dock swaps for a single "Deal next hand" button.
function showNext(show) {
  el.next.hidden = !show;
  el.actions.classList.toggle('between', show);
}

function saveHumanStack() {
  wallet.hold('poker', human() ? human().stack : 0);
}

// ---------- Hint for the human ----------
let hintTimer = 0;
function hideHint() {
  const hint = $('.pk-hint', el.stage);
  if (hint) hint.style.visibility = 'hidden';
}

function updateHint() {
  const me = human();
  const hint = $('.pk-hint', el.stage);
  if (!hint || !me || me.cards.length < 2) return;
  if (me.folded) { hint.style.visibility = 'hidden'; return; }
  hint.style.visibility = 'visible';
  hint.querySelector('.hint-hand').textContent = board.length ? describe(evaluate([...me.cards, ...board])) : describeHole(me.cards);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    const opp = live().length - 1;
    const eq = equity(me.cards, board, opp, 600);
    hint.querySelector('.hint-odds').textContent = `${Math.round(eq * 100)}% to win vs ${opp}`;
    hint.querySelector('.meter i').style.width = `${Math.round(eq * 100)}%`;
  }, 30);
}

// ---------- Chips moving ----------
async function putChips(p, amount) {
  amount = Math.min(amount, p.stack);
  if (amount <= 0) return;
  p.stack -= amount;
  p.bet += amount;
  p.total += amount;
  if (p.stack === 0) p.allIn = true;
  if (p.isHuman) saveHumanStack();
  renderSeat(p);
  await t3.flyChips(platePoint(p), p.view.betStack.top(), amount, { max: 4, dur: 380 });
  p.view.betStack.set(p.bet);
  updatePot();
}

async function collectBets() {
  const betting = players.filter((p) => p.bet > 0);
  if (!betting.length) return;
  await sleep(250);
  await Promise.all(betting.map((p) => {
    const from = p.view.betStack.top();
    p.view.betStack.set(0);
    return t3.flyChips(from, pot.top(), p.bet, { max: 4, dur: 450 });
  }));
  players.forEach((p) => { p.bet = 0; });
  updatePot();
}

async function award(p, amount) {
  p.stack += amount;
  if (p.isHuman) saveHumanStack();
  await t3.flyChips(pot.top(), platePoint(p), amount, { max: 7, dur: 600 });
  renderSeat(p);
  fx.floatText(p.view.plate, `+${fmt(amount)}`, 'win');
}

// ---------- Hand flow ----------
async function playHand() {
  const s = session;
  try {
    await runHand(s);
  } catch (e) {
    if (e !== ABORT) throw e;
  }
}

async function runHand(s) {
  showNext(false);
  if (human().stack <= 0) { showBuyIn(true); return; }
  handRunning = true;

  // Clear the last hand away.
  const old = [...board, ...players.flatMap((p) => p.cards)];
  players.forEach((p) => {
    p.view.bubble.textContent = '';
    p.view.seat.classList.remove('winner', 'turn');
  });
  if (old.length) await t3.sweep(old, deckTop);
  alive(s);

  // Busted bots leave and new ones sit down.
  for (let i = 1; i < players.length; i++) {
    if (players[i].stack > 0) continue;
    usedBots.delete(players[i].name);
    players[i] = { ...makePlayer(i, pickBot(), BOT_STACK), view: players[i].view };
    renderSeat(players[i]);
    players[i].view.seat.classList.remove('joining');
    void players[i].view.seat.offsetWidth;
    players[i].view.seat.classList.add('joining');
    setStatus(`${players[i].name} sits down`);
    await sleep(500);
    alive(s);
  }

  players.forEach((p) => Object.assign(p, { cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, revealed: false }));
  players.forEach(renderSeat);
  board = [];
  deck = cards.makeDeck(1);
  buttonSeat = nextSeat(buttonSeat);
  moveDealerButton();
  updatePot();
  setStatus('');
  hideHint();

  const sb = nextSeat(buttonSeat);
  const bb = nextSeat(sb);
  bubble(players[sb], `SB ${fmt(SB)}`, 'blind');
  await putChips(players[sb], SB);
  bubble(players[bb], `BB ${fmt(BB)}`, 'blind');
  await putChips(players[bb], BB);
  alive(s);
  currentBet = BB;
  minRaise = BB;

  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= players.length; k++) {
      const p = players[(buttonSeat + k) % players.length];
      const card = deck.pop();
      p.cards.push(card);
      await t3.dealCard(card, deckTop(), cardSlot(p, p.cards.length - 1), { faceUp: p.isHuman, dur: 300 });
      alive(s);
    }
  }
  updateHint();

  await bettingRound(s, nextSeat(bb));
  let revealed = false;
  for (const count of [3, 1, 1]) {
    await collectBets();
    alive(s);
    if (live().length < 2) break;
    if (!revealed && canAct().length < 2) {
      // Everyone is all-in: turn the cards over and run out the board.
      revealed = true;
      setStatus('All-in! Running it out…');
      await revealAll(s);
    }
    deck.pop(); // burn
    for (let i = 0; i < count; i++) {
      const card = deck.pop();
      board.push(card);
      await t3.dealCard(card, deckTop(), boardSlot(board.length - 1), { dur: 360 });
      alive(s);
    }
    updateHint();
    if (canAct().length >= 2) {
      currentBet = 0;
      minRaise = BB;
      players.forEach((p) => {
        p.acted = false;
        if (!p.folded && !p.allIn) p.view.bubble.textContent = '';
      });
      await bettingRound(s, nextSeat(buttonSeat));
    } else {
      await sleep(revealed ? 900 : 400);
      alive(s);
    }
  }
  await collectBets();
  alive(s);
  setTurn(null);
  await showdown(s);
  alive(s);

  handRunning = false;
  players.forEach(renderSeat);
  setActionBar(null);
  if (human().stack <= 0) {
    await sleep(1200);
    alive(s);
    showBuyIn(true);
    return;
  }
  showNext(true);
}

async function bettingRound(s, start) {
  let i = start;
  for (let guard = 0; guard < 400; guard++) {
    alive(s);
    if (live().length < 2) return;
    const actors = canAct();
    if (!actors.length) return;
    if (actors.length === 1 && actors[0].bet >= currentBet) return;
    if (actors.every((p) => p.acted && p.bet === currentBet)) return;
    const p = players[i];
    if (!p.folded && !p.allIn && !(p.acted && p.bet === currentBet)) {
      setTurn(p);
      const action = p.isHuman ? await askHuman(p) : await askBot(p, s);
      alive(s);
      await apply(p, action);
      alive(s);
    }
    i = nextSeat(i);
  }
}

async function apply(p, action) {
  const toCall = currentBet - p.bet;
  let type = action.type;
  let to = action.to;
  if (type === 'raise' && p.bet + p.stack <= currentBet) type = 'call';
  if (type === 'check' && toCall > 0) type = 'call';
  if (type === 'fold') {
    p.folded = true;
    bubble(p, 'Fold', 'fold');
    renderSeat(p);
    t3.sweep(p.cards, deckTop);
    sound.flip();
    if (p.isHuman) hideHint();
    else updateHint();
  } else if (type === 'check') {
    bubble(p, 'Check', 'check');
    sound.tone(420, 0.06, { type: 'square', vol: 0.05 });
    sound.tone(420, 0.06, { type: 'square', vol: 0.05, delay: 0.09 });
  } else if (type === 'call') {
    await putChips(p, toCall);
    bubble(p, p.allIn ? 'All-in' : `Call ${fmt(p.bet)}`, p.allIn ? 'allin' : 'call');
  } else {
    to = Math.min(Math.max(to, currentBet + 1), p.bet + p.stack);
    const raiseBy = to - currentBet;
    const opening = currentBet === 0;
    await putChips(p, to - p.bet);
    if (raiseBy >= minRaise) {
      minRaise = raiseBy;
      players.forEach((o) => { if (o !== p) o.acted = false; });
    }
    currentBet = Math.max(currentBet, to);
    bubble(p, p.allIn ? 'All-in' : `${opening ? 'Bet' : 'Raise to'} ${fmt(to)}`, p.allIn ? 'allin' : 'raise');
    if (p.allIn) sound.tone(180, 0.5, { type: 'sawtooth', vol: 0.06, slide: 520 });
  }
  p.acted = true;
  renderSeat(p);
}

// ---------- Bots ----------
function decide(p) {
  const opponents = live().length - 1;
  const eq = equity(p.cards, board, opponents, 260);
  const toCall = currentBet - p.bet;
  const pot = potTotal();
  const odds = toCall / (pot + toCall);
  const strength = eq * (opponents + 1); // 1 = an average hand at this table
  const { aggr, loose, bluff } = p.style;
  const r = Math.random();
  const maxTo = p.bet + p.stack;
  const raise = (frac) => {
    if (maxTo <= currentBet) return { type: 'call' };
    const size = Math.round(((pot + toCall) * frac) / 10) * 10;
    let to = currentBet === 0 ? Math.max(BB, size) : currentBet + Math.max(minRaise, size);
    if (to >= maxTo * 0.7) to = maxTo;
    return { type: 'raise', to };
  };

  if (toCall === 0) {
    if (strength > 1.45 - aggr * 0.3 && r < 0.45 + aggr * 0.45) return raise(strength > 2.2 ? 0.9 : 0.6);
    if (r < bluff) return raise(0.5);
    return { type: 'check' };
  }
  if (strength > 1.9) return r < 0.3 + aggr * 0.5 ? raise(strength > 2.5 ? 1 : 0.7) : { type: 'call' };
  const cap = (1 / (opponents + 1)) * (1.45 - loose * 0.3);
  const need = Math.min(odds + (1 - loose) * 0.08, cap);
  if (eq >= need) return { type: 'call' };
  if (!board.length && toCall <= BB && strength > 0.95 - loose * 0.35) return { type: 'call' };
  if (r < bluff * 0.4 && toCall < pot * 0.6) return raise(0.8);
  return { type: 'fold' };
}

async function askBot(p, s) {
  p.view.seat.classList.add('thinking');
  setStatus(`${p.name} is thinking…`);
  const action = decide(p);
  await sleep(human().folded ? rand(350, 700) : rand(700, 1500));
  p.view.seat.classList.remove('thinking');
  alive(s);
  setStatus('');
  return action;
}

// ---------- Human ----------
function askHuman(p) {
  return new Promise((resolve) => {
    humanTurn = resolve;
    setActionBar(p);
    setStatus('Your move');
    sound.tone(880, 0.08, { type: 'triangle', vol: 0.06 });
  });
}

function respond(action) {
  if (!humanTurn) return;
  const resolve = humanTurn;
  humanTurn = null;
  setActionBar(null);
  setStatus('');
  resolve(action);
}

function raiseLimits(p) {
  const maxTo = p.bet + p.stack;
  const minTo = Math.min(maxTo, currentBet === 0 ? BB : currentBet + minRaise);
  return { minTo, maxTo };
}

function setRaiseLabel() {
  const p = human();
  const to = Number(el.slider.value);
  const all = to >= p.bet + p.stack;
  el.raise.innerHTML = `${all ? 'All-in' : currentBet === 0 ? 'Bet' : 'Raise to'} ${fmt(to)}<kbd>R</kbd>`;
}

function setActionBar(p) {
  const waiting = !p;
  el.actions.classList.toggle('waiting', waiting);
  if (waiting) return;
  el.actions.classList.remove('slide-in');
  void el.actions.offsetWidth;
  el.actions.classList.add('slide-in');
  const toCall = currentBet - p.bet;
  el.call.innerHTML = toCall === 0
    ? 'Check<kbd>C</kbd>'
    : toCall >= p.stack ? `All-in ${fmt(p.stack)}<kbd>C</kbd>` : `Call ${fmt(toCall)}<kbd>C</kbd>`;
  el.fold.disabled = false;
  const { minTo, maxTo } = raiseLimits(p);
  const canRaise = maxTo > currentBet && canAct().length > 1;
  el.raiseBox.style.visibility = canRaise ? 'visible' : 'hidden';
  el.raise.disabled = !canRaise;
  if (!canRaise) el.raise.innerHTML = 'Raise<kbd>R</kbd>';
  if (canRaise) {
    el.slider.min = minTo;
    el.slider.max = maxTo;
    el.slider.step = 10;
    el.slider.value = minTo;
    setRaiseLabel();
  }
}

function presetRaise(size) {
  const p = human();
  if (!p || !humanTurn) return;
  const { minTo, maxTo } = raiseLimits(p);
  let to = maxTo;
  if (size !== 'all') {
    const toCall = currentBet - p.bet;
    const amount = Math.round(((potTotal() + toCall) * Number(size)) / 10) * 10;
    to = currentBet === 0 ? amount : currentBet + amount;
  }
  el.slider.value = Math.min(maxTo, Math.max(minTo, to));
  setRaiseLabel();
  sound.click();
}

// ---------- Showdown ----------
// Turn a player's cards over and swing them round to face the camera.
async function revealAll(s) {
  for (const p of live()) {
    if (p.isHuman || p.revealed) continue;
    p.revealed = true;
    await Promise.all(p.cards.map(async (c, i) => {
      await t3.flip(c, true);
      await t3.moveCard(c, cardSlot(p, i), 320);
    }));
    alive(s);
  }
}

function buildPots() {
  const contrib = players.map((p) => p.total);
  const pots = [];
  for (;;) {
    const levels = players.filter((p, i) => !p.folded && contrib[i] > 0).map((p) => contrib[players.indexOf(p)]);
    if (!levels.length) break;
    const level = Math.min(...levels);
    let amount = 0;
    const eligible = [];
    players.forEach((p, i) => {
      const take = Math.min(contrib[i], level);
      amount += take;
      contrib[i] -= take;
      if (!p.folded && take === level) eligible.push(p);
    });
    pots.push({ amount, eligible });
  }
  const dead = contrib.reduce((a, b) => a + b, 0);
  if (dead && pots.length) pots[pots.length - 1].amount += dead;
  return pots;
}

async function showdown(s) {
  hideHint();
  const remaining = live();
  if (remaining.length === 1) {
    const w = remaining[0];
    const amount = potTotal();
    bubble(w, `🏆 Takes ${fmt(amount)}`, 'win');
    w.view.seat.classList.add('winner');
    pot.set(0);
    potLabel.hide();
    await award(w, amount);
    if (w.isHuman) {
      fx.banner(`You win<small>+${fmt(amount)}</small>`, 'win');
      sound.win();
      fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.55, 70);
    } else {
      setStatus(`${w.name} takes the pot`);
    }
    return;
  }

  await revealAll(s);
  for (const p of remaining) {
    p.score = evaluate([...p.cards, ...board]);
    bubble(p, describe(p.score), 'hand-rank');
  }
  await sleep(600);
  alive(s);

  const allCards = [...board, ...remaining.flatMap((p) => p.cards)];
  allCards.forEach((c) => t3.dim(c, true));
  const pots = buildPots();
  let humanWon = 0;
  let headline = null;
  for (const pot of pots) {
    const best = Math.max(...pot.eligible.map((p) => p.score));
    const winners = pot.eligible.filter((p) => p.score === best);
    if (!headline) {
      headline = winners;
      for (const w of winners) {
        bestFive([...w.cards, ...board]).forEach((c) => { t3.dim(c, false); t3.highlight(c, true); });
        w.view.seat.classList.add('winner');
        bubble(w, `🏆 ${describe(w.score)}`, 'win');
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const w of winners) {
      const amount = share + (odd > 0 ? 1 : 0);
      odd = Math.max(0, odd - 1);
      if (w.isHuman) humanWon += amount;
      await award(w, amount);
      alive(s);
    }
    updatePotAfterAward(pots, pot);
  }
  pot.set(0);
  potLabel.hide();

  const hand = describe(headline[0].score);
  if (humanWon > 0) {
    const big = humanWon >= 400 || Math.floor(headline[0].score / CATEGORY_SIZE) >= 4;
    fx.banner(`${headline.length > 1 ? 'Split pot' : 'You win'}<small>+${fmt(humanWon)} · ${hand}</small>`, 'win', 2200);
    if (big) { sound.bigWin(); fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.5, 160); } else { sound.win(); fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.55, 70); }
  } else {
    const names = headline.map((p) => p.name).join(' & ');
    setStatus(`${names} ${headline.length > 1 ? 'split the pot' : 'wins'} with ${hand}`);
    if (!human().folded) sound.lose();
  }
}

function updatePotAfterAward(pots, done) {
  const left = pots.slice(pots.indexOf(done) + 1).reduce((a, p) => a + p.amount, 0);
  pot.set(left, { pop: false });
  if (left) potLabel.show(`Pot ${fmt(left)}`);
  else potLabel.hide();
}

// ---------- Buy-in & seating ----------
function showBuyIn(rebuy = false) {
  showNext(false);
  el.buyin.hidden = false;
  el.buyinOptions.innerHTML = '';
  const options = BUY_INS.filter((v) => v <= wallet.balance);
  if (!options.length && wallet.balance >= 100) options.push(wallet.balance);
  el.buyinText.textContent = options.length
    ? (rebuy ? 'You\'re out of chips at this table. Buy back in?' : 'Choose how many chips to bring to the table. Whatever you have left goes back to your balance when you leave.')
    : 'You need at least $100 to sit at this table.';
  el.buyinRefill.hidden = options.length > 0;
  for (const v of options) {
    const b = document.createElement('button');
    b.className = 'btn gold';
    b.innerHTML = `${fmt(v)}<small>${Math.floor(v / BB)} big blinds</small>`;
    b.addEventListener('click', () => sitDown(v));
    el.buyinOptions.append(b);
  }
}

function sitDown(amount) {
  wallet.add(-amount);
  human().stack += amount;
  saveHumanStack();
  renderSeat(human());
  el.buyin.hidden = true;
  t3.flyChips(balancePoint(), platePoint(human()), amount, { max: 6 });
  const s = session;
  setTimeout(() => { if (s === session) playHand(); }, 700);
}

const myLook = () => ({ name: profile.name, avatar: profile.avatar, color: profile.color, aggr: 0, loose: 0, bluff: 0 });

function setupTable() {
  // Clear anything left from a previous visit.
  for (const c of [...board, ...players.flatMap((p) => p.cards)]) t3.removeCard(c);
  const views = players.map((p) => p.view);
  usedBots = new Set();
  players = [makePlayer(0, myLook(), 0, true)];
  for (let i = 1; i <= 3; i++) players.push(makePlayer(i, pickBot(), BOT_STACK));
  players.forEach((p, i) => { p.view = views[i]; });
  buttonSeat = Math.floor(Math.random() * players.length);
  board = [];
  buildSeats();
  players.forEach((p) => {
    renderSeat(p);
    p.view.seat.classList.remove('winner', 'turn', 'thinking');
    p.view.bubble.textContent = '';
    p.view.betStack.set(0);
  });
  updatePot();
  setStatus('');
  setActionBar(null);
  applyLayout(true);
}

// ---------- Wiring ----------
el.fold.addEventListener('click', () => respond({ type: 'fold' }));
el.call.addEventListener('click', () => respond({ type: currentBet > human().bet ? 'call' : 'check' }));
el.raise.addEventListener('click', () => respond({ type: 'raise', to: Number(el.slider.value) }));
el.slider.addEventListener('input', setRaiseLabel);
$$('.raise-presets button').forEach((b) => b.addEventListener('click', () => presetRaise(b.dataset.size)));
el.next.addEventListener('click', playHand);
$('#pk-buyin-back').addEventListener('click', () => Casino.go('lobby'));
el.buyinRefill.addEventListener('click', () => {
  wallet.refill();
  showBuyIn();
});
new ResizeObserver(() => { if (t3 && t3.active) applyLayout(); }).observe(el.stage);
profile.onChange(() => {
  const me = human();
  if (!me || !me.view) return;
  Object.assign(me, { name: profile.name, avatar: profile.avatar, color: profile.color });
  renderSeat(me);
});

Casino.register('poker', {
  enter() {
    session++;
    if (!t3) buildTables();
    t3.setActive(true);
    setupTable();
    showBuyIn();
  },
  leave(force) {
    const me = human();
    if (!force && handRunning && me && !me.folded && me.total > 0) {
      return 'Chips you have already put in this pot will be lost. The rest of your stack goes back to your balance.';
    }
    session++;
    if (humanTurn) respond({ type: 'fold' });
    if (me && me.stack > 0) wallet.add(me.stack);
    if (me) me.stack = 0;
    wallet.hold('poker', 0);
    handRunning = false;
    el.buyin.hidden = true;
    showNext(false);
    if (t3) t3.setActive(false);
    return true;
  },
  key(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (!el.next.hidden && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      playHand();
      return;
    }
    if (!humanTurn) return;
    if (k === 'f') el.fold.click();
    else if (k === 'c' || k === 'k') el.call.click();
    else if (k === 'r' && !el.raise.disabled) el.raise.click();
  },
});
})();
