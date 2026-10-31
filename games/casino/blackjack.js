(() => {
'use strict';

const { $, sleep, fmt, store, wallet, sound, ABORT, cards, chips, fx } = Casino;

const DECKS = 6;
const RESHUFFLE_AT = 52 * DECKS * 0.25;
const MIN_BET = 5;
const MAX_BET = 5000;
const MAX_HANDS = 4;
const TRAY = [5, 25, 100, 500, 1000];

const el = {
  shoe: $('#bj-shoe'), meter: $('#bj-shoe-meter'), discard: $('#bj-discard'), bank: $('#bj-bank'),
  dealerHand: $('#bj-dealer-hand'), dealerTotal: $('#bj-dealer-total'), hands: $('#bj-hands'),
  status: $('#bj-status'), betRow: $('#bj-bet-row'), playRow: $('#bj-play-row'), tray: $('#bj-tray'),
  clear: $('#bj-clear'), doubleBet: $('#bj-double-bet'), deal: $('#bj-deal'),
  hit: $('#bj-hit'), stand: $('#bj-stand'), double: $('#bj-double'), split: $('#bj-split'),
  broke: $('#bj-broke'), balance: $('#balance'),
};

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
const canDouble = (h) => h.cards.length === 2 && !h.done && !splitAces(h) && wallet.balance >= h.bet;
const canSplit = (h) => h.cards.length === 2 && !splitAces(h) && hands.length < MAX_HANDS
  && cardValue(h.cards[0]) === cardValue(h.cards[1]) && wallet.balance >= h.bet;

function makeHand(amount = 0) {
  const wrap = document.createElement('div');
  wrap.className = 'bj-hand';
  wrap.innerHTML = `
    <div class="result-tag"></div>
    <div class="hand-wrap"><div class="hand fan"></div><div class="total-badge" hidden></div></div>
    <div class="bet-spot"><div class="stack empty"></div></div>`;
  return {
    cards: [], bet: amount, done: false, busted: false, fromSplit: false, blackjack: false,
    wrap,
    cardsEl: wrap.querySelector('.hand'),
    totalEl: wrap.querySelector('.total-badge'),
    spotEl: wrap.querySelector('.bet-spot'),
    stackEl: wrap.querySelector('.stack'),
    tagEl: wrap.querySelector('.result-tag'),
  };
}

function setBadge(badge, list) {
  if (!list.length) { badge.hidden = true; return; }
  const { total, soft } = handValue(list);
  const text = soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  badge.hidden = false;
  if (badge.textContent !== text) {
    badge.textContent = text;
    badge.classList.remove('pop');
    void badge.offsetWidth;
    badge.classList.add('pop');
  }
  badge.classList.toggle('bust', total > 21);
  badge.classList.toggle('twentyone', total === 21);
}

const visibleDealerCards = () => dealer.filter((c) => !c.el.classList.contains('face-down'));

function setTag(h, text, kind) {
  h.tagEl.className = `result-tag ${kind}`;
  h.tagEl.textContent = text;
}

function updateMeter() {
  el.meter.style.width = `${(shoe.length / (52 * DECKS)) * 100}%`;
}

function focusHands() {
  hands.forEach((h, i) => h.wrap.classList.toggle('active', phase === 'player' && i === active));
}

function updateUI() {
  const betting = phase === 'betting';
  el.betRow.hidden = !betting;
  el.playRow.hidden = betting || phase === 'idle';
  for (const b of el.tray.children) {
    const v = Number(b.dataset.v);
    b.disabled = !betting || v > wallet.balance || bet + v > MAX_BET;
  }
  el.clear.disabled = !betting || !bet;
  el.doubleBet.disabled = !betting || !bet || wallet.balance < bet || bet * 2 > MAX_BET;
  el.deal.disabled = !betting || bet < MIN_BET;

  const h = hands[active];
  const playing = phase === 'player' && !busy && h;
  el.hit.disabled = !playing;
  el.stand.disabled = !playing;
  el.double.disabled = !playing || !canDouble(h);
  el.split.disabled = !playing || !canSplit(h);
  el.broke.hidden = !(betting && bet === 0 && wallet.balance < MIN_BET);

  let status = '';
  if (betting) status = bet < MIN_BET ? 'Tap a chip to place your bet' : `Bet <b>${fmt(bet)}</b> · ready to deal`;
  else if (phase === 'dealing') status = 'Dealing…';
  else if (phase === 'player') status = hands.length > 1 ? `Hand <b>${active + 1}</b> of ${hands.length}: hit or stand?` : 'Hit or stand?';
  else if (phase === 'dealer') status = 'Dealer plays…';
  el.status.innerHTML = status;
  focusHands();
}

// ---------- Betting ----------
function addBet(amount, fromEl) {
  if (phase !== 'betting') return;
  amount = Math.min(amount, MAX_BET - bet, wallet.balance);
  if (amount <= 0) return;
  wallet.add(-amount);
  bet += amount;
  wallet.hold('blackjack', bet);
  const h = hands[0];
  const s = session;
  if (fromEl) {
    chips.fly(fromEl, h.spotEl, amount, { max: 3, dur: 420 }).then(() => {
      if (s === session && phase === 'betting') chips.renderStack(h.stackEl, bet);
    });
  } else {
    chips.renderStack(h.stackEl, bet);
  }
  updateUI();
}

function clearBet() {
  if (phase !== 'betting' || !bet) return;
  const amount = bet;
  bet = 0;
  wallet.hold('blackjack', 0);
  chips.renderStack(hands[0].stackEl, 0);
  chips.fly(hands[0].spotEl, el.balance, amount, { max: 4 });
  wallet.add(amount);
  updateUI();
}

function newRound() {
  phase = 'betting';
  busy = false;
  dealer = [];
  el.dealerHand.innerHTML = '';
  el.dealerTotal.hidden = true;
  hands = [makeHand()];
  active = 0;
  el.hands.innerHTML = '';
  el.hands.classList.remove('split');
  el.hands.append(hands[0].wrap);
  bet = 0;
  if (lastBet >= MIN_BET && wallet.balance >= lastBet) addBet(lastBet);
  updateUI();
}

// ---------- Dealing ----------
async function reshuffle(s) {
  fx.banner('Shuffling…', 'small', 1300);
  el.shoe.classList.add('shuffling');
  sound.shuffle();
  await sleep(1100);
  alive(s);
  el.shoe.classList.remove('shuffling');
  shoe = cards.makeDeck(DECKS);
  updateMeter();
}

async function draw(h, s, sideways = false) {
  const card = shoe.pop();
  h.cards.push(card);
  updateMeter();
  await cards.deal(card, h.cardsEl, { from: el.shoe, sideways });
  alive(s);
  setBadge(h.totalEl, h.cards);
}

async function drawDealer(faceUp, s) {
  const card = shoe.pop();
  dealer.push(card);
  updateMeter();
  await cards.deal(card, el.dealerHand, { from: el.shoe, faceUp });
  alive(s);
  setBadge(el.dealerTotal, visibleDealerCards());
}

async function revealHole(s) {
  const hole = dealer[1];
  if (hole && hole.el.classList.contains('face-down')) {
    await cards.flip(hole.el, true);
    alive(s);
  }
  setBadge(el.dealerTotal, dealer);
}

async function deal() {
  if (phase !== 'betting' || bet < MIN_BET) return;
  const s = session;
  phase = 'dealing';
  lastBet = bet;
  store.set('casino.bj.lastBet', bet);
  wallet.hold('blackjack', 0);
  const h = hands[0];
  h.bet = bet;
  bet = 0;
  updateUI();
  try {
    if (shoe.length < RESHUFFLE_AT) await reshuffle(s);
    await draw(h, s);
    await drawDealer(true, s);
    await draw(h, s);
    await drawDealer(false, s);

    const up = dealer[0];
    if (up.r === 14 || isTen(up)) {
      el.status.textContent = 'Dealer checks for blackjack…';
      const hole = dealer[1].el;
      hole.classList.add('peek');
      await sleep(750);
      alive(s);
      hole.classList.remove('peek');
      if (isBlackjack(dealer)) {
        h.blackjack = isBlackjack(h.cards);
        h.done = true;
        await dealerTurn(s);
        return;
      }
    }
    if (isBlackjack(h.cards)) {
      h.blackjack = true;
      h.done = true;
      await dealerTurn(s);
      return;
    }
    phase = 'player';
    active = 0;
    updateUI();
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
}

async function bust(h, s) {
  h.busted = true;
  h.done = true;
  setTag(h, 'BUST', 'lose');
  sound.lose();
  chips.renderStack(h.stackEl, 0);
  await chips.fly(h.spotEl, el.bank, h.bet, { max: 4 });
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
  const h = hands[active];
  if (h.cards.length === 1) {
    await draw(h, s);
    if (splitAces(h) || handValue(h.cards).total === 21) {
      h.done = true;
      await advance(s);
    }
  }
}

const hit = () => act(async (s, h) => {
  await draw(h, s);
  const { total } = handValue(h.cards);
  if (total > 21) {
    await bust(h, s);
    await advance(s);
  } else if (total === 21) {
    h.done = true;
    await advance(s);
  }
});

const stand = () => act(async (s, h) => {
  h.done = true;
  await advance(s);
});

const doubleDown = () => act(async (s, h) => {
  if (!canDouble(h)) return;
  wallet.add(-h.bet);
  await chips.fly(el.balance, h.spotEl, h.bet, { max: 4 });
  alive(s);
  h.bet *= 2;
  chips.renderStack(h.stackEl, h.bet);
  await draw(h, s, true);
  h.done = true;
  if (handValue(h.cards).total > 21) await bust(h, s);
  await advance(s);
});

const split = () => act(async (s, h) => {
  if (!canSplit(h)) return;
  wallet.add(-h.bet);
  const nh = makeHand(h.bet);
  nh.fromSplit = true;
  h.fromSplit = true;
  hands.splice(active + 1, 0, nh);
  const moving = h.cards.pop();
  nh.cards.push(moving);
  el.hands.classList.add('split');
  fx.flipLayout([...el.hands.children, moving.el], () => {
    h.wrap.after(nh.wrap);
    nh.cardsEl.append(moving.el);
  }, 420);
  setBadge(h.totalEl, h.cards);
  setBadge(nh.totalEl, nh.cards);
  updateUI();
  await chips.fly(el.balance, nh.spotEl, nh.bet, { max: 4 });
  alive(s);
  chips.renderStack(nh.stackEl, nh.bet);
  await draw(h, s);
  if (splitAces(h) || handValue(h.cards).total === 21) {
    h.done = true;
    await advance(s);
  }
});

// ---------- Dealer & settlement ----------
async function dealerTurn(s) {
  phase = 'dealer';
  updateUI();
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
  const staked = results.reduce((a, r) => a + r.h.bet, 0);
  const returned = results.reduce((a, r) => a + r.pay, 0);
  const net = returned - staked;
  pendingPayout = returned;

  for (const r of results) {
    if (r.h.busted) continue;
    const profit = r.pay - r.h.bet;
    setTag(r.h, profit > 0 ? `${r.label} +${fmt(profit)}` : r.label, r.kind);
    if (profit > 0) {
      await chips.fly(el.bank, r.h.spotEl, profit, { max: 5 });
      alive(s);
      chips.renderStack(r.h.stackEl, r.pay);
    } else if (r.kind === 'lose') {
      chips.renderStack(r.h.stackEl, 0);
      await chips.fly(r.h.spotEl, el.bank, r.h.bet, { max: 4 });
      alive(s);
    }
    await sleep(160);
  }

  if (results.some((r) => r.kind === 'blackjack')) {
    fx.banner(`Blackjack!<small>+${fmt(net)}</small>`, 'win', 2000);
    sound.bigWin();
    fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.55, 160);
  } else if (net > 0) {
    fx.banner(`You win<small>+${fmt(net)}</small>`, 'win');
    sound.win();
    fx.confetti.burst(window.innerWidth / 2, window.innerHeight * 0.6, net >= 500 ? 160 : 70);
  } else if (net === 0 && returned > 0) {
    fx.banner('Push', 'small');
  } else if (results.every((r) => r.h.busted)) {
    fx.banner('Bust', 'lose small');
  } else {
    fx.banner(dealerBJ ? 'Dealer blackjack' : 'Dealer wins', 'lose small');
    sound.lose();
  }

  await sleep(800);
  alive(s);
  const paid = results.filter((r) => r.pay > 0);
  paid.forEach((r) => chips.renderStack(r.h.stackEl, 0));
  await Promise.all(paid.map((r) => chips.fly(r.h.spotEl, el.balance, r.pay, { max: 5 })));
  alive(s);
  wallet.add(returned);
  pendingPayout = 0;
  if (net > 0) fx.floatText(el.balance, `+${fmt(net)}`, 'win');
  await sleep(900);
  alive(s);

  const els = [...el.dealerHand.children, ...hands.flatMap((h) => [...h.cardsEl.children])];
  el.dealerTotal.hidden = true;
  hands.forEach((h) => { h.totalEl.hidden = true; h.tagEl.textContent = ''; });
  await cards.sweep(els, el.discard);
  alive(s);
  newRound();
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
el.hit.addEventListener('click', hit);
el.stand.addEventListener('click', stand);
el.double.addEventListener('click', doubleDown);
el.split.addEventListener('click', split);
$('#bj-refill').addEventListener('click', () => {
  wallet.refill();
  updateUI();
});

Casino.register('blackjack', {
  enter() {
    session++;
    if (!shoe.length) shoe = cards.makeDeck(DECKS);
    updateMeter();
    newRound();
  },
  leave(force) {
    if (!force && ['dealing', 'player', 'dealer'].includes(phase)) return 'You\'re in the middle of a hand. Your bet on it will be lost.';
    session++;
    if (phase === 'betting' && bet) wallet.add(bet);
    if (pendingPayout) wallet.add(pendingPayout);
    bet = 0;
    pendingPayout = 0;
    wallet.hold('blackjack', 0);
    phase = 'idle';
    return true;
  },
  key(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (phase === 'betting' && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      deal();
    } else if (phase === 'player') {
      if (k === 'h') hit();
      else if (k === 's') stand();
      else if (k === 'd') doubleDown();
      else if (k === 'p') split();
    }
  },
});
})();
