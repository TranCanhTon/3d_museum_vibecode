import * as THREE from 'three';
import { validateLayout } from './validateLayout.js';
import { buildMuseum } from './MuseumBuilder.js';

// Each museum's interior is built once and placed at its own far-away
// world-space offset so interiors never spatially overlap the city or each
// other, without needing a second scene/renderer. Spacing is generous
// (1 km) purely to make this obvious/collision-proof; float precision is
// not a concern at this scale.
const INSTANCE_SPACING = 1000;

/**
 * Fetches, validates, and lazily builds museum interiors from JSON layout
 * files in /public/museums/. Adding a new museum only requires a new JSON
 * file plus one entry in the `museums` registry passed to the constructor
 * (city building -> layout id) - no other code changes.
 */
export class MuseumLoader {
  constructor(scene) {
    this.scene = scene;
    this._instances = new Map(); // layoutId -> MuseumInstance
    this._loadingPromises = new Map();
    this._nextSlot = 0;
  }

  /** Returns a cached MuseumInstance, building it on first request (lazy load). */
  async load(layoutId) {
    if (this._instances.has(layoutId)) return this._instances.get(layoutId);
    if (this._loadingPromises.has(layoutId)) return this._loadingPromises.get(layoutId);

    const promise = this._loadAndBuild(layoutId);
    this._loadingPromises.set(layoutId, promise);
    const instance = await promise;
    this._loadingPromises.delete(layoutId);
    this._instances.set(layoutId, instance);
    return instance;
  }

  async _loadAndBuild(layoutId) {
    const url = `${import.meta.env.BASE_URL}museums/${layoutId}.json`;
    let response;
    try {
      response = await fetch(url);
    } catch (cause) {
      throw new Error(`Could not fetch museum layout "${layoutId}" from ${url}: ${cause.message}`);
    }
    if (!response.ok) {
      throw new Error(`Museum layout "${layoutId}" fetch failed: ${response.status} ${response.statusText} (${url})`);
    }

    const layout = await response.json();
    validateLayout(layout); // throws LayoutValidationError with a clear message on a bad file

    const slot = this._nextSlot;
    this._nextSlot += 1;
    const worldOffset = new THREE.Vector3(slot * INSTANCE_SPACING, 0, INSTANCE_SPACING);

    const instance = buildMuseum(layout, worldOffset);
    this.scene.add(instance.group);
    return instance;
  }
}
