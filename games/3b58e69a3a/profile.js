// Your character: name, avatar, colour and card back. Saved in this browser and editable from
// the lobby, the top bar, or the pencil on your seat at the poker table.
(() => {
'use strict';

const { $, $$, store, sound, rand } = Casino;

const AVATARS = ['😎', '🤠', '🥳', '🤓', '😈', '🤖', '👽', '👻', '🎃', '💀', '🧛', '🧙', '🥷', '🧑‍🚀', '🦸', '🧜', '🐱', '🐶', '🦁', '🐸', '🐙', '🦄', '🐲', '🦈'];
const COLORS = [
  { id: 'gold', name: 'Gold', hex: '#f5c84c' },
  { id: 'ruby', name: 'Ruby', hex: '#ef4f5a' },
  { id: 'ember', name: 'Ember', hex: '#ff8a3d' },
  { id: 'emerald', name: 'Emerald', hex: '#34d399' },
  { id: 'ice', name: 'Ice', hex: '#67e8f9' },
  { id: 'sapphire', name: 'Sapphire', hex: '#4f9bff' },
  { id: 'amethyst', name: 'Amethyst', hex: '#b07cff' },
  { id: 'rose', name: 'Rose', hex: '#ff7ab6' },
];
const BACKS = [
  { id: 'classic', name: 'Classic', from: '#b8202f', to: '#6a0d18', trim: '#f5c84c', pattern: 'lattice' },
  { id: 'royal', name: 'Royal', from: '#2f63e0', to: '#0f2266', trim: '#f5c84c', pattern: 'lattice' },
  { id: 'midnight', name: 'Midnight', from: '#34343e', to: '#0a0a0e', trim: '#f5c84c', pattern: 'diamonds' },
  { id: 'jade', name: 'Jade', from: '#1a9a5c', to: '#063a22', trim: '#ffe9a8', pattern: 'diamonds' },
  { id: 'velvet', name: 'Velvet', from: '#8a3bd1', to: '#2d0b52', trim: '#ffd27a', pattern: 'rays' },
  { id: 'sunset', name: 'Sunset', from: '#ff9b42', to: '#b0225a', trim: '#fff2d0', pattern: 'rays' },
];
const NAMES = ['Ace', 'Lucky', 'Maverick', 'Jinx', 'Dice', 'Blaze', 'Nova', 'Ziggy', 'Pixel', 'Duke', 'Rogue', 'Sunny', 'Shadow', 'Comet'];
const MAX_NAME = 12;

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

// ---------- Saved character ----------
const saved = store.get('casino.profile', {}) || {};
const data = {
  name: typeof saved.name === 'string' ? saved.name.slice(0, MAX_NAME) : '',
  avatar: AVATARS.includes(saved.avatar) ? saved.avatar : AVATARS[0],
  color: COLORS.some((c) => c.id === saved.color) ? saved.color : 'gold',
  back: BACKS.some((b) => b.id === saved.back) ? saved.back : 'classic',
};
const listeners = new Set();

const profile = {
  get name() { return data.name.trim() || 'You'; },
  get avatar() { return data.avatar; },
  get color() { return COLORS.find((c) => c.id === data.color).hex; },
  get back() { return data.back; },
  set(patch) {
    Object.assign(data, patch);
    store.set('casino.profile', data);
    render();
    for (const fn of listeners) fn(profile);
  },
  onChange(fn) { listeners.add(fn); },
  open,
  close,
  isOpen: () => !modal.hidden,
};

// ---------- Everywhere your character shows ----------
const modal = $('#profile-modal');
const el = {
  topAvatar: $('#profile-btn .pf-avatar'),
  topName: $('#profile-btn .pf-name'),
  cardAvatar: $('#player-card .pc-avatar'),
  cardName: $('#player-card .pc-name'),
  cardBack: $('#player-card .pc-back'),
  bigAvatar: $('#pf-big-avatar'),
  plateAvatar: $('#pf-plate .avatar'),
  plateName: $('#pf-plate .nm'),
  name: $('#pf-name'),
  avatars: $('#pf-avatars'),
  colors: $('#pf-colors'),
  backs: $('#pf-backs'),
  previewCards: $$('#pf-cards canvas'),
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
  el.topAvatar.textContent = data.avatar;
  el.topName.textContent = profile.name;
  el.cardAvatar.textContent = data.avatar;
  el.cardName.textContent = profile.name;
  el.bigAvatar.textContent = data.avatar;
  el.plateAvatar.textContent = data.avatar;
  el.plateName.textContent = profile.name;
  paintBack(el.cardBack, data.back);
  if (!modal.hidden) {
    el.previewCards.forEach((c) => paintBack(c, data.back));
    $$('button', el.avatars).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === data.avatar)));
    $$('button', el.colors).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === data.color)));
    $$('button', el.backs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === data.back)));
  }
}

// ---------- Editor ----------
function buildEditor() {
  for (const a of AVATARS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = a;
    b.textContent = a;
    b.setAttribute('aria-label', `Avatar ${a}`);
    b.addEventListener('click', () => { sound.click(); profile.set({ avatar: a }); pop(el.bigAvatar); });
    el.avatars.append(b);
  }
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = c.id;
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.style.setProperty('--swatch', c.hex);
    b.addEventListener('click', () => { sound.click(); profile.set({ color: c.id }); pop(el.bigAvatar); });
    el.colors.append(b);
  }
  for (const d of BACKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = d.id;
    b.innerHTML = `<canvas data-w="52"></canvas><span>${d.name}</span>`;
    b.addEventListener('click', () => { sound.flip(); profile.set({ back: d.id }); el.previewCards.forEach(pop); });
    el.backs.append(b);
  }
  el.name.maxLength = MAX_NAME;
  el.name.addEventListener('input', () => profile.set({ name: el.name.value.slice(0, MAX_NAME) }));
  $('#pf-random').addEventListener('click', () => {
    sound.shuffle();
    const pick = (list) => list[Math.floor(rand(0, list.length))];
    profile.set({ name: pick(NAMES), avatar: pick(AVATARS), color: pick(COLORS).id, back: pick(BACKS).id });
    el.name.value = data.name;
    pop(el.bigAvatar);
    el.previewCards.forEach(pop);
  });
  $('#profile-done').addEventListener('click', close);
  $('#profile-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  // While the editor is open, keys belong to it, not to the table behind.
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    e.stopPropagation();
  }, true);
  for (const b of [$('#profile-btn'), $('#player-card')]) b.addEventListener('click', open);
}

function pop(node) {
  node.classList.remove('pop');
  void node.offsetWidth;
  node.classList.add('pop');
}

let opener = null;
function open() {
  opener = document.activeElement;
  modal.hidden = false;
  el.name.value = data.name;
  $$('canvas', el.backs).forEach((c) => paintBack(c, c.closest('button').dataset.id));
  render();
  sound.click();
  $('.profile-panel', modal).focus();
}

function close() {
  if (modal.hidden) return;
  modal.hidden = true;
  if (opener && opener.focus) opener.focus();
}

buildEditor();
render();
if (document.fonts) document.fonts.ready.then(render);

Casino.profile = profile;
Casino.cardBacks = { list: BACKS, draw: drawBack };
})();
