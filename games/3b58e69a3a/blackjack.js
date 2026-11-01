(() => {
'use strict';

const { $, sleep, fmt, store, wallet, sound, ABORT, cards, chips, fx, Table3D } = Casino;
const { V, arcText, speckle } = Table3D;

const DECKS = 6;
const RESHUFFLE_AT = 52 * DECKS * 0.25;
const MIN_BET = 5;
const MAX_BET = 5000;
const MAX_HANDS = 4;
const TRAY = [5, 25, 100, 500, 1000];
const HAND_GAP = 2.95;
// Phones in portrait look down more steeply so the table fills the tall screen.
const VIEW = { fov: 40, elevation: (aspect) => (aspect < 0.9 ? 70 : 56), depth: 9.6 };

const el = {
  stage: $('#bj-stage'), controls: $('#blackjack .bj-controls'),
  status: $('#bj-status'), betRow: $('#bj-bet-row'), playRow: $('#bj-play-row'), tray: $('#bj-tray'),
  clear: $('#bj-clear'), doubleBet: $('#bj-double-bet'), deal: $('#bj-deal'),
  hit: $('#bj-hit'), stand: $('#bj-stand'), double: $('#bj-double'), split: $('#bj-split'),
  broke: $('#bj-broke'), balance: $('#balance'),
};

let t3 = null;
let world = null; // shoe, discard pile, chip rack, dealer total label
let shoe = [];
let phase = 'idle'; // idle | betting | dealing | player | dealer | settle
let busy = false;
let bet = 0; // chips in the betting circle, already taken from the wallet
let pendingPayout = 0;
let lastBet = store.get('casino.bj.lastBet', 25);
let hands = [];
let active = 0;
let dealer = [];
let session = 0;

// ---------- Playing with friends ----------
// Everyone bets on their own and presses Ready. When all are ready (or BET_WAIT after the first),
// the host deals: one 'round' message carries who's playing, their bets and the whole shoe, so
// every browser deals the same cards. Moves go to the host, which passes them on in order, and
// each browser plays them out itself. Each hand is owned by a player; only yours touch your chips.
const BET_WAIT = 20000;
const TURN_LIMIT = 30000;
let room = null;
let roundNo = 0;
let ready = false; // your bet is in and you're waiting for the deal
let readyIds = [];
let dealAt = 0; // when the host will deal without the stragglers
let waitingEcho = false; // you've sent a move and are waiting for it to come back
let pendingRound = null; // guest: a round that came in before this table finished the last one
let roundBusy = false; // guest: joined while a round was being played
let actQueue = [];
let hostBets = new Map(); // host: id -> bet for the next round
let dealTimer = 0;
let dealForced = false;
let turnTimer = 0;
let ticker = 0;
let nameTags = [];

const myOwner = () => ({ id: room ? room.id : 'me', name: Arcade.player.name, look: Arcade.player.look, me: true });
const cardCode = (c) => c.s * 15 + c.r;
const cardFrom = (n) => ({ r: n % 15, s: Math.floor(n / 15) });
const handsOf = (owner) => hands.filter((h) => h.owner === owner).length;
const myHands = () => hands.filter((h) => h.owner.me);

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const alive = (s) => { if (s !== session) throw ABORT; };
const isTen = (c) => c.r >= 10 && c.r <= 13;
const cardValue = (c) => (c.r === 14 ? 11 : Math.min(c.r, 10));

function handValue(list) {
  let total = 0;
  let aces = 0;
  for (const c of list) {
    total += cardValue(c);
    if (c.r === 14) aces++;
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const isBlackjack = (list) => list.length === 2 && handValue(list).total === 21;
const splitAces = (h) => h.fromSplit && h.cards[0] && h.cards[0].r === 14;
// Only your own chips are checked here; a friend's browser checked theirs before sending the move.
const affords = (h) => !h.owner.me || wallet.balance >= h.bet;
const canDouble = (h) => h.cards.length === 2 && !h.done && !splitAces(h) && affords(h);
const canSplit = (h) => h.cards.length === 2 && !splitAces(h) && handsOf(h.owner) < MAX_HANDS
  && cardValue(h.cards[0]) === cardValue(h.cards[1]) && affords(h);

// ---------- Table layout ----------
// The dealer stands at the straight edge (far, -z); the player sits at the curved edge (+z).
// Hands fan out along the curve and turn slightly toward the dealer.
function handFrame(i, n) {
  const x = (i - (n - 1) / 2) * HAND_GAP;
  return { x, z: 2.55 - 0.045 * x * x, yaw: x * 0.07 };
}
function local(f, lx, lz) {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return V(f.x + lx * c + lz * s, 0, f.z - lx * s + lz * c);
}
const frameOf = (h) => handFrame(hands.indexOf(h), hands.length);
function cardSlot(h, i) {
  const f = frameOf(h);
  const side = h.sideways === i;
  const p = local(f, -0.3 + i * 0.42 + (side ? 0.22 : 0), -i * 0.2);
  return { x: p.x, y: 0.012 + i * 0.006, z: p.z, yaw: f.yaw + (side ? Math.PI / 2 : 0) };
}
const spotPos = (h) => local(frameOf(h), 0, 1.4);
const dealerSlot = (i, n) => ({ x: (i - (n - 1) / 2) * 0.82, y: 0.012 + i * 0.004, z: -1.95, yaw: 0 });

function setView(dur = 900) {
  const n = hands.length;
  const span = (n - 1) * HAND_GAP + 3.6;
  const x = phase === 'player' && n > 1 ? handFrame(active, n).x * 0.3 : 0;
  const z = phase === 'dealer' || phase === 'settle' ? 0.3 : 0.6;
  return t3.setView({ ...VIEW, target: V(x, 0, z), width: (aspect) => Math.max(aspect < 0.9 ? 7.4 : 14, span + (aspect < 0.9 ? 0.6 : 0)) }, dur);
}

function buildTable() {
  t3 = Table3D.create(el.stage, { bottomInset: () => el.controls.offsetHeight });
  const cz = -3.3;
  const rx = 9.4;
  const rz = 8.6;
  const outline = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI;
    outline.push([rx * Math.cos(a), cz + rz * Math.sin(a)]);
  }
  outline.push([-rx, cz - 0.45], [-rx + 0.18, cz - 0.82], [-rx + 0.55, cz - 0.98], [rx - 0.55, cz - 0.98], [rx - 0.18, cz - 0.82], [rx, cz - 0.45]);

  t3.addTable({
    outline,
    drawFelt(g, map, s, cw, ch) {
      const [gx, gy] = map(0, -0.3);
      const grd = g.createRadialGradient(gx, gy, 0, gx, gy, cw * 0.62);
      grd.addColorStop(0, '#20995c');
      grd.addColorStop(0.55, '#127245');
      grd.addColorStop(1, '#063a22');
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
      speckle(g, cw, ch, 60000, 0.05);
      const [cx, cy] = map(0, cz);
      g.fillStyle = 'rgba(236,196,98,.95)';
      g.font = `700 ${0.46 * s}px Cinzel, Georgia, serif`;
      arcText(g, 'BLACKJACK PAYS 3 TO 2', cx, cy, 3.9 * s, 0.09 * s);
      g.strokeStyle = 'rgba(236,196,98,.7)';
      g.lineWidth = 0.035 * s;
      for (const r of [4.4, 5.15]) {
        g.beginPath();
        g.arc(cx, cy, r * s, Math.PI / 2 - 0.6, Math.PI / 2 + 0.6);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.font = `600 ${0.24 * s}px Rubik, Arial, sans-serif`;
      arcText(g, 'DEALER MUST STAND ON ALL 17s', cx, cy, 4.86 * s, 0.07 * s);
    },
  });
  world = {
    shoe: t3.addShoe(V(6.4, 0, -2.6), -0.55),
    discard: t3.addDiscard(V(-6.4, 0, -2.6), 0.55),
    rack: t3.addRack(V(0, 0, -3.72), [1000, 500, 100, 100, 25, 25, 5, 5, 1]),
    dealerTotal: t3.label('t3-total', () => V(-((dealer.length - 1) / 2) * 0.82 - 0.75, 0, -1.95)),
  };
  world.dealerTotal.hide();
  // Start high above the table; the first round's view swoops down to the seat.
  t3.setView({ ...VIEW, target: V(0, 0, 0), elevation: 80, width: (aspect) => (aspect < 0.9 ? 16 : 26) }, 0);
}

const balancePoint = () => t3.screenPoint(el.balance, 5);
// Where a hand's chips come from and go back to: your balance, or the friend's side of the rail.
const chipHome = (h) => (h.owner.me ? balancePoint() : local(frameOf(h), 0, 2.6));

// ---------- Hands ----------
function makeHand(amount = 0, owner = myOwner()) {
  const h = { owner, cards: [], bet: amount, done: false, busted: false, fromSplit: false, blackjack: false, sideways: -1 };
  h.ring = t3.betRing();
  h.stack = t3.stack(V());
  h.total = t3.label('t3-total', () => local(frameOf(h), -1.05, 0));
  h.total.hide();
  h.tag = t3.label('t3-tag', () => local(frameOf(h), -0.3 + 0.21 * Math.max(0, h.cards.length - 1), -1.05 - 0.2 * Math.max(0, h.cards.length - 1)));
  h.tag.hide();
  return h;
}

function placeHand(h) {
  h.ring.setPos(spotPos(h));
  h.stack.moveTo(spotPos(h), 0);
}

function disposeHand(h) {
  for (const c of h.cards) t3.removeCard(c);
  h.ring.remove();
  h.stack.remove();
  h.total.remove();
  h.tag.remove();
}

function layoutHands(dur = 400) {
  return Promise.all(hands.flatMap((h) => [
    h.ring.setPos(spotPos(h), dur),
    h.stack.moveTo(spotPos(h), dur),
    ...h.cards.map((c, i) => (c.obj ? t3.moveCard(c, cardSlot(h, i), dur) : null)),
  ]));
}

function setBadge(label, list) {
  if (!list.length) { label.hide(); return; }
  const { total, soft } = handValue(list);
  const text = soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  const b = label.el;
  if (b.textContent !== text) {
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }
  label.show(text);
  b.classList.toggle('bust', total > 21);
  b.classList.toggle('twentyone', total === 21);
}

const visibleDealerCards = () => dealer.filter((c) => c.obj && c.obj.faceUp);

function setTag(h, text, kind) {
  h.tag.el.className = `t3-tag ${kind}`;
  h.tag.show(text);
}

function focusHands() {
  hands.forEach((h, i) => {
    const current = phase === 'player' && i === active;
    h.ring.setGlow(current || (phase === 'betting' && bet === 0));
    h.total.el.classList.toggle('active', current && hands.length > 1);
    h.total.el.classList.toggle('current', current);
  });
}

function updateUI() {
  const betting = phase === 'betting';
  const open = betting && !ready;
  el.betRow.hidden = !betting;
  el.playRow.hidden = betting || phase === 'idle';
  for (const b of el.tray.children) {
    const v = Number(b.dataset.v);
    b.disabled = !open || v > wallet.balance || bet + v > MAX_BET;
  }
  el.clear.disabled = !open || !bet;
  el.doubleBet.disabled = !open || !bet || wallet.balance < bet || bet * 2 > MAX_BET;
  el.deal.disabled = !open || bet < MIN_BET;
  el.deal.innerHTML = room ? 'Ready<kbd>Space</kbd>' : 'Deal<kbd>Space</kbd>';

  const h = hands[active];
  const playing = phase === 'player' && !busy && !waitingEcho && h && h.owner.me;
  el.hit.disabled = !playing;
  el.stand.disabled = !playing;
  el.double.disabled = !playing || !canDouble(h);
  el.split.disabled = !playing || !canSplit(h);
  el.broke.hidden = !(betting && bet === 0 && wallet.balance < MIN_BET);

  let status = '';
  const mine = myHands();
  if (betting && room) status = tableStatus();
  else if (betting) status = bet < MIN_BET ? 'Tap a chip to place your bet' : `Bet <b>${fmt(bet)}</b> · ready to deal`;
  else if (phase === 'dealing') status = 'Dealing…';
  else if (phase === 'player' && h && !h.owner.me) status = `<b>${esc(h.owner.name)}</b> is playing…`;
  else if (phase === 'player') status = mine.length > 1 ? `Hand <b>${mine.indexOf(h) + 1}</b> of ${mine.length}: hit or stand?` : 'Hit or stand?';
  else if (phase === 'dealer') status = 'Dealer plays…';
  el.status.innerHTML = status;
  focusHands();
}

// The betting line at a table with friends: your bet, who you're waiting for, and the deal clock.
function tableStatus() {
  const secs = dealAt ? Math.max(0, Math.ceil((dealAt - Date.now()) / 1000)) : 0;
  const clock = secs ? ` · dealing in ${secs}s` : '';
  if (ready) {
    const waiting = room.players.filter((p) => !readyIds.includes(p.id)).map((p) => esc(p.name));
    return waiting.length ? `Ready! Waiting for <b>${waiting.join(', ')}</b>${clock}` : 'Ready! Dealing…';
  }
  if (roundBusy) return 'A round is being played. Place a bet for the next one.';
  return bet < MIN_BET ? `Tap a chip to place your bet${clock}` : `Bet <b>${fmt(bet)}</b> · press Ready${clock}`;
}

// ---------- Betting ----------
function addBet(amount, fromEl) {
  if (phase !== 'betting' || ready) return;
  amount = Math.min(amount, MAX_BET - bet, wallet.balance);
  if (amount <= 0) return;
  wallet.add(-amount);
  bet += amount;
  wallet.hold('blackjack', bet);
  const h = hands[0];
  const s = session;
  if (fromEl) {
    t3.flyChips(t3.screenPoint(fromEl, 4.5), h.stack.top(), amount, { max: 3, dur: 440 }).then(() => {
      if (s === session && phase === 'betting') h.stack.set(bet);
    });
  } else {
    h.stack.set(bet);
  }
  updateUI();
}

function clearBet() {
  if (phase !== 'betting' || !bet || ready) return;
  const amount = bet;
  const h = hands[0];
  bet = 0;
  wallet.hold('blackjack', 0);
  const from = h.stack.top();
  h.stack.set(0);
  t3.flyChips(from, balancePoint(), amount, { max: 4 });
  wallet.add(amount);
  updateUI();
}

function clearTable() {
  for (const c of dealer) t3.removeCard(c);
  hands.forEach(disposeHand);
  nameTags.forEach((t) => t.remove());
  nameTags = [];
  dealer = [];
  hands = [];
  world.dealerTotal.hide();
}

function newRound() {
  clearTable();
  phase = 'betting';
  busy = false;
  ready = false;
  waitingEcho = false;
  actQueue = [];
  hands = [makeHand()];
  placeHand(hands[0]);
  active = 0;
  bet = 0;
  setView();
  if (lastBet >= MIN_BET && wallet.balance >= lastBet) addBet(lastBet);
  updateUI();
  if (!room) return;
  if (room.isHost) checkStart(dealForced);
  else if (pendingRound) {
    const msg = pendingRound;
    pendingRound = null;
    startRound(msg);
  }
}

// A name under each friend's hands (and yours) so everyone knows whose cards are whose.
function tagOwners() {
  const owners = [...new Set(hands.map((h) => h.owner))];
  for (const o of owners) {
    const tag = t3.label(`bj-name${o.me ? ' me' : ''}`, () => {
      const first = hands.find((h) => h.owner === o);
      return first ? local(frameOf(first), 0, 2.25) : null;
    });
    tag.el.innerHTML = `<span class="av">${Arcade.character(o.look, { crop: 'head' })}</span>${esc(o.me ? 'You' : o.name)}`;
    nameTags.push(tag);
  }
}

// ---------- Dealing ----------
async function reshuffle(s, next = null) {
  fx.banner('Shuffling…', 'small', 1300);
  sound.shuffle();
  world.discard.reset();
  await world.shoe.shake();
  alive(s);
  shoe = next || cards.makeDeck(DECKS);
}

async function draw(h, s, sideways = false) {
  const card = shoe.pop();
  h.cards.push(card);
  if (sideways) h.sideways = h.cards.length - 1;
  await t3.dealCard(card, world.shoe.mouth, cardSlot(h, h.cards.length - 1));
  alive(s);
  setBadge(h.total, h.cards);
}

async function drawDealer(faceUp, s) {
  const card = shoe.pop();
  dealer.push(card);
  const n = dealer.length;
  await Promise.all([
    ...dealer.slice(0, -1).map((c, i) => t3.moveCard(c, dealerSlot(i, n), 300)),
    t3.dealCard(card, world.shoe.mouth, dealerSlot(n - 1, n), { faceUp }),
  ]);
  alive(s);
  setBadge(world.dealerTotal, visibleDealerCards());
}

async function revealHole(s) {
  const hole = dealer[1];
  if (hole && !hole.obj.faceUp) {
    await t3.flip(hole, true);
    alive(s);
  }
  setBadge(world.dealerTotal, dealer);
}

// The Deal button. With friends it's Ready: your bet goes to the host, which deals when everyone's in.
function deal() {
  if (phase !== 'betting' || bet < MIN_BET || ready) return;
  if (!room) { startRound(null); return; }
  ready = true;
  room.send({ t: 'bet', amount: bet });
  updateUI();
}

// Deal a round: just your hand, or (msg from the host) everyone's who's in.
async function startRound(msg) {
  const s = session;
  roundBusy = false;
  let next = null;
  if (msg) {
    roundNo = msg.n;
    next = msg.shoe.map(cardFrom);
    const meIn = msg.seats.some((p) => p.id === room.id);
    if (!meIn && bet) {
      // You weren't ready in time: your chips come back and you watch this one.
      wallet.add(bet);
      wallet.hold('blackjack', 0);
      bet = 0;
    }
    hands.forEach(disposeHand);
    hands = msg.seats.map((p) => {
      const mine = p.id === room.id;
      const h = makeHand(mine ? bet : p.bet, mine ? myOwner() : { id: p.id, name: p.name, look: p.look, me: false });
      return h;
    });
    hands.forEach((h) => { placeHand(h); h.stack.set(h.bet, { pop: false }); });
    tagOwners();
  } else {
    hands[0].bet = bet;
  }
  phase = 'dealing';
  ready = false;
  readyIds = [];
  dealAt = 0;
  if (bet) {
    lastBet = bet;
    store.set('casino.bj.lastBet', bet);
  }
  wallet.hold('blackjack', 0);
  bet = 0;
  updateUI();
  setView();
  try {
    if (msg && msg.reshuffled) await reshuffle(s, next);
    else if (next) shoe = next;
    else if (shoe.length < RESHUFFLE_AT) await reshuffle(s);
    for (const h of hands) await draw(h, s);
    await drawDealer(true, s);
    for (const h of hands) await draw(h, s);
    await drawDealer(false, s);

    const up = dealer[0];
    if (up.r === 14 || isTen(up)) {
      el.status.textContent = 'Dealer checks for blackjack…';
      await t3.peek(dealer[1]);
      alive(s);
      if (isBlackjack(dealer)) {
        for (const h of hands) {
          h.blackjack = isBlackjack(h.cards);
          h.done = true;
        }
        await dealerTurn(s);
        return;
      }
    }
    for (const h of hands) {
      if (!isBlackjack(h.cards)) continue;
      h.blackjack = true;
      h.done = true;
    }
    const first = hands.findIndex((h) => !h.done);
    if (first < 0) {
      await dealerTurn(s);
      return;
    }
    phase = 'player';
    active = first;
    updateUI();
    setView(600);
    onTurn();
    pumpActs();
  } catch (e) {
    if (e !== ABORT) throw e;
  }
}

// ---------- Player actions ----------
async function act(fn) {
  if (phase !== 'player' || busy) return;
  busy = true;
  updateUI();
  const s = session;
  try {
    await fn(s, hands[active]);
  } catch (e) {
    if (e !== ABORT) throw e;
    return;
  }
  busy = false;
  updateUI();
  onTurn();
  pumpActs();
}

// Your buttons. Alone, the move just happens. The host plays it and tells everyone; a guest sends
// it to the host and plays it when it comes back, in its place among everyone else's moves.
function choose(a) {
  const h = hands[active];
  if (phase !== 'player' || busy || waitingEcho || !h || !h.owner.me) return;
  if ((a === 'double' && !canDouble(h)) || (a === 'split' && !canSplit(h))) return;
  if (!room) { act(MOVES[a]); return; }
  if (room.isHost) {
    room.broadcast({ t: 'act', n: roundNo, hand: active, a });
    act(MOVES[a]);
    return;
  }
  waitingEcho = true;
  updateUI();
  room.send({ t: 'act', n: roundNo, hand: active, a });
}

// Moves from the room, played one at a time once this table is ready for them. The host checks
// each one is from the player whose hand is up before passing it on.
function pumpActs() {
  if (busy || phase !== 'player' || !actQueue.length) return;
  const m = actQueue.shift();
  const h = hands[active];
  if (m.n !== roundNo || m.hand !== active || !h || !MOVES[m.a] || (room.isHost && h.owner.id !== m.from)) {
    pumpActs();
    return;
  }
  if (room.isHost) {
    if ((m.a === 'double' && !canDouble(h)) || (m.a === 'split' && !canSplit(h))) m.a = 'stand';
    room.broadcast({ t: 'act', n: m.n, hand: m.hand, a: m.a });
  }
  if (h.owner.me) waitingEcho = false;
  act(MOVES[m.a]);
}

// The host stands a friend's hand for them if they leave or take too long.
function onTurn() {
  clearTimeout(turnTimer);
  if (!room || !room.isHost || phase !== 'player') return;
  const h = hands[active];
  if (!h || h.owner.me) return;
  const { id } = h.owner;
  const at = active;
  const n = roundNo;
  const standIn = () => {
    if (phase !== 'player' || active !== at || roundNo !== n) return;
    actQueue.push({ t: 'act', n, hand: at, a: 'stand', from: id });
    pumpActs();
  };
  if (!room.player(id)) standIn();
  else turnTimer = setTimeout(standIn, TURN_LIMIT);
}

async function bust(h, s) {
  h.busted = true;
  h.done = true;
  setTag(h, 'BUST', 'lose');
  sound.lose();
  const from = h.stack.top();
  h.stack.set(0);
  await t3.flyChips(from, world.rack.top, h.bet, { max: 4 });
  alive(s);
}

// Move on to the next unfinished hand, or to the dealer when all are done.
async function advance(s) {
  const next = hands.findIndex((h) => !h.done);
  if (next === -1) {
    await dealerTurn(s);
    return;
  }
  active = next;
  updateUI();
  setView(600);
  const h = hands[active];
  if (h.cards.length === 1) {
    await draw(h, s);
    if (splitAces(h) || handValue(h.cards).total === 21) {
      h.done = true;
      await advance(s);
    }
  }
}

const MOVES = {};

MOVES.hit = async (s, h) => {
  await draw(h, s);
  const { total } = handValue(h.cards);
  if (total > 21) {
    await bust(h, s);
    await advance(s);
  } else if (total === 21) {
    h.done = true;
    await advance(s);
  }
};

MOVES.stand = async (s, h) => {
  h.done = true;
  await advance(s);
};

MOVES.double = async (s, h) => {
  if (!canDouble(h)) return;
  if (h.owner.me) wallet.add(-h.bet);
  await t3.flyChips(chipHome(h), h.stack.top(), h.bet, { max: 4 });
  alive(s);
  h.bet *= 2;
  h.stack.set(h.bet);
  await draw(h, s, true);
  h.done = true;
  if (handValue(h.cards).total > 21) await bust(h, s);
  await advance(s);
};

MOVES.split = async (s, h) => {
  if (!canSplit(h)) return;
  if (h.owner.me) wallet.add(-h.bet);
  const from = spotPos(h);
  const nh = makeHand(h.bet, h.owner);
  nh.fromSplit = true;
  h.fromSplit = true;
  hands.splice(active + 1, 0, nh);
  nh.ring.setPos(from);
  nh.stack.moveTo(from, 0);
  nh.cards.push(h.cards.pop());
  setView(600);
  await layoutHands(420);
  alive(s);
  setBadge(h.total, h.cards);
  setBadge(nh.total, nh.cards);
  updateUI();
  await t3.flyChips(chipHome(h), nh.stack.top(), nh.bet, { max: 4 });
  alive(s);
  nh.stack.set(nh.bet);
  await draw(h, s);
  if (splitAces(h) || handValue(h.cards).total === 21) {
    h.done = true;
    await advance(s);
  }
};

// ---------- Dealer & settlement ----------
async function dealerTurn(s) {
  phase = 'dealer';
  updateUI();
  setView();
  await sleep(300);
  await revealHole(s);
  const needDraw = !isBlackjack(dealer) && hands.some((h) => !h.busted && !h.blackjack);
  while (needDraw && handValue(dealer).total < 17) {
    await sleep(450);
    alive(s);
    await drawDealer(true, s);
  }
  await settle(s);
}

function outcome(h, dealerTotal, dealerBJ) {
  if (h.busted) return { kind: 'lose', pay: 0, label: 'BUST' };
  const p = handValue(h.cards).total;
  if (h.blackjack && dealerBJ) return { kind: 'push', pay: h.bet, label: 'PUSH' };
  if (h.blackjack) return { kind: 'blackjack', pay: h.bet + Math.floor(h.bet * 1.5), label: 'BLACKJACK' };
  if (dealerBJ) return { kind: 'lose', pay: 0, label: 'LOSE' };
  if (dealerTotal > 21 || p > dealerTotal) return { kind: 'win', pay: h.bet * 2, label: 'WIN' };
  if (p === dealerTotal) return { kind: 'push', pay: h.bet, label: 'PUSH' };
  return { kind: 'lose', pay: 0, label: 'LOSE' };
}

async function settle(s) {
  phase = 'settle';
  updateUI();
  const d = handValue(dealer).total;
  const dealerBJ = isBlackjack(dealer);
  const results = hands.map((h) => ({ h, ...outcome(h, d, dealerBJ) }));
  // Every hand is settled on the felt, but only yours pay into your balance.
  const mine = results.filter((r) => r.h.owner.me);
  const staked = mine.reduce((a, r) => a + r.h.bet, 0);
  const returned = mine.reduce((a, r) => a + r.pay, 0);
  const net = returned - staked;
  pendingPayout = returned;

  for (const r of results) {
    if (r.h.busted) continue;
    const profit = r.pay - r.h.bet;
    setTag(r.h, profit > 0 ? `${r.label} +${fmt(profit)}` : r.label, r.kind);
    if (profit > 0) {
      await t3.flyChips(world.rack.top, r.h.stack.top(), profit, { max: 5 });
      alive(s);
      r.h.stack.set(r.pay);
    } else if (r.kind === 'lose') {
      const from = r.h.stack.top();
      r.h.stack.set(0);
      await t3.flyChips(from, world.rack.top, r.h.bet, { max: 4 });
      alive(s);
    }
    await sleep(160);
  }
  for (const r of mine) Arcade.record('bj.hand', { result: r.kind, friends: room ? room.players.length - 1 : 0 });

  if (!mine.length) {
    // Watching this round: nothing of yours to celebrate.
  } else if (mine.some((r) => r.kind === 'blackjack')) {
    fx.banner(`Blackjack!<small>+${fmt(net)}</small>`, 'win', 2000);
    sound.bigWin();
    fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.55, 160);
  } else if (net > 0) {
    fx.banner(`You win<small>+${fmt(net)}</small>`, 'win');
    sound.win();
    fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.6, net >= 500 ? 160 : 70);
  } else if (net === 0 && returned > 0) {
    fx.banner('Push', 'small');
  } else if (mine.every((r) => r.h.busted)) {
    fx.banner('Bust', 'lose small');
  } else {
    fx.banner(dealerBJ ? 'Dealer blackjack' : 'Dealer wins', 'lose small');
    sound.lose();
  }

  await sleep(800);
  alive(s);
  const paid = results.filter((r) => r.pay > 0);
  const tops = paid.map((r) => r.h.stack.top());
  const homes = paid.map((r) => chipHome(r.h));
  paid.forEach((r) => r.h.stack.set(0));
  await Promise.all(paid.map((r, i) => t3.flyChips(tops[i], homes[i], r.pay, { max: 5 })));
  alive(s);
  wallet.add(returned);
  pendingPayout = 0;
  if (net > 0) fx.floatText(el.balance, `+${fmt(net)}`, 'win');
  await sleep(900);
  alive(s);

  world.dealerTotal.hide();
  hands.forEach((h) => { h.total.hide(); h.tag.hide(); });
  const all = [...dealer, ...hands.flatMap((h) => h.cards)];
  await t3.sweep(all, () => world.discard.top(), () => world.discard.add(1));
  alive(s);
  newRound();
}

// ---------- Room messages ----------
function onRoomMessage(msg, from) {
  if (!room || !msg || typeof msg !== 'object') return;
  if (!room.isHost) {
    if (msg.t === 'round') {
      if (phase === 'betting') startRound(msg);
      else pendingRound = msg;
    } else if (msg.t === 'act') {
      actQueue.push(msg);
      pumpActs();
    } else if (msg.t === 'ready') {
      applyReady(msg);
    } else if (msg.t === 'busy') {
      roundBusy = true;
      updateUI();
    }
    return;
  }
  if (msg.t === 'bet') {
    const amount = Math.round(Number(msg.amount) || 0);
    if (amount < MIN_BET || amount > MAX_BET) return;
    hostBets.set(from, amount);
    if (!dealTimer) {
      dealAt = Date.now() + BET_WAIT;
      dealTimer = setTimeout(() => {
        dealTimer = 0;
        dealForced = true;
        checkStart(true);
      }, BET_WAIT);
    }
    shareReady();
    checkStart(false);
  } else if (msg.t === 'act') {
    actQueue.push({ ...msg, from });
    pumpActs();
  }
}

// Host: tell everyone who's ready and how long until the deal.
function shareReady() {
  const msg = { t: 'ready', ids: [...hostBets.keys()], ms: dealTimer ? Math.max(0, dealAt - Date.now()) : 0 };
  room.broadcast(msg);
  applyReady(msg);
}

function applyReady(msg) {
  readyIds = msg.ids;
  dealAt = msg.ms ? Date.now() + msg.ms : 0;
  if (phase === 'betting') updateUI();
}

// Host: deal once everyone in the room is ready, or (force) whoever is ready when time runs out.
function checkStart(force) {
  if (!room || !room.isHost || phase !== 'betting') return;
  const seats = room.players.filter((p) => hostBets.has(p.id));
  if (!seats.length || (!force && seats.length < room.players.length)) return;
  const reshuffled = shoe.length < RESHUFFLE_AT;
  const msg = {
    t: 'round',
    n: roundNo + 1,
    seats: seats.map((p) => ({ id: p.id, name: p.name, look: p.look, bet: hostBets.get(p.id) })),
    shoe: (reshuffled ? cards.makeDeck(DECKS) : shoe).map(cardCode),
    reshuffled,
  };
  hostBets.clear();
  clearTimeout(dealTimer);
  dealTimer = 0;
  dealForced = false;
  room.broadcast(msg);
  startRound(msg);
}

function joinRoom(r) {
  room = r;
  actQueue = [];
  hostBets = new Map();
  readyIds = [];
  dealAt = 0;
  pendingRound = null;
  roundBusy = false;
  dealForced = false;
  waitingEcho = false;
  ready = false;
  clearTimeout(dealTimer);
  dealTimer = 0;
  clearTimeout(turnTimer);
  clearInterval(ticker);
  if (!r) return;
  r.on('message', onRoomMessage);
  r.on('players', () => { if (r === room && phase === 'betting') updateUI(); });
  if (r.isHost) {
    r.on('join', (p) => {
      if (r !== room) return;
      if (phase !== 'betting') r.sendTo(p.id, { t: 'busy' });
      shareReady();
    });
    r.on('leave', (p) => {
      if (r !== room) return;
      hostBets.delete(p.id);
      shareReady();
      onTurn();
      checkStart(dealForced);
    });
  }
  ticker = setInterval(() => { if (phase === 'betting' && dealAt) updateUI(); }, 1000);
}

// ---------- Wiring ----------
TRAY.forEach((v) => {
  const b = document.createElement('button');
  b.className = `chip chip-${v}`;
  b.dataset.v = v;
  b.innerHTML = chips.chipEl(v).innerHTML;
  b.setAttribute('aria-label', `Add ${fmt(v)}`);
  b.addEventListener('click', () => addBet(v, b));
  el.tray.append(b);
});
el.clear.addEventListener('click', clearBet);
el.doubleBet.addEventListener('click', () => addBet(bet, el.doubleBet));
el.deal.addEventListener('click', deal);
el.hit.addEventListener('click', () => choose('hit'));
el.stand.addEventListener('click', () => choose('stand'));
el.double.addEventListener('click', () => choose('double'));
el.split.addEventListener('click', () => choose('split'));
$('#bj-refill').addEventListener('click', () => {
  wallet.refill();
  updateUI();
});

Casino.register('blackjack', {
  enter() {
    session++;
    if (!t3) buildTable();
    t3.setActive(true);
    joinRoom(Casino.room && Casino.room.game === 'blackjack' ? Casino.room : null);
    if (!shoe.length) shoe = cards.makeDeck(DECKS);
    newRound();
  },
  leave(force) {
    const inHand = ['dealing', 'player', 'dealer'].includes(phase) && myHands().length > 0;
    if (!force && inHand) return 'You\'re in the middle of a hand. Your bet on it will be lost.';
    session++;
    if (phase === 'betting' && bet) wallet.add(bet);
    if (pendingPayout) wallet.add(pendingPayout);
    bet = 0;
    pendingPayout = 0;
    wallet.hold('blackjack', 0);
    joinRoom(null);
    phase = 'idle';
    if (t3) t3.setActive(false);
    return true;
  },
  key(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (phase === 'betting' && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      deal();
    } else if (phase === 'player') {
      if (k === 'h') choose('hit');
      else if (k === 's') choose('stand');
      else if (k === 'd') choose('double');
      else if (k === 'p') choose('split');
    }
  },
});
})();
