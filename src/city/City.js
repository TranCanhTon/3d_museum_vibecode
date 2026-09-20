import * as THREE from 'three';
import { makeBoxCollider } from '../collision/Collision.js';

const BUILDING_COLORS = [0xe07a5f, 0xf2cc8f, 0x81b29a, 0xd8a48f, 0xa8dadc];

// Buildings are kept deliberately short: the bird's-eye camera sits at
// roughly 5-19m above the ground (see CameraController's pitch/distance
// range), so anything shorter than that rarely enters the camera-to-player
// line of sight. The camera also raycasts against every building as a
// backup so it pulls in instead of clipping through on the rare case a
// building still ends up between it and the character (e.g. standing right
// behind one at a close, low zoom).
const BUILDING_HEIGHT = 4;
const MUSEUM_HEIGHT = 6;

// Building centers double as the vertical "driveway" road positions (the
// road runs underneath, hidden by the building itself - see _buildRoads).
// Only the z=0 mid-street actually crosses the columns in the open gap
// between the two rows, so buildings never sit on top of a visible
// intersection.
const COL_X = [-12, 0, 12];
const ROW_Z = [-9, 9];
const BUILDING_WIDTH = 8;
const BUILDING_DEPTH = 6;
const MUSEUM_WIDTH = 11;
const MUSEUM_DEPTH = 8;
const MUSEUM_COL = 1; // center column
const MUSEUM_ROW = 1; // front row (closer to the player's spawn point)

/**
 * Builds a stylized low-poly city: ground, roads, six flat-colored
 * buildings arranged in a 2x3 grid (one of which is the Ateneum museum
 * with a name sign and entrance), and a few trees. Returns collider boxes
 * for movement collision and mesh references for camera occlusion checks.
 */
export class City {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); // everything but lighting, so the whole city can be hidden at once
    scene.add(this.group);
    this.colliders = [];
    this.occluderMeshes = []; // solid meshes the camera should never clip through
    this.museumEntrance = null; // {x, z, halfWidth, triggerDepth, layoutId} world-space trigger
    this._build();
  }

  _build() {
    this._buildGround();
    this._buildRoads();
    this._buildBuildingGrid();
    this._buildTrees();
    this._buildLighting();
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(100, 110);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9fc48a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildRoads() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52 });
    const roadWidth = 5;

    // One access "driveway" road per building column, running the depth of
    // the city. Each building sits on top of its own column, so the road
    // itself is only visible in the open stretches in front of/behind the
    // buildings, not as a crossing underneath them.
    for (const x of COL_X) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, 104), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.01, 0);
      road.receiveShadow = true;
      this.group.add(road);
    }

    // A single mid street crossing all three columns, positioned in the
    // open gap between the two building rows so it forms real
    // intersections in empty space rather than under a building.
    const midRoad = new THREE.Mesh(new THREE.PlaneGeometry(94, roadWidth), roadMat);
    midRoad.rotation.x = -Math.PI / 2;
    midRoad.position.set(0, 0.01, 0);
    midRoad.receiveShadow = true;
    this.group.add(midRoad);
  }

  _buildBuildingGrid() {
    let colorIndex = 0;
    ROW_Z.forEach((z, rowIndex) => {
      COL_X.forEach((x, colIndex) => {
        if (rowIndex === MUSEUM_ROW && colIndex === MUSEUM_COL) {
          this._buildMuseum(x, z);
        } else {
          this._addBuilding(x, z, BUILDING_WIDTH, BUILDING_DEPTH, BUILDING_HEIGHT, BUILDING_COLORS[colorIndex % BUILDING_COLORS.length]);
          colorIndex += 1;
        }
      });
    });
  }

  /**
   * A grass "lot" the building sits on, slightly larger than its footprint
   * and raised just above the road surface, so the building reads as
   * standing on its own plot rather than rising directly out of the
   * asphalt with the road running flush against its walls.
   */
  _addGrassLot(x, z, width, depth) {
    const margin = 2;
    const lot = new THREE.Mesh(
      new THREE.PlaneGeometry(width + margin, depth + margin),
      new THREE.MeshStandardMaterial({ color: 0x8fb877 }),
    );
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(x, 0.02, z);
    lot.receiveShadow = true;
    this.group.add(lot);
  }

  _addBuilding(x, z, width, depth, height, color) {
    this._addGrassLot(x, z, width, depth);

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Flat roof cap for a bit of visual interest.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.02, 0.3, depth * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x2f2f36 }),
    );
    roof.position.set(x, height + 0.15, z);
    roof.castShadow = true;
    this.group.add(roof);

    this.colliders.push(makeBoxCollider(x, z, width, depth));
    this.occluderMeshes.push(mesh);
  }

  _buildTrees() {
    // A handful of trees tucked into the gaps between buildings, away from
    // the main camera-to-player sightlines down each column.
    const spots = [
      [-6, 4.5],
      [6, 4.5],
      [-6, -4.5],
      [6, -4.5],
    ];
    for (const [x, z] of spots) this._addTree(x, z);
  }

  _addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    );
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    this.group.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x4c8c4a }),
    );
    leaves.position.set(x, 2.6, z);
    leaves.castShadow = true;
    this.group.add(leaves);

    this.colliders.push(makeBoxCollider(x, z, 0.6, 0.6));
  }

  _buildMuseum(x, z) {
    const width = MUSEUM_WIDTH;
    const depth = MUSEUM_DEPTH;
    const height = MUSEUM_HEIGHT;

    this._addGrassLot(x, z, width, depth);

    const mat = new THREE.MeshStandardMaterial({ color: 0xf1eee4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    body.position.set(x, height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    this.occluderMeshes.push(body);

    // Columns flanking the entrance for a museum-y facade. The entrance
    // faces +Z (south, towards the player's spawn point).
    const colGeo = new THREE.CylinderGeometry(0.35, 0.35, height * 0.9, 12);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const cx of [-3, -1, 1, 3]) {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x + cx, (height * 0.9) / 2, z + depth / 2 + 0.4);
      col.castShadow = true;
      this.group.add(col);
    }

    // Entrance door gap (visual only - the whole footprint collides except
    // for a walk-in trigger zone in front).
    const doorWidth = 3;
    const entranceZ = z + depth / 2 + 1.6;
    this.museumEntrance = { x, z: entranceZ, halfWidth: doorWidth / 2, triggerDepth: 2.2, layoutId: 'ateneum' };

    // Name sign above the entrance.
    const sign = this._makeSignMesh('ATENEUM');
    sign.position.set(x, height + 1.2, z + depth / 2 + 0.1);
    this.group.add(sign);

    // Building collides as a box, but we leave the door gap "soft" by
    // splitting the front wall into two side segments so the doorway itself
    // has no collider.
    this.colliders.push(makeBoxCollider(x - width / 4 - doorWidth / 4, z, width / 2 - doorWidth / 2, depth));
    this.colliders.push(makeBoxCollider(x + width / 4 + doorWidth / 4, z, width / 2 - doorWidth / 2, depth));
  }

  _makeSignMesh(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f9fafb';
    ctx.font = 'bold 56px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    const geo = new THREE.PlaneGeometry(6, 1.1);
    return new THREE.Mesh(geo, mat);
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0xbde0ff, 0x445533, 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
    sun.position.set(30, 45, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
  }

  /** Returns true if the position is within the museum's door trigger zone. */
  isAtMuseumEntrance(x, z) {
    const e = this.museumEntrance;
    if (!e) return false;
    return Math.abs(x - e.x) < e.halfWidth && Math.abs(z - e.z) < e.triggerDepth;
  }
}
