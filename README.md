# VELOCITY RUSH

3D arcade racing game for the browser. 100% original, no backend:
everything runs client-side with `npm install` + `npm run dev`.

- **Stack:** Vite, React, JavaScript, Three.js + React Three Fiber, Web Audio API, Gamepad API.
- **No paid dependencies, no accounts, no placeholders:** menus, physics,
  AI, traffic, sound and persistence are real and functional.

## Game modes

| Mode | Description |
|---|---|
| **Circuit** | 2 laps against 5 AI rivals, with checkpoints, live positions and a final standings table. |
| **Highway sprint** | Point to point through dense traffic, with checkpoints. |
| **Time attack** | Solo, 3 laps; your best lap is saved in localStorage. |

## Cars (6) and tracks (3)

- **Cars:** VORTEX S, FALCON X, DART RS, MAMMOTH GT, SYLPH R and the unlockable hypercar **APEX ONE** (win any race to unlock it).
- **Tracks:** AZURE COAST (coast), THUNDER RIDGE (mountain), NEON BAY (neon night city).

## Controls

**Keyboard:** W/↑ accelerate · S/↓ brake · A/D or ←/→ steer · Space drift ·
Shift nitro · C camera · R reset · P or Esc pause · Enter confirm.

**PlayStation-compatible controller:** left stick steer · R2 accelerate ·
L2 brake · ✕ nitro · ▢ drift · △ camera · ○ back · Options pause.
The controller also works in the menus (d-pad/stick + ✕/○).

## Getting started

```bash
npm install
npm run dev      # opens http://localhost:5173
```

Other commands:

```bash
npm run build    # builds to dist/
npm test         # headless logic tests (tracks, physics, AI, races)
```

## Technical notes

- Custom arcade physics (no external engine): controlled drift, nitro,
  slipstream with exit boost, car-to-car and wall collisions, offroad that
  slows you down, jumps, and auto-reset if you get stuck.
- AI with 3 difficulties (Easy / Normal / Hard), 5 drivers with their own
  styles, and gentle rubber-banding (no teleporting).
- Chase camera with 3 positions (C key), configurable shake.
- 100% synthesized audio with Web Audio (engine, skids, nitro, countdown,
  race music). It unlocks on the first click/keypress due to browser
  autoplay policies.
- Automatic graphics quality (high/medium/low) based on hardware, with live
  adjustment if fps drops. All progress, settings and records live in
  `localStorage` (`velocity-rush:*` keys).
- Self-test page: open `?autotest=1` for the automated in-browser
  validation battery.

## Structure

```
src/
  game/      engine: track, physics, AI, traffic, session, camera, particles, audio
  data/      cars, tracks, settings (localStorage)
  ui/        screens, HUD, R3F canvas, gamepad/keyboard navigation
  autotest/  in-browser validation battery (?autotest=1)
test/        headless logic tests (npm test)
```
