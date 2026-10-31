// 3D table engine shared by the casino tables: room, lighting, table, cards, chips,
// HTML labels pinned to 3D points, camera framing and promise-based tweens.
(() => {
'use strict';

const T = window.THREE;
const { sound, rand } = Casino;

// World units. Cards are drawn about 1.75x real size against the table so they stay readable on phones.
const CARD_W = 1.1;
const CARD_H = 1.54;
const CHIP_R = 0.34;
const CHIP_H = 0.085;
const DENOMS = [1000, 500, 100, 25, 5, 1];
const CHIP_COLORS = {
  1: { c: '#eceff1', edge: '#1e88e5', ink: '#1e3a5f' },
  5: { c: '#c62828', edge: '#ffffff', ink: '#ffffff' },
  25: { c: '#2e7d32', edge: '#ffffff', ink: '#ffffff' },
  100: { c: '#1f1f22', edge: '#f5c84c', ink: '#ffffff' },
  500: { c: '#6a1b9a', edge: '#ffffff', ink: '#ffffff' },
  1000: { c: '#f2b01e', edge: '#6b3e00', ink: '#3a2300' },
};
const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎'];
const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const mobile = window.matchMedia('(pointer: coarse)').matches;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.6 * (t - 1) ** 3 + 1.6 * (t - 1) ** 2,
};

// ---------- Tweens and the shared frame loop ----------
// engine.instant makes every tween finish at once (used by automated tests).
const engine = { instant: false };
const tweens = new Set();
const tables = new Set();

function tween(dur, fn, easing = ease.inOut) {
  if (engine.instant || dur <= 0) {
    fn(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => tweens.add({ start: performance.now(), dur, fn, easing, resolve }));
}
const wait = (ms) => tween(ms, () => {}, ease.linear);

function frame(now) {
  requestAnimationFrame(frame);
  for (const tw of [...tweens]) {
    const p = Math.min(1, (now - tw.start) / tw.dur);
    tw.fn(tw.easing(p));
    if (p >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
  for (const t of tables) if (t.active) t.render(now);
}
requestAnimationFrame(frame);

// ---------- Textures ----------
let maxAniso = 4;
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function canvasTexture(c) {
  const t = new T.CanvasTexture(c);
  t.anisotropy = maxAniso;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function speckle(g, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.6})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

const CW = 300;
const CH = 420;
const faceCache = new Map();
let backTexture = null;

function drawFace(card) {
  const c = makeCanvas(CW, CH);
  const g = c.getContext('2d');
  const ink = card.s === 1 || card.s === 2 ? '#c61f2c' : '#16181d';
  const bg = g.createLinearGradient(0, 0, CW, CH);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.6, '#f7f4ec');
  bg.addColorStop(1, '#e8e2d2');
  g.fillStyle = bg;
  g.fillRect(0, 0, CW, CH);
  g.strokeStyle = 'rgba(0,0,0,.22)';
  g.lineWidth = 4;
  roundRect(g, 2, 2, CW - 4, CH - 4, 26);
  g.stroke();

  const rank = RANK_LABELS[card.r] || String(card.r);
  const suit = SUITS[card.s];
  g.fillStyle = ink;
  g.textAlign = 'center';
  const corner = () => {
    g.textBaseline = 'alphabetic';
    g.font = `700 ${CW * 0.19}px Georgia, 'Times New Roman', serif`;
    g.fillText(rank, CW * 0.125, CH * 0.145);
    g.font = `${CW * 0.16}px Georgia, serif`;
    g.fillText(suit, CW * 0.125, CH * 0.265);
  };
  corner();
  g.save();
  g.translate(CW, CH);
  g.rotate(Math.PI);
  corner();
  g.restore();

  g.textBaseline = 'middle';
  if (card.r === 14) {
    g.font = `${CW * 0.56}px Georgia, serif`;
    g.fillText(suit, CW / 2, CH / 2 + CW * 0.02);
  } else if (card.r > 10) {
    const x = CW * 0.21;
    const y = CH * 0.17;
    const w = CW * 0.58;
    const h = CH * 0.66;
    const fill = g.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, '#fff6d8');
    fill.addColorStop(1, '#f1da97');
    g.fillStyle = fill;
    roundRect(g, x, y, w, h, 10);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(200,150,40,.28)';
    g.lineWidth = 3;
    for (let d = -h; d < w + h; d += 16) {
      g.beginPath();
      g.moveTo(x + d, y);
      g.lineTo(x + d - h, y + h);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = ink;
    g.lineWidth = 4;
    roundRect(g, x, y, w, h, 10);
    g.stroke();
    g.fillStyle = ink;
    g.font = `900 ${CW * 0.42}px Cinzel, Georgia, serif`;
    g.fillText(rank, CW / 2, CH / 2 + CW * 0.02);
    g.font = `${CW * 0.14}px Georgia, serif`;
    g.fillText(suit, x + CW * 0.09, y + CW * 0.1);
    g.save();
    g.translate(x + w - CW * 0.09, y + h - CW * 0.1);
    g.rotate(Math.PI);
    g.fillText(suit, 0, 0);
    g.restore();
  } else {
    g.font = `${CW * 0.2}px Georgia, serif`;
    for (const [px, py, flip] of Casino.cards.PIPS[card.r]) {
      g.save();
      g.translate((px / 100) * CW, (py / 100) * CH);
      if (flip) g.rotate(Math.PI);
      g.fillText(suit, 0, 0);
      g.restore();
    }
  }
  return c;
}

function faceTexture(card) {
  const key = `${card.r}-${card.s}`;
  if (!faceCache.has(key)) faceCache.set(key, canvasTexture(drawFace(card)));
  return faceCache.get(key);
}

// Every card back shares one texture, redrawn in place when the player picks a new design.
let backCanvas = null;
function cardBack() {
  if (!backTexture) {
    backCanvas = makeCanvas(CW, CH);
    Casino.cardBacks.draw(backCanvas.getContext('2d'), CW, CH, Casino.profile.back);
    backTexture = canvasTexture(backCanvas);
  }
  return backTexture;
}
Casino.profile.onChange((p) => {
  if (!backTexture) return;
  Casino.cardBacks.draw(backCanvas.getContext('2d'), CW, CH, p.back);
  backTexture.needsUpdate = true;
});

// Lacquered wood with the grain running along x. Meshes using it need world-sized UVs
// (extruded shapes have them); the texture repeats every 6 units.
let woodTex = null;
function woodTexture() {
  if (!woodTex) {
    const c = makeCanvas(512, 512);
    const g = c.getContext('2d');
    const base = g.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#6e3517');
    base.addColorStop(0.5, '#582811');
    base.addColorStop(1, '#6e3517');
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 240; i++) {
      const y0 = Math.random() * 512;
      const k = 1 + Math.floor(Math.random() * 3);
      const amp = rand(2, 11);
      const ph = rand(0, Math.PI * 2);
      g.strokeStyle = Math.random() < 0.6 ? `rgba(38,12,2,${rand(0.08, 0.35)})` : `rgba(196,112,52,${rand(0.05, 0.2)})`;
      g.lineWidth = rand(0.5, 2.6);
      // Drawn three times so the grain wraps cleanly top to bottom.
      for (const off of [-512, 0, 512]) {
        g.beginPath();
        for (let x = 0; x <= 512; x += 8) {
          const y = y0 + off + amp * Math.sin((x / 512) * Math.PI * 2 * k + ph);
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    woodTex = canvasTexture(c);
    woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping;
    woodTex.repeat.set(1 / 6, 1 / 6);
  }
  return woodTex;
}

// Fine grain for padded leather, tinted by the material colour.
let leatherTex = null;
function leatherTexture() {
  if (!leatherTex) {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${rand(0.03, 0.12)})`;
      g.beginPath();
      g.arc(rand(0, 256), rand(0, 256), rand(0.5, 1.8), 0, Math.PI * 2);
      g.fill();
    }
    leatherTex = canvasTexture(c);
    leatherTex.wrapS = leatherTex.wrapT = T.RepeatWrapping;
    leatherTex.repeat.set(90, 2);
  }
  return leatherTex;
}

const brass = () => new T.MeshStandardMaterial({ color: 0xd9a845, roughness: 0.3, metalness: 0.55, emissive: 0x2a1a00 });

// Tables stand on the carpet: the felt is at y = 0, the apron's lower edge at APRON_BOTTOM.
const FLOOR_Y = -5.6;
const APRON_BOTTOM = -1.0;
const LEG_R = 0.4;
const FOOT_H = 0.18;

// A turned wooden leg from the apron down to a brass foot, as a lathe profile (radius, height).
let legGeo = null;
function legGeometry() {
  if (!legGeo) {
    const len = APRON_BOTTOM - FLOOR_Y - FOOT_H;
    const profile = [
      [0, 0], [0.2, 0], [0.22, 0.05], [0.18, 0.1], [0.17, 0.3], [0.22, 0.62], [0.29, 0.74],
      [0.36, 0.8], [0.36, 0.85], [0.27, 0.9], [0.3, 0.94], [LEG_R, 0.96],
    ].map(([r, y]) => new T.Vector2(r, y * len));
    profile.push(new T.Vector2(LEG_R, len), new T.Vector2(0, len));
    legGeo = new T.LatheGeometry(profile, 18);
    legGeo.translate(0, -len, 0);
    legGeometry.foot = new T.CylinderGeometry(0.21, 0.26, FOOT_H, 18);
  }
  return legGeo;
}

const chipCache = new Map();
function chipMaterials(v) {
  if (chipCache.has(v)) return chipCache.get(v);
  const col = CHIP_COLORS[v];
  const f = makeCanvas(256, 256);
  const g = f.getContext('2d');
  g.fillStyle = col.c;
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.fillStyle = col.edge;
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(128, 128);
    g.rotate((k / 6) * Math.PI * 2);
    g.fillRect(-16, -128, 32, 34);
    g.restore();
  }
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.beginPath(); g.arc(128, 128, 86, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col.edge;
  g.globalAlpha = 0.8;
  g.lineWidth = 5;
  g.setLineDash([12, 9]);
  g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  g.fillStyle = col.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 70px Rubik, Arial, sans-serif';
  g.fillText(v >= 1000 ? `${v / 1000}K` : String(v), 128, 134);

  const s = makeCanvas(512, 32);
  const sg = s.getContext('2d');
  sg.fillStyle = col.c;
  sg.fillRect(0, 0, 512, 32);
  sg.fillStyle = col.edge;
  for (let k = 0; k < 6; k++) sg.fillRect((k + 0.5) * (512 / 6) - 16, 0, 32, 32);
  sg.fillStyle = 'rgba(0,0,0,.28)';
  sg.fillRect(0, 0, 512, 3);
  sg.fillRect(0, 29, 512, 3);

  const face = new T.MeshStandardMaterial({ map: canvasTexture(f), roughness: 0.45 });
  const side = new T.MeshStandardMaterial({ map: canvasTexture(s), roughness: 0.55 });
  const mats = [side, face, face];
  chipCache.set(v, mats);
  return mats;
}

function breakdown(amount, cap = 30) {
  const out = [];
  let left = Math.round(amount);
  for (const d of DENOMS) {
    while (left >= d && out.length < cap) { out.push(d); left -= d; }
  }
  return out;
}

// ---------- Geometry ----------
function roundedRectShape(w, h, r) {
  const s = new T.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function shapePlane(shape, w, h) {
  const geo = new T.ShapeGeometry(shape, 8);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geo;
}

const cardGeo = shapePlane(roundedRectShape(CARD_W, CARD_H, 0.09), CARD_W, CARD_H);
const chipGeo = new T.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 40);

// Shape in world x/z (y up). Shapes live in x/y, so y holds -z and the mesh is turned flat.
function xzShape(points) {
  return new T.Shape(points.map(([x, z]) => new T.Vector2(x, -z)));
}

// Push an outline outward (positive d) or inward along its normals.
function offsetOutline(points, d) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    area += x1 * z2 - x2 * z1;
  }
  const sign = area > 0 ? 1 : -1;
  return points.map((p, i) => {
    const [px, pz] = points[(i - 1 + points.length) % points.length];
    const [nx, nz] = points[(i + 1) % points.length];
    let dx = nx - px;
    let dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return [p[0] + dz * d * sign, p[1] - dx * d * sign];
  });
}

// ---------- Table ----------
class Table {
  constructor(stage, { bottomInset = () => 0 } = {}) {
    this.stage = stage;
    this.bottomInset = bottomInset;
    this.active = false;
    this.labels = new Set();
    this.hooks = new Set();
    this.view = null;
    this.camPos = V(0, 10, 12);
    this.camTarget = V();
    this.camTween = 0;

    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = mobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
    maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    stage.prepend(this.renderer.domElement);

    const vignette = document.createElement('div');
    vignette.className = 'stage-vignette';
    stage.append(vignette);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 't3-labels';
    stage.append(this.labelLayer);

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 200);
    this.raycaster = new T.Raycaster();
    this.buildRoom();
    tables.add(this);
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
  }

  setActive(on) {
    this.active = on;
    if (on) this.resize();
  }

  onFrame(fn) { this.hooks.add(fn); return () => this.hooks.delete(fn); }

  buildRoom() {
    const s = this.scene;
    s.background = new T.Color(0x050907);
    s.fog = new T.Fog(0x050907, 24, 60);

    const carpet = makeCanvas(256, 256);
    const g = carpet.getContext('2d');
    g.fillStyle = '#3b0d14';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 2500, 0.08);
    g.strokeStyle = 'rgba(214,160,62,.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(128, 8); g.lineTo(248, 128); g.lineTo(128, 248); g.lineTo(8, 128); g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(214,160,62,.55)';
    for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) {
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    }
    const carpetTex = canvasTexture(carpet);
    carpetTex.wrapS = carpetTex.wrapT = T.RepeatWrapping;
    carpetTex.repeat.set(40, 40);
    const floor = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshLambertMaterial({ map: carpetTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    s.add(floor);

    // Out-of-focus casino lights in the distance.
    const glow = makeCanvas(64, 64);
    const gg = glow.getContext('2d');
    const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = rg;
    gg.fillRect(0, 0, 64, 64);
    const glowTex = canvasTexture(glow);
    const tints = [0xf5c84c, 0xffb15c, 0xe0414b, 0x3ad7ff, 0xf5c84c, 0xffffff];
    const bokeh = [];
    for (let i = 0; i < 34; i++) {
      const m = new T.SpriteMaterial({ map: glowTex, color: tints[i % tints.length], transparent: true, opacity: rand(0.25, 0.6), blending: T.AdditiveBlending, depthWrite: false, fog: false });
      const sp = new T.Sprite(m);
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const r = rand(24, 40);
      sp.position.set(Math.cos(a) * r, rand(-1, 8), Math.sin(a) * r);
      const size = rand(1.6, 4.5);
      sp.scale.set(size, size, 1);
      sp.userData = { base: m.opacity, speed: rand(0.3, 1.1), phase: rand(0, 6) };
      s.add(sp);
      bokeh.push(sp);
    }
    this.onFrame((t) => {
      for (const b of bokeh) b.material.opacity = b.userData.base * (0.7 + 0.3 * Math.sin(t * 0.001 * b.userData.speed + b.userData.phase));
    });

    s.add(new T.HemisphereLight(0xfff1d6, 0x1c120a, 0.2));
    s.add(new T.AmbientLight(0x2c3a33, 0.18));
    const spot = new T.SpotLight(0xffe2b4, 1.05, 0, 0.6, 0.6, 1);
    spot.position.set(0, 17, 3);
    spot.target.position.set(0, 0, 0.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 6;
    spot.shadow.camera.far = 30;
    s.add(spot, spot.target);
    const fill = new T.DirectionalLight(0xfff6ea, 0.16);
    fill.position.set(0, 7, 15);
    s.add(fill);
  }

  // A felt top printed from a canvas with a padded rail around its edge, over a wooden apron
  // with a brass trim that stands on turned legs reaching the carpet. Legs go where rays from
  // the table's centre at the given angles (degrees; 0 is +x, 90 is toward the player) meet the apron.
  addTable({ outline, feltWidth = 2048, drawFelt, railRadius = 0.42, rail = 0x2a160d, legs = [22, 158, 202, 338] }) {
    const xs = outline.map((p) => p[0]);
    const zs = outline.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const W = maxX - minX;
    const D = maxZ - minZ;
    const cw = feltWidth;
    const ch = Math.round((feltWidth * D) / W);
    const felt = makeCanvas(cw, ch);
    const scale = cw / W;
    const map = (x, z) => [(x - minX) * scale, (z - minZ) * scale];
    const paint = () => {
      const g = felt.getContext('2d');
      g.clearRect(0, 0, cw, ch);
      drawFelt(g, map, scale, cw, ch);
    };
    paint();
    const feltTex = canvasTexture(felt);
    // Repaint once web fonts have arrived so printed text uses them.
    if (document.fonts) document.fonts.ready.then(() => { paint(); feltTex.needsUpdate = true; });

    const shape = xzShape(outline);
    const top = new T.ShapeGeometry(shape, 24);
    top.rotateX(-Math.PI / 2);
    const pos = top.attributes.position;
    const uv = top.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - minX) / W, (maxZ - pos.getZ(i)) / D);
    const group = new T.Group();
    this.scene.add(group);
    const feltMesh = new T.Mesh(top, new T.MeshLambertMaterial({ map: feltTex }));
    feltMesh.receiveShadow = true;
    group.add(feltMesh);

    // The rail's centre sits just inside the felt's edge.
    const railPts = offsetOutline(outline, -railRadius * 0.35).map(([x, z]) => V(x, railRadius * 0.45, z));
    const curve = new T.CatmullRomCurve3(railPts, true, 'centripetal');
    const railMesh = new T.Mesh(
      new T.TubeGeometry(curve, 360, railRadius, 20, true),
      new T.MeshStandardMaterial({ color: rail, map: leatherTexture(), roughness: 0.4 }),
    );
    railMesh.castShadow = true;
    group.add(railMesh);

    // The apron's face is tucked just under the rail's outer edge. It is solid, so it also
    // casts the table's shadow onto the carpet.
    const apronOut = railRadius * 0.45;
    const apronLine = offsetOutline(outline, apronOut);
    const apronGeo = new T.ExtrudeGeometry(xzShape(apronLine), { depth: 0.8, bevelEnabled: false, curveSegments: 24 });
    apronGeo.rotateX(-Math.PI / 2);
    const woodMat = new T.MeshStandardMaterial({ map: woodTexture(), color: 0x9a7a6a, roughness: 0.38 });
    const apron = new T.Mesh(apronGeo, woodMat);
    apron.position.y = APRON_BOTTOM;
    apron.castShadow = true;
    group.add(apron);
    const metal = brass();
    const trimCurve = new T.CatmullRomCurve3(apronLine.map(([x, z]) => V(x, APRON_BOTTOM, z)), true, 'centripetal');
    group.add(new T.Mesh(new T.TubeGeometry(trimCurve, 300, 0.06, 8, true), metal));

    // Each leg's outer side lines up with the apron's face. The legs stand in the table's
    // shadow, so their wood is a little lighter than the apron's to stay visible.
    const legMat = new T.MeshStandardMaterial({ map: woodTexture(), color: 0xc9a08a, emissive: 0x1c0d05, roughness: 0.32 });
    const legLine = offsetOutline(outline, apronOut - LEG_R);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    for (const deg of legs) {
      const a = T.MathUtils.degToRad(deg);
      let best = null;
      let bestD = Infinity;
      for (const p of legLine) {
        const b = Math.atan2(p[1] - cz, p[0] - cx);
        const d = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
        if (d < bestD) { bestD = d; best = p; }
      }
      const leg = new T.Mesh(legGeometry(), legMat);
      leg.position.set(best[0], APRON_BOTTOM, best[1]);
      const foot = new T.Mesh(legGeometry.foot, metal);
      foot.position.set(best[0], FLOOR_Y + 0.09, best[1]);
      leg.castShadow = true;
      foot.castShadow = true;
      group.add(leg, foot);
    }
    return { group, felt: feltMesh, map, scale };
  }

  addShoe(pos, yaw) {
    const group = new T.Group();
    const dark = new T.MeshStandardMaterial({ color: 0x1b1c21, roughness: 0.35, metalness: 0.2 });
    const body = new T.Mesh(new T.BoxGeometry(1.5, 0.8, 2.1), dark);
    body.position.y = 0.4;
    body.castShadow = true;
    group.add(body);
    const face = new T.Mesh(new T.PlaneGeometry(1.2, 0.62), new T.MeshStandardMaterial({ map: cardBack(), roughness: 0.6 }));
    face.position.set(0, 0.47, 1.06);
    face.rotation.x = -0.35;
    group.add(face);
    const lip = new T.Mesh(new T.BoxGeometry(1.5, 0.12, 0.35), dark);
    lip.position.set(0, 0.06, 1.2);
    group.add(lip);
    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);
    group.updateMatrixWorld();
    const mouth = V(0, 0.25, 1.35).applyMatrix4(group.matrixWorld);
    return {
      mouth,
      shake: () => tween(900, (t) => { group.position.x = pos.x + Math.sin(t * 60) * 0.05 * (1 - t); }, ease.linear),
    };
  }

  addDiscard(pos, yaw = 0) {
    const group = new T.Group();
    const glass = new T.Mesh(
      new T.BoxGeometry(CARD_W + 0.3, 0.6, CARD_H + 0.3),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    glass.position.y = 0.3;
    group.add(glass);
    const white = new T.MeshStandardMaterial({ color: 0xf2eee3, roughness: 0.7 });
    const pile = new T.Mesh(new T.BoxGeometry(CARD_W, 1, CARD_H), [white, white, new T.MeshStandardMaterial({ map: cardBack(), roughness: 0.6 }), white, white, white]);
    pile.castShadow = true;
    pile.visible = false;
    group.add(pile);
    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);
    let count = 0;
    const height = () => Math.min(0.5, count * 0.0035);
    const set = () => {
      pile.visible = count > 0;
      pile.scale.y = Math.max(0.001, height());
      pile.position.y = height() / 2 + 0.01;
    };
    return {
      top: () => V(pos.x, height() + 0.03, pos.z),
      add(n) { count += n; set(); },
      reset() { count = 0; set(); },
    };
  }

  // The dealer's chip tray: rolls of chips lying in grooves.
  addRack(pos, denoms) {
    const group = new T.Group();
    const tray = new T.Mesh(new T.BoxGeometry(denoms.length * 0.48 + 0.4, 0.28, 1.05), new T.MeshStandardMaterial({ color: 0x15161a, roughness: 0.3, metalness: 0.3 }));
    tray.position.y = 0.14;
    tray.castShadow = true;
    group.add(tray);
    denoms.forEach((v, i) => {
      const col = CHIP_COLORS[v];
      const c = makeCanvas(32, 256);
      const g = c.getContext('2d');
      for (let y = 0; y < 256; y += 10) {
        g.fillStyle = col.c;
        g.fillRect(0, y, 32, 8);
        g.fillStyle = col.edge;
        g.fillRect(12, y, 8, 8);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(0, y + 8, 32, 2);
      }
      const roll = new T.Mesh(new T.CylinderGeometry(CHIP_R * 0.62, CHIP_R * 0.62, 0.9, 20), new T.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.5 }));
      roll.rotation.x = Math.PI / 2;
      roll.position.set((i - (denoms.length - 1) / 2) * 0.48, 0.34, 0);
      group.add(roll);
    });
    group.position.copy(pos);
    this.scene.add(group);
    return { top: V(pos.x, pos.y + 0.5, pos.z) };
  }

  // A printed betting circle that can glow for the hand being played.
  betRing() {
    if (!Table.ringTex) {
      const c = makeCanvas(256, 256);
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(245,200,76,.85)';
      g.lineWidth = 7;
      g.setLineDash([16, 11]);
      g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(245,200,76,.5)';
      g.font = '700 34px Rubik, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BET', 128, 130);
      Table.ringTex = canvasTexture(c);
    }
    const mat = new T.MeshBasicMaterial({ map: Table.ringTex, transparent: true, depthWrite: false, opacity: 0.8 });
    const mesh = new T.Mesh(new T.PlaneGeometry(1.7, 1.7), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.004;
    this.scene.add(mesh);
    let glow = false;
    const off = this.onFrame((t) => {
      mat.opacity = glow ? 0.75 + 0.25 * Math.sin(t * 0.006) : 0.6;
      mat.color.setHex(glow ? 0xfff2c0 : 0xffffff);
    });
    return {
      mesh,
      setPos: (p, dur = 0) => this.moveObject(mesh, V(p.x, 0.004, p.z), dur),
      setGlow(on) { glow = on; },
      remove: () => { off(); this.scene.remove(mesh); mat.dispose(); },
    };
  }

  // ---------- Cards ----------
  makeCard(card) {
    const group = new T.Group();
    group.rotation.order = 'YXZ';
    const frontMat = new T.MeshStandardMaterial({ map: faceTexture(card), roughness: 0.5 });
    const backMat = new T.MeshStandardMaterial({ map: cardBack(), roughness: 0.5 });
    const front = new T.Mesh(cardGeo, frontMat);
    front.rotation.x = -Math.PI / 2;
    front.position.y = 0.002;
    const back = new T.Mesh(cardGeo, backMat);
    back.rotation.x = Math.PI / 2;
    back.position.y = -0.002;
    front.castShadow = true;
    back.castShadow = true;
    group.add(front, back);
    this.scene.add(group);
    card.obj = { group, frontMat, backMat, faceUp: false, lift: 0 };
    return card.obj;
  }

  // Slide a card out of the shoe or deck to a slot { x, y, z, yaw }, then turn it over.
  async dealCard(card, from, slot, { faceUp = true, dur = 380 } = {}) {
    const o = this.makeCard(card);
    const g = o.group;
    g.position.copy(from);
    g.rotation.set(0, slot.yaw + rand(-1.4, -0.7), Math.PI);
    const start = from.clone();
    const end = V(slot.x, slot.y, slot.z);
    const yaw0 = g.rotation.y;
    const lift = 0.35 + start.distanceTo(end) * 0.04;
    sound.card();
    await tween(dur, (t) => {
      g.position.lerpVectors(start, end, t);
      g.position.y += Math.sin(Math.PI * t) * lift;
      g.rotation.y = yaw0 + (slot.yaw - yaw0) * t;
    }, ease.out);
    if (faceUp) await this.flip(card, true);
  }

  moveCard(card, slot, dur = 320) {
    const g = card.obj.group;
    const start = g.position.clone();
    const end = V(slot.x, slot.y + card.obj.lift, slot.z);
    const yaw0 = g.rotation.y;
    return tween(dur, (t) => {
      g.position.lerpVectors(start, end, t);
      g.rotation.y = yaw0 + (slot.yaw - yaw0) * t;
    }, ease.inOut);
  }

  async flip(card, faceUp = true) {
    const o = card.obj;
    if (!o || o.faceUp === faceUp) return;
    o.faceUp = faceUp;
    sound.flip();
    const g = o.group;
    const z0 = g.rotation.z;
    const z1 = faceUp ? 0 : Math.PI;
    const y0 = g.position.y;
    await tween(280, (t) => {
      g.rotation.z = z0 + (z1 - z0) * t;
      g.position.y = y0 + Math.sin(Math.PI * t) * CARD_W * 0.55;
    }, ease.inOut);
  }

  // The dealer lifts the corner of the hole card to check it.
  peek(card) {
    const g = card.obj.group;
    const y0 = g.position.y;
    return tween(700, (t) => {
      const k = Math.sin(Math.PI * t);
      g.rotation.x = -0.32 * k;
      g.position.y = y0 + 0.12 * k;
    }, ease.inOut);
  }

  highlight(card, on) {
    const o = card.obj;
    if (!o) return;
    o.frontMat.emissive.setHex(on ? 0x3a2a00 : 0x000000);
    const y0 = o.group.position.y - o.lift;
    o.lift = on ? 0.18 : 0;
    const g = o.group;
    const from = g.position.y;
    return tween(260, (t) => { g.position.y = from + (y0 + o.lift - from) * t; }, ease.out);
  }

  dim(card, on) {
    if (card.obj) card.obj.frontMat.color.setScalar(on ? 0.45 : 1);
  }

  removeCard(card) {
    const o = card.obj;
    if (!o) return;
    this.scene.remove(o.group);
    o.frontMat.dispose();
    o.backMat.dispose();
    card.obj = null;
  }

  // Gather cards into a pile at `to()` (a function, so piles can grow) and take them off the table.
  async sweep(list, to, onEach) {
    await Promise.all(list.filter((c) => c.obj).map(async (card, i) => {
      await wait(i * 35);
      const g = card.obj.group;
      const start = g.position.clone();
      const end = to();
      const yaw0 = g.rotation.y;
      const z0 = g.rotation.z;
      await tween(420, (t) => {
        g.position.lerpVectors(start, end, t);
        g.position.y += Math.sin(Math.PI * t) * 0.6;
        g.rotation.y = yaw0 * (1 - t);
        g.rotation.z = z0 + (Math.PI - z0) * t;
      }, ease.inOut);
      this.removeCard(card);
      if (onEach) onEach();
    }));
  }

  // ---------- Chips ----------
  chip(v) {
    const m = new T.Mesh(chipGeo, chipMaterials(v));
    m.castShadow = true;
    return m;
  }

  // A stack of chips with its amount on a label just in front of it.
  stack(pos, { label = true, labelOffset = 0.5 } = {}) {
    const t3 = this;
    const group = new T.Group();
    group.position.copy(pos);
    this.scene.add(group);
    const tag = label ? this.label('t3-amount', () => V(group.position.x + labelOffset, 0, group.position.z)) : null;
    if (tag) tag.hide();
    return {
      group,
      amount: 0,
      top() { return V(group.position.x, group.position.y + Math.min(this.amount ? breakdown(this.amount).length : 0, 10) * CHIP_H + 0.1, group.position.z); },
      set(amount, { pop = true } = {}) {
        this.amount = amount;
        group.clear();
        const list = breakdown(amount);
        const cols = Math.ceil(list.length / 10) || 1;
        list.forEach((v, i) => {
          const c = t3.chip(v);
          const col = Math.floor(i / 10);
          c.position.set((col - (cols - 1) / 2) * CHIP_R * 2.1 + rand(-0.015, 0.015), CHIP_H / 2 + (i % 10) * CHIP_H, rand(-0.015, 0.015));
          c.rotation.y = rand(0, Math.PI * 2);
          group.add(c);
        });
        if (tag) {
          if (amount) tag.show(Casino.fmt(amount));
          else tag.hide();
        }
        if (pop && amount) tween(260, (t) => group.scale.setScalar(0.85 + 0.15 * t), ease.back);
      },
      moveTo(p, dur = 320) { return t3.moveObject(group, V(p.x, p.y || 0, p.z), dur); },
      remove() { t3.scene.remove(group); if (tag) tag.remove(); },
    };
  }

  // Toss chips worth `amount` between two world points along an arc.
  flyChips(from, to, amount, { max = 5, dur = 520, stagger = 60 } = {}) {
    if (amount <= 0) return Promise.resolve();
    const list = breakdown(amount).slice(0, max);
    return Promise.all(list.map(async (v, i) => {
      await wait(i * stagger);
      const m = this.chip(v);
      const start = from.clone();
      const end = to.clone().add(V(rand(-0.06, 0.06), 0, rand(-0.06, 0.06)));
      const lift = 0.8 + start.distanceTo(end) * 0.12;
      const spin = rand(4, 9);
      m.position.copy(start);
      this.scene.add(m);
      await tween(dur, (t) => {
        m.position.lerpVectors(start, end, t);
        m.position.y += Math.sin(Math.PI * t) * lift;
        m.rotation.x = spin * t;
        m.rotation.z = spin * 0.6 * t;
      }, ease.inOut);
      this.scene.remove(m);
      sound.chip();
    }));
  }

  // The world point `dist` units in front of the camera, in the direction of an on-screen element.
  screenPoint(el, dist = 5) {
    const r = el.getBoundingClientRect();
    const s = this.stage.getBoundingClientRect();
    const ndc = new T.Vector2(
      ((r.left + r.width / 2 - s.left) / s.width) * 2 - 1,
      -((r.top + r.height / 2 - s.top) / s.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.at(dist, V());
  }

  moveObject(obj, to, dur = 320) {
    const start = obj.position.clone();
    if (dur <= 0) { obj.position.copy(to); return Promise.resolve(); }
    return tween(dur, (t) => obj.position.lerpVectors(start, to, t), ease.inOut);
  }

  // ---------- Labels ----------
  // An HTML element kept on top of a 3D point. getPos returns a Vector3 or null to hide it.
  // With clamp, the element is kept fully on screen (for nameplates near the edges).
  label(className, getPos, { clamp = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 't3-label';
    const el = document.createElement('div');
    el.className = className;
    wrap.append(el);
    this.labelLayer.append(wrap);
    const entry = { wrap, el, getPos, clamp, hidden: false };
    this.labels.add(entry);
    return {
      el,
      show(text) {
        if (text !== undefined && el.textContent !== text) el.textContent = text;
        entry.hidden = false;
        wrap.hidden = false;
      },
      hide() { entry.hidden = true; wrap.hidden = true; },
      remove: () => { this.labels.delete(entry); wrap.remove(); },
    };
  }

  // ---------- Camera ----------
  // view: { target, elevation (deg), yaw (deg), fov, width, depth }. Width, depth and elevation
  // may be functions of the visible area's aspect ratio.
  // The camera backs off until `width` across and `depth` deep fit above the controls.
  computeView(v) {
    const w = this.width;
    const h = this.height;
    const inset = this.bottomInset();
    const tanV = Math.tan(T.MathUtils.degToRad(v.fov || 40) / 2);
    const tanH = tanV * (w / (h + inset));
    const tanVeff = tanV * ((h - inset) / (h + inset));
    const aspect = w / Math.max(1, h - inset);
    const pick = (x) => (typeof x === 'function' ? x(aspect) : x);
    const width = pick(v.width);
    const elev = T.MathUtils.degToRad(pick(v.elevation));
    const yaw = T.MathUtils.degToRad(v.yaw || 0);
    const dist = Math.max(width / 2 / tanH, (pick(v.depth) * Math.sin(elev)) / 2 / tanVeff);
    const dir = V(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
    return { pos: v.target.clone().add(dir.multiplyScalar(dist)), target: v.target.clone() };
  }

  setView(v, dur = 900) {
    this.view = v;
    const { pos, target } = this.computeView(v);
    if (dur <= 0 || !this.active) {
      this.camTween++;
      this.camPos.copy(pos);
      this.camTarget.copy(target);
      return Promise.resolve();
    }
    const p0 = this.camPos.clone();
    const t0 = this.camTarget.clone();
    const id = ++this.camTween;
    return tween(dur, (t) => {
      if (id !== this.camTween) return;
      this.camPos.lerpVectors(p0, pos, t);
      this.camTarget.lerpVectors(t0, target, t);
    }, ease.inOut);
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const changed = r.width !== this.width || r.height !== this.height;
    this.width = r.width;
    this.height = r.height;
    const inset = Math.min(this.bottomInset(), r.height * 0.6);
    this.renderer.setSize(r.width, r.height, false);
    this.camera.fov = this.view ? this.view.fov || 40 : 40;
    this.camera.aspect = r.width / (r.height + inset);
    this.camera.setViewOffset(r.width, r.height + inset, 0, inset, r.width, r.height);
    this.camera.updateProjectionMatrix();
    if (this.view && changed) {
      const { pos, target } = this.computeView(this.view);
      this.camTween++;
      this.camPos.copy(pos);
      this.camTarget.copy(target);
    }
  }

  render(now) {
    for (const fn of this.hooks) fn(now);
    const sway = now * 0.001;
    this.camera.position.set(
      this.camPos.x + Math.sin(sway * 0.37) * 0.05,
      this.camPos.y + Math.sin(sway * 0.29) * 0.04,
      this.camPos.z,
    );
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
    const p = V();
    for (const l of this.labels) {
      if (l.hidden) continue;
      const pos = l.getPos();
      if (!pos) { l.wrap.style.visibility = 'hidden'; continue; }
      p.copy(pos).project(this.camera);
      l.wrap.style.visibility = p.z > 1 ? 'hidden' : '';
      let x = ((p.x + 1) / 2) * this.width;
      let y = ((1 - p.y) / 2) * this.height;
      if (l.clamp) {
        const mx = l.el.offsetWidth / 2 + 6;
        const my = l.el.offsetHeight / 2 + 6;
        x = Math.min(Math.max(x, mx), this.width - mx);
        y = Math.min(Math.max(y, my), this.height - this.bottomInset() - my);
      }
      l.wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }
}

// Draw `text` around a circle so it reads left to right along the bottom of the arc.
function arcText(g, text, cx, cy, r, spacing = 0) {
  const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let acc = 0;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  [...text].forEach((ch, i) => {
    const phi = (acc + widths[i] / 2 - total / 2) / r;
    g.save();
    g.translate(cx + r * Math.sin(phi), cy + r * Math.cos(phi));
    g.rotate(-phi);
    g.fillText(ch, 0, 0);
    g.restore();
    acc += widths[i];
  });
}

function create(stage, opts) {
  try {
    return new Table(stage, opts);
  } catch (e) {
    const msg = document.createElement('div');
    msg.className = 'stage-error';
    msg.textContent = 'This table needs 3D graphics (WebGL), which this browser has turned off.';
    stage.append(msg);
    throw e;
  }
}

// A canvas-drawn texture: draw(ctx, w, h).
function texture(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return canvasTexture(c);
}

Casino.Table3D = { create, engine, tables, tween, wait, ease, arcText, speckle, offsetOutline, texture, roundRect, V, CARD_W, CARD_H, CHIP_H };
})();
