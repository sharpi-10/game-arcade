// The casino's view of your arcade character: card back designs, plus your character in the
// top bar, the lobby and your poker seat. Editing happens on the arcade's character screen.
(() => {
'use strict';

const { $ } = Casino;
const A = window.Arcade;

const BACKS = [
  { id: 'classic', name: 'Classic', from: '#b8202f', to: '#6a0d18', trim: '#f5c84c', pattern: 'lattice' },
  { id: 'royal', name: 'Royal', from: '#2f63e0', to: '#0f2266', trim: '#f5c84c', pattern: 'lattice' },
  { id: 'midnight', name: 'Midnight', from: '#34343e', to: '#0a0a0e', trim: '#f5c84c', pattern: 'diamonds' },
  { id: 'jade', name: 'Jade', from: '#1a9a5c', to: '#063a22', trim: '#ffe9a8', pattern: 'diamonds' },
  { id: 'velvet', name: 'Velvet', from: '#8a3bd1', to: '#2d0b52', trim: '#ffd27a', pattern: 'rays' },
  { id: 'sunset', name: 'Sunset', from: '#ff9b42', to: '#b0225a', trim: '#fff2d0', pattern: 'rays' },
];

// ---------- Card backs ----------
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Drawn on a 300 x 420 design grid and scaled to the canvas, so previews and the 3D texture match.
function drawBack(g, w, h, id) {
  const d = BACKS.find((b) => b.id === id) || BACKS[0];
  g.save();
  g.scale(w / 300, h / 420);
  const W = 300;
  const H = 420;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, d.from);
  bg.addColorStop(1, d.to);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.save();
  roundRect(g, 26, 26, W - 52, H - 52, 14);
  g.clip();
  if (d.pattern === 'lattice') {
    g.strokeStyle = 'rgba(255,255,255,.13)';
    g.lineWidth = 3;
    for (let x = -H; x < W + H; x += 18) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke();
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x - H, H); g.stroke();
    }
  } else if (d.pattern === 'diamonds') {
    const s = 34;
    for (let row = 0; row * s * 0.7 < H + s; row++) {
      for (let col = -1; col * s < W + s; col++) {
        const cx = col * s + (row % 2) * (s / 2);
        const cy = row * s * 0.7;
        g.beginPath();
        g.moveTo(cx, cy - s * 0.7); g.lineTo(cx + s / 2, cy); g.lineTo(cx, cy + s * 0.7); g.lineTo(cx - s / 2, cy);
        g.closePath();
        g.fillStyle = (row + col) % 2 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)';
        g.fill();
      }
    }
    g.strokeStyle = d.trim;
    g.globalAlpha = 0.28;
    g.lineWidth = 1.5;
    for (let x = -H; x < W + H; x += s) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H * 0.71, H); g.stroke();
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x - H * 0.71, H); g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = 'rgba(255,255,255,.1)';
    for (let k = 0; k < 36; k += 2) {
      const a0 = (k / 36) * Math.PI * 2;
      const a1 = ((k + 1) / 36) * Math.PI * 2;
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 + Math.cos(a0) * 400, H / 2 + Math.sin(a0) * 400);
      g.lineTo(W / 2 + Math.cos(a1) * 400, H / 2 + Math.sin(a1) * 400);
      g.closePath();
      g.fill();
    }
  }
  g.restore();

  g.strokeStyle = '#f8f2e4';
  g.lineWidth = 14;
  roundRect(g, 13, 13, W - 26, H - 26, 22);
  g.stroke();
  g.strokeStyle = d.trim;
  g.lineWidth = 5;
  roundRect(g, 26, 26, W - 52, H - 52, 14);
  g.stroke();
  // Centre emblem: a spade in a trimmed medallion.
  g.fillStyle = d.to;
  g.beginPath(); g.arc(W / 2, H / 2, 46, 0, Math.PI * 2); g.fill();
  g.strokeStyle = d.trim;
  g.lineWidth = 5;
  g.beginPath(); g.arc(W / 2, H / 2, 46, 0, Math.PI * 2); g.stroke();
  g.fillStyle = d.trim;
  g.beginPath(); g.arc(W / 2, H / 2, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = d.to;
  g.font = '54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('♠︎', W / 2, H / 2 + 3);
  g.restore();
}

// ---------- Your character at the casino ----------
// Carry over a name, colour and card back chosen in the casino's older character editor.
const old = Casino.store.get('casino.profile', null);
if (old) {
  if (typeof old.name === 'string' && old.name.trim() && A.player.name === 'Player 1') A.setName(old.name);
  const patch = {};
  if (old.color) patch.color = old.color;
  if (old.back) patch.cardBack = old.back;
  for (const [slot, id] of Object.entries(patch)) A.grant(`${slot}:${id}`);
  A.setLook(patch, { quiet: true });
  try { localStorage.removeItem('casino.profile'); } catch { /* storage unavailable */ }
}

const profile = {
  get name() { return A.player.name; },
  get color() { return A.player.color; },
  // Falls back to the classic design if the chosen back isn't yours (or isn't a card back).
  get back() {
    const id = A.player.look.cardBack;
    return BACKS.some((b) => b.id === id) && A.owns('cardBack', id) ? id : 'classic';
  },
  avatar: () => A.character(),
  onChange(fn) { A.onChange(() => fn(profile)); },
  open: (opts) => A.open(opts),
};

const el = {
  topAvatar: $('#profile-btn .pf-avatar'),
  topName: $('#profile-btn .pf-name'),
  cardAvatar: $('#player-card .pc-avatar'),
  cardName: $('#player-card .pc-name'),
  cardBack: $('#player-card .pc-back'),
};

function paintBack(canvas, id) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || Number(canvas.dataset.w) || 60;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * 1.4 * dpr);
  drawBack(canvas.getContext('2d'), canvas.width, canvas.height, id);
}

function render() {
  document.documentElement.style.setProperty('--me', profile.color);
  el.topAvatar.innerHTML = profile.avatar();
  el.topName.textContent = profile.name;
  el.cardAvatar.innerHTML = profile.avatar();
  el.cardName.textContent = profile.name;
  paintBack(el.cardBack, profile.back);
}

$('#profile-btn').addEventListener('click', () => profile.open());
$('#player-card').addEventListener('click', () => profile.open());
A.onChange(render);
render();
if (document.fonts) document.fonts.ready.then(render);

Casino.profile = profile;
Casino.cardBacks = { list: BACKS, draw: drawBack };
})();
