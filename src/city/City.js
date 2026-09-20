import * as THREE from 'three';
import { makeBoxCollider } from '../collision/Collision.js';

const BUILDING_COLORS = [0xe07a5f, 0xf2cc8f, 0x81b29a, 0xd8a48f, 0xa8dadc, 0xf4a261];
const BLOCK_SIZE = 18;
const ROAD_WIDTH = 6;
const GRID = 5; // 5x5 block grid

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Builds a stylized low-poly city: ground, a road grid, flat-colored box
 * buildings on each block, simple trees, and one museum building with a
 * name sign marking the entrance. Returns collider boxes for collision.
 */
export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.occluderMeshes = []; // solid meshes the camera should never clip through
    this.museumEntrance = null; // {x, z, radius} world-space trigger
    this._build();
  }

  _build() {
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildMuseum();
    this._buildLighting();
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(GRID * BLOCK_SIZE + 40, GRID * BLOCK_SIZE + 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9fc48a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildRoads() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52 });
    const totalSize = GRID * BLOCK_SIZE;
    const half = totalSize / 2;

    for (let i = 0; i <= GRID; i++) {
      const offset = -half + i * BLOCK_SIZE;

      const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, totalSize + ROAD_WIDTH), roadMat);
      roadZ.rotation.x = -Math.PI / 2;
      roadZ.position.set(offset, 0.01, 0);
      roadZ.receiveShadow = true;
      this.scene.add(roadZ);

      const roadX = new THREE.Mesh(new THREE.PlaneGeometry(totalSize + ROAD_WIDTH, ROAD_WIDTH), roadMat);
      roadX.rotation.x = -Math.PI / 2;
      roadX.position.set(0, 0.01, offset);
      roadX.receiveShadow = true;
      this.scene.add(roadX);
    }
  }

  _buildBlocks() {
    const rand = seededRandom(1337);
    const totalSize = GRID * BLOCK_SIZE;
    const half = totalSize / 2;
    const usable = BLOCK_SIZE - ROAD_WIDTH;

    for (let bx = 0; bx < GRID; bx++) {
      for (let bz = 0; bz < GRID; bz++) {
        const centerX = -half + BLOCK_SIZE * bx + BLOCK_SIZE / 2;
        const centerZ = -half + BLOCK_SIZE * bz + BLOCK_SIZE / 2;

        // Skip the center block: reserved for the museum + plaza.
        if (bx === Math.floor(GRID / 2) && bz === Math.floor(GRID / 2)) continue;

        const buildingCount = 1 + Math.floor(rand() * 2);
        for (let n = 0; n < buildingCount; n++) {
          const width = 4 + rand() * 4;
          const depth = 4 + rand() * 4;
          const height = 3 + rand() * 14;
          const jitterX = (rand() - 0.5) * (usable - width);
          const jitterZ = (rand() - 0.5) * (usable - depth);

          this._addBuilding(
            centerX + jitterX,
            centerZ + jitterZ,
            width,
            depth,
            height,
            BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)],
          );
        }

        if (rand() > 0.5) {
          this._addTree(
            centerX + (rand() - 0.5) * usable,
            centerZ + (rand() - 0.5) * usable,
          );
        }
      }
    }
  }

  _addBuilding(x, z, width, depth, height, color) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Flat roof cap for a bit of visual interest.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.02, 0.3, depth * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x2f2f36 }),
    );
    roof.position.set(x, height + 0.15, z);
    roof.castShadow = true;
    this.scene.add(roof);

    this.colliders.push(makeBoxCollider(x, z, width, depth));
    this.occluderMeshes.push(mesh);
  }

  _addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    );
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    this.scene.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x4c8c4a }),
    );
    leaves.position.set(x, 2.6, z);
    leaves.castShadow = true;
    this.scene.add(leaves);

    this.colliders.push(makeBoxCollider(x, z, 0.6, 0.6));
  }

  _buildMuseum() {
    const width = 14;
    const depth = 10;
    const height = 7;
    const x = 0;
    const z = 0;

    const mat = new THREE.MeshStandardMaterial({ color: 0xf1eee4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    body.position.set(x, height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);
    this.occluderMeshes.push(body);

    // Columns flanking the entrance for a museum-y facade.
    const colGeo = new THREE.CylinderGeometry(0.35, 0.35, height * 0.9, 12);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const cx of [-3, -1, 1, 3]) {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x + cx, (height * 0.9) / 2, z + depth / 2 + 0.4);
      col.castShadow = true;
      this.scene.add(col);
    }

    // Entrance door gap (visual only - the whole footprint collides except
    // for a walk-in trigger zone in front).
    const doorWidth = 3;
    const entranceZ = z + depth / 2 + 1.6;
    this.museumEntrance = { x, z: entranceZ, halfWidth: doorWidth / 2, triggerDepth: 2.2 };

    // Name sign above the entrance.
    const sign = this._makeSignMesh('ATENEUM');
    sign.position.set(x, height + 1.2, z + depth / 2 + 0.1);
    this.scene.add(sign);

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
