# Brick Game — Tetris

A 3D model of the classic Brick Game handheld with a playable Tetris on its LCD.

Live: https://tetris-livid.vercel.app/

## Controls

Press the buttons on the model or use the keyboard:

| Key | Button | Action |
|---|---|---|
| `←` `→` | LEFT / RIGHT | move (hold to repeat); on the title screen: start level 1–10 |
| `↓` | DOWN | soft drop while held; on the title screen: ghost piece on/off |
| `Space` | UP | hard drop; on the title screen: start |
| `↑` `X` | — | rotate clockwise |
| `Z` | ROTATE | rotate counterclockwise |
| `Enter` `P` | S/P | start, pause, resume |
| `Esc` | — | pause, resume |
| `R` | RESET | back to the title screen |
| `M` | SOUND | sound on/off |
| `G` | — | ghost piece on/off |
| — | ON/OFF | power |

Keys work in any keyboard layout. The game pauses when the tab is hidden or the window loses focus.

## Rules

- 7-piece bag, SRS rotation with wall kicks, 0.5 s lock delay (up to 15 resets by moving).
- Level = start level + 1 per 10 lines, up to 10. Fall speed: `1000 − (level − 1) · 100` ms per row.
- Score: 100 / 300 / 500 / 800 × level for 1–4 lines, +1 per soft-dropped row, +2 per hard-dropped row, up to 999 999.
- The high score, start level, sound and ghost settings are saved in the browser. A reload starts a new game.

## Development

Needs Node.js 24 (the current LTS, the newest version Vercel builds with).

```bash
npm install
npm run dev      # dev server
npm test         # game rules and device tests (node --test)
npm run lint
npm run build    # production build in dist/
npm run deploy   # vercel --prod
```

Code:

- `src/game/` — the game without any UI: rules (`engine.js`), console modes and settings (`device.js`), input, timing, sound and saving (`store.js`, `sfx.js`), tests.
- `src/scene/` — the 3D scene: model, LCD drawn into a canvas texture, buttons, camera and studio lighting. The scene renders only when something changes.
- `src/assets/brick-game.glb` — the Draco-compressed model; its decoder comes from the installed three.js and is bundled at build time.
