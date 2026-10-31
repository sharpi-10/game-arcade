(() => {
'use strict';

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
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

// ---------- Tunables ----------
const LAPS = 3;
const SAMPLES = 1200;          // points sampled along the track centre line
const ROAD_HALF = 10;          // half the road width
const CURB_W = 1.6;
const WALL = ROAD_HALF + 15;   // invisible-ish barrier distance from the centre line
const KART_R = 1.3;
const TURN_RATE = 2.1;
const HOP_TIME = 0.25;
const DRIFT_BLUE = 0.9;
const DRIFT_ORANGE = 2.0;
const TOP_SPEED = 50;
const SPEED_TO_KMH = 2.4;
const SKY_HORIZON = 0xcde8ff;

const DIFFICULTIES = {
  easy: { label: 'Easy', ai: 0.82, items: 0.4 },
  normal: { label: 'Normal', ai: 0.93, items: 0.75 },
  hard: { label: 'Hard', ai: 1.0, items: 1.0 },
};
const KART_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];
const CPU_NAMES = ['Zippy', 'Bolt', 'Nitro', 'Skid', 'Dash', 'Vroom'];
const ITEM_ICONS = { boost: '⚡', banana: '🍌', rocket: '🚀' };
const NO_INPUT = { throttle: 0, steer: 0, drift: false, item: false };

const settings = {
  difficulty: DIFFICULTIES[store.get('turboKarts.difficulty', 'normal')] ? store.get('turboKarts.difficulty', 'normal') : 'normal',
};

// Your kart paint is part of your arcade character. Carry over a colour picked before that.
const OLD_PAINTS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const oldColor = store.get('turboKarts.color', null);
if (oldColor !== null) {
  if (Arcade.player.look.kartPaint === 'red' && OLD_PAINTS[oldColor]) Arcade.setLook({ kartPaint: OLD_PAINTS[oldColor] }, { quiet: true });
  try { localStorage.removeItem('turboKarts.color'); } catch { /* storage unavailable */ }
}
function paintHex() {
  const id = Arcade.player.look.kartPaint;
  const item = Arcade.owns('kartPaint', id) && Arcade.item('kartPaint', id);
  return parseInt((item ? item.swatch : '#e53935').slice(1), 16);
}

// ---------- Renderer, scene, camera ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY_HORIZON, 300, 1400);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 3000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4a, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(200, 300, 120);
scene.add(sun);

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function speckle(g, w, h, colors, count, size) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

const MAT = {
  dark: new THREE.MeshLambertMaterial({ color: 0x2a2a33 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x9aa3ad }),
  tire: new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
  visor: new THREE.MeshLambertMaterial({ color: 0x1b2a4a, emissive: 0x0a1020 }),
  suit: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.9 }),
  shadow: new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  }),
  banana: new THREE.MeshLambertMaterial({ color: 0xffd93b, emissive: 0x332600 }),
  rocket: new THREE.MeshLambertMaterial({ color: 0xd62828 }),
};

// ---------- Track ----------
const TRACK_POINTS = [
  [0, 0], [120, 0], [200, -30], [240, -110], [200, -190], [110, -200], [60, -150], [0, -160],
  [-80, -220], [-170, -200], [-210, -120], [-180, -40], [-110, 10], [-50, 10],
].map(([x, z]) => new THREE.Vector3(x * 1.4, 0, z * 1.4));
const curve = new THREE.CatmullRomCurve3(TRACK_POINTS, true, 'centripetal');
const P = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
const T = P.map((p, i) => P[(i + 1) % SAMPLES].clone().sub(P[(i - 1 + SAMPLES) % SAMPLES]).normalize());
const S = T.map((t) => new THREE.Vector3(t.z, 0, -t.x)); // sideways (left of travel)
const SEG = curve.getLength() / SAMPLES;
const headingAt = (i) => Math.atan2(T[i].x, T[i].z);

function nearestIndex(pos, hint) {
  let best = 0;
  let bestD = Infinity;
  const scan = (i) => {
    const dx = P[i].x - pos.x;
    const dz = P[i].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint == null || hint < 0) for (let i = 0; i < SAMPLES; i++) scan(i);
  else for (let o = -40; o <= 40; o++) scan((hint + o + SAMPLES) % SAMPLES);
  return best;
}

function lateralAt(pos, i) {
  return (pos.x - P[i].x) * S[i].x + (pos.z - P[i].z) * S[i].z;
}

// A ribbon that follows the track between two sideways offsets (a, b) at heights (y0, y1).
function stripGeometry(a, b, y0, y1, vScale) {
  const pos = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = P[i % SAMPLES];
    const s = S[i % SAMPLES];
    pos.push(p.x + s.x * a, y0, p.z + s.z * a, p.x + s.x * b, y1, p.z + s.z * b);
    const v = (i * SEG) / vScale;
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < SAMPLES; i++) {
    const q = i * 2;
    index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

let sky = null;

function buildWorld() {
  // Sky dome
  const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
  const top = new THREE.Color(0x3d8ce0);
  const mid = new THREE.Color(0x9fd2ff);
  const hor = new THREE.Color(SKY_HORIZON);
  const colors = [];
  const sp = skyGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 1800;
    const c = new THREE.Color();
    if (y < 0.02) c.copy(hor);
    else if (y < 0.25) c.lerpColors(hor, mid, (y - 0.02) / 0.23);
    else c.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -1;
  scene.add(sky);

  // Grass
  const grass = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#5fae4b';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#56a242', '#69b955', '#4f9a3d', '#73c25d'], 900, 3);
  });
  grass.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Road
  const asphalt = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#585b63';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#50535a', '#62656d', '#4a4d54', '#6b6e76'], 2500, 2);
    g.fillStyle = '#f2f2f2';
    g.fillRect(4, 0, 4, h);
    g.fillRect(w - 8, 0, 4, h);
    g.fillStyle = 'rgba(245,245,245,.85)';
    g.fillRect(w / 2 - 2, 0, 4, h / 2);
  });
  const roadMat = (map, offset) => new THREE.MeshLambertMaterial({
    map, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset,
  });
  scene.add(new THREE.Mesh(stripGeometry(-ROAD_HALF, ROAD_HALF, 0.02, 0.02, 12), roadMat(asphalt, -2)));

  // Red/white curbs
  const curb = canvasTexture(8, 16, (g) => {
    g.fillStyle = '#e53935'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#ffffff'; g.fillRect(0, 8, 8, 8);
  });
  curb.magFilter = THREE.NearestFilter;
  const curbMat = roadMat(curb, -3);
  scene.add(new THREE.Mesh(stripGeometry(ROAD_HALF, ROAD_HALF + CURB_W, 0.04, 0.04, 4), curbMat));
  scene.add(new THREE.Mesh(stripGeometry(-ROAD_HALF - CURB_W, -ROAD_HALF, 0.04, 0.04, 4), curbMat));

  // Low barrier walls
  const wallTex = canvasTexture(8, 16, (g) => {
    g.fillStyle = '#1e5bd8'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#ffffff'; g.fillRect(0, 8, 8, 8);
  });
  wallTex.magFilter = THREE.NearestFilter;
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(stripGeometry(WALL, WALL, 0, 1.3, 6), wallMat));
  scene.add(new THREE.Mesh(stripGeometry(-WALL, -WALL, 0, 1.3, 6), wallMat));

  // Start / finish line
  const checker = canvasTexture(256, 48, (g) => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 3; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    }
  }, false);
  checker.magFilter = THREE.NearestFilter;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 3.75), roadMat(checker, -4));
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, headingAt(0), 0);
  line.position.set(P[0].x, 0.05, P[0].z);
  scene.add(line);

  // Start arch with banner
  const arch = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 10, 10);
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, MAT.metal);
    pole.position.set(side * (ROAD_HALF + 2.5), 5, 0);
    arch.add(pole);
  }
  const banner = canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#d32f2f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcc33';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#fff';
    g.font = '900 78px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TURBO KARTS', w / 2, h / 2 + 4);
  }, false);
  const bannerMat = new THREE.MeshLambertMaterial({ map: banner });
  const plain = new THREE.MeshLambertMaterial({ color: 0xd32f2f });
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF * 2 + 6, 2.8, 0.6),
    [plain, plain, plain, plain, bannerMat, bannerMat],
  );
  beam.position.y = 10;
  arch.add(beam);
  arch.position.copy(P[0]);
  arch.rotation.y = headingAt(0);
  scene.add(arch);

  buildGrandstand();
  buildTrees();
  buildMountains();
  buildClouds();
}

function buildGrandstand() {
  const i = Math.round(45 / SEG);
  const crowd = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#3a3f5c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#ffffff', '#ff80ab', '#b388ff'], 700, 4);
  });
  crowd.repeat.set(4, 1);
  const crowdMat = new THREE.MeshLambertMaterial({ map: crowd });
  const stand = new THREE.Group();
  for (let step = 0; step < 4; step++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(70, 2.4, 4), crowdMat);
    box.position.set(0, 1.2 + step * 2.4, step * 4);
    stand.add(box);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(74, 0.6, 18), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
  roof.position.set(0, 13, 6);
  stand.add(roof);
  const side = S[i].clone().multiplyScalar(WALL + 8);
  stand.position.set(P[i].x + side.x, 0, P[i].z + side.z);
  stand.rotation.y = headingAt(i) + Math.PI / 2;
  scene.add(stand);
  scenery.avoid.push({ x: stand.position.x, z: stand.position.z, r: 50 });
}

const scenery = { avoid: [] };

function farFromTrack(x, z, margin) {
  for (let i = 0; i < SAMPLES; i += 4) {
    const dx = P[i].x - x;
    const dz = P[i].z - z;
    if (dx * dx + dz * dz < margin * margin) return false;
  }
  return scenery.avoid.every((a) => (a.x - x) ** 2 + (a.z - z) ** 2 > a.r * a.r);
}

function buildTrees() {
  const count = 260;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.7, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a4f2a }), count,
  );
  const leavesLow = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3.2, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e7d32 }), count,
  );
  const leavesHigh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.3, 4.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x388e3c }), count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < 5000) {
    tries++;
    const x = rand(-520, 560);
    const z = rand(-560, 260);
    if (!farFromTrack(x, z, WALL + 6)) continue;
    const s = rand(0.8, 1.7);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
    scale.set(s, s, s);
    trunk.setMatrixAt(placed, m.compose(pos.set(x, 1.5 * s, z), q, scale));
    leavesLow.setMatrixAt(placed, m.compose(pos.set(x, 5.5 * s, z), q, scale));
    leavesHigh.setMatrixAt(placed, m.compose(pos.set(x, 8.5 * s, z), q, scale));
    placed++;
  }
  for (const mesh of [trunk, leavesLow, leavesHigh]) {
    mesh.count = placed;
    scene.add(mesh);
  }
}

function buildMountains() {
  const rock = new THREE.MeshLambertMaterial({ color: 0x7a9a6e });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf4f7fb });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rand(-0.05, 0.05);
    const r = rand(950, 1150);
    const h = rand(110, 260);
    const w = rand(90, 170);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), rock);
    cone.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r - 140);
    scene.add(cone);
    if (h > 190) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.3, 7), snow);
      cap.position.set(cone.position.x, h - h * 0.15 - 2, cone.position.z);
      scene.add(cap);
    }
  }
}

function buildClouds() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa });
  const puff = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const parts = 4 + ((Math.random() * 3) | 0);
    for (let j = 0; j < parts; j++) {
      const p = new THREE.Mesh(puff, mat);
      const s = rand(14, 26);
      p.scale.set(s * 1.4, s * 0.7, s);
      p.position.set(j * 18 - parts * 9, rand(-4, 6), rand(-8, 8));
      cloud.add(p);
    }
    const a = rand(0, Math.PI * 2);
    const r = rand(250, 800);
    cloud.position.set(Math.cos(a) * r, rand(150, 230), Math.sin(a) * r - 140);
    cloud.rotation.y = rand(0, Math.PI);
    scene.add(cloud);
  }
}

// ---------- Item boxes ----------
const itemBoxes = [];
function buildItemBoxes() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#ffd54f');
    grd.addColorStop(0.5, '#ff4fa3');
    grd.addColorStop(1, '#4fc3ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.font = '900 88px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#3a1460';
    g.strokeText('?', w / 2, h / 2 + 4);
    g.fillStyle = '#fff';
    g.fillText('?', w / 2, h / 2 + 4);
  }, false);
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.92, emissive: 0x333333 });
  const geo = new THREE.BoxGeometry(2, 2, 2);
  for (const frac of [0.2, 0.47, 0.74]) {
    const i = Math.round(SAMPLES * frac);
    for (const off of [-6, -2, 2, 6]) {
      const mesh = new THREE.Mesh(geo, mat);
      const x = P[i].x + S[i].x * off;
      const z = P[i].z + S[i].z * off;
      mesh.position.set(x, 1.6, z);
      mesh.rotation.set(0.6, rand(0, 3), 0.4);
      scene.add(mesh);
      itemBoxes.push({ mesh, x, z, respawn: 0, phase: rand(0, 6) });
    }
  }
}

// ---------- Models ----------
function buildKartModel(color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshLambertMaterial({ color });
  const add = (geo, mat, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(2.1, 0.4, 3.3), paint, 0, 0.6, 0);
  add(new THREE.BoxGeometry(1.5, 0.45, 1.1), paint, 0, 0.65, 1.9);
  add(new THREE.BoxGeometry(2.5, 0.28, 0.35), MAT.dark, 0, 0.45, 2.55);
  add(new THREE.BoxGeometry(0.45, 0.5, 1.0), paint, 1.2, 0.65, 0.1);
  add(new THREE.BoxGeometry(0.45, 0.5, 1.0), paint, -1.2, 0.65, 0.1);
  add(new THREE.BoxGeometry(1.3, 1.0, 0.3), MAT.dark, 0, 1.2, -1.0);
  add(new THREE.BoxGeometry(1.2, 0.5, 0.7), MAT.metal, 0, 0.95, -1.55);
  add(new THREE.BoxGeometry(2.6, 0.14, 0.7), paint, 0, 1.75, -1.85);
  add(new THREE.BoxGeometry(0.14, 0.9, 0.14), MAT.dark, 0.8, 1.3, -1.8);
  add(new THREE.BoxGeometry(0.14, 0.9, 0.14), MAT.dark, -0.8, 1.3, -1.8);
  const wheel = add(new THREE.TorusGeometry(0.32, 0.07, 6, 14), MAT.dark, 0, 1.35, 0.55);
  wheel.rotation.x = -0.6;
  add(new THREE.CylinderGeometry(0.5, 0.6, 0.9, 10), MAT.suit, 0, 1.4, -0.45);
  const helmet = add(new THREE.SphereGeometry(0.58, 16, 12), paint, 0, 2.2, -0.4);
  const visor = add(new THREE.BoxGeometry(0.8, 0.28, 0.3), MAT.visor, 0, 2.25, 0.05);

  const pipeGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.6, 8);
  const flames = [];
  for (const x of [-0.35, 0.35]) {
    const pipe = add(pipeGeo, MAT.metal, x, 0.95, -2.0);
    pipe.rotation.x = Math.PI / 2;
    const flame = add(new THREE.ConeGeometry(0.26, 1.5, 10), MAT.flame, x, 0.95, -3.0);
    flame.rotation.x = -Math.PI / 2;
    flame.visible = false;
    flames.push(flame);
  }

  const wheels = [];
  const steerers = [];
  for (const [x, z, front] of [[1.25, 1.3, true], [-1.25, 1.3, true], [1.32, -1.2, false], [-1.32, -1.2, false]]) {
    const r = front ? 0.5 : 0.6;
    const width = front ? 0.45 : 0.6;
    const holder = new THREE.Group();
    holder.position.set(x, r, z);
    body.add(holder);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 14), MAT.tire);
    w.rotation.z = Math.PI / 2;
    holder.add(w);
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, width + 0.04, 8), MAT.metal));
    w.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, width + 0.06, r * 1.5), MAT.dark));
    wheels.push(w);
    if (front) steerers.push(holder);
  }

  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparks = [];
  for (const x of [-1.35, 1.35]) {
    const spark = add(new THREE.OctahedronGeometry(0.35), sparkMat, x, 0.3, -1.9);
    spark.visible = false;
    sparks.push(spark);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.1, 20), MAT.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.35, 1);
  shadow.position.y = 0.08;
  root.add(shadow);

  return { root, body, wheels, steerers, flames, sparks, sparkMat, helmet, visor };
}

function buildBanana() {
  const g = new THREE.Group();
  const peel = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.28, 8, 16, Math.PI * 1.1), MAT.banana);
  peel.rotation.z = Math.PI * 0.95;
  peel.position.y = 1.0;
  g.add(peel);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshLambertMaterial({ color: 0x5b3a1a }));
  tip.position.set(0.72, 1.15, 0);
  g.add(tip);
  g.scale.setScalar(1.3);
  return g;
}

function buildRocket() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.8, 12), MAT.rocket);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.8, 12), MAT.white);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.3;
  g.add(nose);
  for (const [w, h] of [[1.4, 0.08], [0.08, 1.4]]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), MAT.dark);
    fin.position.z = -0.7;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.3, 10), MAT.flame);
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -1.55;
  g.add(flame);
  return g;
}

// ---------- Audio ----------
const audio = {
  ctx: null,
  muted: store.get('turboKarts.muted', false),
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    filter.connect(this.engineGain).connect(this.master);
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    this.osc1.connect(filter);
    this.osc2.connect(sub).connect(filter);
    this.osc1.start();
    this.osc2.start();
  },
  engine(speed, boosting, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + Math.abs(speed) * 2.3 + (boosting ? 30 : 0);
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engineGain.gain.setTargetAtTime(on ? 0.1 : 0, t, 0.1);
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
  noise(dur, vol = 0.2) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  },
  setMuted(m) {
    this.muted = m;
    store.set('turboKarts.muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },
};

// ---------- Karts ----------
class Kart {
  constructor(name, color, isPlayer) {
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer;
    this.model = buildKartModel(color);
    scene.add(this.model.root);
    this.pos = new THREE.Vector3();
    this.reset();
  }

  reset() {
    Object.assign(this, {
      heading: 0, speed: 0, idx: 0, lat: 0,
      lap: 0, passedHalf: true, finished: false, finishTime: 0, lapStart: 0, bestLap: Infinity, rank: 0,
      driftDir: 0, driftCharge: 0, driftHeld: false, hop: 0,
      boost: 0, spin: 0, spinAngle: 0, invuln: 0,
      item: null, roll: 0, rollItem: null, itemTimer: 0,
      visualYaw: 0, tilt: 0, wheelSpin: 0, steer: 0,
      capMul: 1, maxSpeed: TOP_SPEED, accel: 28, auto: !this.isPlayer,
      skill: 1, lane: 0, laneTarget: 0, laneTimer: 0, stuck: 0, bumpCooldown: 0,
    });
  }

  get progress() { return this.lap * SAMPLES + this.idx; }

  dispose() {
    scene.remove(this.model.root);
    if (this.model.head) { this.model.head.material.map.dispose(); this.model.head.material.dispose(); }
  }
}

// ---------- Game state ----------
let karts = [];
let player = null;
let order = [];
let bananas = [];
let rockets = [];
let effects = [];
let state = 'menu';
let paused = false;
let countdown = 0;
let lastCount = 0;
let startPressAt = null;
let raceTime = 0;
let resultsTimer = 0;
let resultsRefresh = 0;
let clock = 0;
let camHeading = 0;
let shake = 0;
let menuAngle = 0;

// Your character drives your kart: a cut-out of their head replaces the helmet.
function addDriverHead(k) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  head.scale.set(2.3, 2.3, 1);
  head.position.set(0, 2.45, -0.45);
  k.model.body.add(head);
  k.model.head = head;
  k.model.helmet.visible = false;
  k.model.visor.visible = false;
  const img = new Image();
  img.onload = () => {
    c.getContext('2d').drawImage(img, 0, 0, 256, 256);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(Arcade.character(undefined, { bg: false, crop: 'head' }))}`;
}

function setupKarts() {
  karts.forEach((k) => k.dispose());
  const mine = paintHex();
  const others = KART_COLORS.filter((c) => c !== mine).slice(0, 5);
  const diff = DIFFICULTIES[settings.difficulty];
  karts = others.map((c, i) => new Kart(CPU_NAMES[i], c, false));
  player = new Kart(Arcade.player.name, mine, true);
  addDriverHead(player);
  karts.push(player);
  const skills = [1.04, 1.02, 1.0, 0.97, 0.95];
  karts.forEach((k, slot) => {
    k.reset();
    k.skill = k.isPlayer ? 1 : diff.ai * skills[slot];
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const back = 8 + row * 8 + col * 4;
    const i = (SAMPLES - Math.round(back / SEG)) % SAMPLES;
    const off = col ? -4.5 : 4.5;
    k.pos.set(P[i].x + S[i].x * off, 0, P[i].z + S[i].z * off);
    k.heading = headingAt(i);
    k.idx = i;
    k.lane = k.laneTarget = off;
    syncModel(k, 0);
  });
  bananas.forEach((b) => scene.remove(b.mesh));
  rockets.forEach((r) => scene.remove(r.mesh));
  effects.forEach((e) => scene.remove(e.mesh));
  bananas = [];
  rockets = [];
  effects = [];
  itemBoxes.forEach((b) => { b.respawn = 0; b.mesh.visible = true; });
  computeOrder();
}

function startRace() {
  audio.init();
  setupKarts();
  state = 'countdown';
  paused = false;
  countdown = 3.4;
  lastCount = 0;
  startPressAt = null;
  raceTime = 0;
  resultsTimer = 0;
  camHeading = player.heading;
  snapCamera();
  $('menu').hidden = true;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = true;
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  $('best-lap').textContent = '';
  updateHud();
}

function toMenu() {
  state = 'menu';
  paused = false;
  setupKarts();
  $('menu').hidden = false;
  $('pause').hidden = true;
  $('results').hidden = true;
  $('back-link').hidden = false;
  $('hud').hidden = true;
  $('touch').hidden = true;
  audio.engine(0, false, false);
  renderMenu();
}

function setPaused(p) {
  if (state !== 'countdown' && state !== 'racing') return;
  paused = p;
  $('pause').hidden = !p;
  if (audio.ctx) audio.engine(0, false, false);
}

// ---------- Input ----------
const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false, drift: false };
let itemQueued = false;
const isTouch = window.matchMedia('(pointer: coarse)').matches;

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyX' || e.code === 'KeyE') itemQueued = true;
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!paused);
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
    if (key === 'item') { if (on) itemQueued = true; } else touch[key] = on;
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => set(false));
});

function readPlayerInput() {
  const has = (...codes) => codes.some((c) => keys.has(c));
  const up = has('ArrowUp', 'KeyW') || touch.gas;
  const down = has('ArrowDown', 'KeyS') || touch.brake;
  const left = has('ArrowLeft', 'KeyA') || touch.left;
  const right = has('ArrowRight', 'KeyD') || touch.right;
  const item = itemQueued;
  itemQueued = false;
  return {
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    drift: has('Space', 'ShiftLeft', 'ShiftRight') || touch.drift,
    item,
  };
}

// ---------- AI ----------
function aiInput(k, dt) {
  k.laneTimer -= dt;
  if (k.laneTimer <= 0) {
    k.laneTarget = rand(-1, 1) * ROAD_HALF * 0.55;
    k.laneTimer = rand(2, 5);
  }
  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  for (const b of bananas) {
    const dx = b.x - k.pos.x;
    const dz = b.z - k.pos.z;
    const ahead = dx * fx + dz * fz;
    if (ahead > 0 && ahead < 30 && dx * dx + dz * dz < 900 && Math.abs(b.lat - k.lane) < 3.5) {
      k.laneTarget = b.lat > 0 ? b.lat - 6 : b.lat + 6;
      k.laneTimer = Math.max(k.laneTimer, 1);
    }
  }
  k.lane += (k.laneTarget - k.lane) * Math.min(1, dt * 1.2);

  const look = Math.round((10 + Math.max(0, k.speed) * 0.45) / SEG);
  const j = (k.idx + look) % SAMPLES;
  const tx = P[j].x + S[j].x * k.lane;
  const tz = P[j].z + S[j].z * k.lane;
  const diff = wrapAngle(Math.atan2(tx - k.pos.x, tz - k.pos.z) - k.heading);
  const steer = clamp(-diff * 2.5, -1, 1);

  // Ease off for sharp bends, and rubber-band towards the player.
  const a = (k.idx + Math.round(12 / SEG)) % SAMPLES;
  const b = (a + Math.round(45 / SEG)) % SAMPLES;
  const bend = Math.abs(wrapAngle(headingAt(a) - headingAt(b)));
  const corner = 1 - Math.min(0.3, Math.max(0, bend - 0.4) * 0.35);
  let rubber = 1;
  if (!k.isPlayer && !player.finished) {
    const gap = (player.progress - k.progress) * SEG;
    rubber = 1 + clamp(gap / 1200, -0.08, 0.1);
  }
  k.capMul = (k.isPlayer ? 0.9 : k.skill) * corner * rubber;

  if (k.speed < 4 && k.spin <= 0) k.stuck += dt;
  else k.stuck = 0;
  if (k.stuck > 2.5) respawnOnTrack(k);

  let item = false;
  if (k.item && k.roll <= 0) {
    k.itemTimer -= dt;
    if (k.itemTimer <= 0) {
      const giveUp = k.itemTimer < -5;
      if (k.item === 'boost') item = bend < 0.5 || giveUp;
      else if (k.item === 'banana') {
        item = giveUp || karts.some((o) => o !== k && k.progress - o.progress > 0 && (k.progress - o.progress) * SEG < 35);
      } else item = k.rank > 0 || giveUp;
    }
  }
  return { throttle: 1, steer, drift: false, item };
}

function respawnOnTrack(k) {
  k.pos.set(P[k.idx].x, 0, P[k.idx].z);
  k.heading = headingAt(k.idx);
  k.speed = 0;
  k.stuck = 0;
  k.invuln = 1.5;
}

// ---------- Kart physics ----------
function updateKart(k, input, dt) {
  if (k.spin > 0) {
    k.spin -= dt;
    k.spinAngle += dt * 13;
    if (k.spin <= 0) { k.spinAngle = 0; k.invuln = 1.2; }
    input = NO_INPUT;
    k.driftDir = 0;
    k.driftCharge = 0;
  }
  k.invuln = Math.max(0, k.invuln - dt);
  k.hop = Math.max(0, k.hop - dt);
  k.bumpCooldown = Math.max(0, k.bumpCooldown - dt);
  k.steer = input.steer;
  const showFx = k.isPlayer && !k.auto;

  // Speed
  const offroad = Math.abs(k.lat) > ROAD_HALF + CURB_W * 0.6;
  let top = k.maxSpeed * k.capMul;
  if (offroad) top *= 0.55;
  if (k.boost > 0) {
    k.boost -= dt;
    top = k.maxSpeed * 1.45;
    k.speed = Math.min(top, k.speed + 90 * dt);
  } else if (input.throttle > 0) {
    if (k.speed < top) k.speed = Math.min(top, k.speed + k.accel * dt * (k.speed < 0 ? 2.5 : 1));
  } else if (input.throttle < 0) {
    k.speed = Math.max(-15, k.speed - (k.speed > 0 ? 55 : 22) * dt);
  } else {
    k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 14 * dt);
  }
  if (k.speed > top) k.speed = Math.max(top, k.speed - 45 * dt);
  if (k.spin > 0) k.speed *= Math.pow(0.25, dt);

  // Hop & drift
  const wasHeld = k.driftHeld;
  k.driftHeld = input.drift;
  if (input.drift && !wasHeld && k.hop <= 0) {
    k.hop = HOP_TIME;
    if (showFx) audio.tone(260, 0.08, 'triangle', 0.12);
  }
  if (!k.driftDir && input.drift && k.speed > 18 && Math.abs(input.steer) > 0.1) {
    k.driftDir = Math.sign(input.steer);
    k.driftCharge = 0;
  }
  if (k.driftDir && (!input.drift || k.speed < 12)) {
    if (!input.drift) {
      if (k.driftCharge >= DRIFT_ORANGE) k.boost = Math.max(k.boost, 1.3);
      else if (k.driftCharge >= DRIFT_BLUE) k.boost = Math.max(k.boost, 0.7);
      if (showFx && k.driftCharge >= DRIFT_BLUE) audio.tone(180, 0.35, 'sawtooth', 0.12, 520);
    }
    k.driftDir = 0;
    k.driftCharge = 0;
  }

  // Steering
  const grip = Math.min(1, Math.abs(k.speed) / 12) * (k.speed < 0 ? -1 : 1);
  let turn;
  if (k.driftDir) {
    turn = k.driftDir * TURN_RATE * (0.8 + 0.5 * input.steer * k.driftDir);
    const before = k.driftCharge;
    k.driftCharge += dt * (input.steer * k.driftDir > 0.3 ? 1.5 : 0.9);
    if (showFx && before < DRIFT_BLUE && k.driftCharge >= DRIFT_BLUE) audio.tone(900, 0.08, 'square', 0.08);
    if (showFx && before < DRIFT_ORANGE && k.driftCharge >= DRIFT_ORANGE) audio.tone(1300, 0.1, 'square', 0.08);
  } else {
    turn = input.steer * TURN_RATE * (1 - 0.25 * Math.min(1, Math.abs(k.speed) / TOP_SPEED));
  }
  k.heading -= turn * grip * dt;

  // Move
  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  k.pos.x += fx * k.speed * dt;
  k.pos.z += fz * k.speed * dt;
  if (k.driftDir) {
    const slide = k.speed * 0.1 * dt * k.driftDir;
    k.pos.x += fz * slide;
    k.pos.z -= fx * slide;
  }

  // Track position, walls, laps
  const prevIdx = k.idx;
  k.idx = nearestIndex(k.pos, k.idx);
  k.lat = lateralAt(k.pos, k.idx);
  const lim = WALL - KART_R;
  if (Math.abs(k.lat) > lim) {
    const sg = Math.sign(k.lat);
    const over = Math.abs(k.lat) - lim;
    k.pos.x -= S[k.idx].x * over * sg;
    k.pos.z -= S[k.idx].z * over * sg;
    k.lat = sg * lim;
    const headOn = Math.abs(fx * S[k.idx].x + fz * S[k.idx].z);
    k.speed *= Math.pow(0.15, dt * (0.4 + 3 * headOn));
    if (showFx && headOn > 0.35 && k.speed > 15 && k.bumpCooldown <= 0) {
      audio.noise(0.15, 0.25);
      shake = 0.25;
      k.bumpCooldown = 0.5;
    }
  }

  if (prevIdx > SAMPLES * 0.85 && k.idx < SAMPLES * 0.15) {
    if (k.passedHalf) {
      k.lap++;
      k.passedHalf = false;
      onLap(k);
    }
  } else if (prevIdx < SAMPLES * 0.15 && k.idx > SAMPLES * 0.85) {
    k.lap--;
    k.passedHalf = true;
  }
  if (k.idx > SAMPLES * 0.4 && k.idx < SAMPLES * 0.6) k.passedHalf = true;

  // Item roulette and use
  if (k.roll > 0) {
    k.roll -= dt;
    if (k.roll <= 0) {
      k.item = k.rollItem;
      k.itemTimer = rand(1, 5) / DIFFICULTIES[settings.difficulty].items;
      if (showFx) audio.tone(1200, 0.07, 'square', 0.1);
    }
  }
  if (input.item && k.item && k.roll <= 0) useItem(k);
}

function onLap(k) {
  if (k.lap >= 2) {
    const t = raceTime - k.lapStart;
    k.bestLap = Math.min(k.bestLap, t);
  }
  k.lapStart = raceTime;
  if (k.lap > LAPS && !k.finished) {
    k.finished = true;
    k.finishTime = raceTime;
    if (k.isPlayer) finishRace();
    return;
  }
  if (k.isPlayer && !k.auto) {
    if (k.lap >= 2) {
      $('best-lap').textContent = `Best lap ${formatTime(k.bestLap)}`;
      audio.tone(784, 0.12, 'square', 0.12);
      audio.tone(1046, 0.18, 'square', 0.12, null, 0.12);
    }
    if (k.lap === LAPS) showBanner('FINAL LAP!', 'small gold');
    else if (k.lap >= 2) showBanner(`LAP ${k.lap}`, 'small');
  }
}

function hitKart(k, duration) {
  if (k.invuln > 0 || k.spin > 0) return;
  k.spin = duration;
  k.boost = 0;
  k.driftDir = 0;
  k.driftCharge = 0;
  k.hop = HOP_TIME;
  if (k === player) {
    audio.tone(520, 0.5, 'square', 0.15, 90);
    shake = 0.4;
  }
}

function pickItem(k) {
  const r = karts.length > 1 ? k.rank / (karts.length - 1) : 0;
  const weights = { banana: 5 - 3.5 * r, boost: 1.5 + 4 * r, rocket: k.rank === 0 ? 0.3 : 1.5 + 2 * r };
  let roll = Math.random() * (weights.banana + weights.boost + weights.rocket);
  for (const [item, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return 'boost';
}

function useItem(k) {
  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  const loud = k === player || k.pos.distanceTo(player.pos) < 40;
  if (k.item === 'boost') {
    k.boost = Math.max(k.boost, 1.6);
    if (loud) audio.tone(160, 0.45, 'sawtooth', 0.14, 620);
  } else if (k.item === 'banana') {
    const mesh = buildBanana();
    const x = k.pos.x - fx * 3.6;
    const z = k.pos.z - fz * 3.6;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = k.heading;
    scene.add(mesh);
    const idx = nearestIndex({ x, z }, k.idx);
    bananas.push({ mesh, x, z, lat: lateralAt({ x, z }, idx) });
    if (bananas.length > 24) scene.remove(bananas.shift().mesh);
    if (loud) audio.tone(330, 0.12, 'triangle', 0.15, 200);
  } else if (k.item === 'rocket') {
    const mesh = buildRocket();
    const pos = new THREE.Vector3(k.pos.x + fx * 3, 1.1, k.pos.z + fz * 3);
    mesh.position.copy(pos);
    scene.add(mesh);
    const target = k.rank > 0 ? order[k.rank - 1] : null;
    rockets.push({ mesh, pos, heading: k.heading, owner: k, target, life: 5, idx: k.idx });
    if (loud) { audio.noise(0.35, 0.2); audio.tone(600, 0.4, 'sawtooth', 0.08, 150); }
  }
  k.item = null;
}

function explode(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.9 }),
  );
  mesh.position.set(x, 1.2, z);
  scene.add(mesh);
  effects.push({ mesh, t: 0, dur: 0.45 });
  if (Math.hypot(x - player.pos.x, z - player.pos.z) < 60) audio.noise(0.4, 0.3);
}

// ---------- World updates ----------
function updateItemBoxes(dt, racing) {
  for (const box of itemBoxes) {
    if (box.respawn > 0) {
      box.respawn -= dt;
      if (box.respawn <= 0) box.mesh.visible = true;
      continue;
    }
    box.mesh.rotation.y += dt * 1.4;
    box.mesh.position.y = 1.7 + Math.sin(clock * 2.5 + box.phase) * 0.25;
    if (!racing) continue;
    for (const k of karts) {
      if ((k.pos.x - box.x) ** 2 + (k.pos.z - box.z) ** 2 > 2.7 * 2.7) continue;
      box.mesh.visible = false;
      box.respawn = 3;
      if (!k.item && k.roll <= 0) {
        k.roll = k.isPlayer && !k.auto ? 1.1 : 0.6;
        k.rollItem = pickItem(k);
        if (k === player) {
          audio.tone(660, 0.07, 'square', 0.1);
          audio.tone(990, 0.09, 'square', 0.1, null, 0.07);
        }
      }
      break;
    }
  }
}

function updateBananas() {
  for (let i = bananas.length - 1; i >= 0; i--) {
    const b = bananas[i];
    for (const k of karts) {
      if ((k.pos.x - b.x) ** 2 + (k.pos.z - b.z) ** 2 > 2.1 * 2.1 || k.spin > 0 || k.invuln > 0) continue;
      hitKart(k, 1.0);
      scene.remove(b.mesh);
      bananas.splice(i, 1);
      break;
    }
  }
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.life -= dt;
    r.idx = nearestIndex(r.pos, r.idx);
    let tx;
    let tz;
    if (r.target && r.pos.distanceTo(r.target.pos) < 45) {
      tx = r.target.pos.x;
      tz = r.target.pos.z;
    } else {
      const j = (r.idx + Math.round(16 / SEG)) % SAMPLES;
      tx = P[j].x;
      tz = P[j].z;
    }
    const diff = wrapAngle(Math.atan2(tx - r.pos.x, tz - r.pos.z) - r.heading);
    r.heading += clamp(diff, -4 * dt, 4 * dt);
    r.pos.x += Math.sin(r.heading) * 90 * dt;
    r.pos.z += Math.cos(r.heading) * 90 * dt;
    r.mesh.position.copy(r.pos);
    r.mesh.rotation.y = r.heading;
    r.mesh.children[4].scale.setScalar(rand(0.8, 1.3));

    let done = r.life <= 0 || Math.abs(lateralAt(r.pos, r.idx)) > WALL;
    for (const k of karts) {
      if (done) break;
      if (k === r.owner && r.life > 4.5) continue;
      if ((k.pos.x - r.pos.x) ** 2 + (k.pos.z - r.pos.z) ** 2 < 2.4 * 2.4) {
        hitKart(k, 1.4);
        done = true;
      }
    }
    if (done) {
      explode(r.pos.x, r.pos.z);
      scene.remove(r.mesh);
      rockets.splice(i, 1);
    }
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const p = e.t / e.dur;
    e.mesh.scale.setScalar(1 + p * 5);
    e.mesh.material.opacity = 0.9 * (1 - p);
    if (p >= 1) {
      scene.remove(e.mesh);
      effects.splice(i, 1);
    }
  }
}

function collideKarts() {
  const minD = KART_R * 2;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      a.speed *= 0.985;
      b.speed *= 0.985;
      if ((a === player || b === player) && player.bumpCooldown <= 0) {
        audio.noise(0.1, 0.15);
        player.bumpCooldown = 0.4;
      }
    }
  }
}

function computeOrder() {
  order = karts.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  order.forEach((k, i) => { k.rank = i; });
}

function syncModel(k, dt) {
  const m = k.model;
  m.root.position.set(k.pos.x, 0, k.pos.z);
  m.root.rotation.y = k.heading;
  const t = Math.min(1, dt * 8);
  k.visualYaw += ((k.driftDir ? -k.driftDir * 0.38 : 0) - k.visualYaw) * t;
  m.body.rotation.y = k.visualYaw + k.spinAngle;
  m.body.position.y = k.hop > 0 ? Math.sin((1 - k.hop / HOP_TIME) * Math.PI) * 0.7 : 0;
  k.tilt += (-k.steer * Math.min(1, Math.abs(k.speed) / TOP_SPEED) * 0.08 - k.tilt) * Math.min(1, dt * 6);
  m.body.rotation.z = k.tilt;
  k.wheelSpin += (k.speed * dt) / 0.55;
  for (const w of m.wheels) w.rotation.x = k.wheelSpin;
  for (const s of m.steerers) s.rotation.y = -k.steer * 0.45;
  for (const f of m.flames) {
    f.visible = k.boost > 0;
    if (f.visible) f.scale.set(1, rand(0.8, 1.5), 1);
  }
  const sparking = k.driftDir !== 0 && k.driftCharge > 0.25;
  if (sparking) {
    m.sparkMat.color.setHex(k.driftCharge >= DRIFT_ORANGE ? 0xff8a00 : k.driftCharge >= DRIFT_BLUE ? 0x3ad7ff : 0xfff3b0);
  }
  for (const s of m.sparks) {
    s.visible = sparking;
    if (sparking) {
      s.scale.setScalar(rand(0.6, 1.4));
      s.rotation.set(rand(0, 3), rand(0, 3), 0);
    }
  }
  m.body.visible = !(k.invuln > 0 && Math.floor(k.invuln * 14) % 2 === 0);
}

// ---------- Camera ----------
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();

// Pull the camera back on tall (portrait) screens so the road stays visible.
const camDistance = () => (camera.aspect < 1 ? 14 : 9.5);
const camHeight = () => (camera.aspect < 1 ? 5.6 : 4.3);

function snapCamera() {
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  camera.position.set(player.pos.x - fx * camDistance(), camHeight(), player.pos.z - fz * camDistance());
  camera.lookAt(player.pos.x + fx * 6, 1.6, player.pos.z + fz * 6);
}

function followCamera(dt) {
  const k = player;
  camHeading = lerpAngle(camHeading, k.heading + k.visualYaw * 0.4, 1 - Math.exp(-dt * 6));
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  camTarget.set(k.pos.x - fx * camDistance(), camHeight(), k.pos.z - fz * camDistance());
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 10));
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.x += rand(-1, 1) * shake;
    camera.position.y += rand(-1, 1) * shake;
  }
  camLook.set(k.pos.x + fx * 6, 1.6, k.pos.z + fz * 6);
  camera.lookAt(camLook);
  const fov = 68 + Math.max(0, k.speed - 30) * 0.25 + (k.boost > 0 ? 8 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

const trackCenter = new THREE.Vector3();
P.forEach((p) => trackCenter.add(p));
trackCenter.divideScalar(SAMPLES);

function menuCamera(dt) {
  menuAngle += dt * 0.07;
  camera.position.set(
    trackCenter.x + Math.cos(menuAngle) * 380,
    170,
    trackCenter.z + Math.sin(menuAngle) * 380,
  );
  camera.lookAt(trackCenter.x, 0, trackCenter.z);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ---------- HUD ----------
const hud = {
  lap: $('lap'), time: $('time'), pos: $('pos'), speed: $('speed'),
  itemSlot: $('item-slot'), itemIcon: $('item-icon'), wrongWay: $('wrong-way'), banner: $('banner'),
};
const hudCache = {};
function setText(el, key, value, html = false) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  if (html) el.innerHTML = value;
  else el.textContent = value;
}

function showBanner(text, cls = '') {
  const b = hud.banner;
  b.className = 'banner';
  b.textContent = text;
  void b.offsetWidth; // restart the animation
  b.className = `banner show ${cls}`;
}

const minimap = $('minimap');
const mmCtx = minimap.getContext('2d');
const mmBounds = P.reduce((b, p) => ({
  minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
  minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
let mm = null;

function layoutMinimap() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = minimap.clientWidth || 240;
  const h = minimap.clientHeight || 140;
  minimap.width = w * dpr;
  minimap.height = h * dpr;
  const pad = 12;
  const scale = Math.min((w - pad * 2) / (mmBounds.maxX - mmBounds.minX), (h - pad * 2) / (mmBounds.maxZ - mmBounds.minZ));
  const ox = (w - (mmBounds.maxX - mmBounds.minX) * scale) / 2;
  const oz = (h - (mmBounds.maxZ - mmBounds.minZ) * scale) / 2;
  mm = { dpr, scale, map: (x, z) => [ox + (x - mmBounds.minX) * scale, oz + (z - mmBounds.minZ) * scale] };
}

function drawMinimap() {
  if (!mm) layoutMinimap();
  const g = mmCtx;
  g.setTransform(mm.dpr, 0, 0, mm.dpr, 0, 0);
  g.clearRect(0, 0, minimap.width, minimap.height);
  g.lineJoin = 'round';
  g.beginPath();
  P.forEach((p, i) => {
    const [x, y] = mm.map(p.x, p.z);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 7;
  g.stroke();
  g.strokeStyle = '#585b63';
  g.lineWidth = 4;
  g.stroke();
  const [sx, sy] = mm.map(P[0].x, P[0].z);
  g.fillStyle = '#fff';
  g.fillRect(sx - 1.5, sy - 5, 3, 10);
  for (const k of karts) { // the player is last, so drawn on top
    const [x, y] = mm.map(k.pos.x, k.pos.z);
    g.beginPath();
    g.arc(x, y, k.isPlayer ? 5.5 : 4, 0, Math.PI * 2);
    g.fillStyle = `#${k.color.toString(16).padStart(6, '0')}`;
    g.fill();
    g.lineWidth = k.isPlayer ? 2.5 : 1.5;
    g.strokeStyle = k.isPlayer ? '#fff' : 'rgba(0,0,0,.6)';
    g.stroke();
  }
}

function updateHud() {
  const lap = clamp(player.lap, 1, LAPS);
  setText(hud.lap, 'lap', `${lap}/${LAPS}`);
  setText(hud.time, 'time', formatTime(state === 'countdown' ? 0 : player.finished ? player.finishTime : raceTime));
  const place = player.rank + 1;
  setText(hud.pos, 'pos', `${place}<sup>${suffix(place)}</sup>`, true);
  setText(hud.speed, 'speed', String(Math.round(Math.abs(player.speed) * SPEED_TO_KMH)));
  const rolling = player.roll > 0;
  const icon = rolling
    ? Object.values(ITEM_ICONS)[Math.floor(clock * 14) % 3]
    : player.item ? ITEM_ICONS[player.item] : '';
  setText(hud.itemIcon, 'item', icon);
  hud.itemSlot.classList.toggle('rolling', rolling);
  const wrong = state === 'racing' && !player.finished && player.speed > 5 && player.spin <= 0
    && Math.cos(player.heading - headingAt(player.idx)) < -0.3;
  hud.wrongWay.hidden = !wrong;
  drawMinimap();
}

// ---------- Race flow ----------
function finishRace() {
  state = 'finished';
  player.auto = true;
  player.item = null;
  player.roll = 0;
  const place = order.filter((k) => k.finished).length;
  player.finishPlace = place;
  showBanner('FINISH!', 'gold');
  [523, 659, 784, 1046].forEach((f, i) => audio.tone(f, 0.18, 'square', 0.12, null, i * 0.12));
  const key = `turboKarts.best.${settings.difficulty}`;
  const best = store.get(key, 0);
  player.newRecord = !best || player.finishTime < best;
  if (player.newRecord) store.set(key, player.finishTime);
  Arcade.record('race', { place, difficulty: settings.difficulty, time: player.finishTime });
  resultsTimer = 2.6;
}

function showResults() {
  const place = player.finishPlace;
  $('results-title').textContent = place === 1 ? '🏆 You win!' : place <= 3 ? `${place === 2 ? '🥈' : '🥉'} ${place}${suffix(place)} place!` : `You finished ${place}${suffix(place)}`;
  const bits = [`Time ${formatTime(player.finishTime)}`];
  if (player.bestLap < Infinity) bits.push(`best lap ${formatTime(player.bestLap)}`);
  if (player.newRecord) bits.push('new record!');
  $('results-sub').textContent = `${bits.join(' · ')} (${DIFFICULTIES[settings.difficulty].label})`;
  renderResultsTable();
  $('results').hidden = false;
  $('back-link').hidden = true;
}

function renderResultsTable() {
  $('results-body').innerHTML = order.map((k, i) => `
    <tr class="${k.isPlayer ? 'me' : ''}">
      <td>${i + 1}</td>
      <td><span class="dot" style="background:#${k.color.toString(16).padStart(6, '0')}"></span>${k.name}</td>
      <td>${k.finished ? formatTime(k.finishTime) : 'racing…'}</td>
    </tr>`).join('');
}

function updateRace(dt) {
  raceTime += dt;
  for (const k of karts) {
    const input = k.auto ? aiInput(k, dt) : readPlayerInput();
    updateKart(k, input, dt);
  }
  collideKarts();
  updateItemBoxes(dt, true);
  updateBananas();
  updateRockets(dt);
  updateEffects(dt);
  computeOrder();
  for (const k of karts) syncModel(k, dt);

  if (resultsTimer > 0) {
    resultsTimer -= dt;
    if (resultsTimer <= 0) showResults();
  }
  if (!$('results').hidden) {
    resultsRefresh -= dt;
    if (resultsRefresh <= 0) { renderResultsTable(); resultsRefresh = 0.5; }
  }
}

function updateCountdown(dt) {
  countdown -= dt;
  const n = Math.ceil(countdown);
  if (n !== lastCount && n > 0 && n <= 3) {
    lastCount = n;
    showBanner(String(n));
    audio.tone(440, 0.18, 'square', 0.15);
  }
  const input = readPlayerInput();
  if (input.throttle > 0) { if (startPressAt === null) startPressAt = countdown; } else startPressAt = null;
  player.steer = input.steer;
  if (countdown <= 0) {
    state = 'racing';
    showBanner('GO!', 'gold');
    audio.tone(880, 0.45, 'square', 0.16);
    if (startPressAt !== null && startPressAt < 1.0) {
      player.boost = 1.2;
      audio.tone(160, 0.45, 'sawtooth', 0.14, 620);
    }
  }
  updateItemBoxes(dt, false);
  for (const k of karts) syncModel(k, dt);
}

function update(dt) {
  clock += dt;
  if (state === 'menu') {
    updateItemBoxes(dt, false);
    menuCamera(dt);
    return;
  }
  if (state === 'countdown') updateCountdown(dt);
  else updateRace(dt);
  followCamera(dt);
  updateHud();
  const revving = state === 'countdown' && startPressAt !== null;
  audio.engine(revving ? 25 : player.speed, player.boost > 0, true);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) update(dt);
  sky.position.copy(camera.position); // the sky dome follows the camera
  renderer.render(scene, camera);
}

// ---------- Menus & buttons ----------
function renderMenu() {
  const me = Arcade.player;
  $('driver-face').innerHTML = Arcade.character();
  $('driver-name').textContent = me.name;
  $('driver-tix').innerHTML = `${Arcade.ticketIcon}${me.tickets.toLocaleString('en-US')} tickets`;
  // Paints you don't own yet show a lock and open the prize screen on that paint.
  const sw = $('swatches');
  sw.innerHTML = '';
  for (const p of Arcade.items('kartPaint')) {
    const own = Arcade.owns('kartPaint', p.id);
    const b = document.createElement('button');
    b.className = `swatch${own ? '' : ' locked'}`;
    b.style.background = p.swatch;
    b.title = own ? p.name : `${p.name}: ${p.price ? `${p.price} tickets` : 'quest reward'}`;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(own && p.id === me.look.kartPaint));
    b.onclick = () => {
      if (own) Arcade.setLook({ kartPaint: p.id });
      else Arcade.open({ slot: 'kartPaint', item: p.id });
    };
    sw.append(b);
  }
  document.querySelectorAll('#difficulty button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.d === settings.difficulty));
  });
  const best = store.get(`turboKarts.best.${settings.difficulty}`, 0);
  $('best-line').innerHTML = best
    ? `Your best on ${DIFFICULTIES[settings.difficulty].label}: <strong>${formatTime(best)}</strong>`
    : '';
}

document.querySelectorAll('#difficulty button').forEach((b) => {
  b.onclick = () => {
    settings.difficulty = b.dataset.d;
    store.set('turboKarts.difficulty', b.dataset.d);
    renderMenu();
  };
});

function toggleMute() {
  audio.setMuted(!audio.muted);
  $('mute-btn').textContent = audio.muted ? '🔇' : '🔊';
}

$('driver-btn').onclick = () => Arcade.open();
// A new look or paint shows up on the grid straight away.
Arcade.onChange(() => {
  if (state !== 'menu') return;
  setupKarts();
  renderMenu();
});
$('start-btn').onclick = startRace;
$('again-btn').onclick = startRace;
$('restart-btn').onclick = startRace;
$('resume-btn').onclick = () => setPaused(false);
$('menu-btn').onclick = toMenu;
$('results-menu-btn').onclick = toMenu;
$('pause-btn').onclick = () => setPaused(true);
$('mute-btn').onclick = toggleMute;
$('mute-btn').textContent = audio.muted ? '🔇' : '🔊';
$('item-key').textContent = isTouch ? 'Item' : 'X';

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  mm = null;
});

// ---------- Boot ----------
buildWorld();
buildItemBoxes();
toMenu();
requestAnimationFrame(frame);

})();
