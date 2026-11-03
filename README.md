# Game Arcade

A small browser arcade.

The home page lists every open game. A few games are locked behind a code, which you only get by being told it, and are typed into the popup behind the small key button in the corner. The page holds no codes, and a locked game's card (name, picture, link) is encrypted with its code. A game can also keep part of itself behind a code: the home page records which game folders a code has opened in this browser, and the game checks with `Arcade.unlocked()`.

Every page shares one character (`shared/arcade.js`): you build it from parts, earn arcade tickets in every game, and spend them at the prize counter or finish quests for prizes you can't buy. Each game adds its own prizes, quests and ticket payouts in its `rewards.js`, and reports what happens with `Arcade.record()`.

Every game can be played with friends (`shared/net.js`). One player hosts a room and reads out its four-letter code; friends type it into the same game to join. Browsers meet through PeerJS's free public server and then talk directly over WebRTC, so there is still no server to run. The host's browser runs the room: in Turbo Karts each player drives their own kart and the host drives the CPU karts; at the casino tables the host deals, and every browser plays out the same cards and moves.

Everything is plain HTML, CSS and JavaScript. To run it locally, serve the folder (for example `python3 -m http.server`) and open the address it prints.

To add a game or change a code, edit the private game list kept outside this repository (a game listed without a code is open), then run:

```
node tools/lock-games.mjs path/to/games.json
```
