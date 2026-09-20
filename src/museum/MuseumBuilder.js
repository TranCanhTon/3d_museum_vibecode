import * as THREE from 'three';
import { makeBoxCollider } from '../collision/Collision.js';

const WALL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xede7dd, side: THREE.DoubleSide });
const FLOOR_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xbfa98a, side: THREE.DoubleSide });
const CEILING_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, side: THREE.DoubleSide });
const ARTWORK_CANVAS_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xfaf6ec, side: THREE.DoubleSide });
const ARTWORK_FRAME_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x3a332a, side: THREE.DoubleSide });

function polygonToShape(polygon) {
  const shape = new THREE.Shape();
  polygon.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  shape.closePath();
  return shape;
}

/** Splits a wall into solid box segments, leaving gaps where doors open. */
function wallSegmentsExcludingDoors(wall, doorsOnWall, defaultHeight) {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.hypot(dx, dz);
  const height = wall.height ?? defaultHeight;
  const thickness = wall.thickness ?? 0.3;

  const gaps = doorsOnWall
    .map((door) => {
      const halfFrac = door.width / 2 / length;
      return [Math.max(0, door.position - halfFrac), Math.min(1, door.position + halfFrac)];
    })
    .sort((a, b) => a[0] - b[0]);

  const spans = [];
  let cursor = 0;
  for (const [gapStart, gapEnd] of gaps) {
    if (gapStart > cursor + 1e-4) spans.push([cursor, gapStart]);
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < 1 - 1e-4) spans.push([cursor, 1]);

  return spans
    .filter(([a, b]) => (b - a) * length > 0.05)
    .map(([a, b]) => ({
      start: [sx + dx * a, sz + dz * a],
      end: [sx + dx * b, sz + dz * b],
      height,
      thickness,
    }));
}

function buildWallSegmentMesh(segment) {
  const [sx, sz] = segment.start;
  const [ex, ez] = segment.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.hypot(dx, dz);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, segment.height, segment.thickness), WALL_MATERIAL);
  mesh.position.set((sx + ex) / 2, segment.height / 2, (sz + ez) / 2);
  mesh.rotation.y = Math.atan2(-dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildArtworkPlaceholder(wall, slot) {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.hypot(dx, dz);
  const px = sx + (dx / length) * (slot.position * length);
  const pz = sz + (dz / length) * (slot.position * length);

  const thickness = wall.thickness ?? 0.3;
  const [nx, nz] = slot.normal;
  const sillHeight = slot.sillHeight ?? 1.1;
  const yaw = Math.atan2(nx, nz);
  const centerY = sillHeight + slot.maxHeight / 2;

  const group = new THREE.Group();
  group.position.set(px, 0, pz);
  group.rotation.y = yaw;

  // A dark frame sits slightly further off the wall than the lighter
  // "canvas" plane in front of it, so an empty slot reads clearly as a
  // frame even before stage 4 fills it with the sketch-shaded artwork.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(slot.maxWidth + 0.12, slot.maxHeight + 0.12, 0.04),
    ARTWORK_FRAME_MATERIAL,
  );
  frame.position.set(0, centerY, thickness / 2 + 0.04);
  frame.castShadow = true;
  group.add(frame);

  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(slot.maxWidth, slot.maxHeight), ARTWORK_CANVAS_MATERIAL.clone());
  canvas.position.set(0, centerY, thickness / 2 + 0.065);
  canvas.receiveShadow = true;
  canvas.userData.slotId = slot.id;
  canvas.userData.artworkId = slot.artworkId;
  group.add(canvas);

  group.userData.slotId = slot.id;
  group.userData.artworkId = slot.artworkId;
  return group;
}

/** Axis-aligned collider approximating a (placeholder-layout) wall segment. */
function segmentCollider(segment, worldOffsetX, worldOffsetZ) {
  const [sx, sz] = segment.start;
  const [ex, ez] = segment.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const width = Math.max(Math.abs(dx), segment.thickness);
  const depth = Math.max(Math.abs(dz), segment.thickness);
  const centerX = (sx + ex) / 2 + worldOffsetX;
  const centerZ = (sz + ez) / 2 + worldOffsetZ;
  return makeBoxCollider(centerX, centerZ, width, depth);
}

/** A built, ready-to-use museum interior placed at a world-space offset. */
export class MuseumInstance {
  constructor({ group, colliders, occluderMeshes, ceilingMeshes, artworkSlotMeshes, spawnPointWorld, entranceDoorWorld, layout, worldOffset }) {
    this.group = group;
    this.colliders = colliders;
    this.occluderMeshes = occluderMeshes;
    this.ceilingMeshes = ceilingMeshes;
    this.artworkSlotMeshes = artworkSlotMeshes;
    this.spawnPointWorld = spawnPointWorld;
    this.entranceDoorWorld = entranceDoorWorld;
    this.layout = layout;
    this.worldOffset = worldOffset;
  }

  /**
   * Ceilings are kept hidden: the camera is always a steep bird's-eye view
   * here too, so a solid ceiling would sit between it and the character on
   * every single frame. Hiding it outright (rather than raycasting per
   * frame like the wall-occlusion check) keeps every room readable from
   * above, matching the "ceiling ... hidden so the layout stays readable"
   * requirement without extra per-frame cost.
   */
  setCeilingVisible(visible) {
    for (const mesh of this.ceilingMeshes) mesh.visible = visible;
  }

  isNearEntranceDoor(x, z, radius = 2.5) {
    const dx = x - this.entranceDoorWorld.x;
    const dz = z - this.entranceDoorWorld.z;
    return dx * dx + dz * dz < radius * radius;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}

/**
 * Turns a validated layout object into a MuseumInstance: 3D geometry for
 * every floor's rooms/walls/doors/artwork slots, movement colliders, and
 * camera-occlusion meshes, all placed at `worldOffset` so museum interiors
 * never spatially overlap the city or each other.
 */
export function buildMuseum(layout, worldOffset) {
  const group = new THREE.Group();
  group.position.copy(worldOffset);

  const colliders = [];
  const occluderMeshes = [];
  const ceilingMeshes = [];
  const artworkSlotMeshes = [];
  const floorLookup = new Map();

  for (const floor of layout.floors) {
    floorLookup.set(floor.id, floor);

    const floorGroup = new THREE.Group();
    floorGroup.position.y = floor.levelY;
    group.add(floorGroup);

    const wallLookup = new Map(floor.walls.map((w) => [w.id, w]));
    const doorsByWall = new Map();
    for (const door of floor.doors) {
      if (!doorsByWall.has(door.wallId)) doorsByWall.set(door.wallId, []);
      doorsByWall.get(door.wallId).push(door);
    }

    for (const room of floor.rooms) {
      const shape = polygonToShape(room.polygon);

      const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), FLOOR_MATERIAL);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.receiveShadow = true;
      floorGroup.add(floorMesh);

      const ceilingMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), CEILING_MATERIAL);
      ceilingMesh.rotation.x = Math.PI / 2;
      ceilingMesh.position.y = floor.ceilingHeight;
      ceilingMesh.visible = false;
      floorGroup.add(ceilingMesh);
      ceilingMeshes.push(ceilingMesh);

      // Rooms only get outdoor sun/sky light bounced through the doorways
      // otherwise, which leaves walls facing away from the sun nearly
      // black. A soft warm light near the ceiling, roughly centered on the
      // room, stands in for gallery ceiling lighting until stage 5 polish.
      const centroid = room.polygon.reduce((acc, [x, z]) => [acc[0] + x / room.polygon.length, acc[1] + z / room.polygon.length], [0, 0]);
      const roomLight = new THREE.PointLight(0xfff2df, 0.9, 14, 2);
      roomLight.position.set(centroid[0], floor.ceilingHeight - 0.6, centroid[1]);
      floorGroup.add(roomLight);
    }

    for (const wall of floor.walls) {
      const segments = wallSegmentsExcludingDoors(wall, doorsByWall.get(wall.id) ?? [], floor.ceilingHeight);
      for (const segment of segments) {
        const mesh = buildWallSegmentMesh(segment);
        floorGroup.add(mesh);
        occluderMeshes.push(mesh);
        colliders.push(segmentCollider(segment, worldOffset.x, worldOffset.z));
      }
    }

    for (const slot of floor.artworkSlots ?? []) {
      const wall = wallLookup.get(slot.wallId);
      const mesh = buildArtworkPlaceholder(wall, slot);
      floorGroup.add(mesh);
      artworkSlotMeshes.push({ id: slot.id, mesh, slot });
    }
  }

  const spawnPointWorld = {
    x: worldOffset.x + layout.entrance.spawnPoint[0],
    z: worldOffset.z + layout.entrance.spawnPoint[1],
  };

  const entranceFloor = floorLookup.get(layout.entrance.floorId);
  const entranceDoor = entranceFloor.doors.find((d) => d.id === layout.entrance.doorId);
  const entranceWall = entranceFloor.walls.find((w) => w.id === entranceDoor.wallId);
  const [esx, esz] = entranceWall.start;
  const [eex, eez] = entranceWall.end;
  const entranceDoorWorld = {
    x: worldOffset.x + esx + (eex - esx) * entranceDoor.position,
    z: worldOffset.z + esz + (eez - esz) * entranceDoor.position,
  };

  return new MuseumInstance({
    group,
    colliders,
    occluderMeshes,
    ceilingMeshes,
    artworkSlotMeshes,
    spawnPointWorld,
    entranceDoorWorld,
    layout,
    worldOffset,
  });
}
