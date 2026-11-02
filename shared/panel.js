// The owner's control panel, opened from the home page with its code. Everything here changes
// only this browser's saved data: the character, casino chips, best times and unlocked codes.
(() => {
'use strict';

const CHIPS_KEY = 'casino.balance';
const START_CHIPS = 1000;
const BEST_TIMES = ['turboKarts.best.', 'rowing.best.'];

const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};
const remove = (test) => {
  try {
    for (const key of Object.keys(localStorage)) if (test(key)) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const chips = () => Math.max(0, Math.round(Number(read(CHIPS_KEY, START_CHIPS)) || 0));

const CSS = `
  .cp { width: min(520px, calc(100% - 32px)); max-height: calc(100% - 32px); margin: auto; padding: 22px; border-radius: 24px;
    color: var(--text); background: linear-gradient(180deg, var(--panel), var(--panel-lo));
    border: 1px solid rgba(255, 95, 168, .5); box-shadow: 0 30px 80px rgba(0, 0, 0, .6), 0 0 40px rgba(255, 95, 168, .2); }
  .cp[open] { animation: pop-in .25s cubic-bezier(.2, .8, .2, 1.2); }
  .cp::backdrop { background: rgba(5, 6, 20, .7); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  .cp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .cp-head h2 { margin: 0; font: 400 18px Bungee, Rubik, sans-serif; letter-spacing: .1em; color: var(--pink); text-shadow: 0 0 14px rgba(255, 95, 168, .5); }
  .cp-note { margin: 0 0 6px; color: var(--muted); font-size: 13px; }
  .cp section { padding: 14px 0; border-top: 1px solid var(--line); }
  .cp section:first-of-type { border-top: 0; }
  .cp h3 { margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .cp-stat { float: right; color: var(--text); font-variant-numeric: tabular-nums; letter-spacing: 0; text-transform: none; font-size: 14px; }
  .cp-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .cp-row + .cp-row { margin-top: 8px; }
  .cp input { flex: 1 1 120px; min-width: 0; height: 40px; padding: 0 14px; border-radius: 12px;
    border: 1px solid var(--line); background: rgba(0, 0, 0, .25); color: var(--text); font: 600 15px Rubik, sans-serif; }
  .cp input:focus { outline: none; border-color: var(--cyan); }
  .cp button.act { height: 40px; padding: 0 16px; border-radius: 12px; cursor: pointer; font: 600 14px Rubik, sans-serif;
    color: var(--text); background: rgba(255, 255, 255, .08); border: 1px solid var(--line); transition: background .15s, border-color .15s; }
  .cp button.act:hover, .cp button.act:focus-visible { outline: none; background: rgba(255, 255, 255, .14); border-color: var(--cyan); }
  .cp button.go { color: var(--bg); border: 0; background: linear-gradient(90deg, var(--cyan), var(--violet)); }
  .cp button.danger { color: var(--bad); border-color: rgba(255, 107, 139, .45); }
  .cp button.danger.armed { color: var(--bg); background: var(--bad); border-color: var(--bad); }
  .cp-msg { min-height: 18px; margin: 4px 0 0; font-size: 14px; font-weight: 600; color: var(--good); text-align: center; }
`;

let dialog = null;
let msgTimer = 0;

function say(text) {
  const msg = dialog.querySelector('.cp-msg');
  msg.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { msg.textContent = ''; }, 3000);
}

function refresh() {
  dialog.querySelector('[data-stat="tickets"]').textContent = `${fmt(Arcade.player.tickets)} tickets`;
  dialog.querySelector('[data-stat="chips"]').textContent = `$${fmt(chips())}`;
}

const amount = (name) => Math.round(Number(dialog.querySelector(`[name="${name}"]`).value) || 0);

// Buttons that wipe something need a second press within a few seconds.
function confirmTwice(button, run) {
  if (button.classList.contains('armed')) { run(); return; }
  const label = button.textContent;
  button.classList.add('armed');
  button.textContent = 'Press again to confirm';
  setTimeout(() => { button.classList.remove('armed'); button.textContent = label; }, 3000);
}

const ACTIONS = {
  tickets() {
    const n = amount('tickets');
    if (n <= 0) { say('Type how many tickets to give.'); return; }
    Arcade.addTickets(n, 'Control panel');
    say(`Gave ${fmt(n)} tickets.`);
  },
  chips() {
    const n = amount('chips');
    if (n <= 0) { say('Type how many chips to give.'); return; }
    write(CHIPS_KEY, chips() + n);
    say(`Gave $${fmt(n)} in chips.`);
  },
  prizes() {
    const prizes = Arcade.items().filter((i) => (i.price || i.quest) && !Arcade.owns(i.slot, i.id));
    for (const i of prizes) Arcade.grant(`${i.slot}:${i.id}`);
    say(prizes.length ? `Unlocked ${prizes.length} prizes.` : 'You already own every prize.');
  },
  times(button) {
    confirmTwice(button, () => {
      remove((key) => BEST_TIMES.some((p) => key.startsWith(p)));
      location.reload();
    });
  },
  relock(button) {
    confirmTwice(button, () => {
      remove((key) => key === 'arcade.codes' || key === 'arcade.unlocked');
      location.reload();
    });
  },
  character(button) {
    confirmTwice(button, () => {
      remove((key) => key === 'arcade.player');
      location.reload();
    });
  },
  everything(button) {
    confirmTwice(button, () => {
      remove(() => true);
      location.reload();
    });
  },
};

function build() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  dialog = document.createElement('dialog');
  dialog.className = 'cp';
  dialog.setAttribute('aria-labelledby', 'cp-title');
  dialog.innerHTML = `
    <div class="cp-head"><h2 id="cp-title">Control panel</h2><button class="code-close" type="button" data-close aria-label="Close">×</button></div>
    <p class="cp-note">Changes only this browser's saved games.</p>
    <section>
      <h3>Character <span class="cp-stat" data-stat="tickets"></span></h3>
      <div class="cp-row"><input name="tickets" type="number" min="1" step="1" value="500" aria-label="Tickets to give"><button class="act go" data-do="tickets">Give tickets</button></div>
      <div class="cp-row"><button class="act" data-do="prizes">Unlock every prize</button><button class="act danger" data-do="character">Reset character</button></div>
    </section>
    <section>
      <h3>Casino chips <span class="cp-stat" data-stat="chips"></span></h3>
      <div class="cp-row"><input name="chips" type="number" min="1" step="1" value="1000" aria-label="Chips to give"><button class="act go" data-do="chips">Give chips</button></div>
    </section>
    <section>
      <h3>Saves</h3>
      <div class="cp-row"><button class="act danger" data-do="times">Reset best times</button><button class="act danger" data-do="relock">Forget entered codes</button></div>
      <div class="cp-row"><button class="act danger" data-do="everything">Reset everything</button></div>
    </section>
    <p class="cp-msg" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) { dialog.close(); return; }
    const button = e.target.closest('[data-do]');
    if (!button) return;
    ACTIONS[button.dataset.do](button);
    refresh();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.name) { e.preventDefault(); ACTIONS[e.target.name](); refresh(); }
  });
  Arcade.onChange(() => { if (dialog.open) refresh(); });
}

window.arcadeTool = () => {
  if (!dialog) build();
  refresh();
  dialog.querySelector('.cp-msg').textContent = '';
  dialog.showModal();
};
})();
