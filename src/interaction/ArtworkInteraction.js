import * as THREE from 'three';

const PROXIMITY_RADIUS = 2.2;
const FACING_DOT_THRESHOLD = -0.25; // character's forward must point roughly toward the wall's normal-opposite

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/**
 * Finds the nearest artwork the character is close enough to and roughly
 * facing (since the bird's-eye camera makes "looking at" something a
 * proximity+orientation check rather than a first-person gaze check).
 * Returns the artwork's interaction record (see MuseumBuilder.buildArtworkFrame)
 * or null.
 */
export function findFocusedArtwork(characterPos, characterForward, artworks) {
  let best = null;
  let bestDist = Infinity;

  for (const artwork of artworks) {
    const dx = characterPos.x - artwork.worldPosition.x;
    const dz = characterPos.z - artwork.worldPosition.z;
    const dist = Math.hypot(dx, dz);
    if (dist > PROXIMITY_RADIUS) continue;

    const facingDot = characterForward.x * artwork.normal.x + characterForward.z * artwork.normal.z;
    if (facingDot > FACING_DOT_THRESHOLD) continue; // not facing the wall

    if (dist < bestDist) {
      bestDist = dist;
      best = artwork;
    }
  }

  return best;
}

/** Raycasts a mouse click (client coordinates) against artwork canvases; returns the hit artwork's interaction record or null. */
export function pickArtworkAtClient(clientX, clientY, domElement, camera, artworks) {
  const rect = domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const meshes = artworks.map((a) => a.canvasMesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;

  const hitMesh = hits[0].object;
  return artworks.find((a) => a.canvasMesh === hitMesh) ?? null;
}
