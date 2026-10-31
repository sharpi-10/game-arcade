# Game Arcade

A small browser arcade at https://sharpi-10.github.io/game-arcade/

The home page is a single code box. Each game unlocks with its own code, which you only get by being told it. The page holds no codes or game links: every game's card is encrypted with its code.

Every page shares one character (`shared/arcade.js`): you build it from parts, earn arcade tickets in every game, and spend them at the prize counter or finish quests for prizes you can't buy. Each game adds its own prizes, quests and ticket payouts in its `rewards.js`, and reports what happens with `Arcade.record()`.

Everything is plain HTML, CSS and JavaScript. To run it locally, serve the folder (for example `python3 -m http.server`) and open the address it prints.

To add a game or change a code, edit the private game list kept outside this repository, then run:

```
node tools/lock-games.mjs path/to/games.json
```
