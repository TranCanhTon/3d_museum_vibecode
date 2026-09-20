# Museum Walk

A 3D web app built with Three.js and Vite: walk around a low-poly cartoon
city in a bird's-eye third-person view, enter museum buildings, and explore
realistic-scale interiors full of artworks.

This project is being built in stages. **Stage 1 (this commit): the city,
the walking character, and the bird-view camera.**

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

## Controls

- **WASD** (or arrow keys) — move, relative to the camera's facing direction
- **Right mouse drag** — rotate the camera around the character
- **Mouse wheel** — zoom in/out
- **E** — interact with a nearby artwork (added in a later stage)
- **Escape** — close an overlay (added in a later stage)

## Stages

1. ✅ 3D city with a walking character and bird's-eye camera
2. ⏳ Museum interior loaded from a JSON layout, with interior camera handling
3. ⏳ Data fetch script (Finna API / Finnish National Gallery) and artworks on walls
4. ⏳ Cartoon sketch shader + proximity interaction overlay
5. ⏳ Performance polish and full documentation

## Project structure

```
src/
  main.js              entry point: scene, render loop, wiring
  city/City.js          procedural low-poly city (ground, roads, buildings, trees, museum facade)
  character/Character.js placeholder low-poly character with walk animation
  camera/CameraController.js bird's-eye orbit camera (zoom, rotate, follow)
  input/InputManager.js keyboard + mouse input state
  collision/Collision.js circle-vs-box collision resolution
```

More modules (museum builder, data loading, UI, shaders) will be added in
later stages as described in `src/` above.

## Deployment

This is a static Vite app. `npm run build` produces a `dist/` folder that can
be deployed to any static host (GitHub Pages, Netlify, Vercel, Cloudflare
Pages, etc.) with no server-side component required.

## Data sources & licensing

Artwork data and images (added in stage 3) will come from:

- [Finna API](https://api.finna.fi) — no API key required
- [Finnish National Gallery open data](https://www.kansallisgalleria.fi/)

Only records whose image license allows reuse (public domain, CC0, or CC BY)
are used, and each artwork's page in the app credits its source, license,
and attribution.
