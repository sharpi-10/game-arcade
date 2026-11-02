// The arcade-wide player, shared by every page: a character built from parts, arcade tickets,
// quests and the prize counter. Each game adds its own prizes, quests and ticket payouts with
// Arcade.register() in its rewards.js, so this file never names a game.
(() => {
'use strict';

const KEY = 'arcade.player';
const CATALOG_KEY = 'arcade.catalog';
const WELCOME_TICKETS = 100;
const MAX_NAME = 14;

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Mix a #rrggbb colour toward black (amt < 0) or white (amt > 0).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (c) => Math.round((t - c) * p + c);
  const r = mix(n >> 16);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ---------- Character art ----------
// Everything is drawn on a 200 x 200 grid: head centred at (100, 96), shoulders from y = 152.
const SKINS = { porcelain: '#ffdcc6', peach: '#f4c29a', honey: '#e0a874', caramel: '#c4875a', cocoa: '#8d5a3b', espresso: '#5e3b26', alien: '#7fdc8c', gold: '#f4c542' };
const HAIR_COLORS = { black: '#2a2420', brown: '#6b4426', blonde: '#e8c26a', ginger: '#c95a2b', silver: '#c9ccd3', pink: '#ff6fb5', blue: '#4f9bff', green: '#3ddc84', purple: '#9b6bff' };
const COLORS = { sapphire: '#4f9bff', ruby: '#ef4f5a', emerald: '#34d399', gold: '#f5c84c', amethyst: '#b07cff', ember: '#ff8a3d', ice: '#67e8f9', rose: '#ff7ab6' };
const INK = '#23202a';
const MOUTH_INK = '#3b1f23';

const line = (d, color = INK, w = 4) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const star = (cx, cy, r, fill, stroke) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
};
const heart = (cx, cy, s, fill) => `<path d="M${cx} ${cy + 6 * s} C${cx - 12 * s} ${cy - 2 * s} ${cx - 8 * s} ${cy - 11 * s} ${cx} ${cy - 5 * s} C${cx + 8 * s} ${cy - 11 * s} ${cx + 12 * s} ${cy - 2 * s} ${cx} ${cy + 6 * s} Z" fill="${fill}"/>`;

const HAIR = {
  bald: {},
  buzz: { front: (c) => `<path d="M57 92 C57 60 76 46 100 46 C124 46 143 60 143 92 C134 74 118 66 100 66 C82 66 66 74 57 92 Z" fill="${c}" opacity=".85"/>` },
  short: { front: (c) => `<path d="M54 98 C50 58 74 40 100 40 C128 40 152 58 146 98 C142 84 136 76 126 72 C118 82 96 84 74 74 C66 80 58 88 54 98 Z" fill="${c}"/>` },
  spiky: { front: (c) => `<path d="M55 94 L56 62 L67 69 L70 44 L84 57 L92 32 L102 52 L113 32 L119 55 L131 44 L133 68 L144 62 L145 94 C137 77 121 68 100 68 C79 68 63 77 55 94 Z" fill="${c}"/>` },
  curly: {
    front: (c) => {
      let out = `<path d="M54 96 C52 60 74 44 100 44 C126 44 148 60 146 96 C138 80 122 70 100 70 C78 70 62 80 54 96 Z" fill="${c}"/>`;
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1.08 + (i / 8) * 0.84);
        out += `<circle cx="${(100 + Math.cos(a) * 44).toFixed(1)}" cy="${(92 + Math.sin(a) * 46).toFixed(1)}" r="13" fill="${c}"/>`;
      }
      return out;
    },
  },
  long: {
    back: (c) => `<path d="M48 102 C44 56 72 38 100 38 C128 38 156 56 152 102 L158 170 C134 178 66 178 42 170 Z" fill="${shade(c, -0.12)}"/>`,
    front: (c) => `<path d="M54 102 C50 56 76 38 104 40 C130 42 150 60 146 102 C141 80 128 64 106 62 C92 76 72 84 54 102 Z" fill="${c}"/>`,
  },
  bun: {
    back: (c) => `<circle cx="100" cy="38" r="18" fill="${shade(c, -0.1)}"/>`,
    front: (c) => `<path d="M54 98 C50 60 74 44 100 44 C126 44 150 60 146 98 C138 80 122 70 100 70 C78 70 62 80 54 98 Z" fill="${c}"/>`,
  },
  mohawk: {
    front: (c) => `<path d="M60 90 C60 70 70 60 80 56 L80 70 C70 74 64 82 60 90 Z M140 90 C140 70 130 60 120 56 L120 70 C130 74 136 82 140 90 Z" fill="${c}" opacity=".55"/>
      <path d="M88 76 L85 40 L94 47 L96 20 L104 40 L110 24 L112 48 L114 76 C106 72 96 72 88 76 Z" fill="${c}"/>`,
  },
};
// Hats that cover the top of the head: only a little hair shows at the sides.
const COVERING = new Set(['cap', 'beanie', 'cowboy', 'helmet', 'tophat']);
const sideburns = (c) => `<path d="M56 100 C55 88 58 80 64 76 L66 102 Z M144 100 C145 88 142 80 136 76 L134 102 Z" fill="${c}"/>`;

const EYES = {
  normal: () => [82, 118].map((x) => `<ellipse cx="${x}" cy="100" rx="5.5" ry="7" fill="${INK}"/><circle cx="${x + 2}" cy="97" r="2" fill="#fff"/>`).join(''),
  happy: () => line('M75 102 Q82 93 89 102') + line('M111 102 Q118 93 125 102'),
  wink: () => `<ellipse cx="82" cy="100" rx="5.5" ry="7" fill="${INK}"/><circle cx="84" cy="97" r="2" fill="#fff"/>${line('M111 101 Q118 94 125 101')}`,
  sleepy: () => [82, 118].map((x) => `<path d="M${x - 6} 99 a6 5.5 0 0 0 12 0 Z" fill="${INK}"/>${line(`M${x - 8} 98 L${x + 8} 98`, INK, 3)}`).join(''),
  angry: () => EYES.normal() + line('M73 88 L90 93') + line('M127 88 L110 93'),
  star: () => star(82, 100, 10, '#ffd23f', '#c98a00') + star(118, 100, 10, '#ffd23f', '#c98a00'),
  hearts: () => heart(82, 100, 1, '#ff4f7a') + heart(118, 100, 1, '#ff4f7a'),
};

const MOUTHS = {
  smile: () => line('M88 121 Q100 131 112 121'),
  grin: () => `<path d="M86 118 Q100 138 114 118 Z" fill="${MOUTH_INK}"/><path d="M89 119 L111 119 L109.5 123 L90.5 123 Z" fill="#fff"/>`,
  smirk: () => line('M90 125 Q103 128 113 118'),
  o: () => `<ellipse cx="100" cy="124" rx="5" ry="6" fill="${MOUTH_INK}"/>`,
  tongue: () => `${line('M89 121 Q100 129 111 121')}<path d="M95 125 Q100 137 105 125 Z" fill="#ff6f91"/>`,
};

const GLASSES = {
  none: () => '',
  round: () => `<circle cx="82" cy="100" r="13" fill="rgba(255,255,255,.18)" stroke="#2a2d3a" stroke-width="3.5"/><circle cx="118" cy="100" r="13" fill="rgba(255,255,255,.18)" stroke="#2a2d3a" stroke-width="3.5"/>${line('M95 99 Q100 95 105 99', '#2a2d3a', 3.5)}${line('M69 98 L58 96', '#2a2d3a', 3)}${line('M131 98 L142 96', '#2a2d3a', 3)}`,
  shades: () => `<path d="M64 91 L97 91 L95 105 C93 112 72 112 68 105 Z" fill="#15161c"/><path d="M103 91 L136 91 L132 105 C128 112 107 112 105 105 Z" fill="#15161c"/>${line('M97 93 L103 93', '#15161c', 4)}${line('M70 95 L78 95', 'rgba(255,255,255,.45)', 2.5)}${line('M109 95 L117 95', 'rgba(255,255,255,.45)', 2.5)}`,
  star: () => star(82, 100, 17, 'rgba(255,95,168,.35)', '#ff5fa8') + star(118, 100, 17, 'rgba(255,95,168,.35)', '#ff5fa8'),
  visor: () => `<rect x="58" y="88" width="84" height="22" rx="11" fill="#45d4ff" opacity=".78"/>${line('M68 94 L92 94', 'rgba(255,255,255,.7)', 3)}`,
};

const HATS = {
  none: () => '',
  cap: (a) => `<path d="M52 84 C50 42 150 42 148 84 Z" fill="${a}"/><path d="M48 82 C80 72 140 72 178 90 C152 96 90 94 48 88 Z" fill="${shade(a, -0.3)}"/><circle cx="100" cy="46" r="4" fill="${shade(a, -0.3)}"/>`,
  beanie: (a) => `<path d="M54 86 C52 36 148 36 146 86 Z" fill="${a}"/>${[70, 85, 100, 115, 130].map((x) => line(`M${x} 48 L${x} 80`, shade(a, -0.18), 3)).join('')}<rect x="50" y="76" width="100" height="18" rx="9" fill="${shade(a, -0.3)}"/><circle cx="100" cy="35" r="11" fill="#f4f1ea"/>`,
  headphones: (a) => `${line('M50 100 C50 34 150 34 150 100', '#2a2d3a', 9)}<rect x="40" y="86" width="20" height="32" rx="9" fill="${a}"/><rect x="140" y="86" width="20" height="32" rx="9" fill="${a}"/>`,
  cowboy: () => `<path d="M66 66 C64 28 82 22 100 34 C118 22 136 28 134 66 Z" fill="#a0632e"/><rect x="66" y="55" width="68" height="9" fill="#5a3214"/><ellipse cx="100" cy="68" rx="72" ry="12" fill="#8b5426"/>`,
  party: () => `<path d="M100 4 L127 66 L73 66 Z" fill="#ff5fa8"/><path d="M92 22 L108 22 L112 32 L88 32 Z M84 42 L116 42 L120 52 L80 52 Z" fill="#ffd23f"/><circle cx="100" cy="6" r="8" fill="#45d4ff"/>`,
  helmet: (a) => `<path d="M48 108 C42 44 158 44 152 108 C150 113 145 114 142 110 L142 92 C120 84 80 84 58 92 L58 110 C55 114 50 113 48 108 Z" fill="${a}"/><path d="M94 46 L106 46 L106 86 L94 86 Z" fill="#fff" opacity=".85"/><path d="M58 92 C80 84 120 84 142 92 L142 78 C120 68 80 68 58 78 Z" fill="#1b1d26" opacity=".9"/>${line('M66 78 L84 74', 'rgba(255,255,255,.5)', 3)}`,
  tophat: (a) => `<rect x="72" y="8" width="56" height="50" rx="4" fill="#1d1f27"/><rect x="72" y="42" width="56" height="10" fill="${a}"/><ellipse cx="100" cy="58" rx="52" ry="9" fill="#15161c"/>`,
  crown: () => `<path d="M62 64 L67 24 L84 44 L100 14 L116 44 L133 24 L138 64 Z" fill="#ffcf3f" stroke="#c98a00" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="50" r="6" fill="#ef4f5a"/><circle cx="78" cy="54" r="4.5" fill="#4f9bff"/><circle cx="122" cy="54" r="4.5" fill="#34d399"/>`,
};

const BODY = 'M28 200 C28 168 60 152 100 152 C140 152 172 168 172 200 Z';
const OUTFITS = {
  tee: { body: (a) => `<path d="${BODY}" fill="${a}"/>`, front: (a) => line('M84 152 C88 164 112 164 116 152', shade(a, -0.3), 5) },
  hoodie: {
    body: (a) => `<path d="${BODY}" fill="${shade(a, -0.25)}"/><path d="M66 160 C66 140 134 140 134 160 C122 152 78 152 66 160 Z" fill="${shade(a, -0.4)}"/>`,
    front: () => `${line('M92 160 L90 184', '#f4f1ea', 3)}${line('M108 160 L110 184', '#f4f1ea', 3)}<circle cx="90" cy="186" r="3" fill="#f4f1ea"/><circle cx="110" cy="186" r="3" fill="#f4f1ea"/>`,
  },
  jersey: {
    body: (a) => `<path d="${BODY}" fill="#f4f4f6"/><path d="M28 200 C28 176 40 162 58 156 L64 200 Z M172 200 C172 176 160 162 142 156 L136 200 Z" fill="${a}"/>`,
    front: (a) => `${line('M86 152 L100 166 L114 152', a, 5)}<text x="100" y="194" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="${a}">07</text>`,
  },
  hawaiian: {
    body: () => `<path d="${BODY}" fill="#1fb3a6"/>${[[50, 182, '#ffd23f'], [76, 170, '#ff6f91'], [128, 176, '#ffd23f'], [152, 186, '#ff6f91'], [110, 192, '#fff']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/><circle cx="${x}" cy="${y}" r="2.5" fill="#c95a2b"/>`).join('')}`,
    front: () => `<path d="M84 152 L100 176 L116 152 L108 152 L100 164 L92 152 Z" fill="#f4f1ea"/>`,
  },
  racing: {
    body: () => `<path d="${BODY}" fill="#e53935"/><path d="M78 154 L88 200 L76 200 L68 157 Z M122 154 L112 200 L124 200 L132 157 Z" fill="#fff"/>`,
    front: () => `<path d="M84 152 C88 160 112 160 116 152 L116 158 C110 164 90 164 84 158 Z" fill="#15161c"/><rect x="128" y="172" width="18" height="12" rx="2" fill="#ffd23f"/>`,
  },
  tux: {
    body: () => `<path d="${BODY}" fill="#1d1f27"/>`,
    front: () => `<path d="M84 152 L100 196 L116 152 Z" fill="#f4f4f6"/><path d="M84 152 L96 186 L74 160 Z M116 152 L104 186 L126 160 Z" fill="#2c2f3a"/><path d="M88 158 L100 163 L88 168 Z M112 158 L100 163 L112 168 Z" fill="#ef4f5a"/><circle cx="100" cy="163" r="3.5" fill="#c4303a"/>`,
  },
};

// The character as SVG markup. `crop: 'head'` frames just the head and hat.
function characterSvg(look, { bg = true, crop = 'bust' } = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const skin = SKINS[L.skin] || SKINS.peach;
  const hair = HAIR_COLORS[L.hairColor] || HAIR_COLORS.brown;
  const accent = COLORS[L.color] || COLORS.sapphire;
  const hairStyle = HAIR[L.hair] || HAIR.short;
  const outfit = OUTFITS[L.outfit] || OUTFITS.tee;
  const parts = [];
  if (bg) parts.push(`<circle cx="100" cy="100" r="100" fill="${shade(accent, -0.62)}"/><circle cx="100" cy="100" r="84" fill="${shade(accent, -0.42)}"/>`);
  if (hairStyle.back) parts.push(hairStyle.back(hair));
  parts.push(outfit.body(accent));
  parts.push(`<rect x="86" y="126" width="28" height="30" rx="8" fill="${shade(skin, -0.16)}"/>`);
  if (outfit.front) parts.push(outfit.front(accent));
  parts.push(`<circle cx="56" cy="102" r="10" fill="${skin}"/><circle cx="144" cy="102" r="10" fill="${skin}"/><ellipse cx="100" cy="96" rx="44" ry="48" fill="${skin}"/>`);
  parts.push('<circle cx="72" cy="116" r="7" fill="#ff7a7a" opacity=".22"/><circle cx="128" cy="116" r="7" fill="#ff7a7a" opacity=".22"/>');
  parts.push((EYES[L.eyes] || EYES.normal)(), (MOUTHS[L.mouth] || MOUTHS.smile)());
  if (COVERING.has(L.hat)) parts.push(sideburns(hair));
  else if (hairStyle.front) parts.push(hairStyle.front(hair));
  parts.push((GLASSES[L.glasses] || GLASSES.none)());
  parts.push((HATS[L.hat] || HATS.none)(accent));
  const box = crop === 'head' ? '22 0 156 156' : '0 0 200 200';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" aria-hidden="true">${parts.join('')}</svg>`;
}

// ---------- Prizes ----------
// Slots in the order the style screen shows them. Games add slots of their own.
const SLOTS = [
  { id: 'skin', name: 'Skin', kind: 'swatch' },
  { id: 'hair', name: 'Hair', kind: 'head' },
  { id: 'hairColor', name: 'Hair color', kind: 'swatch' },
  { id: 'eyes', name: 'Eyes', kind: 'head' },
  { id: 'mouth', name: 'Mouth', kind: 'head' },
  { id: 'glasses', name: 'Glasses', kind: 'head' },
  { id: 'hat', name: 'Hat', kind: 'head' },
  { id: 'outfit', name: 'Outfit', kind: 'bust' },
  { id: 'color', name: 'Color', kind: 'swatch' },
  { id: 'title', name: 'Title', kind: 'text' },
];
const DEFAULT_LOOK = {
  skin: 'peach', hair: 'short', hairColor: 'brown', eyes: 'normal', mouth: 'smile',
  glasses: 'none', hat: 'none', outfit: 'tee', color: 'sapphire', title: 'rookie',
};
const named = (slot, ids, extra = {}) => ids.map((id) => ({ slot, id, name: id[0].toUpperCase() + id.slice(1), ...extra }));
// No price and no quest means free. `quest: true` items come only from quest rewards.
const CORE_ITEMS = [
  ...named('skin', ['porcelain', 'peach', 'honey', 'caramel', 'cocoa', 'espresso']),
  { slot: 'skin', id: 'alien', name: 'Alien', price: 300 },
  { slot: 'skin', id: 'gold', name: 'Solid gold', quest: true },
  { slot: 'hair', id: 'short', name: 'Short' },
  { slot: 'hair', id: 'buzz', name: 'Buzz cut' },
  ...named('hair', ['spiky', 'curly', 'long', 'bun']),
  { slot: 'hair', id: 'bald', name: 'None' },
  { slot: 'hair', id: 'mohawk', name: 'Mohawk', price: 150 },
  ...named('hairColor', ['black', 'brown', 'blonde', 'ginger', 'silver']),
  ...named('hairColor', ['pink', 'blue', 'green', 'purple'], { price: 100 }),
  ...named('eyes', ['normal', 'happy', 'wink', 'sleepy', 'angry']),
  { slot: 'eyes', id: 'star', name: 'Starry', price: 250 },
  { slot: 'eyes', id: 'hearts', name: 'Hearts', quest: true },
  ...named('mouth', ['smile', 'grin', 'smirk']),
  { slot: 'mouth', id: 'o', name: 'Surprised' },
  { slot: 'mouth', id: 'tongue', name: 'Cheeky', price: 120 },
  { slot: 'glasses', id: 'none', name: 'None' },
  { slot: 'glasses', id: 'round', name: 'Round' },
  { slot: 'glasses', id: 'shades', name: 'Shades', quest: true },
  { slot: 'glasses', id: 'star', name: 'Star shades', price: 250 },
  { slot: 'glasses', id: 'visor', name: 'Cyber visor', price: 200 },
  { slot: 'hat', id: 'none', name: 'None' },
  { slot: 'hat', id: 'cap', name: 'Cap', price: 80 },
  { slot: 'hat', id: 'beanie', name: 'Beanie', price: 120 },
  { slot: 'hat', id: 'headphones', name: 'Headphones', price: 200 },
  { slot: 'hat', id: 'cowboy', name: 'Cowboy hat', price: 250 },
  { slot: 'hat', id: 'party', name: 'Party hat', quest: true },
  { slot: 'hat', id: 'helmet', name: 'Racing helmet', quest: true },
  { slot: 'hat', id: 'tophat', name: 'Top hat', quest: true },
  { slot: 'hat', id: 'crown', name: 'Crown', price: 1000 },
  { slot: 'outfit', id: 'tee', name: 'T-shirt' },
  { slot: 'outfit', id: 'hoodie', name: 'Hoodie' },
  { slot: 'outfit', id: 'jersey', name: 'Jersey', price: 150 },
  { slot: 'outfit', id: 'hawaiian', name: 'Beach shirt', price: 200 },
  { slot: 'outfit', id: 'racing', name: 'Racing suit', quest: true },
  { slot: 'outfit', id: 'tux', name: 'Tuxedo', quest: true },
  ...named('color', ['sapphire', 'ruby', 'emerald', 'gold', 'amethyst']),
  ...named('color', ['ember', 'ice', 'rose'], { price: 100 }),
  { slot: 'title', id: 'rookie', name: 'Rookie' },
  { slot: 'title', id: 'collector', name: 'Collector', quest: true },
];
const SWATCHES = { skin: SKINS, hairColor: HAIR_COLORS, color: COLORS };

const CORE_QUESTS = [
  { id: 'gen.style', title: 'Fresh look', desc: 'Change anything about your character.', goal: 1, on: 'look', reward: { tickets: 50 } },
  { id: 'gen.shop', title: 'First prize', desc: 'Buy something at the prize counter.', goal: 1, on: 'buy', reward: { items: ['hat:party'] } },
  { id: 'gen.collector', title: 'Collector', desc: 'Own 8 prizes from the counter or quests.', goal: 8, on: 'own', mode: 'max', value: (d) => d.count, reward: { tickets: 100, items: ['title:collector', 'eyes:hearts'] } },
  { id: 'gen.tickets', title: 'Ticket hoarder', desc: 'Earn 1,000 tickets in total.', goal: 1000, on: 'earn', mode: 'max', value: (d) => d.total, reward: { items: ['skin:gold'] } },
];

const games = new Map(); // id -> { title, slots, items, quests, payouts }, registered on this page
const cached = store.get(CATALOG_KEY, {}) || {}; // display copies of games registered on other pages

function allSlots() {
  const out = [...SLOTS];
  for (const g of gameCatalogs()) for (const s of g.slots || []) if (!out.some((o) => o.id === s.id)) out.push({ kind: 'swatch', ...s, game: g.id });
  return out;
}
function gameCatalogs() {
  const out = new Map(Object.entries(cached).map(([id, g]) => [id, { id, ...g }]));
  for (const [id, g] of games) out.set(id, { id, ...g });
  return [...out.values()];
}
function allItems() {
  return [...CORE_ITEMS, ...gameCatalogs().flatMap((g) => g.items || [])];
}
function allQuests() {
  return [
    ...CORE_QUESTS.map((q) => ({ ...q, game: 'General' })),
    ...gameCatalogs().flatMap((g) => (g.quests || []).map((q) => ({ ...q, game: g.title }))),
  ];
}
const itemKey = (slot, id) => `${slot}:${id}`;
const findItem = (slot, id) => allItems().find((i) => i.slot === slot && i.id === id);
const isFree = (i) => !i.price && !i.quest;
// Which quest hands out an item, for "how do I get this?" hints.
function questFor(key) {
  return allQuests().find((q) => (q.reward.items || []).includes(key));
}

// ---------- Saved player ----------
const saved = store.get(KEY, null);
const state = saved && typeof saved === 'object' ? saved : { tickets: WELCOME_TICKETS, earned: 0, owned: [], quests: {}, name: '', look: {} };
state.look = { ...DEFAULT_LOOK, ...state.look };
state.owned = Array.isArray(state.owned) ? state.owned : [];
state.quests = state.quests || {};
const listeners = new Set();

function save() { store.set(KEY, state); }
function emit() { for (const fn of listeners) fn(player); }

const player = {
  get name() { return state.name.trim() || 'Player 1'; },
  get look() { return { ...state.look }; },
  get tickets() { return state.tickets; },
  get color() { return COLORS[state.look.color] || COLORS.sapphire; },
  get title() { const t = findItem('title', state.look.title); return t ? t.name : 'Rookie'; },
};

function owns(slot, id) {
  const item = findItem(slot, id);
  return state.owned.includes(itemKey(slot, id)) || (item ? isFree(item) : false);
}
const ownedPrizes = () => state.owned.filter((k) => { const [s, id] = k.split(':'); const i = findItem(s, id); return i && !isFree(i); }).length;

function setLook(patch, { quiet = false } = {}) {
  let changed = false;
  for (const [slot, id] of Object.entries(patch)) {
    if (state.look[slot] === id) continue;
    if (findItem(slot, id) && !owns(slot, id)) continue; // only prizes you have

    state.look[slot] = id;
    changed = true;
  }
  if (!changed) return;
  save();
  if (!quiet) record('look', patch);
  emit();
}

function setName(name) {
  state.name = String(name).slice(0, MAX_NAME);
  save();
  emit();
}

function grant(key, { quiet = false } = {}) {
  if (state.owned.includes(key)) return false;
  state.owned.push(key);
  save();
  if (!quiet) record('own', { count: ownedPrizes() });
  return true;
}

function addTickets(n, reason = '') {
  n = Math.round(n);
  if (n <= 0) return;
  state.tickets += n;
  state.earned += n;
  save();
  toast(`${TICKET}<b>+${fmt(n)}</b>${reason ? `<span>${esc(reason)}</span>` : ''}`, 'tix');
  record('earn', { total: state.earned });
  emit();
}

function buy(slot, id) {
  const item = findItem(slot, id);
  if (!item || !item.price || owns(slot, id) || state.tickets < item.price) return false;
  state.tickets -= item.price;
  grant(itemKey(slot, id), { quiet: true });
  state.look[slot] = id;
  save();
  sound('buy');
  toast(`<b>${esc(item.name)}</b><span>is yours. Looking good!</span>`, 'buy');
  record('buy', { slot, id });
  record('own', { count: ownedPrizes() });
  emit();
  return true;
}

// ---------- Quests and payouts ----------
// Games call record() when something happens ("race", "bj.hand", ...). That pays out tickets
// (from the game's payouts) and moves matching quests along.
function record(type, data = {}) {
  for (const g of games.values()) {
    const pay = g.payouts && g.payouts[type];
    if (!pay) continue;
    const out = pay(data);
    if (out && out.tickets) addTickets(out.tickets, out.reason);
  }
  const live = [...CORE_QUESTS, ...[...games.values()].flatMap((g) => g.quests || [])];
  for (const q of live) {
    if (q.on !== type) continue;
    const st = state.quests[q.id] || (state.quests[q.id] = { n: 0 });
    if (st.done) continue;
    if (q.when && !q.when(data)) continue;
    const v = q.value ? q.value(data) : 1;
    st.n = q.mode === 'max' ? Math.max(st.n, v) : st.n + v;
    if (st.n >= q.goal) complete(q);
  }
  save();
}

function complete(q) {
  const st = state.quests[q.id];
  st.done = true;
  st.n = q.goal;
  save();
  const names = [];
  for (const key of q.reward.items || []) {
    grant(key, { quiet: true });
    const [slot, id] = key.split(':');
    const item = findItem(slot, id);
    if (item) names.push(item.name);
  }
  sound('quest');
  toast(`<em>Quest complete</em><b>${esc(q.title)}</b>${names.length ? `<span>Unlocked ${esc(names.join(', '))}</span>` : ''}`, 'quest', 4200);
  if (q.reward.tickets) addTickets(q.reward.tickets, q.title);
  if ((q.reward.items || []).length) record('own', { count: ownedPrizes() });
  emit();
}

// A game adds its prize slots, prizes, quests and ticket payouts. Display copies are cached so
// the character screen on other pages can list them too.
function register(def) {
  const { id, ...rest } = def;
  games.set(id, rest);
  cached[id] = {
    title: rest.title,
    slots: rest.slots || [],
    items: rest.items || [],
    quests: (rest.quests || []).map(({ id: qid, title, desc, goal, reward }) => ({ id: qid, title, desc, goal, reward })),
  };
  store.set(CATALOG_KEY, cached);
  for (const s of rest.slots || []) if (!(s.id in state.look)) state.look[s.id] = s.default;
  if (overlay && !overlay.hidden) renderScreen();
  emit();
}

// ---------- Codes ----------
// Some games keep part of themselves behind a code. The home page records the folder of every
// game a code has opened in this browser ('games/abc/'), and a game checks its own folder.
const UNLOCKED_KEY = 'arcade.unlocked';
const unlockedDirs = () => store.get(UNLOCKED_KEY, []) || [];

// ---------- Sound ----------
let audio = null;
function sound(kind) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'quest' ? [523, 659, 784, 1047] : [659, 988];
    notes.forEach((f, i) => {
      const t = audio.currentTime + i * 0.09;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch { /* no audio */ }
}

// ---------- Look and feel ----------
const TICKET = '<svg class="arc-ticket" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Z" fill="#ff5fa8"/><path d="M15 6v12" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 2"/></svg>';

const CSS = `
.arc-ticket { width: 1.15em; height: 1.15em; flex: none; vertical-align: -0.2em; }
.arc-toasts { position: fixed; z-index: 2147483000; top: calc(env(safe-area-inset-top, 0px) + 66px); left: 50%; translate: -50% 0; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.arc-toast { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; font: 600 14px Rubik, system-ui, sans-serif; color: #eef0ff; background: rgba(18, 20, 44, .94); border: 1px solid rgba(155, 107, 255, .55); box-shadow: 0 10px 30px rgba(0, 0, 0, .45); animation: arc-in .35s cubic-bezier(.2, .8, .2, 1.4); white-space: nowrap; }
.arc-toast b { font-weight: 800; }
.arc-toast span { color: #a3a9cf; }
.arc-toast em { font: 400 11px Bungee, Rubik, sans-serif; letter-spacing: .08em; font-style: normal; color: #45d4ff; }
.arc-toast.quest { flex-direction: column; gap: 2px; border-radius: 18px; padding: 12px 22px; border-color: #45d4ff; box-shadow: 0 0 0 3px rgba(69, 212, 255, .18), 0 0 40px rgba(69, 212, 255, .35), 0 10px 30px rgba(0, 0, 0, .45); }
.arc-toast.quest b { font: 400 18px Bungee, Rubik, sans-serif; }
.arc-toast.out { animation: arc-out .3s forwards; }
@keyframes arc-in { from { opacity: 0; transform: translateY(-14px) scale(.9); } }
@keyframes arc-out { to { opacity: 0; transform: translateY(-10px); } }

.arc-overlay { position: fixed; inset: 0; z-index: 2147482000; display: grid; place-items: center; padding: 12px; background: rgba(6, 7, 20, .72); backdrop-filter: blur(6px); font-family: Rubik, system-ui, sans-serif; color: #eef0ff; }
.arc-overlay[hidden] { display: none; }
.arc-overlay *, .arc-overlay *::before, .arc-overlay *::after { box-sizing: border-box; }
.arc-overlay button { font: inherit; color: inherit; }
.arc-panel { width: min(980px, 100%); height: min(720px, 100%); display: flex; flex-direction: column; overflow: hidden; border-radius: 24px; background: linear-gradient(180deg, #161a3a, #0e1029); border: 1px solid rgba(155, 107, 255, .45); box-shadow: 0 30px 80px rgba(0, 0, 0, .6), 0 0 60px rgba(155, 107, 255, .18); animation: arc-pop .35s cubic-bezier(.2, .8, .2, 1.2); outline: none; }
@keyframes arc-pop { from { opacity: 0; transform: scale(.94) translateY(16px); } }
.arc-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 12px 24px; border-bottom: 1px solid rgba(255, 255, 255, .08); }
.arc-head h2 { flex: 1; margin: 0; font: 400 22px Bungee, Rubik, sans-serif; letter-spacing: .04em; color: #45d4ff; text-shadow: 0 0 14px rgba(69, 212, 255, .5); }
.arc-tix { display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 999px; background: rgba(255, 95, 168, .12); border: 1px solid rgba(255, 95, 168, .45); font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.arc-x { width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .15); background: rgba(255, 255, 255, .06); cursor: pointer; font-size: 16px; }
.arc-x:hover { background: rgba(255, 255, 255, .14); }
.arc-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
.arc-side { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px 20px; border-right: 1px solid rgba(255, 255, 255, .08); background: radial-gradient(circle at 50% 30%, rgba(155, 107, 255, .2), transparent 70%); overflow-y: auto; }
.arc-big { width: 220px; height: 220px; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 4px var(--arc-accent), 0 0 40px var(--arc-accent), 0 16px 40px rgba(0, 0, 0, .5); transition: box-shadow .3s; }
.arc-big svg { width: 100%; height: 100%; display: block; }
.arc-big.pop { animation: arc-bounce .45s cubic-bezier(.2, .8, .2, 1.6); }
@keyframes arc-bounce { from { transform: scale(.88); } }
.arc-name { width: 100%; height: 46px; padding: 0 14px; border-radius: 12px; text-align: center; font: 400 18px Bungee, Rubik, sans-serif; letter-spacing: .04em; color: #eef0ff; background: rgba(0, 0, 0, .3); border: 1px solid rgba(255, 255, 255, .14); outline: none; }
.arc-name:focus { border-color: #45d4ff; box-shadow: 0 0 0 3px rgba(69, 212, 255, .2); }
.arc-title { font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #ff5fa8; }
.arc-shuffle { height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .16); background: rgba(255, 255, 255, .06); cursor: pointer; font-weight: 700; font-size: 13px; }
.arc-shuffle:hover { background: rgba(255, 255, 255, .14); }
.arc-hint { margin: auto 0 0; font-size: 12px; line-height: 1.45; color: #a3a9cf; text-align: center; }
.arc-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.arc-tabs { display: flex; gap: 6px; padding: 14px 20px 0; }
.arc-tab { position: relative; height: 40px; padding: 0 16px; border-radius: 12px 12px 0 0; border: 0; background: none; cursor: pointer; font: 400 14px Bungee, Rubik, sans-serif; letter-spacing: .03em; color: #a3a9cf; }
.arc-tab[aria-selected=true] { color: #0a0b1e; background: linear-gradient(90deg, #45d4ff, #9b6bff); }
.arc-badge { position: absolute; top: 2px; right: 2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: grid; place-items: center; font: 700 11px Rubik, sans-serif; color: #fff; background: #ff5fa8; }
.arc-pane { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; border-top: 1px solid rgba(155, 107, 255, .35); }
.arc-slots { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 12px; scrollbar-width: thin; }
.arc-slot { flex: none; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05); cursor: pointer; font-weight: 600; font-size: 13px; white-space: nowrap; }
.arc-slot[aria-pressed=true] { border-color: #45d4ff; color: #45d4ff; background: rgba(69, 212, 255, .1); }
.arc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.arc-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px 8px; border-radius: 14px; border: 2px solid transparent; background: rgba(255, 255, 255, .05); cursor: pointer; transition: transform .12s, background .15s, border-color .15s; }
.arc-tile:hover { background: rgba(255, 255, 255, .1); transform: translateY(-2px); }
.arc-tile[aria-pressed=true] { border-color: #45d4ff; background: rgba(69, 212, 255, .12); }
.arc-tile.picked { border-color: #ff5fa8; }
.arc-thumb { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; }
.arc-thumb svg { width: 100%; height: 100%; display: block; }
.arc-thumb.swatch { width: 48px; height: 48px; margin: 8px 0; box-shadow: inset 0 0 0 3px rgba(255, 255, 255, .25); }
.arc-thumb.swatch.card { width: 42px; height: 60px; margin: 2px 0; border-radius: 6px; box-shadow: inset 0 0 0 3px #f8f2e4, inset 0 0 0 5px rgba(245, 200, 76, .8), 0 4px 10px rgba(0, 0, 0, .4); }
.arc-reward .arc-thumb.swatch.card { width: 14px; height: 20px; border-radius: 3px; box-shadow: none; }
.arc-thumb.text { width: auto; height: 64px; border-radius: 0; font: 400 13px Bungee, Rubik, sans-serif; color: #ff5fa8; text-align: center; }
.arc-tile .nm { font-size: 12px; font-weight: 600; line-height: 1.2; text-align: center; color: #d6daf5; }
.arc-tile.locked .arc-thumb { filter: grayscale(.85) brightness(.55); }
.arc-lock { position: absolute; top: 6px; right: 6px; display: flex; align-items: center; gap: 3px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 11px; font-weight: 800; background: rgba(10, 11, 30, .85); color: #eef0ff; }
.arc-lock.quest { color: #45d4ff; }
.arc-detail { display: flex; align-items: center; gap: 14px; margin: 0 20px 16px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 95, 168, .1); border: 1px solid rgba(255, 95, 168, .4); }
.arc-detail[hidden] { display: none; }
.arc-detail .arc-thumb { width: 52px; height: 52px; flex: none; }
.arc-detail .arc-thumb.swatch { width: 44px; height: 44px; margin: 0; }
.arc-detail .txt { flex: 1; min-width: 0; font-size: 14px; line-height: 1.35; color: #a3a9cf; }
.arc-detail .txt b { display: block; color: #eef0ff; font-size: 15px; }
.arc-buy { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 42px; padding: 0 18px; border: 0; border-radius: 999px; cursor: pointer; font: 400 14px Bungee, Rubik, sans-serif; color: #0a0b1e; background: linear-gradient(90deg, #45d4ff, #9b6bff); box-shadow: 0 0 18px rgba(155, 107, 255, .45); }
.arc-buy:disabled { cursor: default; opacity: .45; box-shadow: none; }
.arc-buy.owned { background: rgba(255, 255, 255, .1); color: #a3a9cf; box-shadow: none; }
.arc-group { margin: 6px 0 12px; font: 400 13px Bungee, Rubik, sans-serif; letter-spacing: .06em; color: #9b6bff; }
.arc-group:first-child { margin-top: 0; }
.arc-shop { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
.arc-prize { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 10px 12px; border-radius: 16px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .08); }
.arc-prize .nm { font-weight: 700; font-size: 14px; text-align: center; }
.arc-prize .arc-buy { height: 36px; padding: 0 14px; font-size: 13px; }
.arc-quest { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 14px; margin-bottom: 10px; border-radius: 16px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .08); }
.arc-quest.done { opacity: .6; }
.arc-qicon { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font: 400 15px Bungee, Rubik, sans-serif; background: rgba(155, 107, 255, .2); color: #c9b4ff; }
.arc-quest.done .arc-qicon { background: #34d399; color: #062d1e; font-size: 20px; }
.arc-quest b { display: block; font-size: 15px; }
.arc-quest p { margin: 2px 0 8px; font-size: 13px; color: #a3a9cf; }
.arc-bar { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, .1); overflow: hidden; }
.arc-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #45d4ff, #9b6bff, #ff5fa8); }
.arc-qn { margin-top: 4px; font-size: 12px; color: #a3a9cf; font-variant-numeric: tabular-nums; }
.arc-rewards { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.arc-reward { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 4px; border-radius: 999px; background: rgba(255, 255, 255, .07); font-size: 12px; font-weight: 700; white-space: nowrap; }
.arc-reward.t { padding-left: 10px; }
.arc-reward .arc-thumb { width: 22px; height: 22px; }
.arc-reward .arc-thumb.swatch { width: 18px; height: 18px; margin: 0; }
.arc-reward .arc-thumb.text { height: 22px; font-size: 0; width: 0; }
.arc-empty { color: #a3a9cf; font-size: 14px; }
@media (max-width: 720px) {
  .arc-overlay { padding: 0; }
  .arc-panel { width: 100%; height: 100%; border-radius: 0; border: 0; }
  .arc-head { padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px 16px; }
  .arc-head h2 { font-size: 18px; }
  .arc-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .arc-side { display: grid; grid-template-columns: 96px minmax(0, 1fr); grid-template-rows: auto auto auto; column-gap: 14px; row-gap: 6px; align-items: center; padding: 12px 16px; border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, .08); overflow: visible; }
  .arc-big { grid-row: 1 / 4; width: 96px; height: 96px; box-shadow: 0 0 0 3px var(--arc-accent), 0 0 24px var(--arc-accent); }
  .arc-name { height: 40px; font-size: 16px; text-align: left; }
  .arc-title { text-align: left; }
  .arc-shuffle { justify-self: start; height: 32px; padding: 0 12px; font-size: 12px; }
  .arc-hint { display: none; }
  .arc-tabs { padding: 10px 12px 0; gap: 4px; }
  .arc-tab { flex: 1; padding: 0 6px; font-size: 12px; }
  .arc-pane { padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px)); }
  .arc-grid { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
  .arc-thumb { width: 54px; height: 54px; }
  .arc-detail { margin: 0 12px 12px; flex-wrap: wrap; }
  .arc-shop { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .arc-quest { grid-template-columns: 36px minmax(0, 1fr); }
  .arc-qicon { width: 36px; height: 36px; font-size: 13px; }
  .arc-rewards { grid-column: 2; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: flex-start; }
}
`;

function injectStyles() {
  if (document.getElementById('arc-styles')) return;
  const style = document.createElement('style');
  style.id = 'arc-styles';
  style.textContent = CSS;
  document.head.append(style);
  // The screen's lettering uses the arcade font; pages that don't load it get it here.
  if (![...document.querySelectorAll('link[href*="fonts.googleapis"]')].some((l) => l.href.includes('Bungee'))) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bungee&family=Rubik:wght@400;500;600;700;800&display=swap';
    document.head.append(link);
  }
}

// ---------- Toasts ----------
let toastHost = null;
function toast(html, kind = '', ms = 2600) {
  if (!document.body) return;
  injectStyles();
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'arc-toasts';
    toastHost.setAttribute('role', 'status');
    document.body.append(toastHost);
  }
  const t = document.createElement('div');
  t.className = `arc-toast ${kind}`;
  t.innerHTML = html;
  toastHost.append(t);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Character screen ----------
let overlay = null;
let tab = 'style';
let slot = 'hair';
let picked = null; // a locked item the player tapped, shown in the detail bar
let opener = null;

function thumb(item, s = allSlots().find((x) => x.id === item.slot)) {
  const kind = s ? s.kind : 'swatch';
  if (kind === 'text') return `<span class="arc-thumb text">${esc(item.name)}</span>`;
  if (kind === 'swatch') {
    const bg = item.swatch || (SWATCHES[item.slot] && SWATCHES[item.slot][item.id]) || '#888';
    return `<span class="arc-thumb swatch${s && s.shape === 'card' ? ' card' : ''}" style="background:${bg}"></span>`;
  }
  const look = { ...state.look, [item.slot]: item.id };
  // Show hats on bare heads so the hat is what you see.
  if (item.slot === 'hair') look.hat = 'none';
  return `<span class="arc-thumb">${characterSvg(look, { crop: kind === 'head' ? 'head' : 'bust' })}</span>`;
}

function howToGet(item) {
  if (item.price) return `${fmt(item.price)} tickets at the prize counter.`;
  const q = questFor(itemKey(item.slot, item.id));
  return q ? `Reward for the quest "${q.title}": ${q.desc}` : 'Reward from a quest.';
}

function lockBadge(item) {
  if (owns(item.slot, item.id)) return '';
  return item.price ? `<span class="arc-lock">${TICKET}${fmt(item.price)}</span>` : '<span class="arc-lock quest">QUEST</span>';
}

function renderStyle() {
  const slots = allSlots();
  if (!slots.some((s) => s.id === slot)) slot = 'hair';
  const items = allItems().filter((i) => i.slot === slot);
  return `
    <div class="arc-slots">${slots.map((s) => `<button class="arc-slot" data-slot="${s.id}" aria-pressed="${s.id === slot}">${esc(s.name)}</button>`).join('')}</div>
    <div class="arc-grid">${items.map((i) => {
      const locked = !owns(i.slot, i.id);
      const on = state.look[i.slot] === i.id;
      const isPicked = picked && picked.slot === i.slot && picked.id === i.id;
      return `<button class="arc-tile${locked ? ' locked' : ''}${isPicked ? ' picked' : ''}" data-item="${i.slot}:${i.id}" aria-pressed="${on}" title="${esc(i.name)}">${thumb(i)}<span class="nm">${esc(i.name)}</span>${lockBadge(i)}</button>`;
    }).join('')}</div>`;
}

function renderQuests() {
  const quests = allQuests();
  const groups = [...new Set(quests.map((q) => q.game))];
  return groups.map((g) => `
    <div class="arc-group">${esc(g)}</div>
    ${quests.filter((q) => q.game === g).sort((a, b) => Number(!!(state.quests[a.id] || {}).done) - Number(!!(state.quests[b.id] || {}).done)).map((q) => {
      const st = state.quests[q.id] || { n: 0 };
      const n = Math.min(st.n, q.goal);
      const rewards = [];
      if (q.reward.tickets) rewards.push(`<span class="arc-reward t">${TICKET}${fmt(q.reward.tickets)}</span>`);
      for (const key of q.reward.items || []) {
        const [s, id] = key.split(':');
        const item = findItem(s, id);
        if (item) rewards.push(`<span class="arc-reward">${thumb(item)}${esc(item.name)}</span>`);
      }
      return `<div class="arc-quest${st.done ? ' done' : ''}">
        <span class="arc-qicon">${st.done ? '✓' : `${Math.floor((n / q.goal) * 100)}%`}</span>
        <div><b>${esc(q.title)}</b><p>${esc(q.desc)}</p>
          <div class="arc-bar"><i style="width:${(n / q.goal) * 100}%"></i></div>
          <div class="arc-qn">${st.done ? 'Done' : `${fmt(n)} / ${fmt(q.goal)}`}</div></div>
        <div class="arc-rewards">${rewards.join('')}</div>
      </div>`;
    }).join('')}`).join('') + (gameCatalogs().length ? '' : '<p class="arc-empty">Unlock a game to get its quests.</p>');
}

function renderShop() {
  const slots = allSlots();
  const forSale = allItems().filter((i) => i.price);
  return slots.map((s) => {
    const items = forSale.filter((i) => i.slot === s.id).sort((a, b) => a.price - b.price);
    if (!items.length) return '';
    return `<div class="arc-group">${esc(s.name)}</div><div class="arc-shop">${items.map((i) => {
      const own = owns(i.slot, i.id);
      const short = i.price - state.tickets;
      const btn = own
        ? '<button class="arc-buy owned" disabled>Owned</button>'
        : `<button class="arc-buy" data-buy="${i.slot}:${i.id}" ${short > 0 ? 'disabled' : ''}>${TICKET}${fmt(i.price)}</button>`;
      return `<div class="arc-prize">${thumb(i, s)}<span class="nm">${esc(i.name)}</span>${btn}</div>`;
    }).join('')}</div>`;
  }).join('');
}

function renderDetail() {
  const bar = overlay.querySelector('.arc-detail');
  if (!picked || tab !== 'style' || owns(picked.slot, picked.id)) { bar.hidden = true; picked = null; return; }
  const item = findItem(picked.slot, picked.id);
  if (!item) { bar.hidden = true; return; }
  let action = '';
  if (item.price) {
    const short = item.price - state.tickets;
    action = short > 0
      ? `<button class="arc-buy" disabled>Need ${fmt(short)} more</button>`
      : `<button class="arc-buy" data-buy="${item.slot}:${item.id}">Buy ${TICKET}${fmt(item.price)}</button>`;
  }
  bar.innerHTML = `${thumb(item)}<div class="txt"><b>${esc(item.name)}</b>${esc(howToGet(item))}</div>${action}`;
  bar.hidden = false;
}

function renderScreen() {
  if (!overlay) return;
  overlay.style.setProperty('--arc-accent', player.color);
  overlay.querySelector('.arc-big').innerHTML = characterSvg(state.look);
  overlay.querySelector('.arc-title').textContent = player.title;
  overlay.querySelector('.arc-tix b').textContent = fmt(state.tickets);
  const name = overlay.querySelector('.arc-name');
  if (document.activeElement !== name) name.value = state.name;
  overlay.querySelectorAll('.arc-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  const active = allQuests().filter((q) => !(state.quests[q.id] || {}).done).length;
  overlay.querySelector('.arc-badge').textContent = active;
  overlay.querySelector('.arc-badge').hidden = !active;
  const pane = overlay.querySelector('.arc-pane');
  const scroll = pane.scrollTop;
  pane.innerHTML = tab === 'style' ? renderStyle() : tab === 'quests' ? renderQuests() : renderShop();
  pane.scrollTop = scroll;
  renderDetail();
}

function popBig() {
  const big = overlay.querySelector('.arc-big');
  big.classList.remove('pop');
  void big.offsetWidth;
  big.classList.add('pop');
}

function buildScreen() {
  injectStyles();
  overlay = document.createElement('div');
  overlay.className = 'arc-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="arc-panel" role="dialog" aria-modal="true" aria-label="Your character" tabindex="-1">
      <header class="arc-head">
        <h2>Your character</h2>
        <div class="arc-tix" title="Arcade tickets">${TICKET}<b>0</b></div>
        <button class="arc-x" aria-label="Close">✕</button>
      </header>
      <div class="arc-body">
        <aside class="arc-side">
          <div class="arc-big"></div>
          <input class="arc-name" type="text" maxlength="${MAX_NAME}" placeholder="Player 1" aria-label="Your name" autocomplete="off" spellcheck="false">
          <div class="arc-title"></div>
          <button class="arc-shuffle" type="button">🎲 Shuffle</button>
          <p class="arc-hint">Earn tickets in every game. Spend them at the prize counter, or finish quests for prizes you can't buy.</p>
        </aside>
        <section class="arc-main">
          <nav class="arc-tabs" role="tablist">
            <button class="arc-tab" data-tab="style" role="tab">Style</button>
            <button class="arc-tab" data-tab="quests" role="tab">Quests<i class="arc-badge"></i></button>
            <button class="arc-tab" data-tab="shop" role="tab">Prizes</button>
          </nav>
          <div class="arc-pane"></div>
          <div class="arc-detail" hidden></div>
        </section>
      </div>
    </div>`;
  document.body.append(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.arc-x')) { close(); return; }
    const t = e.target.closest('.arc-tab');
    if (t) { tab = t.dataset.tab; picked = null; overlay.querySelector('.arc-pane').scrollTop = 0; renderScreen(); return; }
    const s = e.target.closest('.arc-slot');
    if (s) { slot = s.dataset.slot; picked = null; renderScreen(); return; }
    const b = e.target.closest('[data-buy]');
    if (b) {
      const [bs, bid] = b.dataset.buy.split(':');
      if (buy(bs, bid)) { picked = null; popBig(); renderScreen(); }
      return;
    }
    const tile = e.target.closest('.arc-tile');
    if (tile) {
      const [ts, tid] = tile.dataset.item.split(':');
      if (owns(ts, tid)) {
        picked = null;
        setLook({ [ts]: tid });
        popBig();
      } else {
        picked = { slot: ts, id: tid };
      }
      renderScreen();
      return;
    }
    if (e.target.closest('.arc-shuffle')) {
      const patch = {};
      for (const s2 of allSlots()) {
        if (s2.id === 'title' || s2.game) continue;
        const mine = allItems().filter((i) => i.slot === s2.id && owns(i.slot, i.id));
        if (mine.length) patch[s2.id] = mine[Math.floor(Math.random() * mine.length)].id;
      }
      setLook(patch);
      popBig();
      renderScreen();
    }
  });
  overlay.querySelector('.arc-name').addEventListener('input', (e) => setName(e.target.value));
  overlay.querySelector('.arc-name').addEventListener('change', () => record('look', { name: state.name }));
  // While the screen is open, keys belong to it, not to the game behind it.
  window.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    e.stopPropagation();
  }, true);
}

// open({ tab, slot, item }) jumps straight to a tab, a style category or a locked prize.
function open(opts = {}) {
  if (!overlay) buildScreen();
  opener = document.activeElement;
  tab = opts.tab || 'style';
  if (opts.slot) slot = opts.slot;
  picked = opts.item && opts.slot ? { slot: opts.slot, id: opts.item } : null;
  overlay.hidden = false;
  renderScreen();
  overlay.querySelector('.arc-panel').focus();
}

function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (opener && opener.focus) opener.focus();
}

listeners.add(() => { if (overlay && !overlay.hidden) renderScreen(); });
// Keep pages in step when another tab changes the player.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { Object.assign(state, JSON.parse(e.newValue)); } catch { return; }
  emit();
});

save();
injectStyles();

window.Arcade = {
  player,
  character: (look = state.look, opts) => characterSvg(look, opts),
  ticketIcon: TICKET,
  register,
  record,
  addTickets,
  setLook,
  setName,
  grant: (key) => { if (grant(key, { quiet: true })) emit(); },
  owns,
  item: findItem,
  items: (s) => allItems().filter((i) => i.slot === s),
  open,
  close,
  isOpen: () => !!overlay && !overlay.hidden,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  toast,
  unlocked: (dir) => unlockedDirs().includes(dir),
  setUnlocked: (dirs) => store.set(UNLOCKED_KEY, [...dirs]),
};
})();
