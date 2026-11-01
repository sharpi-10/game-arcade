// The casino's part of the arcade character: card backs, titles, quests and ticket payouts.
// The game reports what happens with Arcade.record(); this file decides what it's worth.
Arcade.register({
  id: 'casino',
  title: 'Golden Ace Casino',
  slots: [{ id: 'cardBack', name: 'Card back', default: 'classic', shape: 'card' }],
  items: [
    { slot: 'cardBack', id: 'classic', name: 'Classic', swatch: 'linear-gradient(135deg, #b8202f, #6a0d18)' },
    { slot: 'cardBack', id: 'royal', name: 'Royal', swatch: 'linear-gradient(135deg, #2f63e0, #0f2266)' },
    { slot: 'cardBack', id: 'midnight', name: 'Midnight', swatch: 'linear-gradient(135deg, #34343e, #0a0a0e)' },
    { slot: 'cardBack', id: 'jade', name: 'Jade', quest: true, swatch: 'linear-gradient(135deg, #1a9a5c, #063a22)' },
    { slot: 'cardBack', id: 'velvet', name: 'Velvet', price: 200, swatch: 'linear-gradient(135deg, #8a3bd1, #2d0b52)' },
    { slot: 'cardBack', id: 'sunset', name: 'Sunset', price: 250, swatch: 'linear-gradient(135deg, #ff9b42, #b0225a)' },
    { slot: 'title', id: 'cardShark', name: 'Card shark', quest: true },
    { slot: 'title', id: 'highRoller', name: 'High roller', quest: true },
    { slot: 'title', id: 'wildCard', name: 'Wild card', quest: true },
  ],
  payouts: {
    'bj.hand': (d) => {
      if (d.result === 'blackjack') return { tickets: 15, reason: 'Blackjack!' };
      if (d.result === 'win') return { tickets: 5, reason: 'Hand won' };
      return null;
    },
    // category: 0 high card … 5 flush … 8 straight flush.
    'poker.pot': (d) => ({ tickets: d.category >= 5 ? 20 : 8, reason: 'Pot won' }),
    'eights.round': (d) => (d.won ? { tickets: d.friends > 0 ? 15 : 10, reason: 'Crazy Eights win' } : null),
  },
  quests: [
    { id: 'casino.bj', title: 'Twenty-one', desc: 'Get a blackjack.', goal: 1, on: 'bj.hand', when: (d) => d.result === 'blackjack', reward: { tickets: 40 } },
    { id: 'casino.bj10', title: 'Hot streak', desc: 'Win 10 blackjack hands.', goal: 10, on: 'bj.hand', when: (d) => d.result === 'win' || d.result === 'blackjack', reward: { tickets: 60, items: ['cardBack:jade'] } },
    { id: 'casino.pot', title: 'Take it down', desc: 'Win a poker pot.', goal: 1, on: 'poker.pot', reward: { tickets: 40 } },
    { id: 'casino.flush', title: 'Flush with cash', desc: 'Win a poker showdown with a flush or better.', goal: 1, on: 'poker.pot', when: (d) => d.showdown && d.category >= 5, reward: { items: ['glasses:shades'] } },
    { id: 'casino.shark', title: 'Card shark', desc: 'Win 25 poker pots.', goal: 25, on: 'poker.pot', reward: { tickets: 200, items: ['title:cardShark'] } },
    { id: 'casino.friendsBj', title: 'Table for two', desc: 'Play a blackjack hand at a table with a friend.', goal: 1, on: 'bj.hand', when: (d) => d.friends > 0, reward: { tickets: 40 } },
    { id: 'casino.friendsPoker', title: 'Friendly fire', desc: 'Win a poker pot at a table with a friend.', goal: 1, on: 'poker.pot', when: (d) => d.friends > 0, reward: { tickets: 60 } },
    { id: 'casino.eights', title: 'Out first', desc: 'Win a round of Crazy Eights.', goal: 1, on: 'eights.round', when: (d) => d.won, reward: { tickets: 40 } },
    { id: 'casino.eightsWild', title: 'Wild card', desc: 'Go out in Crazy Eights by playing an eight as your last card.', goal: 1, on: 'eights.round', when: (d) => d.wild, reward: { tickets: 30, items: ['title:wildCard'] } },
    { id: 'casino.eightsFriend', title: 'House rules', desc: 'Win a round of Crazy Eights against a friend.', goal: 1, on: 'eights.round', when: (d) => d.won && d.friends > 0, reward: { tickets: 60 } },
    { id: 'casino.eights10', title: 'Crazy for eights', desc: 'Win 10 rounds of Crazy Eights.', goal: 10, on: 'eights.round', when: (d) => d.won, reward: { tickets: 150 } },
    { id: 'casino.roller', title: 'High roller', desc: 'Have $5,000 in casino chips.', goal: 5000, on: 'casino.chips', mode: 'max', value: (d) => d.chips, reward: { items: ['hat:tophat', 'outfit:tux', 'title:highRoller'] } },
  ],
});
