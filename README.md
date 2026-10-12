# Darren's Snowday Search

Two browser games about Darren, Tormund and Bucky, sharing one folder:

- **Pixel game** (`dist/`): the Phaser 3.90 isometric adventure. Rescue Ruffy, then gather firewood for Mom.
- **3D game** (`dist/3d/`): the Three.js third-person valley with the same story, enemies and bosses.

Both games share sound, difficulty, a few controller buttons and story progress through
`dist/shared-save.js` (details in `CHANGELOG-CLAUDE.txt`, update 3).

## Play

- Windows desktop app: unzip `Darren-Snowday-Windows.zip` and double-click
  `Darren Snowday.exe` (no Node or Python needed). The zip is too big for GitHub, so it is
  not in this repository: make it with Node.js 22.12 or newer (`cd desktop-app`, `npm install`,
  `npm run build:win`; it lands in `desktop-app/out/`), or use the copy kept with the project files.
- Windows: double-click `PLAY-3D.cmd` or `PLAY-PIXEL.cmd`.
- Mac: double-click `PLAY-3D.command` or `PLAY-PIXEL.command` (the first time, right-click and
  choose Open).
- Anywhere with Node.js: `npm start` (3D) or `npm run pixel`, then open the address it prints.

Read `START-HERE.txt` for controls, phone play and the full history of the project.

## Develop

- `npm install` once, then `npm test` runs the simulation and regression checks (installs
  `@napi-rs/canvas` 0.1.100).
- `node tests/browser-qa.cjs` drives both games in a real browser while `npm start` is running
  (needs Playwright).
- `npm run format` reformats the game code with Prettier.
- Change notes go in `CHANGELOG-CLAUDE.txt`; test runs go in `TEST-RESULTS-CLAUDE.txt`.
