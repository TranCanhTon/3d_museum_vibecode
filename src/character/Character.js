import * as THREE from 'three';

const WALK_SPEED = 4.2; // meters/second
const TURN_LERP = 10;
const RADIUS = 0.35; // collision radius in meters

/**
 * Simple low-poly placeholder character: a capsule torso/head with box
 * limbs that swing on a sine wave while moving. Swap `buildMesh()` for a
 * real skinned model later without touching the controller logic.
 */
export class Character {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 25);
    this.radius = RADIUS;
    this.walkTime = 0;
    this.isMoving = false;
    this._facingAngle = 0;

    this._buildMesh();
    scene.add(this.group);
  }

  _buildMesh() {
    const skin = 0xffcc99;
    const shirt = 0x3b82f6;
    const pants = 0x2b2b3d;

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.5, 4, 8),
      new THREE.MeshStandardMaterial({ color: shirt }),
    );
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: skin }),
    );
    head.position.y = 1.62;
    head.castShadow = true;
    this.group.add(head);

    const legGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
    const legMat = new THREE.MeshStandardMaterial({ color: pants });

    this.leftLeg = new THREE.Mesh(legGeo, legMat);
    this.leftLeg.position.set(-0.14, 0.5, 0);
    this.leftLeg.geometry.translate(0, -0.275, 0);
    this.leftLeg.position.y = 0.775;
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo.clone(), legMat);
    this.rightLeg.position.set(0.14, 0.775, 0);
    this.rightLeg.geometry.translate(0, -0.275, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);

    const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
    const armMat = new THREE.MeshStandardMaterial({ color: shirt });

    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.geometry.translate(0, -0.25, 0);
    this.leftArm.position.set(-0.4, 1.3, 0);
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo.clone(), armMat);
    this.rightArm.geometry.translate(0, -0.25, 0);
    this.rightArm.position.set(0.4, 1.3, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);
  }

  get position() {
    return this.group.position;
  }

  /**
   * Moves the character by a world-space direction (already normalized *
   * speed factor) for this frame, updates facing, and animates limbs.
   * Collision resolution happens outside via Collision.resolveCircleVsBoxes.
   */
  move(moveDirXZ, dt) {
    const len = Math.hypot(moveDirXZ.x, moveDirXZ.z);
    this.isMoving = len > 1e-4;

    if (this.isMoving) {
      const nx = moveDirXZ.x / len;
      const nz = moveDirXZ.z / len;
      this.group.position.x += nx * WALK_SPEED * dt;
      this.group.position.z += nz * WALK_SPEED * dt;

      const targetAngle = Math.atan2(nx, nz);
      let angleDiff = targetAngle - this._facingAngle;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      this._facingAngle += angleDiff * Math.min(1, TURN_LERP * dt);
      this.group.rotation.y = this._facingAngle;

      this.walkTime += dt * 8;
    } else {
      this.walkTime = THREE.MathUtils.lerp(this.walkTime, Math.round(this.walkTime / Math.PI) * Math.PI, 0.2);
    }

    const swing = Math.sin(this.walkTime) * 0.5;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing;
    this.rightArm.rotation.x = swing;
  }

  setPositionXZ(x, z) {
    this.group.position.x = x;
    this.group.position.z = z;
  }

  /** Snaps facing to a yaw in degrees (0 = +Z), e.g. when teleporting through a door. */
  setFacingDeg(deg) {
    this._facingAngle = THREE.MathUtils.degToRad(deg);
    this.group.rotation.y = this._facingAngle;
  }
}
