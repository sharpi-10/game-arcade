// Turbo Karts' part of the arcade character: kart paints, titles, quests and ticket payouts.
// The game reports each finished race with Arcade.record('race', ...); this file decides what it's worth.
Arcade.register({
  id: 'karts',
  title: 'Turbo Karts',
  slots: [{ id: 'kartPaint', name: 'Kart paint', default: 'red' }],
  items: [
    { slot: 'kartPaint', id: 'red', name: 'Red', swatch: '#e53935' },
    { slot: 'kartPaint', id: 'blue', name: 'Blue', swatch: '#1e88e5' },
    { slot: 'kartPaint', id: 'green', name: 'Green', swatch: '#43a047' },
    { slot: 'kartPaint', id: 'yellow', name: 'Yellow', swatch: '#fdd835' },
    { slot: 'kartPaint', id: 'purple', name: 'Purple', swatch: '#8e24aa' },
    { slot: 'kartPaint', id: 'orange', name: 'Orange', swatch: '#fb8c00' },
    { slot: 'kartPaint', id: 'pink', name: 'Hot pink', price: 150, swatch: '#ff4fa3' },
    { slot: 'kartPaint', id: 'pearl', name: 'Pearl', price: 150, swatch: '#f2f2f5' },
    { slot: 'kartPaint', id: 'midnight', name: 'Midnight', price: 200, swatch: '#26262e' },
    { slot: 'kartPaint', id: 'gold', name: 'Gold', quest: true, swatch: '#f4c542' },
    { slot: 'title', id: 'roadWarrior', name: 'Road warrior', quest: true },
    { slot: 'title', id: 'speedDemon', name: 'Speed demon', quest: true },
  ],
  payouts: {
    race: (d) => {
      const base = [30, 20, 15][d.place - 1] || 10;
      const mult = { easy: 1, normal: 1.5, hard: 2 }[d.difficulty] || 1;
      return { tickets: base * mult, reason: d.place === 1 ? 'Race won!' : 'Race finished' };
    },
  },
  quests: [
    { id: 'karts.finish', title: 'Green flag', desc: 'Finish a race.', goal: 1, on: 'race', reward: { tickets: 30 } },
    { id: 'karts.podium', title: 'Podium', desc: 'Finish a race in the top 3.', goal: 1, on: 'race', when: (d) => d.place <= 3, reward: { tickets: 50 } },
    { id: 'karts.win', title: 'Champion', desc: 'Win a race.', goal: 1, on: 'race', when: (d) => d.place === 1, reward: { tickets: 75, items: ['hat:helmet'] } },
    { id: 'karts.hard', title: 'Speed demon', desc: 'Win a race on Hard.', goal: 1, on: 'race', when: (d) => d.place === 1 && d.difficulty === 'hard', reward: { items: ['kartPaint:gold', 'outfit:racing', 'title:speedDemon'] } },
    { id: 'karts.friends', title: 'Pit crew', desc: 'Finish a race against a friend.', goal: 1, on: 'race', when: (d) => d.friends > 0, reward: { tickets: 60 } },
    { id: 'karts.ten', title: 'Road warrior', desc: 'Finish 10 races.', goal: 10, on: 'race', reward: { tickets: 150, items: ['title:roadWarrior'] } },
  ],
});
