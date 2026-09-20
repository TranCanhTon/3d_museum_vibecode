/**
 * Validates a museum layout object against the rules documented in
 * layoutSchema.json. Written by hand instead of pulling in a JSON Schema
 * library (ajv etc.) to keep dependencies minimal - this project only has
 * one schema to check, and the checks below are kept in sync with
 * layoutSchema.json by hand.
 *
 * Throws a LayoutValidationError listing every problem found (not just the
 * first one) so a bad layout file gives one useful error instead of a
 * confusing stack trace deep inside the 3D builder.
 */
export class LayoutValidationError extends Error {
  constructor(layoutId, issues) {
    super(`Invalid museum layout "${layoutId ?? '(unknown)'}":\n  - ${issues.join('\n  - ')}`);
    this.name = 'LayoutValidationError';
    this.issues = issues;
  }
}

function isPoint2d(value) {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateLayout(layout) {
  const issues = [];
  const err = (msg) => issues.push(msg);

  if (typeof layout !== 'object' || layout === null) {
    throw new LayoutValidationError(undefined, ['layout must be a JSON object']);
  }

  if (typeof layout.id !== 'string' || !layout.id) err('"id" must be a non-empty string');
  if (typeof layout.name !== 'string' || !layout.name) err('"name" must be a non-empty string');
  if (layout.units !== 'meters') err('"units" must be "meters"');
  if (!Array.isArray(layout.floors) || layout.floors.length === 0) {
    err('"floors" must be a non-empty array');
  }

  const floorIds = new Set();

  (layout.floors ?? []).forEach((floor, floorIndex) => {
    const floorPath = `floors[${floorIndex}]`;
    if (typeof floor.id !== 'string' || !floor.id) {
      err(`${floorPath}.id must be a non-empty string`);
    } else {
      if (floorIds.has(floor.id)) err(`${floorPath}.id "${floor.id}" is duplicated`);
      floorIds.add(floor.id);
    }
    if (typeof floor.name !== 'string' || !floor.name) err(`${floorPath}.name must be a non-empty string`);
    if (!isFiniteNumber(floor.levelY)) err(`${floorPath}.levelY must be a number`);
    if (!isFiniteNumber(floor.ceilingHeight) || floor.ceilingHeight <= 2) {
      err(`${floorPath}.ceilingHeight must be a number greater than 2`);
    }
    if (!Array.isArray(floor.rooms)) err(`${floorPath}.rooms must be an array`);
    if (!Array.isArray(floor.walls)) err(`${floorPath}.walls must be an array`);
    if (!Array.isArray(floor.doors)) err(`${floorPath}.doors must be an array`);
    if (floor.artworkSlots !== undefined && !Array.isArray(floor.artworkSlots)) {
      err(`${floorPath}.artworkSlots must be an array if present`);
    }

    const roomIds = new Set();
    (floor.rooms ?? []).forEach((room, i) => {
      const p = `${floorPath}.rooms[${i}]`;
      if (typeof room.id !== 'string' || !room.id) err(`${p}.id must be a non-empty string`);
      else {
        if (roomIds.has(room.id)) err(`${p}.id "${room.id}" is duplicated`);
        roomIds.add(room.id);
      }
      if (typeof room.name !== 'string' || !room.name) err(`${p}.name must be a non-empty string`);
      if (!Array.isArray(room.polygon) || room.polygon.length < 3) {
        err(`${p}.polygon must have at least 3 points`);
      } else if (!room.polygon.every(isPoint2d)) {
        err(`${p}.polygon must be an array of [x, z] number pairs`);
      }
    });

    const wallIds = new Set();
    (floor.walls ?? []).forEach((wall, i) => {
      const p = `${floorPath}.walls[${i}]`;
      if (typeof wall.id !== 'string' || !wall.id) err(`${p}.id must be a non-empty string`);
      else {
        if (wallIds.has(wall.id)) err(`${p}.id "${wall.id}" is duplicated`);
        wallIds.add(wall.id);
      }
      if (!isPoint2d(wall.start)) err(`${p}.start must be an [x, z] number pair`);
      if (!isPoint2d(wall.end)) err(`${p}.end must be an [x, z] number pair`);
      if (isPoint2d(wall.start) && isPoint2d(wall.end)) {
        const dx = wall.end[0] - wall.start[0];
        const dz = wall.end[1] - wall.start[1];
        if (Math.hypot(dx, dz) < 0.1) err(`${p} start and end are the same point (or too close)`);
      }
      if (wall.height !== undefined && (!isFiniteNumber(wall.height) || wall.height <= 0)) {
        err(`${p}.height must be a positive number if present`);
      }
      if (wall.thickness !== undefined && (!isFiniteNumber(wall.thickness) || wall.thickness <= 0)) {
        err(`${p}.thickness must be a positive number if present`);
      }
    });

    const doorIds = new Set();
    (floor.doors ?? []).forEach((door, i) => {
      const p = `${floorPath}.doors[${i}]`;
      if (typeof door.id !== 'string' || !door.id) err(`${p}.id must be a non-empty string`);
      else {
        if (doorIds.has(door.id)) err(`${p}.id "${door.id}" is duplicated`);
        doorIds.add(door.id);
      }
      if (typeof door.wallId !== 'string' || !wallIds.has(door.wallId)) {
        err(`${p}.wallId "${door.wallId}" does not match any wall on this floor`);
      }
      if (!isFiniteNumber(door.position) || door.position < 0 || door.position > 1) {
        err(`${p}.position must be a number between 0 and 1`);
      }
      if (!isFiniteNumber(door.width) || door.width <= 0) err(`${p}.width must be a positive number`);
      const isExterior = door.connectsTo === 'exterior';
      const isRoomPair = Array.isArray(door.connectsTo) && door.connectsTo.length === 2 && door.connectsTo.every((id) => typeof id === 'string');
      if (!isExterior && !isRoomPair) {
        err(`${p}.connectsTo must be "exterior" or a [roomIdA, roomIdB] pair`);
      } else if (isRoomPair) {
        door.connectsTo.forEach((roomId) => {
          if (!roomIds.has(roomId)) err(`${p}.connectsTo references unknown room "${roomId}"`);
        });
      }
    });

    (floor.artworkSlots ?? []).forEach((slot, i) => {
      const p = `${floorPath}.artworkSlots[${i}]`;
      if (typeof slot.id !== 'string' || !slot.id) err(`${p}.id must be a non-empty string`);
      if (typeof slot.wallId !== 'string' || !wallIds.has(slot.wallId)) {
        err(`${p}.wallId "${slot.wallId}" does not match any wall on this floor`);
      }
      if (!isFiniteNumber(slot.position) || slot.position < 0 || slot.position > 1) {
        err(`${p}.position must be a number between 0 and 1`);
      }
      if (!isPoint2d(slot.normal)) {
        err(`${p}.normal must be an [nx, nz] unit vector`);
      } else {
        const len = Math.hypot(slot.normal[0], slot.normal[1]);
        if (Math.abs(len - 1) > 0.05) err(`${p}.normal must be a unit vector (length ~1), got length ${len.toFixed(3)}`);
      }
      if (!isFiniteNumber(slot.maxWidth) || slot.maxWidth <= 0) err(`${p}.maxWidth must be a positive number`);
      if (!isFiniteNumber(slot.maxHeight) || slot.maxHeight <= 0) err(`${p}.maxHeight must be a positive number`);
      if (typeof slot.artworkId !== 'string' || !slot.artworkId) err(`${p}.artworkId must be a non-empty string`);
    });
  });

  if (typeof layout.entrance !== 'object' || layout.entrance === null) {
    err('"entrance" must be an object');
  } else {
    if (!floorIds.has(layout.entrance.floorId)) {
      err(`entrance.floorId "${layout.entrance.floorId}" does not match any floor`);
    }
    if (typeof layout.entrance.doorId !== 'string' || !layout.entrance.doorId) {
      err('entrance.doorId must be a non-empty string');
    }
    if (!isPoint2d(layout.entrance.spawnPoint)) {
      err('entrance.spawnPoint must be an [x, z] number pair');
    }
  }

  if (issues.length > 0) {
    throw new LayoutValidationError(layout?.id, issues);
  }
}
