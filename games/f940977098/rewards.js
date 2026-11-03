// Blast Zone's part of the arcade character: fighter costumes, titles, quests and ticket payouts.
// The game reports each finished fight with Arcade.record('brawl', ...); this file decides what it's worth.
Arcade.register({
  id: 'blastzone',
  title: 'Blast Zone',
  slots: [{ id: 'brawlCostume', name: 'Fighter costume', default: 'classic' }],
  items: [
    { slot: 'brawlCostume', id: 'classic', name: 'Classic', swatch: 'linear-gradient(135deg, #e53935 50%, #2d3a8c 50%)' },
    { slot: 'brawlCostume', id: 'shadow', name: 'Shadow', price: 150, swatch: '#2b2540' },
    { slot: 'brawlCostume', id: 'crystal', name: 'Crystal', price: 200, swatch: '#bff3ff' },
    { slot: 'brawlCostume', id: 'neon', name: 'Neon', quest: true, swatch: '#39ff9a' },
    { slot: 'brawlCostume', id: 'gold', name: 'Gold', quest: true, swatch: '#f4c542' },
    { slot: 'title', id: 'brawler', name: 'Brawler', quest: true },
    { slot: 'title', id: 'champ', name: 'Blast Zone champ', quest: true },
  ],
  payouts: {
    brawl: (d) => {
      const base = [30, 15, 10, 6][d.place - 1] || 6;
      const field = 1 + 0.25 * Math.max(0, d.players - 2); // more fighters, more on the line
      const level = { easy: 1, normal: 1.5, hard: 2 }[d.level] || 1.5;
      const tickets = Math.round(base * field * level + d.kos * 3);
      return { tickets, reason: d.place === 1 ? 'Last one standing!' : 'Fight finished' };
    },
  },
  quests: [
    { id: 'bz.first', title: 'Ready, fight!', desc: 'Finish a fight in Blast Zone.', goal: 1, on: 'brawl', reward: { tickets: 30 } },
    { id: 'bz.win', title: 'Last one standing', desc: 'Win a fight.', goal: 1, on: 'brawl', when: (d) => d.place === 1, reward: { tickets: 50 } },
    { id: 'bz.kos', title: 'Out of here', desc: 'Knock out 25 fighters.', goal: 25, on: 'brawl', value: (d) => d.kos, reward: { tickets: 100, items: ['title:brawler'] } },
    { id: 'bz.flawless', title: 'Untouchable', desc: 'Win a fight without losing a stock.', goal: 1, on: 'brawl', when: (d) => d.flawless && d.stocks >= 2, reward: { tickets: 60, items: ['brawlCostume:neon'] } },
    { id: 'bz.crowd', title: 'Free-for-all', desc: 'Win a four-fighter fight.', goal: 1, on: 'brawl', when: (d) => d.place === 1 && d.players >= 4, reward: { tickets: 60 } },
    { id: 'bz.hard', title: 'Champ', desc: 'Win a fight against Hard CPUs.', goal: 1, on: 'brawl', when: (d) => d.place === 1 && d.level === 'hard', reward: { items: ['brawlCostume:gold', 'title:champ'] } },
    { id: 'bz.friends', title: 'Brawl buddies', desc: 'Finish a fight against a friend, online or on the same keyboard.', goal: 1, on: 'brawl', when: (d) => d.friends > 0 || d.local > 0, reward: { tickets: 60 } },
    { id: 'bz.ten', title: 'Regular', desc: 'Finish 10 fights.', goal: 10, on: 'brawl', reward: { tickets: 150 } },
  ],
});
