// Blast Zone's fighters: how each one looks, how quick and heavy it is, and its moves.
// Every fighter gets the same set of normal attacks, scaled to its size, strength and speed;
// its four specials are its own. game.js calls BlastRoster.build(api) once and steps, hits and
// draws with what comes back.
window.BlastRoster = (() => {
'use strict';

// ---------- Poses ----------
// Angles are in degrees. Arms and legs: [upper, lower], where the upper angle is measured from
// pointing straight down (0) toward the way the fighter faces (90 is straight ahead, 180 straight
// up), and the lower one bends from there. lean tips the torso forward; spin turns the whole body.
const P = {
  stand: { lean: 4, aF: [16, 30], aB: [-16, 26], lF: [9, -6], lB: [-9, -4] },
  crouch: { lean: 30, aF: [40, 50], aB: [10, 50], lF: [75, -125], lB: [15, -110] },
  squat: { lean: 18, aF: [10, 30], aB: [-20, 30], lF: [55, -100], lB: [0, -90] },
  jump: { lean: -4, aF: [105, -15], aB: [-40, 30], lF: [35, -85], lB: [-8, -25] },
  fall: { lean: 2, aF: [100, 30], aB: [-110, -20], lF: [18, -35], lB: [-12, -18] },
  land: { lean: 22, aF: [50, 40], aB: [20, 40], lF: [55, -100], lB: [5, -90] },
  hurt: { lean: -28, head: -18, aF: [100, 60], aB: [-120, 30], lF: [35, -45], lB: [-20, -30] },
  tumble: { lean: -10, aF: [120, 10], aB: [-120, 10], lF: [50, -20], lB: [-40, -20] },
  shield: { lean: 12, aF: [70, 85], aB: [55, 80], lF: [28, -35], lB: [-26, -12] },
  dizzy: { lean: -8, head: 16, aF: [25, 10], aB: [-25, 10], lF: [8, -4], lB: [-8, -4] },
  hang: { lean: 0, aF: [176, 0], aB: [170, 0], lF: [6, -12], lB: [-6, -6] },
  helpless: { lean: 14, aF: [115, 20], aB: [-140, 10], lF: [25, -50], lB: [-15, -30] },
  win: { lean: -6, aF: [165, 10], aB: [-20, 30], lF: [12, -6], lB: [-12, -4] },
  lie: { lean: 90, spin: 0, aF: [100, 10], aB: [80, 10], lF: [90, -5], lB: [85, -5] },
  windup: { lean: -10, aF: [-35, 95], aB: [45, 40], lF: [26, -22], lB: [-22, -8] },
  punch: { lean: 16, aF: [92, 0], aB: [-40, 35], lF: [30, -16], lB: [-30, -6] },
  kickWind: { lean: -8, aF: [40, 40], aB: [-40, 40], lF: [50, -100], lB: [-6, -8] },
  kick: { lean: -24, aF: [55, 30], aB: [-55, 30], lF: [96, 0], lB: [-4, -10] },
  sweep: { lean: 38, aF: [60, 30], aB: [25, 40], lF: [86, 0], lB: [25, -120] },
  upWind: { lean: 15, aF: [10, 30], aB: [-30, 30], lF: [30, -40], lB: [-20, -20] },
  upHit: { lean: -12, aF: [178, 0], aB: [-50, 30], lF: [12, -10], lB: [-14, -6] },
  smWind: { lean: -22, aF: [-80, 70], aB: [-100, 50], lF: [32, -32], lB: [-34, -8] },
  smHit: { lean: 30, aF: [96, 0], aB: [82, 12], lF: [44, -10], lB: [-42, 0] },
  usWind: { lean: 22, aF: [20, 40], aB: [5, 40], lF: [60, -110], lB: [0, -95] },
  usHit: { lean: -6, aF: [180, 0], aB: [172, 0], lF: [8, -2], lB: [-8, 0] },
  dsWind: { lean: 10, aF: [40, 60], aB: [-40, 60], lF: [45, -80], lB: [-45, -80] },
  dsHit: { lean: 18, aF: [84, 0], aB: [-84, 0], lF: [72, -6], lB: [-72, -6] },
  nair: { lean: 0, aF: [100, 0], aB: [-100, 0], lF: [65, -8], lB: [-65, -8] },
  fairWind: { lean: -10, aF: [170, 20], aB: [-30, 30], lF: [30, -60], lB: [-10, -30] },
  fair: { lean: 22, aF: [60, -10], aB: [-40, 30], lF: [40, -60], lB: [-20, -40] },
  bair: { lean: 24, aF: [40, 40], aB: [-20, 40], lF: [30, -90], lB: [-105, 0] },
  uair: { lean: -30, aF: [130, 20], aB: [-60, 30], lF: [160, 0], lB: [20, -60] },
  dair: { lean: 4, aF: [40, 60], aB: [-40, 60], lF: [8, 0], lB: [-8, 0] },
  grab: { lean: 22, aF: [86, 0], aB: [78, 8], lF: [34, -16], lB: [-32, -6] },
  hold: { lean: 8, aF: [80, 20], aB: [70, 25], lF: [20, -14], lB: [-20, -6] },
  throwF: { lean: 26, aF: [100, 0], aB: [90, 0], lF: [40, -12], lB: [-40, -4] },
  throwB: { lean: -26, aF: [-110, 0], aB: [-100, 0], lF: [30, -20], lB: [-36, -6] },
  throwU: { lean: -10, aF: [175, 0], aB: [168, 0], lF: [12, -8], lB: [-12, -4] },
  throwD: { lean: 34, aF: [40, 0], aB: [30, 0], lF: [50, -80], lB: [-10, -60] },
  cast: { lean: 10, aF: [95, 5], aB: [80, 20], lF: [30, -18], lB: [-28, -6] },
  castWind: { lean: -10, aF: [-50, 100], aB: [-30, 80], lF: [22, -20], lB: [-24, -6] },
  dash: { lean: 32, aF: [100, 0], aB: [-70, 20], lF: [60, -40], lB: [-50, -30] },
  rise: { lean: -6, aF: [178, 0], aB: [-30, 40], lF: [20, -60], lB: [-10, -20] },
  ball: { lean: 40, aF: [60, 120], aB: [40, 120], lF: [110, -150], lB: [90, -150] },
  stomp: { lean: 0, aF: [150, 20], aB: [-150, 20], lF: [5, 0], lB: [-5, 0] },
  counter: { lean: -4, aF: [60, 110], aB: [40, 100], lF: [20, -20], lB: [-24, -6] },
  swingWind: { lean: -12, aF: [205, -10], aB: [-30, 40], lF: [26, -22], lB: [-24, -8] },
  swingF: { lean: 20, aF: [80, 0], aB: [-40, 30], lF: [34, -16], lB: [-32, -6] },
  swingLow: { lean: 30, aF: [40, 0], aB: [-30, 30], lF: [50, -60], lB: [-30, -10] },
  swingUp: { lean: -10, aF: [180, 0], aB: [-40, 30], lF: [14, -8], lB: [-14, -4] },
};

// ---------- Normal attacks ----------
// One set of normals, built for each fighter from its size (s), strength (pow), speed (spd, a
// frame multiplier: lower is quicker), extra reach (rch) and hit effect (fx). A hit is
// { f: [first, last frame], b: [[x, y, r] boxes, x forward of the feet], d: damage, a: launch angle
// (361 = low on the ground, 40 in the air; negative spikes downward), bk: base knockback,
// kg: knockback growth }. `rev` sends the victim away from the attacker; `back` launches behind.
function normals(o) {
  const { s, pow, spd, rch = 0, fx, sword = false, armor = false } = o;
  const fr = (n) => Math.max(1, Math.round(n * spd));
  const boxes = (b, grow = 1) => b.map(([x, y, r]) => [x * s + Math.sign(x) * rch, y * s - (y < -90 ? rch * 0.6 : 0), r * s * grow]);
  const hit = (f, b, d, a, bk, kg, extra = {}) => ({ f: [fr(f[0]), fr(f[1])], b: boxes(b, rch ? 1.15 : 1), d: Math.round(d * pow), a, bk, kg, fx, ...extra });
  const pose = (keys) => keys.map(([t, p]) => [fr(t), p]);
  const sw = (a, b) => (sword ? a : b);
  return {
    jab: { dur: fr(18), iasa: fr(11), hits: [hit([3, 5], [[36, -64, 15], [20, -64, 13]], 3, 361, 18, 45)],
      pose: pose([[0, 'stand'], [2, sw('swingWind', 'windup')], [4, sw('swingF', 'punch')], [9, sw('swingF', 'punch')], [18, 'stand']]) },
    ftilt: { dur: fr(30), hits: [hit([7, 10], [[42, -50, 16], [66, -48, 15]], 9, 35, 32, 92)],
      pose: pose([[0, 'stand'], [4, sw('swingWind', 'kickWind')], [7, sw('swingF', 'kick')], [13, sw('swingF', 'kick')], [30, 'stand']]) },
    utilt: { dur: fr(28), hits: [hit([6, 12], [[20, -100, 18], [0, -120, 17], [-20, -100, 16]], 7, 92, 40, 105)],
      pose: pose([[0, 'stand'], [3, 'upWind'], [7, sw('swingUp', 'upHit')], [13, sw('swingUp', 'upHit')], [28, 'stand']]) },
    dtilt: { dur: fr(22), hits: [hit([5, 8], [[40, -12, 15], [62, -10, 14]], 6, 78, 42, 62)],
      pose: pose([[0, 'crouch'], [3, 'crouch'], [5, sw('swingLow', 'sweep')], [11, sw('swingLow', 'sweep')], [22, 'crouch']]) },
    dash: { dur: fr(36), hits: [hit([6, 10], [[30, -52, 24]], 10, 45, 44, 72), hit([11, 16], [[30, -52, 20]], 7, 50, 38, 60)],
      pose: pose([[0, 'stand'], [4, sw('swingF', 'dash')], [18, sw('swingF', 'dash')], [36, 'stand']]), fric: 0.25 },
    fsmash: { dur: fr(48), smash: true, charge: { at: fr(10), max: 60, btn: 'attack' }, armor: armor ? [2, fr(14)] : null,
      hits: [hit([14, 17], [[48, -58, 20], [78, -56, 18]], 16, 38, 30, 100)],
      pose: pose([[0, 'stand'], [6, sw('swingWind', 'smWind')], [13, sw('swingWind', 'smWind')], [15, sw('swingF', 'smHit')], [24, sw('swingF', 'smHit')], [48, 'stand']]) },
    usmash: { dur: fr(44), smash: true, charge: { at: fr(8), max: 60, btn: 'attack' }, armor: armor ? [2, fr(11)] : null,
      hits: [hit([11, 16], [[10, -110, 22], [0, -134, 20]], 15, 88, 34, 98)],
      pose: pose([[0, 'stand'], [5, 'usWind'], [10, 'usWind'], [12, sw('swingUp', 'usHit')], [20, sw('swingUp', 'usHit')], [44, 'stand']]) },
    dsmash: { dur: fr(46), smash: true, charge: { at: fr(6), max: 60, btn: 'attack' }, armor: armor ? [2, fr(9)] : null,
      hits: [hit([9, 12], [[46, -12, 18], [-46, -12, 18]], 13, 25, 30, 98, { rev: true })],
      pose: pose([[0, 'stand'], [4, 'dsWind'], [8, 'dsWind'], [10, 'dsHit'], [20, 'dsHit'], [46, 'stand']]) },
    nair: { dur: fr(36), air: true, landLag: 8,
      hits: [hit([4, 8], [[0, -50, 34]], 9, 40, 30, 88, { rev: true }), hit([9, 20], [[0, -50, 30]], 6, 40, 25, 80, { rev: true })],
      pose: pose([[0, 'fall'], [3, 'nair'], [20, 'nair'], [36, 'fall']]) },
    fair: { dur: fr(38), air: true, landLag: 14, hits: [hit([10, 13], [[40, -50, 20], [62, -38, 17]], 12, 45, 30, 95)],
      pose: pose([[0, 'fall'], [5, sw('swingWind', 'fairWind')], [10, sw('swingF', 'fair')], [16, sw('swingLow', 'fair')], [38, 'fall']]) },
    bair: { dur: fr(32), air: true, landLag: 10, hits: [hit([7, 10], [[-46, -46, 18], [-68, -44, 16]], 13, 40, 32, 98, { back: true })],
      pose: pose([[0, 'fall'], [4, 'bair'], [14, 'bair'], [32, 'fall']]) },
    uair: { dur: fr(30), air: true, landLag: 8, hits: [hit([5, 9], [[10, -112, 20], [-12, -122, 18]], 9, 85, 35, 92)],
      pose: pose([[0, 'fall'], [3, sw('swingUp', 'uair')], [11, sw('swingUp', 'uair')], [30, 'fall']]) },
    dair: { dur: fr(42), air: true, landLag: 18,
      hits: [hit([12, 16], [[0, -4, 22], [0, 16, 16]], 13, -80, 25, 85)],
      pose: pose([[0, 'fall'], [8, 'fairWind'], [12, sw('swingLow', 'dair')], [20, sw('swingLow', 'dair')], [42, 'fall']]) },
    grab: { dur: 30, grab: { f: [6, 8], b: boxes([[40, -56, 20]]).map(([x, y, r]) => [x - rch * 0.7, y, r]) },
      pose: [[0, 'stand'], [5, 'grab'], [14, 'grab'], [30, 'stand']] },
    fthrow: { dur: 26, thr: { f: 10, d: 8, a: 40, bk: 60, kg: 60, fx }, pose: [[0, 'hold'], [6, 'windup'], [10, 'throwF'], [26, 'stand']] },
    bthrow: { dur: 30, thr: { f: 12, d: 10, a: 135, bk: 60, kg: 70, fx }, pose: [[0, 'hold'], [6, 'throwB'], [12, 'throwB'], [30, 'stand']] },
    uthrow: { dur: 28, thr: { f: 10, d: 7, a: 88, bk: 70, kg: 60, fx }, pose: [[0, 'hold'], [4, 'usWind'], [10, 'throwU'], [28, 'stand']] },
    dthrow: { dur: 30, thr: { f: 14, d: 6, a: 75, bk: 50, kg: 40, fx }, pose: [[0, 'hold'], [6, 'throwD'], [14, 'throwD'], [30, 'stand']] },
    ledgeAtk: { dur: 36, intang: [0, 20], hits: [hit([18, 22], [[40, -30, 26]], 8, 45, 50, 30)],
      pose: [[0, 'squat'], [14, 'squat'], [18, sw('swingF', 'kick')], [26, sw('swingF', 'kick')], [36, 'stand']] },
  };
}

// ---------- Drawing bits shared by several fighters ----------
const TAU = Math.PI * 2;
function eyes(g, D, J, { color = '#fff', pupil = '#1d1b26', size = 1, gap = 0.36, y = -0.05, angry = false, glow = null } = {}) {
  const r = J.hr;
  const F = J.F;
  for (const k of [0.22, 0.22 - gap]) {
    const inner = k > 0 ? -F : F; // toward the other eye
    const x = J.head.x + F * r * k + F * r * 0.18;
    const yy = J.head.y + r * y;
    if (glow) {
      g.fillStyle = glow;
      g.beginPath(); g.ellipse(x, yy, r * 0.17 * size, r * 0.1 * size, 0, 0, TAU); g.fill();
      continue;
    }
    g.fillStyle = color;
    g.beginPath(); g.ellipse(x, yy, r * 0.15 * size, r * 0.21 * size, 0, 0, TAU); g.fill();
    g.fillStyle = pupil;
    g.beginPath(); g.ellipse(x + F * r * 0.05, yy + r * 0.02, r * 0.08 * size, r * 0.13 * size, 0, 0, TAU); g.fill();
    if (angry) {
      g.strokeStyle = D.INK; g.lineWidth = r * 0.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - inner * r * 0.2, yy - r * 0.36); g.lineTo(x + inner * r * 0.16, yy - r * 0.22); g.stroke();
    }
  }
}

function flicker(t, seed) { return Math.sin(t * 0.4 + seed) * 0.5 + Math.sin(t * 0.73 + seed * 2.1) * 0.5; }

// ---------- The roster ----------
function build(api) {
  const D = api.draw;

  const fighters = [];
  const add = (def) => {
    const moves = { ...normals(def.norm), ...def.specials };
    fighters.push({ ...def, moves });
  };

  // ===== Blaze: all-rounder with fire =====
  add({
    id: 'blaze', name: 'Blaze', blurb: 'A hot-headed all-rounder. Good at everything, best at nothing.',
    specialNames: ['Fireball', 'Flame Dash', 'Rising Phoenix', 'Flare Burst'],
    bars: { speed: 3, power: 3, weight: 3, recovery: 3, range: 3 },
    s: 1, w: 44, h: 100,
    stats: { weight: 100, run: 8.2, air: 5.6, airAcc: 0.42, grav: 0.62, fall: 10.5, ffall: 15, jump: 15.5, djump: 15, jumps: 2, traction: 0.75 },
    norm: { s: 1, pow: 0.96, spd: 1, fx: 'fire' },
    fx: 'fire',
    pal: { skin: '#f4c29a', body: '#e53935', arms: '#f4c29a', legs: '#2d3a8c', hands: '#ffffff', feet: '#6b3a1f', hair: '#ff8a1f', accent: '#ffd23f' },
    look: {
      head(g, J, c, t) {
        const r = J.hr;
        // Flame hair: tongues of fire flickering up and back from the crown.
        for (let i = 0; i < 5; i++) {
          const k = i / 4;
          const bx = J.head.x - J.F * r * (0.7 - k * 1.2);
          const h = r * (1.2 + 0.4 * Math.sin(k * 3)) + flicker(t, i) * r * 0.22;
          g.fillStyle = i % 2 ? c.accent : c.hair;
          g.beginPath();
          g.moveTo(bx - r * 0.42, J.head.y - r * 0.2);
          g.quadraticCurveTo(bx - J.F * r * 0.5, J.head.y - h * 0.8, bx - J.F * r * 0.6, J.head.y - h);
          g.quadraticCurveTo(bx + r * 0.1, J.head.y - h * 0.5, bx + r * 0.42, J.head.y - r * 0.2);
          g.fill();
        }
        D.ball(g, J.head.x, J.head.y, r, c.skin);
        // Headband.
        g.fillStyle = c.body;
        g.beginPath(); g.ellipse(J.head.x, J.head.y - r * 0.42, r * 1.02, r * 0.22, J.ha, 0, TAU); g.fill();
        g.fillStyle = c.body;
        g.beginPath(); g.moveTo(J.head.x - J.F * r * 0.9, J.head.y - r * 0.4); g.lineTo(J.head.x - J.F * r * 1.7, J.head.y - r * 0.1 + Math.sin(t * 0.3) * 4); g.lineTo(J.head.x - J.F * r * 1.5, J.head.y - r * 0.55); g.fill();
        eyes(g, D, J, { angry: true });
        g.strokeStyle = D.INK; g.lineWidth = r * 0.09; g.lineCap = 'round';
        g.beginPath(); g.moveTo(J.head.x + J.F * r * 0.15, J.head.y + r * 0.45); g.quadraticCurveTo(J.head.x + J.F * r * 0.4, J.head.y + r * 0.58, J.head.x + J.F * r * 0.62, J.head.y + r * 0.4); g.stroke();
      },
    },
    specials: {
      nspec: { dur: 34, pose: [[0, 'castWind'], [10, 'cast'], [24, 'cast'], [34, 'stand']], grav: 0.7,
        on: { 11: (f) => { api.proj(f, { kind: 'fireball', x: 40, y: -62, vx: 7.5, vy: 1, grav: 0.38, bounce: 7, life: 90, r: 13, d: 5, a: 361, bk: 22, kg: 40, fx: 'fire' }); api.sfx(f, 'fire'); } } },
      sspec: { dur: 44, once: 'side', helpless: false, grav: 0, pose: [[0, 'windup'], [7, 'dash'], [27, 'dash'], [44, 'fall']],
        tick: (f, m) => { if (m >= 7 && m <= 26) { f.vx = f.facing * 12.5; f.vy = 0; } else if (m > 26) { f.vx *= 0.9; f.noGrav = false; } },
        hits: [{ f: [8, 26], b: [[16, -52, 34]], d: 9, a: 40, bk: 48, kg: 72, fx: 'fire' }],
        vis: (f, m) => { if (m >= 7 && m <= 26) api.burst(f, 'fire', 0, -52, 2); } },
      uspec: { dur: 42, helpless: true, pose: [[0, 'squat'], [3, 'rise'], [24, 'rise'], [42, 'helpless']], spin: [3, 22, 720],
        on: { 3: (f) => { f.vy = -17.5; f.vx = api.inp(f).x * 3.5; api.sfx(f, 'fire'); } },
        hits: [
          { f: [3, 7], b: [[10, -70, 30]], d: 6, a: 85, bk: 60, kg: 30, fx: 'fire' },
          { f: [9, 12], b: [[0, -80, 28]], d: 2, a: 90, bk: 40, kg: 10, fx: 'fire' },
          { f: [13, 16], b: [[0, -80, 28]], d: 2, a: 90, bk: 40, kg: 10, fx: 'fire' },
          { f: [18, 21], b: [[0, -90, 32]], d: 5, a: 80, bk: 70, kg: 60, fx: 'fire' },
        ],
        vis: (f, m) => { if (m >= 3 && m <= 22) api.burst(f, 'fire', 0, -40, 2); } },
      dspec: { dur: 50, grav: 0.35, pose: [[0, 'shield'], [14, 'squat'], [16, 'nair'], [30, 'nair'], [50, 'stand']],
        hits: [{ f: [15, 19], b: [[0, -50, 74]], d: 14, a: 50, bk: 42, kg: 95, fx: 'fire', rev: true }],
        vis: (f, m) => { if (m < 15) api.burst(f, 'ember', 0, -50, 1, 60); if (m === 15) api.ring(f, 0, -50, 80, '#ff8a1f'); } },
    },
  });

  // ===== Brick: slow, heavy stone golem =====
  add({
    id: 'brick', name: 'Brick', blurb: 'A walking boulder. Slow, hard to send flying, and small hits won\'t stop its smashes.',
    specialNames: ['Boulder Toss', 'Shoulder Charge', 'Rock Rocket', 'Quake Slam'],
    bars: { speed: 1, power: 5, weight: 5, recovery: 1, range: 3 },
    s: 1.28, w: 64, h: 128,
    stats: { weight: 140, run: 6.9, air: 4.8, airAcc: 0.32, grav: 0.7, fall: 11.5, ffall: 16, jump: 14.5, djump: 13.5, jumps: 2, traction: 0.95 },
    norm: { s: 1.28, pow: 1.22, spd: 1.08, fx: 'stone', armor: true },
    fx: 'stone',
    pal: { skin: '#8c8577', body: '#7a7366', arms: '#8c8577', legs: '#6b6458', hands: '#9a9284', feet: '#5a544a', accent: '#ff9d2e', moss: '#5f8f3e' },
    props: { torso: 32, uArm: 18, lArm: 19, thigh: 19, shin: 19, headR: 16, bodyW: 40, limbW: 16, neck: 6 },
    look: {
      torso(g, J, c) {
        // A slab of rock for a body, with a couple of mossy patches.
        g.save();
        g.translate((J.hip.x + J.sh.x) / 2, (J.hip.y + J.sh.y) / 2);
        g.rotate(J.la);
        const w = J.s * 46;
        const h = J.s * 44;
        D.rrect(g, -w / 2, -h / 2, w, h, J.s * 10, c.body);
        g.fillStyle = c.moss;
        g.beginPath(); g.ellipse(-w * 0.18, -h * 0.4, w * 0.28, h * 0.12, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = J.s * 2.5;
        g.beginPath(); g.moveTo(w * 0.1, -h * 0.1); g.lineTo(-w * 0.05, h * 0.12); g.lineTo(w * 0.12, h * 0.3); g.stroke();
        g.restore();
      },
      head(g, J, c, t) {
        const r = J.hr;
        g.save();
        g.translate(J.head.x, J.head.y);
        g.rotate(J.ha);
        D.rrect(g, -r * 1.15, -r * 0.95, r * 2.3, r * 1.9, r * 0.45, c.skin);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(J.F > 0 ? r * 0.05 : -r * 1.05, -r * 0.32, r * 1, r * 0.12);
        g.restore();
        eyes(g, D, J, { glow: c.accent, y: 0.05, gap: 0.5, size: 1.1 });
        g.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.1);
        eyes(g, D, J, { glow: '#fff3c4', y: 0.05, gap: 0.5, size: 0.5 });
        g.globalAlpha = 1;
      },
    },
    specials: {
      nspec: { dur: 46, pose: [[0, 'stand'], [8, 'usWind'], [16, 'throwU'], [22, 'cast'], [46, 'stand']],
        on: { 18: (f) => { api.proj(f, { kind: 'rock', x: 40, y: -110, vx: 6, vy: -6.5, grav: 0.45, life: 100, r: 22, d: 12, a: 45, bk: 40, kg: 70, fx: 'stone' }); api.sfx(f, 'heavy'); } } },
      sspec: { dur: 50, once: 'side', armor: [6, 30], pose: [[0, 'windup'], [7, 'dash'], [30, 'dash'], [50, 'stand']],
        tick: (f, m) => { if (m >= 8 && m <= 30) f.vx = f.facing * (10 - (m - 8) * 0.15); else if (m > 30) f.vx *= 0.85; },
        hits: [{ f: [8, 30], b: [[34, -66, 36]], d: 12, a: 40, bk: 52, kg: 75, fx: 'stone' }],
        vis: (f, m) => { if (m >= 8 && m <= 30 && m % 3 === 0 && f.grounded) api.burst(f, 'dust', -20, 0, 2); } },
      uspec: { dur: 44, helpless: true, grav: 0.5, pose: [[0, 'squat'], [6, 'usHit'], [26, 'usHit'], [44, 'helpless']],
        on: { 6: (f) => { f.vy = -14; f.vx = api.inp(f).x * 2.5; api.sfx(f, 'heavy'); } },
        hits: [{ f: [6, 18], b: [[0, -140, 34]], d: 10, a: 88, bk: 52, kg: 60, fx: 'stone' }],
        vis: (f, m) => { if (m >= 6 && m <= 24) api.burst(f, 'ember', 0, 10, 2); } },
      dspec: { dur: 60, grav: 1, keepOnLand: true, pose: [[0, 'squat'], [6, 'jump'], [12, 'stomp'], [44, 'stomp'], [60, 'stand']],
        on: { 4: (f) => { if (f.grounded) { f.vy = -9; f.grounded = null; } } },
        tick: (f, m) => {
          if (m >= 12 && m < 44 && !f.landedSlam) {
            f.vy = 18; f.vx *= 0.8;
            if (f.grounded) {
              f.landedSlam = true;
              api.quake(f);
              f.mf = 44;
            }
            return m === 43 ? 'hold' : undefined;
          }
          return undefined;
        },
        start: (f) => { f.landedSlam = false; },
        hits: [{ f: [12, 43], b: [[0, 0, 34]], d: 14, a: -75, bk: 30, kg: 70, fx: 'stone' }] },
    },
  });

  // ===== Zip: quick, light ninja =====
  add({
    id: 'zip', name: 'Zip', blurb: 'A ninja who hits fast and gets out faster. Light, so keep moving.',
    specialNames: ['Shuriken', 'Shadow Step', 'Vanish', 'Counter'],
    bars: { speed: 5, power: 2, weight: 2, recovery: 4, range: 2 },
    s: 0.94, w: 40, h: 94,
    stats: { weight: 78, run: 10.4, air: 6.2, airAcc: 0.55, grav: 0.72, fall: 12, ffall: 17, jump: 16.5, djump: 14.5, jumps: 3, traction: 0.7 },
    norm: { s: 0.94, pow: 0.82, spd: 0.8, fx: 'shadow' },
    fx: 'shadow',
    pal: { skin: '#e0a874', body: '#3b2b5c', arms: '#3b2b5c', legs: '#2a1f42', hands: '#1d1630', feet: '#1d1630', scarf: '#ef3b4f', mask: '#2a1f42' },
    look: {
      back(g, J, c, t, f) {
        // Scarf tails stream out behind the neck, more so when moving fast.
        const sp = Math.min(1, Math.hypot(f.vx || 0, f.vy || 0) / 12);
        const nx = J.sh.x * 0.4 + J.head.x * 0.6;
        const ny = J.sh.y * 0.4 + J.head.y * 0.6 + J.hr * 0.6;
        g.strokeStyle = c.scarf; g.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          g.lineWidth = J.s * (8 - i * 2);
          g.beginPath(); g.moveTo(nx, ny);
          const len = J.s * (46 + sp * 26 - i * 10);
          const wave = Math.sin(t * 0.3 + i) * J.s * (6 + sp * 6);
          g.quadraticCurveTo(nx - J.F * len * 0.5, ny + wave - J.s * 8, nx - J.F * len, ny + J.s * (6 + i * 10) * (1 - sp) - wave);
          g.stroke();
        }
      },
      head(g, J, c) {
        const r = J.hr;
        D.ball(g, J.head.x, J.head.y, r, c.mask);
        // An eye slit across the mask.
        g.fillStyle = c.skin;
        g.save(); g.translate(J.head.x + J.F * r * 0.2, J.head.y - r * 0.02); g.rotate(J.ha);
        D.rrect(g, -r * 0.75, -r * 0.24, r * 1.5, r * 0.48, r * 0.24, c.skin);
        g.restore();
        eyes(g, D, J, { y: -0.02, size: 0.8, angry: true });
        g.fillStyle = c.scarf;
        g.beginPath(); g.ellipse(J.head.x, J.head.y + r * 0.78, r * 0.95, r * 0.3, 0, 0, TAU); g.fill();
      },
    },
    specials: {
      nspec: { dur: 22, pose: [[0, 'castWind'], [6, 'cast'], [14, 'cast'], [22, 'stand']], grav: 0.6,
        on: { 7: (f) => { api.proj(f, { kind: 'star', x: 36, y: -60, vx: 15, vy: 0, life: 42, r: 11, d: 4, a: 361, bk: 12, kg: 30, fx: 'shadow' }); api.sfx(f, 'throw'); } } },
      sspec: { dur: 36, once: 'side', grav: 0, intang: [6, 13], pose: [[0, 'windup'], [6, 'dash'], [14, 'swingF'], [36, 'stand']],
        on: { 8: (f) => { api.afterimage(f); f.x += f.facing * 190; api.sfx(f, 'whoosh'); } },
        tick: (f, m) => { f.vx *= 0.5; f.vy = m > 16 ? f.vy : 0; if (m > 16) f.noGrav = false; },
        hits: [{ f: [8, 10], b: [[-40, -50, 34], [-95, -50, 34], [-150, -50, 34]], d: 8, a: 45, bk: 42, kg: 62, fx: 'shadow' }] },
      uspec: { dur: 36, helpless: true, grav: 0, intang: [4, 15], pose: [[0, 'squat'], [10, 'helpless'], [36, 'helpless']],
        tick: (f, m) => { if (m < 10) { f.vx *= 0.6; f.vy *= 0.5; } if (m > 15) f.noGrav = false; },
        on: {
          6: (f) => { api.afterimage(f); f.hidden = true; },
          11: (f) => {
            const i = api.inp(f);
            let dx = i.x;
            let dy = i.y;
            if (Math.hypot(dx, dy) < 0.4) { dx = 0; dy = -1; }
            const m = Math.hypot(dx, dy);
            f.x += (dx / m) * 240;
            f.y += (dy / m) * 240;
            f.vx = (dx / m) * 3;
            f.vy = (dy / m) * 3;
            if (dx) f.facing = Math.sign(dx);
            f.hidden = false;
            f.grounded = null;
            api.sfx(f, 'whoosh');
            api.burst(f, 'smoke', 0, -40, 10);
          },
        },
        vis: (f, m) => { if (m === 6) api.burst(f, 'smoke', 0, -40, 10); } },
      dspec: { dur: 34, counter: [4, 22], pose: [[0, 'counter'], [22, 'counter'], [34, 'stand']], grav: 0.4,
        onCounter: (f, att, hit) => {
          // Blink behind the attacker and strike back.
          api.afterimage(f);
          if (att) { f.x = att.x - att.facing * 60; f.y = Math.min(f.y, att.y); f.facing = att.facing; }
          f.ctrDmg = Math.max(8, Math.round(hit.d * 1.2));
          api.start(f, 'ctr');
        } },
      ctr: { dur: 28, intang: [0, 8], pose: [[0, 'windup'], [4, 'swingF'], [12, 'swingF'], [28, 'stand']], grav: 0.3,
        hits: [{ f: [4, 7], b: [[40, -50, 34]], d: (f) => f.ctrDmg || 8, a: 40, bk: 60, kg: 80, fx: 'shadow' }] },
    },
  });

  // ===== Volt: small, quick robot =====
  add({
    id: 'volt', name: 'Volt', blurb: 'A pocket-sized robot full of lightning. Tiny, quick and hard to hit.',
    specialNames: ['Spark Ball', 'Volt Tackle', 'Zap Zip', 'Thunder'],
    bars: { speed: 4, power: 3, weight: 2, recovery: 5, range: 2 },
    s: 0.78, w: 42, h: 80,
    stats: { weight: 80, run: 9.4, air: 5.4, airAcc: 0.5, grav: 0.66, fall: 11, ffall: 16, jump: 15.5, djump: 14.5, jumps: 2, traction: 0.8 },
    norm: { s: 0.78, pow: 1.02, spd: 0.88, fx: 'elec' },
    fx: 'elec',
    pal: { skin: '#ffd23f', body: '#ffd23f', arms: '#3a6fd8', legs: '#3a6fd8', hands: '#ffd23f', feet: '#2a4fa0', screen: '#1d2433', accent: '#6ff3ff' },
    props: { torso: 26, uArm: 15, lArm: 15, thigh: 18, shin: 18, headR: 22, bodyW: 30, limbW: 10, neck: 10 },
    look: {
      head(g, J, c, t) {
        const r = J.hr;
        // Antenna with a glowing tip.
        const ax = J.head.x - J.F * r * 0.2;
        const ay = J.head.y - r * 0.9;
        g.strokeStyle = D.INK; g.lineWidth = J.s * 3;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - J.F * r * 0.2, ay - r * 0.6); g.stroke();
        D.ball(g, ax - J.F * r * 0.2, ay - r * 0.66, r * 0.2, Math.sin(t * 0.25) > 0 ? c.accent : '#fff');
        g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.ha);
        D.rrect(g, -r, -r * 0.9, r * 2, r * 1.8, r * 0.55, c.body);
        D.rrect(g, -r * 0.72 + J.F * r * 0.15, -r * 0.58, r * 1.44, r * 1.1, r * 0.35, c.screen, false);
        g.restore();
        // Face on the screen: two bright eyes that blink.
        const blink = (Math.floor(t) % 180) < 5;
        g.fillStyle = c.accent;
        for (const k of [-0.32, 0.32]) {
          const x = J.head.x + J.F * r * 0.15 + k * r;
          if (blink) g.fillRect(x - r * 0.14, J.head.y - r * 0.05, r * 0.28, r * 0.08);
          else { g.beginPath(); g.ellipse(x, J.head.y - r * 0.04, r * 0.11, r * 0.19, 0, 0, TAU); g.fill(); }
        }
        g.fillRect(J.head.x + J.F * r * 0.15 - r * 0.18, J.head.y + r * 0.26, r * 0.36, r * 0.06);
      },
    },
    specials: {
      nspec: { dur: 30, pose: [[0, 'castWind'], [9, 'cast'], [20, 'cast'], [30, 'stand']], grav: 0.6,
        on: { 10: (f) => { api.proj(f, { kind: 'spark', x: 30, y: -40, vx: 6, vy: 0, life: 85, r: 14, d: 7, a: 361, bk: 25, kg: 52, fx: 'elec', wave: 3 }); api.sfx(f, 'zap'); } } },
      sspec: { dur: 54, once: 'side', charge: { at: 6, max: 50, btn: 'special' }, pose: [[0, 'ball'], [10, 'dash'], [34, 'dash'], [54, 'fall']], spin: [0, 9, 360],
        tick: (f, m) => {
          const c = f.charge / 50;
          if (m === 10) { f.vx = f.facing * (10 + c * 8); f.vy = f.grounded ? -4 : -3; f.grounded = null; }
          if (m > 10 && m < 34) f.vx *= 0.985;
          if (m < 10) { f.vx *= 0.8; f.vy = Math.min(f.vy, 2); }
        },
        hits: [{ f: [10, 32], b: [[10, -36, 30]], d: (f) => Math.round(7 + 12 * f.charge / 50), a: 40, bk: 40, kg: 72, fx: 'elec' }],
        vis: (f, m) => { if (m < 10 && f.charge > 0) api.burst(f, 'elec', 0, -36, 1, 40); if (m >= 10 && m < 32) api.burst(f, 'elec', -10, -36, 1); } },
      uspec: { dur: 40, helpless: true, grav: 0, intang: [6, 10], pose: [[0, 'squat'], [6, 'ball'], [24, 'ball'], [40, 'helpless']],
        tick: (f, m) => {
          const zip = (len) => {
            const i = api.inp(f);
            let dx = i.x;
            let dy = i.y;
            if (Math.hypot(dx, dy) < 0.4) { dx = 0; dy = -1; }
            const n = Math.hypot(dx, dy);
            f.vx = (dx / n) * len;
            f.vy = (dy / n) * len;
            if (dx) f.facing = Math.sign(dx);
            f.grounded = null;
            api.sfx(f, 'zap');
          };
          if (m === 6) zip(30);
          if (m === 18) zip(26);
          if ((m > 11 && m < 18) || m > 23) { f.vx *= 0.55; f.vy *= 0.55; }
          if (m > 26) f.noGrav = false;
        },
        hits: [{ f: [6, 10], b: [[0, -36, 28]], d: 3, a: 70, bk: 40, kg: 20, fx: 'elec' }, { f: [18, 22], b: [[0, -36, 28]], d: 4, a: 70, bk: 45, kg: 40, fx: 'elec' }],
        vis: (f, m) => { if ((m >= 6 && m < 11) || (m >= 18 && m < 23)) api.burst(f, 'elec', 0, -36, 3); } },
      dspec: { dur: 56, grav: 0.4, pose: [[0, 'shield'], [10, 'usHit'], [30, 'usHit'], [56, 'stand']],
        hits: [{ f: [14, 22], b: [[0, -60, 50], [0, -150, 32], [0, -230, 28]], d: 13, a: 84, bk: 50, kg: 85, fx: 'elec', rev: true }],
        vis: (f, m) => { if (m === 10) api.bolt(f); if (m >= 12 && m <= 22) api.burst(f, 'elec', 0, -50, 3, 50); } },
    },
  });

  // ===== Frost: floaty ice mage =====
  add({
    id: 'frost', name: 'Frost', blurb: 'A floaty ice mage who chills from range. Hits leave you slow.',
    specialNames: ['Ice Shard', 'Frost Wave', 'Blizzard Lift', 'Glacier'],
    bars: { speed: 2, power: 3, weight: 2, recovery: 4, range: 5 },
    s: 1, w: 44, h: 104,
    stats: { weight: 88, run: 7.4, air: 5.4, airAcc: 0.4, grav: 0.5, fall: 8.5, ffall: 13, jump: 14.5, djump: 14, jumps: 2, traction: 0.6 },
    norm: { s: 1, pow: 1.08, spd: 1, fx: 'ice' },
    fx: 'ice',
    pal: { skin: '#ffdcc6', body: '#3d7fd6', arms: '#3d7fd6', legs: '#2b5aa0', hands: '#e8f6ff', feet: '#25407a', hat: '#5fb4ff', hair: '#e8f6ff', accent: '#bff3ff' },
    look: {
      torso(g, J, c) {
        // A long robe flaring out to the knees.
        const s = J.s;
        const kx = (J.kF.x + J.kB.x) / 2;
        const ky = Math.max(J.kF.y, J.kB.y) + 4 * s;
        g.fillStyle = c.body; g.strokeStyle = D.INK; g.lineWidth = 3.5 * s; g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(J.sh.x - 11 * s, J.sh.y);
        g.lineTo(J.sh.x + 11 * s, J.sh.y);
        g.lineTo(kx + 22 * s, ky);
        g.quadraticCurveTo(kx, ky + 6 * s, kx - 22 * s, ky);
        g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = c.accent; g.lineWidth = 3 * s;
        g.beginPath(); g.moveTo(J.sh.x, J.sh.y + 4 * s); g.lineTo(kx, ky + 2 * s); g.stroke();
      },
      head(g, J, c, t) {
        const r = J.hr;
        // Long pale hair behind, then the face, then a tall pointed hat with a snowflake.
        g.fillStyle = c.hair;
        g.beginPath(); g.ellipse(J.head.x - J.F * r * 0.45, J.head.y + r * 0.4, r * 0.8, r * 1.2, 0, 0, TAU); g.fill();
        D.ball(g, J.head.x, J.head.y, r, c.skin);
        eyes(g, D, J, { pupil: '#2b5aa0' });
        g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.ha);
        const tip = Math.sin(t * 0.06) * r * 0.25;
        g.fillStyle = c.hat; g.strokeStyle = D.INK; g.lineWidth = J.s * 3.5; g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(-r * 1.5, -r * 0.45);
        g.quadraticCurveTo(0, -r * 0.8, r * 1.5, -r * 0.45);
        g.lineTo(r * 0.5, -r * 0.7);
        g.quadraticCurveTo(-J.F * r * 0.4, -r * 1.8, -J.F * r * 1.4 + tip, -r * 2.5);
        g.quadraticCurveTo(-r * 0.4, -r * 1.2, -r * 0.6, -r * 0.7);
        g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = J.s * 2;
        const sx = -J.F * r * 0.1;
        const sy = -r * 1.05;
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3;
          g.beginPath(); g.moveTo(sx - Math.cos(a) * r * 0.25, sy - Math.sin(a) * r * 0.25); g.lineTo(sx + Math.cos(a) * r * 0.25, sy + Math.sin(a) * r * 0.25); g.stroke();
        }
        g.restore();
      },
    },
    specials: {
      nspec: { dur: 30, pose: [[0, 'castWind'], [9, 'cast'], [20, 'cast'], [30, 'stand']], grav: 0.5,
        on: { 10: (f) => { api.proj(f, { kind: 'shard', x: 40, y: -62, vx: 11.5, vy: 0, life: 52, r: 12, d: 7, a: 30, bk: 32, kg: 50, fx: 'ice', chill: 90 }); api.sfx(f, 'ice'); } } },
      sspec: { dur: 40, once: 'side', pose: [[0, 'castWind'], [10, 'swingLow'], [26, 'swingLow'], [40, 'stand']],
        on: { 12: (f) => {
          if (f.grounded) api.proj(f, { kind: 'icewave', x: 40, y: 0, vx: 8.5, vy: 0, life: 48, r: 22, d: 9, a: 70, bk: 46, kg: 55, fx: 'ice', hug: true, pierce: true, chill: 60 });
          else api.proj(f, { kind: 'shard', x: 30, y: -30, vx: 8, vy: 8, life: 40, r: 14, d: 8, a: -45, bk: 30, kg: 50, fx: 'ice', chill: 60 });
          api.sfx(f, 'ice');
        } } },
      uspec: { dur: 52, helpless: true, grav: 0, pose: [[0, 'squat'], [5, 'rise'], [36, 'rise'], [52, 'helpless']],
        tick: (f, m) => { const i = api.inp(f); if (m >= 5 && m <= 35) { f.vy = -9.5; f.vx += (i.x * 4.5 - f.vx) * 0.2; f.grounded = null; } if (m > 35) f.noGrav = false; },
        hits: [
          { f: [5, 9], b: [[0, -50, 36]], d: 2, a: 90, bk: 30, kg: 10, fx: 'ice' },
          { f: [13, 17], b: [[0, -50, 36]], d: 2, a: 90, bk: 30, kg: 10, fx: 'ice' },
          { f: [21, 25], b: [[0, -50, 36]], d: 2, a: 90, bk: 30, kg: 10, fx: 'ice' },
          { f: [32, 35], b: [[0, -70, 40]], d: 5, a: 75, bk: 58, kg: 60, fx: 'ice', chill: 60 },
        ],
        vis: (f, m) => { if (m >= 5 && m <= 35) api.burst(f, 'snow', 0, -30, 3, 50); } },
      dspec: { dur: 44, grav: 0.3, pose: [[0, 'castWind'], [10, 'swingLow'], [30, 'swingLow'], [44, 'stand']],
        hits: [{ f: [12, 20], b: [[55, -30, 34], [-55, -30, 34], [0, -100, 30]], d: 11, a: 75, bk: 50, kg: 80, fx: 'ice', rev: true, chill: 120 }],
        vis: (f, m) => { if (m === 12) api.crystals(f); } },
    },
  });

  // ===== Sir Clank: sword knight =====
  add({
    id: 'clank', name: 'Sir Clank', blurb: 'A knight with a long sword. Keeps foes at blade length.',
    specialNames: ['Charge Slash', 'Lunge', 'Spiral Blade', 'Parry'],
    bars: { speed: 3, power: 4, weight: 4, recovery: 3, range: 5 },
    s: 1.08, w: 48, h: 108, sword: 60,
    stats: { weight: 112, run: 7.8, air: 5, airAcc: 0.36, grav: 0.64, fall: 11, ffall: 15.5, jump: 15, djump: 14.5, jumps: 2, traction: 0.8 },
    norm: { s: 1.08, pow: 1.16, spd: 0.98, rch: 34, fx: 'slash', sword: true },
    fx: 'slash',
    pal: { skin: '#b9c2cf', body: '#9aa6b8', arms: '#b9c2cf', legs: '#7f8a9c', hands: '#6b7586', feet: '#5a6475', plume: '#3d7fff', cape: '#2851b8', blade: '#eef3fa', hilt: '#f5c84c' },
    look: {
      back(g, J, c, t, f) {
        // A cape hanging from the shoulders, lifting with speed.
        const sp = Math.min(1, Math.abs(f.vx || 0) / 9);
        const s = J.s;
        g.fillStyle = c.cape; g.strokeStyle = D.INK; g.lineWidth = 3.5 * s; g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(J.sh.x + J.F * 4 * s, J.sh.y);
        g.quadraticCurveTo(J.sh.x - J.F * (16 + sp * 26) * s, J.sh.y + 30 * s, J.hip.x - J.F * (18 + sp * 40) * s, J.hip.y + (30 - sp * 18) * s + Math.sin(t * 0.2) * 3 * s);
        g.lineTo(J.hip.x - J.F * (2 + sp * 22) * s, J.hip.y + (26 - sp * 14) * s);
        g.closePath(); g.fill(); g.stroke();
      },
      head(g, J, c, t) {
        const r = J.hr;
        g.save(); g.translate(J.head.x, J.head.y); g.rotate(J.ha);
        // Plume.
        g.fillStyle = c.plume;
        g.beginPath(); g.moveTo(-J.F * r * 0.1, -r * 0.9);
        g.quadraticCurveTo(-J.F * r * 1.2, -r * 1.7, -J.F * r * 2, -r * 0.6 + Math.sin(t * 0.15) * 2);
        g.quadraticCurveTo(-J.F * r * 1, -r * 1, -J.F * r * 0.1, -r * 0.5); g.fill();
        D.rrect(g, -r * 1.02, -r * 1.05, r * 2.04, r * 2.05, r * 0.85, c.skin);
        g.fillStyle = '#1d2230';
        D.rrect(g, J.F > 0 ? -r * 0.1 : -r * 0.95, -r * 0.18, r * 1.05, r * 0.3, r * 0.15, '#1d2230', false);
        g.fillStyle = '#7fd0ff';
        g.fillRect(J.F > 0 ? r * 0.35 : -r * 0.6, -r * 0.1, r * 0.25, r * 0.13);
        g.restore();
      },
      front(g, J, c) {
        // The sword runs on from the front hand along the forearm.
        const s = J.s;
        const dx = J.hF.x - J.eF.x;
        const dy = J.hF.y - J.eF.y;
        const n = Math.hypot(dx, dy) || 1;
        const ux = dx / n;
        const uy = dy / n;
        const L = 60 * s;
        const bx = J.hF.x;
        const by = J.hF.y;
        g.lineCap = 'round';
        g.strokeStyle = D.INK; g.lineWidth = 10 * s;
        g.beginPath(); g.moveTo(bx - ux * 6 * s, by - uy * 6 * s); g.lineTo(bx + ux * L, by + uy * L); g.stroke();
        g.strokeStyle = c.blade; g.lineWidth = 6 * s;
        g.beginPath(); g.moveTo(bx + ux * 4 * s, by + uy * 4 * s); g.lineTo(bx + ux * L, by + uy * L); g.stroke();
        g.strokeStyle = c.hilt; g.lineWidth = 5 * s;
        g.beginPath(); g.moveTo(bx + uy * 9 * s + ux * 4 * s, by - ux * 9 * s + uy * 4 * s); g.lineTo(bx - uy * 9 * s + ux * 4 * s, by + ux * 9 * s + uy * 4 * s); g.stroke();
        J.tip = { x: bx + ux * L, y: by + uy * L };
      },
    },
    specials: {
      nspec: { dur: 40, charge: { at: 8, max: 60, btn: 'special' }, pose: [[0, 'swingWind'], [8, 'swingWind'], [14, 'swingF'], [22, 'swingLow'], [40, 'stand']], grav: 0.6,
        hits: [{ f: [13, 16], b: [[60, -64, 32], [100, -52, 28]], d: (f) => Math.round(8 + 16 * f.charge / 60), bk: (f) => 40 + 24 * f.charge / 60, a: 40, kg: 82, fx: 'slash' }],
        vis: (f, m) => { if (m === 8 && f.charge > 0 && f.charge % 4 === 0) api.burst(f, 'glint', 30, -90, 1); } },
      sspec: { dur: 46, once: 'side', pose: [[0, 'swingWind'], [9, 'swingF'], [20, 'swingF'], [46, 'stand']], grav: 0.5,
        tick: (f, m) => { if (m === 10) f.vx = f.facing * 13; if (m > 10) f.vx *= 0.9; },
        hits: [{ f: [10, 18], b: [[86, -60, 24], [50, -60, 22]], d: 11, a: 35, bk: 46, kg: 76, fx: 'slash' }] },
      uspec: { dur: 48, helpless: true, grav: 0.9, pose: [[0, 'squat'], [4, 'swingUp'], [30, 'swingUp'], [48, 'helpless']], spin: [4, 28, 1080],
        on: { 4: (f) => { f.vy = -16; f.vx = api.inp(f).x * 3; f.grounded = null; api.sfx(f, 'whoosh'); } },
        hits: [
          { f: [4, 8], b: [[0, -60, 58]], d: 4, a: 85, bk: 50, kg: 10, fx: 'slash' },
          { f: [10, 14], b: [[0, -60, 58]], d: 3, a: 88, bk: 40, kg: 10, fx: 'slash' },
          { f: [16, 20], b: [[0, -60, 58]], d: 3, a: 88, bk: 40, kg: 10, fx: 'slash' },
          { f: [22, 26], b: [[0, -60, 62]], d: 5, a: 70, bk: 60, kg: 65, fx: 'slash' },
        ] },
      dspec: { dur: 40, counter: [5, 24], pose: [[0, 'counter'], [24, 'counter'], [40, 'stand']], grav: 0.4,
        onCounter: (f, att, hit) => {
          if (att) f.facing = Math.sign(att.x - f.x) || f.facing;
          f.ctrDmg = Math.max(10, Math.round(hit.d * 1.3));
          api.start(f, 'ctr');
        } },
      ctr: { dur: 30, intang: [0, 10], pose: [[0, 'swingWind'], [4, 'swingF'], [12, 'swingLow'], [30, 'stand']], grav: 0.3,
        hits: [{ f: [4, 8], b: [[60, -60, 36], [100, -50, 28]], d: (f) => f.ctrDmg || 10, a: 35, bk: 62, kg: 88, fx: 'slash' }] },
    },
  });

  // ===== Puff: floaty puffball =====
  add({
    id: 'puff', name: 'Puff', blurb: 'A light, bouncy puffball with five jumps and a very big nap.',
    specialNames: ['Rollout', 'Pound', 'Bounce', 'Nap'],
    bars: { speed: 2, power: 3, weight: 1, recovery: 5, range: 2 },
    s: 0.8, w: 54, h: 72,
    stats: { weight: 70, run: 6.8, air: 6.6, airAcc: 0.6, grav: 0.42, fall: 7, ffall: 11, jump: 12.5, djump: 11, jumps: 5, traction: 0.7 },
    norm: { s: 0.8, pow: 1.12, spd: 0.92, fx: 'puff' },
    fx: 'puff',
    pal: { skin: '#ffb3d1', body: '#ffb3d1', arms: '#ffb3d1', legs: '#ff8fbd', hands: '#ffb3d1', feet: '#e0457f', accent: '#ff5fa8' },
    props: { torso: 4, uArm: 10, lArm: 8, thigh: 12, shin: 8, headR: 34, bodyW: 6, limbW: 13, neck: 22 },
    look: {
      torso() {},
      head(g, J, c, t, f) {
        const r = J.hr;
        D.ball(g, J.head.x, J.head.y, r, c.body);
        // A curl on top, big eyes and rosy cheeks. Asleep, the eyes close.
        g.strokeStyle = D.INK; g.lineWidth = J.s * 3.5; g.lineCap = 'round';
        g.fillStyle = c.body;
        g.beginPath(); g.arc(J.head.x - J.F * r * 0.15, J.head.y - r * 1.02, r * 0.2, Math.PI * 0.2, Math.PI * 1.7); g.stroke();
        const asleep = f.move && f.move.nap && f.mf > 6;
        if (asleep) {
          g.lineWidth = J.s * 3;
          for (const k of [-0.05, 0.5]) { g.beginPath(); g.arc(J.head.x + J.F * r * k, J.head.y - r * 0.05, r * 0.15, 0.2, Math.PI - 0.2); g.stroke(); }
        } else eyes(g, D, J, { size: 1.7, gap: 0.55, y: -0.1, pupil: '#1d3a8a' });
        g.fillStyle = 'rgba(255,80,130,.45)';
        for (const k of [-0.25, 0.75]) { g.beginPath(); g.ellipse(J.head.x + J.F * r * k, J.head.y + r * 0.3, r * 0.17, r * 0.1, 0, 0, TAU); g.fill(); }
        g.strokeStyle = D.INK; g.lineWidth = J.s * 2.5;
        g.beginPath(); g.arc(J.head.x + J.F * r * 0.3, J.head.y + r * 0.3, r * 0.1, 0.3, Math.PI - 0.3); g.stroke();
      },
    },
    specials: {
      nspec: { dur: 74, charge: { at: 6, max: 60, btn: 'special' }, keepOnLand: true, pose: [[0, 'ball'], [74, 'ball']], spin: [0, 74, 2400], grav: 1,
        tick: (f, m) => {
          const c = f.charge / 60;
          if (m < 6) f.vx *= 0.8;
          if (m >= 8 && m < 66) {
            const want = f.facing * (6 + c * 7);
            f.vx += (want - f.vx) * 0.2;
            const i = api.inp(f);
            if (i.x * f.facing < -0.6 && m % 2 === 0) f.facing = -f.facing;
          }
          if (m >= 66) f.vx *= 0.9;
          if (f.hitSomeone) { f.vx = -f.facing * 5; f.vy = -6; f.grounded = null; f.hitSomeone = false; f.mf = 66; }
        },
        hits: [{ f: [8, 65], b: [[0, -32, 30]], d: (f) => Math.round(7 + 9 * f.charge / 60), a: 45, bk: 40, kg: 70, fx: 'puff', bounce: true }],
        vis: (f, m) => { if (m >= 8 && m < 66 && f.grounded && m % 3 === 0) api.burst(f, 'dust', 0, 0, 1); } },
      sspec: { dur: 40, once: 'side', pose: [[0, 'windup'], [10, 'punch'], [20, 'punch'], [40, 'fall']], grav: 0.6,
        tick: (f, m) => { if (m === 10) { f.vx = f.facing * 7.5; if (!f.grounded) f.vy = -2.5; } if (m > 14) f.vx *= 0.92; },
        hits: [{ f: [10, 14], b: [[40, -36, 24]], d: 10, a: 50, bk: 46, kg: 66, fx: 'puff' }] },
      uspec: { dur: 30, once: 'up', pose: [[0, 'squat'], [4, 'usHit'], [16, 'usHit'], [30, 'fall']],
        on: { 4: (f) => { f.vy = -12.5; f.grounded = null; api.sfx(f, 'jump'); } },
        hits: [{ f: [4, 9], b: [[0, -40, 38]], d: 6, a: 90, bk: 42, kg: 50, fx: 'puff' }] },
      dspec: { dur: 170, nap: true, keepOnLand: true, pose: [[0, 'stand'], [2, 'lie'], [170, 'lie']], grav: 1,
        hits: [{ f: [2, 4], b: [[0, -32, 34]], d: 20, a: 70, bk: 40, kg: 115, fx: 'puff' }],
        vis: (f, m) => { if (m > 12 && m % 30 === 0) api.zzz(f); } },
    },
  });

  // ===== Fang: wolf rushdown =====
  add({
    id: 'fang', name: 'Fang', blurb: 'A wolf who never stops pushing. Claws, pounces and a mean howl.',
    specialNames: ['Howl', 'Claw Rush', 'Moon Leap', 'Pounce'],
    bars: { speed: 4, power: 4, weight: 3, recovery: 3, range: 2 },
    s: 1.02, w: 46, h: 102,
    stats: { weight: 98, run: 9.2, air: 5.8, airAcc: 0.45, grav: 0.68, fall: 11.5, ffall: 16.5, jump: 16, djump: 15, jumps: 2, traction: 0.75 },
    norm: { s: 1.02, pow: 0.95, spd: 0.94, fx: 'claw' },
    fx: 'claw',
    pal: { skin: '#8a95ad', body: '#3a3f55', arms: '#8a95ad', legs: '#5c6680', hands: '#e8ecf5', feet: '#4a5268', fur: '#d9deea', bandana: '#d8343f' },
    look: {
      back(g, J, c, t, f) {
        // A bushy tail from the hip, wagging when idle.
        const s = J.s;
        const wag = Math.sin(t * 0.18) * 8 * s * (f.state === 'idle' ? 1 : 0.3);
        g.fillStyle = c.skin; g.strokeStyle = D.INK; g.lineWidth = 3.5 * s;
        g.beginPath();
        g.moveTo(J.hip.x - J.F * 6 * s, J.hip.y - 4 * s);
        g.quadraticCurveTo(J.hip.x - J.F * 40 * s, J.hip.y - 2 * s + wag, J.hip.x - J.F * 46 * s, J.hip.y - 26 * s + wag);
        g.quadraticCurveTo(J.hip.x - J.F * 26 * s, J.hip.y - 10 * s, J.hip.x - J.F * 4 * s, J.hip.y + 6 * s);
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = c.fur;
        g.beginPath(); g.arc(J.hip.x - J.F * 44 * s, J.hip.y - 22 * s + wag, 5 * s, 0, TAU); g.fill();
      },
      head(g, J, c) {
        const r = J.hr;
        const F = J.F;
        // Ears.
        for (const k of [-0.5, 0.25]) {
          const ex = J.head.x + F * r * k;
          g.fillStyle = c.skin; g.strokeStyle = D.INK; g.lineWidth = J.s * 3.5; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(ex - r * 0.35, J.head.y - r * 0.6); g.lineTo(ex - F * r * 0.1, J.head.y - r * 1.55); g.lineTo(ex + r * 0.35, J.head.y - r * 0.7); g.closePath(); g.fill(); g.stroke();
        }
        D.ball(g, J.head.x, J.head.y, r, c.skin);
        // Muzzle and nose.
        g.fillStyle = c.fur; g.strokeStyle = D.INK; g.lineWidth = J.s * 3;
        g.beginPath(); g.ellipse(J.head.x + F * r * 0.75, J.head.y + r * 0.3, r * 0.6, r * 0.4, 0, 0, TAU); g.fill(); g.stroke();
        D.ball(g, J.head.x + F * r * 1.25, J.head.y + r * 0.15, r * 0.16, '#1d1b26', false);
        eyes(g, D, J, { color: '#ffe066', pupil: '#1d1b26', angry: true, y: -0.2 });
        // Bandana knot.
        g.fillStyle = c.bandana;
        g.beginPath(); g.ellipse(J.head.x, J.head.y + r * 0.85, r * 0.9, r * 0.28, 0, 0, TAU); g.fill();
      },
    },
    specials: {
      nspec: { dur: 34, pose: [[0, 'castWind'], [10, 'cast'], [22, 'cast'], [34, 'stand']], grav: 0.6,
        on: { 10: (f) => { api.proj(f, { kind: 'howl', x: 40, y: -66, vx: 8.5, vy: 0, life: 28, r: 16, grow: 0.6, d: 7, a: 50, bk: 40, kg: 52, fx: 'claw', pierce: true }); api.sfx(f, 'howl'); } } },
      sspec: { dur: 42, once: 'side', grav: 0.2, pose: [[0, 'windup'], [6, 'dash'], [12, 'swingF'], [18, 'dash'], [24, 'swingF'], [42, 'fall']],
        tick: (f, m) => { if (m >= 6 && m <= 22) { f.vx = f.facing * 10; if (!f.grounded) f.vy = Math.min(f.vy, 1); } else if (m > 22) f.vx *= 0.88; },
        hits: [
          { f: [8, 11], b: [[34, -52, 30]], d: 4, a: 60, bk: 30, kg: 10, fx: 'claw' },
          { f: [13, 16], b: [[34, -52, 30]], d: 4, a: 60, bk: 30, kg: 10, fx: 'claw' },
          { f: [19, 22], b: [[36, -52, 32]], d: 6, a: 40, bk: 52, kg: 72, fx: 'claw' },
        ] },
      uspec: { dur: 42, helpless: true, pose: [[0, 'squat'], [5, 'uair'], [22, 'uair'], [42, 'helpless']], spin: [5, 22, -360],
        on: { 5: (f) => { f.vy = -17.5; f.vx = api.inp(f).x * 4; f.grounded = null; api.sfx(f, 'whoosh'); } },
        hits: [{ f: [5, 14], b: [[10, -90, 36]], d: 9, a: 80, bk: 46, kg: 72, fx: 'claw' }] },
      dspec: { dur: 46, keepOnLand: false, landLag: 14, pose: [[0, 'squat'], [6, 'dash'], [40, 'dash'], [46, 'stand']], grav: 1,
        on: { 6: (f) => { if (f.grounded) { f.vx = f.facing * 9; f.vy = -9; f.grounded = null; } else { f.vx = f.facing * 8; f.vy = 15; f.dive = true; } } },
        start: (f) => { f.dive = false; },
        tick: (f, m) => { if (f.dive && m > 6) { f.vy = 15; f.vx = f.facing * 8; } },
        hits: [{ f: [8, 40], b: [[20, -30, 32]], d: 11, a: (f) => (f.dive ? -55 : 45), bk: 40, kg: 72, fx: 'claw' }] },
    },
  });

  // Each move's reach: one box around every hitbox, for the computer to judge what will land.
  for (const fd of fighters) {
    for (const m of Object.values(fd.moves)) {
      const bs = [...(m.hits || []).flatMap((h) => h.b), ...(m.grab ? m.grab.b : [])];
      if (!bs.length) continue;
      m.reach = {
        x0: Math.min(...bs.map(([x, , r]) => x - r)), x1: Math.max(...bs.map(([x, , r]) => x + r)),
        y0: Math.min(...bs.map(([, y, r]) => y - r)), y1: Math.max(...bs.map(([, y, r]) => y + r)),
      };
      const first = Math.min(...(m.hits || []).map((h) => h.f[0]), m.grab ? m.grab.f[0] : 999);
      m.startup = first === 999 ? 0 : first;
    }
  }
  return fighters;
}

// ---------- Projectiles ----------
// How each kind of projectile looks. p: { x, y, vx, vy, r, age, facing }.
function drawProjectile(g, D, p, t) {
  const r = p.r;
  switch (p.kind) {
    case 'fireball': {
      for (let i = 3; i >= 0; i--) {
        g.fillStyle = ['#ff3d1f', '#ff8a1f', '#ffd23f', '#fff6c4'][3 - i];
        g.beginPath(); g.arc(p.x - p.vx * i * 0.6, p.y - p.vy * i * 0.6, r * (1 - i * 0.18), 0, TAU); g.fill();
      }
      break;
    }
    case 'rock': {
      g.save(); g.translate(p.x, p.y); g.rotate(p.age * 0.15 * Math.sign(p.vx || 1));
      g.fillStyle = '#8c8577'; g.strokeStyle = D.INK; g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = r * (0.85 + ((i * 37) % 5) * 0.06); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(r * 0.2, r * 0.25, r * 0.3, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'star': {
      g.save(); g.translate(p.x, p.y); g.rotate(p.age * 0.6);
      g.fillStyle = '#c9cfe0'; g.strokeStyle = D.INK; g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const rr = i % 2 ? r * 0.35 : r * 1.1; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill(); g.stroke();
      g.restore();
      break;
    }
    case 'spark': {
      g.fillStyle = 'rgba(111,243,255,.3)';
      g.beginPath(); g.arc(p.x, p.y, r * 1.6, 0, TAU); g.fill();
      D.ball(g, p.x, p.y, r, '#fff27a');
      g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = t * 0.3 + i * 1.7;
        g.beginPath(); g.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        g.lineTo(p.x + Math.cos(a + 0.4) * r * 1.6, p.y + Math.sin(a + 0.4) * r * 1.6);
        g.lineTo(p.x + Math.cos(a) * r * 2, p.y + Math.sin(a) * r * 2); g.stroke();
      }
      break;
    }
    case 'shard': {
      const a = Math.atan2(p.vy, p.vx);
      g.save(); g.translate(p.x, p.y); g.rotate(a);
      g.fillStyle = '#bff3ff'; g.strokeStyle = '#2b78c2'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(r * 1.6, 0); g.lineTo(0, -r * 0.6); g.lineTo(-r * 1.2, 0); g.lineTo(0, r * 0.6); g.closePath(); g.fill(); g.stroke();
      g.restore();
      break;
    }
    case 'icewave': {
      g.fillStyle = '#bff3ff'; g.strokeStyle = '#2b78c2'; g.lineWidth = 3; g.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const x = p.x - Math.sign(p.vx || 1) * i * 22;
        const h = (36 - i * 9) * Math.min(1, p.age / 6);
        g.beginPath(); g.moveTo(x - 12, p.y); g.lineTo(x - 2, p.y - h); g.lineTo(x + 12, p.y); g.closePath(); g.fill(); g.stroke();
      }
      break;
    }
    case 'howl': {
      const dir = Math.sign(p.vx || 1);
      const base = dir > 0 ? 0 : Math.PI;
      g.strokeStyle = `rgba(255,224,102,${Math.max(0, 1 - p.age / 30)})`;
      g.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.arc(p.x - dir * i * 12, p.y, r * (1 - i * 0.22), base - 0.9, base + 0.9); g.stroke();
      }
      break;
    }
    case 'quake': {
      g.fillStyle = '#8c8577'; g.strokeStyle = D.INK; g.lineWidth = 3; g.lineJoin = 'round';
      const h = 34 * Math.sin(Math.min(1, p.age / 20) * Math.PI);
      g.beginPath(); g.moveTo(p.x - 18, p.y); g.lineTo(p.x - 6, p.y - h); g.lineTo(p.x + 4, p.y - h * 0.6); g.lineTo(p.x + 16, p.y); g.closePath(); g.fill(); g.stroke();
      break;
    }
    default:
      D.ball(g, p.x, p.y, r, '#fff');
  }
}

return { build, poses: P, drawProjectile };
})();
