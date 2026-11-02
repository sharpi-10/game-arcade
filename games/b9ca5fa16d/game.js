(() => {
'use strict';

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const suffix = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const formatTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// ---------- Tunables ----------
const RACE = 500;              // metres
const LANES = 6;
const LANE_W = 5;              // metres per lane
const WATER_HALF = LANES / 2 * LANE_W + 1.4;
const BOAT_LEN = 8;
const DRIVE = 0.34;            // seconds the blade is in the water
// The stroke meter: how far through the recovery you pull, as a share of the full recovery.
// The needle runs to METER_END; past that the rhythm is lost. Each zone value is where that
// zone ends: crab, then rushed, then the green sweet spot, then late.
const METER_END = 1.3;
const START_ZONE = { crab: 0.5, rushed: 0.82, sweet: 1.08 };
const SWEET = 0.26;            // width of the green zone
const OK_BEFORE = 0.3;         // width of the yellow zone before it
const MAX_COMBO = 10;
const MULT = { perfect: 1, rushed: 0.7, late: 0.8, ready: 0.85 };
const START_WINDOW = 0.3;      // pull this soon after GO for a perfect start
const DRAG_LIN = 0.25;
const DRAG_SQ = 0.02;
const SPRINT_BOOST = 1.32;
const TIRED_PULL = 0.7;
const SPRINT_COST = 10;
const STROKE_REST = 2;
const REST_RATE = 4;
const TIRED_UNTIL = 35;
const NET_RATE = 0.08;
// Perfect strokes speed the rhythm up as well as pushing harder.
const recovery = (combo) => 0.95 - combo * 0.04;
const power = (combo) => 3.5 + combo * 0.13;
// After every stroke the green zone jumps somewhere new, so you have to watch the needle
// rather than row to a beat.
function newZone() {
  const mid = rand(0.6, METER_END - SWEET / 2 - 0.05);
  return { crab: Math.max(0.15, mid - SWEET / 2 - OK_BEFORE), rushed: mid - SWEET / 2, sweet: mid + SWEET / 2 };
}
const zoneMid = (z) => (z.rushed + z.sweet) / 2;

// bias: how far from the middle of the green zone the computer aims; wobble: how much it misses by.
const DIFFICULTIES = {
  easy: { label: 'Easy', bias: -0.09, wobble: 0.2, react: 2, sprint: [30, 70] },
  normal: { label: 'Normal', bias: -0.02, wobble: 0.13, react: 1.3, sprint: [80, 130] },
  hard: { label: 'Hard', bias: 0.01, wobble: 0.09, react: 1, sprint: [120, 170] },
};
const BOAT_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];
const CPU_NAMES = ['Paddles', 'Splash', 'Skipper', 'Puddle', 'Rowan', 'Marina'];
const CPU_LOOKS = [
  { skin: 'caramel', hair: 'curly', hairColor: 'black', eyes: 'happy', mouth: 'grin', hat: 'cap' },
  { skin: 'porcelain', hair: 'long', hairColor: 'ginger', eyes: 'normal', mouth: 'smile', hat: 'none' },
  { skin: 'cocoa', hair: 'buzz', hairColor: 'black', eyes: 'angry', mouth: 'smirk', hat: 'none', glasses: 'round' },
  { skin: 'honey', hair: 'bun', hairColor: 'brown', eyes: 'wink', mouth: 'smile', hat: 'beanie' },
  { skin: 'peach', hair: 'spiky', hairColor: 'blonde', eyes: 'normal', mouth: 'grin', hat: 'none' },
  { skin: 'espresso', hair: 'short', hairColor: 'silver', eyes: 'sleepy', mouth: 'smile', hat: 'cap' },
].map((l) => ({ glasses: 'none', outfit: 'tee', color: 'sapphire', title: 'rookie', ...l }));
// People row in the middle lanes; CPU boats fill the rest.
const LANE_ORDER = [2, 3, 1, 4, 0, 5];

const settings = {
  difficulty: DIFFICULTIES[store.get('rowing.difficulty', 'normal')] ? store.get('rowing.difficulty', 'normal') : 'normal',
};

function paintHex(look = Arcade.player.look, mine = true) {
  const id = look.boatPaint || 'white';
  const item = (!mine || Arcade.owns('boatPaint', id)) && Arcade.item('boatPaint', id);
  return (item && item.swatch) || '#f2f3f7';
}

// ---------- Audio ----------
const audio = {
  ctx: null,
  muted: store.get('rowing.muted', false),
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    // A soft wash of water under everything, a little louder at speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.water = ctx.createGain();
    this.water.gain.value = 0;
    src.connect(lp).connect(this.water).connect(this.master);
    src.start();
  },
  ambience(speed, on) {
    if (!this.ctx) return;
    this.water.gain.setTargetAtTime(on ? 0.05 + speed * 0.008 : 0.03, this.ctx.currentTime, 0.2);
  },
  tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.2, freq = 1200, type = 'lowpass') {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.min(1, k * 12) * (1 - k);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  },
  setMuted(m) {
    this.muted = m;
    store.set('rowing.muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },
};

// ---------- Boats ----------
let boats = [];
let player = null;
let puddles = [];   // rings left where blades went in, fixed to the water
let spray = [];     // droplets thrown up by the blades
let state = 'menu'; // menu | countdown | racing
let raceDiff = settings.difficulty;
let raceTime = 0;
let countdown = 0;
let lastCount = 0;
let paused = false;
let pauseShown = false;
let resultsTimer = 0;
let resultsRefresh = 0;
let clock = 0;
let order = [];
let callouts = new Set();

function newBoat({ name, color, look, lane, isPlayer = false, human = false, peer = null }) {
  const b = { name, color, look, lane, isPlayer, human, peer };
  resetBoat(b);
  return b;
}

function resetBoat(b) {
  Object.assign(b, {
    d: 0, v: 0, combo: 0, maxCombo: 0, perfects: 0, strokes: 0, crabs: 0,
    stamina: 100, tired: false, sprint: false,
    drive: 0, push: 0, rec: recovery(0), recT: 0, ready: true, crabT: 0, zone: { ...START_ZONE },
    oar: -1, pulledAt: 0, finished: false, finishTime: 0, finishPlace: 0,
    aiTarget: 1, aiWait: 0, sprintFrom: 0, wobble: 1,
    net: null, raw: null, wasInWater: false, said: null,
  });
}

const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_W;
const inWater = (b) => b.drive > 0;

// One pull on the oars. Too soon and the blade digs in ("catching a crab"); in the green zone
// it's perfect and the combo grows; a bit early or late still works, just not as well.
function pull(b, sprintHeld) {
  if (b.finished || b.drive > 0 || b.crabT > 0) return null;
  const p = b.recT / b.rec;
  b.pulledAt = b.ready ? 1 : Math.min(1, p / METER_END);
  let q;
  if (b.ready) q = b.strokes === 0 && raceTime < START_WINDOW ? 'perfect' : 'ready';
  else if (p < b.zone.crab) q = 'crab';
  else if (p < b.zone.rushed) q = 'rushed';
  else if (p <= b.zone.sweet) q = 'perfect';
  else q = 'late';
  if (q === 'crab') {
    b.v *= 0.75;
    b.combo = 0;
    b.crabs++;
    b.crabT = 0.6;
    splashAt(b, 2.2, true);
    return q;
  }
  if (q === 'perfect') { b.combo = Math.min(MAX_COMBO, b.combo + 1); b.perfects++; }
  else if (q === 'rushed') b.combo = Math.max(0, b.combo - 2);
  else if (q === 'late') b.combo = Math.max(0, b.combo - 1);
  b.maxCombo = Math.max(b.maxCombo, b.combo);
  const sprint = sprintHeld && !b.tired && b.stamina > 0;
  b.sprint = sprint;
  if (sprint) {
    b.stamina -= SPRINT_COST;
    if (b.stamina <= 0) { b.stamina = 0; b.tired = true; b.said = 'tired'; }
  } else {
    b.stamina = Math.min(100, b.stamina + STROKE_REST);
  }
  const j = power(b.combo) * MULT[q] * (sprint ? SPRINT_BOOST : b.tired ? TIRED_PULL : 1);
  b.push = j / DRIVE;
  b.drive = DRIVE;
  b.ready = false;
  b.strokes++;
  b.zone = newZone();
  return q;
}

function stepBoat(b, dt) {
  if (b.drive > 0) {
    b.v += b.push * Math.min(dt, b.drive);
    b.drive -= dt;
    b.oar = 1 - 2 * Math.max(0, b.drive) / DRIVE;
    if (b.drive <= 0) {
      b.rec = recovery(b.combo);
      b.recT = -b.drive;
      b.drive = 0;
      b.sprint = false;
    }
  } else if (!b.ready) {
    b.recT += dt;
    const p = b.recT / b.rec;
    const e = Math.min(1, p);
    b.oar = 1 - 2 * e * e * (3 - 2 * e);
    // Waited too long: the boat runs on, but the rhythm is gone.
    if (p > METER_END) {
      b.ready = true;
      if (b.combo > 0) { b.combo = 0; b.said = 'lost'; }
    }
  }
  b.crabT = Math.max(0, b.crabT - dt);
  b.v = Math.max(0, b.v - (DRAG_LIN * b.v + DRAG_SQ * b.v * b.v) * dt);
  if (b.drive <= 0) b.stamina = Math.min(100, b.stamina + REST_RATE * dt);
  if (b.tired && b.stamina >= TIRED_UNTIL) b.tired = false;
  b.d += b.v * dt;
}

// The computer aims for the green zone with a wobble set by the difficulty, and sprints home.
function aiPlan(b) {
  const diff = DIFFICULTIES[raceDiff];
  b.aiTarget = Math.max(b.zone.crab + 0.03, zoneMid(b.zone) + diff.bias + gauss() * diff.wobble * b.wobble);
}

function aiStep(b) {
  if (b.finished || b.drive > 0 || b.crabT > 0) return;
  const go = b.ready ? raceTime >= b.aiWait : b.recT / b.rec >= b.aiTarget;
  if (!go) return;
  const sprint = RACE - b.d < b.sprintFrom;
  if (pull(b, sprint)) aiPlan(b);
}

// Rings on the water where the blades go in, and a little spray thrown up.
function splashAt(b, size = 1, crab = false) {
  const y = b.d - BOAT_LEN / 2 - 1.8;
  for (const side of [-1, 1]) {
    const x = laneX(b.lane) + side * 2.9;
    puddles.push({ d: y, x, age: 0, size, crab });
    for (let i = 0; i < 4 * size; i++) {
      spray.push({ d: y, x, vd: rand(-1.5, 2.5) + b.v * 0.6, vx: side * rand(0.5, 2.5) * size, age: 0, life: rand(0.3, 0.55) });
    }
  }
}

// ---------- Multiplayer ----------
let room = null;
let raceId = 0;
let netTimer = 0;
let waitingForRace = false;

const boatByLane = (lane) => boats.find((b) => b.lane === lane);
const boatByPeer = (id) => boats.find((b) => b.human && b.peer === id);
const isGuest = () => !!room && !room.isHost;
const r2 = (v) => Math.round(v * 100) / 100;

function soloLineup() {
  return [{ id: room ? room.id : null, name: Arcade.player.name, look: Arcade.player.look }];
}
const roomLineup = () => (room ? room.players.map(({ id, name, look }) => ({ id, name, look })) : soloLineup());

function packBoat(b) {
  if (!b.owned) return b.raw || null;
  const flags = (b.finished ? 1 : 0) | (inWater(b) ? 2 : 0) | (b.sprint ? 4 : 0) | (b.crabT > 0 ? 8 : 0);
  return [b.lane, r2(b.d), r2(b.v), r2(b.oar), b.combo, flags, r2(b.finishTime)];
}

function unpackBoat(a, from = null) {
  const b = Array.isArray(a) && boatByLane(a[0]);
  if (!b || b.owned) return;
  if (from && b.peer !== from) return; // a guest may only move their own boat
  const [, d, v, oar, combo, flags, finishTime] = a;
  b.raw = a;
  b.net = { d, v, oar, at: performance.now() };
  const water = (flags & 2) > 0;
  if (water && !b.wasInWater) splashAt(b, flags & 4 ? 1.5 : 1);
  if (flags & 8 && b.crabT <= 0) { b.crabT = 0.6; splashAt(b, 2.2, true); }
  b.wasInWater = water;
  Object.assign(b, { combo, finishTime, finished: (flags & 1) > 0, sprint: (flags & 4) > 0 });
}

// Someone else's boat: glide towards where it was last seen, carried forward by its speed.
function updateRemote(b, dt) {
  const n = b.net;
  b.crabT = Math.max(0, b.crabT - dt);
  if (!n) return;
  const age = Math.min(0.3, (performance.now() - n.at) / 1000);
  const target = n.d + n.v * age;
  if (Math.abs(target - b.d) > 15) b.d = target;
  else b.d += (target - b.d) * (1 - Math.exp(-dt * 10));
  b.v = n.v;
  b.oar += (n.oar - b.oar) * (1 - Math.exp(-dt * 18));
}

// A boat whose rower left keeps going under computer control.
function takeOver(b) {
  if (!b || b.owned) return;
  Object.assign(b, { owned: true, auto: true, human: false, net: null, raw: null });
  b.drive = 0;
  b.ready = false;
  b.recT = 0;
  b.rec = recovery(b.combo);
  b.sprintFrom = rand(...DIFFICULTIES[raceDiff].sprint);
  aiPlan(b);
}

function sendState(dt) {
  netTimer -= dt;
  if (!room || netTimer > 0) return;
  netTimer = NET_RATE;
  if (room.isHost) room.broadcast({ t: 'snap', r: raceId, b: boats.map(packBoat).filter(Boolean) });
  else room.send({ t: 'st', r: raceId, b: packBoat(player) });
}

function onNetMessage(msg, from) {
  if (!msg) return;
  if (msg.t === 'start') {
    if (!isGuest()) return;
    if (!msg.lineup.some((p) => p.id === room.id)) { waitingForRace = true; return; }
    raceId = msg.r;
    waitingForRace = false;
    startRace({ lineup: msg.lineup, difficulty: msg.difficulty });
    return;
  }
  if (msg.t === 'busy') { waitingForRace = true; if (state === 'menu') renderMenu(); return; }
  if (msg.r !== raceId || state === 'menu') return;
  if (msg.t === 'end') { if (isGuest()) toMenu({ quiet: true }); return; }
  if (msg.t === 'snap') { if (isGuest()) msg.b.forEach((a) => unpackBoat(a)); return; }
  if (msg.t === 'st') { if (room.isHost) unpackBoat(msg.b, from); return; }
  if (msg.t === 'quit') { if (room.isHost) takeOver(boatByPeer(from)); }
}

function onRoom(r) {
  room = r;
  waitingForRace = false;
  if (r) {
    r.on('message', onNetMessage);
    r.on('players', () => {
      if (r !== room || state !== 'menu') return;
      setupBoats();
      renderMenu();
    });
    r.on('join', (p) => { if (state !== 'menu') r.sendTo(p.id, { t: 'busy' }); });
    r.on('leave', (p) => { if (state !== 'menu') takeOver(boatByPeer(p.id)); });
    r.on('close', (reason) => {
      if (r !== room) return;
      room = null;
      if (state === 'menu') { setupBoats(); renderMenu(); return; }
      boats.forEach(takeOver);
      setPaused(false);
      if (reason) Arcade.toast(`<b>${reason}</b><span>Racing on against the computer</span>`);
      if (!$('results').hidden) showResults();
    });
  }
  if (state === 'menu') { setupBoats(); renderMenu(); }
}

// The start: people in the middle lanes (just you, or everyone in the room), CPU boats outside.
function setupBoats(lineup = roomLineup()) {
  const myId = room ? room.id : null;
  const people = lineup.slice(0, LANES);
  const paints = people.map((p) => paintHex(p.look, p.id === myId));
  const others = BOAT_COLORS.filter((c) => !paints.includes(c));
  const lanes = LANE_ORDER.slice(0, people.length);
  boats = people.map((p, i) => newBoat({
    name: p.name, color: paints[i], look: p.look, lane: lanes[i],
    isPlayer: p.id === myId, human: true, peer: p.id,
  }));
  let cpu = 0;
  for (let lane = 0; lane < LANES; lane++) {
    if (lanes.includes(lane)) continue;
    boats.push(newBoat({ name: CPU_NAMES[cpu], color: others[cpu % others.length], look: CPU_LOOKS[cpu], lane }));
    cpu++;
  }
  boats.sort((a, b) => a.lane - b.lane);
  player = boats.find((b) => b.isPlayer) || boats.find((b) => b.human);
  const diff = DIFFICULTIES[raceDiff];
  const wobbles = [0.85, 1, 1.1, 1.2, 1.35];
  boats.filter((b) => !b.human).forEach((b, i) => {
    b.wobble = wobbles[i % wobbles.length];
    b.sprintFrom = rand(...diff.sprint);
    b.aiWait = rand(0.05, 0.35) * diff.react;
  });
  for (const b of boats) {
    b.owned = b.isPlayer || (!b.human && !isGuest());
    b.auto = !b.human;
  }
  puddles = [];
  spray = [];
  computeOrder();
}

function computeOrder() {
  order = [...boats].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.finishTime - b.finishTime;
    return b.d - a.d;
  });
}

// ---------- Race flow ----------
// The host (or a solo player) starts a race; in a room everyone gets the same start.
function hostStart() {
  if (isGuest()) return;
  if (!room) { startRace(); return; }
  raceId++;
  const lineup = roomLineup();
  room.broadcast({ t: 'start', r: raceId, lineup, difficulty: settings.difficulty });
  startRace({ lineup });
}

function startRace({ lineup, difficulty = settings.difficulty } = {}) {
  audio.init();
  raceDiff = difficulty;
  setupBoats(lineup);
  state = 'countdown';
  paused = false;
  pauseShown = false;
  netTimer = 0;
  countdown = 3.4;
  lastCount = 0;
  raceTime = 0;
  resultsTimer = 0;
  pullQueued = false;
  callouts = new Set();
  camD = player.d;
  if (document.activeElement) document.activeElement.blur();
  $('menu').hidden = true;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = true;
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  buildProgress();
  updateHud();
}

// Leaving a race in a room: the host ends it for everyone; a guest's boat is handed to the computer.
function toMenu({ quiet = false } = {}) {
  if (room && state !== 'menu' && !quiet) {
    if (room.isHost) room.broadcast({ t: 'end', r: raceId });
    else room.send({ t: 'quit', r: raceId });
  }
  state = 'menu';
  paused = false;
  pauseShown = false;
  raceDiff = settings.difficulty;
  setupBoats();
  $('menu').hidden = false;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = false;
  $('hud').hidden = true;
  $('touch').hidden = true;
  audio.ambience(0, false);
  renderMenu();
}

function setPaused(p) {
  if (state !== 'countdown' && state !== 'racing') return;
  if (room) {
    pauseShown = p;
    $('pause').hidden = !p;
    $('restart-btn').hidden = isGuest();
    $('pause-title').textContent = p ? 'Menu' : 'Paused';
    $('pause-note').hidden = false;
    $('pause-note').textContent = room.isHost
      ? 'The race keeps going for everyone. Main menu ends it for all.'
      : 'The race keeps going. Main menu leaves it and the computer rows your boat.';
    return;
  }
  paused = p;
  $('pause').hidden = !p;
  $('restart-btn').hidden = false;
  $('pause-title').textContent = 'Paused';
  $('pause-note').hidden = true;
}

function finishRace() {
  const place = boats.filter((b) => b.finished && b.finishTime <= player.finishTime).length;
  player.finishPlace = place;
  showBanner('FINISH!', 'gold');
  [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.18, 'square', 0.12, null, i * 0.12));
  audio.noise(1.8, 0.2, 2400, 'bandpass');
  const key = `rowing.best.${raceDiff}`;
  const best = store.get(key, 0);
  player.newRecord = !best || player.finishTime < best;
  if (player.newRecord) store.set(key, player.finishTime);
  Arcade.record('row', {
    place, difficulty: raceDiff, time: player.finishTime,
    maxCombo: player.maxCombo, crabs: player.crabs, perfects: player.perfects,
    friends: boats.filter((b) => b.human).length - 1,
  });
  resultsTimer = 2.4;
}

function showResults() {
  const place = player.finishPlace;
  $('results-title').textContent = place === 1 ? '🏆 You win!' : place <= 3 ? `${place === 2 ? '🥈' : '🥉'} ${place}${suffix(place)} place!` : `You finished ${place}${suffix(place)}`;
  const bits = [`Time ${formatTime(player.finishTime)}`, `${player.perfects}/${player.strokes} perfect strokes`, `best combo ×${player.maxCombo}`];
  if (player.crabs) bits.push(`${player.crabs} crab${player.crabs === 1 ? '' : 's'}`);
  if (player.newRecord) bits.push('new record!');
  $('results-sub').textContent = `${bits.join(' · ')} (${DIFFICULTIES[raceDiff].label})`;
  renderResultsTable();
  $('again-btn').hidden = isGuest();
  $('results-wait').hidden = !isGuest();
  $('results-menu-btn').textContent = room ? 'Main menu' : 'Change boat';
  $('results').hidden = false;
  $('back-link').hidden = true;
}

function renderResultsTable() {
  $('results-body').innerHTML = order.map((b, i) => `
    <tr class="${b.isPlayer ? 'me' : ''}">
      <td>${i + 1}</td>
      <td><span class="dot" style="background:${b.color}"></span>${esc(b.name)}${b.human && !b.isPlayer ? ' <small class="friend">friend</small>' : ''}</td>
      <td>${b.finished ? formatTime(b.finishTime) : `${Math.round(RACE - b.d)} m to go`}</td>
    </tr>`).join('');
}

// ---------- Input ----------
const keys = new Set();
const touch = { sprint: false };
let pullQueued = false;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const sprintHeld = () => touch.sprint || ['ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown'].some((c) => keys.has(c));

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && state !== 'menu') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) pullQueued = true;
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!(paused || pauseShown));
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

document.querySelectorAll('[data-touch]').forEach((btn) => {
  const key = btn.dataset.touch;
  const set = (on) => {
    btn.classList.toggle('active', on);
    if (key === 'row') { if (on) pullQueued = true; } else touch[key] = on;
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => set(false));
});

function playerPull() {
  const q = pull(player, sprintHeld());
  if (!q) return;
  if (q === 'crab') {
    rate('CAUGHT A CRAB!', 'bad');
    flashMeter('miss');
    audio.noise(0.45, 0.35, 1800);
    audio.tone(190, 0.32, 'sawtooth', 0.1, 70);
    return;
  }
  splashAt(player, player.sprint ? 1.5 : 1);
  audio.noise(0.22, player.sprint ? 0.22 : 0.15, 900);
  if (player.said === 'tired') { player.said = null; rate('OUT OF PUFF!', 'bad'); return; }
  if (q === 'perfect') {
    const first = player.strokes === 1;
    rate(first ? 'GREAT START!' : player.combo >= 2 ? `PERFECT ×${player.combo}` : 'PERFECT', 'perfect');
    flashMeter('hit');
    audio.tone(620 + player.combo * 45, 0.14, 'triangle', 0.12);
  } else if (q === 'rushed') rate('RUSHED', 'good');
  else if (q === 'late') rate('LATE', 'good');
}

// ---------- HUD ----------
const hud = {
  dist: $('dist'), time: $('time'), speed: $('speed'), pos: $('pos'), rating: $('rating'),
  meter: $('meter'), needle: $('needle'), combo: $('combo'), stamina: $('stamina'), staminaFill: $('stamina-fill'),
  banner: $('banner'), progress: $('progress'),
};
const shown = {};
function setText(el, key, value, html = false) {
  if (shown[key] === value) return;
  shown[key] = value;
  if (html) el.innerHTML = value; else el.textContent = value;
}

function rate(text, cls) {
  const el = hud.rating;
  el.textContent = text;
  el.className = 'rating';
  void el.offsetWidth; // restart the animation
  el.className = `rating show ${cls}`;
}

function showBanner(text, cls = '') {
  const el = hud.banner;
  el.textContent = text;
  el.className = 'banner';
  void el.offsetWidth;
  el.className = `banner show ${cls} ${text.length > 4 ? 'small' : ''}`;
}

// Lay the meter out for a zone; the zones slide to their new place after each stroke.
let meterZone = null;
function layoutMeter(z) {
  if (z === meterZone) return;
  meterZone = z;
  const pct = (v) => `${(v / METER_END) * 100}%`;
  const zone = (id, a, b) => Object.assign($(id).style, { left: pct(a), width: pct(b - a) });
  zone('z-crab', 0, z.crab);
  zone('z-rushed', z.crab, z.rushed);
  zone('z-sweet', z.rushed, z.sweet);
  zone('z-late', z.sweet, METER_END);
  $('z-target').style.left = pct(zoneMid(z));
}

function flashMeter(cls) {
  hud.meter.classList.remove('hit', 'miss');
  void hud.meter.offsetWidth;
  hud.meter.classList.add(cls);
}

function buildProgress() {
  hud.progress.innerHTML = '';
  for (const b of boats) {
    const dot = document.createElement('i');
    dot.style.background = b.color;
    if (b.isPlayer) dot.className = 'me';
    hud.progress.append(dot);
    b.dot = dot;
  }
}

function updateHud() {
  const p = player;
  setText(hud.dist, 'dist', String(Math.min(RACE, Math.floor(p.d))));
  setText(hud.time, 'time', formatTime(state === 'countdown' ? 0 : p.finished ? p.finishTime : raceTime));
  const spm = Math.round(60 / (DRIVE + recovery(p.combo) * zoneMid(p.zone)));
  setText(hud.speed, 'speed', `${p.v.toFixed(1)} m/s · ${spm} strokes/min`);
  const place = order.indexOf(p) + 1;
  setText(hud.pos, 'pos', `${place}<sup>${suffix(place)}</sup>`, true);
  layoutMeter(p.zone);
  // While the blade is in the water the needle sweeps back to the start.
  let at;
  if (p.drive > 0) at = p.pulledAt * (p.drive / DRIVE);
  else if (p.ready) at = 1;
  else at = Math.min(1, p.recT / p.rec / METER_END);
  hud.needle.style.left = `${at * 100}%`;
  hud.meter.classList.toggle('drive', p.drive > 0);
  hud.meter.classList.toggle('drift', p.ready && p.strokes > 0 && !p.finished);
  setText(hud.combo, 'combo', `×${p.combo}`);
  hud.combo.classList.toggle('hot', p.combo >= MAX_COMBO);
  hud.staminaFill.style.transform = `scaleX(${p.stamina / 100})`;
  hud.stamina.classList.toggle('tired', p.tired);
  hud.stamina.classList.toggle('sprinting', p.sprint);
  for (const b of boats) if (b.dot) b.dot.style.top = `${clamp(1 - b.d / RACE, 0, 1) * 100}%`;
}

// ---------- Drawing ----------
const canvas = $('game');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
let scale = 1; // pixels per metre
let camD = 0;  // the distance shown at the anchor line
const anchorY = () => H * (isTouch ? 0.44 : 0.5);
const sy = (d) => anchorY() - (d - camD) * scale;
const sx = (x) => W / 2 + x * scale;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lanePx = clamp(Math.min(W * 0.7, H * 1.1) / LANES, 46, 84);
  scale = lanePx / LANE_W;
}
window.addEventListener('resize', resize);
resize();

const heads = new Map();
function headImage(look) {
  const key = JSON.stringify(look);
  let img = heads.get(key);
  if (!img) {
    img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(Arcade.character(look, { bg: false, crop: 'head' }))}`;
    heads.set(key, img);
  }
  return img;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const GRASS = '#4caa55';
const CROWD = ['#ff4d6d', '#ffd23f', '#45d4ff', '#ffffff', '#b06bff', '#ff9f1a', '#34d399'];
const SKINS = ['#f6d3b3', '#e8b48a', '#c68a5c', '#8d5a3b', '#5c3a24'];
const FLAGS = ['#ff4d6d', '#ffd23f', '#45d4ff', '#34d399', '#b06bff'];

function circle(x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// A tree seen from above: a shadow, then a canopy built up from dark to light.
function drawTree(x, y, r, seed) {
  ctx.fillStyle = 'rgba(0, 0, 0, .2)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.35, y + r * 0.4, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + seed * 6;
    circle(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.62, '#2a7a36');
  }
  circle(x, y, r * 0.75, '#33903f');
  circle(x - r * 0.22, y - r * 0.24, r * 0.48, '#45a64e');
  circle(x - r * 0.34, y - r * 0.38, r * 0.2, 'rgba(255, 255, 255, .16)');
}

function drawBanks(top, bottom) {
  const edge = WATER_HALF * scale;
  const left = W / 2 - edge;
  const right = W / 2 + edge;
  const kerb = 0.5 * scale;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, left, H);
  ctx.fillRect(right, 0, W - right, H);
  // Mown stripes along the banks.
  ctx.fillStyle = 'rgba(255, 255, 255, .06)';
  for (let k = Math.floor(bottom / 8); k <= Math.ceil(top / 8); k++) {
    if (k % 2) continue;
    const y = sy((k + 1) * 8);
    ctx.fillRect(0, y, left, 8 * scale);
    ctx.fillRect(right, y, W - right, 8 * scale);
  }
  // Tufts of grass and the odd flower.
  ctx.lineWidth = Math.max(1, scale * 0.08);
  ctx.lineCap = 'round';
  for (let k = Math.floor(bottom / 1.6); k <= Math.ceil(top / 1.6); k++) {
    for (let j = 0; j < 4; j++) {
      const h = hash(k * 17 + j * 5.3);
      const side = j % 2 ? 1 : -1;
      const span = side < 0 ? left - kerb : W - right - kerb;
      if (span <= 0) continue;
      const x = side < 0 ? hash(k * 3 + j) * span : right + kerb + hash(k * 3 + j) * span;
      const y = sy(k * 1.6 + hash(k + j * 9) * 1.6);
      if (h < 0.1) {
        circle(x, y, Math.max(1.5, scale * 0.13), h < 0.05 ? '#fff6c2' : '#ffd8f0');
      } else if (h < 0.55) {
        ctx.strokeStyle = 'rgba(20, 80, 30, .3)';
        ctx.beginPath();
        ctx.moveTo(x - scale * 0.15, y);
        ctx.lineTo(x - scale * 0.05, y - scale * 0.3);
        ctx.moveTo(x + scale * 0.12, y);
        ctx.lineTo(x + scale * 0.16, y - scale * 0.26);
        ctx.stroke();
      }
    }
  }
  // A gravel path beside the river.
  for (const x of [left - 3.6 * scale, right + 1.8 * scale]) {
    ctx.fillStyle = '#cdb486';
    ctx.fillRect(x, 0, 1.8 * scale, H);
    ctx.fillStyle = 'rgba(80, 60, 30, .18)';
    ctx.fillRect(x, 0, Math.max(1, scale * 0.1), H);
    ctx.fillRect(x + 1.8 * scale - Math.max(1, scale * 0.1), 0, Math.max(1, scale * 0.1), H);
  }
  // A stone kerb where grass meets water, with its shadow on the water.
  ctx.fillStyle = '#ddcb9f';
  ctx.fillRect(left - kerb, 0, kerb, H);
  ctx.fillRect(right, 0, kerb, H);
  ctx.fillStyle = 'rgba(255, 255, 255, .35)';
  ctx.fillRect(left - kerb, 0, Math.max(1, kerb * 0.25), H);
  ctx.fillRect(right, 0, Math.max(1, kerb * 0.25), H);
  ctx.fillStyle = 'rgba(0, 0, 0, .12)';
  for (let k = Math.floor(bottom / 1.2); k <= Math.ceil(top / 1.2); k++) {
    const y = sy(k * 1.2);
    ctx.fillRect(left - kerb, y, kerb, 1);
    ctx.fillRect(right, y, kerb, 1);
  }

  // Trees beyond the path.
  for (let k = Math.floor(bottom / 7) - 1; k <= Math.ceil(top / 7) + 1; k++) {
    for (const side of [-1, 1]) {
      const h = hash(k * 2 + (side > 0 ? 1 : 0));
      if (h > 0.6) continue;
      const r = (1.6 + hash(k * 3.1 + side) * 1.4) * scale;
      const off = (6 + hash(k * 5.7 + side) * 9) * scale;
      const x = side < 0 ? left - off : right + off;
      if (x < -r || x > W + r) continue;
      drawTree(x, sy(k * 7 + hash(k + side * 9) * 5), r, h);
    }
  }

  // Crowds near the finish, jumping when a boat is close.
  const near = boats.some((b) => !b.finished && RACE - b.d < 80 && b.d > 0);
  const body = Math.max(2.2, 0.36 * scale);
  for (let d = Math.max(bottom, RACE - 70); d < Math.min(top, RACE + 30); d += 1.3) {
    const k = Math.round(d * 10);
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1]) {
        const h = hash(k * 7 + row * 13 + side);
        if (h > 0.75) continue;
        const off = (1.1 + row * 1.1 + h * 0.4) * scale;
        const x = side < 0 ? left - kerb - off : right + kerb + off;
        const jump = near ? Math.max(0, Math.sin(clock * 9 + h * 40)) * 0.35 : 0;
        const y = sy(d - jump);
        circle(x + body * 0.3, sy(d) + body * 0.5, body, 'rgba(0, 0, 0, .18)');
        circle(x, y, body, CROWD[Math.floor(h * 97) % CROWD.length]);
        circle(x, y - body * 0.35, body * 0.6, SKINS[Math.floor(h * 53) % SKINS.length]);
      }
    }
  }

  // Judges' huts with flags at the finish.
  if (RACE > bottom - 10 && RACE < top + 10) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? left - kerb - 4.4 * scale : right + kerb + 1.4 * scale;
      const y = sy(RACE) - 1.5 * scale;
      ctx.fillStyle = 'rgba(0, 0, 0, .22)';
      ctx.fillRect(x + 0.4 * scale, y + 0.5 * scale, 3 * scale, 3 * scale);
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(x, y, 3 * scale, 3 * scale);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#ff4d6d' : '#ffffff';
        ctx.fillRect(x + i * 0.75 * scale, y, 0.75 * scale, 3 * scale);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, .25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 3 * scale, 3 * scale);
    }
  }

  // Distance boards every 100 m.
  ctx.font = `700 ${Math.max(10, Math.round(scale * 0.9))}px Rubik, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let m = 100; m < RACE; m += 100) {
    if (m < bottom - 5 || m > top + 5) continue;
    const y = sy(m);
    const bw = 3.4 * scale;
    const bh = 1.6 * scale;
    for (const x of [left - kerb - bw / 2 - 0.3 * scale, right + kerb + bw / 2 + 0.3 * scale]) {
      ctx.fillStyle = 'rgba(0, 0, 0, .22)';
      roundRect(x - bw / 2 + 3, y - bh / 2 + 4, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      roundRect(x - bw / 2, y - bh / 2, bw, bh, 4);
      ctx.fill();
      ctx.strokeStyle = '#0b3a5c';
      ctx.lineWidth = Math.max(1, scale * 0.08);
      ctx.stroke();
      ctx.fillStyle = '#0b3a5c';
      ctx.fillText(`${m}m`, x, y + 1);
    }
  }
}

function drawWater(top, bottom) {
  const edge = WATER_HALF * scale;
  const left = W / 2 - edge;
  const right = W / 2 + edge;
  const g = ctx.createLinearGradient(left, 0, right, 0);
  g.addColorStop(0, '#135a83');
  g.addColorStop(0.18, '#1b7aab');
  g.addColorStop(0.5, '#2291c4');
  g.addColorStop(0.82, '#1b7aab');
  g.addColorStop(1, '#135a83');
  ctx.fillStyle = g;
  ctx.fillRect(left, 0, edge * 2, H);

  // Soft ripples drifting slowly downstream, and the odd glint of sun.
  ctx.lineCap = 'round';
  const drift = clock * 0.4;
  for (let k = Math.floor((bottom + drift) / 1.8) - 1; k <= Math.ceil((top + drift) / 1.8) + 1; k++) {
    for (let j = 0; j < 4; j++) {
      const h = hash(k * 11 + j * 3.7);
      const x = sx((h * 2 - 1) * (WATER_HALF - 0.8));
      const y = sy(k * 1.8 - drift + hash(k + j) * 1.8);
      const w = (0.5 + hash(k * 2 + j) * 1.3) * scale;
      const wave = Math.sin(clock * 2 + h * 20) * 0.15 * scale;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + hash(k * 5 + j) * 0.1})`;
      ctx.lineWidth = Math.max(1, scale * 0.1);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y + wave);
      ctx.quadraticCurveTo(x, y - 0.25 * scale + wave, x + w / 2, y + wave);
      ctx.stroke();
      if (j === 0) {
        const glint = Math.max(0, Math.sin(clock * 2.6 + h * 37)) ** 8;
        if (glint > 0.05) {
          const r = (0.15 + glint * 0.25) * scale;
          ctx.fillStyle = `rgba(255, 255, 255, ${glint * 0.8})`;
          ctx.beginPath();
          ctx.moveTo(x + w, y - r);
          ctx.lineTo(x + w + r * 0.3, y);
          ctx.lineTo(x + w, y + r);
          ctx.lineTo(x + w - r * 0.3, y);
          ctx.closePath();
          ctx.moveTo(x + w - r, y);
          ctx.lineTo(x + w, y - r * 0.3);
          ctx.lineTo(x + w + r, y);
          ctx.lineTo(x + w, y + r * 0.3);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // The banks cast a little shade on the water.
  const shadeW = 1.6 * scale;
  for (const [x0, x1] of [[left, left + shadeW], [right, right - shadeW]]) {
    const s = ctx.createLinearGradient(x0, 0, x1, 0);
    s.addColorStop(0, 'rgba(4, 30, 50, .4)');
    s.addColorStop(1, 'rgba(4, 30, 50, 0)');
    ctx.fillStyle = s;
    ctx.fillRect(Math.min(x0, x1), 0, shadeW, H);
  }

  // The start pontoons and the start line.
  if (bottom < 0) {
    for (let lane = 0; lane < LANES; lane++) {
      const x = sx(laneX(lane)) - 1.3 * scale;
      const y = sy(-BOAT_LEN - 0.2);
      ctx.fillStyle = 'rgba(0, 0, 0, .25)';
      ctx.fillRect(x + 3, y + 4, 2.6 * scale, 1.8 * scale);
      ctx.fillStyle = '#a7804c';
      ctx.fillRect(x, y, 2.6 * scale, 1.8 * scale);
      ctx.fillStyle = 'rgba(60, 35, 10, .35)';
      for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * 0.45 * scale, 2.6 * scale, 1);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, .85)';
    ctx.fillRect(left, sy(0) - 1.5, edge * 2, 3);
  }

  // Lane ropes: yellow buoys, red for the last 100 m.
  const r = Math.max(2, 0.26 * scale);
  for (let rope = 0; rope <= LANES; rope++) {
    const x = sx((rope - LANES / 2) * LANE_W);
    ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    for (let d = Math.ceil(bottom / 2.5) * 2.5; d <= top; d += 2.5) {
      if (d < -BOAT_LEN || d > RACE + 30) continue;
      const y = sy(d) + Math.sin(clock * 2 + d + rope) * 0.05 * scale;
      const color = d > RACE - 100 ? '#ff4d4d' : d < 0 ? '#ffffff' : '#ffd23f';
      circle(x + r * 0.35, y + r * 0.45, r, 'rgba(0, 20, 40, .3)');
      circle(x, y, r, color);
      circle(x - r * 0.3, y - r * 0.3, r * 0.38, 'rgba(255, 255, 255, .7)');
    }
  }

  // The finish line.
  if (RACE > bottom - 2 && RACE < top + 2) {
    const sq = 0.7 * scale;
    const y = sy(RACE);
    for (let i = 0, x = left; x < right; i++, x += sq) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        ctx.fillRect(x, y - sq * j, Math.min(sq, right - x), sq);
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, .5)';
    ctx.fillRect(left, y - sq - 2, edge * 2, 2);
    ctx.fillRect(left, y + sq, edge * 2, 2);
  }
}

// Bunting strung across the river over the finish, drawn above the boats.
function drawBunting(top, bottom) {
  const d = RACE + 4;
  if (d < bottom - 2 || d > top + 2) return;
  const left = W / 2 - (WATER_HALF + 1) * scale;
  const right = W / 2 + (WATER_HALF + 1) * scale;
  const y = sy(d);
  const sag = 1.2 * scale;
  const at = (t) => [left + (right - left) * t, y + Math.sin(t * Math.PI) * sag];
  ctx.strokeStyle = 'rgba(0, 0, 0, .5)';
  ctx.lineWidth = Math.max(1, scale * 0.06);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const [x, yy] = at(i / 40);
    if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
  }
  ctx.stroke();
  const n = 26;
  for (let i = 1; i < n; i++) {
    const [x, yy] = at(i / n);
    const flap = Math.sin(clock * 6 + i) * 0.12 * scale;
    ctx.fillStyle = FLAGS[i % FLAGS.length];
    ctx.beginPath();
    ctx.moveTo(x - 0.45 * scale, yy);
    ctx.lineTo(x + 0.45 * scale, yy);
    ctx.lineTo(x + flap, yy + 0.9 * scale);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSplashes(dt) {
  for (const p of puddles) p.age += dt;
  puddles = puddles.filter((p) => p.age < 1.8);
  for (const p of puddles) {
    const k = p.age / 1.8;
    const rr = (0.35 + k * 0.9) * p.size * scale;
    const alpha = (1 - k) * (p.crab ? 0.7 : 0.45);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = Math.max(1, scale * 0.12 * (1 - k * 0.5));
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.d), rr * 1.3, rr, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.d), rr * 0.7, rr * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of spray) {
    p.age += dt;
    p.d += p.vd * dt;
    p.x += p.vx * dt;
  }
  spray = spray.filter((p) => p.age < p.life);
  for (const p of spray) {
    const k = p.age / p.life;
    circle(sx(p.x), sy(p.d), Math.max(1, (1 - k) * 0.16 * scale), `rgba(255, 255, 255, ${(1 - k) * 0.85})`);
  }
}

function drawBoat(b) {
  const cx = sx(laneX(b.lane));
  const mid = b.d - BOAT_LEN / 2;
  const cy = sy(mid);
  if (cy < -BOAT_LEN * scale || cy > H + BOAT_LEN * scale) return;
  const bob = Math.sin(clock * 2.2 + b.lane) * 0.04 * scale;
  ctx.save();
  ctx.translate(cx, cy + bob);
  const s = scale;
  const L = BOAT_LEN / 2;
  const hw = 0.45;

  // Wake trailing from the stern, and a bow wave once the boat gets going.
  if (b.v > 0.5) {
    const len = Math.min(12, b.v * 1.1);
    const a = Math.min(0.5, b.v * 0.045);
    ctx.lineCap = 'round';
    for (const [spread, width, alpha] of [[0.22, 0.3, a * 0.35], [0.16, 0.14, a]]) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = Math.max(1, s * width);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * hw * 0.5 * s, (L - 0.5) * s);
        ctx.quadraticCurveTo(side * 0.8 * s, (L + len * 0.5) * s, side * (0.6 + len * spread) * s, (L + len) * s);
        ctx.stroke();
      }
    }
    if (b.v > 3) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.7, (b.v - 3) * 0.1)})`;
      ctx.lineWidth = Math.max(1, s * 0.12);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -L * s);
        ctx.quadraticCurveTo(side * 0.45 * s, (-L + 0.6) * s, side * 0.75 * s, (-L + 1.8) * s);
        ctx.stroke();
      }
    }
  }

  // Oars: the blade goes forward on the recovery and sweeps back through the water.
  const pivotY = -0.25;
  const angle = b.oar * 0.8;
  const water = b.owned ? inWater(b) : b.wasInWater;
  const sitY = -b.oar * 0.45 + 0.3; // the rower slides towards the stern for the catch
  for (const side of [-1, 1]) {
    const px = side * 1.15;
    const dx = side * Math.cos(angle);
    const dy = Math.sin(angle);
    // Rigger
    ctx.strokeStyle = '#9aa3b6';
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * hw * s, (pivotY - 0.5) * s);
    ctx.lineTo(px * s, pivotY * s);
    ctx.lineTo(side * hw * s, (pivotY + 0.5) * s);
    ctx.stroke();
    // Shaft, from the handle by the rower out to the blade, with its shadow on the water.
    const hx = px - dx * 0.95;
    const hy = pivotY - dy * 0.95;
    const bx = px + dx * 2.3;
    const by = pivotY + dy * 2.3;
    if (!water) {
      ctx.strokeStyle = 'rgba(0, 20, 40, .25)';
      ctx.lineWidth = Math.max(1.5, s * 0.09);
      ctx.beginPath();
      ctx.moveTo((px + 0.25) * s, (pivotY + 0.35) * s);
      ctx.lineTo((bx + 0.35) * s, (by + 0.45) * s);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f4f1ea';
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(hx * s, hy * s);
    ctx.lineTo(bx * s, by * s);
    ctx.stroke();
    // Blade: square to the water while pulling, feathered flat on the way back.
    ctx.save();
    ctx.translate(bx * s, by * s);
    ctx.rotate(Math.atan2(dy, dx));
    if (water) {
      ctx.fillStyle = 'rgba(255, 255, 255, .6)';
      ctx.beginPath();
      ctx.ellipse(0.2 * s, 0.25 * s, 0.6 * s, 0.16 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = b.color;
    ctx.strokeStyle = 'rgba(0, 0, 0, .4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0.25 * s, 0, 0.44 * s, (water ? 0.21 : 0.1) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Hull: a long, thin, rounded shell with a soft shadow.
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(0, -L * s);
    ctx.bezierCurveTo(hw * s, -L * 0.5 * s, hw * s, L * 0.5 * s, 0, L * s);
    ctx.bezierCurveTo(-hw * s, L * 0.5 * s, -hw * s, -L * 0.5 * s, 0, -L * s);
  };
  ctx.save();
  ctx.shadowColor = 'rgba(0, 15, 30, .45)';
  ctx.shadowBlur = Math.max(4, s * 0.4);
  ctx.shadowOffsetX = s * 0.25;
  ctx.shadowOffsetY = s * 0.35;
  ctx.fillStyle = b.color;
  hull();
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(-hw * s, 0, hw * s, 0);
  g.addColorStop(0, shade(b.color, -0.35));
  g.addColorStop(0.35, shade(b.color, 0.25));
  g.addColorStop(0.6, b.color);
  g.addColorStop(1, shade(b.color, -0.4));
  ctx.fillStyle = g;
  ctx.strokeStyle = shade(b.color, -0.5);
  ctx.lineWidth = Math.max(1, s * 0.05);
  hull();
  ctx.fill();
  ctx.stroke();
  // Deck: a covered bow and stern either side of the cockpit.
  ctx.fillStyle = 'rgba(255, 255, 255, .3)';
  ctx.fillRect(-0.05 * s, -L * 0.88 * s, 0.1 * s, L * 0.55 * s);
  ctx.fillRect(-0.05 * s, L * 0.45 * s, 0.1 * s, L * 0.4 * s);
  ctx.fillStyle = '#1c2230';
  roundRect(-0.3 * s, -1.1 * s, 0.6 * s, 2.6 * s, 0.25 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .15)';
  ctx.fillRect(-0.25 * s, -1.05 * s, 0.5 * s, 0.08 * s);
  // Bow number, as on a real regatta course.
  if (s >= 11) {
    circle(0, -L * 0.62 * s, 0.32 * s, '#fff');
    ctx.fillStyle = '#111';
    ctx.font = `700 ${Math.round(0.42 * s)}px Rubik, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.lane + 1), 0, -L * 0.62 * s + 1);
  }
  circle(0, -L * s, Math.max(1.5, 0.12 * s), '#fff');

  // The rower: arms to the handles, a club unisuit, then the character's head.
  const suit = shade(b.color, -0.25);
  ctx.strokeStyle = suit;
  ctx.lineWidth = Math.max(2, s * 0.17);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const dx = side * Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(side * 0.24 * s, (sitY - 0.15) * s);
    ctx.lineTo((side * 1.15 - dx * 0.95) * s, (pivotY - dy * 0.95) * s);
    ctx.stroke();
  }
  const bodyG = ctx.createRadialGradient(-0.12 * s, (sitY - 0.12) * s, 0, 0, sitY * s, 0.5 * s);
  bodyG.addColorStop(0, shade(b.color, 0.15));
  bodyG.addColorStop(1, suit);
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(0, sitY * s, 0.46 * s, 0.34 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const img = headImage(b.look);
  const size = 1.8 * s;
  const headY = (sitY - 0.2) * s;
  if (img.complete && img.naturalWidth) {
    ctx.fillStyle = 'rgba(0, 0, 0, .25)';
    ctx.beginPath();
    ctx.ellipse(0.12 * s, headY + size * 0.32, size * 0.28, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(img, -size / 2, headY - size / 2, size, size);
  }
  if (b.crabT > 0) {
    ctx.font = `${Math.round(s * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('💦', 1.4 * s, (sitY - 1) * s);
  }
  ctx.restore();

  // Name below the stern.
  const label = b.isPlayer ? 'You' : b.name;
  ctx.font = `700 ${Math.max(11, Math.round(scale * 0.62))}px Rubik, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const w = ctx.measureText(label).width + 12;
  const lh = Math.max(16, scale * 0.9);
  const ly = cy + (L + 0.4) * scale;
  ctx.fillStyle = b.isPlayer ? 'rgba(63, 224, 208, .95)' : 'rgba(8, 24, 44, .7)';
  roundRect(cx - w / 2, ly, w, lh, lh / 2);
  ctx.fill();
  ctx.fillStyle = b.isPlayer ? '#032b2a' : '#fff';
  ctx.fillText(label, cx, ly + (lh - Math.max(11, Math.round(scale * 0.62))) / 2);
}

// Boats too far ahead or behind to see get a tag at the edge of their lane.
function drawOffscreen() {
  ctx.font = `700 12px Rubik, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of boats) {
    if (b === player) continue;
    const bow = sy(b.d);
    const stern = sy(b.d - BOAT_LEN);
    const gap = Math.round(Math.abs(b.d - player.d));
    let y;
    let text;
    if (stern < 0) { y = 70; text = `▲ ${b.name} +${gap}m`; }
    else if (bow > H) { y = H - (isTouch ? 230 : 150); text = `▼ ${b.name} −${gap}m`; }
    else continue;
    const x = sx(laneX(b.lane));
    const w = Math.min(ctx.measureText(text).width + 14, LANE_W * scale - 4);
    ctx.fillStyle = 'rgba(8, 24, 44, .8)';
    roundRect(x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillRect(x - w / 2 + 8, y + 7, w - 16, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y, w - 8);
  }
}

// A soft darkening at the screen's edges keeps the eye on the boats.
let vignette = null;
function drawVignette() {
  if (!vignette || vignette.w !== W || vignette.h !== H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0, 10, 25, 0)');
    g.addColorStop(1, 'rgba(0, 10, 25, .35)');
    vignette = { w: W, h: H, g };
  }
  ctx.fillStyle = vignette.g;
  ctx.fillRect(0, 0, W, H);
}

function draw(dt) {
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, W, H);
  const top = camD + anchorY() / scale;
  const bottom = camD - (H - anchorY()) / scale;
  drawWater(top, bottom);
  drawBanks(top, bottom);
  drawSplashes(dt);
  for (const b of boats) drawBoat(b);
  drawBunting(top, bottom);
  drawVignette();
  if (state !== 'menu') drawOffscreen();
}

// ---------- Loop ----------
function updateCamera(dt) {
  let target;
  if (state === 'menu') target = 6 + Math.sin(clock * 0.3) * 1.5;
  else target = player.d + 2 + player.v * 0.35;
  camD += (target - camD) * (1 - Math.exp(-dt * 4));
}

function updateCountdown(dt) {
  countdown -= dt;
  const n = Math.ceil(countdown);
  if (n !== lastCount && n > 0 && n <= 3) {
    lastCount = n;
    showBanner(String(n));
    audio.tone(440, 0.18, 'square', 0.15);
  }
  if (pullQueued) { pullQueued = false; rate('WAIT FOR GO!', 'good'); }
  for (const b of boats) if (!b.owned) updateRemote(b, dt);
  if (countdown <= 0) {
    state = 'racing';
    raceTime = 0;
    showBanner('GO!', 'gold');
    audio.tone(880, 0.45, 'square', 0.16);
  }
}

function updateRace(dt) {
  raceTime += dt;
  if (pullQueued) {
    pullQueued = false;
    if (!pauseShown && !player.finished) playerPull();
  }
  for (const b of boats) {
    if (!b.owned) { updateRemote(b, dt); continue; }
    if (b.auto) {
      const before = b.strokes;
      aiStep(b);
      if (b.strokes > before) splashAt(b, b.sprint ? 1.5 : 1);
    }
    stepBoat(b, dt);
    if (!b.finished && b.d >= RACE) {
      b.finished = true;
      b.finishTime = raceTime - (b.d - RACE) / Math.max(b.v, 0.5);
      b.drive = 0;
      b.ready = true;
      if (b === player) finishRace();
    }
  }
  if (player.said === 'lost') { player.said = null; rate('LOST RHYTHM', 'bad'); }
  computeOrder();

  const left = RACE - player.d;
  if (!player.finished) {
    if (left < RACE / 2 && !callouts.has('half')) { callouts.add('half'); showBanner('HALFWAY', 'small'); }
    if (left < 150 && !callouts.has('sprint')) { callouts.add('sprint'); showBanner('SPRINT!', 'gold small'); }
  }

  if (resultsTimer > 0) {
    resultsTimer -= dt;
    if (resultsTimer <= 0) showResults();
  }
  if (!$('results').hidden) {
    resultsRefresh -= dt;
    if (resultsRefresh <= 0) { renderResultsTable(); resultsRefresh = 0.5; }
  }
}

function update(dt) {
  clock += dt;
  if (state !== 'menu') {
    if (state === 'countdown') updateCountdown(dt);
    else updateRace(dt);
    sendState(dt);
    updateHud();
    audio.ambience(player.v, true);
  } else if (pullQueued) {
    pullQueued = false;
  }
  updateCamera(dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) update(dt);
  draw(paused ? 0 : dt);
}

// ---------- Menus & buttons ----------
function renderMenu() {
  const me = Arcade.player;
  $('rower-face').innerHTML = Arcade.character();
  $('rower-name').textContent = me.name;
  $('rower-tix').innerHTML = `${Arcade.ticketIcon}${me.tickets.toLocaleString('en-US')} tickets`;
  // Paints you don't own yet show a lock and open the prize screen on that paint.
  const sw = $('swatches');
  sw.innerHTML = '';
  for (const p of Arcade.items('boatPaint')) {
    const own = Arcade.owns('boatPaint', p.id);
    const b = document.createElement('button');
    b.className = `swatch${own ? '' : ' locked'}`;
    b.style.background = p.swatch;
    b.title = own ? p.name : `${p.name}: ${p.price ? `${p.price} tickets` : 'quest reward'}`;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(own && p.id === me.look.boatPaint));
    b.onclick = () => {
      if (own) Arcade.setLook({ boatPaint: p.id });
      else Arcade.open({ slot: 'boatPaint', item: p.id });
    };
    sw.append(b);
  }
  document.querySelectorAll('#difficulty button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.d === settings.difficulty));
    b.disabled = isGuest();
  });
  const best = store.get(`rowing.best.${settings.difficulty}`, 0);
  $('best-line').innerHTML = best
    ? `Your best on ${DIFFICULTIES[settings.difficulty].label}: <strong>${formatTime(best)}</strong>`
    : '';
  // In a room only the host starts races; the button says who's coming.
  const start = $('start-btn');
  start.disabled = isGuest();
  if (!room) start.textContent = 'Start race';
  else if (room.isHost) start.textContent = room.players.length > 1 ? `Start race · ${room.players.length} rowers` : 'Start race';
  else start.textContent = 'Waiting for the host…';
  $('mp-note').hidden = !isGuest();
  $('mp-note').textContent = waitingForRace
    ? 'A race is already on. You\'ll be at the start for the next one.'
    : 'The host picks the difficulty and starts the race.';
  $('menu-sub').textContent = room && room.players.length > 1
    ? `500 m · ${room.players.length} rowers + ${Math.max(0, LANES - room.players.length)} CPU · row in rhythm`
    : '500 m · 6 boats · row in rhythm';
}

document.querySelectorAll('#difficulty button').forEach((b) => {
  b.onclick = () => {
    if (isGuest()) return;
    settings.difficulty = b.dataset.d;
    store.set('rowing.difficulty', b.dataset.d);
    raceDiff = b.dataset.d;
    renderMenu();
  };
});

function toggleMute() {
  audio.setMuted(!audio.muted);
  $('mute-btn').textContent = audio.muted ? '🔇' : '🔊';
}

$('rower-btn').onclick = () => Arcade.open();
// A new look or paint shows up at the start straight away.
Arcade.onChange(() => {
  if (state !== 'menu' || room) return; // in a room, the new look comes back with the player list
  setupBoats();
  renderMenu();
});
$('start-btn').onclick = hostStart;
$('again-btn').onclick = hostStart;
$('restart-btn').onclick = hostStart;
$('resume-btn').onclick = () => setPaused(false);
$('menu-btn').onclick = () => toMenu();
$('results-menu-btn').onclick = () => toMenu();
$('mp').append(ArcadeNet.panel({
  hosts: [{ game: 'regatta', label: 'Host a regatta' }],
  max: LANES,
  blurb: 'Up to 6 rowers',
  onRoom,
}).el);
$('pause-btn').onclick = () => setPaused(true);
$('mute-btn').onclick = toggleMute;
$('mute-btn').textContent = audio.muted ? '🔇' : '🔊';

// ---------- Boot ----------
toMenu();
requestAnimationFrame(frame);

})();
