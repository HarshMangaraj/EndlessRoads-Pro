# Endless Drive Pro

A GTA-inspired, infinite open-world driving game built with **React + Vite + three.js**.

## What's new in this version

- **World map selection** — Plain, Forest, Hills, and Beach maps (bottom-left panel), each with unique terrain, sky, fog, and vegetation.
- **GTA-style visuals** — bloom post-processing, warmer sun, cinematic vignette, reflective wet roads in rain.
- **GTA-like city blocks** — procedural skyscrapers and small-town buildings spawn in zones along the road, with emissive window strips that light up at night.
- **Street lights** — real 3D lamppost models (OBJ) along both shoulders, lit dynamically with the day/night cycle.
- **Realistic trees** — instanced pine, maple, and horse-chestnut models from `src/public/`, auto-simplified for the web.
- **AI traffic** — opposing-lane cars cruising the highway with headlights and tail lights.
- **Car paint picker** — swap your ride's color in real time (6 presets).
- **Camera modes** — Chase / Hood / Cinematic. Press **C** to cycle.
- **Pause menu** — Press **Esc** to pause/resume, with a Reset Position button.
- **Graphics settings panel** — quality presets and camera switcher.
- Standalone build — no Replit/workspace dependencies; runs anywhere.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
npm run preview
```

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Gas |
| S / ↓ | Brake / Reverse |
| A D / ← → | Steer |
| Space | Handbrake (drift) |
| C | Cycle camera (Chase → Hood → Cinematic) |
| R | Reset car to start |
| Esc | Pause / Resume |

## Maps

| Map | Vibe |
|-----|------|
| **Great Plains** | Flat golden fields, occasional cities |
| **Redwood Forest** | Dense trees, misty green atmosphere |
| **Alpine Hills** | Tall mountains, snow caps, dramatic peaks |
| **Pacific Coast** | Beach sand, ocean, palm trees |

## Project structure

```
src/
  game/
    DrivingGame.tsx   # main scene, physics, world streaming
    city.ts           # GTA-style buildings + streetlights
    traffic.ts        # AI traffic cars
    terrain.ts        # heightfield, biomes, road path
    assets.ts         # OBJ/MTL loader + mesh simplification
    vegetation.ts     # instanced 3D tree placement
    constants.ts      # tunables
    noise.ts          # value/fBM noise
  components/
    HUD.tsx
    Minimap.tsx
    TouchControls.tsx
    PauseMenu.tsx          (new)
    GraphicsSettings.tsx   (new)
    CarColorPicker.tsx     (new)
```

Original concept from the uploaded `endless-drive` project — refactored,
upgraded, and stand-alone.
