import * as THREE from 'three';

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 22;
const DEFAULT_DISTANCE = 12;
const PITCH_DEG = 58; // angle down from horizontal, within the requested 55-65 range
const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.01;
const FOLLOW_LERP = 8; // higher = snappier follow

const raycaster = new THREE.Raycaster();
const _targetPos = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Bird's-eye third-person camera: orbits a target at a fixed steep pitch,
 * with mouse-wheel zoom and right-drag yaw. Optionally raycasts against an
 * "occluders" list (interior ceilings/walls) to pull the camera in or fade
 * geometry that would otherwise block the view.
 */
export class CameraController {
  constructor(camera, input, target) {
    this.camera = camera;
    this.input = input;
    this.target = target; // THREE.Object3D to follow
    this.yaw = 0; // camera starts on the +Z side, behind a character walking toward -Z
    this.distance = DEFAULT_DISTANCE;
    this.pitch = THREE.MathUtils.degToRad(PITCH_DEG);
    this.occluders = [];
  }

  setOccluders(list) {
    this.occluders = list;
  }

  update(dt) {
    const { wheelDelta, dragDelta, isDragging } = this.input;

    this.distance = THREE.MathUtils.clamp(
      this.distance + wheelDelta * ZOOM_SPEED,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );

    if (isDragging) {
      this.yaw -= dragDelta.x * ROTATE_SPEED;
    }

    _targetPos.copy(this.target.position);
    _targetPos.y += 1.4; // look roughly at torso/head height

    const horizontalDist = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;

    _desiredCamPos.set(
      _targetPos.x + Math.sin(this.yaw) * horizontalDist,
      _targetPos.y + height,
      _targetPos.z + Math.cos(this.yaw) * horizontalDist,
    );

    let allowedDistance = this.distance;
    if (this.occluders.length > 0) {
      _dir.subVectors(_desiredCamPos, _targetPos);
      const fullDist = _dir.length();
      _dir.normalize();
      raycaster.set(_targetPos, _dir);
      raycaster.far = fullDist;
      const hits = raycaster.intersectObjects(this.occluders, false);
      if (hits.length > 0) {
        // Floor this near zero, not at some fraction of MIN_DISTANCE: if the
        // obstruction is closer than that fraction (e.g. the character
        // standing right against an interior wall), clamping to a larger
        // "minimum" would push the camera past the hit and out the other
        // side of the wall instead of pulling it in.
        allowedDistance = Math.max(hits[0].distance - 0.3, 0.4);
        const ratio = allowedDistance / fullDist;
        _desiredCamPos.set(
          _targetPos.x + _dir.x * fullDist * ratio,
          _targetPos.y + _dir.y * fullDist * ratio,
          _targetPos.z + _dir.z * fullDist * ratio,
        );
      }
    }

    const lerpFactor = 1 - Math.exp(-FOLLOW_LERP * dt);
    this.camera.position.lerp(_desiredCamPos, lerpFactor);
    this.camera.lookAt(_targetPos);
  }

  /** Forward direction of the camera projected onto the ground plane, used for WASD-relative movement. */
  getForward(out) {
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    return out;
  }

  getRight(out) {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }
}
