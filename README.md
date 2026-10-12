# Darren's Snowday Search

Two browser games about Darren, Tormund and Bucky, sharing one folder:

- **Pixel game** (`dist/`): the Phaser 3.90 isometric adventure. Rescue Ruffy, then gather firewood for Mom.
- **3D game** (`dist/3d/`): the Three.js third-person valley with the same story, enemies and bosses.

Both games share sound, difficulty, a few controller buttons and story progress through
`dist/shared-save.js` (details in `CHANGELOG-CLAUDE.txt`, update 3).

## Play

- Windows: double-click `PLAY-3D.cmd` or `PLAY-PIXEL.cmd`.
- Mac: double-click `PLAY-3D.command` or `PLAY-PIXEL.command` (the first time, right-click and
  choose Open).
- Anywhere with Node.js: `npm start` (3D) or `npm run pixel`, then open the address it prints.

Read `START-HERE.txt` for controls, phone play and the full history of the project.

## Develop

- `npm test` runs the simulation and regression checks (needs `@napi-rs/canvas` 0.1.100).
- `node tests/browser-qa.cjs` drives both games in a real browser while `npm start` is running
  (needs Playwright).
- `npm run format` reformats the game code with Prettier.
- Change notes go in `CHANGELOG-CLAUDE.txt`; test runs go in `TEST-RESULTS-CLAUDE.txt`.
