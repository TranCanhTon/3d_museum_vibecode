/**
 * Axis-aligned box collider used for both city props and interior walls.
 * minX/maxX/minZ/maxZ are in world-space meters.
 */
export function makeBoxCollider(centerX, centerZ, width, depth) {
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

/**
 * Pushes a circular actor (position + radius) out of any overlapping box
 * colliders by the minimal translation distance. Mutates and returns a new
 * {x, z} position.
 */
export function resolveCircleVsBoxes(position, radius, colliders) {
  let x = position.x;
  let z = position.z;

  for (const box of colliders) {
    const closestX = Math.max(box.minX, Math.min(x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-6) {
        const push = radius - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      } else {
        // Center is exactly on the boundary/inside; push out along the
        // shortest axis.
        const overlapLeft = x - box.minX;
        const overlapRight = box.maxX - x;
        const overlapTop = z - box.minZ;
        const overlapBottom = box.maxZ - z;
        const min = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (min === overlapLeft) x = box.minX - radius;
        else if (min === overlapRight) x = box.maxX + radius;
        else if (min === overlapTop) z = box.minZ - radius;
        else z = box.maxZ + radius;
      }
    }
  }

  return { x, z };
}
