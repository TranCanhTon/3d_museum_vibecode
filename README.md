# Museum Walk

A 3D web app built with Three.js and Vite: walk around a low-poly cartoon
city in a bird's-eye third-person view, enter museum buildings, and explore
realistic-scale interiors full of artworks rendered as rough cartoon
sketches until you step up and interact with them.

All five planned stages are implemented:

1. ✅ 3D city with a walking character and bird's-eye camera
2. ✅ Museum interior loaded from a JSON layout, with interior camera handling
3. ✅ Data fetch script (Finna API) and artworks on walls
4. ✅ Cartoon sketch shader + proximity/click interaction overlay
5. ✅ Performance polish and this documentation

## Setup

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm run fetch:data # pull real artwork data/images (see "Fetching artwork data" below)
```

## Controls

- **WASD** (or arrow keys) — move, relative to the camera's facing direction
- **Right mouse drag** — rotate the camera around the character
- **Mouse wheel** — zoom in/out
- **E** — interact with a nearby, roughly-faced artwork (also works to close the overlay)
- **Click** — interact with a nearby artwork directly
- **Escape** — close the artwork overlay

Walking through a museum's door (in the city or from inside a gallery)
automatically transitions you in or out — no key press needed.

## Project structure

```
src/
  main.js                      entry point: scene, render loop, city<->museum state machine, interaction wiring
  city/City.js                 procedural low-poly city: ground, roads, crosswalks, buildings, museum facade, trees, lamps
  character/Character.js       placeholder low-poly character with walk animation
  camera/CameraController.js   bird's-eye orbit camera (zoom, rotate, follow, wall/ceiling occlusion avoidance)
  input/InputManager.js        keyboard + mouse input state
  collision/Collision.js       circle-vs-box collision resolution
  museum/
    layoutSchema.json          JSON Schema documenting the museum layout format
    validateLayout.js          hand-written validator enforcing that schema, clear multi-error messages
    MuseumBuilder.js           turns a validated layout into 3D geometry + colliders + artwork frames
    MuseumLoader.js            fetches/validates/lazily builds+caches museum interiors by id
    ArtworkData.js             loads fetched artwork metadata (public/data/artworks/<id>.json)
  shaders/SketchMaterial.js    runtime edge-detect + posterize + paper-grain shader for wall art
  interaction/ArtworkInteraction.js  proximity+facing focus detection, click raycasting
  ui/ArtworkOverlay.js         the full-screen artwork detail overlay (DOM, not WebGL)
scripts/fetchData.js           npm run fetch:data - pulls artwork data/images from Finna
public/museums/<id>.json       museum layout data files (see below)
public/data/artworks/<id>.json artwork metadata written by fetch:data (images alongside it)
```

## How the layout JSON works

Each museum is one JSON file in `public/museums/<id>.json`, validated against
`src/museum/layoutSchema.json` (see `src/museum/validateLayout.js` for the
enforced rules — it's dependency-free by design, since there's exactly one
schema to check, rather than pulling in a JSON Schema library for it).
Everything is in **meters** (1 unit = 1 meter), matching real building scale.

Top level:

```jsonc
{
  "id": "ateneum",
  "name": "Ateneum Art Museum",
  "units": "meters",
  "floors": [ /* one or more floor objects */ ],
  "entrance": {
    "floorId": "floor1",
    "doorId": "door-entrance",
    "spawnPoint": [0, 6],       // where the character appears, local to the floor
    "spawnFacingDeg": 180        // optional initial facing
  }
}
```

Each floor has:

- **`rooms`**: `{ id, name, polygon }` — polygon is a list of `[x, z]` points
  outlining the room's floor (any simple, non-self-intersecting shape).
- **`walls`**: `{ id, start: [x,z], end: [x,z], height?, thickness? }` —
  straight segments; `height` defaults to the floor's `ceilingHeight`.
- **`doors`**: `{ id, wallId, position (0-1 along the wall), width, connectsTo }`
  — `connectsTo` is `"exterior"` for the main entrance, or a `[roomIdA, roomIdB]`
  pair for an interior door. The builder cuts the door's gap out of the wall
  automatically.
- **`artworkSlots`**: `{ id, wallId, position, normal: [nx,nz], maxWidth,
  maxHeight, sillHeight?, artworkId }` — `normal` is the unit vector pointing
  away from the wall into the room the artwork faces (explicit, rather than
  inferred from wall winding, to avoid ambiguity). `artworkId` links to a
  record in `public/data/artworks/<museumId>.json`; until that's been fetched
  it can be any placeholder string and the slot just renders an empty frame.

A bad layout (missing field, a door referencing a wall that doesn't exist,
an out-of-range position, etc.) throws a `LayoutValidationError` listing
*every* problem found, not just the first one.

## Adding a new museum

1. Write a new `public/museums/<id>.json` following the schema above.
2. Give one of the city's buildings in `src/city/City.js` a `museumEntrance`
   pointing at your new `layoutId` (currently only the Ateneum building
   does this — follow `_buildMuseum` as a template, or extend `main.js`'s
   very small state machine to look up the layout id per building if you
   add more than one museum building to the city).
3. Optionally run `npm run fetch:data` after adding a `MUSEUMS` entry for it
   in `scripts/fetchData.js` to pull in real artwork.

No other code changes are needed — `MuseumLoader`/`MuseumBuilder` are fully
generic over the layout data.

### The Ateneum placeholder layout

`public/museums/ateneum.json` is a **plausible placeholder**, not the real
Ateneum floor plan — it's marked with `TODO`s throughout (room shapes, wall
positions, ceiling height, wall thickness, and the single-floor
simplification). Send a real floor plan image or dimensions and it can be
regenerated without touching any of the loader/builder code.

## Fetching artwork data

```bash
npm run fetch:data
```

`scripts/fetchData.js` queries the [Finna API](https://api.finna.fi)
(`api.finna.fi`, no key required), keeps only records whose image rights are
public domain, CC0, or CC BY, downloads the images, and writes:

- `public/data/artworks/<museumId>.json` — title, artist, year, description,
  dimensions (flagged `"source": "fallback"` when Finna didn't report real
  measurements), license, attribution, and source link
- `public/data/artworks/<museumId>/images/*.jpg` — the downloaded images

It also updates the matching `artworkSlots[].artworkId` fields in
`public/museums/<museumId>.json` (in order) so the app picks up the new
artwork immediately — no other wiring needed. Before this has ever been run,
every slot just shows an empty frame, and interacting with it explains that.

**Note:** this script was written against Finna's documented API shape but
could not be *tested* against the live API in the sandbox it was built in
(outbound network access to finna.fi is blocked there). It's defensive about
it — every record is validated before use, download failures are skipped
with a warning rather than crashing the run, and on a zero-result search it
logs the first raw record's field names so a mismatch is easy to spot. If a
field name has drifted from what's implemented, that's the place to look.

The app never talks to a live API at runtime — everything is served from
these local JSON/image files.

## The sketch shader

`src/shaders/SketchMaterial.js` is a runtime `THREE.ShaderMaterial`: Sobel
edge detection on the artwork's real texture, posterized color bands, and a
faint procedural paper-grain noise, blended by a `uReveal` uniform. Artworks
render as rough sketches (`uReveal = 0`) by default; opening the interact
overlay animates `uReveal` toward `1`, morphing the wall art into the real
photo, matching what the overlay itself then shows in full.

## Performance notes

- Museum interiors are built lazily — only when the player actually walks
  through a door — and cached after that (`MuseumLoader`).
- Fetched artwork images are downscaled to at most 1024px on their longest
  side at load time (`loadCappedTexture` in `MuseumBuilder.js`), regardless
  of the source file's resolution, and mipmaps are disabled for them since
  the shader always samples at roughly 1:1 texel density up close.
- `MuseumInstance.dispose()` frees a built interior's geometries, materials,
  and textures (including shader-material texture uniforms) — available for
  future multi-museum memory management, not currently called since only
  one museum exists yet.
- Ceilings are simply hidden rather than raycast-faded per frame (the
  bird's-eye camera is always above them anyway), and the camera's
  wall-occlusion check only raycasts against the active place's (city or
  museum) own geometry, never both at once.

## Deployment

This is a static Vite app. `npm run build` produces a `dist/` folder that can
be deployed to any static host (GitHub Pages, Netlify, Vercel, Cloudflare
Pages, etc.) with no server-side component required. Run `npm run fetch:data`
before building if you want real artwork baked into the deployed site.

## Data sources & licensing

Artwork data and images come from the [Finna API](https://api.finna.fi) (no
API key required), which aggregates Finland's museum, library, and archive
collections, including the Finnish National Gallery's (Ateneum's parent
organisation). Only records whose image license allows reuse (public
domain, CC0, or CC BY) are kept — see `isReusableLicense` in
`scripts/fetchData.js`. Each artwork's overlay in the app credits its
source, license, and attribution, with a link back to its Finna record.
