// Regatta Rush's part of the arcade character: boat paints, titles, quests and ticket payouts.
// The game reports each finished race with Arcade.record('row', ...); this file decides what it's worth.
Arcade.register({
  id: 'regatta',
  title: 'Regatta Rush',
  slots: [{ id: 'boatPaint', name: 'Boat paint', default: 'white' }],
  items: [
    { slot: 'boatPaint', id: 'white', name: 'White', swatch: '#f2f3f7' },
    { slot: 'boatPaint', id: 'red', name: 'Red', swatch: '#e53935' },
    { slot: 'boatPaint', id: 'blue', name: 'Blue', swatch: '#1e88e5' },
    { slot: 'boatPaint', id: 'green', name: 'Green', swatch: '#43a047' },
    { slot: 'boatPaint', id: 'yellow', name: 'Yellow', swatch: '#fdd835' },
    { slot: 'boatPaint', id: 'wood', name: 'Varnished wood', price: 150, swatch: '#b8743a' },
    { slot: 'boatPaint', id: 'carbon', name: 'Carbon', price: 200, swatch: '#2b2d36' },
    { slot: 'boatPaint', id: 'neon', name: 'Neon', quest: true, swatch: '#39ff9a' },
    { slot: 'boatPaint', id: 'gold', name: 'Gold', quest: true, swatch: '#f4c542' },
    { slot: 'title', id: 'oarsome', name: 'Oarsome', quest: true },
    { slot: 'title', id: 'headOfRiver', name: 'Head of the river', quest: true },
  ],
  payouts: {
    row: (d) => {
      const base = [30, 20, 15][d.place - 1] || 10;
      const mult = { easy: 1, normal: 1.5, hard: 2 }[d.difficulty] || 1;
      return { tickets: base * mult, reason: d.place === 1 ? 'Regatta won!' : 'Regatta finished' };
    },
  },
  quests: [
    { id: 'row.finish', title: 'Catch!', desc: 'Finish a regatta.', goal: 1, on: 'row', reward: { tickets: 30 } },
    { id: 'row.podium', title: 'On the podium', desc: 'Finish a regatta in the top 3.', goal: 1, on: 'row', when: (d) => d.place <= 3, reward: { tickets: 50 } },
    { id: 'row.win', title: 'Gold medal', desc: 'Win a regatta.', goal: 1, on: 'row', when: (d) => d.place === 1, reward: { tickets: 75 } },
    { id: 'row.combo', title: 'In the rhythm', desc: 'Chain 10 perfect strokes in a row.', goal: 1, on: 'row', when: (d) => d.maxCombo >= 10, reward: { tickets: 50, items: ['boatPaint:neon'] } },
    { id: 'row.clean', title: 'Clean water', desc: 'Finish a regatta without catching a crab.', goal: 1, on: 'row', when: (d) => d.crabs === 0, reward: { tickets: 40 } },
    { id: 'row.hard', title: 'Head of the river', desc: 'Win a regatta on Hard.', goal: 1, on: 'row', when: (d) => d.place === 1 && d.difficulty === 'hard', reward: { items: ['boatPaint:gold', 'title:headOfRiver'] } },
    { id: 'row.friends', title: 'Crew', desc: 'Finish a regatta against a friend.', goal: 1, on: 'row', when: (d) => d.friends > 0, reward: { tickets: 60 } },
    { id: 'row.ten', title: 'Oarsome', desc: 'Finish 10 regattas.', goal: 10, on: 'row', reward: { tickets: 150, items: ['title:oarsome'] } },
  ],
});
