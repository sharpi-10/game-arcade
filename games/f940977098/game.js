(() => {
'use strict';

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const ease = (t) => t * t * (3 - 2 * t);
const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => Math.round(v * 10) / 10;
const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

// Colours: '#rrggbb' in and out.
const toRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = (c) => `#${((1 << 24) + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1)}`;
const mix = (a, b, t) => { const x = toRgb(a); const y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
function hueShift(h, deg) {
  const [r, g, b] = toRgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hh = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  hh = (hh + deg / 360 + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return toHex([f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map((v) => v * 255));
}

// ---------- Tunables ----------
const MAXP = 4;
const LAUNCH_K = 0.15;          // launch speed per point of knockback
const LAUNCH_DECAY = 0.25;      // how fast a launch slows, per frame
const HITSTUN_K = 0.4;          // frames of hitstun per point of knockback
const SMASH_WINDOW = 6;         // tap a direction and attack within this many frames for a smash
const TAP_JUMP = 3;             // up waits this long for an attack before it jumps
const SHIELD_MAX = 50;
const RESPAWN_WAIT = 75;
const RESPAWN_INVULN = 120;
const HANG_MAX = 240;
const NET_EVERY = 2;            // frames between state updates sent to the room
const COLORS = ['#ff4d5e', '#3d8bff', '#ffc42e', '#3ddc84'];
const INK = '#1b1626';
const DEFAULT_PROPS = { torso: 30, uArm: 17, lArm: 17, thigh: 21, shin: 21, headR: 17, bodyW: 24, limbW: 11, neck: 12 };
const FX = {
  fire: { colors: ['#fff6c4', '#ffd23f', '#ff8a1f', '#ff3d1f'], trail: '#ffb13b' },
  stone: { colors: ['#f2ece0', '#c9c0ae', '#8c8577'], trail: '#efe8da' },
  shadow: { colors: ['#f0e8ff', '#b79cff', '#6b4fc0'], trail: '#c4b0ff' },
  elec: { colors: ['#ffffff', '#fff27a', '#6ff3ff'], trail: '#fff27a' },
  ice: { colors: ['#ffffff', '#bff3ff', '#5fb4ff'], trail: '#bff3ff' },
  slash: { colors: ['#ffffff', '#e4ecff', '#9ab8ff'], trail: '#ffffff' },
  puff: { colors: ['#ffffff', '#ffd1e6', '#ff8fbd'], trail: '#ffd1e6' },
  claw: { colors: ['#ffffff', '#ffe066', '#ff6b6b'], trail: '#ffe066' },
};
const LEVELS = {
  easy: { label: 'Easy', react: 28, aim: 0.5, shield: 0.04, smash: 0.25, aggro: 0.35, recover: 0.6, jumpy: 0.02, mult: 1 },
  normal: { label: 'Normal', react: 14, aim: 0.8, shield: 0.16, smash: 0.5, aggro: 0.6, recover: 0.95, jumpy: 0.04, mult: 1.5 },
  hard: { label: 'Hard', react: 6, aim: 0.95, shield: 0.34, smash: 0.7, aggro: 0.85, recover: 1, jumpy: 0.05, mult: 2 },
};
const COSTUMES = {
  classic: null,
  shadow: { to: '#1d1630', amt: 0.55 },
  crystal: { to: '#c8f4ff', amt: 0.55 },
  neon: { to: '#39ff9a', amt: 0.5 },
  gold: { to: '#f4c542', amt: 0.6 },
};

// ---------- Stages ----------
// Solids are blocks you stand on and can't pass through, with a ledge at each end. Platforms
// you can jump up through and drop down through. Positions are in world units, y down, with the
// main floor at y = 0.
const STAGES = [
  {
    id: 'temple', name: 'Sky Temple', blurb: 'A floating temple with three platforms',
    solids: [{ x1: -430, x2: 430, y: 0, h: 150 }],
    plats: [{ x1: -275, x2: -115, y: -150 }, { x1: 115, x2: 275, y: -150 }, { x1: -80, x2: 80, y: -290 }],
    blast: { l: -1250, r: 1250, t: -1050, b: 650 },
    spawns: [-300, 300, -110, 110],
  },
  {
    id: 'rooftop', name: 'Neon Rooftop', blurb: 'One long, flat roof. Nowhere to hide',
    solids: [{ x1: -520, x2: 520, y: 0, h: 170 }],
    plats: [],
    blast: { l: -1300, r: 1300, t: -1050, b: 650 },
    spawns: [-360, 360, -130, 130],
  },
  {
    id: 'isles', name: 'Palm Isles', blurb: 'Two islands and a raft drifting between them',
    solids: [{ x1: -640, x2: -170, y: 0, h: 120 }, { x1: 170, x2: 640, y: 0, h: 120 }],
    plats: [{ x1: -95, x2: 95, y: -95, move: { ax: 170, period: 420 } }],
    blast: { l: -1400, r: 1400, t: -1050, b: 600 },
    spawns: [-470, 470, -280, 280],
  },
];
const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

// ---------- Audio ----------
const audio = {
  ctx: null,
  muted: store.get('blastzone.muted', false),
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
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
  noise(dur, vol = 0.2, freq = 1200, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.min(1, k * 30) * (1 - k) * (1 - k);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(this.ctx.currentTime + delay);
  },
  play(name, power = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': this.noise(0.09, 0.08, 2400, 'bandpass'); break;
      case 'hit': {
        const p = clamp(power, 0, 1.6);
        this.noise(0.12 + p * 0.12, 0.22 + p * 0.18, 900 + p * 500);
        this.tone(170 - p * 40, 0.12 + p * 0.1, 'sine', 0.25 + p * 0.1, 50);
        if (p > 0.8) this.noise(0.4, 0.2, 400, 'lowpass', 0.02);
        break;
      }
      case 'shield': this.tone(520, 0.1, 'triangle', 0.12, 380); break;
      case 'break': this.tone(900, 0.5, 'square', 0.12, 120); this.noise(0.4, 0.2, 3000, 'highpass'); break;
      case 'jump': this.tone(260, 0.1, 'square', 0.05, 520); break;
      case 'land': this.noise(0.06, 0.08, 500); break;
      case 'grab': this.noise(0.08, 0.12, 1200, 'bandpass'); break;
      case 'ko':
        this.noise(1.3, 0.5, 700);
        this.tone(220, 0.9, 'sawtooth', 0.14, 40);
        this.tone(1400, 0.6, 'sine', 0.08, 300, 0.05);
        break;
      case 'count': this.tone(440, 0.16, 'square', 0.13); break;
      case 'go': this.tone(880, 0.4, 'square', 0.14); this.tone(1320, 0.4, 'square', 0.08, null, 0.05); break;
      case 'game': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'square', 0.1, null, i * 0.11)); break;
      case 'fire': this.noise(0.22, 0.14, 900, 'bandpass'); break;
      case 'zap': this.tone(rand(700, 1100), 0.12, 'square', 0.07, 200); this.noise(0.1, 0.1, 4000, 'highpass'); break;
      case 'ice': this.tone(1600, 0.15, 'triangle', 0.08, 2400); break;
      case 'throw': this.noise(0.08, 0.1, 3000, 'bandpass'); break;
      case 'whoosh': this.noise(0.18, 0.12, 1400, 'bandpass'); break;
      case 'heavy': this.noise(0.3, 0.2, 300); break;
      case 'howl': this.tone(420, 0.45, 'sawtooth', 0.07, 780); break;
      case 'counter': this.tone(1200, 0.2, 'triangle', 0.12, 1800); break;
      case 'click': this.tone(660, 0.05, 'square', 0.06); break;
      default: break;
    }
  },
  setMuted(m) {
    this.muted = m;
    store.set('blastzone.muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },
};

// ---------- The world ----------
let fighters = [];
let projectiles = [];   // shots fired by fighters this browser runs (others arrive as f.shots)
let particles = [];
let effects = [];
let stage = STAGES[0];
let surfaces = [];
let ledges = [];
let clock = 0;
let phase = 'menu';     // menu | countdown | fight | over
let countdown = 0;
let lastCount = 0;
let overTimer = 0;
let timeScale = 1;
let paused = false;
let pauseShown = false;
let outCount = 0;
let projSeq = 0;
let me = null;          // the fighter this browser's arcade character plays
let g = null;           // the canvas context being drawn on (swapped for portraits and thumbnails)

// ---------- Roster ----------
const api = {
  draw: {
    INK,
    ball(g, x, y, r, color, outline = true) {
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (outline) { g.strokeStyle = INK; g.lineWidth = Math.max(2, r * 0.18); g.stroke(); }
    },
    rrect(g, x, y, w, h, r, color, outline = true) {
      g.fillStyle = color;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
      g.fill();
      if (outline) { g.strokeStyle = INK; g.lineWidth = Math.max(2, Math.min(w, h) * 0.08); g.stroke(); }
    },
  },
  inp: (f) => f.inp,
  sfx: (f, name) => audio.play(name),
  start: (f, id) => startMove(f, id),
  proj(f, o) {
    const s = f.def.s;
    projectiles.push({
      ...o, id: ++projSeq, owner: f.slot, facing: f.facing,
      x: f.x + o.x * s * f.facing, y: f.y + o.y * s, vx: o.vx * f.facing, vy: o.vy || 0,
      r: o.r * Math.max(0.85, s), age: 0, hitSet: new Set(),
    });
  },
  burst(f, kind, x, y, n = 1, spread = 24) {
    const s = f.def.s;
    burst(kind, f.x + x * s * f.facing, f.y + y * s, n, spread * s, f);
  },
  ring(f, x, y, r, color) { effects.push({ kind: 'ring', x: f.x + x * f.facing * f.def.s, y: f.y + y * f.def.s, r, color, life: 18, max: 18 }); },
  afterimage(f) { effects.push({ kind: 'ghost', x: f.x, y: f.y, pose: poseFor(f), f: snapshotLook(f), life: 16, max: 16 }); },
  bolt(f) {
    effects.push({ kind: 'bolt', x: f.x, y: f.y - f.def.h * 0.5, life: 16, max: 16, seed: Math.random() * 100 });
    audio.play('zap');
    shake(6);
  },
  crystals(f) {
    for (const [dx, h] of [[-55, 60], [55, 60], [0, 110], [-25, 80], [25, 80]]) {
      effects.push({ kind: 'crystal', x: f.x + dx * f.def.s, y: f.y, h: h * f.def.s, life: 26, max: 26 });
    }
    audio.play('ice');
  },
  zzz(f) { particles.push({ kind: 'z', x: f.x, y: f.y - f.def.h * 0.6, vx: 0.6, vy: -0.9, life: 50, max: 50, size: 18, color: '#ffffff' }); },
  quake(f) {
    for (const dir of [-1, 1]) {
      projectiles.push({
        kind: 'quake', id: ++projSeq, owner: f.slot, facing: dir, x: f.x + dir * 30, y: f.y, vx: dir * 9, vy: 0,
        r: 26, life: 24, d: 10, a: 70, bk: 52, kg: 60, fx: 'stone', hug: true, pierce: true, age: 0, hitSet: new Set(),
      });
    }
    burst('dust', f.x, f.y, 16, 60);
    shake(10);
    audio.play('heavy');
  },
};
const ROSTER = window.BlastRoster.build(api);
const POSES = window.BlastRoster.poses;
const rosterById = (id) => ROSTER.find((d) => d.id === id) || ROSTER[0];
for (const d of ROSTER) {
  d.props = { ...DEFAULT_PROPS, ...(d.props || {}) };
  d.ranged = !!(d.moves.nspec && d.moves.nspec.on); // its neutral special throws something
  // How far below the hands the feet hang from a ledge.
  d.hangY = -rig({ def: d, facing: 1 }, POSES.hang, 0, 0, false).hF.y;
}

// ---------- Fighters ----------
function costumeOf(look) {
  const id = look && look.brawlCostume;
  return id && COSTUMES[id] !== undefined ? id : 'classic';
}

// The colours a fighter is drawn in: its own, tinted by the costume, with a twist of hue when the
// same fighter is in the match twice so the two can be told apart.
function paletteFor(def, costume = 'classic', dup = 0) {
  const pal = { ...def.pal };
  const c = COSTUMES[costume];
  for (const k of Object.keys(pal)) {
    if (k === 'skin' && !['brick', 'volt', 'puff', 'clank', 'fang'].includes(def.id)) continue;
    if (c) pal[k] = mix(pal[k], c.to, c.amt);
    if (dup) pal[k] = hueShift(pal[k], dup * 130);
  }
  return pal;
}

function makeFighter(slot, cfg, owned) {
  const def = rosterById(cfg.fighter);
  return {
    slot, def, cfg, owned,
    name: cfg.name, kind: cfg.kind, level: cfg.level || 'normal', peer: cfg.peer || null, input: cfg.input || null,
    color: COLORS[slot], pal: paletteFor(def, cfg.costume, cfg.dup || 0),
    x: 0, y: 0, vx: 0, vy: 0, lx: 0, ly: 0, facing: 1,
    grounded: null, state: 'idle', sf: 0, move: null, moveId: '', mf: 0, charge: 0, hitSet: new Set(),
    airJumps: def.stats.jumps - 1, airUsed: {}, airDodged: false, ff: false, landLag: 0,
    damage: 0, stocks: cfg.stocks, shield: SHIELD_MAX, invuln: 0, hitlag: 0, hitstun: 0, tumble: false, stun: 0,
    dropT: 0, ledge: null, ledgeCD: 0, ledgeInv: true, holding: -1, heldBy: -1, heldT: 0, holdT: 0, chill: 0,
    flash: 0, flipT: 0, dodge: null, hidden: false, noGrav: false,
    lastHitBy: -1, lastHitT: -9999, kos: 0, falls: 0, sds: 0, out: false, outOrder: 0, place: 0,
    inp: blank(), prev: blank(), pr: {}, tapX: 99, tapY: 99, upPend: 0, wantJump: false,
    ai: { queue: [], think: 0, target: -1, retarget: 0, moveX: 0, jumpCD: 0, ledgeWait: 20 },
    anim: { run: 0 }, trail: [], net: null, raw: null, pctShake: 0,
  };
}

function blank() { return { x: 0, y: 0, jump: false, attack: false, special: false, shield: false }; }

const alive = (f) => !f.out && f.state !== 'dead';
const intangible = (f) => {
  if (f.invuln > 0 || f.hidden) return true;
  if (f.state === 'dodge') return f.sf >= f.dodge.i0 && f.sf <= f.dodge.i1;
  if (f.state === 'climb' || f.state === 'getup' || f.state === 'respawn') return true;
  const m = f.state === 'attack' && f.move;
  return !!(m && m.intang && f.mf >= m.intang[0] && f.mf <= m.intang[1]);
};
// Whether a hit can land: for a fighter run here, from its own state; for one run elsewhere, from
// what its browser last reported.
const hittable = (f) => alive(f) && f.state !== 'respawn' && (f.owned ? !intangible(f) : !(f.netFlags & 1));

function hurtbox(f) {
  const w = f.def.w;
  let h = f.def.h;
  if (f.state === 'crouch' || f.state === 'down') h *= 0.6;
  if (f.state === 'hang') return { x: f.x - w / 2, y: f.y - h, w, h };
  return { x: f.x - w / 2, y: f.y - h, w, h };
}

function circleHitsRect(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w);
  const ny = clamp(cy, b.y, b.y + b.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

// ---------- Input ----------
const keys = new Set();
const KEYMAPS = {
  keys1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space'], attack: ['KeyJ', 'KeyF'], special: ['KeyK', 'KeyG'], shield: ['KeyL', 'KeyH', 'ShiftLeft'] },
  keys2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['Numpad0', 'Enter'], attack: ['Comma', 'Numpad1'], special: ['Period', 'Numpad2'], shield: ['Slash', 'Numpad3', 'ShiftRight'] },
  // When nobody else is on the arrows, player one can use them too, with Z, X and C.
  solo: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: [], attack: ['KeyZ', 'Comma'], special: ['KeyX', 'Period'], shield: ['KeyC', 'Slash', 'ShiftRight'] },
};
const INPUT_LABELS = { keys1: 'WASD', keys2: 'Arrows', pad1: 'Pad 1', pad2: 'Pad 2', pad3: 'Pad 3', pad4: 'Pad 4' };
const touchIn = { x: 0, y: 0, jump: false, attack: false, special: false, shield: false };
const isTouch = window.matchMedia('(pointer: coarse)').matches;
let pads = [];

function pollPads() {
  pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
}

function readKeys(map, into) {
  const has = (list) => list.some((c) => keys.has(c));
  if (has(map.left)) into.x -= 1;
  if (has(map.right)) into.x += 1;
  if (has(map.up)) into.y -= 1;
  if (has(map.down)) into.y += 1;
  into.jump = into.jump || has(map.jump);
  into.attack = into.attack || has(map.attack);
  into.special = into.special || has(map.special);
  into.shield = into.shield || has(map.shield);
}

function readPad(i, into) {
  const p = pads[i];
  if (!p || !p.connected) return;
  const b = (n) => !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.4));
  let x = p.axes[0] || 0;
  let y = p.axes[1] || 0;
  if (Math.hypot(x, y) < 0.28) { x = 0; y = 0; }
  if (b(14)) x = -1;
  if (b(15)) x = 1;
  if (b(12)) y = -1;
  if (b(13)) y = 1;
  into.x += x;
  into.y += y;
  into.attack = into.attack || b(0);
  into.special = into.special || b(1);
  into.jump = into.jump || b(2) || b(3);
  into.shield = into.shield || b(4) || b(5) || b(6) || b(7);
}

// The sources each local person uses. Player one also picks up any keys or pads nobody else has.
function deviceInput(src, extras) {
  const i = blank();
  if (src === 'keys1' || src === 'keys2') readKeys(KEYMAPS[src], i);
  if (src && src.startsWith('pad')) readPad(Number(src.slice(3)) - 1, i);
  for (const e of extras) {
    if (e === 'solo') readKeys(KEYMAPS.solo, i);
    else if (e === 'touch') {
      i.x += touchIn.x; i.y += touchIn.y;
      i.jump = i.jump || touchIn.jump; i.attack = i.attack || touchIn.attack;
      i.special = i.special || touchIn.special; i.shield = i.shield || touchIn.shield;
    } else if (e.startsWith('pad')) readPad(Number(e.slice(3)) - 1, i);
  }
  i.x = clamp(i.x, -1, 1);
  i.y = clamp(i.y, -1, 1);
  return i;
}

function inputFor(f) {
  if (phase === 'countdown' || phase === 'over' || pauseShown && f === me) return blank();
  if (f.kind === 'cpu') return aiInput(f);
  return deviceInput(f.input, f.extras || []);
}

// What was pressed this frame, and how long ago the stick was tapped (for smash attacks).
function edges(f) {
  const i = f.inp;
  const p = f.prev;
  f.pr = {
    jump: i.jump && !p.jump, attack: i.attack && !p.attack, special: i.special && !p.special, shield: i.shield && !p.shield,
    up: i.y < -0.6 && p.y >= -0.6, down: i.y > 0.6 && p.y <= 0.6,
  };
  const tapped = (a, b) => Math.abs(a) > 0.7 && (Math.abs(b) < 0.3 || sign(a) !== sign(b));
  f.tapX = tapped(i.x, p.x) ? 0 : f.tapX + 1;
  f.tapY = tapped(i.y, p.y) ? 0 : f.tapY + 1;
  // Up jumps, unless an attack or special follows within a few frames: then it's an up attack.
  let tapJump = false;
  if (f.pr.up && !f.pr.attack && !f.pr.special) f.upPend = TAP_JUMP;
  else if (f.upPend > 0) {
    if (f.pr.attack || f.pr.special) f.upPend = 0;
    else if (--f.upPend === 0 && i.y < -0.5) tapJump = true;
  }
  f.wantJump = f.pr.jump || tapJump;
  f.mash = f.pr.jump || f.pr.attack || f.pr.special || f.pr.shield || f.tapX === 0 || f.tapY === 0;
}

// ---------- Moves ----------
function startMove(f, id) {
  const m = f.def.moves[id];
  if (!m) return false;
  f.state = 'attack';
  f.move = m;
  f.moveId = id;
  f.mf = 0;
  f.sf = 0;
  f.charge = 0;
  f.hitSet.clear();
  f.trail.length = 0;
  f.ff = false;
  if (m.start) m.start(f);
  if (m.on && m.on[0]) m.on[0](f);
  if (m.hits && !m.on) audio.play('swing');
  return true;
}

function endMove(f) {
  const m = f.move;
  f.move = null;
  f.moveId = '';
  f.sf = 0;
  f.hidden = false;
  if (f.grounded) f.state = 'idle';
  else f.state = m && m.helpless ? 'helpless' : 'air';
}

function groundAttack(f) {
  const i = f.inp;
  if (i.shield) return startMove(f, 'grab');
  if (i.y < -0.5) return startMove(f, f.tapY <= SMASH_WINDOW ? 'usmash' : 'utilt');
  if (i.y > 0.5) return startMove(f, f.tapY <= SMASH_WINDOW ? 'dsmash' : 'dtilt');
  if (Math.abs(i.x) > 0.5) {
    if (f.tapX <= SMASH_WINDOW) { f.facing = sign(i.x); return startMove(f, 'fsmash'); }
    if (f.state === 'run' && Math.abs(f.vx) > f.def.stats.run * 0.6) return startMove(f, 'dash');
    f.facing = sign(i.x);
    return startMove(f, 'ftilt');
  }
  return startMove(f, 'jab');
}

function airAttack(f) {
  const i = f.inp;
  if (i.y < -0.5 && Math.abs(i.y) >= Math.abs(i.x)) return startMove(f, 'uair');
  if (i.y > 0.5 && Math.abs(i.y) >= Math.abs(i.x)) return startMove(f, 'dair');
  if (i.x * f.facing > 0.5) return startMove(f, 'fair');
  if (i.x * f.facing < -0.5) return startMove(f, 'bair');
  return startMove(f, 'nair');
}

function special(f) {
  const i = f.inp;
  let id = 'nspec';
  if (i.y < -0.5 && Math.abs(i.y) >= Math.abs(i.x) * 0.8) id = 'uspec';
  else if (i.y > 0.5 && Math.abs(i.y) > Math.abs(i.x)) id = 'dspec';
  else if (Math.abs(i.x) > 0.5) id = 'sspec';
  const m = f.def.moves[id];
  if (!m) return false;
  if (m.once && !f.grounded) {
    if (f.airUsed[m.once]) return false;
    f.airUsed[m.once] = true;
  }
  if (id === 'sspec') f.facing = sign(i.x) || f.facing;
  else if (Math.abs(i.x) > 0.5 && f.grounded) f.facing = sign(i.x);
  return startMove(f, id);
}

const valueOf = (v, f) => (typeof v === 'function' ? v(f) : v);

function testHits(f, h, k) {
  const m = f.move;
  for (const t of fighters) {
    if (t === f || !hittable(t)) continue;
    const key = `${k}:${t.slot}`;
    if (f.hitSet.has(key)) continue;
    const box = hurtbox(t);
    for (const [bx, by, r] of h.b) {
      const cx = f.x + bx * f.facing;
      const cy = f.y + by;
      if (!circleHitsRect(cx, cy, r, box)) continue;
      f.hitSet.add(key);
      let d = valueOf(h.d, f);
      if (m.smash) d = Math.round(d * (1 + 0.4 * f.charge / 60));
      const dir = h.back ? -f.facing : h.rev ? (sign(t.x - f.x) || f.facing) : f.facing;
      const lag = Math.round(4 + d * 0.45);
      emitEvent({
        t: 'hit', a: f.slot, v: t.slot, d, ang: valueOf(h.a, f), bk: valueOf(h.bk, f), kg: h.kg, fx: h.fx || f.def.fx, dir, lag,
        x: r1((cx + t.x) / 2), y: r1((cy + t.y - t.def.h * 0.5) / 2), chill: h.chill || 0,
      });
      f.hitlag = Math.max(f.hitlag, lag);
      if (h.bounce) f.hitSomeone = true;
      break;
    }
  }
}

function testGrab(f, gb) {
  for (const t of fighters) {
    if (t === f || !hittable(t) || !t.groundedFlag) continue;
    if (t.state === 'grabbed' || t.state === 'hang') continue;
    const box = hurtbox(t);
    if (!gb.b.some(([bx, by, r]) => circleHitsRect(f.x + bx * f.facing, f.y + by, r, box))) continue;
    f.state = 'hold';
    f.move = null;
    f.moveId = '';
    f.holding = t.slot;
    f.holdT = 0;
    f.sf = 0;
    f.vx = 0;
    emitEvent({ t: 'grab', a: f.slot, v: t.slot });
    return;
  }
}

function doThrow(f, thr) {
  const v = fighters[f.holding];
  f.holding = -1;
  if (!v) return;
  const d = thr.d;
  emitEvent({
    t: 'hit', a: f.slot, v: v.slot, d, ang: thr.a, bk: thr.bk, kg: thr.kg, fx: thr.fx || f.def.fx, dir: f.facing,
    lag: 5, x: r1(v.x), y: r1(v.y - v.def.h * 0.5), thr: 1,
  });
}

// Where a held fighter sits: in front of the holder, swung round for a back throw, lifted for an up throw.
function holdPos(h) {
  const R = h.def.w * 0.5 + 26;
  let a = 0;
  let lift = 0;
  if (h.state === 'attack' && h.moveId === 'bthrow') a = clamp(h.mf / 12, 0, 1) * Math.PI;
  if (h.state === 'attack' && h.moveId === 'uthrow') lift = clamp(h.mf / 10, 0, 1) * 70;
  return { x: h.x + h.facing * R * Math.cos(a), y: h.y - Math.sin(a) * 40 - lift };
}

// ---------- Hits ----------
function knockback(p, d, w, bk, kg) {
  return ((((p / 10) + (p * d / 20)) * (200 / (w + 100)) * 1.4) + 18) * (kg / 100) + bk;
}

// Run by the browser that runs the victim.
function applyHit(v, h) {
  if (!alive(v) || v.state === 'respawn') return;
  const att = fighters[h.a];
  if (h.thr) {
    if (v.state !== 'grabbed' || v.heldBy !== h.a) return;
  } else if (intangible(v)) return;
  const m = v.state === 'attack' ? v.move : null;
  if (!h.thr && m && m.counter && v.mf >= m.counter[0] && v.mf <= m.counter[1]) {
    audio.play('counter');
    effects.push({ kind: 'flash', x: v.x, y: v.y - v.def.h * 0.5, life: 10, max: 10, color: '#ffffff' });
    m.onCounter(v, att, h);
    return;
  }
  if (!h.thr && (v.state === 'shield' || v.state === 'shieldstun')) {
    v.shield -= h.d * 1.1 + 2;
    v.vx = h.dir * Math.min(8, 1.5 + h.d * 0.35);
    v.state = 'shieldstun';
    v.sf = 0;
    v.stun = Math.round(4 + h.d * 0.6);
    v.hitlag = h.lag;
    if (v.shield <= 0) shieldBreak(v);
    return;
  }
  v.damage = Math.min(999, v.damage + h.d);
  let kb = knockback(v.damage, h.d, v.def.stats.weight, h.bk, h.kg);
  if (m && m.armor && v.mf >= m.armor[0] && v.mf <= m.armor[1] && kb < 130) {
    v.hitlag = h.lag;
    v.flash = 6;
    return;
  }
  releaseGrabs(v);
  let ang = h.ang;
  if (ang === 361) ang = v.grounded && kb < 60 ? 8 : 40;
  if (ang < 0 && v.grounded) { ang = Math.min(80, -ang * 0.8); kb *= 0.8; }
  let dir = h.dir || 1;
  if (ang > 90) { ang = 180 - ang; dir = -dir; }
  // Directional influence: holding across the launch bends it a little.
  let cx = Math.cos(ang * D2R) * dir;
  let cy = Math.sin(ang * D2R);
  const cross = clamp(cx * -v.inp.y - cy * v.inp.x, -1, 1);
  const bend = cross * 14 * D2R;
  [cx, cy] = [cx * Math.cos(bend) - cy * Math.sin(bend), cx * Math.sin(bend) + cy * Math.cos(bend)];
  const sp = kb * LAUNCH_K;
  v.lx = cx * sp;
  v.ly = -cy * sp;
  v.vx = 0;
  v.vy = 0;
  if (v.grounded && v.ly < -1.5) v.grounded = null;
  else if (v.grounded) v.ly = 0;
  v.hitstun = Math.floor(kb * HITSTUN_K);
  v.tumble = kb > 75;
  v.hitlag = h.lag;
  v.state = 'hitstun';
  v.sf = 0;
  v.move = null;
  v.moveId = '';
  v.hidden = false;
  v.ff = false;
  v.airUsed = {};
  v.flash = 5;
  v.lastHitBy = h.a;
  v.lastHitT = clock;
  if (h.chill) v.chill = Math.max(v.chill, h.chill);
  if (v.kind !== 'cpu' && v.owned && kb > 90) shake(Math.min(14, kb * 0.06));
}

function shieldBreak(v) {
  audio.play('break');
  burst('glint', v.x, v.y - v.def.h * 0.6, 14, 50);
  v.state = 'dizzy';
  v.sf = 0;
  v.vy = -9;
  v.grounded = null;
  v.shield = SHIELD_MAX * 0.6;
}

// A fighter that's hit lets go of anyone it holds, and is let go of if held.
function releaseGrabs(f) {
  if (f.holding >= 0) {
    const v = fighters[f.holding];
    f.holding = -1;
    if (v && v.owned && v.state === 'grabbed') releaseHeld(v);
  }
  if (f.state === 'grabbed') { f.heldBy = -1; f.state = 'air'; }
}

// Let go without a throw: the held fighter hops free.
function releaseHeld(v) {
  v.state = 'air';
  v.heldBy = -1;
  v.grounded = null;
  v.vy = -6;
  v.vx = -v.facing * 3;
  v.sf = 0;
  v.invuln = Math.max(v.invuln, 12);
}

// ---------- Events ----------
// Hits, grabs and KOs go to every browser in the room through the host. The browser that runs the
// victim applies the hit; everyone shows the spark.
function emitEvent(e) {
  handleEvent(e);
  if (!room) return;
  const msg = { t: 'ev', m: matchId, e };
  if (room.isHost) room.broadcast(msg);
  else room.send(msg);
}

function handleEvent(e) {
  const v = fighters[e.v];
  const a = fighters[e.a];
  switch (e.t) {
    case 'hit': {
      if (!v) return;
      if (v.owned) applyHit(v, e);
      const shielded = v.state === 'shield' || v.state === 'shieldstun';
      hitSpark(e, shielded);
      return;
    }
    case 'grab': {
      audio.play('grab');
      if (!v || !v.owned) return;
      if (!alive(v) || intangible(v) || v.state === 'grabbed') { emitEvent({ t: 'ungrab', a: e.a }); return; }
      releaseGrabs(v);
      v.state = 'grabbed';
      v.heldBy = e.a;
      v.heldT = 0;
      v.sf = 0;
      v.move = null;
      v.moveId = '';
      v.vx = v.vy = v.lx = v.ly = 0;
      if (a) v.facing = -a.facing;
      return;
    }
    case 'ungrab':
      if (a && a.owned && a.state === 'hold') { a.state = 'idle'; a.holding = -1; }
      return;
    case 'ko': {
      if (!v) return;
      if (e.by >= 0 && fighters[e.by]) fighters[e.by].kos++;
      if (!v.owned) {
        v.falls++;
        if (e.by < 0) v.sds++;
        v.stocks = e.stocks;
      }
      if (e.stocks <= 0 && !v.outOrder) { v.out = true; v.outOrder = ++outCount; }
      koBlast(v, e.x, e.y);
      return;
    }
    default:
  }
}

// ---------- Owned fighters, frame by frame ----------
function stepFighter(f) {
  edges(f);
  if (f.out) return;
  if (f.flash > 0) f.flash--;
  if (f.hitlag > 0) { f.hitlag--; return; }
  f.sf++;
  if (f.invuln > 0) f.invuln--;
  if (f.dropT > 0) f.dropT--;
  if (f.ledgeCD > 0) f.ledgeCD--;
  if (f.chill > 0) f.chill--;
  if (f.flipT > 0) f.flipT--;
  if (f.state !== 'shield') f.shield = Math.min(SHIELD_MAX, f.shield + 0.12);
  const st = f.def.stats;
  const i = f.inp;
  const pr = f.pr;

  switch (f.state) {
    case 'dead':
      if (f.sf >= RESPAWN_WAIT) respawn(f);
      return;
    case 'respawn':
      f.vx = 0;
      f.vy = 0;
      if (f.sf > 240 || (f.sf > 20 && (Math.abs(i.x) > 0.5 || i.y > 0.5 || pr.jump || pr.attack || pr.special))) {
        f.state = 'air';
        f.sf = 0;
        f.invuln = RESPAWN_INVULN;
        f.grounded = null;
      }
      return;
    case 'jumpsquat':
      if (pr.attack && i.y < -0.5) { startMove(f, 'usmash'); break; }
      if (pr.special && i.y < -0.5) { special(f); break; }
      if (f.sf >= 3) {
        const full = i.jump || i.y < -0.5;
        f.vy = -(full ? st.jump : st.jump * 0.64);
        f.vx = clamp(f.vx * 0.7 + i.x * st.air * 0.5, -st.air * 1.2, st.air * 1.2);
        f.grounded = null;
        f.state = 'air';
        f.sf = 0;
        audio.play('jump');
        burst('dust', f.x, f.y, 4, 20);
      }
      break;
    case 'idle': case 'run': case 'crouch': case 'land': {
      if (f.state === 'land' && f.sf < f.landLag) { friction(f, 1); break; }
      if (f.state === 'land') f.state = 'idle';
      if (groundActions(f)) break;
      if (i.y > 0.6 && Math.abs(i.x) < 0.5) {
        if (pr.down && f.grounded && !f.grounded.solid) { dropThrough(f); break; }
        f.state = 'crouch';
        friction(f, 1);
        break;
      }
      if (Math.abs(i.x) > 0.3) {
        f.facing = sign(i.x);
        const run = st.run * (f.chill > 0 ? 0.7 : 1);
        f.vx = approach(f.vx, i.x * run, run * 0.18);
        if (f.state !== 'run') { f.state = 'run'; f.sf = 0; burst('dust', f.x - f.facing * 10, f.y, 2, 10); }
      } else {
        friction(f, 1);
        if (f.state !== 'idle') { f.state = 'idle'; f.sf = 0; }
      }
      break;
    }
    case 'air': case 'helpless': {
      airDrift(f, f.state === 'helpless' ? 0.65 : 1);
      if (pr.down && f.vy > -3) f.ff = true;
      if (f.state === 'helpless') break;
      if (f.wantJump && f.airJumps > 0) {
        f.airJumps--;
        f.vy = -st.djump;
        f.vx = i.x * st.air;
        f.ly = Math.min(0, f.ly) * 0.3;
        f.lx *= 0.3;
        f.ff = false;
        f.flipT = 22;
        audio.play('jump');
        effects.push({ kind: 'ring', x: f.x, y: f.y, r: 34, color: '#ffffff', life: 14, max: 14, flat: true });
      } else if (pr.attack) airAttack(f);
      else if (pr.special) special(f);
      else if (pr.shield && !f.airDodged) startDodge(f, 'air');
      break;
    }
    case 'attack':
      stepMove(f);
      break;
    case 'hitstun':
      f.hitstun--;
      if (f.grounded) friction(f, 0.5);
      if (f.hitstun <= 0) {
        f.state = f.grounded ? 'idle' : 'air';
        f.sf = 0;
      }
      break;
    case 'shield':
      friction(f, 1);
      f.shield -= 0.14;
      if (f.shield <= 0) { shieldBreak(f); break; }
      if (!i.shield) { f.state = 'land'; f.landLag = 5; f.sf = 0; break; }
      if (f.wantJump) { f.state = 'jumpsquat'; f.sf = 0; break; }
      if (pr.attack) { startMove(f, 'grab'); break; }
      if (f.tapX <= 1 && Math.abs(i.x) > 0.7) { startDodge(f, 'roll', sign(i.x)); break; }
      if (pr.down) { startDodge(f, 'spot'); break; }
      break;
    case 'shieldstun':
      friction(f, 0.6);
      if (f.sf >= f.stun) { f.state = i.shield ? 'shield' : 'idle'; f.sf = 0; }
      break;
    case 'dodge':
      stepDodge(f);
      break;
    case 'hang':
      stepHang(f);
      return;
    case 'climb': {
      const L = f.ledge;
      const k = clamp(f.sf / 22, 0, 1);
      f.x = lerp(f.climbFrom.x, L.x - L.side * f.def.w * 0.6, ease(k));
      f.y = lerp(f.climbFrom.y, L.y, ease(Math.min(1, k * 1.6)));
      if (f.sf >= 22) { f.state = 'idle'; f.sf = 0; f.grounded = L.s; f.ledge = null; f.y = L.y; f.vx = 0; f.vy = 0; }
      return;
    }
    case 'down':
      friction(f, 0.6);
      if ((f.sf > 22 && (f.mash || Math.abs(i.x) > 0.5)) || f.sf > 80) {
        f.state = 'getup';
        f.sf = 0;
        if (Math.abs(i.x) > 0.5) f.vx = sign(i.x) * 7;
      }
      break;
    case 'getup':
      friction(f, 0.5);
      if (f.sf >= 20) { f.state = 'idle'; f.sf = 0; }
      break;
    case 'dizzy':
      friction(f, 1);
      if (!f.grounded) airDrift(f, 0.2);
      if (f.mash) f.sf += 6;
      if (f.sf >= 240) { f.state = f.grounded ? 'idle' : 'air'; f.sf = 0; }
      break;
    case 'hold': {
      friction(f, 1);
      f.holdT++;
      const v = fighters[f.holding];
      if (!v || !alive(v) || (f.holdT > 12 && v.netState && v.netState !== 'grabbed' && !v.owned)) { f.state = 'idle'; f.holding = -1; break; }
      if (v.owned && v.state !== 'grabbed' && f.holdT > 2) { f.state = 'idle'; f.holding = -1; break; }
      if (f.holdT < 8) break;
      let id = null;
      if (i.y < -0.5) id = 'uthrow';
      else if (i.y > 0.5) id = 'dthrow';
      else if (i.x * f.facing > 0.5) id = 'fthrow';
      else if (i.x * f.facing < -0.5) id = 'bthrow';
      else if (pr.attack || f.holdT > 80) id = 'fthrow';
      if (id) { const hold = f.holding; startMove(f, id); f.holding = hold; audio.play('throw'); }
      break;
    }
    case 'grabbed': {
      const h = fighters[f.heldBy];
      f.heldT += f.mash ? 7 : 1;
      const held = h && alive(h) && (h.owned
        ? (h.state === 'hold' || h.state === 'attack') && h.holding === f.slot
        : (h.netState === 'hold' || h.netState === 'attack') && h.holding === f.slot);
      if (!held && f.sf > 10) { releaseHeld(f); return; }
      if (f.heldT > 110 + f.damage * 0.6) {
        releaseHeld(f);
        f.vx = -f.facing * 6;
        return;
      }
      if (h) {
        const p = holdPos(h);
        f.x = p.x;
        f.y = p.y;
        f.facing = -h.facing;
      }
      f.vx = f.vy = f.lx = f.ly = 0;
      return;
    }
    default:
      break;
  }
  physics(f);
  const B = stage.blast;
  if (f.x < B.l || f.x > B.r || f.y > B.b || f.y < B.t) ko(f);
}

function groundActions(f) {
  const i = f.inp;
  const pr = f.pr;
  if (pr.attack) return groundAttack(f);
  if (pr.special) return special(f);
  if (f.wantJump) { f.state = 'jumpsquat'; f.sf = 0; return true; }
  if (pr.shield || (i.shield && f.state !== 'land')) {
    f.state = 'shield';
    f.sf = 0;
    return true;
  }
  return false;
}

function friction(f, k) {
  const tr = f.def.stats.traction;
  f.vx = approach(f.vx, 0, tr * 1.1 * k);
}

function airDrift(f, mul) {
  const st = f.def.stats;
  const x = f.inp.x;
  const chill = f.chill > 0 ? 0.75 : 1;
  if (Math.abs(x) > 0.2) {
    const target = x * st.air * mul * chill;
    if (Math.abs(f.vx) < Math.abs(target) || sign(f.vx) !== sign(target)) f.vx = approach(f.vx, target, st.airAcc * mul);
  } else f.vx *= 0.985;
}

function dropThrough(f) {
  f.grounded = null;
  f.dropT = 14;
  f.state = 'air';
  f.sf = 0;
  f.y += 2;
  f.vy = 2;
}

function startDodge(f, kind, dir = 0) {
  f.state = 'dodge';
  f.sf = 0;
  if (kind === 'roll') f.dodge = { kind, dir, i0: 4, i1: 18, dur: 30 };
  else if (kind === 'spot') f.dodge = { kind, dir: 0, i0: 3, i1: 16, dur: 24 };
  else {
    f.airDodged = true;
    const i = f.inp;
    const n = Math.hypot(i.x, i.y);
    f.dodge = { kind, dir: 0, i0: 3, i1: 24, dur: 34, dx: n > 0.4 ? i.x / n : 0, dy: n > 0.4 ? i.y / n : 0 };
    if (n > 0.4) { f.vx = f.dodge.dx * 10; f.vy = f.dodge.dy * 10; f.lx = 0; f.ly = 0; }
    f.ff = false;
  }
  audio.play('whoosh');
}

function stepDodge(f) {
  const d = f.dodge;
  if (d.kind === 'roll') {
    if (f.sf >= 3 && f.sf <= 20) f.vx = d.dir * 8.5;
    else friction(f, 2);
  } else if (d.kind === 'spot') friction(f, 2);
  else if (d.dx || d.dy) {
    if (f.sf < 20) { f.vx *= 0.88; f.vy *= 0.88; f.noGrav = true; } else f.noGrav = false;
  }
  if (f.sf >= d.dur) {
    if (d.kind === 'roll') f.facing = -d.dir;
    f.noGrav = false;
    f.state = f.grounded ? 'idle' : 'air';
    f.sf = 0;
  }
}

function stepMove(f) {
  const m = f.move;
  let hold = false;
  if (m.charge && f.mf === m.charge.at && f.inp[m.charge.btn] && f.charge < m.charge.max) { f.charge++; hold = true; }
  f.noGrav = m.grav === 0;
  if (m.tick && m.tick(f, f.mf, api) === 'hold') hold = true;
  if (f.state !== 'attack' || f.move !== m) return;
  if (m.hits) for (let k = 0; k < m.hits.length; k++) {
    const h = m.hits[k];
    if (f.mf >= h.f[0] && f.mf <= h.f[1]) testHits(f, h, k);
  }
  if (f.state !== 'attack' || f.move !== m) return;
  if (m.grab && f.mf >= m.grab.f[0] && f.mf <= m.grab.f[1]) { testGrab(f, m.grab); if (f.state !== 'attack') return; }
  if (m.thr && f.mf === m.thr.f) doThrow(f, m.thr);
  if (f.grounded) friction(f, m.fric !== undefined ? m.fric : 1);
  else {
    airDrift(f, m.air ? 1 : 0.6);
    if (m.air && f.pr.down && f.vy > -3) f.ff = true;
  }
  if (!hold) {
    f.mf++;
    if (m.on && m.on[f.mf]) m.on[f.mf](f);
    if (m.vis) m.vis(f, f.mf);
    if (m.hits && m.hits.some((h) => h.f[0] === f.mf) && m.on) audio.play('swing');
  } else if (m.vis) m.vis(f, f.mf);
  if (f.state !== 'attack' || f.move !== m) return;
  if (m.iasa && f.mf >= m.iasa) {
    if (f.pr.attack && f.inp.x === 0 && f.inp.y === 0 && f.moveId === 'jab') { startMove(f, 'jab'); return; }
    if (f.grounded && (f.wantJump || f.pr.special || Math.abs(f.inp.x) > 0.5 || f.pr.attack)) { endMove(f); groundActions(f); return; }
  }
  if (f.mf >= m.dur) endMove(f);
}

function stepHang(f) {
  const L = f.ledge;
  const i = f.inp;
  f.vx = f.vy = f.lx = f.ly = 0;
  f.x = L.x + L.side * f.def.w * 0.32;
  f.y = L.y + f.def.hangY;
  f.facing = -L.side;
  if (f.sf < 8) return;
  const toStage = i.x * -L.side > 0.5;
  const away = i.x * L.side > 0.5 || i.y > 0.6;
  if (f.sf > HANG_MAX || away) {
    f.state = 'air';
    f.sf = 0;
    f.ledge = null;
    f.ledgeCD = 30;
    f.x += L.side * 8;
    return;
  }
  if (f.wantJump || f.pr.up) {
    f.state = 'air';
    f.sf = 0;
    f.ledge = null;
    f.ledgeCD = 30;
    f.vy = -f.def.stats.jump * 1.05;
    f.y = L.y + f.def.hangY * 0.4;
    f.x = L.x - L.side * 4;
    f.invuln = Math.max(f.invuln, 6);
    audio.play('jump');
    return;
  }
  if (f.pr.attack || f.pr.special) {
    f.x = L.x - L.side * f.def.w * 0.6;
    f.y = L.y;
    f.grounded = L.s;
    f.ledge = null;
    startMove(f, 'ledgeAtk');
    return;
  }
  if (toStage || f.pr.shield) {
    f.state = 'climb';
    f.sf = 0;
    f.climbFrom = { x: f.x, y: f.y };
  }
}

function respawn(f) {
  f.state = 'respawn';
  f.sf = 0;
  f.x = stage.spawns[f.slot] * 0.6;
  f.y = -380;
  f.vx = f.vy = f.lx = f.ly = 0;
  f.damage = 0;
  f.grounded = null;
  f.facing = f.x > 0 ? -1 : 1;
  f.airJumps = f.def.stats.jumps - 1;
  f.airUsed = {};
  f.shield = SHIELD_MAX;
  f.chill = 0;
  f.hidden = false;
}

function ko(f) {
  const B = stage.blast;
  const x = clamp(f.x, B.l, B.r);
  const y = clamp(f.y - f.def.h * 0.5, B.t, B.b);
  releaseGrabs(f);
  const by = f.lastHitBy >= 0 && clock - f.lastHitT < 720 ? f.lastHitBy : -1;
  f.stocks--;
  f.falls++;
  if (by < 0) f.sds++;
  f.damage = 0;
  f.state = 'dead';
  f.sf = 0;
  f.move = null;
  f.moveId = '';
  f.vx = f.vy = f.lx = f.ly = 0;
  f.lastHitBy = -1;
  f.hidden = false;
  emitEvent({ t: 'ko', v: f.slot, by, stocks: f.stocks, x: Math.round(x), y: Math.round(y) });
  if (f.stocks <= 0) f.out = true;
}

// ---------- Physics ----------
function physics(f) {
  const st = f.def.stats;
  const m = f.state === 'attack' ? f.move : null;
  if (!f.grounded) {
    let g = st.grav * (m && m.grav !== undefined ? m.grav : 1);
    if (f.noGrav) g = 0;
    if (f.state === 'hitstun') g *= 0.5;
    const max = f.ff ? st.ffall : st.fall;
    if (f.ff && f.vy < max && f.vy > -1 && !f.noGrav) f.vy = max;
    else if (f.vy < max) f.vy = Math.min(max, f.vy + g);
  }
  if (f.lx || f.ly) {
    const mag = Math.hypot(f.lx, f.ly);
    if (mag <= LAUNCH_DECAY) { f.lx = 0; f.ly = 0; } else { const k = (mag - LAUNCH_DECAY) / mag; f.lx *= k; f.ly *= k; }
  }
  if (f.grounded && f.grounded.dx) f.x += f.grounded.dx;
  const ox = f.x;
  const oy = f.y;
  f.x += f.vx + f.lx;
  f.y += f.vy + f.ly;
  collide(f, ox, oy);
  if (!f.grounded) tryLedge(f);
  f.groundedFlag = !!f.grounded;
}

// Fighters stop at the edge of what they stand on unless they mean to go off it.
function stopsAtEdge(f) {
  if (f.state === 'run' || f.state === 'hitstun' || f.state === 'air' || f.state === 'dizzy') return false;
  if (f.state === 'attack' && /spec$/.test(f.moveId)) return false;
  return true;
}

function collide(f, ox, oy) {
  const hw = f.def.w / 2;
  const h = f.def.h;
  if (f.grounded) {
    const s = f.grounded;
    const leaving = f.vy < 0 || f.ly < -1.5;
    if (leaving) f.grounded = null;
    else if (f.x < s.x1 || f.x > s.x2) {
      if (stopsAtEdge(f)) { f.x = clamp(f.x, s.x1, s.x2); f.vx = 0; f.lx = 0; f.y = s.y; } else {
        f.grounded = null;
        if (f.state === 'idle' || f.state === 'run' || f.state === 'land' || f.state === 'crouch') { f.state = 'air'; f.sf = 0; }
      }
    } else { f.y = s.y; f.vy = 0; f.ly = 0; }
  }
  if (!f.grounded) {
    const falling = f.vy + f.ly >= 0;
    for (const s of surfaces) {
      if (!falling || oy > s.y + 0.5 || f.y < s.y || f.x < s.x1 || f.x > s.x2) continue;
      if (!s.solid && (f.dropT > 0 || (f.inp.y > 0.6 && f.state !== 'hitstun' && f.state !== 'helpless'))) continue;
      f.y = s.y;
      land(f, s);
      if (f.grounded) break;
    }
    for (const s of surfaces) {
      if (!s.solid) continue;
      if (f.x + hw <= s.x1 || f.x - hw >= s.x2 || f.y <= s.y + 1 || f.y - h >= s.y + s.h) continue;
      if (oy - h >= s.y + s.h - 2) { f.y = s.y + s.h + h; f.vy = Math.max(0, f.vy); f.ly = Math.max(0, -f.ly * 0.5); continue; }
      if (f.x < (s.x1 + s.x2) / 2) f.x = s.x1 - hw; else f.x = s.x2 + hw;
      if (f.state === 'hitstun' && Math.abs(f.lx) > 6) { f.lx = -f.lx * 0.6; audio.play('land'); } else f.lx = 0;
      f.vx = 0;
    }
  }
}

function land(f, s) {
  const st = f.def.stats;
  if (f.state === 'hitstun' && f.ly > 6 && f.tumble) {
    // A hard spike bounces off the floor.
    f.ly = -f.ly * 0.55;
    f.vy = 0;
    burst('dust', f.x, f.y, 10, 40);
    shake(4);
    return;
  }
  f.grounded = s;
  f.vy = 0;
  f.ly = 0;
  f.airJumps = st.jumps - 1;
  f.airUsed = {};
  f.airDodged = false;
  f.ff = false;
  f.ledgeInv = true;
  f.flipT = 0;
  switch (f.state) {
    case 'attack': {
      const m = f.move;
      if (m.keepOnLand) break;
      const lag = m.air ? m.landLag : (m.landLag !== undefined ? m.landLag : 10);
      f.move = null;
      f.moveId = '';
      f.hidden = false;
      f.state = 'land';
      f.landLag = lag;
      f.sf = 0;
      break;
    }
    case 'air': case 'helpless':
      f.landLag = f.state === 'helpless' ? 18 : 3;
      f.state = 'land';
      f.sf = 0;
      audio.play('land');
      burst('dust', f.x, f.y, 3, 18);
      break;
    case 'hitstun':
      if (f.tumble) { f.state = 'down'; f.sf = 0; f.lx *= 0.5; burst('dust', f.x, f.y, 8, 30); audio.play('land'); }
      break;
    case 'dodge':
      f.state = 'land';
      f.landLag = 10;
      f.sf = 0;
      f.noGrav = false;
      break;
    case 'dizzy':
      break;
    default:
      break;
  }
}

function tryLedge(f) {
  if (f.ledgeCD > 0 || f.inp.y > 0.6) return;
  const okState = f.state === 'air' || f.state === 'helpless' || (f.state === 'attack' && f.move.helpless && f.mf > 8);
  if (!okState || f.vy + f.ly < 0) return;
  for (const L of ledges) {
    if (fighters.some((o) => o !== f && o.state === 'hang' && o.ledge === L)) continue;
    const hx = f.x - L.x;
    const handY = f.y - f.def.hangY;
    const inX = L.side < 0 ? hx > -f.def.w * 1.3 && hx < 14 : hx < f.def.w * 1.3 && hx > -14;
    if (!inX || handY < L.y - 36 || handY > L.y + 46) continue;
    f.state = 'hang';
    f.sf = 0;
    f.ledge = L;
    f.move = null;
    f.moveId = '';
    f.vx = f.vy = f.lx = f.ly = 0;
    f.airJumps = f.def.stats.jumps - 1;
    f.airUsed = {};
    f.airDodged = false;
    f.ff = false;
    if (f.ledgeInv) { f.invuln = Math.max(f.invuln, 40); f.ledgeInv = false; }
    audio.play('grab');
    return;
  }
}

// What's under a point, within reach below: used by the computer to tell when it's off stage.
function groundBelow(x, y, depth = 900) {
  let best = null;
  for (const s of surfaces) {
    if (x < s.x1 - 10 || x > s.x2 + 10 || s.y < y - 5 || s.y > y + depth) continue;
    if (!best || s.y < best.y) best = s;
  }
  return best;
}

function updateSurfaces() {
  for (const s of surfaces) {
    if (!s.move) continue;
    const off = s.move.ax * Math.sin((clock / s.move.period) * TAU);
    const nx1 = s.bx1 + off;
    s.dx = nx1 - s.x1;
    s.x1 = nx1;
    s.x2 = s.bx2 + off;
  }
}

// ---------- Projectiles ----------
function stepShot(p) {
  p.age++;
  if (p.grav) p.vy += p.grav;
  if (p.grow) p.r += p.grow;
  const oy = p.y;
  p.x += p.vx;
  p.y += p.vy + (p.wave ? Math.sin(p.age * 0.18) * p.wave * 0.5 : 0);
  if (p.hug) {
    const s = groundBelow(p.x, p.y - 30, 60);
    if (!s || Math.abs(s.y - p.y) > 40) return false;
    p.y = s.y;
    if (p.age % 3 === 0) burst(p.kind === 'quake' ? 'dust' : 'snow', p.x, p.y, 1, 10);
  } else {
    for (const s of surfaces) {
      if (p.x < s.x1 || p.x > s.x2) continue;
      const enter = oy <= s.y && p.y >= s.y && p.vy > 0;
      if (p.bounce && enter) { p.y = s.y - 1; p.vy = -p.bounce; continue; }
      if (s.solid && p.y > s.y && p.y < s.y + s.h) { burst(p.fx, p.x, p.y, 6, 16); return false; }
    }
  }
  const B = stage.blast;
  if (p.age > p.life || p.x < B.l || p.x > B.r || p.y > B.b || p.y < B.t) return false;
  const owner = fighters[p.owner];
  for (const t of fighters) {
    if (t === owner || !hittable(t) || p.hitSet.has(t.slot)) continue;
    if (!circleHitsRect(p.x, p.y - (p.hug ? 14 : 0), p.r, hurtbox(t))) continue;
    p.hitSet.add(t.slot);
    emitEvent({
      t: 'hit', a: p.owner, v: t.slot, d: p.d, ang: p.a, bk: p.bk, kg: p.kg, fx: p.fx, dir: sign(p.vx) || p.facing,
      lag: Math.round(3 + p.d * 0.3), x: r1(p.x), y: r1(p.y), chill: p.chill || 0,
    });
    if (!p.pierce) return false;
  }
  return true;
}

// ---------- Fighters run by other browsers ----------
const STATES = ['idle', 'run', 'crouch', 'jumpsquat', 'air', 'helpless', 'land', 'attack', 'hitstun', 'shield', 'shieldstun',
  'dodge', 'hang', 'climb', 'down', 'getup', 'dizzy', 'hold', 'grabbed', 'dead', 'respawn'];

function packFighter(f) {
  const flags = (intangible(f) ? 1 : 0) | (f.grounded ? 2 : 0) | (f.hidden ? 4 : 0) | (f.tumble ? 8 : 0)
    | (f.out ? 16 : 0) | (f.chill > 0 ? 32 : 0) | (f.hitlag > 0 ? 64 : 0) | (f.flipT > 0 ? 128 : 0) | (f.flash > 0 ? 256 : 0);
  const d = f.dodge ? f.dodge.kind : '';
  const shots = projectiles.filter((p) => p.owner === f.slot).map((p) => [p.kind, r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r1(p.r), p.age]);
  return [f.slot, r1(f.x), r1(f.y), r1(f.vx + f.lx), r1(f.vy + f.ly), f.facing, STATES.indexOf(f.state), f.sf, f.moveId, f.mf,
    f.damage, f.stocks, flags, Math.round(f.shield), f.charge, f.holding, d, shots];
}

function unpackFighter(a, from = null) {
  const f = Array.isArray(a) && fighters[a[0]];
  if (!f || f.owned) return;
  if (from && f.peer !== from) return; // a guest may only report its own fighter
  const [, x, y, vx, vy, facing, si, sf, moveId, mf, damage, stocks, flags, shield, charge, holding, dodge, shots] = a;
  f.raw = a;
  f.net = { x, y, vx, vy, at: performance.now() };
  const state = STATES[si] || 'idle';
  if (damage > f.damage) f.pctShake = 10;
  if (state === 'dead' && f.state !== 'dead') { f.x = x; f.y = y; }
  Object.assign(f, {
    facing, sf, damage, stocks, shield, charge, holding, netFlags: flags, netState: state,
    tumble: (flags & 8) > 0, hidden: (flags & 4) > 0, groundedFlag: (flags & 2) > 0, chill: flags & 32 ? 10 : 0,
    flipT: flags & 128 ? Math.max(f.flipT, 1) : 0, flash: flags & 256 ? 2 : 0,
  });
  if (flags & 16 && !f.out) { f.out = true; f.outOrder = f.outOrder || ++outCount; }
  if (state !== f.state || moveId !== f.moveId) {
    f.state = state;
    f.moveId = moveId;
    f.move = moveId ? f.def.moves[moveId] || null : null;
    f.trail.length = 0;
  }
  if (f.move && Math.abs(mf - f.mf) > 3) f.mf = mf;
  f.dodge = dodge ? { kind: dodge, i0: 0, i1: 0 } : null;
  f.shots = shots || [];
}

function stepRemote(f) {
  const n = f.net;
  if (f.flash > 0) f.flash--;
  if (!n) return;
  const age = Math.min(15, ((performance.now() - n.at) / 1000) * 60);
  const tx = n.x + n.vx * age;
  const ty = n.y + n.vy * age;
  if (Math.hypot(tx - f.x, ty - f.y) > 240) { f.x = tx; f.y = ty; } else { f.x += (tx - f.x) * 0.4; f.y += (ty - f.y) * 0.4; }
  f.vx = n.vx;
  f.vy = n.vy;
  f.grounded = f.groundedFlag ? f.grounded || true : null;
  f.sf++;
  if (f.move) {
    const before = f.mf;
    const charging = f.move.charge && f.mf === f.move.charge.at && f.charge > 0;
    if (!charging && f.mf < f.move.dur) f.mf++;
    if (f.mf !== before && f.move.vis) f.move.vis(f, f.mf);
  }
}

// A fighter whose person left keeps fighting under the computer.
function takeOver(f) {
  if (!f || f.owned) return;
  Object.assign(f, { owned: true, kind: 'cpu', level: setup.level, peer: null, net: null, raw: null, shots: [] });
  f.ai = { queue: [], think: 0, target: -1, retarget: 0, moveX: 0, jumpCD: 0, ledgeWait: 20 };
  if (!['idle', 'air', 'dead', 'respawn'].includes(f.state)) f.state = f.groundedFlag ? 'idle' : 'air';
  if (f.grounded === true) f.grounded = groundBelow(f.x, f.y - 5, 20);
  f.move = null;
  f.moveId = '';
  f.inp = blank();
  f.prev = blank();
}

// ---------- The computer ----------
function aiInput(f) {
  const L = LEVELS[f.level] || LEVELS.normal;
  const ai = f.ai;
  if (ai.queue.length) {
    const q = ai.queue[0];
    if (--q.n <= 0) ai.queue.shift();
    return { ...blank(), ...q.i };
  }
  const out = blank();
  if (ai.jumpCD > 0) ai.jumpCD--;
  const st = f.state;
  if (st === 'dead' || f.out) return out;
  if (st === 'hitstun' || st === 'grabbed' || st === 'dizzy') {
    out.x = sign(-f.x) * 0.9;
    out.y = -0.4;
    if (clock % 4 === 0) out.attack = true;
    return out;
  }
  if (st === 'respawn') { if (f.sf > ai.ledgeWait + 20) out.x = sign(-f.x) || 1; return out; }
  if (st === 'hang') {
    if (f.sf === 1) ai.ledgeWait = Math.round(rand(8, 40) * (L.react / 14));
    if (f.sf > ai.ledgeWait) {
      const r = Math.random();
      if (r < 0.45) out.x = -f.ledge.side;
      else if (r < 0.75) out.jump = true;
      else out.attack = true;
      ai.queue.push({ n: 2, i: {} });
    }
    return out;
  }
  if (st === 'down') { if (f.sf > 24 && Math.random() < 0.2) out.x = pick([-1, 1, 0]); if (f.sf > 30) out.attack = true; return out; }
  if (!f.grounded && !groundBelow(f.x, f.y)) return aiRecover(f, out, L);
  if (st === 'attack' || st === 'jumpsquat' || st === 'land' || st === 'dodge' || st === 'climb' || st === 'getup') {
    out.x = ai.moveX;
    return out;
  }

  // Who to go after: the nearest fighter still in it, kept for a while.
  if (--ai.retarget <= 0 || !fighters[ai.target] || !alive(fighters[ai.target]) || ai.target === f.slot) {
    let best = null;
    let bd = Infinity;
    for (const o of fighters) {
      if (o === f || !alive(o) || o.state === 'respawn') continue;
      const dd = Math.hypot(o.x - f.x, (o.y - f.y) * 1.5) + rand(0, 200);
      if (dd < bd) { bd = dd; best = o; }
    }
    ai.target = best ? best.slot : -1;
    ai.retarget = Math.round(rand(60, 150));
  }
  const t = fighters[ai.target];
  if (!t) { out.x = sign(-f.x) * (Math.abs(f.x) > 100 ? 1 : 0); return out; }
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  const adx = Math.abs(dx);

  if (st === 'hold') {
    const held = fighters[f.holding] || t;
    const toEdge = sign(f.x) || 1;
    const throws = held.damage > 110 ? [toEdge * f.facing > 0 ? { x: f.facing } : { x: -f.facing }, { y: -1 }] : [{ y: 1 }, { y: -1 }, { x: f.facing }];
    ai.queue.push({ n: Math.round(rand(8, 20)), i: {} }, { n: 2, i: pick(throws) });
    return out;
  }
  if (st === 'shield' || st === 'shieldstun') {
    if (ai.shieldT-- > 0) { out.shield = true; return out; }
    if (adx < 90 && Math.random() < 0.5) { out.shield = true; out.attack = true; return out; }
    return out;
  }

  ai.think--;
  out.x = ai.moveX;
  if (ai.think > 0) return out;
  ai.think = Math.max(2, Math.round(L.react * rand(0.4, 1)));

  // Defend: shield or hop away from an attack that's coming out close by.
  const threat = (t.state === 'attack' && t.move && t.move.hits && adx < 170 && Math.abs(dy) < 130 && t.mf < (t.move.startup || 8) + 2)
    || projectiles.concat(remoteList()).some((p) => p.owner !== f.slot && Math.abs(p.x - f.x) < 140 && Math.abs(p.y - (f.y - 40)) < 80 && sign(p.vx) === sign(f.x - p.x));
  if (threat && f.grounded && Math.random() < L.shield) {
    ai.shieldT = Math.round(rand(8, 22));
    ai.moveX = 0;
    if (Math.random() < 0.25) { ai.queue.push({ n: 1, i: { shield: true } }, { n: 1, i: { shield: true, x: -sign(dx) || 1 } }); return { ...out, x: 0, shield: true }; }
    return { ...out, x: 0, shield: true };
  }

  // Attack when something will land.
  const choice = Math.random() < L.aim ? aiChooseMove(f, t, L) : null;
  if (choice) return aiPerform(f, t, choice, L);

  // Shots from range.
  if (f.def.ranged && adx > 260 && Math.abs(dy) < 100 && Math.random() < L.aggro * 0.25) {
    ai.moveX = 0;
    ai.queue.push({ n: 1, i: { x: sign(dx) } }, { n: 1, i: { special: true } }, { n: 14, i: {} });
    return out;
  }

  // Move in.
  ai.moveX = adx > 50 ? sign(dx) : 0;
  if (f.grounded) {
    const s = f.grounded;
    const nearL = f.x - s.x1 < 60;
    const nearR = s.x2 - f.x < 60;
    const tBeyond = (ai.moveX < 0 && t.x < s.x1) || (ai.moveX > 0 && t.x > s.x2);
    if ((ai.moveX < 0 && nearL) || (ai.moveX > 0 && nearR)) {
      const across = groundBelow(f.x + ai.moveX * 220, f.y - 200, 400);
      if (tBeyond && across && across !== s && Math.random() < 0.7) fullHop(ai, out);
      else if (!tBeyond || !groundBelow(t.x, t.y)) ai.moveX = 0;
    }
    if (dy < -110 && adx < 260 && Math.random() < 0.55 && ai.jumpCD <= 0) { fullHop(ai, out); ai.jumpCD = 20; }
    if (dy > 70 && !s.solid && adx < 300 && Math.random() < 0.5) { ai.queue.push({ n: 1, i: {} }, { n: 3, i: { y: 1 } }); }
    if (Math.random() < L.jumpy && ai.jumpCD <= 0) { out.jump = true; ai.jumpCD = 30; }
  } else {
    if (dy < -60 && f.airJumps > 0 && f.vy > -1 && ai.jumpCD <= 0 && Math.random() < 0.35) { out.jump = true; ai.jumpCD = 14; }
    if (dy > 120 && f.vy > 0 && Math.random() < 0.3 && groundBelow(f.x, f.y)) out.y = 1;
  }
  out.x = ai.moveX;
  return out;
}

// A jump from the ground holds the button through the jump squat, so it's a full hop, not a short one.
function fullHop(ai, out) {
  out.jump = true;
  ai.queue.push({ n: 4, i: { jump: true, x: ai.moveX } });
}

function remoteList() {
  const out = [];
  for (const f of fighters) {
    if (f.owned || !f.shots) continue;
    for (const s of f.shots) out.push({ owner: f.slot, x: s[1], y: s[2], vx: s[3] });
  }
  return out;
}

function aiChooseMove(f, t, L) {
  const air = !f.grounded;
  const ids = air ? ['nair', 'fair', 'bair', 'uair', 'dair', 'nair'] : ['jab', 'jab', 'dtilt', 'fsmash', 'usmash', 'dsmash', 'grab', 'dash', 'nspec', 'sspec', 'dspec'];
  const kill = t.damage > 95 - (t.def.stats.weight - 100) * 0.6;
  const opts = [];
  for (const id of ids) {
    const m = f.def.moves[id];
    if (!m || !m.reach) continue;
    if (id === 'dash' && !(f.state === 'run' && Math.abs(f.vx) > f.def.stats.run * 0.6)) continue;
    if (id === 'sspec' && (f.def.moves.sspec.once && f.airUsed.side)) continue;
    const k = Math.max(3, m.startup || 6);
    const px = t.x + (t.vx + (t.lx || 0)) * k * 0.6 - f.x;
    const py = t.y + (t.vy + (t.ly || 0)) * k * 0.4 - f.y - t.def.h * 0.5;
    const face = air || id === 'bair' ? f.facing : (sign(px) || f.facing);
    const rx = px * face;
    const R = m.reach;
    if (rx < R.x0 - t.def.w * 0.5 || rx > R.x1 + t.def.w * 0.5 || py < R.y0 - t.def.h * 0.5 || py > R.y1 + t.def.h * 0.5) continue;
    let w = 1;
    if (m.smash) w = kill ? 3 * L.smash : 0.6 * L.smash;
    if (id === 'grab') w = t.state === 'shield' ? 6 : 0.4;
    if (id === 'jab' || id === 'nair') w = kill ? 0.4 : 1.4;
    if (/spec$/.test(id)) w = 0.5;
    if (kill && m.hits && m.hits.some((h) => h.kg >= 90)) w *= 1.6;
    opts.push({ id, w, face });
  }
  if (!opts.length) return null;
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) { r -= o.w; if (r <= 0) return o; }
  return opts[0];
}

function aiPerform(f, t, { id, face }, L) {
  const ai = f.ai;
  ai.moveX = 0;
  const q = (n, i) => ai.queue.push({ n, i });
  const charge = () => Math.round(rand(0, 26) * (L.smash));
  switch (id) {
    case 'jab': if (face !== f.facing) q(1, { x: face }); q(1, {}); q(1, { attack: true }); break;
    case 'dtilt': q(8, { y: 1 }); q(1, { y: 1, attack: true }); break;
    case 'dash': q(1, { x: face, attack: true }); break;
    case 'fsmash': q(1, {}); q(1, { x: face, attack: true }); q(charge() + 1, { attack: true }); break;
    case 'usmash': q(1, {}); q(1, { y: -1, attack: true }); q(charge() + 1, { attack: true }); break;
    case 'dsmash': q(1, {}); q(1, { y: 1, attack: true }); q(charge() + 1, { attack: true }); break;
    case 'grab': if (face !== f.facing) q(1, { x: face }); q(1, {}); q(1, { shield: true, attack: true }); q(4, {}); break;
    case 'sspec': q(1, { x: face, special: true }); q(Math.round(rand(10, 40)), { special: true }); break;
    case 'dspec': q(1, { y: 1, special: true }); break;
    case 'nspec': if (face !== f.facing) q(1, { x: face }); q(1, {}); q(Math.round(rand(1, 30)), { special: true }); break;
    case 'nair': q(1, { attack: true }); break;
    case 'fair': q(1, { x: f.facing, attack: true }); break;
    case 'bair': q(1, { x: -f.facing, attack: true }); break;
    case 'uair': q(1, { y: -1, attack: true }); break;
    case 'dair': q(1, { y: 1, attack: true }); break;
    default: break;
  }
  q(Math.round(rand(4, 12) * (L.react / 14)), {});
  const first = ai.queue.shift();
  first.n--;
  if (first.n > 0) ai.queue.unshift(first);
  return { ...blank(), ...first.i };
}

function nearestLedge(f) {
  let best = null;
  let bd = Infinity;
  for (const L of ledges) {
    const d = Math.hypot(L.x - f.x, L.y - f.y);
    if (d < bd) { bd = d; best = L; }
  }
  return best;
}

function aiRecover(f, out, L) {
  const ai = f.ai;
  const led = nearestLedge(f);
  if (!led) return out;
  const tx = led.x - led.side * 40;
  out.x = sign(tx - f.x);
  const below = f.y - led.y;
  // Under a block: get out from beneath it before going up.
  const over = surfaces.find((s) => s.solid && f.x > s.x1 - f.def.w && f.x < s.x2 + f.def.w && f.y > s.y);
  if (over) {
    out.x = led.side;
    if (f.state === 'air' && f.airJumps > 0 && f.vy > 3 && below > 200 && ai.jumpCD <= 0) { out.jump = true; ai.jumpCD = 10; }
    return out;
  }
  if (f.state === 'air') {
    const far = Math.abs(tx - f.x);
    if (f.airJumps > 0 && (f.vy > 1 || below > 40) && ai.jumpCD <= 0 && (below > -80 || far > 150)) {
      out.jump = true;
      ai.jumpCD = 10;
    } else if (f.airJumps === 0 && f.vy > -1 && (below > 20 || far > 240) && Math.random() < L.recover) {
      const ax = tx - f.x;
      const ay = led.y - 60 - f.y;
      const n = Math.hypot(ax, ay) || 1;
      const dir = { x: clamp(ax / n * 1.3, -1, 1), y: Math.min(-0.55, ay / n) };
      ai.queue.push({ n: 30, i: dir });
      return { ...out, ...dir, special: true };
    }
  } else if (f.state === 'attack' || f.state === 'helpless') {
    out.x = sign(tx - f.x);
    out.y = -0.7;
  }
  return out;
}

// ---------- Effects ----------
function burst(kind, x, y, n, spread = 20, f = null) {
  const fx = FX[kind];
  for (let i = 0; i < n; i++) {
    const p = { kind: 'spark', x: x + rand(-spread, spread) * 0.5, y: y + rand(-spread, spread) * 0.5, vx: rand(-2, 2), vy: rand(-2, 2), life: 0, max: 0, size: 6, color: '#fff' };
    if (kind === 'fire') Object.assign(p, { kind: 'flame', vx: rand(-1, 1) - (f ? f.facing * 1.5 : 0), vy: rand(-3, -1), max: rand(14, 24), size: rand(7, 13), color: pick(FX.fire.colors) });
    else if (kind === 'ember') Object.assign(p, { vx: rand(-1, 1), vy: rand(-2, 0), max: rand(16, 30), size: rand(2, 4), color: pick(FX.fire.colors) });
    else if (kind === 'dust') Object.assign(p, { kind: 'puff', vx: rand(-2.5, 2.5), vy: rand(-1.6, -0.2), max: rand(18, 30), size: rand(8, 15), color: '#e9e2d6' });
    else if (kind === 'smoke') Object.assign(p, { kind: 'puff', vx: rand(-2, 2), vy: rand(-2, 0.5), max: rand(20, 32), size: rand(12, 20), color: '#6b5a8c' });
    else if (kind === 'snow') Object.assign(p, { vx: rand(-1.5, 1.5), vy: rand(-2, 1), max: rand(20, 34), size: rand(2, 5), color: pick(FX.ice.colors) });
    else if (kind === 'glint') Object.assign(p, { kind: 'star', vx: rand(-4, 4), vy: rand(-5, 1), max: rand(16, 26), size: rand(5, 9), color: '#ffffff' });
    else if (kind === 'elec') Object.assign(p, { kind: 'zap', vx: rand(-3, 3), vy: rand(-3, 3), max: rand(6, 12), size: rand(8, 16), color: pick(FX.elec.colors) });
    else if (fx) Object.assign(p, { vx: rand(-5, 5), vy: rand(-5, 5), max: rand(14, 26), size: rand(3, 7), color: pick(fx.colors) });
    p.life = p.max || 20;
    p.max = p.life;
    particles.push(p);
  }
}

let shakeAmt = 0;
function shake(n) { shakeAmt = Math.max(shakeAmt, n); }

function hitSpark(e, shielded) {
  const power = clamp(e.d / 14, 0.2, 1.6);
  if (shielded) {
    audio.play('shield');
    effects.push({ kind: 'ring', x: e.x, y: e.y, r: 30, color: '#9fe6ff', life: 10, max: 10 });
    return;
  }
  audio.play('hit', power);
  effects.push({ kind: 'spark', x: e.x, y: e.y, size: 16 + e.d * 2.4, color: (FX[e.fx] || FX.slash).colors[1], life: 9, max: 9, rot: Math.random() * TAU });
  burst(e.fx in FX ? e.fx : 'slash', e.x, e.y, Math.round(4 + e.d * 0.8), 20);
  if (e.d >= 14) shake(4 + e.d * 0.3);
}

function koBlast(v, x, y) {
  audio.play('ko');
  shake(18);
  effects.push({ kind: 'ko', x, y, color: v.color, life: 70, max: 70 });
  effects.push({ kind: 'screen', color: '#ffffff', life: 8, max: 8 });
  burst('glint', x, y, 20, 80);
}

function stepEffects() {
  for (const p of particles) {
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy = p.vy * 0.94 + (p.kind === 'flame' || p.kind === 'z' ? -0.05 : p.kind === 'puff' ? -0.02 : 0.12);
  }
  particles = particles.filter((p) => p.life > 0);
  if (particles.length > 600) particles.splice(0, particles.length - 600);
  for (const e of effects) e.life--;
  effects = effects.filter((e) => e.life > 0);
  shakeAmt *= 0.86;
  if (shakeAmt < 0.3) shakeAmt = 0;
}

// ---------- Match ----------
let setup = store.get('blastzone.setup', null);
if (!setup || !Array.isArray(setup.slots) || setup.slots.length !== MAXP) {
  setup = {
    stage: 'temple', stocks: 3, level: 'normal',
    slots: [
      { type: 'you', fighter: 'blaze', input: 'keys1' },
      { type: 'cpu', fighter: 'random', input: 'keys2' },
      { type: 'off', fighter: 'random', input: 'pad1' },
      { type: 'off', fighter: 'random', input: 'pad2' },
    ],
  };
}
setup.slots[0].type = 'you';
if (!rosterById(setup.slots[0].fighter) || setup.slots[0].fighter === 'random') setup.slots[0].fighter = 'blaze';
if (!STAGES.some((s) => s.id === setup.stage)) setup.stage = 'temple';
const saveSetup = () => store.set('blastzone.setup', setup);

let matchId = 0;
let matchStocks = 3;
let resultsShown = false;

const resolveFighter = (id) => (id === 'random' || !ROSTER.some((d) => d.id === id) ? pick(ROSTER).id : id);

// The people and computers in this match, in slot order.
function localLineup() {
  const look = Arcade.player.look;
  const out = [];
  const claimed = setup.slots.filter((s, i) => i > 0 && s.type === 'human').map((s) => s.input);
  setup.slots.forEach((s, i) => {
    if (s.type === 'off') return;
    const entry = { fighter: resolveFighter(s.fighter), kind: s.type === 'cpu' ? 'cpu' : 'human', level: setup.level };
    if (s.type === 'you') {
      Object.assign(entry, { name: Arcade.player.name, costume: costumeOf(look), input: 'keys1', you: true });
      entry.extras = ['touch'];
      if (!claimed.includes('keys2')) entry.extras.push('solo');
      for (let p = 1; p <= 4; p++) if (!claimed.includes(`pad${p}`)) entry.extras.push(`pad${p}`);
    } else if (s.type === 'human') Object.assign(entry, { name: `P${i + 1}`, costume: 'classic', input: s.input });
    else Object.assign(entry, { name: 'CPU', costume: 'classic' });
    out.push(entry);
  });
  return out;
}

function roomLineup() {
  const lineup = room.players.slice(0, MAXP).map((p) => ({
    fighter: resolveFighter(lobby.picks[p.id] || 'random'), kind: 'human', peer: p.id, name: p.name, costume: costumeOf(p.look),
  }));
  for (let i = lineup.length; i < MAXP; i++) {
    const s = lobby.cpus[i];
    if (s && s.type === 'cpu') lineup.push({ fighter: resolveFighter(s.fighter), kind: 'cpu', name: 'CPU', costume: 'classic', level: lobby.level });
  }
  return lineup;
}

function buildMatch({ lineup, stageId, stocks }) {
  stage = stageById(stageId);
  matchStocks = stocks;
  surfaces = [
    ...stage.solids.map((s) => ({ ...s, solid: true })),
    ...stage.plats.map((s) => ({ ...s, solid: false, bx1: s.x1, bx2: s.x2, dx: 0 })),
  ];
  ledges = [];
  for (const s of surfaces) {
    if (!s.solid) continue;
    ledges.push({ x: s.x1, y: s.y, side: -1, s }, { x: s.x2, y: s.y, side: 1, s });
  }
  clock = 0;
  updateSurfaces();
  const seen = {};
  fighters = lineup.map((cfg, i) => {
    const dup = seen[cfg.fighter] || 0;
    seen[cfg.fighter] = dup + 1;
    const owned = room ? (cfg.kind === 'cpu' ? room.isHost : cfg.peer === room.id) : true;
    const f = makeFighter(i, { ...cfg, stocks, dup }, owned);
    f.extras = cfg.extras || [];
    f.x = stage.spawns[i];
    f.y = 0;
    f.grounded = groundBelow(f.x, -5, 20);
    f.facing = f.x > 0 ? -1 : 1;
    f.groundedFlag = true;
    return f;
  });
  me = fighters.find((f) => f.cfg.you || (room && f.peer === room.id)) || null;
  projectiles = [];
  particles = [];
  effects = [];
  outCount = 0;
  resultsShown = false;
  buildHudCards();
}

// ---------- Multiplayer ----------
let room = null;
let waitingForMatch = false;
let netTimer = 0;
// What the host has chosen for the next match; guests keep a copy.
let lobby = { picks: {}, cpus: [], stage: setup.stage, stocks: setup.stocks, level: setup.level };
const isGuest = () => !!room && !room.isHost;

function hostLobby() {
  lobby.picks[room.id] = setup.slots[0].fighter;
  lobby.stage = setup.stage;
  lobby.stocks = setup.stocks;
  lobby.level = setup.level;
  lobby.cpus = setup.slots.map((s, i) => (i < room.players.length ? null : { type: s.type === 'cpu' ? 'cpu' : 'off', fighter: s.fighter }));
  for (const id of Object.keys(lobby.picks)) if (!room.player(id)) delete lobby.picks[id];
  room.broadcast({ t: 'lobby', ...lobby });
}

function sendState() {
  if (!room || phase === 'menu') return;
  if (++netTimer < NET_EVERY) return;
  netTimer = 0;
  if (room.isHost) room.broadcast({ t: 'snap', m: matchId, f: fighters.map((f) => (f.owned ? packFighter(f) : f.raw)).filter(Boolean) });
  else room.send({ t: 'st', m: matchId, f: fighters.filter((f) => f.owned).map(packFighter) });
}

function onNetMessage(msg, from) {
  if (!msg) return;
  switch (msg.t) {
    case 'lobby':
      if (!isGuest()) return;
      lobby = { picks: msg.picks || {}, cpus: msg.cpus || [], stage: msg.stage, stocks: msg.stocks, level: msg.level };
      if (phase === 'menu') renderMenu();
      return;
    case 'pick':
      if (!room.isHost || !rosterById(msg.fighter)) return;
      lobby.picks[from] = msg.fighter;
      hostLobby();
      if (phase === 'menu') renderMenu();
      return;
    case 'start':
      if (!isGuest()) return;
      if (!msg.lineup.some((p) => p.peer === room.id)) { waitingForMatch = true; if (phase === 'menu') renderMenu(); return; }
      waitingForMatch = false;
      matchId = msg.m;
      startMatch({ lineup: msg.lineup, stageId: msg.stage, stocks: msg.stocks });
      return;
    case 'busy':
      waitingForMatch = true;
      if (phase === 'menu') renderMenu();
      return;
    default:
  }
  if (msg.m !== matchId || phase === 'menu') return;
  switch (msg.t) {
    case 'snap': if (isGuest()) msg.f.forEach((a) => unpackFighter(a)); return;
    case 'st': if (room.isHost) msg.f.forEach((a) => unpackFighter(a, from)); return;
    case 'ev':
      if (room.isHost) room.broadcast(msg, { except: from });
      handleEvent(msg.e);
      return;
    case 'quit': if (room.isHost) takeOver(fighters.find((f) => f.peer === from)); return;
    case 'abort': if (isGuest()) toMenu({ quiet: true }); return;
    case 'over': if (isGuest()) finishMatch(msg.places); return;
    default:
  }
}

function onRoom(r) {
  const was = room;
  room = r;
  waitingForMatch = false;
  // The room went away mid-fight (the panel clears it before the room's own close handlers run):
  // everyone this browser can't hear from any more is handed to the computer.
  if (!r && was && phase !== 'menu') {
    fighters.forEach(takeOver);
    setPaused(false);
  }
  if (r) {
    r.on('message', onNetMessage);
    r.on('players', () => {
      if (r !== room) return;
      if (r.isHost) hostLobby();
      if (phase === 'menu') renderMenu();
    });
    r.on('join', (p) => {
      if (phase !== 'menu') r.sendTo(p.id, { t: 'busy' });
      hostLobby();
    });
    r.on('leave', (p) => { if (phase !== 'menu') takeOver(fighters.find((f) => f.peer === p.id)); });
    r.on('close', (reason) => {
      if (room === r) onRoom(null);
      if (phase !== 'menu' && reason) Arcade.toast(`<b>${esc(reason)}</b><span>Fighting on against the computer</span>`);
    });
    if (r.isHost) hostLobby();
    else r.send({ t: 'pick', fighter: setup.slots[0].fighter });
  }
  if (phase === 'menu') renderMenu();
}

// ---------- Match flow ----------
function hostStart() {
  if (isGuest()) return;
  audio.init();
  if (!room) {
    const lineup = localLineup();
    if (lineup.length < 2) { $('start-note').textContent = 'Add a CPU or a second player to fight.'; return; }
    startMatch({ lineup, stageId: setup.stage, stocks: setup.stocks });
    return;
  }
  hostLobby();
  const lineup = roomLineup();
  if (lineup.length < 2) { $('start-note').textContent = 'Add a CPU, or wait for a friend to join.'; return; }
  matchId++;
  room.broadcast({ t: 'start', m: matchId, lineup, stage: setup.stage, stocks: setup.stocks });
  startMatch({ lineup, stageId: setup.stage, stocks: setup.stocks });
}

function startMatch(opts) {
  audio.init();
  buildMatch(opts);
  phase = 'countdown';
  countdown = 3.2;
  lastCount = 0;
  overTimer = 0;
  timeScale = 1;
  paused = false;
  pauseShown = false;
  netTimer = 0;
  if (document.activeElement) document.activeElement.blur();
  $('menu').hidden = true;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = true;
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  snapCamera();
}

function toMenu({ quiet = false } = {}) {
  if (room && phase !== 'menu' && !quiet) {
    if (room.isHost) room.broadcast({ t: 'abort', m: matchId });
    else room.send({ t: 'quit', m: matchId });
  }
  phase = 'menu';
  paused = false;
  pauseShown = false;
  timeScale = 1;
  fighters = [];
  projectiles = [];
  particles = [];
  effects = [];
  stage = stageById(isGuest() ? lobby.stage : setup.stage);
  buildMenuStage();
  $('menu').hidden = false;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = false;
  $('hud').hidden = true;
  $('touch').hidden = true;
  renderMenu();
}

function setPaused(p) {
  if (phase !== 'countdown' && phase !== 'fight') return;
  if (room) {
    pauseShown = p;
    $('pause').hidden = !p;
    $('restart-btn').hidden = isGuest();
    $('pause-title').textContent = p ? 'Menu' : 'Paused';
    $('pause-note').hidden = false;
    $('pause-note').textContent = room.isHost
      ? 'The fight keeps going for everyone. Main menu ends it for all.'
      : 'The fight keeps going. Main menu leaves it and the computer takes over your fighter.';
    return;
  }
  paused = p;
  pauseShown = p;
  $('pause').hidden = !p;
  $('restart-btn').hidden = false;
  $('pause-title').textContent = 'Paused';
  $('pause-note').hidden = true;
}

function checkEnd() {
  if (phase !== 'fight' || isGuest()) return;
  const left = fighters.filter((f) => !f.out);
  if (left.length > 1) return;
  // Places: whoever's left wins, the rest in the reverse order they went out.
  const order = [...fighters].sort((a, b) => (a.out ? a.outOrder : 1e9) - (b.out ? b.outOrder : 1e9)).reverse();
  const places = fighters.map((f) => ({ slot: f.slot, place: order.indexOf(f) + 1, kos: f.kos, falls: f.falls, sds: f.sds }));
  if (room) room.broadcast({ t: 'over', m: matchId, places });
  finishMatch(places);
}

function finishMatch(places) {
  if (phase === 'over') return;
  phase = 'over';
  overTimer = 2.6;
  timeScale = 0.3;
  for (const p of places) {
    const f = fighters[p.slot];
    if (f) Object.assign(f, { place: p.place, kos: p.kos, falls: p.falls, sds: p.sds });
  }
  showBanner('GAME!', 'gold');
  audio.play('game');
  shake(8);
  if (me) {
    const humans = fighters.filter((f) => f.kind === 'human').length;
    const cpus = fighters.filter((f) => f.kind === 'cpu');
    const level = cpus.length ? (cpus.map((f) => f.level).sort((a, b) => LEVELS[b].mult - LEVELS[a].mult)[0]) : 'none';
    if (me.place === 1) store.set('brawl.wins', store.get('brawl.wins', 0) + 1);
    Arcade.record('brawl', {
      place: me.place, players: fighters.length, cpus: cpus.length, level, kos: me.kos, falls: me.falls, sds: me.sds,
      fighter: me.def.id, stocks: matchStocks, friends: room ? humans - 1 : 0, local: room ? 0 : humans - 1,
      flawless: me.place === 1 && me.falls === 0 && fighters.length > 1,
    });
  }
}

function showResults() {
  resultsShown = true;
  const rows = [...fighters].sort((a, b) => a.place - b.place);
  const top = rows[0];
  const title = !me ? `${top.def.name} wins!` : me.place === 1 ? '🏆 You win!' : `${top === me ? 'You' : esc(top.name === 'CPU' ? top.def.name : top.name)} wins!`;
  $('results-title').innerHTML = title;
  $('results-sub').textContent = me
    ? `${me.def.name} · ${me.kos} KO${me.kos === 1 ? '' : 's'} · ${me.falls} fall${me.falls === 1 ? '' : 's'}`
    : '';
  const body = $('results-body');
  body.innerHTML = '';
  for (const f of rows) {
    const tr = document.createElement('tr');
    if (f === me) tr.className = 'me';
    const who = f.kind === 'cpu' ? `CPU · ${LEVELS[f.level] ? LEVELS[f.level].label : ''}` : esc(f.name);
    tr.innerHTML = `<td>${f.place}</td><td class="rf"></td><td><b>${esc(f.def.name)}</b><small style="color:${f.color}">${who}</small></td><td>${f.kos} KO · ${f.falls} fall${f.falls === 1 ? '' : 's'}</td>`;
    tr.querySelector('.rf').append(portrait(f.def, f.pal, 44, 'head'));
    body.append(tr);
  }
  $('again-btn').hidden = isGuest();
  $('results-wait').hidden = !isGuest();
  $('results').hidden = false;
}

// ---------- Main loop ----------
function step() {
  clock++;
  updateSurfaces();
  for (const f of fighters) {
    if (f.owned) {
      f.prev = f.inp;
      f.inp = inputFor(f);
      stepFighter(f);
    } else stepRemote(f);
  }
  projectiles = projectiles.filter(stepShot);
  for (const f of fighters) {
    if (!f.shots) continue;
    for (const s of f.shots) { s[1] += s[3]; s[2] += s[4]; s[6]++; }
  }
  stepEffects();
  sendState();
  checkEnd();
}

function update(dt) {
  if (phase === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n > 0 && n <= 3) { lastCount = n; showBanner(String(n)); audio.play('count'); }
    if (countdown <= 0) { phase = 'fight'; showBanner('GO!', 'gold'); audio.play('go'); }
  }
  if (phase === 'over') {
    overTimer -= dt;
    if (overTimer < 1.8) timeScale = Math.min(1, timeScale + dt);
    if (overTimer <= 0 && !resultsShown) showResults();
  }
}

let acc = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollPads();
  if (phase === 'menu') {
    clock++;
    updateSurfaces();
    stepEffects();
    drawMenuScene(dt);
    drawPreview();
    return;
  }
  if (!paused) {
    update(dt);
    acc += dt * timeScale;
    let n = 0;
    while (acc >= 1 / 60 && n < 5) { step(); acc -= 1 / 60; n++; }
    if (n >= 5) acc = 0;
  }
  updateCamera(dt);
  draw();
  updateHud();
  readPadButtons();
}

// Start on a pad pauses; the pad's buttons work the menus a little too.
let padStartWas = false;
function readPadButtons() {
  let start = false;
  for (const p of pads) if (p && p.connected && p.buttons[9] && p.buttons[9].pressed) start = true;
  if (start && !padStartWas) {
    if (phase === 'countdown' || phase === 'fight') setPaused(!(paused || pauseShown));
  }
  padStartWas = start;
}

// ---------- Drawing ----------
const canvas = $('game');
g = canvas.getContext('2d');
let W = 0;
let H = 0;
let DPR = 1;
const cam = { x: 0, y: -200, z: 0.5 };

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

function cameraTarget() {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const f of fighters) {
    if (f.out || f.state === 'dead') continue;
    const B = stage.blast;
    const x = clamp(f.x, B.l + 200, B.r - 200);
    const y = clamp(f.y, B.t + 200, B.b - 100);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y - f.def.h); y1 = Math.max(y1, y);
  }
  if (x0 === Infinity) { x0 = -400; x1 = 400; y0 = -300; y1 = 0; }
  x0 = Math.min(x0, -200); x1 = Math.max(x1, 200);
  y1 = Math.max(y1, 60);
  const w = Math.max(x1 - x0 + 520, 1150);
  const h = Math.max(y1 - y0 + 420, 680);
  const z = Math.min(W / w, H / h);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 30, z: clamp(z, Math.min(W, H) / 2600, Math.min(W, H) / 560) };
}

function snapCamera() { Object.assign(cam, cameraTarget()); }

function updateCamera(dt) {
  const t = cameraTarget();
  const k = 1 - Math.exp(-dt * 3.5);
  cam.x += (t.x - cam.x) * k;
  cam.y += (t.y - cam.y) * k;
  cam.z += (t.z - cam.z) * k;
}

const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });

// ----- Rig -----
function getPose(p) { return typeof p === 'string' ? POSES[p] || POSES.stand : p; }
function lerpPose(a, b, t) {
  const L = (k) => lerp(a[k] || 0, b[k] || 0, t);
  const L2 = (k) => [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t)];
  return { lean: L('lean'), head: L('head'), spin: L('spin'), aF: L2('aF'), aB: L2('aB'), lF: L2('lF'), lB: L2('lB') };
}
function keyPose(keys, fr) {
  if (fr <= keys[0][0]) return getPose(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, p0] = keys[i];
    const [f1, p1] = keys[i + 1];
    if (fr < f1) return lerpPose(getPose(p0), getPose(p1), ease((fr - f0) / Math.max(1, f1 - f0)));
  }
  return getPose(keys[keys.length - 1][1]);
}

function runPose(f) {
  const ph = f.anim.run;
  const c = Math.sin(ph);
  const k = Math.cos(ph);
  return {
    lean: 20, head: -6,
    aF: [-c * 55 + 15, 70], aB: [c * 55 + 15, 70],
    lF: [c * 48 + 18, -25 - Math.max(0, k) * 85], lB: [-c * 48 + 18, -25 - Math.max(0, -k) * 85],
  };
}

function poseFor(f) {
  const st = f.state;
  switch (st) {
    case 'idle': case 'respawn': {
      const b = Math.sin(clock * 0.08 + f.slot * 1.7);
      const p = POSES.stand;
      return { ...p, lean: p.lean + b * 2, aF: [p.aF[0] + b * 4, p.aF[1]], aB: [p.aB[0] - b * 4, p.aB[1]] };
    }
    case 'run': return runPose(f);
    case 'crouch': return POSES.crouch;
    case 'jumpsquat': return POSES.squat;
    case 'land': return lerpPose(POSES.land, POSES.stand, clamp(f.sf / Math.max(5, f.landLag || 5), 0, 1));
    case 'air': {
      const vy = f.vy + (f.ly || 0);
      const p = lerpPose(POSES.jump, POSES.fall, clamp((vy + 4) / 9, 0, 1));
      if (f.flipT > 0) p.spin = (1 - f.flipT / 22) * 360;
      return p;
    }
    case 'helpless': return { ...POSES.helpless, lean: POSES.helpless.lean + Math.sin(clock * 0.3) * 6 };
    case 'attack': {
      const m = f.move;
      if (!m || !m.pose) return POSES.stand;
      const p = { ...keyPose(m.pose, f.mf) };
      if (m.spin) p.spin = (p.spin || 0) + clamp((f.mf - m.spin[0]) / (m.spin[1] - m.spin[0]), 0, 1) * m.spin[2];
      return p;
    }
    case 'hitstun': case 'grabbed':
      if (f.tumble && st === 'hitstun') return { ...POSES.tumble, spin: -f.sf * 18 };
      return POSES.hurt;
    case 'shield': case 'shieldstun': return POSES.shield;
    case 'dodge': {
      const d = f.dodge || { kind: 'spot' };
      if (d.kind === 'roll') return { ...POSES.ball, spin: (f.sf / 30) * 360 * (d.dir * f.facing || 1) };
      if (d.kind === 'air') return POSES.fall;
      return POSES.squat;
    }
    case 'hang': return POSES.hang;
    case 'climb': return lerpPose(POSES.hang, POSES.squat, clamp(f.sf / 14, 0, 1));
    case 'down': return { ...POSES.lie };
    case 'getup': return lerpPose(POSES.lie, POSES.stand, clamp(f.sf / 16, 0, 1));
    case 'dizzy': return { ...POSES.dizzy, lean: Math.sin(clock * 0.1) * 12, head: Math.sin(clock * 0.1 + 1) * 14 };
    case 'hold': return POSES.hold;
    case 'win': return POSES.win;
    default: return POSES.stand;
  }
}

const GROUND_STATES = new Set(['idle', 'run', 'crouch', 'jumpsquat', 'land', 'shield', 'shieldstun', 'down', 'getup', 'hold', 'respawn', 'win', 'climb']);
function groundedPose(f) {
  if (f.state === 'dodge') return f.dodge && f.dodge.kind !== 'air';
  if (f.state === 'attack' || f.state === 'dizzy' || f.state === 'hitstun') return !!(f.owned ? f.grounded : f.groundedFlag);
  return GROUND_STATES.has(f.state);
}

function rig(f, pose, x, y, grounded) {
  const P = f.def.props;
  const s = f.def.s;
  const F = f.facing || 1;
  const pt = (o, len, a) => ({ x: o.x + Math.sin(a * D2R) * len * F, y: o.y + Math.cos(a * D2R) * len });
  const h0 = { x: 0, y: 0 };
  const kF0 = pt(h0, P.thigh * s, pose.lF[0]);
  const fF0 = pt(kF0, P.shin * s, pose.lF[0] + pose.lF[1]);
  const kB0 = pt(h0, P.thigh * s, pose.lB[0]);
  const fB0 = pt(kB0, P.shin * s, pose.lB[0] + pose.lB[1]);
  const hipY = grounded ? -Math.max(fF0.y, fB0.y, 4 * s) : -(P.thigh + P.shin) * s * 0.9;
  const off = (p) => ({ x: p.x + x, y: p.y + y + hipY });
  const hip = off(h0);
  const lean = pose.lean || 0;
  const sh = { x: hip.x + Math.sin(lean * D2R) * P.torso * s * F, y: hip.y - Math.cos(lean * D2R) * P.torso * s };
  const hl = lean + (pose.head || 0) * 0.6;
  const nk = (P.neck + P.headR * 0.55) * s;
  const head = { x: sh.x + Math.sin(hl * D2R) * nk * F, y: sh.y - Math.cos(hl * D2R) * nk };
  const eF = pt(sh, P.uArm * s, pose.aF[0]);
  const hF = pt(eF, P.lArm * s, pose.aF[0] + pose.aF[1]);
  const eB = pt(sh, P.uArm * s, pose.aB[0]);
  const hB = pt(eB, P.lArm * s, pose.aB[0] + pose.aB[1]);
  return {
    s, F, hip, sh, head, hr: P.headR * s, eF, hF, eB, hB,
    kF: off(kF0), fF: off(fF0), kB: off(kB0), fB: off(fB0),
    la: lean * D2R * F, ha: (pose.head || 0) * D2R * F * 0.5,
  };
}

function limb(a, b, c, w, color, s) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y);
  g.strokeStyle = INK; g.lineWidth = w + 5 * s; g.stroke();
  g.strokeStyle = color; g.lineWidth = w; g.stroke();
}

// A palette washed toward one colour (hit flash, chill, shadowed back limbs), made once and kept.
const variants = new WeakMap();
function palVariant(pal, key, to, amt) {
  let m = variants.get(pal);
  if (!m) { m = {}; variants.set(pal, m); }
  if (!m[key]) {
    const p = {};
    for (const k of Object.keys(pal)) p[k] = mix(pal[k], to, amt);
    m[key] = p;
  }
  return m[key];
}

// A copy of what a fighter looks like right now, for after-images.
function snapshotLook(f) {
  return { def: f.def, pal: f.pal, facing: f.facing, state: f.state, grounded: f.grounded, groundedFlag: f.groundedFlag, vx: f.vx, vy: f.vy, slot: f.slot, sf: f.sf, move: f.move, mf: f.mf, owned: true, dodge: f.dodge };
}

function drawFighter(f, x, y, t, opts = {}) {
  const pose = opts.pose || poseFor(f);
  const J = rig(f, pose, x, y, opts.grounded !== undefined ? opts.grounded : groundedPose(f));
  const def = f.def;
  const P = def.props;
  const s = def.s;
  const look = def.look || {};
  let pal = opts.pal || f.pal;
  if (!opts.pal) {
    if (f.flash > 0) pal = palVariant(f.pal, 'flash', '#ffffff', 0.75);
    else if (f.chill > 0) pal = palVariant(f.pal, 'chill', '#a8ecff', 0.5);
    else if (f.state === 'attack' && f.move && f.move.charge && f.mf === f.move.charge.at && f.charge > 0 && Math.floor(clock / 4) % 2) pal = palVariant(f.pal, 'charge', '#fff27a', 0.5);
    else if (f.state === 'attack' && f.move && f.move.armor && f.mf >= f.move.armor[0] && f.mf <= f.move.armor[1]) pal = palVariant(f.pal, 'armor', '#ff9d2e', 0.3);
  }
  const back = palVariant(pal, 'back', '#000000', 0.22);
  g.save();
  if (pose.spin) {
    const cx = J.hip.x;
    const cy = (J.hip.y + J.sh.y) / 2;
    g.translate(cx, cy); g.rotate(pose.spin * D2R * J.F); g.translate(-cx, -cy);
  }
  if (look.back) look.back(g, J, pal, t, f);
  const lw = P.limbW * s;
  limb(J.sh, J.eB, J.hB, lw, back.arms, s);
  api.draw.ball(g, J.hB.x, J.hB.y, lw * 0.68, back.hands);
  limb(J.hip, J.kB, J.fB, lw * 1.12, back.legs, s);
  drawFoot(J.fB, J.kB, lw, back.feet, J.F, s);
  if (look.torso) look.torso(g, J, pal, t, f);
  else limb(J.hip, { x: (J.hip.x + J.sh.x) / 2, y: (J.hip.y + J.sh.y) / 2 }, J.sh, P.bodyW * s, pal.body, s);
  limb(J.hip, J.kF, J.fF, lw * 1.12, pal.legs, s);
  drawFoot(J.fF, J.kF, lw, pal.feet, J.F, s);
  // An arm raised over the head goes behind it, so the face stays in view.
  const armUp = pose.aF[0] > 135 && pose.aF[0] < 225;
  const frontArm = () => {
    limb(J.sh, J.eF, J.hF, lw, pal.arms, s);
    api.draw.ball(g, J.hF.x, J.hF.y, lw * 0.72, pal.hands);
    if (look.front) look.front(g, J, pal, t, f);
  };
  if (armUp) frontArm();
  if (look.head) look.head(g, J, pal, t, f);
  else api.draw.ball(g, J.head.x, J.head.y, J.hr, pal.skin);
  if (!armUp) frontArm();
  g.restore();
  return J;
}

function drawFoot(foot, knee, lw, color, F, s) {
  const a = Math.atan2(foot.y - knee.y, foot.x - knee.x);
  g.save();
  g.translate(foot.x, foot.y);
  g.rotate(a - Math.PI / 2);
  g.fillStyle = color;
  g.strokeStyle = INK;
  g.lineWidth = 3 * s;
  g.beginPath(); g.ellipse(F * lw * 0.35, 0, lw * 0.95, lw * 0.6, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
}

// ----- Portraits -----
const portraitCache = new Map();
// A fighter drawn standing, either whole ('body') or from the shoulders up ('head').
function portrait(def, pal, size, crop = 'body') {
  const id = `${def.id}|${size}|${crop}|${JSON.stringify(pal)}`;
  let src = portraitCache.get(id);
  if (!src) {
    src = document.createElement('canvas');
    const px = Math.round(size * 2);
    src.width = px;
    src.height = px;
    const c = src.getContext('2d');
    const fake = { def, pal, facing: 1, state: 'idle', sf: 0, slot: 0, vx: 0, vy: 0, grounded: true, groundedFlag: true, anim: { run: 0 }, owned: true };
    const J = rig(fake, POSES.stand, 0, 0, true);
    if (crop === 'head') {
      const k = px / (J.hr * 3.6);
      c.setTransform(k, 0, 0, k, px / 2 - J.head.x * k, px * 0.56 - J.head.y * k);
    } else {
      const k = px / (def.h * 1.32);
      c.setTransform(k, 0, 0, k, px / 2, px * 0.95);
    }
    swapCtx(c, () => drawFighter(fake, 0, 0, 0, { pose: POSES.stand, grounded: true }));
    portraitCache.set(id, src);
  }
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  out.style.width = `${size}px`;
  out.style.height = `${size}px`;
  out.getContext('2d').drawImage(src, 0, 0);
  return out;
}

// ----- Stage art -----
function rr(x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

const skyline = (() => {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let layer = 0; layer < 2; layer++) {
    const list = [];
    for (let x = -2400; x < 2400;) {
      const w = 80 + rnd() * 140;
      list.push({ x, w, h: 180 + rnd() * (layer ? 380 : 260), lit: Array.from({ length: 40 }, () => rnd() < 0.35) });
      x += w + 10 + rnd() * 30;
    }
    out.push(list);
  }
  return out;
})();

function drawBackground() {
  const id = stage.id;
  const par = (k) => ({ x: W / 2 - cam.x * cam.z * k, y: H / 2 - cam.y * cam.z * k });
  if (id === 'temple') {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#24164a'); sky.addColorStop(0.55, '#b4507a'); sky.addColorStop(1, '#ffb36b');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const o = par(0.05);
    const sun = g.createRadialGradient(o.x + W * 0.18, o.y + H * 0.12, 0, o.x + W * 0.18, o.y + H * 0.12, H * 0.5);
    sun.addColorStop(0, 'rgba(255,240,200,.95)'); sun.addColorStop(0.12, 'rgba(255,214,140,.8)'); sun.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    const o2 = par(0.15);
    g.fillStyle = 'rgba(90,40,100,.45)';
    for (const [x, y, r] of [[-900, 120, 160], [700, 60, 120], [1500, 180, 200], [-1700, 40, 140]]) {
      const sx = o2.x + x * cam.z * 0.4;
      const sy = o2.y + y * cam.z * 0.4;
      g.beginPath(); g.ellipse(sx, sy, r * cam.z * 0.6, r * cam.z * 0.18, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(sx - r * cam.z * 0.5, sy); g.lineTo(sx, sy + r * cam.z * 0.6); g.lineTo(sx + r * cam.z * 0.5, sy); g.fill();
    }
    const o3 = par(0.3);
    g.fillStyle = 'rgba(255,230,240,.35)';
    for (let i = 0; i < 7; i++) {
      const x = ((i * 530 + clock * 0.2) % 3600) - 1800;
      const y = -200 + (i % 3) * 140;
      const sx = o3.x + x * cam.z * 0.7;
      const sy = o3.y + y * cam.z * 0.7;
      const r = (60 + (i % 4) * 25) * cam.z;
      g.beginPath(); g.ellipse(sx, sy, r * 2.2, r * 0.5, 0, 0, TAU); g.ellipse(sx + r, sy - r * 0.3, r * 1.2, r * 0.5, 0, 0, TAU); g.fill();
    }
  } else if (id === 'rooftop') {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070a24'); sky.addColorStop(0.6, '#24124a'); sky.addColorStop(1, '#4a1660');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const o = par(0.04);
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 977) % 3000) - 1500;
      const y = ((i * 431) % 900) - 1000;
      g.fillRect(o.x + x * cam.z * 0.5, o.y + y * cam.z * 0.5, 2, 2);
    }
    g.fillStyle = '#fff4d6';
    g.beginPath(); g.arc(o.x + 500 * cam.z * 0.5, o.y - 700 * cam.z * 0.5, 60 * cam.z, 0, TAU); g.fill();
    skyline.forEach((list, layer) => {
      const k = layer ? 0.35 : 0.18;
      const oo = par(k);
      const sc = cam.z * (layer ? 0.75 : 0.55);
      for (const b of list) {
        const sx = oo.x + b.x * sc;
        const sy = oo.y + (200 - b.h) * sc;
        if (sx > W || sx + b.w * sc < 0) continue;
        g.fillStyle = layer ? '#1a1238' : '#120c2c';
        g.fillRect(sx, sy, b.w * sc, b.h * sc + H);
        g.fillStyle = layer ? 'rgba(255,214,120,.55)' : 'rgba(150,170,255,.35)';
        let n = 0;
        for (let wy = 20; wy < b.h - 10; wy += 34) {
          for (let wx = 14; wx < b.w - 14; wx += 26) {
            if (b.lit[n++ % 40]) g.fillRect(sx + wx * sc, sy + wy * sc, 10 * sc, 14 * sc);
          }
        }
      }
    });
    const o4 = par(0.55);
    const nx = o4.x - 120 * cam.z * 0.8;
    const ny = o4.y - 420 * cam.z * 0.8;
    g.save();
    g.font = `${Math.round(110 * cam.z)}px Bungee, sans-serif`;
    g.textAlign = 'center';
    g.shadowColor = '#ff3df2'; g.shadowBlur = 30 * cam.z;
    g.fillStyle = Math.sin(clock * 0.05) > -0.9 ? '#ff7af5' : '#7a2a77';
    g.fillText('BLAST', nx, ny);
    g.shadowColor = '#3df2ff';
    g.fillStyle = '#7af7ff';
    g.fillText('ZONE', nx + 330 * cam.z, ny + 110 * cam.z);
    g.restore();
  } else {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3fb2f0'); sky.addColorStop(1, '#c9f0ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const o = par(0.05);
    g.fillStyle = 'rgba(255,255,230,.9)';
    g.beginPath(); g.arc(o.x - 600 * cam.z * 0.5, o.y - 700 * cam.z * 0.5, 70 * cam.z, 0, TAU); g.fill();
    const o3 = par(0.25);
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 610 + clock * 0.25) % 3600) - 1800;
      const y = -600 + (i % 3) * 120;
      const sx = o3.x + x * cam.z * 0.6;
      const sy = o3.y + y * cam.z * 0.6;
      const r = (50 + (i % 3) * 20) * cam.z;
      g.beginPath(); g.ellipse(sx, sy, r * 2, r * 0.6, 0, 0, TAU); g.ellipse(sx + r * 0.8, sy - r * 0.4, r, r * 0.7, 0, 0, TAU); g.fill();
    }
    const sea = toScreen(0, 170).y;
    const horizon = Math.min(sea, par(0.2).y + 40 * cam.z);
    g.fillStyle = 'rgba(40,120,90,.5)';
    const o2 = par(0.2);
    for (const [x, w] of [[-1500, 500], [900, 380]]) {
      g.beginPath(); g.ellipse(o2.x + x * cam.z * 0.6, horizon, w * cam.z * 0.6, 60 * cam.z, 0, Math.PI, TAU); g.fill();
    }
    const grad = g.createLinearGradient(0, horizon, 0, H);
    grad.addColorStop(0, '#2aa3d6'); grad.addColorStop(1, '#0d5a92');
    g.fillStyle = grad; g.fillRect(0, horizon, W, H - horizon);
  }
}

function drawStage() {
  const id = stage.id;
  for (const s of surfaces) {
    if (s.solid) {
      if (id === 'temple') {
        g.fillStyle = '#7d5e96';
        g.beginPath();
        g.moveTo(s.x1, 14); g.lineTo(s.x2, 14); g.lineTo(s.x2 - 50, 80); g.lineTo(s.x2 - 170, s.h); g.lineTo(s.x1 + 170, s.h); g.lineTo(s.x1 + 50, 80);
        g.closePath(); g.fill();
        g.fillStyle = '#5f4478';
        g.beginPath(); g.moveTo(s.x1 + 170, s.h); g.lineTo(s.x2 - 170, s.h); g.lineTo(80, s.h + 90); g.lineTo(-80, s.h + 90); g.closePath(); g.fill();
        g.fillStyle = `rgba(255,214,122,${0.55 + Math.sin(clock * 0.05) * 0.25})`;
        for (const x of [-240, -80, 80, 240]) { g.beginPath(); g.arc(x, 70, 9, 0, TAU); g.fill(); }
        g.fillStyle = '#efe3c8';
        rr(s.x1, 0, s.x2 - s.x1, 18, 6); g.fill();
        g.fillStyle = '#c9b48a'; g.fillRect(s.x1 + 6, 12, s.x2 - s.x1 - 12, 6);
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
        for (let x = s.x1 + 60; x < s.x2; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 12); g.stroke(); }
      } else if (id === 'rooftop') {
        g.fillStyle = '#23263a'; g.fillRect(s.x1, 0, s.x2 - s.x1, s.h + 400);
        g.fillStyle = 'rgba(255,214,120,.4)';
        for (let x = s.x1 + 40; x < s.x2 - 40; x += 70) for (let y = 50; y < s.h + 300; y += 70) if ((x * 7 + y * 3) % 5 < 2) g.fillRect(x, y, 26, 36);
        g.fillStyle = '#3a3f55'; g.fillRect(s.x1 - 8, 0, s.x2 - s.x1 + 16, 22);
        g.save(); g.shadowColor = '#ff3df2'; g.shadowBlur = 16;
        g.fillStyle = '#ff7af5'; g.fillRect(s.x1 - 8, 20, s.x2 - s.x1 + 16, 4);
        g.restore();
      } else {
        g.fillStyle = '#b07d45';
        g.beginPath(); g.moveTo(s.x1, 6); g.lineTo(s.x2, 6); g.lineTo(s.x2 - 40, s.h); g.lineTo(s.x1 + 40, s.h); g.closePath(); g.fill();
        g.fillStyle = '#8f6236';
        for (const k of [0.25, 0.55, 0.8]) { g.beginPath(); g.ellipse(lerp(s.x1, s.x2, k), 60 + k * 30, 22, 12, 0, 0, TAU); g.fill(); }
        g.fillStyle = '#f2d58f'; rr(s.x1, 0, s.x2 - s.x1, 16, 8); g.fill();
        g.fillStyle = '#5cb85c';
        for (let x = s.x1 + 20; x < s.x2 - 10; x += 46) { g.beginPath(); g.moveTo(x, 2); g.lineTo(x + 6, -12); g.lineTo(x + 12, 2); g.fill(); }
      }
    } else {
      const w = s.x2 - s.x1;
      if (id === 'isles') {
        g.fillStyle = '#a8693a'; rr(s.x1, s.y, w, 16, 4); g.fill();
        g.strokeStyle = '#7a4a26'; g.lineWidth = 2;
        for (let x = s.x1 + 24; x < s.x2; x += 24) { g.beginPath(); g.moveTo(x, s.y); g.lineTo(x, s.y + 16); g.stroke(); }
        g.fillStyle = '#c99b5a'; g.fillRect(s.x1 + 10, s.y + 16, 8, 30); g.fillRect(s.x2 - 18, s.y + 16, 8, 30);
      } else {
        g.fillStyle = 'rgba(0,0,0,.18)'; rr(s.x1 + 6, s.y + 8, w, 12, 4); g.fill();
        g.fillStyle = '#e8d9b5'; rr(s.x1, s.y, w, 12, 4); g.fill();
        g.fillStyle = '#f5c84c'; g.fillRect(s.x1, s.y, w, 3);
      }
    }
  }
  if (id === 'isles') {
    for (const [x, lean] of [[-520, -1], [-260, 1], [300, -1], [540, 1]]) drawPalm(x, lean);
  }
  if (id === 'temple') {
    g.fillStyle = 'rgba(239,227,200,.55)';
    for (const x of [-360, 340]) { rr(x - 14, -130, 28, 130, 4); g.fill(); rr(x - 22, -140, 44, 14, 3); g.fill(); }
  }
  if (id === 'rooftop') {
    g.fillStyle = '#4a5068';
    rr(-430, -46, 90, 46, 6); g.fill();
    rr(330, -64, 70, 64, 6); g.fill();
    g.fillStyle = '#2d3145';
    for (let i = 0; i < 3; i++) g.fillRect(-420 + i * 28, -36, 18, 26);
    g.strokeStyle = '#4a5068'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(160, 0); g.lineTo(160, -150); g.stroke();
    g.fillStyle = clock % 60 < 30 ? '#ff4d5e' : '#7a2a33';
    g.beginPath(); g.arc(160, -154, 6, 0, TAU); g.fill();
  }
}

function drawPalm(x, lean) {
  g.strokeStyle = '#8a5a2b'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + lean * 30, -80, x + lean * 20, -150); g.stroke();
  const tx = x + lean * 20;
  const ty = -150;
  g.fillStyle = '#3f9a4c';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(clock * 0.03 + i) * 0.05;
    g.beginPath(); g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * 60, ty + Math.sin(a) * 60 - 20, tx + Math.cos(a) * 90, ty + Math.sin(a) * 90 + 20);
    g.quadraticCurveTo(tx + Math.cos(a) * 50, ty + Math.sin(a) * 50, tx, ty);
    g.fill();
  }
}

function drawForeground() {
  if (stage.id !== 'isles') return;
  const top = 150;
  g.fillStyle = 'rgba(30,140,200,.55)';
  g.beginPath();
  g.moveTo(stage.blast.l - 400, top);
  for (let x = stage.blast.l - 400; x <= stage.blast.r + 400; x += 40) g.lineTo(x, top + Math.sin(x * 0.02 + clock * 0.05) * 6);
  g.lineTo(stage.blast.r + 400, stage.blast.b + 600);
  g.lineTo(stage.blast.l - 400, stage.blast.b + 600);
  g.closePath(); g.fill();
}

// ----- Effects -----
function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = p.color;
    switch (p.kind) {
      case 'puff': g.beginPath(); g.arc(p.x, p.y, p.size * (1.4 - a * 0.5), 0, TAU); g.fill(); break;
      case 'flame': g.beginPath(); g.arc(p.x, p.y, p.size * a, 0, TAU); g.fill(); break;
      case 'star': drawStar(p.x, p.y, p.size, p.life * 0.2); break;
      case 'zap':
        g.strokeStyle = p.color; g.lineWidth = 3;
        g.beginPath(); g.moveTo(p.x - p.size / 2, p.y); g.lineTo(p.x, p.y - p.size / 3); g.lineTo(p.x, p.y + p.size / 3); g.lineTo(p.x + p.size / 2, p.y); g.stroke();
        break;
      case 'z':
        g.font = `${p.size}px Bungee, sans-serif`; g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3;
        g.strokeText('z', p.x, p.y); g.fillText('z', p.x, p.y);
        break;
      default: g.beginPath(); g.arc(p.x, p.y, p.size * a, 0, TAU); g.fill();
    }
  }
  g.globalAlpha = 1;
}

function drawStar(x, y, r, rot) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * TAU;
    const rr2 = i % 2 ? r * 0.35 : r;
    g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  g.closePath(); g.fill();
}

function drawEffects() {
  for (const e of effects) {
    const k = e.life / e.max;
    switch (e.kind) {
      case 'spark': {
        g.save(); g.translate(e.x, e.y); g.rotate(e.rot);
        const r = e.size * (1.2 - k * 0.4);
        g.globalAlpha = Math.min(1, k * 1.6);
        g.fillStyle = '#ffffff';
        drawStar(0, 0, r, 0);
        g.fillStyle = e.color;
        drawStar(0, 0, r * 0.6, 0.4);
        g.strokeStyle = '#fff'; g.lineWidth = 4;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.2;
          g.beginPath(); g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6); g.stroke();
        }
        g.restore();
        g.globalAlpha = 1;
        break;
      }
      case 'ring':
        g.globalAlpha = k;
        g.strokeStyle = e.color; g.lineWidth = 5 * k + 1;
        g.beginPath();
        if (e.flat) g.ellipse(e.x, e.y, e.r * (1.6 - k), e.r * 0.35 * (1.6 - k), 0, 0, TAU);
        else g.arc(e.x, e.y, e.r * (1.6 - k), 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
        break;
      case 'flash':
        g.globalAlpha = k * 0.8; g.fillStyle = e.color;
        g.beginPath(); g.arc(e.x, e.y, 80 * (1.4 - k), 0, TAU); g.fill();
        g.globalAlpha = 1;
        break;
      case 'ghost':
        g.globalAlpha = k * 0.45;
        drawFighter(e.f, e.x, e.y, clock, { pose: e.pose, pal: palVariant(e.f.pal, 'ghost', '#b79cff', 0.6) });
        g.globalAlpha = 1;
        break;
      case 'bolt': {
        g.globalAlpha = Math.min(1, k * 2);
        g.strokeStyle = '#fff27a'; g.lineWidth = 14 * k + 4; g.lineJoin = 'round';
        g.shadowColor = '#6ff3ff'; g.shadowBlur = 20;
        g.beginPath();
        let x = e.x;
        g.moveTo(x, e.y - 900);
        for (let y = e.y - 900; y < e.y; y += 60) { x = e.x + Math.sin(y * 0.05 + e.seed) * 30; g.lineTo(x, y); }
        g.lineTo(e.x, e.y);
        g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
        g.shadowBlur = 0;
        g.globalAlpha = 1;
        break;
      }
      case 'crystal': {
        const grow = Math.min(1, (e.max - e.life) / 5);
        const h = e.h * grow * Math.min(1, k * 3);
        g.fillStyle = 'rgba(191,243,255,.9)'; g.strokeStyle = '#2b78c2'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(e.x - 16, e.y); g.lineTo(e.x, e.y - h); g.lineTo(e.x + 16, e.y); g.closePath(); g.fill(); g.stroke();
        break;
      }
      default:
    }
  }
}

function drawTrails() {
  for (const f of fighters) {
    const pts = f.trail;
    while (pts.length && clock - pts[0].t > 7) pts.shift();
    if (pts.length < 2) continue;
    const col = (FX[f.def.fx] || FX.slash).trail;
    g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - (clock - pts[i].t) / 8;
      g.globalAlpha = clamp(k, 0, 1) * 0.8;
      g.strokeStyle = col;
      g.lineWidth = pts[i].w * k;
      g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
    g.globalAlpha = 1;
  }
}

function recordTrail(f, J) {
  if (f.state !== 'attack' || !f.move || !f.move.hits) return;
  const act = f.move.hits.find((h) => f.mf >= h.f[0] - 1 && f.mf <= h.f[1] + 1);
  if (!act) return;
  let p;
  let w;
  if (J.tip) { p = J.tip; w = 18 * f.def.s; } else {
    const [bx, by, r] = act.b[act.b.length - 1];
    p = { x: f.x + bx * f.facing, y: f.y + by };
    w = r * 0.9;
  }
  const lastPt = f.trail[f.trail.length - 1];
  if (!lastPt || lastPt.t !== clock) f.trail.push({ x: p.x, y: p.y, w, t: clock });
}

function drawShots() {
  for (const p of projectiles) window.BlastRoster.drawProjectile(g, api.draw, p, clock);
  for (const f of fighters) {
    if (f.owned || !f.shots) continue;
    for (const s of f.shots) window.BlastRoster.drawProjectile(g, api.draw, { kind: s[0], x: s[1], y: s[2], vx: s[3], vy: s[4], r: s[5], age: s[6] }, clock);
  }
}

function drawFighters() {
  const order = [...fighters].sort((a, b) => (a === me) - (b === me));
  for (const f of order) {
    if (f.out && f.state === 'dead') continue;
    if (f.state === 'dead' || f.hidden) continue;
    let x = f.x;
    let y = f.y;
    if (f.state === 'hitstun' && (f.owned ? f.hitlag > 0 : f.netFlags & 64)) { x += rand(-4, 4); y += rand(-3, 3); }
    if (f.state === 'respawn') {
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.strokeStyle = f.color; g.lineWidth = 4;
      g.beginPath(); g.ellipse(x, y + 6, 60, 12, 0, 0, TAU); g.fill(); g.stroke();
    }
    const blink = (f.owned ? f.invuln > 0 : f.netFlags & 1) && f.state !== 'dodge' && Math.floor(clock / 3) % 2;
    const dodging = f.state === 'dodge';
    g.globalAlpha = dodging ? 0.55 : 1;
    if (f.state === 'grabbed') f.facing = fighters[f.heldBy] ? -fighters[f.heldBy].facing : f.facing;
    if (f.owned && f.state === 'run') f.anim.run += Math.abs(f.vx) * 0.06 + 0.05;
    else if (!f.owned && f.state === 'run') f.anim.run += Math.abs(f.vx) * 0.06 + 0.05;
    const J = drawFighter(f, x, y, clock);
    g.globalAlpha = 1;
    if (blink) {
      g.globalAlpha = 0.35;
      drawFighter(f, x, y, clock, { pal: palVariant(f.pal, 'blink', '#ffffff', 0.9) });
      g.globalAlpha = 1;
    }
    recordTrail(f, J);
    if (f.state === 'shield' || f.state === 'shieldstun') {
      const r = f.def.h * 0.62 * (0.45 + 0.55 * clamp(f.shield / SHIELD_MAX, 0, 1));
      g.fillStyle = `${f.color}55`;
      g.strokeStyle = f.color; g.lineWidth = 4;
      g.beginPath(); g.arc(x, y - f.def.h * 0.5, r, 0, TAU); g.fill(); g.stroke();
    }
    if (f.state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = clock * 0.12 + (i * TAU) / 3;
        g.fillStyle = '#ffd23f';
        drawStar(J.head.x + Math.cos(a) * 26, J.head.y - J.hr - 10 + Math.sin(a) * 8, 8, a);
      }
    }
  }
}

// Name tags over each fighter, and a bubble at the screen edge for anyone out of view.
function drawTags() {
  for (const f of fighters) {
    if (f.state === 'dead' || f.out || f.hidden) continue;
    const p = toScreen(f.x, f.y - f.def.h - 16);
    const label = f.kind === 'cpu' ? 'CPU' : f === me ? (fighters.filter((o) => o.kind === 'human').length > 1 ? `P${f.slot + 1}` : 'YOU') : `P${f.slot + 1}`;
    const off = p.x < 20 || p.x > W - 20 || p.y < 20 || p.y > H - 20;
    if (off) {
      const cx = clamp(p.x, 44, W - 44);
      const cy = clamp(p.y + f.def.h * 0.5 * cam.z, 44, H - 44);
      g.fillStyle = 'rgba(10,6,24,.75)';
      g.strokeStyle = f.color; g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, 30, 0, TAU); g.fill(); g.stroke();
      const a = Math.atan2(p.y - cy, p.x - cx);
      g.fillStyle = f.color;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42); g.lineTo(cx + Math.cos(a + 0.35) * 30, cy + Math.sin(a + 0.35) * 30); g.lineTo(cx + Math.cos(a - 0.35) * 30, cy + Math.sin(a - 0.35) * 30); g.fill();
      const img = f.face || (f.face = portrait(f.def, f.pal, 48, 'head'));
      g.save(); g.beginPath(); g.arc(cx, cy, 26, 0, TAU); g.clip();
      g.drawImage(img, cx - 26, cy - 26, 52, 52);
      g.restore();
      continue;
    }
    g.font = '700 13px Rubik, sans-serif';
    g.textAlign = 'center';
    const w = g.measureText(label).width + 12;
    g.fillStyle = f.color;
    rr(p.x - w / 2, p.y - 22, w, 18, 9); g.fill();
    g.beginPath(); g.moveTo(p.x - 6, p.y - 5); g.lineTo(p.x + 6, p.y - 5); g.lineTo(p.x, p.y + 2); g.fill();
    g.fillStyle = '#fff';
    g.fillText(label, p.x, p.y - 8);
  }
}

function drawKoBeams() {
  for (const e of effects) {
    if (e.kind === 'screen') {
      g.globalAlpha = (e.life / e.max) * 0.5;
      g.fillStyle = e.color; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      continue;
    }
    if (e.kind !== 'ko') continue;
    const k = e.life / e.max;
    const p = toScreen(e.x, e.y);
    const x = clamp(p.x, 0, W);
    const y = clamp(p.y, 0, H);
    const a = Math.atan2(H / 2 - y, W / 2 - x);
    const len = Math.max(W, H) * 0.9 * Math.min(1, (1 - k) * 4);
    const wid = 140 * k + 20;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.15, e.color); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = Math.min(1, k * 1.5);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, -wid * 0.3); g.lineTo(len, -wid); g.lineTo(len, wid); g.lineTo(0, wid * 0.3); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(0, 0, wid * 0.7, 0, TAU); g.fill();
    g.restore();
    g.globalAlpha = 1;
  }
}

function draw() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = shakeAmt ? rand(-shakeAmt, shakeAmt) : 0;
  const sy = shakeAmt ? rand(-shakeAmt, shakeAmt) : 0;
  drawBackground();
  g.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * (W / 2 - cam.x * cam.z + sx), DPR * (H / 2 - cam.y * cam.z + sy));
  drawStage();
  drawTrails();
  drawFighters();
  drawShots();
  drawEffects();
  drawParticles();
  drawForeground();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTags();
  drawKoBeams();
}

// ----- Menu backdrop -----
function buildMenuStage() {
  surfaces = [
    ...stage.solids.map((s) => ({ ...s, solid: true })),
    ...stage.plats.map((s) => ({ ...s, solid: false, bx1: s.x1, bx2: s.x2, dx: 0 })),
  ];
  ledges = [];
}

function drawMenuScene() {
  cam.x = Math.sin(clock * 0.002) * 120;
  cam.y = -180;
  cam.z = Math.min(W / 1700, H / 1000);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground();
  g.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * (W / 2 - cam.x * cam.z), DPR * (H / 2 - cam.y * cam.z));
  drawStage();
  drawForeground();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = 'rgba(10,6,24,.35)';
  g.fillRect(0, 0, W, H);
}

// ---------- HUD ----------
const hudCards = [];
function buildHudCards() {
  const wrap = $('cards');
  wrap.innerHTML = '';
  hudCards.length = 0;
  for (const f of fighters) {
    const el = document.createElement('div');
    el.className = 'pcard';
    el.style.setProperty('--pc', f.color);
    const who = f.kind === 'cpu' ? 'CPU' : f === me ? Arcade.player.name : f.name;
    el.innerHTML = `<div class="pface"></div><div class="pinfo"><div class="pct"><span>0</span><small>%</small></div><div class="pname">${esc(who)} · ${esc(f.def.name)}</div><div class="stocks"></div></div>`;
    el.querySelector('.pface').append(portrait(f.def, f.pal, 54, 'head'));
    wrap.append(el);
    hudCards.push({ f, el, pct: el.querySelector('.pct span'), stocks: el.querySelector('.stocks'), shown: -1, shownStocks: -1, shake: 0 });
  }
}

function pctColor(p) {
  if (p < 40) return mix('#ffffff', '#ffe066', p / 40);
  if (p < 90) return mix('#ffe066', '#ff8a1f', (p - 40) / 50);
  if (p < 150) return mix('#ff8a1f', '#ff2a3d', (p - 90) / 60);
  return mix('#ff2a3d', '#8a0f1f', clamp((p - 150) / 100, 0, 1));
}

function updateHud() {
  for (const c of hudCards) {
    const f = c.f;
    const pct = Math.round(f.damage);
    if (pct !== c.shown) {
      if (pct > c.shown && c.shown >= 0) c.shake = 12;
      c.shown = pct;
      c.pct.textContent = f.state === 'dead' ? '' : pct;
      c.pct.parentElement.style.color = pctColor(pct);
    }
    if (c.shake > 0) {
      c.shake--;
      c.pct.parentElement.style.transform = c.shake ? `translate(${rand(-3, 3)}px, ${rand(-3, 3)}px) scale(${1 + c.shake * 0.02})` : '';
    }
    if (f.stocks !== c.shownStocks) {
      c.shownStocks = f.stocks;
      c.stocks.innerHTML = Array.from({ length: Math.max(0, f.stocks) }, () => '<i></i>').join('');
    }
    c.el.classList.toggle('out', f.out);
  }
}

function showBanner(text, cls = '') {
  const b = $('banner');
  b.className = `banner ${cls}`;
  b.textContent = text;
  void b.offsetWidth;
  b.classList.add('show');
}

// ---------- Menu ----------
let pickSlot = 0;
let previewCanvas = null;

function slotTypes(i) {
  if (i === 0) return ['you'];
  return ['cpu', 'human', 'off'];
}

function availableInputs(i) {
  const taken = setup.slots.filter((s, j) => j !== i && j > 0 && s.type === 'human').map((s) => s.input);
  return ['keys2', 'pad1', 'pad2', 'pad3', 'pad4'].filter((x) => !taken.includes(x));
}

// The slots as shown: in a room, everyone in it, then the host's computer players.
function menuSlots() {
  if (!room) return setup.slots.map((s, i) => ({ ...s, i }));
  const players = room.players.slice(0, MAXP).map((p, i) => ({
    i, type: p.id === room.id ? 'you' : 'friend', fighter: (p.id === room.id ? setup.slots[0].fighter : lobby.picks[p.id]) || 'random', name: p.name, host: p.host,
  }));
  const rest = [];
  for (let i = players.length; i < MAXP; i++) {
    const c = room.isHost ? setup.slots[i] : lobby.cpus[i];
    rest.push({ i, type: c && c.type === 'cpu' ? 'cpu' : 'off', fighter: (c && c.fighter) || 'random' });
  }
  return [...players, ...rest];
}

function renderMenu() {
  const meP = Arcade.player;
  $('who-face').innerHTML = Arcade.character();
  $('who-name').textContent = meP.name;
  $('who-tix').innerHTML = `${Arcade.ticketIcon}${meP.tickets.toLocaleString('en-US')} tickets`;
  const slots = menuSlots();
  if (!slots[pickSlot] || !canPick(slots[pickSlot])) pickSlot = 0;

  // Slots.
  const wrap = $('slots');
  wrap.innerHTML = '';
  for (const s of slots) {
    const el = document.createElement('div');
    el.className = `slot${s.type === 'off' ? ' off' : ''}${s.i === pickSlot ? ' picking' : ''}`;
    el.style.setProperty('--pc', COLORS[s.i]);
    const def = s.fighter === 'random' ? null : rosterById(s.fighter);
    let label = '';
    if (s.type === 'you') label = room ? `P${s.i + 1} · You` : 'P1 · You';
    else if (s.type === 'friend') label = `P${s.i + 1} · ${s.name}`;
    else if (s.type === 'cpu') label = `P${s.i + 1} · CPU`;
    else if (s.type === 'human') label = `P${s.i + 1} · ${INPUT_LABELS[s.input] || 'Player'}`;
    else label = `P${s.i + 1}`;
    const main = document.createElement('button');
    main.className = 'slot-main';
    main.type = 'button';
    main.innerHTML = `<span class="slot-face"></span><span class="slot-text"><small>${esc(label)}</small><b>${s.type === 'off' ? 'Empty' : def ? esc(def.name) : 'Random'}</b></span>`;
    if (s.type !== 'off') main.querySelector('.slot-face').append(def ? portrait(def, paletteFor(def, s.type === 'you' ? costumeOf(meP.look) : 'classic'), 46, 'head') : randomFace());
    main.disabled = !canPick(s);
    main.onclick = () => { pickSlot = s.i; audio.init(); audio.play('click'); renderMenu(); };
    el.append(main);
    const ctl = document.createElement('div');
    ctl.className = 'slot-ctl';
    if (!room && s.i > 0) {
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'slot-type';
      tb.textContent = s.type === 'cpu' ? 'CPU' : s.type === 'human' ? 'Player' : 'Off';
      tb.onclick = () => {
        const types = slotTypes(s.i);
        const slot = setup.slots[s.i];
        slot.type = types[(types.indexOf(slot.type) + 1) % types.length];
        if (slot.type === 'human' && !availableInputs(s.i).includes(slot.input)) slot.input = availableInputs(s.i)[0] || 'keys2';
        if (slot.type !== 'off') pickSlot = s.i;
        saveSetup();
        renderMenu();
      };
      ctl.append(tb);
      if (s.type === 'human') {
        const ib = document.createElement('button');
        ib.type = 'button';
        ib.className = 'slot-type';
        ib.textContent = INPUT_LABELS[s.input] || 'Keys';
        ib.title = 'Controls for this player';
        ib.onclick = () => {
          const opts = availableInputs(s.i);
          const slot = setup.slots[s.i];
          slot.input = opts[(opts.indexOf(slot.input) + 1) % opts.length] || 'keys2';
          saveSetup();
          renderMenu();
        };
        ctl.append(ib);
      }
    } else if (room && room.isHost && s.i >= room.players.length) {
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'slot-type';
      tb.textContent = s.type === 'cpu' ? 'CPU' : 'Off';
      tb.onclick = () => {
        const slot = setup.slots[s.i];
        slot.type = slot.type === 'cpu' ? 'off' : 'cpu';
        if (slot.type === 'cpu') pickSlot = s.i;
        saveSetup();
        hostLobby();
        renderMenu();
      };
      ctl.append(tb);
    } else if (s.host) {
      const em = document.createElement('em');
      em.textContent = 'Host';
      ctl.append(em);
    }
    el.append(ctl);
    wrap.append(el);
  }

  // Roster.
  const cur = slots[pickSlot];
  const grid = $('roster');
  grid.innerHTML = '';
  for (const id of (cur.type === 'cpu' ? [...ROSTER.map((d) => d.id), 'random'] : ROSTER.map((d) => d.id))) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ftile';
    b.style.setProperty('--pc', COLORS[pickSlot]);
    const def = id === 'random' ? null : rosterById(id);
    b.setAttribute('aria-pressed', String(cur.fighter === id));
    b.append(def ? portrait(def, def.pal, 64, 'body') : randomFace(64));
    const nm = document.createElement('span');
    nm.textContent = def ? def.name : 'Random';
    b.append(nm);
    const badges = slots.filter((s) => s.type !== 'off' && s.fighter === id);
    for (const s of badges) {
      const i = document.createElement('i');
      i.style.background = COLORS[s.i];
      i.textContent = `P${s.i + 1}`;
      b.append(i);
    }
    b.onclick = () => {
      audio.init();
      audio.play('click');
      choose(pickSlot, id);
    };
    grid.append(b);
  }

  // Info about the picked fighter.
  const def = cur.fighter === 'random' ? null : rosterById(cur.fighter);
  $('info-name').textContent = def ? def.name : 'Random';
  $('info-blurb').textContent = def ? def.blurb : 'A surprise pick each match.';
  $('info-bars').innerHTML = def
    ? Object.entries({ Speed: def.bars.speed, Power: def.bars.power, Weight: def.bars.weight, Recovery: def.bars.recovery, Reach: def.bars.range })
      .map(([k, v]) => `<div class="bar"><span>${k}</span><b>${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</b></div>`).join('')
    : '';
  $('info-specials').innerHTML = def
    ? ['Neutral', 'Side', 'Up', 'Down'].map((k, i) => `<li><kbd>${k}</kbd> ${esc(def.specialNames[i])}</li>`).join('')
    : '';
  previewDef = def;
  previewPal = def ? paletteFor(def, cur.type === 'you' ? costumeOf(meP.look) : 'classic') : null;

  // Costumes (your own fighter).
  const sw = $('costumes');
  sw.innerHTML = '';
  $('costume-row').hidden = cur.type !== 'you';
  for (const item of Arcade.items('brawlCostume')) {
    const own = Arcade.owns('brawlCostume', item.id);
    const b = document.createElement('button');
    b.className = `swatch${own ? '' : ' locked'}`;
    b.style.background = item.swatch;
    b.title = own ? item.name : `${item.name}: ${item.price ? `${item.price} tickets` : 'quest reward'}`;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(own && item.id === costumeOf(meP.look)));
    b.onclick = () => {
      if (own) Arcade.setLook({ brawlCostume: item.id });
      else Arcade.open({ slot: 'brawlCostume', item: item.id });
    };
    sw.append(b);
  }

  // Stage and rules.
  const curStage = isGuest() ? lobby.stage : setup.stage;
  const stWrap = $('stages');
  stWrap.innerHTML = '';
  for (const s of STAGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stile';
    b.disabled = isGuest();
    b.setAttribute('aria-pressed', String(s.id === curStage));
    b.innerHTML = `<b>${esc(s.name)}</b><small>${esc(s.blurb)}</small>`;
    b.prepend(stageThumb(s));
    b.onclick = () => {
      setup.stage = s.id;
      saveSetup();
      stage = s;
      buildMenuStage();
      if (room && room.isHost) hostLobby();
      renderMenu();
    };
    stWrap.append(b);
  }
  if (phase === 'menu' && stage.id !== curStage) { stage = stageById(curStage); buildMenuStage(); }
  const stocks = isGuest() ? lobby.stocks : setup.stocks;
  const level = isGuest() ? lobby.level : setup.level;
  document.querySelectorAll('#stocks button').forEach((b) => { b.setAttribute('aria-pressed', String(Number(b.dataset.v) === stocks)); b.disabled = isGuest(); });
  document.querySelectorAll('#level button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.v === level)); b.disabled = isGuest(); });

  // Start.
  const start = $('start-btn');
  start.disabled = isGuest();
  const count = slots.filter((s) => s.type !== 'off').length;
  start.textContent = isGuest() ? 'Waiting for the host…' : count > 1 ? `Fight! · ${count} fighters` : 'Fight!';
  $('start-note').textContent = isGuest()
    ? (waitingForMatch ? 'A fight is already on. You\'ll be in the next one.' : 'The host picks the stage and rules and starts the fight.')
    : count < 2 ? 'Turn on a CPU or a second player to fight.' : '';
  const wins = store.get('brawl.wins', 0);
  $('best-line').innerHTML = wins ? `Wins so far: <strong>${wins}</strong>` : '';
}

function canPick(s) {
  if (s.type === 'off' || s.type === 'friend') return false;
  if (room && s.type === 'cpu' && !room.isHost) return false;
  return true;
}

function choose(i, id) {
  const slots = menuSlots();
  const s = slots[i];
  if (!s || !canPick(s)) return;
  if (s.type === 'you') {
    if (id === 'random') return;
    setup.slots[0].fighter = id;
    if (room) {
      if (room.isHost) hostLobby();
      else room.send({ t: 'pick', fighter: id });
    }
  } else {
    setup.slots[i].fighter = id;
    if (room && room.isHost) hostLobby();
  }
  saveSetup();
  renderMenu();
}

function randomFace(size = 46) {
  const c = document.createElement('canvas');
  c.width = size * 2;
  c.height = size * 2;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const x = c.getContext('2d');
  x.fillStyle = '#3a2d63';
  x.beginPath(); x.arc(size, size, size * 0.8, 0, TAU); x.fill();
  x.fillStyle = '#fff';
  x.font = `${size}px Bungee, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('?', size, size * 1.08);
  return c;
}

const stageThumbs = new Map();
function stageThumb(s) {
  let src = stageThumbs.get(s.id);
  if (!src) {
    src = document.createElement('canvas');
    src.width = 240;
    src.height = 130;
    const c = src.getContext('2d');
    const keep = { stage, surfaces, ledges, W, H, cam: { ...cam }, g };
    stage = s;
    buildMenuStage();
    W = 240;
    H = 130;
    Object.assign(cam, { x: 0, y: -150, z: 240 / 1500 });
    swapCtx(c, () => {
      drawBackground();
      c.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
      drawStage();
      drawForeground();
    });
    ({ stage, surfaces, ledges, W, H } = keep);
    Object.assign(cam, keep.cam);
    stageThumbs.set(s.id, src);
  }
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  out.getContext('2d').drawImage(src, 0, 0);
  return out;
}

let previewDef = null;
let previewPal = null;
function drawPreview() {
  const c = previewCanvas || (previewCanvas = $('preview'));
  if (!c || !previewDef || $('menu').hidden) return;
  const px = c.width;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, c.height);
  const def = previewDef;
  const box = 150;
  const k = c.height / box;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const fake = { def, pal: previewPal, facing: 1, state: 'idle', sf: clock, slot: 0, vx: 0, vy: 0, grounded: true, groundedFlag: true, anim: { run: 0 }, owned: true, move: null };
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(px / k / 2, box - 14, 40 * def.s, 8, 0, 0, TAU); ctx.fill();
  swapCtx(ctx, () => drawFighter(fake, px / k / 2, box - 14, clock));
}

// Draw with another context for a moment (portraits, thumbnails), then put the main one back.
function swapCtx(ctx, fn) {
  const keep = g;
  g = ctx;
  try { fn(); } finally { g = keep; }
}

// ---------- Input wiring ----------
window.addEventListener('keydown', (e) => {
  const inGame = phase !== 'menu';
  if (inGame && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!(paused || pauseShown));
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (!room) setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !room) setPaused(true); });

// Touch: a stick on the left, buttons on the right.
(() => {
  const stick = $('stick');
  const knob = $('knob');
  let id = null;
  let cx = 0;
  let cy = 0;
  const set = (x, y) => {
    const n = Math.hypot(x, y);
    const m = Math.min(1, n / 50);
    const nx = n ? (x / n) * m : 0;
    const ny = n ? (y / n) * m : 0;
    touchIn.x = Math.abs(nx) > 0.3 ? nx : 0;
    touchIn.y = Math.abs(ny) > 0.35 ? ny : 0;
    knob.style.transform = `translate(${nx * 40}px, ${ny * 40}px)`;
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    stick.setPointerCapture(id);
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    set(e.clientX - cx, e.clientY - cy);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(ev, (e) => { if (e.pointerId === id) { id = null; set(0, 0); } });
  document.querySelectorAll('[data-touch]').forEach((btn) => {
    const key = btn.dataset.touch;
    const on = (v) => { btn.classList.toggle('active', v); touchIn[key] = v; };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); on(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => on(false));
  });
})();

function toggleMute() {
  audio.setMuted(!audio.muted);
  $('mute-btn').textContent = audio.muted ? '🔇' : '🔊';
}

document.querySelectorAll('#stocks button').forEach((b) => {
  b.onclick = () => {
    if (isGuest()) return;
    setup.stocks = Number(b.dataset.v);
    saveSetup();
    if (room) hostLobby();
    renderMenu();
  };
});
document.querySelectorAll('#level button').forEach((b) => {
  b.onclick = () => {
    if (isGuest()) return;
    setup.level = b.dataset.v;
    saveSetup();
    if (room) hostLobby();
    renderMenu();
  };
});

$('who-btn').onclick = () => Arcade.open();
Arcade.onChange(() => { if (phase === 'menu') renderMenu(); });
$('start-btn').onclick = hostStart;
$('again-btn').onclick = hostStart;
$('restart-btn').onclick = hostStart;
$('resume-btn').onclick = () => setPaused(false);
$('menu-btn').onclick = () => toMenu();
$('results-menu-btn').onclick = () => toMenu();
// The HUD buttons let go of focus so Space (jump) can't press them again.
$('pause-btn').onclick = (e) => { e.currentTarget.blur(); setPaused(true); };
$('mute-btn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('mute-btn').textContent = audio.muted ? '🔇' : '🔊';
$('mp').append(ArcadeNet.panel({
  hosts: [{ game: 'blastzone', label: 'Host a brawl' }],
  max: MAXP,
  blurb: 'Up to 4 fighters',
  onRoom,
}).el);

// ---------- Boot ----------
toMenu();
requestAnimationFrame(frame);
})();
